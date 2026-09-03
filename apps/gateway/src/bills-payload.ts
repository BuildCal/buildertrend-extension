/**
 * Captured Buildertrend bill create + save-draft + PDF attach (2 Sep 2026).
 *
 * Replay only the observed cookie-session HTTP. Do not invent GetBillMapping /
 * real PO-link, Ready-for-Payment, pay, accounting, approve, or ocr-upload.
 *
 * Product lock (not tenant-specific): bills are exclusive GST only. No GST
 * dummy line, no inclusive total as unitCost, no tax group.
 */

import { GatewayError } from "./errors.js";
import { asRecord, numberish } from "./grids.js";

export const BILL_DRAFT_STATUS = 9;
export const BILL_ENTITY_DOCUMENT_TYPE = 58;
export const BILL_TEMPFILE_MEDIA_TYPE = 61;
export const BILL_TEMPFILE_FIELD = "fileList";
export const BILL_PAGE_TYPE_ENUM = 17;
export const BILL_PRICE_TYPE = 2;
export const BILL_PERFORMING_USER_TYPE = 2;
export const BILL_NONE_PO_ID = -1;
export const BILL_NUMBER_MAX = 19;
export const BILL_TITLE_MAX = 50;
export const BILL_CREATE_COST_TYPES: number[] = [];
export const BILL_SAVE_DRAFT_COST_TYPES = [-1] as const;
export const BILL_LINE_MARKED_AS = -1;

export const EMPTY_ATTACHED_FILES = {
  removeDocs: [] as unknown[],
  attachDocs: [] as unknown[],
  updateDocs: [] as unknown[],
};

/** Keys copied from GET /api/v1/bills/defaultinfo at runtime. Never hard-code tenant values. */
export const DEFAULTINFO_SEED_KEYS = [
  "customFields",
  "lienWaiverFormId",
  "lienWaiverTemplateId",
  "unifiedDeadlineRequest",
  "description",
  "performingUserName",
  "performingUserEmail",
  "miscPaidToName",
  "varianceCount",
  "containerIsValid",
] as const;

export const BILL_SEND_PAY_FLAGS = [
  "readyForPayment",
  "payInFull",
  "payOnline",
  "sendToAccounting",
  "syncUpdatesToAccounting",
  "sendForApproval",
  "approveBill",
  "billToOwner",
] as const;

export type BillSendPayFlag = (typeof BILL_SEND_PAY_FLAGS)[number];

export interface BillLineInput {
  id?: number;
  title?: string;
  description?: string;
  costCodeId?: number;
  costCode?: number;
  unitCost?: number;
  builderCost?: number;
  exclusiveAmount?: number;
  quantity?: number;
  unitType?: string;
  taxGroupId?: unknown;
}

export const BILL_PO_LINK_DISCOVERY = {
  ui: "Bill — Purchase Order dropdown",
  click:
    "Select a real PO (not -- None Selected --) on a sandbox bill so GetBillMapping fires. Leave Draft. Do not mark ready for payment.",
  sandboxHint: "Project expense only. GetBillMapping was not in the 2 Sep 2026 capture.",
  expectedPaths: ["/api/v1/Bills/GetBillMapping"],
  notes:
    "GET /apix/v2/Bills/get-available-purchase-orders/{vendorId}/2/{jobId} is captured (read). Linking a real PO is not — do not guess isCreateNewFromPO: true.",
};

export function emptyAttachedFiles(): typeof EMPTY_ATTACHED_FILES {
  return {
    removeDocs: [],
    attachDocs: [],
    updateDocs: [],
  };
}

export function seedFromDefaultInfo(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw);
  const data = asRecord(root.data ?? root);
  if (data.bill && typeof data.bill === "object" && !Array.isArray(data.bill)) {
    return asRecord(data.bill);
  }
  if (data.defaults && typeof data.defaults === "object" && !Array.isArray(data.defaults)) {
    return asRecord(data.defaults);
  }
  return data;
}

export function copyDefaultInfoSeed(seed: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DEFAULTINFO_SEED_KEYS) {
    if (seed[key] !== undefined) out[key] = seed[key];
  }
  return out;
}

export function assertBillSendPayLocked(args: Record<string, unknown>, source = "args"): void {
  const raised = BILL_SEND_PAY_FLAGS.filter((flag) => args[flag] === true);
  if (raised.length) {
    throw new GatewayError(
      "send_disabled",
      `Bill send/pay/approve flags stay locked: ${raised.join(", ")}. Ready for Payment is a separate UI control.`,
      { flags: raised, source },
    );
  }
}

export function assertNoRealPurchaseOrder(args: Record<string, unknown>): void {
  const value = numberish(args.purchaseOrderId);
  if (value == null || value === BILL_NONE_PO_ID) return;
  throw new GatewayError(
    "not_captured",
    "Linking a real purchase order is not captured (GetBillMapping never fired). purchaseOrderId must be -1 (none).",
    { discovery: BILL_PO_LINK_DISCOVERY, purchaseOrderId: value },
  );
}

export function assertBillFieldLengths(args: Record<string, unknown>): void {
  const number = args.billNumber;
  if (typeof number === "string" && number.length > BILL_NUMBER_MAX) {
    throw new GatewayError(
      "validation",
      `billNumber maxLength is ${BILL_NUMBER_MAX}`,
      { length: number.length },
    );
  }
  const title = args.billTitle;
  if (typeof title === "string" && title.length > BILL_TITLE_MAX) {
    throw new GatewayError(
      "validation",
      `billTitle maxLength is ${BILL_TITLE_MAX}`,
      { length: title.length },
    );
  }
}

export function callerLineItems(args: Record<string, unknown>): BillLineInput[] {
  return Array.isArray(args.lineItems) ? (args.lineItems as BillLineInput[]) : [];
}

export function exclusiveAmountOf(line: BillLineInput): number {
  const value = line.exclusiveAmount ?? line.unitCost ?? line.builderCost ?? 0;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function costCodeOf(line: BillLineInput): number | undefined {
  return numberish(line.costCodeId ?? line.costCode);
}

export function rejectGstDummyLines(lines: BillLineInput[]): void {
  for (const line of lines) {
    const title = String(line.title ?? "");
    if (/4000\s*GST/i.test(title) || /\[GST001\]/i.test(title)) {
      throw new GatewayError(
        "validation",
        "Buildertrend bills are exclusive GST only. Do not send a 4000 GST dummy line (that pattern is for owner change-orders).",
        { title },
      );
    }
    if (line.taxGroupId != null && line.taxGroupId !== "") {
      throw new GatewayError(
        "validation",
        "Do not send a tax group on a bill. Bills are exclusive dollars only.",
        { taxGroupId: line.taxGroupId },
      );
    }
  }
}

function performingUser(args: Record<string, unknown>, seed: Record<string, unknown>) {
  const vendorId = numberish(args.vendorId) ?? numberish(seed.performingUserId);
  const fromOptions = vendorNameFromSeed(seed, vendorId);
  const name =
    (typeof args.vendorName === "string" && args.vendorName) ||
    (typeof seed.performingUserName === "string" && seed.performingUserName) ||
    fromOptions.name ||
    "";
  const email =
    (typeof args.vendorEmail === "string" && args.vendorEmail) ||
    (typeof seed.performingUserEmail === "string" && seed.performingUserEmail) ||
    fromOptions.email ||
    "";
  return {
    performingUserId: vendorId,
    performingUserType: BILL_PERFORMING_USER_TYPE,
    performingUserName: name,
    performingUserEmail: email,
    assignedToInfo: {
      ...asRecord(seed.assignedToInfo),
      id: vendorId,
      name,
      email,
      userType: BILL_PERFORMING_USER_TYPE,
    },
  };
}

function vendorNameFromSeed(
  seed: Record<string, unknown>,
  vendorId: number | undefined,
): { name: string; email: string } {
  if (vendorId == null) return { name: "", email: "" };
  const assigned = asRecord(seed.assignedTo);
  const options = Array.isArray(assigned.options) ? assigned.options : [];
  for (const option of options) {
    const row = asRecord(option);
    if (numberish(row.id) === vendorId) {
      const extra = asRecord(row.extraData);
      return {
        name: String(row.name ?? row.title ?? ""),
        email: String(row.email ?? extra.email ?? ""),
      };
    }
  }
  return { name: "", email: "" };
}

function deadlineRequest(
  args: Record<string, unknown>,
  seed: Record<string, unknown>,
): Record<string, unknown> {
  const seeded = asRecord(seed.unifiedDeadlineRequest);
  return {
    isDeadlineLinked: seeded.isDeadlineLinked ?? false,
    deadlineOffset: seeded.deadlineOffset ?? 0,
    deadlineIsAfterLinkedItem: seeded.deadlineIsAfterLinkedItem ?? true,
    scheduleItemSelectedValue: seeded.scheduleItemSelectedValue ?? -1,
    dueDate: args.dueDate ?? seeded.dueDate ?? null,
    paymentTerms: seeded.paymentTerms ?? null,
  };
}

export function createLinePayload(line: BillLineInput = {}): Record<string, unknown> {
  const costCode = costCodeOf(line);
  return {
    id: 0,
    costCodeId: costCode ?? null,
    costCode: costCode ?? null,
    unitCost: 0,
    quantity: line.quantity ?? 1,
    unitType: line.unitType ?? "ea",
    builderCost: 0,
    title: line.title ?? "",
    description: line.description ?? "",
    internalNotes: "",
    catalogItemId: null,
    pageType: "",
    pageTypeEnum: BILL_PAGE_TYPE_ENUM,
    shouldUseAutoUpdates: false,
    varianceCode: 0,
    parentId: null,
    costTypes: [...BILL_CREATE_COST_TYPES],
    markedAs: BILL_LINE_MARKED_AS,
  };
}

export function saveDraftLinePayload(
  createdLine: Record<string, unknown>,
  caller: BillLineInput = {},
): Record<string, unknown> {
  const exclusive = exclusiveAmountOf(caller);
  const costCode = costCodeOf(caller) ?? numberish(createdLine.costCodeId ?? createdLine.costCode);
  const id = numberish(caller.id) ?? numberish(createdLine.id) ?? 0;
  return {
    ...createdLine,
    id,
    costCodeId: costCode ?? createdLine.costCodeId ?? null,
    costCode: costCode ?? createdLine.costCode ?? null,
    unitCost: exclusive,
    builderCost: exclusive,
    quantity: caller.quantity ?? createdLine.quantity ?? 1,
    unitType: caller.unitType ?? createdLine.unitType ?? "ea",
    title: caller.title ?? createdLine.title ?? "",
    description: caller.description ?? createdLine.description ?? "",
    pageTypeEnum: createdLine.pageTypeEnum ?? BILL_PAGE_TYPE_ENUM,
    costTypes: [...BILL_SAVE_DRAFT_COST_TYPES],
    markedAs: createdLine.markedAs ?? BILL_LINE_MARKED_AS,
  };
}

function createLines(
  args: Record<string, unknown>,
  seed: Record<string, unknown>,
): Record<string, unknown>[] {
  const caller = callerLineItems(args);
  rejectGstDummyLines(caller);
  if (caller.length) return caller.map((line) => createLinePayload(line));
  const seeded = Array.isArray(seed.lineItems) ? (seed.lineItems as BillLineInput[]) : [];
  if (seeded.length) return seeded.map((line) => createLinePayload(line));
  return [createLinePayload({})];
}

function saveDraftLines(
  args: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown>[] {
  const caller = callerLineItems(args);
  rejectGstDummyLines(caller);
  const existing = Array.isArray(current.lineItems)
    ? current.lineItems.map((row) => asRecord(row))
    : [];
  if (!caller.length) {
    return existing.map((line) => saveDraftLinePayload(line, line as BillLineInput));
  }
  return caller.map((line, index) => saveDraftLinePayload(existing[index] ?? {}, line));
}

function lockWriteFlags(body: Record<string, unknown>): Record<string, unknown> {
  for (const flag of BILL_SEND_PAY_FLAGS) {
    body[flag] = false;
  }
  body.purchaseOrderId = BILL_NONE_PO_ID;
  body.isCreateNewFromPO = false;
  body.saveDraftToJob = false;
  body.status = BILL_DRAFT_STATUS;
  body.attachedFiles = emptyAttachedFiles();
  body.isSendToAccountingDirty = false;
  body.priceType = BILL_PRICE_TYPE;
  body.performingUserType = BILL_PERFORMING_USER_TYPE;
  return body;
}

/**
 * POST /api/v1/bills?jobId={jobId} body.
 * Amounts stay 0 — exclusive dollars go on the subsequent save-draft PUT.
 */
export function billCreatePayload(
  args: Record<string, unknown>,
  jobId: number,
  seedRaw: unknown = {},
): Record<string, unknown> {
  assertBillSendPayLocked(args);
  assertNoRealPurchaseOrder(args);
  assertBillFieldLengths(args);
  const seed = seedFromDefaultInfo(seedRaw);
  const user = performingUser(args, seed);
  const body: Record<string, unknown> = {
    ...copyDefaultInfoSeed(seed),
    billNumber: args.billNumber ?? seed.billNumber ?? "",
    billTitle: args.billTitle ?? seed.billTitle ?? "",
    invoiceDate: args.invoiceDate ?? seed.invoiceDate ?? null,
    ...user,
    miscPaidToName: seed.miscPaidToName ?? "",
    unifiedDeadlineRequest: deadlineRequest(args, seed),
    attachedFiles: emptyAttachedFiles(),
    lineItems: createLines(args, seed),
    description: args.description ?? seed.description ?? "",
    purchaseOrderId: BILL_NONE_PO_ID,
    jobId,
    selectedJobId: jobId,
    billId: 0,
    status: BILL_DRAFT_STATUS,
    documentType: 0,
    containerIsValid: seed.containerIsValid ?? true,
    isCreateNewFromPO: false,
    saveAsDraft: false,
    saveDraftToJob: false,
    priceType: BILL_PRICE_TYPE,
    billLineItems: [],
    selectedApprovers: [],
    resetApprovalGlobalUserIds: [],
    approvalIdsToDelete: [],
    approvers: [],
    approvalCommentNotificationUsers: [],
    approvalCommentMentionableUsers: [],
    varianceCount: seed.varianceCount ?? 0,
  };
  return lockWriteFlags(body);
}

/**
 * PUT /api/v1/bills/{billId} Save-draft body.
 * Exclusive unitCost/builderCost, costTypes [-1], saveAsDraft true.
 */
export function billSaveDraftPayload(
  args: Record<string, unknown>,
  currentRaw: unknown,
  billId: number,
): Record<string, unknown> {
  assertBillSendPayLocked(args);
  assertNoRealPurchaseOrder(args);
  assertBillFieldLengths(args);
  const current = seedFromDefaultInfo(currentRaw);
  const jobId = numberish(args.jobId) ?? numberish(current.jobId) ?? numberish(current.selectedJobId);
  const user = performingUser(args, current);
  const body: Record<string, unknown> = {
    ...current,
    ...user,
    billNumber: args.billNumber ?? current.billNumber,
    billTitle: args.billTitle ?? current.billTitle,
    invoiceDate: args.invoiceDate ?? current.invoiceDate ?? null,
    description: args.description ?? current.description ?? "",
    unifiedDeadlineRequest: deadlineRequest(args, current),
    lineItems: saveDraftLines(args, current),
    jobId,
    selectedJobId: jobId,
    billId,
    saveAsDraft: true,
    saveDraftToJob: false,
    status: BILL_DRAFT_STATUS,
    attachedFiles: emptyAttachedFiles(),
    purchaseOrderId: BILL_NONE_PO_ID,
    isCreateNewFromPO: false,
    priceType: BILL_PRICE_TYPE,
  };
  return lockWriteFlags(body);
}

export function billEntityDocsPayload(opts: {
  builderId: number;
  jobId: number;
  billId: number;
  tempDoc: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    builderId: opts.builderId,
    jobId: opts.jobId,
    id: [opts.billId],
    documentType: BILL_ENTITY_DOCUMENT_TYPE,
    notifyBuilder: false,
    notifyOwner: false,
    notifySubs: false,
    attachedFiles: {
      removeDocs: [],
      attachDocs: [opts.tempDoc],
      updateDocs: [],
    },
  };
}

export function billIdFrom(payload: unknown): number | undefined {
  const data = seedFromDefaultInfo(payload);
  return numberish(data.id) ?? numberish(data.billId);
}

export function attachArgsOf(
  args: Record<string, unknown>,
): { filename: string; contentBase64: string; contentType: string } | undefined {
  const nested = asRecord(args.attach);
  const filename = String(nested.filename ?? args.filename ?? "");
  const contentBase64 = String(nested.contentBase64 ?? args.contentBase64 ?? "");
  if (!filename || !contentBase64) return undefined;
  return {
    filename,
    contentBase64,
    contentType: String(nested.contentType ?? args.contentType ?? "application/pdf"),
  };
}
