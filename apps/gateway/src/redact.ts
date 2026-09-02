const SECRET_HEADER = /^(cookie|authorization|proxy-authorization|set-cookie)$/i;
const SECRET_QUERY = /^(usesession|sessionid|token|access_token|refresh_token|code)$/i;
const SECRET_KEY = /cookie|authorization|token|password|secret|sessionid|aspxauth|__anti/i;

export function redactHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADER.test(key) ? "[redacted]" : value;
  }
  return out;
}

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://buildertrend.net");
    for (const key of [...parsed.searchParams.keys()]) {
      if (SECRET_QUERY.test(key) || SECRET_KEY.test(key)) {
        // useSession= on query strings is a boolean flag, not a secret —
        // keep the key, drop any non-boolean value just in case.
        const value = parsed.searchParams.get(key) ?? "";
        if (key.toLowerCase() === "usesession" && /^(true|false|1|0)$/i.test(value)) {
          continue;
        }
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    return parsed.pathname + parsed.search;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

export function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key) && key.toLowerCase() !== "usesession") {
    return "[redacted]";
  }
  return value;
}

export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redactObject(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) && key.toLowerCase() !== "usesession"
      ? "[redacted]"
      : redactObject(inner, depth + 1);
  }
  return out;
}

export function looksLikeLoginHtml(text: string): boolean {
  const sample = text.slice(0, 2000).toLowerCase();
  return (
    sample.includes("<html") &&
    (sample.includes("log in") ||
      sample.includes("signin") ||
      sample.includes("auth0") ||
      sample.includes("login") ||
      sample.includes("sign in"))
  );
}

export function safeErrorSnippet(text: string): string {
  if (looksLikeLoginHtml(text)) return "[login html redacted]";
  return text.slice(0, 400);
}

export function summarizePayload(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object") return { type: typeof value };
  if (Array.isArray(value)) return { keys: ["[array]"], length: value.length };
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 40);
  const summary: Record<string, unknown> = { keys };
  for (const key of ["id", "jobId", "invoiceId", "changeOrderId", "billId", "title", "dry_run"]) {
    if (key in obj) summary[key] = redactValue(key, obj[key]);
  }
  return summary;
}
