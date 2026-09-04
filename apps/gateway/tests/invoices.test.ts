import { describe, expect, it } from "vitest";
import { CONTENT_JSON, CONTENT_MERGE_PATCH } from "../src/adapter.js";
import { VERBS } from "../src/catalog.js";
import {
  INVOICE_DRAFT_STATUS,
  INVOICE_SAVE_PATH,
  invoiceSaveDraftPayload,
} from "../src/invoices-payload.js";
import { createHarness } from "./helpers.js";

describe("invoices.saveDraft", () => {
  it("is marked captured in the catalog", () => {
    expect(VERBS.find((v) => v.verb === "invoices.saveDraft")?.captured).toBe(true);
    expect(VERBS.find((v) => v.verb === "invoices.addLines")?.captured).toBe(true);
  });

  it("forces notifyOwner/createInvoiceChkbox false and draft status", () => {
    const body = invoiceSaveDraftPayload(
      {
        header: {
          title: "Deposit",
          notifyOwner: true,
          createInvoiceChkbox: true,
          status: 4,
        },
      },
      { invoiceId: 99, jobId: 7 },
      99,
      7,
    );
    expect(body.notifyOwner).toBe(false);
    expect(body.createInvoiceChkbox).toBe(false);
    expect(body.status).toBe(INVOICE_DRAFT_STATUS);
    expect(body.invoiceId).toBe(99);
    expect(body.job).toBe(7);
    expect(body.title).toBe("Deposit");
  });

  it("dry_run does not hit BT and no longer returns not_captured", async () => {
    const { calls, invoke } = createHarness();
    const result = await invoke("invoices.saveDraft", {
      invoiceId: 18049528,
      jobId: 42748690,
      dry_run: true,
      header: { title: "Deposit" },
    });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("PUTs merge-patch save-invoice with forced draft flags", async () => {
    const { calls, invoke } = createHarness(async (req) => {
      if (req.path.includes("get-invoice")) {
        return {
          status: 200,
          contentType: CONTENT_JSON,
          json: {
            success: true,
            data: { invoiceId: 55, jobId: 9, title: "Old", status: { value: 1, message: "Draft" } },
          },
        };
      }
      return {
        status: 200,
        contentType: CONTENT_JSON,
        json: { success: true, data: { invoiceId: 55, title: "New title" } },
      };
    });

    await invoke("invoices.saveDraft", {
      invoiceId: 55,
      jobId: 9,
      dry_run: false,
      header: { title: "New title", notifyOwner: true, createInvoiceChkbox: true, status: 9 },
    });

    const put = calls.find((c) => c.method === "PUT" && c.path === INVOICE_SAVE_PATH);
    expect(put).toBeTruthy();
    expect(put!.contentType).toBe(CONTENT_MERGE_PATCH);
    const body = put!.json as {
      title: string;
      notifyOwner: boolean;
      createInvoiceChkbox: boolean;
      status: number;
      invoiceId: number;
      job: number;
    };
    expect(body.title).toBe("New title");
    expect(body.notifyOwner).toBe(false);
    expect(body.createInvoiceChkbox).toBe(false);
    expect(body.status).toBe(INVOICE_DRAFT_STATUS);
    expect(body.invoiceId).toBe(55);
    expect(body.job).toBe(9);
  });
});

describe("invoices.addLines", () => {
  it("dry_run no longer returns not_captured", async () => {
    const { calls, invoke } = createHarness();
    const result = await invoke("invoices.addLines", {
      invoiceId: 18059815,
      jobId: 41648716,
      dry_run: true,
      lines: [{ title: "capture line", ownerPrice: 0, unitCost: 0, quantity: 1 }],
    });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("PUTs save-invoice with merged lineItems and draft flags", async () => {
    const { calls, invoke } = createHarness(async (req) => {
      if (req.path.includes("get-invoice")) {
        return {
          status: 200,
          contentType: CONTENT_JSON,
          json: {
            success: true,
            data: {
              invoiceId: 55,
              jobId: 9,
              lineItems: [{ id: 1, title: "existing", ownerPrice: 0 }],
              status: { value: 1, message: "Draft" },
            },
          },
        };
      }
      return {
        status: 200,
        contentType: CONTENT_JSON,
        json: { success: true, data: { invoiceId: 55, lineItems: [{}, {}] } },
      };
    });

    await invoke("invoices.addLines", {
      invoiceId: 55,
      jobId: 9,
      dry_run: false,
      lines: [{ title: "new", ownerPrice: 0, unitCost: 0, quantity: 1 }],
    });

    const put = calls.find((c) => c.method === "PUT" && c.path === INVOICE_SAVE_PATH);
    expect(put).toBeTruthy();
    expect(put!.contentType).toBe(CONTENT_MERGE_PATCH);
    const body = put!.json as {
      lineItems: unknown[];
      ownerInvoiceLineItems: unknown[];
      notifyOwner: boolean;
      createInvoiceChkbox: boolean;
      status: number;
    };
    expect(body.lineItems).toHaveLength(2);
    expect(body.ownerInvoiceLineItems).toHaveLength(2);
    expect(body.notifyOwner).toBe(false);
    expect(body.createInvoiceChkbox).toBe(false);
    expect(body.status).toBe(INVOICE_DRAFT_STATUS);
  });
});
