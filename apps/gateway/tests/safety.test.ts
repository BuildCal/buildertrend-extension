import { describe, expect, it } from "vitest";
import { assertSafePath } from "../src/adapter.js";
import { billCreatePayload } from "../src/bills-payload.js";
import { remainingCaptures, sendVerbs, VERBS } from "../src/catalog.js";
import { GatewayError } from "../src/errors.js";
import { invokeVerb, registerVerb } from "../src/invoke.js";
import { verbsMissingSchemas } from "../src/schemas.js";
import { createHarness, testConfig } from "./helpers.js";

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
      "bills.create",
    ]) {
      expect(verbs).toContain(required);
    }
    expect(VERBS.find((v) => v.verb === "bills.create")?.captured).toBe(true);
    expect(VERBS.find((v) => v.verb === "bills.update")?.captured).toBe(true);
    expect(VERBS.find((v) => v.verb === "bills.attach")?.captured).toBe(true);
    expect(VERBS.find((v) => v.verb === "bills.linkPurchaseOrder")?.captured).toBe(false);
    expect(VERBS.find((v) => v.verb === "invoices.saveDraft")?.captured).toBe(false);
    expect(VERBS.find((v) => v.verb === "invoices.addLines")?.captured).toBe(false);
    expect(VERBS.find((v) => v.verb === "invoices.send")?.kind).toBe("send");
    for (const spec of remainingCaptures()) {
      expect(spec.discovery?.click).toBeTruthy();
    }
    expect(sendVerbs().every((v) => v.kind === "send")).toBe(true);
    expect(verbsMissingSchemas()).toEqual([]);
  });

  it("blocks notify-owners paths unless send is enabled", () => {
    expect(() => assertSafePath("/apix/v2/ChangeOrders/1/notify-owners", false)).toThrow(
      GatewayError,
    );
    expect(() => assertSafePath("/apix/v2/ChangeOrders/1/notify-owners", true)).not.toThrow();
  });

  it("bills.create dry_run does not write; sandbox is required for a real create", async () => {
    const { calls, invoke } = createHarness();
    const preview = await invoke("bills.create", { jobId: 9, vendorId: 3, dry_run: true });
    expect(preview.dry_run).toBe(true);
    expect(calls).toHaveLength(0);
    await expect(
      invoke("bills.create", { jobId: 9, vendorId: 3, dry_run: false }),
    ).rejects.toMatchObject({ code: "sandbox_required" });
    expect(calls).toHaveLength(0);
  });

  it("if a create payload is ever sent, pay flags stay false and draft flags match capture", () => {
    const body = billCreatePayload(
      {
        vendorId: 3,
        billNumber: "B-1",
        billTitle: "Project expense",
        invoiceDate: "2026-09-01T00:00:00",
        dueDate: "2026-09-15T00:00:00",
        lineItems: [],
      },
      9,
    );
    expect(body.status).toBe(9);
    expect(body.saveAsDraft).toBe(false);
    expect(body.saveDraftToJob).toBe(false);
    expect(body.purchaseOrderId).toBe(-1);
    expect(body.isCreateNewFromPO).toBe(false);
    expect(body.readyForPayment).toBe(false);
    expect(body.payInFull).toBe(false);
    expect(body.payOnline).toBe(false);
    expect(body.sendToAccounting).toBe(false);
  });

  it("sandbox_required on a captured write without BT_GATEWAY_SANDBOX", async () => {
    registerVerb("_test.sandboxWrite", async () => ({ wrote: true }));
    const { adapter, store } = createHarness();
    const spec = {
      verb: "_test.sandboxWrite",
      tool: "bt_test_sandbox_write",
      httpPath: "/v1/_test/sandbox-write",
      httpMethod: "POST" as const,
      kind: "write" as const,
      captured: true,
      sandboxRequired: true,
      description: "test only",
    };
    await expect(
      invokeVerb(spec, {
        config: testConfig({ sandbox: false }),
        adapter,
        store,
        dryRun: false,
        args: {},
      }),
    ).rejects.toMatchObject({ code: "sandbox_required" });
  });

  it("sandbox true plus dry_run=false may call the adapter", async () => {
    registerVerb("_test.sandboxWriteOk", async (ctx) => {
      await ctx.adapter.request({ method: "GET", path: "/api/AccountInfo/GlobalInfo" });
      return { wrote: true };
    });
    const { adapter, store, calls } = createHarness();
    const spec = {
      verb: "_test.sandboxWriteOk",
      tool: "bt_test_sandbox_write_ok",
      httpPath: "/v1/_test/sandbox-write-ok",
      httpMethod: "POST" as const,
      kind: "write" as const,
      captured: true,
      sandboxRequired: true,
      description: "test only",
    };
    const result = await invokeVerb(spec, {
      config: testConfig({ sandbox: true }),
      adapter,
      store,
      dryRun: false,
      args: {},
    });
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.path === "/api/AccountInfo/GlobalInfo")).toBe(true);
  });
});
