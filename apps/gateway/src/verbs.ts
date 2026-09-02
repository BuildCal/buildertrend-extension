import { CONTENT_JSON, CONTENT_MERGE_PATCH, unwrapData } from "./adapter.js";
import { DRAFT_APPROVAL_STATUS } from "./config.js";
import { GatewayError } from "./errors.js";
import {
  asRecord,
  asRows,
  buildGridBody,
  extractGridRows,
  jobIdsFrom,
  numberish,
  pickId,
} from "./grids.js";
import {
  assertNoForbiddenGstAddFields,
  isDuplicateInvoiceMessage,
  pickGstCostCodeFromSearch,
  recomputeGstDummyLine,
  type VariationLineLike,
} from "./gst.js";
import { hashEntity, type MirrorEntity, type MirrorRecord } from "./store.js";
import {
  assertBillFieldLengths,
  assertBillSendPayLocked,
  assertNoRealPurchaseOrder,
  attachArgsOf,
  BILL_NONE_PO_ID,
  BILL_PO_LINK_DISCOVERY,
  BILL_TEMPFILE_FIELD,
  BILL_TEMPFILE_MEDIA_TYPE,
  billCreatePayload,
  billEntityDocsPayload,
  billIdFrom,
  billSaveDraftPayload,
  seedFromDefaultInfo,
} from "./bills-payload.js";
import {
  bt,
  btJson,
  guardConflict,
  optionalNumber,
  registerVerb,
  requireNumber,
  type VerbContext,
} from "./invoke.js";

function dataOf(payload: unknown): Record<string, unknown> {
  const unwrapped = unwrapData(payload);
  return asRecord(unwrapped);
}

function linesFromVariation(payload: unknown): VariationLineLike[] {
  const data = dataOf(payload);
  const candidates = [
    data.lineItems,
    data.lines,
    data.changeOrderLineItems,
    asRecord(data.changeOrder).lineItems,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as VariationLineLike[];
  }
  return [];
}

function stripForbiddenGstFields(line: Record<string, unknown>): Record<string, unknown> {
  const out = { ...line };
  for (const field of ["costCodeId", "costItemId", "lineItemType", "itemTitle", "markupColumn"]) {
    delete out[field];
  }
  return out;
}

async function maybeSelectJob(ctx: VerbContext, jobId?: number): Promise<void> {
  if (!jobId) return;
  await btJson(ctx, {
    method: "POST",
    path: "/api/jobpicker/SetJobPickerData",
    json: ctx.args.pickerBody ?? {
      jobIds: [jobId],
      selectedJobId: jobId,
    },
  });
}

async function filters(ctx: VerbContext, id: number): Promise<unknown> {
  try {
    return unwrapData(await btJson(ctx, { method: "GET", path: `/api/Filters/${id}` }));
  } catch {
    return {};
  }
}

function mirrorFromRow(
  entityType: MirrorEntity,
  builderId: number,
  row: Record<string, unknown>,
): MirrorRecord | null {
  const externalId = pickId(row);
  if (!externalId) return null;
  const title = String(
    row.name ?? row.jobName ?? row.title ?? row.billTitle ?? row.invoiceNumber ?? row.leadName ?? "",
  );
  const jobId = numberish(row.jobId ?? row.jobID ?? row.jobsiteId);
  const amount = numberish(
    asRecord(row.paymentAmount).value ?? row.paymentAmount ?? row.total ?? row.ownerPrice ?? row.amount,
  );
  return {
    entityType,
    externalId,
    builderId,
    jobId,
    title: title || undefined,
    status: row.status != null ? String(row.status) : undefined,
    amount,
    extra: {
      jobNumber: row.jobNumber,
      address: row.street ?? row.address,
      poNumber: row.poNumber ?? row.purchaseOrderNumber,
      billNumber: asRecord(row.billNumberLink).title ?? row.billNumber,
      paymentStatus: asRecord(row.purchaseOrderPaymentStatus).paymentStatus ?? row.paymentStatus,
      email: row.email ?? row.emailAddress,
      phone: row.phone ?? row.phoneNumber,
      company: row.company ?? row.companyName,
    },
    hash: hashEntity(row),
  };
}

async function upsertRows(
  ctx: VerbContext,
  entityType: MirrorEntity,
  rows: unknown[],
): Promise<number> {
  let count = 0;
  for (const row of asRows(rows)) {
    const record = mirrorFromRow(entityType, ctx.config.builderId, row);
    if (!record) continue;
    await ctx.store.upsertMirror(record);
    await ctx.store.setSyncState({
      entityType,
      externalId: record.externalId,
      lastPulledHash: record.hash,
      lastPulledAt: new Date().toISOString(),
    });
    count += 1;
  }
  return count;
}

registerVerb("session.status", async (ctx) => {
  const init = await btJson(ctx, { method: "GET", path: "/apix/v2/context/init" });
  const globalInfo = await btJson(ctx, { method: "GET", path: "/api/AccountInfo/GlobalInfo" });
  const info = dataOf(globalInfo);
  const builderId = numberish(info.builderId ?? info.BuilderId) ?? ctx.config.builderId;
  if (builderId) ctx.config.builderId = builderId;
  return {
    authenticated: true,
    builderId,
    init: unwrapData(init),
    globalInfo: info,
  };
});

registerVerb("jobs.picker.list", async (ctx) => {
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/jobpicker/GetJobPickerData",
    json: ctx.args.body ?? {
      searchText: ctx.args.search ?? "",
      includeClosedJobs: Boolean(ctx.args.includeClosed),
    },
  });
  return { raw: unwrapData(payload), rows: extractGridRows(payload) };
});

registerVerb("jobs.picker.select", async (ctx) => {
  const jobId = optionalJob(ctx);
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/jobpicker/SetJobPickerData",
    json:
      ctx.args.body ??
      {
        jobIds: jobIdsFrom(ctx.args).length ? jobIdsFrom(ctx.args) : jobId ? [jobId] : [],
        selectedJobId: jobId,
      },
  });
  return unwrapData(payload);
});

registerVerb("jobs.picker.existing", async (ctx) => {
  const payload = await btJson(ctx, { method: "GET", path: "/api/jobpicker/GetExistingJobList" });
  const data = dataOf(payload);
  const jobs = Array.isArray(data.jobs) ? data.jobs : extractGridRows(payload);
  await upsertRows(ctx, "job", jobs);
  return { raw: data, jobs };
});

registerVerb("jobs.list", async (ctx) => {
  const gridFilters = ctx.args.filters ?? (await filters(ctx, 33));
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/Jobsites/Grid",
    json: buildGridBody({ ...ctx.args, filters: gridFilters }),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "job", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("jobs.get", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  const payload = await btJson(ctx, { method: "GET", path: `/api/jobsites/${jobId}` });
  const data = unwrapData(payload);
  await upsertRows(ctx, "job", [asRecord(data)]);
  return data;
});

registerVerb("jobs.accountingLink", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(
    await btJson(ctx, { method: "GET", path: `/api/Accounting/${jobId}/LinkedEntityInfo` }),
  );
});

registerVerb("leads.list", async (ctx) => {
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/Leads/Grid",
    json: buildGridBody(ctx.args),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "lead", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("leads.get", async (ctx) => {
  const id = requireNumber(ctx.args, "leadId");
  const payload = await btJson(ctx, { method: "GET", path: `/api/Leads/${id}` });
  const data = unwrapData(payload);
  await upsertRows(ctx, "lead", [asRecord(data)]);
  return data;
});

registerVerb("leads.defaults", async (ctx) => {
  return unwrapData(await btJson(ctx, { method: "GET", path: "/api/Leads/Defaults" }));
});

registerVerb("contacts.list", async (ctx) => {
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/Contacts/Grid",
    json: buildGridBody(ctx.args),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "contact", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("contacts.get", async (ctx) => {
  const id = requireNumber(ctx.args, "contactId");
  const payload = await btJson(ctx, { method: "GET", path: `/api/Contacts/${id}/Details` });
  return unwrapData(payload);
});

registerVerb("invoices.list", async (ctx) => {
  await maybeSelectJob(ctx, optionalJob(ctx));
  const gridFilters = ctx.args.filters ?? (await filters(ctx, 39));
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/OwnerInvoices/Grid",
    json: buildGridBody({ ...ctx.args, filters: gridFilters }),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "invoice", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("invoices.get", async (ctx) => {
  const invoiceId = requireNumber(ctx.args, "invoiceId");
  const jobId = optionalJob(ctx);
  const payload = await btJson(ctx, {
    method: "GET",
    path: "/apix/v3/Invoices/get-invoice",
    query: { invoiceId, job: jobId ?? "" },
  });
  const data = unwrapData(payload);
  const message = String(asRecord(data).message ?? "");
  if (isDuplicateInvoiceMessage(message)) {
    throw new GatewayError("duplicate_invoice_id", message);
  }
  await upsertRows(ctx, "invoice", [asRecord(data)]);
  return data;
});

registerVerb("invoices.accountingStatus", async (ctx) => {
  const invoiceId = requireNumber(ctx.args, "invoiceId");
  const jobId = optionalJob(ctx);
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: "/api/accounting/GetEntityAccountingStatus",
      query: { entityId: invoiceId, entityType: 3, jobId: jobId ?? "" },
    }),
  );
});

registerVerb("invoices.changes", async (ctx) => {
  const entityId = requireNumber(ctx.args, "invoiceId");
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: "/apix/v2/EntityChangeTracking/entity-changes",
      query: {
        entityId,
        entityType: numberish(ctx.args.entityType) ?? 3,
      },
    }),
  );
});

registerVerb("variations.list", async (ctx) => {
  await maybeSelectJob(ctx, optionalJob(ctx));
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/ChangeOrders/Grid",
    json: buildGridBody(ctx.args),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "variation", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("variations.get", async (ctx) => {
  const id = requireNumber(ctx.args, "changeOrderId");
  const payload = await btJson(ctx, {
    method: "GET",
    path: `/api/ChangeOrders/${id}/changeOrder`,
    query: { presentingScreen: 0, isMobile: false },
  });
  const data = unwrapData(payload);
  await upsertRows(ctx, "variation", [asRecord(data)]);
  return data;
});

registerVerb("variations.saveDraftHeader", saveDraftHeader);
registerVerb("variations.saveDraft", saveDraftHeader);

async function saveDraftHeader(ctx: VerbContext): Promise<unknown> {
  const id = requireNumber(ctx.args, "changeOrderId");
  const current = await btJson(ctx, {
    method: "GET",
    path: `/api/ChangeOrders/${id}/changeOrder`,
    query: { presentingScreen: 0, isMobile: false },
  });
  await guardConflict(ctx, "variation", String(id), unwrapData(current));
  const header = asRecord(ctx.args.header ?? ctx.args.body ?? {});
  header.approvalStatus = DRAFT_APPROVAL_STATUS;
  if (header.taxGroupId === -1) {
    throw new GatewayError("tax_engine_unusable", "Do not send taxGroupId -1 on change orders.");
  }
  const payload = await btJson(ctx, {
    method: "PUT",
    path: `/api/ChangeOrders/${id}/Update`,
    json: header,
  });
  await refreshVariationSync(ctx, id);
  return unwrapData(payload);
}

registerVerb("variations.updateLine", async (ctx) => {
  const changeOrderId = requireNumber(ctx.args, "changeOrderId");
  const line = asRecord(ctx.args.line ?? ctx.args.body);
  if (!line || Object.keys(line).length === 0) {
    throw new GatewayError("validation", "line is required");
  }
  if (line.taxGroupId === -1) {
    throw new GatewayError("tax_engine_unusable", "Do not send taxGroupId -1 on change-order lines.");
  }
  const current = await loadVariation(ctx, changeOrderId);
  await guardConflict(ctx, "variation", String(changeOrderId), current);
  const payload = await btJson(ctx, {
    method: "PUT",
    path: "/apix/v2/LineItems/update-change-order-line-item",
    contentType: CONTENT_MERGE_PATCH,
    json: { changeOrderId, ...line },
  });
  await refreshVariationSync(ctx, changeOrderId);
  const gst = ctx.args.skipGstRecompute === true ? undefined : await applyGst(ctx, changeOrderId);
  return { raw: unwrapData(payload), gst };
});

registerVerb("variations.addLines", async (ctx) => {
  const changeOrderId = requireNumber(ctx.args, "changeOrderId");
  const lines = (Array.isArray(ctx.args.lines) ? ctx.args.lines : [ctx.args.line])
    .filter(Boolean)
    .map((line) => stripForbiddenGstFields(asRecord(line)));
  if (!lines.length) throw new GatewayError("validation", "lines is required");
  for (const line of lines) {
    const forbidden = assertNoForbiddenGstAddFields(line);
    if (forbidden.length) {
      throw new GatewayError("validation", `Do not send ${forbidden.join(", ")} on CO line add`, {
        forbidden,
      });
    }
    if (line.taxGroupId === -1) {
      throw new GatewayError("tax_engine_unusable", "Do not send taxGroupId -1.");
    }
  }
  const current = await loadVariation(ctx, changeOrderId);
  await guardConflict(ctx, "variation", String(changeOrderId), current);
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/apix/v2/LineItems/add-change-order-line-items",
    contentType: CONTENT_JSON,
    json: { changeOrderId, lineItems: lines, pageTypeEnum: 6 },
  });
  await refreshVariationSync(ctx, changeOrderId);
  const gst = ctx.args.skipGstRecompute === true ? undefined : await applyGst(ctx, changeOrderId);
  return { raw: unwrapData(payload), gst };
});

registerVerb("variations.deleteLines", async (ctx) => {
  const changeOrderId = requireNumber(ctx.args, "changeOrderId");
  const lineIds = (ctx.args.lineIds as number[] | undefined) ?? [];
  if (!lineIds.length) throw new GatewayError("validation", "lineIds is required");
  const current = await loadVariation(ctx, changeOrderId);
  await guardConflict(ctx, "variation", String(changeOrderId), current);
  const payload = await btJson(ctx, {
    method: "DELETE",
    path: "/apix/v2/LineItems/delete-change-order-line-items",
    json: { changeOrderId, lineItemIds: lineIds },
  });
  await refreshVariationSync(ctx, changeOrderId);
  const gst = ctx.args.skipGstRecompute === true ? undefined : await applyGst(ctx, changeOrderId);
  return { raw: unwrapData(payload), gst };
});

registerVerb("variations.recomputeGst", async (ctx) => {
  const provided = Array.isArray(ctx.args.lines) ? (ctx.args.lines as VariationLineLike[]) : undefined;
  if (provided) {
    const costCode = numberish(ctx.args.costCode) ?? (await resolveGstCostCode(ctx, optionalJob(ctx)));
    return recomputeGstDummyLine(provided, costCode);
  }
  const changeOrderId = requireNumber(ctx.args, "changeOrderId");
  return applyGst(ctx, changeOrderId);
});

registerVerb("bills.list", async (ctx) => {
  await maybeSelectJob(ctx, optionalJob(ctx));
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/v1/bills/grid",
    json: billGridBody(ctx),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "bill", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("bills.tabCounts", async (ctx) => {
  return unwrapData(
    await btJson(ctx, {
      method: "POST",
      path: "/apix/v2/Bills/tab-counts",
      json: {
        filters: ctx.args.filters ?? {},
        jobIds: jobIdsFrom(ctx.args),
      },
    }),
  );
});

registerVerb("bills.get", async (ctx) => {
  const id = requireNumber(ctx.args, "billId");
  const payload = await btJson(ctx, { method: "GET", path: `/api/v1/bills/${id}` });
  const data = unwrapData(payload);
  await upsertRows(ctx, "bill", [asRecord(data)]);
  return data;
});

registerVerb("bills.file", async (ctx) => {
  const id = requireNumber(ctx.args, "fileId");
  const preview = ctx.args.preview === true;
  const res = await bt(ctx, {
    method: "GET",
    path: preview ? `/api/files/${id}/preview` : `/api/files/${id}`,
    raw: true,
  });
  return {
    status: res.status,
    contentType: res.contentType,
    bodyBase64: res.bodyBase64,
  };
});

registerVerb("bills.defaults", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: "/api/v1/bills/defaultinfo",
      query: { jobId, isBillRemainingAction: false },
    }),
  );
});

registerVerb("bills.availablePurchaseOrders", async (ctx) => {
  const vendorId = requireNumber(ctx.args, "vendorId");
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: `/apix/v2/Bills/get-available-purchase-orders/${vendorId}/2/${jobId}`,
    }),
  );
});

registerVerb("bills.create", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  requireNumber(ctx.args, "vendorId");
  assertBillSendPayLocked(ctx.args);
  assertNoRealPurchaseOrder(ctx.args);
  assertBillFieldLengths(ctx.args);
  const defaults = await btJson(ctx, {
    method: "GET",
    path: "/api/v1/bills/defaultinfo",
    query: { jobId, isBillRemainingAction: false },
  });
  const createBody = billCreatePayload(ctx.args, jobId, defaults);
  const createdRaw = await btJson(ctx, {
    method: "POST",
    path: "/api/v1/bills",
    query: { jobId },
    json: createBody,
  });
  const created = seedFromDefaultInfo(createdRaw);
  const billId = billIdFrom(created);
  if (billId == null) {
    throw new GatewayError("bt_error", "Bill create did not return an id", {
      keys: Object.keys(created),
    });
  }
  const saveBody = billSaveDraftPayload(ctx.args, created, billId);
  const savedRaw = await btJson(ctx, {
    method: "PUT",
    path: `/api/v1/bills/${billId}`,
    json: saveBody,
  });
  const saved = seedFromDefaultInfo(savedRaw);
  await upsertRows(ctx, "bill", [asRecord(saved)]);
  const attach = attachArgsOf(ctx.args);
  let attached: unknown;
  if (attach) {
    attached = await attachBillPdf(ctx, jobId, billId, attach);
  }
  return {
    billId,
    status: 9,
    statusText: "Draft",
    raw: saved,
    created: created,
    attached,
    purchaseOrderId: BILL_NONE_PO_ID,
    isCreateNewFromPO: false,
  };
});

registerVerb("bills.update", async (ctx) => {
  const billId = requireNumber(ctx.args, "billId");
  assertBillSendPayLocked(ctx.args);
  assertNoRealPurchaseOrder(ctx.args);
  assertBillFieldLengths(ctx.args);
  const currentRaw = await btJson(ctx, { method: "GET", path: `/api/v1/bills/${billId}` });
  const current = seedFromDefaultInfo(currentRaw);
  await guardConflict(ctx, "bill", String(billId), current);
  const saveBody = billSaveDraftPayload(ctx.args, current, billId);
  const savedRaw = await btJson(ctx, {
    method: "PUT",
    path: `/api/v1/bills/${billId}`,
    json: saveBody,
  });
  const saved = seedFromDefaultInfo(savedRaw);
  await upsertRows(ctx, "bill", [asRecord(saved)]);
  await ctx.store.setSyncState({
    entityType: "bill",
    externalId: String(billId),
    lastPulledHash: hashEntity(saved),
    lastPulledAt: new Date().toISOString(),
  });
  const jobId = optionalNumber(ctx.args, "jobId") ?? numberish(current.jobId);
  const attach = attachArgsOf(ctx.args);
  let attached: unknown;
  if (attach && jobId) {
    attached = await attachBillPdf(ctx, jobId, billId, attach);
  } else if (attach && !jobId) {
    throw new GatewayError("validation", "jobId is required to attach a PDF on bills.update");
  }
  return { billId, status: 9, raw: saved, attached };
});

registerVerb("bills.attach", async (ctx) => {
  const billId = requireNumber(ctx.args, "billId");
  const jobId = requireNumber(ctx.args, "jobId");
  const attach = attachArgsOf(ctx.args);
  if (!attach) {
    throw new GatewayError("validation", "filename and contentBase64 are required");
  }
  return attachBillPdf(ctx, jobId, billId, attach);
});

registerVerb("bills.linkPurchaseOrder", async () => {
  throw new GatewayError(
    "not_captured",
    "Linking a real purchase order is not captured (GetBillMapping never fired).",
    { discovery: BILL_PO_LINK_DISCOVERY },
  );
});

registerVerb("pos.list", async (ctx) => {
  await maybeSelectJob(ctx, optionalJob(ctx));
  const payload = await btJson(ctx, {
    method: "POST",
    path: "/api/PurchaseOrders/Grid",
    json: buildGridBody(ctx.args),
  });
  const rows = extractGridRows(payload);
  await upsertRows(ctx, "po", rows);
  return { raw: unwrapData(payload), rows };
});

registerVerb("pos.get", async (ctx) => {
  const id = requireNumber(ctx.args, "purchaseOrderId");
  const payload = await btJson(ctx, { method: "GET", path: `/api/PurchaseOrders/${id}` });
  const data = unwrapData(payload);
  await upsertRows(ctx, "po", [asRecord(data)]);
  return data;
});

registerVerb("pos.linkedBills", async (ctx) => {
  const id = requireNumber(ctx.args, "purchaseOrderId");
  return unwrapData(
    await btJson(ctx, { method: "GET", path: `/api/PurchaseOrders/${id}/LinkedBills` }),
  );
});

registerVerb("pos.linkedBids", async (ctx) => {
  const id = requireNumber(ctx.args, "purchaseOrderId");
  return unwrapData(
    await btJson(ctx, { method: "GET", path: `/api/PurchaseOrders/${id}/linked-bids` }),
  );
});

registerVerb("pos.approvals", async (ctx) => {
  const id = requireNumber(ctx.args, "purchaseOrderId");
  return unwrapData(
    await btJson(ctx, { method: "GET", path: `/api/PurchaseOrders/${id}/EntityApprovals` }),
  );
});

registerVerb("estimates.worksheet", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  const payload = await btJson(ctx, { method: "GET", path: `/api/Proposals/${jobId}/Worksheet` });
  const data = asRecord(unwrapData(payload));
  return {
    ...data,
    worksheetLocked: Boolean(data.worksheetLocked),
    isSentToBudget: Boolean(data.isSentToBudget),
  };
});

registerVerb("docs.root", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: "/api/MediaFolders/MainDirectory",
      query: { jobId, mediaType: 1 },
    }),
  );
});

registerVerb("docs.folder", async (ctx) => {
  const folderId = requireNumber(ctx.args, "folderId");
  const jobId = optionalJob(ctx);
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: "/api/MediaFolders/GetDirectoryDetails",
      query: { folderId, jobId: jobId ?? "", mediaType: 1 },
    }),
  );
});

registerVerb("docs.file", async (ctx) => {
  const id = requireNumber(ctx.args, "fileId");
  const preview = ctx.args.preview === true;
  const res = await bt(ctx, {
    method: "GET",
    path: preview ? `/api/files/${id}/preview` : `/api/files/${id}`,
    raw: true,
  });
  return { status: res.status, contentType: res.contentType, bodyBase64: res.bodyBase64 };
});

registerVerb("costing.header", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(
    await btJson(ctx, {
      method: "POST",
      path: "/apix/v2/JobCostingBudget",
      json: ctx.args.body ?? { jobId },
    }),
  );
});

registerVerb("costing.views", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(await btJson(ctx, { method: "GET", path: `/apix/v3/JobCostingBudget/${jobId}` }));
});

registerVerb("costing.lines", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  return unwrapData(
    await btJson(ctx, {
      method: "POST",
      path: "/apix/v2/JobCostingBudget/line-items",
      json: ctx.args.body ?? { jobId },
    }),
  );
});

registerVerb("costing.searchCostCodes", async (ctx) => {
  const search = String(ctx.args.search ?? "");
  return unwrapData(
    await btJson(ctx, {
      method: "POST",
      path: "/api/Search",
      query: { limit: 10 },
      json: {
        search,
        jobIds: jobIdsFrom(ctx.args),
        categories: [30],
      },
    }),
  );
});

registerVerb("sync.pull", async (ctx) => {
  const counts: Record<string, number> = {};
  const errors: { step: string; error: string }[] = [];
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["jobs", async () => invokeLocal(ctx, "jobs.picker.existing")],
    ["invoices", async () => invokeLocal(ctx, "invoices.list")],
    ["variations", async () => invokeLocal(ctx, "variations.list")],
    ["leads", async () => invokeLocal(ctx, "leads.list")],
    ["contacts", async () => invokeLocal(ctx, "contacts.list")],
    ["pos", async () => invokeLocal(ctx, "pos.list")],
    ["bills", async () => invokeLocal(ctx, "bills.list")],
  ];
  for (const [step, run] of steps) {
    try {
      const result = asRecord(await run());
      const rows = Array.isArray(result.rows)
        ? result.rows
        : Array.isArray(result.jobs)
          ? result.jobs
          : [];
      counts[step] = rows.length;
    } catch (err) {
      errors.push({ step, error: err instanceof Error ? err.message : String(err) });
      counts[step] = 0;
    }
  }
  return { counts, errors, ok: errors.length === 0 };
});

registerVerb("sync.status", async (ctx) => {
  const entities: MirrorEntity[] = ["job", "lead", "contact", "invoice", "variation", "po", "bill"];
  const mirrors: Record<string, number> = {};
  for (const entity of entities) {
    mirrors[entity] = (await ctx.store.listMirrors(entity)).length;
  }
  return {
    builderId: ctx.config.builderId,
    enableSend: ctx.config.enableSend,
    sandbox: ctx.config.sandbox,
    defaultDryRun: ctx.config.defaultDryRun,
    mirrors,
    commands: await ctx.store.listCommands(20),
  };
});

async function invokeLocal(ctx: VerbContext, verb: string): Promise<unknown> {
  const { handlers } = await import("./invoke.js");
  const handler = handlers.get(verb);
  if (!handler) throw new GatewayError("not_found", verb);
  return handler(ctx);
}

async function loadVariation(ctx: VerbContext, id: number): Promise<unknown> {
  return unwrapData(
    await btJson(ctx, {
      method: "GET",
      path: `/api/ChangeOrders/${id}/changeOrder`,
      query: { presentingScreen: 0, isMobile: false },
    }),
  );
}

async function resolveGstCostCode(ctx: VerbContext, jobId?: number): Promise<number> {
  try {
    const payload = await btJson(ctx, {
      method: "POST",
      path: "/api/Search",
      query: { limit: 10 },
      json: { search: "4000 GST", jobIds: jobId ? [jobId] : [], categories: [30] },
    });
    const found = pickGstCostCodeFromSearch(payload);
    if (found) return found;
  } catch (err) {
    if (err instanceof GatewayError && err.code !== "bt_error") throw err;
  }
  throw new GatewayError(
    "tax_engine_unusable",
    "Could not resolve the 4000 GST cost code via Search. Use the job's tax setup — do not hard-code a cost code.",
  );
}

async function refreshVariationSync(ctx: VerbContext, changeOrderId: number, current?: unknown): Promise<unknown> {
  const payload = current ?? (await loadVariation(ctx, changeOrderId));
  await ctx.store.setSyncState({
    entityType: "variation",
    externalId: String(changeOrderId),
    lastPulledHash: hashEntity(payload),
    lastPulledAt: new Date().toISOString(),
  });
  return payload;
}

async function applyGst(ctx: VerbContext, changeOrderId: number): Promise<unknown> {
  const current = await loadVariation(ctx, changeOrderId);
  const jobId =
    numberish(asRecord(current).jobId) ??
    numberish(asRecord(asRecord(current).changeOrder).jobId) ??
    optionalJob(ctx);
  const costCode = await resolveGstCostCode(ctx, jobId);
  const computed = recomputeGstDummyLine(linesFromVariation(current), costCode);
  if (computed.existingGstLineId != null) {
    await btJson(ctx, {
      method: "PUT",
      path: "/apix/v2/LineItems/update-change-order-line-item",
      contentType: CONTENT_MERGE_PATCH,
      json: {
        changeOrderId,
        id: computed.existingGstLineId,
        quantity: computed.dummy.quantity,
        unitCost: computed.dummy.unitCost,
        title: computed.dummy.title,
        costCode,
        taxGroupId: null,
        pageTypeEnum: computed.dummy.pageTypeEnum,
      },
    });
  } else if (computed.exclusiveOwnerPrice > 0) {
    await btJson(ctx, {
      method: "POST",
      path: "/apix/v2/LineItems/add-change-order-line-items",
      contentType: CONTENT_JSON,
      json: {
        changeOrderId,
        lineItems: [computed.dummy],
        pageTypeEnum: 6,
      },
    });
  }
  return computed;
}

async function requireBuilderId(ctx: VerbContext): Promise<number> {
  if (ctx.config.builderId > 0) return ctx.config.builderId;
  const globalInfo = dataOf(
    await btJson(ctx, { method: "GET", path: "/api/AccountInfo/GlobalInfo" }),
  );
  const builderId = numberish(globalInfo.builderId ?? globalInfo.BuilderId);
  if (builderId == null) {
    throw new GatewayError(
      "validation",
      "builderId is unknown. Call session.status after login — do not hard-code a tenant id.",
    );
  }
  ctx.config.builderId = builderId;
  return builderId;
}

async function attachBillPdf(
  ctx: VerbContext,
  jobId: number,
  billId: number,
  file: { filename: string; contentBase64: string; contentType: string },
): Promise<unknown> {
  const tempRaw = await btJson(ctx, {
    method: "POST",
    path: `/api/documents/${BILL_TEMPFILE_MEDIA_TYPE}/tempFile`,
    query: { jobId, uploadFullResPhoto: true },
    multipart: [
      {
        fieldName: BILL_TEMPFILE_FIELD,
        filename: file.filename,
        contentType: file.contentType,
        contentBase64: file.contentBase64,
      },
    ],
  });
  const tempDoc = asRecord(seedFromDefaultInfo(tempRaw));
  if (!tempDoc.id && !tempDoc.documentInstanceId && !tempDoc.tempId) {
    throw new GatewayError("bt_error", "tempFile did not return a document object", {
      billId,
    });
  }
  const builderId = await requireBuilderId(ctx);
  const entityDocs = billEntityDocsPayload({
    builderId,
    jobId,
    billId,
    tempDoc,
  });
  const attached = await btJson(ctx, {
    method: "POST",
    path: "/api/Documents/EntityDocs",
    json: entityDocs,
  });
  return {
    tempDoc,
    entityDocs: unwrapData(attached),
    documentType: 58,
  };
}

function optionalJob(ctx: VerbContext): number | undefined {
  const value = ctx.args.jobId;
  if (value == null || value === "") return undefined;
  return requireNumber(ctx.args, "jobId");
}

function billGridBody(ctx: VerbContext): Record<string, unknown> {
  if (ctx.args.body) return asRecord(ctx.args.body);
  const statusCsv = String(ctx.args.statusFilter ?? "0,1,2,3,4,5,6,7,8,9,-2");
  const search = String(ctx.args.search ?? "");
  return {
    gridRequest: {
      hideMultiJobsColumns: true,
      selectedColumns: [
        "6", "27", "1", "8", "7", "3", "12", "4", "39", "31", "30", "32", "34", "33", "35", "11", "9",
        "5", "28",
      ],
      sortColumn: String(ctx.args.sortColumn ?? "27"),
      sortDirection: String(ctx.args.sortDirection ?? "desc"),
      hasFooter: false,
      emptyStateEntity: 58,
    },
    pagingData: {
      pageNumber: String(ctx.args.page ?? 1),
      pageSize: ctx.args.pageSize ?? 100,
      resetScroll: false,
      firstRow: 1,
      lastRow: 100,
      totalRowsAllPages: 100,
      currentPage: ctx.args.page ?? 1,
    },
    filters: JSON.stringify({
      "0": statusCsv,
      "1": search,
    }),
    jobIds: jobIdsFrom(ctx.args),
  };
}

export function registerAllVerbs(): void {
  // Importing this module registers handlers via registerVerb().
}
