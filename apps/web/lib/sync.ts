/**
 * Sync orchestration — calls bt-service to refresh BT data into Supabase.
 *
 * sync-on-load model: the page calls ensureFreshSync() before rendering;
 * if data is stale, this blocks until sync completes.
 */

import { z } from "zod";

const SYNC_FRESHNESS_MS = 10 * 60 * 1000; // 10 minutes

const SyncStatusSchema = z.object({
  last_synced: z.object({
    bt_jobs: z.string().nullable(),
    bt_vendors: z.string().nullable(),
    bt_cost_codes: z.string().nullable(),
    bt_bills: z.string().nullable(),
  }),
});

const SyncResultSchema = z.object({
  started_at: z.string(),
  finished_at: z.string(),
  duration_seconds: z.number(),
  counts: z.object({
    jobs: z.number(),
    vendors: z.number(),
    cost_codes: z.number(),
    bills: z.number(),
  }),
  errors: z.array(z.any()),
  ok: z.boolean(),
});

async function callBtService(method: "GET" | "POST", path: string) {
  const url = `${process.env.BT_SERVICE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "X-Internal-Token": process.env.BT_SERVICE_INTERNAL_TOKEN! },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`bt-service ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getSyncStatus() {
  const data = await callBtService("GET", "/sync/status");
  return SyncStatusSchema.parse(data);
}

export async function runFullSync() {
  const data = await callBtService("POST", "/sync/all");
  return SyncResultSchema.parse(data);
}

/**
 * Returns true if any of the bt_* tables haven't been synced within the
 * freshness window. Falsy = data is fresh enough; truthy = need to resync.
 */
export function isSyncStale(status: Awaited<ReturnType<typeof getSyncStatus>>) {
  const now = Date.now();
  const tables = Object.values(status.last_synced);
  for (const ts of tables) {
    if (!ts) return true; // never synced
    const age = now - new Date(ts).getTime();
    if (age > SYNC_FRESHNESS_MS) return true;
  }
  return false;
}

/**
 * Ensure data is fresh. Returns immediately if so; otherwise blocks
 * until the sync completes. Throws on sync failure.
 *
 * Concurrent calls are NOT deduped — if two pages call this simultaneously
 * during a stale window, two syncs run. bt-service's upsert logic is
 * idempotent so this isn't catastrophic but it's wasteful. Future work:
 * add a "sync in progress" lock.
 */
export async function ensureFreshSync(): Promise<{
  synced: boolean;
  status: Awaited<ReturnType<typeof getSyncStatus>>;
}> {
  const status = await getSyncStatus();
  if (!isSyncStale(status)) {
    return { synced: false, status };
  }
  await runFullSync();
  const newStatus = await getSyncStatus();
  return { synced: true, status: newStatus };
}
