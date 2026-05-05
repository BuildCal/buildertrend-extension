"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { addVendorAlias, saveInvoice } from "./actions";

type Invoice = {
  id: string;
  vendorNameRaw: string;
  jobReferenceRaw: string | null;
  amountTotal: unknown;
  subtotal: unknown | null;
  gstAmount: unknown | null;
  gstTreatment: string | null;
  invoiceDate: string;
  invoiceNumber: string | null;
  status: string;
  confidenceScore: number | null;
  extractionWarnings: unknown;
  resolvedVendorId: number | null;
  resolvedJobId: number | null;
  resolvedBtCostCodeId: number | null;
  isExpense: boolean;
  lineItems: Array<{
    id: string;
    lineNumber: number;
    description: string;
    quantity: unknown | null;
    unitPrice: unknown | null;
    amount: unknown;
  }>;
};

interface Props {
  invoice: Invoice;
  jobs: { btJobId: number; name: string; jobNumber: string | null }[];
  vendors: { btVendorId: number; name: string; email: string | null }[];
  initialBtVendorId: number | null;
  initialBtJobId: number | null;
  vendorMatch: { btVendorId: number; name: string; confidence: string } | null;
  jobMatch: { btJobId: number; name: string; confidence: string } | null;
}

export function InvoiceReviewForm({
  invoice,
  jobs,
  vendors,
  initialBtVendorId,
  initialBtJobId,
  vendorMatch,
  jobMatch,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aliasSaved, setAliasSaved] = useState(false);

  const [btJobId, setBtJobId] = useState<number | "">(initialBtJobId ?? "");
  const [btVendorId, setBtVendorId] = useState<number | "">(initialBtVendorId ?? "");
  const [costCodeRaw, setCostCodeRaw] = useState<string>(
    invoice.resolvedBtCostCodeId != null ? String(invoice.resolvedBtCostCodeId) : "",
  );
  const [billNumber, setBillNumber] = useState(invoice.invoiceNumber ?? "");
  const [billTitle, setBillTitle] = useState(`Invoice from ${invoice.vendorNameRaw}`);
  const [isExpense, setIsExpense] = useState(invoice.isExpense);
  const [lineItems, setLineItems] = useState(invoice.lineItems);

  const total = Number(invoice.amountTotal) || 0;
  const subtotal = invoice.subtotal != null ? Number(invoice.subtotal) : null;
  const gst = invoice.gstAmount != null ? Number(invoice.gstAmount) : null;
  const confidence = invoice.confidenceScore ?? null;

  const warnings: string[] = Array.isArray(invoice.extractionWarnings)
    ? (invoice.extractionWarnings as string[])
    : [];

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveInvoice({
          invoiceId: invoice.id,
          btJobId: btJobId === "" ? null : Number(btJobId),
          btVendorId: btVendorId === "" ? null : Number(btVendorId),
          costCodeRaw,
          billNumber,
          billTitle,
          isExpense,
          lineItems: lineItems.map((li) => ({
            id: li.id,
            description: li.description,
            quantity: li.quantity != null ? Number(li.quantity) : null,
            unitPrice: li.unitPrice != null ? Number(li.unitPrice) : null,
            amount: Number(li.amount),
          })),
        });
        setSavedAt(new Date());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const updateLineItem = (
    id: string,
    field: "description" | "quantity" | "unitPrice" | "amount",
    value: string,
  ) => {
    setLineItems((items) =>
      items.map((li) =>
        li.id === id
          ? {
              ...li,
              [field]:
                field === "description" ? value : value === "" ? null : Number(value),
            }
          : li,
      ),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeCls(invoice.status)}`}
          >
            {invoice.status.replace(/_/g, " ").toLowerCase()}
          </span>
          {confidence !== null ? (
            <span
              className={`text-[11px] tabular-nums ${confidence >= 0.9 ? "text-emerald-700" : confidence >= 0.75 ? "text-amber-700" : "text-red-700"}`}
            >
              {Math.round(confidence * 100)}% conf.
            </span>
          ) : null}
          <span className="truncate text-[11px] text-slate-400">
            ${total.toFixed(2)} · {lineItems.length} {lineItems.length === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {savedAt && !isPending ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> saved
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 text-[11.5px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <ul className="space-y-0.5 text-[11.5px] text-amber-900">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[11.5px] text-red-700">{error}</div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex gap-1 rounded-md bg-slate-100 p-0.5 text-[11.5px] font-medium">
          <button
            type="button"
            onClick={() => setIsExpense(false)}
            className={`flex-1 rounded py-1.5 ${!isExpense ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Project bill
          </button>
          <button
            type="button"
            onClick={() => setIsExpense(true)}
            className={`flex-1 rounded py-1.5 ${isExpense ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            General expense
          </button>
        </div>

        <Field label="Job" required={!isExpense}>
          <select
            value={btJobId === "" ? "" : String(btJobId)}
            onChange={(e) => setBtJobId(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={isExpense}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px] disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">— Select job —</option>
            {jobs.map((j) => (
              <option key={j.btJobId} value={j.btJobId}>
                {j.name}
                {j.jobNumber ? ` · ${j.jobNumber}` : ""}
              </option>
            ))}
          </select>
          {jobMatch && initialBtJobId === jobMatch.btJobId && btJobId === jobMatch.btJobId ? (
            <Hint>
              Auto-matched from &quot;{invoice.jobReferenceRaw}&quot; ({jobMatch.confidence})
            </Hint>
          ) : null}
          {!jobMatch && invoice.jobReferenceRaw ? (
            <Hint warning>
              Extractor said &quot;{invoice.jobReferenceRaw}&quot; — no match found
            </Hint>
          ) : null}
        </Field>

        <Field label="Vendor" required>
          <select
            value={btVendorId === "" ? "" : String(btVendorId)}
            onChange={(e) => {
              setBtVendorId(e.target.value === "" ? "" : Number(e.target.value));
              setAliasSaved(false);
            }}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
          >
            <option value="">— Select vendor —</option>
            {vendors.map((v) => (
              <option key={v.btVendorId} value={v.btVendorId}>
                {v.name}
              </option>
            ))}
          </select>
          {(() => {
            const pickedVendor = vendors.find((v) => v.btVendorId === btVendorId);
            const rawName = invoice.vendorNameRaw;
            if (vendorMatch && btVendorId === vendorMatch.btVendorId) {
              return (
                <Hint>
                  Auto-matched from &quot;{rawName}&quot; ({vendorMatch.confidence})
                </Hint>
              );
            }
            if (
              pickedVendor &&
              rawName &&
              rawName.toLowerCase() !== pickedVendor.name.toLowerCase() &&
              !aliasSaved
            ) {
              return (
                <div className="mt-1 flex items-center gap-2 text-[10.5px] text-slate-600">
                  <span>Extractor said &quot;{rawName}&quot;.</span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await addVendorAlias({ btVendorId: pickedVendor.btVendorId, alias: rawName });
                        setAliasSaved(true);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                    className="font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Save as alias →
                  </button>
                </div>
              );
            }
            if (aliasSaved) {
              return (
                <Hint>
                  Alias saved — future invoices from &quot;{rawName}&quot; will auto-match.
                </Hint>
              );
            }
            if (!pickedVendor && rawName) {
              return (
                <Hint warning>
                  Extractor said &quot;{rawName}&quot; — no match. Pick manually.
                </Hint>
              );
            }
            return null;
          })()}
        </Field>

        <Field label="Cost code">
          <input
            type="text"
            value={costCodeRaw}
            onChange={(e) => setCostCodeRaw(e.target.value)}
            placeholder="(optional — applied to all line items)"
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bill number">
            <input
              type="text"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
            />
          </Field>
          <Field label="Bill title">
            <input
              type="text"
              value={billTitle}
              onChange={(e) => setBillTitle(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px]"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Subtotal">
            <div className="flex h-8 items-center px-2 text-[12.5px] tabular-nums text-slate-700">
              ${subtotal != null ? subtotal.toFixed(2) : "—"}
            </div>
          </Field>
          <Field label="GST">
            <div className="flex h-8 items-center px-2 text-[12.5px] tabular-nums text-slate-700">
              ${gst != null ? gst.toFixed(2) : "—"}
            </div>
          </Field>
          <Field label="Total">
            <div className="flex h-8 items-center px-2 text-[12.5px] font-semibold tabular-nums text-slate-900">
              ${total.toFixed(2)}
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            Line items ({lineItems.length})
          </div>
          {lineItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-[12px] text-slate-500">
              No line items extracted
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-[12px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Description
                    </th>
                    <th className="w-14 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Qty
                    </th>
                    <th className="w-20 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Unit
                    </th>
                    <th className="w-24 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-1 py-0.5">
                        <input
                          value={li.description}
                          onChange={(e) => updateLineItem(li.id, "description", e.target.value)}
                          className="w-full rounded px-1 py-1 text-[12px] hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="number"
                          value={li.quantity != null ? String(li.quantity) : ""}
                          onChange={(e) => updateLineItem(li.id, "quantity", e.target.value)}
                          className="w-full rounded px-1 py-1 text-right text-[12px] tabular-nums hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="number"
                          value={li.unitPrice != null ? String(li.unitPrice) : ""}
                          onChange={(e) => updateLineItem(li.id, "unitPrice", e.target.value)}
                          className="w-full rounded px-1 py-1 text-right text-[12px] tabular-nums hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="number"
                          value={String(li.amount ?? "")}
                          onChange={(e) => updateLineItem(li.id, "amount", e.target.value)}
                          className="w-full rounded px-1 py-1 text-right text-[12px] font-medium tabular-nums hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>
      {children}
    </label>
  );
}

function Hint({ children, warning }: { children: ReactNode; warning?: boolean }) {
  return (
    <div className={`mt-1 text-[10.5px] ${warning ? "text-amber-700" : "text-slate-500"}`}>{children}</div>
  );
}

function statusBadgeCls(status: string): string {
  switch (status) {
    case "EXTRACTED":
    case "IN_REVIEW":
      return "bg-amber-50 text-amber-700";
    case "PENDING_PM_APPROVAL":
    case "PENDING_DIRECTOR_APPROVAL":
      return "bg-indigo-50 text-indigo-700";
    case "APPROVED":
    case "POSTING":
    case "POSTED":
      return "bg-emerald-50 text-emerald-700";
    case "REJECTED":
    case "ERROR":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
