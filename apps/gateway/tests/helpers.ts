import { ScriptedAdapter, type BtRequest, type BtResponse } from "../src/adapter.js";
import { loadConfig, type GatewayConfig } from "../src/config.js";
import { invokeByName } from "../src/invoke.js";
import { MemoryStore } from "../src/store.js";
import "../src/verbs.js";

export function testConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return loadConfig({
    transport: "direct",
    defaultDryRun: true,
    enableSend: false,
    sandbox: false,
    gatewayToken: undefined,
    serviceUrl: undefined,
    serviceToken: undefined,
    cookieJarPath: undefined,
    databaseUrl: undefined,
    ...overrides,
  });
}

export function createHarness(
  handler?: (req: BtRequest) => BtResponse | Promise<BtResponse>,
  configOverrides: Partial<GatewayConfig> = {},
) {
  const calls: BtRequest[] = [];
  const adapter = new ScriptedAdapter(async (req) => {
    calls.push(req);
    if (!handler) {
      return { status: 200, contentType: "application/json", json: { success: true, data: {} } };
    }
    return handler(req);
  });
  const store = new MemoryStore();
  const config = testConfig(configOverrides);
  return {
    calls,
    adapter,
    store,
    config,
    invoke: (verb: string, args: Record<string, unknown> = {}) =>
      invokeByName(verb, { config, adapter, store, args }),
  };
}
