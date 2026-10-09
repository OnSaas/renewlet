import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudBackupSnapshotManifest } from "@renewlet/shared/schemas/cloud-backup";
import { createCronFixture, scheduledAt, settings } from "./cron-test-support";
import { CronBudget } from "./cron-budget";
import { readCloudBackupCursor } from "./cloud-backup-cron";
import { runScheduledCloudBackupForUser } from "./cloud-backup";
import { CloudBackupRemoteError, S3CloudBackupClient, WebDAVCloudBackupClient } from "./cloud-backup-remote";
import { createCloudBackupBucket } from "./cloud-backup-staging-test-support";

vi.mock("./smtp", () => ({ notificationSmtpConfig: vi.fn(), sendSmtpEmail: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(scheduledAt);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const base = createCronFixture(1);
  base.env.ASSETS_BUCKET = createCloudBackupBucket().bucket;
  const userId = base.ids[0] ?? "";
  for (const provider of ["webdav", "s3"] as const) {
    const config = provider === "webdav" ? { webdav: { url: "https://dav.example.test/", username: "fixture", path: "backups" } }
      : { s3: { endpoint: "https://s3.example.test", bucket: "backups", region: "auto", prefix: "", accessKeyId: "fixture", addressingStyle: "pathStyle" } };
    base.db.prepare(`INSERT INTO cloud_backup_targets (user_id, provider, config_json, credential_json, schedule_enabled, retention, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 2, ?, ?)`).run(userId, provider, JSON.stringify(config), JSON.stringify({ webdavPassword: "fixture", s3SecretAccessKey: "fixture" }), scheduledAt.toISOString(), scheduledAt.toISOString());
  }
  let ticks = 0;
  const budgets: CronBudget[] = [];
  const run = async (provider: "webdav" | "s3" = "webdav") => {
    const now = new Date(scheduledAt.getTime() + ticks++ * 60_000);
    vi.setSystemTime(now);
    const budget = new CronBudget();
    budgets.push(budget);
    return runScheduledCloudBackupForUser({ ...base.env, DB: budget.database(base.env.DB, 3) }, userId, provider, now, now, settings, budget, budget.database(base.env.DB));
  };
  const row = (provider = "webdav") => base.db.prepare("SELECT cron_cursor_json, last_backup_at, last_status, last_error, locked_until FROM cloud_backup_targets WHERE user_id = ? AND provider = ?").get(userId, provider);
  return { ...base, userId, run, row, budgets };
}

function manifest(id: string, createdAt: string): CloudBackupSnapshotManifest {
  return { kind: "renewlet-cloud-backup-snapshot", schemaVersion: 1, id, filename: `${id}.zip`, createdAt, sizeBytes: 100, sha256: "a".repeat(64), exportKind: "renewlet-export", exportSchemaVersion: 1 };
}

function remote() {
  const objects = new Map<string, CloudBackupSnapshotManifest>(Array.from({ length: 9 }, (_, index) => {
    const item = manifest(`old-${index}`, `2026-09-0${index + 1}T01:00:00.000Z`);
    return [item.id, item];
  }));
  const directory = vi.spyOn(WebDAVCloudBackupClient.prototype, "prepareDirectory").mockImplementation(async (after) => after === null ? "backups" : null);
  const upload = vi.spyOn(WebDAVCloudBackupClient.prototype, "upload").mockImplementation(async (_filename, _bytes, value) => { objects.set(value.id, value); });
  const list = vi.spyOn(WebDAVCloudBackupClient.prototype, "listPage").mockImplementation(async (after, limit) => {
    const items = [...objects.values()].filter((item) => after === null || item.id > after).sort((left, right) => left.id.localeCompare(right.id));
    const page = items.slice(0, limit);
    return { manifests: page, cursor: items.length > limit ? page.at(-1)?.id ?? null : null };
  });
  const remove = vi.spyOn(WebDAVCloudBackupClient.prototype, "delete").mockImplementation(async (id) => { objects.delete(id); });
  return { objects, directory, upload, list, remove };
}

describe("durable cloud backup stages", () => {
  it("resumes directory, upload and both retention passes while preserving intervening snapshots", async () => {
    const state = fixture();
    const client = remote();
    try {
      let injected = false;
      for (let tick = 0; tick < 20 && state.row()?.["last_status"] !== "success"; tick++) {
        await state.run();
        const cursor = readCloudBackupCursor(String(state.row()?.["cron_cursor_json"]));
        if (cursor?.stage === "prune" && !injected) {
          expect(client.remove).not.toHaveBeenCalled();
          client.objects.set("newer", manifest("newer", "2026-09-10T08:00:00.000Z"));
          injected = true;
        }
      }
      expect(state.row()).toMatchObject({ cron_cursor_json: "{}", last_status: "success", locked_until: null });
      expect(client.directory).toHaveBeenCalledTimes(2);
      expect(client.upload).toHaveBeenCalledTimes(1);
      expect(client.list.mock.calls.every(([, limit]) => limit === 4)).toBe(true);
      expect(client.objects.has("newer")).toBe(true);
      expect(client.objects.has("old-8")).toBe(true);
      expect(client.objects.has(client.upload.mock.calls[0]?.[2].id ?? "")).toBe(true);
      expect(client.remove).toHaveBeenCalled();
      expect(Math.max(...state.budgets.map((budget) => budget.used.sql))).toBeLessThanOrEqual(50);
      expect(Math.max(...state.budgets.map((budget) => budget.used.externalReserved))).toBeLessThanOrEqual(50);
    } finally { state.db.close(); }
  });

  it("reuses the persisted ID after an interrupted upload and validates every manifest before deleting", async () => {
    const state = fixture();
    const client = remote();
    try {
      await state.run(); await state.run(); await state.run(); await state.run();
      const before = state.row()?.["cron_cursor_json"];
      client.upload.mockImplementationOnce(async (_filename, _bytes, value) => { client.objects.set(value.id, value); throw new Error("lost response Bearer secret"); });
      await state.run();
      expect(state.row()).toMatchObject({ cron_cursor_json: before, last_status: "failed", last_error: "local_sdk_error" });
      await state.run();
      expect(client.upload.mock.calls[0]?.[0]).toBe(client.upload.mock.calls[1]?.[0]);
      expect(client.upload.mock.calls[0]?.[2].createdAt).toBe(client.upload.mock.calls[1]?.[2].createdAt);
      await state.run();
      client.list.mockRejectedValueOnce(new CloudBackupRemoteError("CLOUD_BACKUP_MANIFEST_INVALID"));
      const cursor = state.row()?.["cron_cursor_json"];
      await state.run();
      expect(state.row()).toMatchObject({ cron_cursor_json: cursor, last_status: "failed", last_error: "CLOUD_BACKUP_MANIFEST_INVALID" });
      expect(client.remove).not.toHaveBeenCalled();
      for (let tick = 0; tick < 10 && state.row()?.["last_status"] !== "success"; tick++) await state.run();
      expect(state.row()?.["last_status"]).toBe("success");
      expect(client.upload).toHaveBeenCalledTimes(2);
    } finally { state.db.close(); }
  });

  it("allows S3 to finish while WebDAV fails and fences a configuration change during a remote operation", async () => {
    const state = fixture();
    const client = remote();
    vi.spyOn(S3CloudBackupClient.prototype, "prepareDirectory").mockResolvedValue(null);
    const s3Upload = vi.spyOn(S3CloudBackupClient.prototype, "upload").mockResolvedValue(undefined);
    vi.spyOn(S3CloudBackupClient.prototype, "listPage").mockResolvedValue({ manifests: [], cursor: null });
    try {
      await state.run();
      client.directory.mockRejectedValue(new CloudBackupRemoteError("CLOUD_BACKUP_WEBDAV_MKCOL_FAILED"));
      await state.run();
      for (let tick = 0; tick < 6; tick++) await state.run("s3");
      expect(s3Upload).toHaveBeenCalledTimes(1);
      expect(state.row("s3")?.["last_status"]).toBe("success");
      expect(state.row()?.["last_status"]).toBe("failed");
      client.directory.mockImplementationOnce(async () => {
        state.db.prepare("UPDATE cloud_backup_targets SET cron_cursor_json = '{}', locked_until = NULL, last_status = 'idle', last_error = NULL WHERE provider = 'webdav'").run();
        return null;
      });
      expect(await state.run()).toBe(false);
      expect(state.row()).toMatchObject({ cron_cursor_json: "{}", locked_until: null, last_status: "idle", last_error: null });
    } finally { state.db.close(); }
  });
});
