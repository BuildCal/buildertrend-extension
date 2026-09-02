export type TransportKind = "sidecar" | "direct";

export interface GatewayConfig {
  builderId: number;
  baseUrl: string;
  enableSend: boolean;
  sandbox: boolean;
  defaultDryRun: boolean;
  port: number;
  gatewayToken: string | undefined;
  transport: TransportKind;
  serviceUrl: string | undefined;
  serviceToken: string | undefined;
  cookieJarPath: string | undefined;
  chromeProfilePath: string | undefined;
  databaseUrl: string | undefined;
  userAgent: string;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  const transport = (process.env.BT_TRANSPORT ?? "sidecar") as TransportKind;
  return {
    builderId: intEnv("BT_BUILDER_ID", 110310),
    baseUrl: (process.env.BT_BASE_URL ?? "https://buildertrend.net").replace(/\/$/, ""),
    enableSend: boolEnv("BT_GATEWAY_ENABLE_SEND", false),
    sandbox: boolEnv("BT_GATEWAY_SANDBOX", false),
    defaultDryRun: boolEnv("BT_GATEWAY_DEFAULT_DRY_RUN", true),
    port: intEnv("BT_GATEWAY_PORT", 8787),
    gatewayToken: process.env.BT_GATEWAY_TOKEN,
    transport: transport === "direct" ? "direct" : "sidecar",
    serviceUrl: process.env.BT_SERVICE_URL,
    serviceToken: process.env.BT_SERVICE_INTERNAL_TOKEN ?? process.env.INTERNAL_API_TOKEN,
    cookieJarPath: process.env.BT_COOKIE_JAR,
    chromeProfilePath: process.env.BT_GATEWAY_PROFILE,
    databaseUrl: process.env.DATABASE_URL,
    userAgent:
      process.env.BT_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    ...overrides,
  };
}

export const OWNER_INVOICE_TAX_GROUP_ID = 78952;
export const GST_COST_CODE = 17072421;
export const GST_LINE_TITLE = "[GST001] GST on Total Owner Price";
export const GST_UNIT_COST = 0.1;
export const GST_PAGE_TYPE_ENUM = 6;
export const DRAFT_APPROVAL_STATUS = 0;
