import { describe, expect, it } from "vitest";
import { CONTENT_JSON } from "../src/adapter.js";
import { createHttpApp } from "../src/http.js";
import { createHarness } from "./helpers.js";

describe("HTTP /v1", () => {
  it("exposes the same verbs as catalog and dry-runs writes", async () => {
    const { adapter, store, config } = createHarness();
    const app = createHttpApp(config, adapter, store);
    const res = await app.request("/v1/variations/add-lines", {
      method: "POST",
      headers: { "content-type": CONTENT_JSON },
      body: JSON.stringify({ changeOrderId: 1, lines: [{ title: "x" }] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dry_run: boolean; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);
  });

  it("returns not_captured for invoice draft save", async () => {
    const { adapter, store, config } = createHarness();
    const app = createHttpApp(config, adapter, store);
    const res = await app.request("/v1/invoices/save-draft", {
      method: "POST",
      headers: { "content-type": CONTENT_JSON },
      body: JSON.stringify({ invoiceId: 1, jobId: 2, dry_run: false }),
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string; discovery: { click: string } };
    expect(body.error).toBe("not_captured");
    expect(body.discovery.click).toMatch(/Save/i);
  });
});
