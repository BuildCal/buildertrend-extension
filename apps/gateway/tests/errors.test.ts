import { describe, expect, it } from "vitest";
import {
  interpretBtPayload,
  ScriptedAdapter,
  type BtRequest,
} from "../src/adapter.js";
import { GatewayError } from "../src/errors.js";
import { redactHeaders, redactUrl } from "../src/redact.js";
import { createHarness } from "./helpers.js";

describe("adapter error mapping", () => {
  it("maps needsToRelogin to auth_required", () => {
    expect(() =>
      interpretBtPayload("/api/Jobsites/Grid", 200, { needsToRelogin: true }, "{}"),
    ).toThrow(GatewayError);
    try {
      interpretBtPayload("/api/Jobsites/Grid", 200, { needsToRelogin: true }, "{}");
    } catch (err) {
      expect((err as GatewayError).code).toBe("auth_required");
    }
  });

  it("maps HTTP 401 to auth_required", () => {
    expect(() => interpretBtPayload("/api/x", 401, {}, "")).toThrowError(/auth/i);
  });

  it("does not log cookie header values", () => {
    const redacted = redactHeaders({
      Cookie: "ASP.NET_SessionId=super-secret",
      Authorization: "Bearer secret",
      "content-type": "application/json",
    });
    expect(redacted.Cookie).toBe("[redacted]");
    expect(redacted.Authorization).toBe("[redacted]");
    expect(redacted["content-type"]).toBe("application/json");
  });

  it("keeps boolean useSession query flags", () => {
    expect(redactUrl("/api/x?useSession=true&token=abc")).toBe("/api/x?useSession=true&token=%5Bredacted%5D");
  });

  it("surfaces send_disabled for notify/send tools", async () => {
    const { invoke } = createHarness();
    await expect(invoke("variations.notifyOwners", { changeOrderId: 1 })).rejects.toMatchObject({
      code: "send_disabled",
    });
    await expect(invoke("invoices.send", { invoiceId: 1 })).rejects.toMatchObject({
      code: "send_disabled",
    });
    await expect(invoke("bills.markReadyForPayment", { billId: 1 })).rejects.toMatchObject({
      code: "send_disabled",
    });
  });

  it("returns not_captured with a discovery step", async () => {
    const { invoke } = createHarness();
    try {
      await invoke("leads.create", { dry_run: false });
      throw new Error("expected failure");
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      const body = (err as GatewayError).toJSON();
      expect(body.error).toBe("not_captured");
      expect(body.discovery).toBeTruthy();
    }
  });
});

describe("ScriptedAdapter", () => {
  it("records requests when wrapped by tests", async () => {
    const seen: BtRequest[] = [];
    const adapter = new ScriptedAdapter(async (req) => {
      seen.push(req);
      return { status: 200, contentType: "application/json", json: { success: true } };
    });
    await adapter.request({ method: "GET", path: "/api/AccountInfo/GlobalInfo" });
    expect(seen).toHaveLength(1);
  });
});
