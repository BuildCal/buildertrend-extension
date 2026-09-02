import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sendVerbs, VERBS } from "./catalog.js";
import type { GatewayConfig } from "./config.js";
import { GatewayError, isGatewayError } from "./errors.js";
import { invokeByName } from "./invoke.js";
import type { BtAdapter } from "./adapter.js";
import type { GatewayStore } from "./store.js";
import "./verbs.js";

const CommonArgs = {
  jobId: z.number().optional(),
  invoiceId: z.number().optional(),
  changeOrderId: z.number().optional(),
  leadId: z.number().optional(),
  contactId: z.number().optional(),
  billId: z.number().optional(),
  purchaseOrderId: z.number().optional(),
  fileId: z.number().optional(),
  folderId: z.number().optional(),
  dry_run: z.boolean().optional(),
  search: z.string().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  lines: z.array(z.unknown()).optional(),
  line: z.record(z.unknown()).optional(),
  lineIds: z.array(z.number()).optional(),
  header: z.record(z.unknown()).optional(),
  body: z.record(z.unknown()).optional(),
  skipGstRecompute: z.boolean().optional(),
};

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
      CommonArgs,
      async (input) => {
        const args = (input ?? {}) as Record<string, unknown>;
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
