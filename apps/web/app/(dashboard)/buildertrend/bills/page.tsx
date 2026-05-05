import Link from "next/link";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSyncStatus, isSyncStale } from "@/lib/sync";

const getCachedJobs = unstable_cache(
  async () => {
    return prisma.btJob.findMany({
      orderBy: { name: "asc" },
      select: { btJobId: true, name: true },
    });
  },
  ["bills-page-jobs"],
  { revalidate: 60 },
);

// Map BT's payment status enum to a human label and badge colour.
const paymentStatusLabel: Record<number, { label: string; cls: string }> = {
  0: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  1: { label: "Approved", cls: "bg-indigo-50 text-indigo-700" },
  2: { label: "Paid", cls: "bg-emerald-50 text-emerald-700" },
  3: { label: "Voided", cls: "bg-slate-100 text-slate-400 line-through" },
  4: { label: "Paid", cls: "bg-emerald-50 text-emerald-700" },
  5: { label: "Paid", cls: "bg-emerald-50 text-emerald-700" },
  6: { label: "Closed", cls: "bg-slate-100 text-slate-600" },
  7: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  8: { label: "In Review", cls: "bg-amber-50 text-amber-700" },
  9: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
};

// Map status keys to BT's payment status enum values.
const STATUS_TO_BT_VALUES: Record<string, number[]> = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -2],
  draft: [9],
  in_review: [0, 8],
  ready_for_payment: [1],
  paid: [4, 5, 2],
  other: [7, 3, 6, -2],
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_review", label: "In Review" },
  { key: "ready_for_payment", label: "Ready for Payment" },
  { key: "paid", label: "Paid" },
  { key: "other", label: "Other" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];

function fmtMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

async function getSyncMetadata(): Promise<{
  syncedAt: Date | null;
  isStale: boolean;
}> {
  try {
    const status = await getSyncStatus();
    const stale = isSyncStale(status);
    const ts = status.last_synced.bt_bills;
    return {
      syncedAt: ts ? new Date(ts) : null,
      isStale: stale,
    };
  } catch (e) {
    console.error("[bills page] getSyncMetadata failed:", e);
    return { syncedAt: null, isStale: false };
  }
}

export default async function BuildertrendBillsPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    job_id?: string;
    page?: string;
    search?: string;
  };
}) {
  const statusParam = searchParams.status ?? "all";
  const status: StatusKey = STATUS_TABS.some((t) => t.key === statusParam)
    ? (statusParam as StatusKey)
    : "all";
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const pageSize = 25;
  const search = searchParams.search?.trim() ?? "";
  const jobIdRaw = searchParams.job_id ?? "";
  const jobIdNum = jobIdRaw && !Number.isNaN(Number(jobIdRaw)) ? Number(jobIdRaw) : null;

  // 1. Sync metadata (read-only — never blocks on sync)
  const { syncedAt, isStale } = await getSyncMetadata();

  // 2. Load the job picker (cached — rarely changes)
  const jobs = await getCachedJobs();

  // 3. Build the bills query
  const statusValues = STATUS_TO_BT_VALUES[status];

  const where: {
    paymentStatus: { in: number[] };
    btJobId?: number;
    OR?: Array<{
      billNumber?: { contains: string; mode: "insensitive" };
      billTitle?: { contains: string; mode: "insensitive" };
      payToName?: { contains: string; mode: "insensitive" };
    }>;
  } = {
    paymentStatus: { in: statusValues },
  };
  if (jobIdNum !== null) where.btJobId = jobIdNum;
  if (search) {
    where.OR = [
      { billNumber: { contains: search, mode: "insensitive" } },
      { billTitle: { contains: search, mode: "insensitive" } },
      { payToName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [totalCount, bills, tabCountsRaw] = await Promise.all([
    prisma.btBill.count({ where }),
    prisma.btBill.findMany({
      where,
      orderBy: { invoicedDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        job: { select: { name: true } },
      },
    }),
    prisma.btBill.groupBy({
      by: ["paymentStatus"],
      where: jobIdNum !== null ? { btJobId: jobIdNum } : undefined,
      _count: { _all: true },
    }),
  ]);

  const countByStatus: Record<number, number> = {};
  let totalAcrossAllStatuses = 0;
  for (const row of tabCountsRaw) {
    if (row.paymentStatus !== null) {
      countByStatus[row.paymentStatus] = row._count._all;
      totalAcrossAllStatuses += row._count._all;
    }
  }

  const tabCountMap: Record<string, number> = {};
  for (const tab of STATUS_TABS) {
    if (tab.key === "all") {
      tabCountMap[tab.key] = totalAcrossAllStatuses;
    } else {
      const values = STATUS_TO_BT_VALUES[tab.key];
      tabCountMap[tab.key] = values.reduce((sum, v) => sum + (countByStatus[v] ?? 0), 0);
    }
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const buildHref = (overrides: Partial<Record<string, string | undefined>>) => {
    const next = new URLSearchParams();
    if (status !== "all") next.set("status", status);
    if (jobIdRaw) next.set("job_id", jobIdRaw);
    if (page > 1) next.set("page", String(page));
    if (search) next.set("search", search);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "" || v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/buildertrend/bills?${qs}` : "/buildertrend/bills";
  };

  const lookupJobName = (id: number | null | undefined): string => {
    if (!id) return "—";
    const j = jobs.find((x) => x.btJobId === id);
    return j?.name ?? "—";
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-slate-900">
            Buildertrend Bills
          </h1>
          <p className="mt-1 text-[12px] text-slate-500">
            {totalCount.toLocaleString()} bill{totalCount === 1 ? "" : "s"} matching filters
            {syncedAt ? (
              <>
                {" · "}
                <span title={syncedAt.toISOString()}>
                  Synced {formatRelative(syncedAt)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Filters row */}
      <form className="flex items-center gap-2">
        <input type="hidden" name="status" value={status} />

        <input
          type="search"
          name="search"
          placeholder="Search by bill #, title, or vendor…"
          defaultValue={search}
          className="flex h-8 w-72 rounded-md border border-slate-200 bg-white px-3 text-[13px] placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />

        <select
          name="job_id"
          defaultValue={jobIdRaw}
          className="flex h-8 w-56 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All jobs ({jobs.length})</option>
          {jobs.map((j) => (
            <option key={j.btJobId} value={j.btJobId}>
              {j.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[12.5px] font-medium text-white hover:bg-slate-800"
        >
          Apply
        </button>
      </form>

      {/* Status tabs */}
      <div className="flex items-center gap-0.5 border-b border-slate-200">
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.key;
          const count = tabCountMap[tab.key] ?? 0;
          return (
            <Link
              key={tab.key}
              href={buildHref({ status: tab.key, page: undefined })}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors ${
                isActive
                  ? "border-indigo-600 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab.label}
              <span
                className={`rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums ${
                  isActive ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {isStale ? (
        <form action="/api/sync/ensure-fresh" method="POST" className="w-full">
          <button
            type="submit"
            className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-[12.5px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
          >
            Data may be out of date. Click to refresh.
          </button>
        </form>
      ) : null}

      {/* Bills table */}
      {bills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-[14px] font-medium text-slate-700">No bills match these filters</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Try clearing search terms or selecting a different status tab.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="data-table w-full text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Bill #</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Job</th>
                <th className="px-3 py-2 text-left">Pay To</th>
                <th className="px-3 py-2 text-left">Invoiced</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">PO</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const ps = bill.paymentStatus ?? null;
                const badge = ps !== null ? (paymentStatusLabel[ps] ?? null) : null;
                const amount = bill.paymentAmount ? Number(bill.paymentAmount) : null;
                const jobName = bill.job?.name ?? lookupJobName(bill.btJobId);
                return (
                  <tr
                    key={bill.btBillId}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/50"
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[12px] text-slate-700">
                      {bill.billNumber ?? "—"}
                    </td>
                    <td className="max-w-[240px] truncate whitespace-nowrap px-3 py-1.5 font-medium text-slate-900">
                      {bill.billTitle ?? "—"}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-1.5 text-slate-600">{jobName}</td>
                    <td className="max-w-[140px] truncate px-3 py-1.5 text-slate-700">
                      {bill.payToName ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-slate-500">{fmtDate(bill.invoicedDate)}</td>
                    <td className="px-3 py-1.5 tabular-nums">
                      <span className={bill.isPastDue ? "font-medium text-red-600" : "text-slate-500"}>
                        {fmtDate(bill.dueDate)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-900">
                      {fmtMoney(amount)}
                    </td>
                    <td className="px-3 py-1.5">
                      {badge ? (
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-slate-500">
                      {bill.purchaseOrderNumber ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-slate-500">
            Page <span className="font-medium text-slate-900">{page}</span> of{" "}
            <span className="font-medium text-slate-900">{totalPages}</span> ·{" "}
            {totalCount.toLocaleString()} total
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildHref({ page: page > 2 ? String(page - 1) : undefined })}
                className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 hover:bg-slate-50"
              >
                ← Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 hover:bg-slate-50"
              >
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
