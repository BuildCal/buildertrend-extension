/**
 * Owner-invoice draft save payload helpers.
 * Captured 2026-09-04: PUT /apix/v3/Invoices/save-invoice
 * content-type: application/merge-patch+json
 * Never Send / notify / createInvoiceChkbox.
 */

import { asRecord, numberish } from "./grids.js";

/** Draft status value from capture (status.message = "Draft"). */
export const INVOICE_DRAFT_STATUS = 1;

export const INVOICE_SAVE_PATH = "/apix/v3/Invoices/save-invoice";

/** Top-level keys observed on the captured Save PUT (order not significant). */
export const INVOICE_SAVE_CAPTURED_KEYS = [
  "title",
  "customInvoiceId",
  "description",
  "closingText",
  "status",
  "amountPaid",
  "ownerEmail",
  "createInvoiceChkbox",
  "notifyOwner",
  "customFields",
  "attachedFiles",
  "files",
  "showLineItemsToOwner",
  "groupLineItemsByCostCode",
  "showPaymentCode",
  "showCustomFields",
  "showCostCodes",
  "showCategories",
  "showContractorCertification",
  "showArchitectCertification",
  "showRetainage",
  "showStoredMaterials",
  "showItems",
  "showInvoiceDescription",
  "lineItems",
  "builderCost",
  "unifiedDeadlineRequest",
  "internalNotes",
  "priceType",
  "containerIsValid",
  "costCodeIds",
  "ownerInvoiceLineItems",
  "amount",
  "taxMethod",
  "taxGroupId",
  "columnPreferences",
  "invoiceFormat",
  "lineItemGroupStrategy",
  "hideLaborCostAndMarkup",
  "invoiceId",
  "useLineItems",
  "invoicedFromEntity",
  "job",
] as const;

/**
 * Build a merge-patch body for draft Save.
 * Caller header/body fields are kept; send/notify flags and draft status are forced.
 */
export function invoiceSaveDraftPayload(
  args: Record<string, unknown>,
  current: unknown,
  invoiceId: number,
  jobId?: number,
): Record<string, unknown> {
  const currentRec = asRecord(current);
  const header = asRecord(args.header ?? args.body ?? {});
  const body: Record<string, unknown> = { ...header };

  body.invoiceId = invoiceId;
  const job =
    jobId ??
    numberish(body.job) ??
    numberish(args.jobId) ??
    numberish(currentRec.jobId) ??
    numberish(currentRec.job);
  if (job != null) body.job = job;

  // Force draft / never-send (captured Save had these false and status 1).
  body.notifyOwner = false;
  body.createInvoiceChkbox = false;
  body.status = INVOICE_DRAFT_STATUS;

  return body;
}

/** Related-entity picker GET captured on Add from → Change Orders (not the write). */
export const INVOICE_RELATED_LINES_PATH = "/api/LineItems/EntityLineItemsToInvoice";

/**
 * Add-lines write is the same Save PUT: UI adds rows client-side then Save fires
 * PUT /apix/v3/Invoices/save-invoice with updated lineItems / ownerInvoiceLineItems.
 * EntityAttachmentsToInvoice remains a JS GET helper for attachment metadata.
 */
export function invoiceAddLinesPayload(
  args: Record<string, unknown>,
  current: unknown,
  invoiceId: number,
  jobId?: number,
): Record<string, unknown> {
  const currentRec = asRecord(current);
  const body = invoiceSaveDraftPayload(args, current, invoiceId, jobId);
  const incoming = args.lines ?? args.ownerInvoiceLineItems ?? args.lineItems;
  if (Array.isArray(incoming) && incoming.length) {
    const existing = Array.isArray(currentRec.lineItems)
      ? (currentRec.lineItems as unknown[])
      : Array.isArray(currentRec.ownerInvoiceLineItems)
        ? (currentRec.ownerInvoiceLineItems as unknown[])
        : [];
    const merged = [...existing, ...incoming];
    body.lineItems = merged;
    body.ownerInvoiceLineItems = merged;
  } else if (args.body && typeof args.body === "object") {
    const patch = asRecord(args.body);
    if (Array.isArray(patch.lineItems)) body.lineItems = patch.lineItems;
    if (Array.isArray(patch.ownerInvoiceLineItems)) {
      body.ownerInvoiceLineItems = patch.ownerInvoiceLineItems;
    }
  }
  return body;
}
