import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { redactHeaders, redactObject, redactUrl } from "./redact.js";

export interface CapturedCall {
  method: string;
  path: string;
  contentType: string;
  jsonKeys: string[];
  status?: number;
  recordedAt: string;
}

const INTERESTING = /^\/api(x)?\//;

export function sanitizeCapture(input: {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  status?: number;
}): CapturedCall | null {
  const path = redactUrl(input.url);
  if (!INTERESTING.test(path.split("?")[0] ?? "")) return null;
  const headers = redactHeaders(input.requestHeaders);
  const body = typeof input.requestBody === "string" ? tryJson(input.requestBody) : input.requestBody;
  const jsonKeys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  void headers;
  void redactObject(body);
  return {
    method: input.method.toUpperCase(),
    path,
    contentType: input.requestHeaders?.["content-type"] ?? input.requestHeaders?.["Content-Type"] ?? "",
    jsonKeys,
    status: input.status,
    recordedAt: new Date().toISOString(),
  };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function renderMapAppend(calls: CapturedCall[]): string {
  if (!calls.length) return "";
  const lines = ["", `## Capture ${new Date().toISOString().slice(0, 10)}`, ""];
  for (const call of calls) {
    lines.push(
      `- \`${call.method} ${call.path}\` \`${call.contentType || "no-content-type"}\` keys: ${
        call.jsonKeys.join(", ") || "—"
      }`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeCapture(
  calls: CapturedCall[],
  mapPath: string,
  jsonPath?: string,
): Promise<void> {
  if (jsonPath) {
    await mkdir(dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(calls, null, 2));
  }
  await appendFile(mapPath, renderMapAppend(calls));
}

export const CAPTURE_GUIDE = `
Dedicated gateway Chrome profile only. Do not dual-drive a human profile.

  pnpm --filter gateway capture -- --url https://buildertrend.net/app/OwnerInvoices

1. Sign into the gateway profile once.
2. Perform ONE draft save on a named sandbox job.
3. Harness records method, path, content-type, JSON keys (cookies stripped).
4. Review the append on buildertrend-api-map.md.
5. Implement the verb from that capture.
6. Replay dry_run, then one real draft. GET to verify. Leave Not sent.
`;

export interface PlaywrightLikeRequest {
  method: () => string;
  url: () => string;
  headers: () => Record<string, string>;
  postData: () => string | null;
}

export function captureFromPlaywrightRequest(req: PlaywrightLikeRequest): CapturedCall | null {
  return sanitizeCapture({
    method: req.method(),
    url: req.url(),
    requestHeaders: req.headers(),
    requestBody: req.postData() ?? undefined,
  });
}

export function assertDedicatedGatewayProfile(
  profileDir: string,
  humanProfile?: string,
): void {
  if (!profileDir.trim()) {
    throw new Error("Capture harness needs --profile / BT_GATEWAY_PROFILE (dedicated gateway profile).");
  }
  const normalized = resolve(profileDir);
  if (humanProfile && resolve(humanProfile) === normalized) {
    throw new Error(
      "Refusing the human daily Chrome profile. Session clash already ate saves. Use the dedicated gateway profile.",
    );
  }
  const humanRoots = [
    /\/Google\/Chrome$/i,
    /\/google-chrome$/i,
    /\/chromium$/i,
    /\/Default$/i,
  ];
  if (humanRoots.some((re) => re.test(normalized))) {
    throw new Error(
      "Refusing a default Chrome user-data dir. Gateway capture must use its own profile, never the human daily tab.",
    );
  }
  const looksGateway = /bt-gateway|gateway-profile/i.test(normalized);
  const hasMarker = existsSync(resolve(normalized, ".bt-gateway-profile"));
  if (!looksGateway && !hasMarker) {
    throw new Error(
      "Cannot prove this is not the human profile. Path must contain bt-gateway or gateway-profile, or the directory must contain a .bt-gateway-profile marker.",
    );
  }
}

export async function runCaptureHarness(opts: {
  url: string;
  profileDir: string;
  mapPath: string;
  outJson?: string;
}): Promise<CapturedCall[]> {
  type PlaywrightMod = {
    chromium: {
      launchPersistentContext: (
        dir: string,
        opts: Record<string, unknown>,
      ) => Promise<{
        pages: () => { on: Function; goto: Function }[];
        newPage: () => Promise<{ on: Function; goto: Function }>;
        on: Function;
      }>;
    };
  };
  let playwright: PlaywrightMod;
  try {
    playwright = (await new Function("return import('playwright')")()) as PlaywrightMod;
  } catch {
    throw new Error(
      "Playwright is not installed. From apps/gateway: npm i -D playwright && npx playwright install chromium",
    );
  }
  assertDedicatedGatewayProfile(opts.profileDir, process.env.BT_GATEWAY_HUMAN_PROFILE);
  const calls: CapturedCall[] = [];
  const context = await playwright.chromium.launchPersistentContext(opts.profileDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("request", (req: PlaywrightLikeRequest) => {
    const captured = captureFromPlaywrightRequest(req);
    if (captured) calls.push(captured);
  });
  await page.goto(opts.url, { waitUntil: "domcontentloaded" });
  console.error("Capture harness is open. Do one draft save, then close the browser.");
  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });
  await writeCapture(calls, opts.mapPath, opts.outJson);
  return calls;
}
