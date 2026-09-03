import { readFile } from "node:fs/promises";
import { ERROR_CODES, GatewayError, type ErrorCode } from "./errors.js";
import type { GatewayConfig } from "./config.js";
import { looksLikeLoginHtml, redactHeaders, redactUrl, safeErrorSnippet } from "./redact.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const CONTENT_JSON = "application/json";
export const CONTENT_MERGE_PATCH = "application/merge-patch+json";

export interface BtMultipartFile {
  fieldName: string;
  filename: string;
  contentType?: string;
  contentBase64: string;
}

export interface BtRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  contentType?: string;
  raw?: boolean;
  /** Multipart body for captured tempFile uploads. Not used for ocr-upload. */
  multipart?: BtMultipartFile[];
}

export interface BtResponse {
  status: number;
  contentType: string;
  json?: unknown;
  bodyText?: string;
  bodyBase64?: string;
}

export interface BtAdapter {
  request(req: BtRequest): Promise<BtResponse>;
}

export type RequestHook = (req: BtRequest) => void;

const ALLOWED_PREFIXES = ["/api/", "/apix/"];

const BLOCKED_FRAGMENTS = [
  "notify-owners",
  "notifyowners",
  "sendinvoice",
  "send-invoice",
  "markreadyforpayment",
  "mark-ready-for-payment",
  "paybill",
  "pay-bill",
  "voidinvoice",
  "void-invoice",
  "converttojob",
  "convert-to-job",
];

export function assertSafePath(path: string, enableSend: boolean): void {
  if (!path.startsWith("/") || path.includes("..") || path.includes("://")) {
    throw new GatewayError("validation", "Refusing non-BT path", { path: redactUrl(path) });
  }
  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    throw new GatewayError("validation", "Path must be /api or /apix", { path });
  }
  if (enableSend) return;
  const lower = path.toLowerCase();
  if (BLOCKED_FRAGMENTS.some((frag) => lower.includes(frag))) {
    throw new GatewayError("send_disabled", "Send/pay/notify path is blocked", { path });
  }
}

export function contentTypeFor(req: BtRequest): string {
  return req.contentType ?? CONTENT_JSON;
}

export function isMergePatch(req: BtRequest): boolean {
  return contentTypeFor(req) === CONTENT_MERGE_PATCH;
}

export function browserHeaders(config: GatewayConfig, contentType: string): Record<string, string> {
  return {
    "user-agent": config.userAgent,
    accept: "*/*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "content-type": contentType,
    portaltype: "1",
    referer: `${config.baseUrl}/app/Landing`,
    "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };
}

export function buildMultipartForm(files: BtMultipartFile[]): FormData {
  const form = new FormData();
  for (const file of files) {
    const bytes = Buffer.from(file.contentBase64, "base64");
    const blob = new Blob([bytes], { type: file.contentType ?? "application/pdf" });
    form.append(file.fieldName || "fileList", blob, file.filename);
  }
  return form;
}

function queryString(query: BtRequest["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function interpretBtPayload(path: string, status: number, json: unknown, text: string): void {
  if (status === 401 || status === 403) {
    throw new GatewayError("auth_required", "Buildertrend returned an auth failure", {
      path: redactUrl(path),
      status,
    });
  }
  if (looksLikeLoginHtml(text)) {
    throw new GatewayError("auth_required", "Buildertrend returned login HTML", {
      path: redactUrl(path),
    });
  }
  if (json && typeof json === "object") {
    const body = json as Record<string, unknown>;
    if (body.needsToRelogin === true) {
      throw new GatewayError("auth_required", "Buildertrend says needsToRelogin=true", {
        path: redactUrl(path),
      });
    }
    if (body.success === false) {
      const message = typeof body.message === "string" ? body.message : "BT success=false";
      throw new GatewayError("bt_error", message, { path: redactUrl(path), status });
    }
  }
  if (status >= 400) {
    throw new GatewayError("bt_error", `HTTP ${status} on ${redactUrl(path)}`, {
      path: redactUrl(path),
      status,
      snippet: safeErrorSnippet(text),
    });
  }
}

export class RecordingAdapter implements BtAdapter {
  readonly calls: BtRequest[] = [];

  constructor(
    private readonly inner: BtAdapter,
    private readonly onRequest?: RequestHook,
  ) {}

  async request(req: BtRequest): Promise<BtResponse> {
    this.calls.push(req);
    this.onRequest?.(req);
    return this.inner.request(req);
  }
}

export class ScriptedAdapter implements BtAdapter {
  constructor(private readonly handler: (req: BtRequest) => Promise<BtResponse> | BtResponse) {}

  async request(req: BtRequest): Promise<BtResponse> {
    return this.handler(req);
  }
}

export class SidecarAdapter implements BtAdapter {
  constructor(private readonly config: GatewayConfig) {}

  async request(req: BtRequest): Promise<BtResponse> {
    if (!this.config.serviceUrl || !this.config.serviceToken) {
      throw new GatewayError(
        "validation",
        "Sidecar transport needs BT_SERVICE_URL and BT_SERVICE_INTERNAL_TOKEN",
      );
    }
    assertSafePath(req.path, this.config.enableSend);
    const url = `${this.config.serviceUrl.replace(/\/$/, "")}/internal/bt-request`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": CONTENT_JSON,
        "x-internal-token": this.config.serviceToken,
      },
      body: JSON.stringify({
        method: req.method,
        path: req.path,
        params: req.query,
        json_body: req.multipart?.length ? null : (req.json ?? null),
        content_type: req.multipart?.length ? undefined : contentTypeFor(req),
        raw: Boolean(req.raw),
        multipart_files: req.multipart?.map((file) => ({
          field_name: file.fieldName,
          filename: file.filename,
          content_type: file.contentType ?? "application/pdf",
          content_base64: file.contentBase64,
        })),
      }),
    });
    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = unwrapSidecarPayload(JSON.parse(text) as Record<string, unknown>);
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      throw new GatewayError("bt_error", "Sidecar returned non-JSON", {
        status: res.status,
        snippet: safeErrorSnippet(text),
      });
    }
    if (payload.error === "auth_required" || (payload.ok === false && payload.error === "auth_required")) {
      throw new GatewayError("auth_required", String(payload.message ?? "auth_required"));
    }
    if (!res.ok && payload.error) {
      throw new GatewayError(
        sidecarErrorCode(payload.error),
        String(payload.message ?? "sidecar error"),
        { status: res.status },
      );
    }
    const json = payload.json;
    const bodyText = typeof payload.bodyText === "string" ? payload.bodyText : text;
    interpretBtPayload(req.path, Number(payload.status ?? res.status), json, bodyText);
    return {
      status: Number(payload.status ?? res.status),
      contentType: String(payload.contentType ?? CONTENT_JSON),
      json,
      bodyText: typeof payload.bodyText === "string" ? payload.bodyText : undefined,
      bodyBase64: typeof payload.bodyBase64 === "string" ? payload.bodyBase64 : undefined,
    };
  }
}

export async function loadCookieHeader(jarPath: string): Promise<string> {
  const raw = await readFile(jarPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const parts: string[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object" && "name" in item && "value" in item) {
        const row = item as { name: string; value: string };
        parts.push(`${row.name}=${row.value}`);
      }
    }
  } else if (parsed && typeof parsed === "object") {
    for (const [name, meta] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof meta === "string") parts.push(`${name}=${meta}`);
      else if (meta && typeof meta === "object" && "value" in (meta as object)) {
        parts.push(`${name}=${String((meta as { value: string }).value)}`);
      }
    }
  }
  return parts.join("; ");
}

export class DirectAdapter implements BtAdapter {
  private cookieHeader: string | undefined;

  constructor(
    private readonly config: GatewayConfig,
    cookieHeader?: string,
  ) {
    this.cookieHeader = cookieHeader;
  }

  async request(req: BtRequest): Promise<BtResponse> {
    assertSafePath(req.path, this.config.enableSend);
    if (!this.cookieHeader && this.config.cookieJarPath) {
      this.cookieHeader = await loadCookieHeader(this.config.cookieJarPath);
    }
    if (!this.cookieHeader) {
      throw new GatewayError("auth_required", "No cookie jar loaded for direct transport");
    }
    const url = `${this.config.baseUrl}${req.path}${queryString(req.query)}`;
    const multipart = req.multipart?.length ? buildMultipartForm(req.multipart) : undefined;
    const headers = browserHeaders(
      configSafe(this.config),
      multipart ? "multipart/form-data" : contentTypeFor(req),
    );
    headers.cookie = this.cookieHeader;
    if (multipart) {
      delete headers["content-type"];
    }
    const init: RequestInit = {
      method: req.method,
      headers,
      redirect: "manual",
    };
    if (multipart && req.method !== "GET") {
      init.body = multipart;
    } else if (req.json !== undefined && req.method !== "GET") {
      init.body = JSON.stringify(req.json);
    }
    const res = await fetch(url, init);
    const location = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400 && location.includes("/app/error")) {
      throw new GatewayError("auth_required", "BT redirected to /app/error", {
        path: redactUrl(req.path),
      });
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf8");
    if (res.status === 401) {
      throw new GatewayError("auth_required", "HTTP 401 from Buildertrend", {
        path: redactUrl(req.path),
      });
    }
    let json: unknown;
    if (contentType.includes("json") && text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    interpretBtPayload(req.path, res.status, json, text);
    return {
      status: res.status,
      contentType,
      json,
      bodyText: req.raw ? undefined : text,
      bodyBase64: req.raw ? buffer.toString("base64") : undefined,
    };
  }
}

function configSafe(config: GatewayConfig): GatewayConfig {
  return config;
}

export function createAdapter(config: GatewayConfig, hook?: RequestHook): BtAdapter {
  const inner =
    config.transport === "direct" ? new DirectAdapter(config) : new SidecarAdapter(config);
  return hook ? new RecordingAdapter(inner, hook) : inner;
}

export function logAdapterRequest(req: BtRequest): void {
  const safe = {
    method: req.method,
    path: redactUrl(req.path),
    contentType: contentTypeFor(req),
    query: req.query ? redactUrl(`https://buildertrend.net${req.path}${queryString(req.query)}`) : undefined,
    headers: redactHeaders({ "content-type": contentTypeFor(req) }),
  };
  console.error(`[bt-adapter] ${safe.method} ${safe.path} (${safe.contentType})`);
}

/** FastAPI HTTPException wraps `{error, message}` in `detail`. */
export function unwrapSidecarPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const detail = payload.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return { ...payload, ...(detail as Record<string, unknown>) };
  }
  return payload;
}

function sidecarErrorCode(value: unknown): ErrorCode {
  if (typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)) {
    return value as ErrorCode;
  }
  return "bt_error";
}

export function unwrapData(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}
