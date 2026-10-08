import { z } from "zod";
import { CLOUD_BACKUP_MAX_RETENTION } from "@renewlet/shared/schemas/cloud-backup";
import { buildCloudBackupSnapshotPayload } from "./cloud-backup-export";
import { snapshotId, type CloudBackupPagedRemoteClient } from "./cloud-backup-remote";
import type { CronBudget } from "./cron-budget";
import type { Env } from "./types";

const snapshotKey = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/), createdAt: z.iso.datetime() }).strict();
const common = { id: snapshotKey.shape.id, createdAt: snapshotKey.shape.createdAt };
const retained = z.array(snapshotKey).max(CLOUD_BACKUP_MAX_RETENTION);
const backupCursorSchema = z.discriminatedUnion("stage", [
  z.object({ ...common, stage: z.literal("directory"), after: z.string().nullable() }).strict(),
  z.object({ ...common, stage: z.literal("upload") }).strict(),
  z.object({ ...common, stage: z.literal("scan"), after: z.string().nullable(), retained }).strict(),
  z.object({ ...common, stage: z.literal("prune"), after: z.string().nullable(), retained }).strict(),
]);
export type CloudBackupCursor = z.infer<typeof backupCursorSchema>;
export type CloudBackupStep = { kind: "continue"; cursor: CloudBackupCursor } | { kind: "complete"; createdAt: string };

// 一页最多四份manifest；WebDAV Auto/Digest认证最多三次请求，清理页包含1次目录+4次读取+8次删除。
const BACKUP_PAGE_SIZE = 4;
const WEBDAV_AUTH_REQUESTS = 3;

export function readCloudBackupCursor(raw: string): CloudBackupCursor | null {
  const value: unknown = JSON.parse(raw);
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return null;
  return backupCursorSchema.parse(value);
}

export async function runCloudBackupStep(input: {
  env: Env;
  userId: string;
  client: CloudBackupPagedRemoteClient;
  cursor: CloudBackupCursor | null;
  retention: number;
  now: Date;
  budget: CronBudget;
}): Promise<CloudBackupStep> {
  const { client, cursor, budget } = input;
  if (!cursor) {
    // 上传前持久化固定ID/导出时刻；响应丢失时重建并覆盖同一快照，不新建随机名称的重复备份。
    return { kind: "continue", cursor: { stage: "directory", id: snapshotId(input.now), createdAt: input.now.toISOString(), after: null } };
  }
  budget.requireSql(3);
  if (cursor.stage === "directory") {
    budget.consumeExternal(BACKUP_PAGE_SIZE * WEBDAV_AUTH_REQUESTS);
    const after = await client.prepareDirectory(cursor.after, BACKUP_PAGE_SIZE);
    return { kind: "continue", cursor: after === null
      ? { id: cursor.id, createdAt: cursor.createdAt, stage: "upload" }
      : { ...cursor, after } };
  }
  if (cursor.stage === "upload") {
    const payload = await buildCloudBackupSnapshotPayload(input.env, input.userId, { id: cursor.id, exportedAt: new Date(cursor.createdAt), budget });
    budget.requireSql(3);
    // 三次正常上传请求加两次失败清理；目录已由上一阶段逐段建立。
    budget.consumeExternal(5 * WEBDAV_AUTH_REQUESTS);
    await client.upload(payload.filename, payload.content, payload.manifest, true);
    return { kind: "continue", cursor: { id: cursor.id, createdAt: cursor.createdAt, stage: "scan", after: null, retained: [] } };
  }
  budget.consumeExternal((1 + BACKUP_PAGE_SIZE + (cursor.stage === "prune" ? 2 * BACKUP_PAGE_SIZE : 0)) * WEBDAV_AUTH_REQUESTS);
  const page = await client.listPage(cursor.after, BACKUP_PAGE_SIZE);
  const keys = page.manifests.map(({ id, createdAt }) => snapshotKey.parse({ id, createdAt }));
  if (cursor.stage === "scan") {
    const newest = [...cursor.retained, ...keys].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const keep = [...new Map(newest.map((item) => [item.id, item])).values()].slice(0, input.retention);
    // 先完整验证所有manifest再清理；坏的后续页不能让前面的旧备份提前被删。
    return { kind: "continue", cursor: { ...cursor, stage: page.cursor === null ? "prune" : "scan", after: page.cursor, retained: keep } };
  }
  const keepIds = new Set(cursor.retained.map((item) => item.id));
  for (const item of keys) {
    // 两遍扫描间的新快照不属于本次清理窗口；保留本次上传和所有更新对象。
    if (item.id !== cursor.id && !keepIds.has(item.id) && Date.parse(item.createdAt) <= Date.parse(cursor.createdAt)) await client.delete(item.id);
  }
  return page.cursor === null
    ? { kind: "complete", createdAt: cursor.createdAt }
    : { kind: "continue", cursor: { ...cursor, after: page.cursor } };
}
