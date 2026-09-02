import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendVerbs, VERBS } from "./catalog.js";
import type { GatewayConfig } from "./config.js";
import { GatewayError, isGatewayError } from "./errors.js";
import { invokeByName } from "./invoke.js";
import { mcpShape, parseVerbArgs } from "./schemas.js";
import type { BtAdapter } from "./adapter.js";
import type { GatewayStore } from "./store.js";
import "./verbs.js";

export function createMcpServer(
  config: GatewayConfig,
  adapter: BtAdapter,
  store: GatewayStore,
): McpServer {
  const server = new McpServer({
    name: "buildertrend-gateway",
    version: "0.1.0",
  });

  const exposed = VERBS.filter((spec) => spec.kind !== "send" || config.enableSend);

  for (const spec of exposed) {
    server.tool(
      spec.tool,
      spec.description,
      mcpShape(spec.verb),
      async (input) => {
        const args = parseVerbArgs(spec.verb, (input ?? {}) as Record<string, unknown>);
        try {
          const result = await invokeByName(spec.verb, { config, adapter, store, args });
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          const body = isGatewayError(err)
            ? err.toJSON()
            : { ok: false, error: "bt_error", message: err instanceof Error ? err.message : String(err) };
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(body) }],
          };
        }
      },
    );
  }

  server.tool(
    "bt_catalog",
    "List gateway verbs, capture status, and safety flags.",
    {},
    async () => {
      const locked = sendVerbs().map((v) => v.verb);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              builderId: config.builderId,
              enableSend: config.enableSend,
              defaultDryRun: config.defaultDryRun,
              sandbox: config.sandbox,
              sendLocked: locked,
              verbs: VERBS.map((v) => ({
                verb: v.verb,
                tool: v.tool,
                kind: v.kind,
                captured: v.captured,
                discovery: v.discovery,
              })),
            }),
          },
        ],
      };
    },
  );

  return server;
}

export async function startStdioMcp(
  config: GatewayConfig,
  adapter: BtAdapter,
  store: GatewayStore,
): Promise<void> {
  const server = createMcpServer(config, adapter, store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function formatToolError(err: unknown): Record<string, unknown> {
  if (err instanceof GatewayError) return err.toJSON();
  return { ok: false, error: "bt_error", message: err instanceof Error ? err.message : String(err) };
}
