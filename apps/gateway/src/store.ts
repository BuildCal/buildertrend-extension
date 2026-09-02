import { GatewayError } from "./errors.js";
import { stableHash } from "./hash.js";
import { summarizePayload } from "./redact.js";

export type MirrorEntity =
  | "job"
  | "lead"
  | "contact"
  | "invoice"
  | "variation"
  | "po"
  | "bill";

export interface CommandLogEntry {
  id: string;
  verb: string;
  dryRun: boolean;
  payloadSummary: Record<string, unknown>;
  btStatus?: number;
  errorCode?: string;
  createdAt: string;
}

export interface SyncState {
  entityType: MirrorEntity;
  externalId: string;
  lastPulledHash?: string;
  lastPulledAt?: string;
  lastPushedAt?: string;
  lastError?: string;
}

export interface MirrorRecord {
  entityType: MirrorEntity;
  externalId: string;
  builderId: number;
  jobId?: number;
  title?: string;
  status?: string;
  amount?: number;
  extra?: Record<string, unknown>;
  hash: string;
}

export interface GatewayStore {
  logCommand(entry: Omit<CommandLogEntry, "id" | "createdAt">): Promise<CommandLogEntry>;
  listCommands(limit?: number): Promise<CommandLogEntry[]>;
  getSyncState(entityType: MirrorEntity, externalId: string): Promise<SyncState | null>;
  setSyncState(state: SyncState): Promise<void>;
  upsertMirror(record: MirrorRecord): Promise<void>;
  getMirror(entityType: MirrorEntity, externalId: string): Promise<MirrorRecord | null>;
  listMirrors(entityType: MirrorEntity): Promise<MirrorRecord[]>;
}

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export class MemoryStore implements GatewayStore {
  readonly commands: CommandLogEntry[] = [];
  readonly sync = new Map<string, SyncState>();
  readonly mirrors = new Map<string, MirrorRecord>();

  async logCommand(entry: Omit<CommandLogEntry, "id" | "createdAt">): Promise<CommandLogEntry> {
    const row: CommandLogEntry = {
      ...entry,
      payloadSummary: summarizePayload(entry.payloadSummary),
      id: id("cmd"),
      createdAt: new Date().toISOString(),
    };
    this.commands.push(row);
    return row;
  }

  async listCommands(limit = 50): Promise<CommandLogEntry[]> {
    return this.commands.slice(-limit);
  }

  async getSyncState(entityType: MirrorEntity, externalId: string): Promise<SyncState | null> {
    return this.sync.get(`${entityType}:${externalId}`) ?? null;
  }

  async setSyncState(state: SyncState): Promise<void> {
    this.sync.set(`${state.entityType}:${state.externalId}`, state);
  }

  async upsertMirror(record: MirrorRecord): Promise<void> {
    this.mirrors.set(`${record.entityType}:${record.externalId}`, record);
  }

  async getMirror(entityType: MirrorEntity, externalId: string): Promise<MirrorRecord | null> {
    return this.mirrors.get(`${entityType}:${externalId}`) ?? null;
  }

  async listMirrors(entityType: MirrorEntity): Promise<MirrorRecord[]> {
    return [...this.mirrors.values()].filter((row) => row.entityType === entityType);
  }
}

export async function assertNoConflict(
  store: GatewayStore,
  entityType: MirrorEntity,
  externalId: string,
  currentHash: string,
): Promise<void> {
  const state = await store.getSyncState(entityType, externalId);
  if (state?.lastPulledHash && state.lastPulledHash !== currentHash) {
    throw new GatewayError(
      "conflict",
      "Buildertrend changed after our last pull. Not overwriting.",
      { entityType, externalId },
    );
  }
}

export function hashEntity(value: unknown): string {
  return stableHash(value);
}

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export class PostgresStore implements GatewayStore {
  constructor(private readonly pool: PgClient) {}

  async logCommand(entry: Omit<CommandLogEntry, "id" | "createdAt">): Promise<CommandLogEntry> {
    const result = await this.pool.query(
      `INSERT INTO bt_command_log (verb, "dryRun", "payloadSummary", "btStatus", "errorCode")
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING id, verb, "dryRun", "payloadSummary", "btStatus", "errorCode", "createdAt"`,
      [
        entry.verb,
        entry.dryRun,
        JSON.stringify(summarizePayload(entry.payloadSummary)),
        entry.btStatus ?? null,
        entry.errorCode ?? null,
      ],
    );
    const row = result.rows[0]!;
    return {
      id: String(row.id),
      verb: String(row.verb),
      dryRun: Boolean(row.dryRun),
      payloadSummary: (row.payloadSummary as Record<string, unknown>) ?? {},
      btStatus: (row.btStatus as number | undefined) ?? undefined,
      errorCode: (row.errorCode as string | undefined) ?? undefined,
      createdAt: new Date(String(row.createdAt)).toISOString(),
    };
  }

  async listCommands(limit = 50): Promise<CommandLogEntry[]> {
    const result = await this.pool.query(
      `SELECT id, verb, "dryRun", "payloadSummary", "btStatus", "errorCode", "createdAt"
       FROM bt_command_log ORDER BY "createdAt" DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      verb: String(row.verb),
      dryRun: Boolean(row.dryRun),
      payloadSummary: (row.payloadSummary as Record<string, unknown>) ?? {},
      btStatus: (row.btStatus as number | undefined) ?? undefined,
      errorCode: (row.errorCode as string | undefined) ?? undefined,
      createdAt: new Date(String(row.createdAt)).toISOString(),
    }));
  }

  async getSyncState(entityType: MirrorEntity, externalId: string): Promise<SyncState | null> {
    const result = await this.pool.query(
      `SELECT "entityType", "externalId", "lastPulledHash", "lastPulledAt", "lastPushedAt", "lastError"
       FROM bt_sync_state WHERE "entityType" = $1 AND "externalId" = $2`,
      [entityType, externalId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      entityType: row.entityType as MirrorEntity,
      externalId: String(row.externalId),
      lastPulledHash: (row.lastPulledHash as string | undefined) ?? undefined,
      lastPulledAt: row.lastPulledAt ? new Date(String(row.lastPulledAt)).toISOString() : undefined,
      lastPushedAt: row.lastPushedAt ? new Date(String(row.lastPushedAt)).toISOString() : undefined,
      lastError: (row.lastError as string | undefined) ?? undefined,
    };
  }

  async setSyncState(state: SyncState): Promise<void> {
    await this.pool.query(
      `INSERT INTO bt_sync_state ("entityType", "externalId", "lastPulledHash", "lastPulledAt", "lastPushedAt", "lastError", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("entityType", "externalId") DO UPDATE SET
         "lastPulledHash" = EXCLUDED."lastPulledHash",
         "lastPulledAt" = EXCLUDED."lastPulledAt",
         "lastPushedAt" = EXCLUDED."lastPushedAt",
         "lastError" = EXCLUDED."lastError",
         "updatedAt" = NOW()`,
      [
        state.entityType,
        state.externalId,
        state.lastPulledHash ?? null,
        state.lastPulledAt ?? null,
        state.lastPushedAt ?? null,
        state.lastError ?? null,
      ],
    );
  }

  async upsertMirror(record: MirrorRecord): Promise<void> {
    const id = Number(record.externalId);
    const extra = record.extra ?? {};
    switch (record.entityType) {
      case "job":
        await this.pool.query(
          `INSERT INTO bt_jobs ("btJobId", "builderId", name, "jobNumber", status, address, "rawHash", "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT ("btJobId") DO UPDATE SET
             name = EXCLUDED.name, "jobNumber" = EXCLUDED."jobNumber",
             status = EXCLUDED.status, address = EXCLUDED.address,
             "rawHash" = EXCLUDED."rawHash", "syncedAt" = NOW()`,
          [
            id,
            record.builderId,
            record.title ?? "",
            extra.jobNumber ?? null,
            record.status ?? null,
            extra.address ?? null,
            record.hash,
          ],
        );
        return;
      case "lead":
      case "contact":
      case "invoice":
      case "variation":
        await this.pool.query(
          `INSERT INTO ${mirrorTable(record.entityType)}
             ("${mirrorIdColumn(record.entityType)}", "builderId", "btJobId", title, status, amount, "rawHash", extra, "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
           ON CONFLICT ("${mirrorIdColumn(record.entityType)}") DO UPDATE SET
             "builderId" = EXCLUDED."builderId", "btJobId" = EXCLUDED."btJobId",
             title = EXCLUDED.title, status = EXCLUDED.status, amount = EXCLUDED.amount,
             "rawHash" = EXCLUDED."rawHash", extra = EXCLUDED.extra, "syncedAt" = NOW()`,
          [
            id,
            record.builderId,
            record.jobId ?? null,
            record.title ?? null,
            record.status ?? null,
            record.amount ?? null,
            record.hash,
            JSON.stringify(extra),
          ],
        );
        return;
      case "po":
        await this.pool.query(
          `INSERT INTO bt_purchase_orders
             ("btPurchaseOrderId", "builderId", "btJobId", "poNumber", title, status, "totalAmount", "rawHash", "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT ("btPurchaseOrderId") DO UPDATE SET
             "btJobId" = EXCLUDED."btJobId", "poNumber" = EXCLUDED."poNumber",
             title = EXCLUDED.title, status = EXCLUDED.status,
             "totalAmount" = EXCLUDED."totalAmount", "rawHash" = EXCLUDED."rawHash", "syncedAt" = NOW()`,
          [
            id,
            record.builderId,
            record.jobId ?? null,
            extra.poNumber ?? record.title ?? null,
            record.title ?? null,
            record.status ?? null,
            record.amount ?? null,
            record.hash,
          ],
        );
        return;
      case "bill":
        await this.pool.query(
          `INSERT INTO bt_bills
             ("btBillId", "builderId", "btJobId", "billNumber", "billTitle", "paymentAmount", "paymentStatus", "rawHash", "syncedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT ("btBillId") DO UPDATE SET
             "btJobId" = EXCLUDED."btJobId", "billNumber" = EXCLUDED."billNumber",
             "billTitle" = EXCLUDED."billTitle", "paymentAmount" = EXCLUDED."paymentAmount",
             "paymentStatus" = EXCLUDED."paymentStatus", "rawHash" = EXCLUDED."rawHash", "syncedAt" = NOW()`,
          [
            id,
            record.builderId,
            record.jobId ?? null,
            extra.billNumber ?? null,
            record.title ?? null,
            record.amount ?? null,
            extra.paymentStatus ?? null,
            record.hash,
          ],
        );
        return;
    }
  }

  async getMirror(entityType: MirrorEntity, externalId: string): Promise<MirrorRecord | null> {
    const rows = await this.listMirrors(entityType);
    return rows.find((row) => row.externalId === String(externalId)) ?? null;
  }

  async listMirrors(entityType: MirrorEntity): Promise<MirrorRecord[]> {
    switch (entityType) {
      case "job": {
        const result = await this.pool.query(
          `SELECT "btJobId" AS id, "builderId", name, status, "rawHash" FROM bt_jobs`,
        );
        return result.rows.map((row) => ({
          entityType,
          externalId: String(row.id),
          builderId: Number(row.builderId),
          title: row.name == null ? undefined : String(row.name),
          status: row.status == null ? undefined : String(row.status),
          hash: String(row.rawHash ?? ""),
        }));
      }
      case "po": {
        const result = await this.pool.query(
          `SELECT "btPurchaseOrderId" AS id, "builderId", "btJobId", title, status, "totalAmount" AS amount, "rawHash"
           FROM bt_purchase_orders`,
        );
        return result.rows.map((row) => asMirror(entityType, row));
      }
      case "bill": {
        const result = await this.pool.query(
          `SELECT "btBillId" AS id, "builderId", "btJobId", "billTitle" AS title, "paymentStatus" AS status,
                  "paymentAmount" AS amount, "rawHash"
           FROM bt_bills`,
        );
        return result.rows.map((row) => asMirror(entityType, row));
      }
      default: {
        const result = await this.pool.query(
          `SELECT "${mirrorIdColumn(entityType)}" AS id, "builderId", "btJobId", title, status, amount, "rawHash"
           FROM ${mirrorTable(entityType)}`,
        );
        return result.rows.map((row) => asMirror(entityType, row));
      }
    }
  }
}

function asMirror(entityType: MirrorEntity, row: Record<string, unknown>): MirrorRecord {
  return {
    entityType,
    externalId: String(row.id),
    builderId: Number(row.builderId),
    jobId: row.btJobId == null ? undefined : Number(row.btJobId),
    title: row.title == null ? undefined : String(row.title),
    status: row.status == null ? undefined : String(row.status),
    amount: row.amount == null ? undefined : Number(row.amount),
    hash: String(row.rawHash ?? ""),
  };
}

function mirrorTable(entity: MirrorEntity): string {
  switch (entity) {
    case "job":
      return "bt_jobs";
    case "lead":
      return "bt_leads";
    case "contact":
      return "bt_contacts";
    case "invoice":
      return "bt_invoices";
    case "variation":
      return "bt_variations";
    case "po":
      return "bt_purchase_orders";
    case "bill":
      return "bt_bills";
  }
}

function mirrorIdColumn(entity: MirrorEntity): string {
  switch (entity) {
    case "job":
      return "btJobId";
    case "lead":
      return "btLeadId";
    case "contact":
      return "btContactId";
    case "invoice":
      return "btInvoiceId";
    case "variation":
      return "btVariationId";
    case "po":
      return "btPurchaseOrderId";
    case "bill":
      return "btBillId";
  }
}

export async function createStore(databaseUrl?: string): Promise<GatewayStore> {
  if (!databaseUrl) return new MemoryStore();
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: databaseUrl.replace("+asyncpg", "") });
  return new PostgresStore(pool);
}
