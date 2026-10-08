import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { listNotificationDueUsers } from "./subscription-scheduler-state";
import { TransactionalD1Database } from "./subscription-d1-test-support";
import type { Env } from "./types";

describe("notification account cursor", () => {
  it.each([100, 150, 1000])("visits %i due accounts once under the D1 parameter limit", async (size) => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const name of readdirSync(new URL("../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
        database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
      }
      const insertUser = database.prepare(`INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
        VALUES (?, ?, 'Cursor', 'user', '', '', '')`);
      const insertState = database.prepare(`INSERT INTO subscription_scheduler_state (user_id, next_daily_notification_due_at_utc, created_at, updated_at)
        VALUES (?, ?, '', '')`);
      const expected = Array.from({ length: size }, (_, index) => `user-${String(index).padStart(4, "0")}`);
      database.exec("BEGIN");
      for (const id of [...expected, "z-banned", "z-not-due", "z-repeat"]) {
        insertUser.run(id, `${id}@example.test`);
        insertState.run(id, id.startsWith("z-") ? "2026-01-10T08:00:00Z" : "2026-01-09T08:00:00Z");
      }
      database.exec(`UPDATE users SET banned = 1 WHERE id = 'z-banned';
        UPDATE subscription_scheduler_state SET next_daily_notification_due_at_utc = NULL WHERE user_id = 'z-banned';
        UPDATE subscription_scheduler_state SET repeat_reminder_count = 1, next_repeat_notification_due_at_utc = '2026-01-09T08:00:00Z' WHERE user_id = 'z-repeat';
        COMMIT`);
      expected.push("z-repeat");
      const d1 = new TransactionalD1Database(database);
      const prepare = vi.spyOn(d1, "prepare");
      const env = { DB: d1 as unknown as D1Database, ASSETS: {} as Fetcher, ASSETS_BUCKET: {} as R2Bucket } satisfies Env;
      let cursor = "";
      const actual: string[] = [];
      for (;;) {
        const page = await listNotificationDueUsers(env, new Date("2026-01-09T08:00:00Z"), 50, cursor);
        const last = page.at(-1);
        if (!last) break;
        actual.push(...page.map((row) => row.user_id));
        expect(actual.length).toBeLessThanOrEqual(expected.length);
        cursor = last.user_id;
        // 混合成功推进与失败保留；游标不得依赖这些会变化的到期时间。
        for (const row of page.filter((_, index) => index % 2 === 0)) {
          database.prepare("UPDATE subscription_scheduler_state SET next_daily_notification_due_at_utc = '2026-01-10T08:00:00Z', next_repeat_notification_due_at_utc = NULL, repeat_reminder_count = 0 WHERE user_id = ?").run(row.user_id);
        }
      }
      expect(actual).toEqual(expected);
      expect(prepare).toHaveBeenCalledTimes(Math.ceil(expected.length / 50) + 1);
      const sql = prepare.mock.calls[0]?.[0];
      if (!sql) throw new Error("Missing page query");
      expect(sql.match(/\?/g)).toHaveLength(4);
      const plan = database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all("2026-01-09T08:00:00Z", "2026-01-09T08:00:00Z", "user-0050", 50);
      expect(plan.some((row) => String(row["detail"]).includes("SEARCH users") && String(row["detail"]).includes("id>?")), JSON.stringify(plan)).toBe(true);
      expect(plan.some((row) => /SCAN|TEMP B-TREE/.test(String(row["detail"])))).toBe(false);
    } finally {
      database.close();
    }
  });
});
