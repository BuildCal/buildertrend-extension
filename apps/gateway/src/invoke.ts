import { VERB_BY_NAME, type VerbSpec } from "./catalog.js";
import type { GatewayConfig } from "./config.js";
import { GatewayError } from "./errors.js";
import type { BtAdapter, BtRequest, BtResponse } from "./adapter.js";
import type { GatewayStore, MirrorEntity } from "./store.js";
import { assertNoConflict, hashEntity } from "./store.js";
import { summarizePayload } from "./redact.js";

export interface VerbResult {
  ok: boolean;
  verb: string;
  dry_run?: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface VerbContext {
  config: GatewayConfig;
  adapter: BtAdapter;
  store: GatewayStore;
  dryRun: boolean;
  args: Record<string, unknown>;
}

export type VerbHandler = (ctx: VerbContext) => Promise<unknown>;

const handlers = new Map<string, VerbHandler>();

export function registerVerb(name: string, handler: VerbHandler): void {
  handlers.set(name, handler);
}

export function registeredVerbs(): string[] {
  return [...handlers.keys()];
}

export function requireNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    throw new GatewayError("validation", `Missing or invalid ${key}`);
  }
  return num;
}

export function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  if (args[key] == null || args[key] === "") return undefined;
  return requireNumber(args, key);
}

export async function bt(
  ctx: VerbContext,
  req: BtRequest,
): Promise<BtResponse> {
  return ctx.adapter.request(req);
}

export async function btJson(ctx: VerbContext, req: BtRequest): Promise<unknown> {
  const res = await bt(ctx, req);
  return res.json;
}

export function ok(verb: string, data: unknown, extra: Record<string, unknown> = {}): VerbResult {
  return { ok: true, verb, data, ...extra };
}

export async function invokeVerb(
  spec: VerbSpec,
  ctx: VerbContext,
): Promise<VerbResult> {
  if (spec.kind === "send" && !ctx.config.enableSend) {
    const err = new GatewayError(
      "send_disabled",
      `${spec.verb} is locked. BT_GATEWAY_ENABLE_SEND=false.`,
      { verb: spec.verb },
    );
    await ctx.store.logCommand({
      verb: spec.verb,
      dryRun: ctx.dryRun,
      payloadSummary: ctx.args,
      errorCode: err.code,
    });
    throw err;
  }

  if (!spec.captured) {
    const err = new GatewayError("not_captured", `${spec.verb} has no captured write path.`, {
      verb: spec.verb,
      discovery: spec.discovery,
    });
    await ctx.store.logCommand({
      verb: spec.verb,
      dryRun: ctx.dryRun,
      payloadSummary: ctx.args,
      errorCode: err.code,
    });
    throw err;
  }

  if (
    spec.sandboxRequired &&
    !ctx.dryRun &&
    !ctx.config.sandbox &&
    spec.kind === "write"
  ) {
    const err = new GatewayError(
      "sandbox_required",
      `${spec.verb} needs BT_GATEWAY_SANDBOX=true and dry_run=false to create a real record.`,
      { verb: spec.verb },
    );
    await ctx.store.logCommand({
      verb: spec.verb,
      dryRun: ctx.dryRun,
      payloadSummary: ctx.args,
      errorCode: err.code,
    });
    throw err;
  }

  const isMutating = spec.kind === "write" || spec.kind === "send";
  if (isMutating && ctx.dryRun) {
    const preview = dryRunPreview(spec, ctx.args);
    await ctx.store.logCommand({
      verb: spec.verb,
      dryRun: true,
      payloadSummary: ctx.args,
    });
    return {
      ok: true,
      verb: spec.verb,
      dry_run: true,
      message: "dry_run: no Buildertrend request was sent",
      data: preview,
    };
  }

  const handler = handlers.get(spec.verb);
  if (!handler) {
    throw new GatewayError("not_found", `No handler for ${spec.verb}`);
  }

  try {
    const data = await handler(ctx);
    if (isMutating) {
      await ctx.store.logCommand({
        verb: spec.verb,
        dryRun: false,
        payloadSummary: ctx.args,
        btStatus: 200,
      });
    }
    return ok(spec.verb, data, isMutating ? { dry_run: false } : {});
  } catch (err) {
    if (err instanceof GatewayError) {
      await ctx.store.logCommand({
        verb: spec.verb,
        dryRun: ctx.dryRun,
        payloadSummary: ctx.args,
        errorCode: err.code,
        btStatus: err.httpStatus,
      });
      throw err;
    }
    await ctx.store.logCommand({
      verb: spec.verb,
      dryRun: ctx.dryRun,
      payloadSummary: ctx.args,
      errorCode: "bt_error",
    });
    throw err;
  }
}

export async function invokeByName(
  verb: string,
  ctxBase: Omit<VerbContext, "dryRun" | "args"> & {
    args: Record<string, unknown>;
  },
): Promise<VerbResult> {
  const spec = VERB_BY_NAME.get(verb);
  if (!spec) throw new GatewayError("not_found", `Unknown verb ${verb}`);
  const dryRun = resolveDryRun(spec, ctxBase.args, ctxBase.config);
  return invokeVerb(spec, { ...ctxBase, dryRun, args: ctxBase.args });
}

export function resolveDryRun(
  spec: VerbSpec,
  args: Record<string, unknown>,
  config: GatewayConfig,
): boolean {
  if (spec.kind === "read" || spec.kind === "session") {
    return args.dry_run === true;
  }
  if (args.dry_run === false || args.dryRun === false) return false;
  if (args.dry_run === true || args.dryRun === true) return true;
  return config.defaultDryRun;
}

function dryRunPreview(spec: VerbSpec, args: Record<string, unknown>): Record<string, unknown> {
  return {
    wouldCall: spec.verb,
    args: summarizePayload(args),
    note: "Set dry_run=false to push a Draft. Send/notify/pay stay disabled.",
  };
}

export async function guardConflict(
  ctx: VerbContext,
  entityType: MirrorEntity,
  externalId: string,
  current: unknown,
): Promise<void> {
  await assertNoConflict(ctx.store, entityType, externalId, hashEntity(current));
}

export { handlers };
