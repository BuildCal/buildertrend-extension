import { describe, expect, it } from "vitest";
import { CONTENT_JSON } from "../src/adapter.js";
import { createHttpApp } from "../src/http.js";
import { createHarness, testConfig } from "./helpers.js";

describe("HTTP /v1", () => {
  it("fails closed when BT_GATEWAY_TOKEN is unset", async () => {
    const { adapter, store } = createHarness();
    const app = createHttpApp(testConfig({ gatewayToken: undefined }), adapter, store);
    const res = await app.request("/v1/catalog");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("auth_required");
  });

  it("fails closed when the token is empty", async () => {
    const { adapter, store } = createHarness();
    const app = createHttpApp(testConfig({ gatewayToken: "   " }), adapter, store);
    const res = await app.request("/v1/jobs/get?jobId=1");
    expect(res.status).toBe(401);
  });

  it("allows a valid token and dry-runs writes", async () => {
    const { adapter, store, config } = createHarness(undefined, { gatewayToken: "secret" });
    const app = createHttpApp(config, adapter, store);
    const res = await app.request("/v1/variations/add-lines", {
      method: "POST",
      headers: { "content-type": CONTENT_JSON, "x-bt-gateway-token": "secret" },
      body: JSON.stringify({ changeOrderId: 1, lines: [{ title: "x" }] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dry_run: boolean; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);
  });

  it("rejects a wrong token", async () => {
    const { adapter, store, config } = createHarness(undefined, { gatewayToken: "secret" });
    const app = createHttpApp(config, adapter, store);
    const res = await app.request("/v1/catalog", {
      headers: { "x-bt-gateway-token": "nope" },
    });
    expect(res.status).toBe(401);
  });

  it("dry-runs invoice draft save once captured (no not_captured)", async () => {
    const { adapter, store, config } = createHarness(undefined, { gatewayToken: "secret" });
    const app = createHttpApp(config, adapter, store);
    const res = await app.request("/v1/invoices/save-draft", {
      method: "POST",
      headers: { "content-type": CONTENT_JSON, "x-bt-gateway-token": "secret" },
      body: JSON.stringify({ invoiceId: 1, jobId: 2, dry_run: true, header: { title: "Draft" } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; dry_run: boolean; error?: string };
    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);
    expect(body.error).toBeUndefined();
  });

  it("dry-runs invoice add-lines once captured (no not_captured)", async () => {
    const { adapter, store, config } = createHarness(undefined, { gatewayToken: "secret" });
    const app = createHttpApp(config, adapter, store);
    const res = await app.request("/v1/invoices/add-lines", {
      method: "POST",
      headers: { "content-type": CONTENT_JSON, "x-bt-gateway-token": "secret" },
      body: JSON.stringify({
        invoiceId: 1,
        jobId: 2,
        dry_run: true,
        lines: [{ title: "x", ownerPrice: 0 }],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; dry_run: boolean; error?: string };
    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);
    expect(body.error).toBeUndefined();
  });

  it("keeps health open without a token", async () => {
    const { adapter, store } = createHarness();
    const app = createHttpApp(testConfig({ gatewayToken: undefined }), adapter, store);
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });
});
