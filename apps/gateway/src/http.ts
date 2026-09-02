import { Hono } from "hono";
import { VERB_BY_HTTP, VERB_BY_NAME, VERBS } from "./catalog.js";
import type { GatewayConfig } from "./config.js";
import { GatewayError, isGatewayError } from "./errors.js";
import { invokeByName } from "./invoke.js";
import { parseVerbArgs } from "./schemas.js";
import type { BtAdapter } from "./adapter.js";
import type { GatewayStore } from "./store.js";
import "./verbs.js";

export function createHttpApp(
  config: GatewayConfig,
  adapter: BtAdapter,
  store: GatewayStore,
): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz" || c.req.path === "/v1/health") {
      await next();
      return;
    }
    const expected = config.gatewayToken?.trim() ?? "";
    if (!expected) {
      return c.json(
        {
          ok: false,
          error: "auth_required",
          message: "BT_GATEWAY_TOKEN is required. HTTP /v1 fails closed.",
        },
        401,
      );
    }
    const token = c.req.header("x-bt-gateway-token") ?? c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (token !== expected) {
      return c.json({ ok: false, error: "auth_required", message: "Invalid BT_GATEWAY_TOKEN" }, 401);
    }
    await next();
  });

  app.get("/healthz", (c) => c.json({ ok: true, service: "buildertrend-gateway" }));
  app.get("/v1/health", (c) => c.json({ ok: true, service: "buildertrend-gateway" }));

  app.get("/v1/catalog", (c) =>
    c.json({
      ok: true,
      builderId: config.builderId,
      enableSend: config.enableSend,
      defaultDryRun: config.defaultDryRun,
      verbs: VERBS,
    }),
  );

  app.post("/v1/invoke", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const verb = String(body.verb ?? "");
    const rawArgs = (body.args as Record<string, unknown> | undefined) ?? {};
    const args = verb ? parseVerbArgs(verb, rawArgs) : rawArgs;
    return run(c, verb, args);
  });

  for (const spec of VERBS) {
    const handler = async (c: { req: { json: () => Promise<unknown>; query: () => Record<string, string> } }) => {
      const query = c.req.query();
      let body: Record<string, unknown> = {};
      if (spec.httpMethod === "POST") {
        const parsed = await c.req.json().catch(() => ({}));
        body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      }
      const args = parseVerbArgs(spec.verb, { ...query, ...body });
      return run(c as never, spec.verb, args);
    };
    if (spec.httpMethod === "GET") app.get(spec.httpPath, handler);
    else app.post(spec.httpPath, handler);
  }

  app.notFound((c) => {
    const spec = VERB_BY_HTTP.get(c.req.path);
    if (spec) return c.json({ ok: false, error: "validation", message: `Use ${spec.httpMethod} ${spec.httpPath}` }, 405);
    return c.json({ ok: false, error: "not_found", message: "Unknown route" }, 404);
  });

  async function run(
    c: { json: (body: unknown, status?: number) => Response },
    verb: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    try {
      if (!VERB_BY_NAME.has(verb)) {
        throw new GatewayError("not_found", `Unknown verb ${verb}`);
      }
      const result = await invokeByName(verb, { config, adapter, store, args });
      return c.json(result);
    } catch (err) {
      if (isGatewayError(err)) {
        return c.json(err.toJSON(), err.httpStatus as 200);
      }
      return c.json(
        { ok: false, error: "bt_error", message: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  }

  return app;
}
