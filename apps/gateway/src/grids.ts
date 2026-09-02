export interface GridArgs {
  page?: number;
  pageSize?: number;
  jobIds?: number[];
  jobId?: number;
  search?: string;
  filters?: unknown;
  body?: Record<string, unknown>;
  sortColumn?: string;
  sortDirection?: string;
}

export function jobIdsFrom(args: GridArgs): number[] {
  if (args.jobIds?.length) return args.jobIds;
  if (typeof args.jobId === "number") return [args.jobId];
  return [];
}

export function buildGridBody(args: GridArgs, defaults?: { sortColumn?: string }): Record<string, unknown> {
  if (args.body) return args.body;
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 100;
  const filters = args.filters ?? {};
  return {
    gridRequest: {
      hideMultiJobsColumns: true,
      selectedColumns: [],
      sortColumn: args.sortColumn ?? defaults?.sortColumn ?? "1",
      sortDirection: args.sortDirection ?? "desc",
      hasFooter: false,
    },
    pagingData: {
      pageNumber: String(page),
      pageSize,
      resetScroll: false,
      firstRow: (page - 1) * pageSize + 1,
      lastRow: page * pageSize,
      totalRowsAllPages: pageSize,
      currentPage: page,
    },
    filters: typeof filters === "string" ? filters : JSON.stringify(filters),
    jobIds: jobIdsFrom(args),
    searchText: args.search ?? "",
  };
}

export function extractGridRows(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  for (const key of ["data", "rows", "items", "jobs", "results"]) {
    const value = data[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(data)) return data;
  return [];
}

export function pickId(row: Record<string, unknown>): string | undefined {
  for (const key of [
    "id",
    "jobID",
    "jobId",
    "invoiceId",
    "changeOrderId",
    "leadId",
    "contactId",
    "billId",
    "purchaseOrderId",
  ]) {
    const value = row[key];
    if (value != null) return String(value);
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
}

export function numberish(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}
