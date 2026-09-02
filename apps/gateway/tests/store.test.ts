import { describe, expect, it } from "vitest";
import { PostgresStore } from "../src/store.js";

describe("PostgresStore", () => {
  it("sets id on bt_command_log INSERT", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const store = new PostgresStore({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return {
          rows: [
            {
              id: params[0],
              verb: params[1],
              dryRun: params[2],
              payloadSummary: { verb: "jobs.list" },
              createdAt: new Date().toISOString(),
            },
          ],
        };
      },
    });
    const row = await store.logCommand({
      verb: "jobs.list",
      dryRun: true,
      payloadSummary: { search: "sandbox" },
    });
    expect(calls[0]!.sql).toMatch(/INSERT INTO bt_command_log \(id,/);
    expect(typeof calls[0]!.params[0]).toBe("string");
    expect(String(calls[0]!.params[0]).length).toBeGreaterThan(0);
    expect(row.id).toBe(calls[0]!.params[0]);
  });

  it("sets id on bt_sync_state INSERT", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const store = new PostgresStore({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    });
    await store.setSyncState({
      entityType: "job",
      externalId: "99999",
      lastPulledHash: "abc",
    });
    expect(calls[0]!.sql).toMatch(/INSERT INTO bt_sync_state \(id,/);
    expect(typeof calls[0]!.params[0]).toBe("string");
    expect(String(calls[0]!.params[0]).length).toBeGreaterThan(0);
  });
});
