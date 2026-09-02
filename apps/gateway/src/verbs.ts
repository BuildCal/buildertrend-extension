import { CONTENT_JSON, CONTENT_MERGE_PATCH, unwrapData } from "./adapter.js";
import {
  DRAFT_APPROVAL_STATUS,
  GST_COST_CODE,
  OWNER_INVOICE_TAX_GROUP_ID,
} from "./config.js";
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
  isGstDummyLine,
  recomputeGstDummyLine,
  type VariationLineLike,
} from "./gst.js";
import { hashEntity, type MirrorEntity, type MirrorRecord } from "./store.js";
import {
  bt,
  btJson,
  guardConflict,
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
        entityType: ctx.args.entityType ?? 3,
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
  const gst = ctx.args.skipGstRecompute === true ? undefined : await applyGst(ctx, changeOrderId);
  return { raw: unwrapData(payload), gst };
});

registerVerb("variations.recomputeGst", async (ctx) => {
  const provided = Array.isArray(ctx.args.lines) ? (ctx.args.lines as VariationLineLike[]) : undefined;
  if (provided) return recomputeGstDummyLine(provided);
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

registerVerb("bills.create", async (ctx) => {
  const jobId = requireNumber(ctx.args, "jobId");
  const payload = billCreatePayload(ctx.args, jobId);
  const result = await btJson(ctx, {
    method: "POST",
    path: "/api/v1/bills",
    query: { jobId },
    json: payload,
  });
  return unwrapData(result);
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
  const data = asRecord(await getPo(ctx));
  return data.relatedBills ?? data.linkedBills ?? data.bills ?? [];
});

registerVerb("pos.linkedBids", async (ctx) => {
  const data = asRecord(await getPo(ctx));
  return data.relatedBids ?? data.linkedBids ?? data.bids ?? [];
});

registerVerb("pos.approvals", async (ctx) => {
  const data = asRecord(await getPo(ctx));
  return data.approvals ?? data.approvers ?? [];
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

async function applyGst(ctx: VerbContext, changeOrderId: number): Promise<unknown> {
  const current = await loadVariation(ctx, changeOrderId);
  const computed = recomputeGstDummyLine(linesFromVariation(current));
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
        costCode: GST_COST_CODE,
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

async function getPo(ctx: VerbContext): Promise<unknown> {
  const id = requireNumber(ctx.args, "purchaseOrderId");
  return unwrapData(await btJson(ctx, { method: "GET", path: `/api/PurchaseOrders/${id}` }));
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

function billCreatePayload(args: Record<string, unknown>, jobId: number): Record<string, unknown> {
  const lines = Array.isArray(args.lineItems) ? args.lineItems : [];
  return {
    billNumber: args.billNumber,
    billTitle: args.billTitle,
    invoiceDate: args.invoiceDate,
    performingUserId: args.vendorId,
    performingUserType: 2,
    performingUserName: "",
    performingUserEmail: "",
    miscPaidToName: "",
    unifiedDeadlineRequest: {
      isDeadlineLinked: false,
      deadlineOffset: 0,
      deadlineIsAfterLinkedItem: true,
      scheduleItemSelectedValue: -1,
      dueDate: args.dueDate,
      paymentTerms: null,
    },
    attachedFiles: { removeDocs: [], attachDocs: [], updateDocs: [] },
    lineItems: lines,
    description: args.description ?? "",
    purchaseOrderId: args.purchaseOrderId ?? null,
    jobId,
    billId: 0,
    status: 0,
    documentType: 0,
    containerIsValid: true,
    billToOwner: false,
    sendToAccounting: false,
    readyForPayment: false,
    isCreateNewFromPO: args.purchaseOrderId != null,
    syncUpdatesToAccounting: false,
    sendForApproval: false,
    approveBill: false,
    saveDraftToJob: true,
    payInFull: false,
    payOnline: false,
    isSendToAccountingDirty: false,
    billLineItems: [],
    customFields: [],
    selectedApprovers: [],
    selectedJobId: jobId,
    varianceCount: 0,
  };
}

export const OWNER_INVOICE_TAX_GROUP = OWNER_INVOICE_TAX_GROUP_ID;

export function registerAllVerbs(): void {
  // Importing this module registers handlers via registerVerb().
}
