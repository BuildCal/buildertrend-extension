import { z } from "zod";
import { VERBS } from "./catalog.js";
import { GatewayError } from "./errors.js";

const dry = { dry_run: z.coerce.boolean().optional() };
const billLineSchema = z.object({
  id: z.coerce.number().int().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  costCodeId: z.coerce.number().int().optional(),
  costCode: z.coerce.number().int().optional(),
  unitCost: z.coerce.number().optional(),
  builderCost: z.coerce.number().optional(),
  exclusiveAmount: z.coerce.number().optional(),
  quantity: z.coerce.number().optional(),
  unitType: z.string().optional(),
  taxGroupId: z.unknown().optional(),
});
const billAttachSchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
  contentType: z.string().optional(),
});
const billSendPayFlags = {
  readyForPayment: z.coerce.boolean().optional(),
  payInFull: z.coerce.boolean().optional(),
  payOnline: z.coerce.boolean().optional(),
  sendToAccounting: z.coerce.boolean().optional(),
  syncUpdatesToAccounting: z.coerce.boolean().optional(),
  sendForApproval: z.coerce.boolean().optional(),
  approveBill: z.coerce.boolean().optional(),
  billToOwner: z.coerce.boolean().optional(),
};
const page = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
};
const jobScope = {
  jobId: z.coerce.number().int().positive().optional(),
  jobIds: z.array(z.coerce.number().int().positive()).optional(),
};

export const VERB_SCHEMAS = {
  "session.status": z.object({}),
  "jobs.picker.list": z.object({
    search: z.string().optional(),
    includeClosed: z.coerce.boolean().optional(),
    body: z.record(z.unknown()).optional(),
  }),
  "jobs.picker.select": z.object({
    jobId: z.coerce.number().int().positive().optional(),
    jobIds: z.array(z.coerce.number().int().positive()).optional(),
    body: z.record(z.unknown()).optional(),
  }),
  "jobs.picker.existing": z.object({}),
  "jobs.list": z.object({ ...page, ...jobScope, filters: z.unknown().optional() }),
  "jobs.get": z.object({ jobId: z.coerce.number().int().positive() }),
  "jobs.accountingLink": z.object({ jobId: z.coerce.number().int().positive() }),
  "jobs.create": z.object({ name: z.string().optional(), ...dry }),
  "jobs.update": z.object({ jobId: z.coerce.number().int().positive(), ...dry }),
  "leads.list": z.object({ ...page, ...jobScope }),
  "leads.get": z.object({ leadId: z.coerce.number().int().positive() }),
  "leads.defaults": z.object({}),
  "leads.create": z.object({ ...dry }),
  "leads.update": z.object({ leadId: z.coerce.number().int().positive(), ...dry }),
  "leads.convertToJob": z.object({ leadId: z.coerce.number().int().positive(), ...dry }),
  "contacts.list": z.object({ ...page, search: z.string().optional() }),
  "contacts.get": z.object({ contactId: z.coerce.number().int().nonnegative() }),
  "contacts.create": z.object({ ...dry }),
  "contacts.update": z.object({ contactId: z.coerce.number().int().positive(), ...dry }),
  "invoices.list": z.object({ ...page, ...jobScope, filters: z.unknown().optional() }),
  "invoices.get": z.object({
    invoiceId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive().optional(),
  }),
  "invoices.accountingStatus": z.object({
    invoiceId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive().optional(),
  }),
  "invoices.changes": z.object({
    invoiceId: z.coerce.number().int().positive(),
    entityType: z.coerce.number().int().optional(),
  }),
  "invoices.saveDraft": z.object({
    invoiceId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive().optional(),
    ...dry,
  }),
  "invoices.addLines": z.object({
    invoiceId: z.coerce.number().int().positive(),
    ...dry,
  }),
  "invoices.send": z.object({ invoiceId: z.coerce.number().int().positive(), ...dry }),
  "variations.list": z.object({ ...page, ...jobScope }),
  "variations.get": z.object({ changeOrderId: z.coerce.number().int().positive() }),
  "variations.saveDraftHeader": z.object({
    changeOrderId: z.coerce.number().int().positive(),
    header: z.record(z.unknown()).optional(),
    body: z.record(z.unknown()).optional(),
    ...dry,
  }),
  "variations.saveDraft": z.object({
    changeOrderId: z.coerce.number().int().positive(),
    header: z.record(z.unknown()).optional(),
    body: z.record(z.unknown()).optional(),
    ...dry,
  }),
  "variations.updateLine": z.object({
    changeOrderId: z.coerce.number().int().positive(),
    line: z.record(z.unknown()),
    skipGstRecompute: z.coerce.boolean().optional(),
    ...dry,
  }),
  "variations.addLines": z.object({
    changeOrderId: z.coerce.number().int().positive(),
    lines: z.array(z.record(z.unknown())).optional(),
    line: z.record(z.unknown()).optional(),
    skipGstRecompute: z.coerce.boolean().optional(),
    ...dry,
  }),
  "variations.deleteLines": z.object({
    changeOrderId: z.coerce.number().int().positive(),
    lineIds: z.array(z.coerce.number().int().positive()),
    skipGstRecompute: z.coerce.boolean().optional(),
    ...dry,
  }),
  "variations.recomputeGst": z.object({
    changeOrderId: z.coerce.number().int().positive().optional(),
    jobId: z.coerce.number().int().positive().optional(),
    costCode: z.coerce.number().int().positive().optional(),
    lines: z.array(z.record(z.unknown())).optional(),
    ...dry,
  }),
  "variations.createDraft": z.object({
    jobId: z.coerce.number().int().positive(),
    ...dry,
  }),
  "variations.notifyOwners": z.object({
    changeOrderId: z.coerce.number().int().positive(),
    ...dry,
  }),
  "bills.list": z.object({
    ...page,
    ...jobScope,
    statusFilter: z.string().optional(),
    sortColumn: z.string().optional(),
    sortDirection: z.string().optional(),
  }),
  "bills.tabCounts": z.object({ ...jobScope, search: z.string().optional() }),
  "bills.get": z.object({ billId: z.coerce.number().int().positive() }),
  "bills.file": z.object({
    fileId: z.coerce.number().int().positive(),
    preview: z.coerce.boolean().optional(),
  }),
  "bills.defaults": z.object({ jobId: z.coerce.number().int().positive() }),
  "bills.availablePurchaseOrders": z.object({
    vendorId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive(),
  }),
  "bills.create": z.object({
    jobId: z.coerce.number().int().positive(),
    vendorId: z.coerce.number().int().positive(),
    vendorName: z.string().optional(),
    vendorEmail: z.string().optional(),
    billNumber: z.string().max(19).optional(),
    billTitle: z.string().max(50).optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    description: z.string().optional(),
    lineItems: z.array(billLineSchema).optional(),
    attach: billAttachSchema.optional(),
    purchaseOrderId: z.coerce.number().int().optional(),
    ...billSendPayFlags,
    ...dry,
  }),
  "bills.update": z.object({
    billId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive().optional(),
    vendorId: z.coerce.number().int().positive().optional(),
    vendorName: z.string().optional(),
    vendorEmail: z.string().optional(),
    billNumber: z.string().max(19).optional(),
    billTitle: z.string().max(50).optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    description: z.string().optional(),
    lineItems: z.array(billLineSchema).optional(),
    attach: billAttachSchema.optional(),
    purchaseOrderId: z.coerce.number().int().optional(),
    ...billSendPayFlags,
    ...dry,
  }),
  "bills.attach": z.object({
    billId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive(),
    filename: z.string().min(1),
    contentBase64: z.string().min(1),
    contentType: z.string().optional(),
    ...dry,
  }),
  "bills.linkPurchaseOrder": z.object({
    billId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive(),
    purchaseOrderId: z.coerce.number().int(),
    ...dry,
  }),
  "bills.markReadyForPayment": z.object({ billId: z.coerce.number().int().positive(), ...dry }),
  "pos.list": z.object({ ...page, ...jobScope }),
  "pos.get": z.object({ purchaseOrderId: z.coerce.number().int().positive() }),
  "pos.linkedBills": z.object({ purchaseOrderId: z.coerce.number().int().positive() }),
  "pos.linkedBids": z.object({ purchaseOrderId: z.coerce.number().int().positive() }),
  "pos.approvals": z.object({ purchaseOrderId: z.coerce.number().int().positive() }),
  "pos.create": z.object({ jobId: z.coerce.number().int().positive(), ...dry }),
  "pos.update": z.object({ purchaseOrderId: z.coerce.number().int().positive(), ...dry }),
  "estimates.worksheet": z.object({ jobId: z.coerce.number().int().positive() }),
  "estimates.updateLine": z.object({
    jobId: z.coerce.number().int().positive(),
    ...dry,
  }),
  "estimates.addLines": z.object({
    jobId: z.coerce.number().int().positive(),
    ...dry,
  }),
  "estimates.sendToBudget": z.object({ jobId: z.coerce.number().int().positive(), ...dry }),
  "docs.root": z.object({ jobId: z.coerce.number().int().positive() }),
  "docs.folder": z.object({
    folderId: z.coerce.number().int().positive(),
    jobId: z.coerce.number().int().positive().optional(),
  }),
  "docs.file": z.object({
    fileId: z.coerce.number().int().positive(),
    preview: z.coerce.boolean().optional(),
  }),
  "docs.upload": z.object({
    jobId: z.coerce.number().int().positive(),
    folderId: z.coerce.number().int().positive().optional(),
    ...dry,
  }),
  "costing.header": z.object({ jobId: z.coerce.number().int().positive() }),
  "costing.views": z.object({ jobId: z.coerce.number().int().positive() }),
  "costing.lines": z.object({ jobId: z.coerce.number().int().positive() }),
  "costing.searchCostCodes": z.object({
    search: z.string(),
    ...jobScope,
  }),
  "sync.pull": z.object({ ...jobScope }),
  "sync.status": z.object({}),
} satisfies Record<string, z.ZodTypeAny>;

export type VerbName = keyof typeof VERB_SCHEMAS;

export function mcpShape(verb: string): z.ZodRawShape {
  const schema = VERB_SCHEMAS[verb as VerbName];
  if (schema instanceof z.ZodObject) return schema.shape;
  return {};
}

export function parseVerbArgs(verb: string, raw: Record<string, unknown>): Record<string, unknown> {
  const schema = VERB_SCHEMAS[verb as VerbName];
  if (!schema) return raw;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new GatewayError("validation", parsed.error.issues.map((i) => i.message).join("; "), {
      verb,
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }
  return parsed.data as Record<string, unknown>;
}

export function verbsMissingSchemas(): string[] {
  return VERBS.map((v) => v.verb).filter((verb) => !(verb in VERB_SCHEMAS));
}
