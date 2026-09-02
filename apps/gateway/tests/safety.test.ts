import { describe, expect, it } from "vitest";
import { assertSafePath } from "../src/adapter.js";
import { remainingCaptures, sendVerbs, VERBS } from "../src/catalog.js";
import { GatewayError } from "../src/errors.js";
import { createHarness } from "./helpers.js";

describe("safety locks", () => {
  it("catalog includes every in-scope verb and slice-C discovery steps", () => {
    const verbs = VERBS.map((v) => v.verb);
    for (const required of [
      "session.status",
      "jobs.list",
      "leads.list",
      "contacts.list",
      "invoices.get",
      "variations.addLines",
      "bills.list",
      "pos.list",
      "estimates.worksheet",
      "docs.root",
      "costing.lines",
      "invoices.saveDraft",
      "leads.create",
      "contacts.create",
      "variations.createDraft",
      "pos.create",
      "docs.upload",
      "jobs.create",
    ]) {
      expect(verbs).toContain(required);
    }
    for (const spec of remainingCaptures()) {
      expect(spec.discovery?.click).toBeTruthy();
    }
    expect(sendVerbs().every((v) => v.kind === "send")).toBe(true);
  });

  it("blocks notify-owners paths unless send is enabled", () => {
    expect(() => assertSafePath("/apix/v2/ChangeOrders/1/notify-owners", false)).toThrow(
      GatewayError,
    );
    expect(() => assertSafePath("/apix/v2/ChangeOrders/1/notify-owners", true)).not.toThrow();
  });

  it("bills.create payload never marks ready for payment or pays", async () => {
    const { calls, invoke } = createHarness();
    await invoke("bills.create", {
      jobId: 9,
      vendorId: 3,
      billNumber: "B-1",
      billTitle: "Project expense",
      invoiceDate: "2026-09-01T00:00:00",
      dueDate: "2026-09-15T00:00:00",
      lineItems: [],
      dry_run: false,
    });
    const create = calls.find((c) => c.path === "/api/v1/bills");
    const body = create?.json as Record<string, unknown>;
    expect(body.readyForPayment).toBe(false);
    expect(body.payInFull).toBe(false);
    expect(body.payOnline).toBe(false);
    expect(body.sendToAccounting).toBe(false);
  });

  it("requires sandbox to create a real job/lead/contact", async () => {
    const { invoke } = createHarness();
    await expect(invoke("jobs.create", { dry_run: false, name: "Nope" })).rejects.toMatchObject({
      code: "not_captured",
    });
  });
});
