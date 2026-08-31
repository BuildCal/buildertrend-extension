import { notFound } from "next/navigation";

import {
  getInvoiceFormLookups,
  matchJob,
  matchVendor,
} from "@/lib/invoice-matching";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

import { InvoiceReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

async function getSignedPdfUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .createSignedUrl(filePath, 60 * 30);
    if (error || !data) {
      console.error("[review] signed URL error:", error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("[review] signed URL error:", err);
    return null;
  }
}

export default async function InvoiceReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { lineItems: { orderBy: { lineNumber: "asc" } } },
  });
  if (!invoice) notFound();

  const [signedUrl, lookups, vendorMatch, jobMatch] = await Promise.all([
    getSignedPdfUrl(invoice.filePath),
    getInvoiceFormLookups(),
    matchVendor(invoice.vendorNameRaw),
    matchJob(invoice.jobReferenceRaw),
  ]);

  const initialBtVendorId = invoice.resolvedVendorId ?? vendorMatch?.btVendorId ?? null;
  const initialBtJobId = invoice.resolvedJobId ?? jobMatch?.btJobId ?? null;

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)]">
      <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200 bg-slate-100">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div className="truncate text-[12px] text-slate-500">{invoice.filePath || "No file"}</div>
          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11.5px] font-medium text-indigo-600 hover:text-indigo-700"
            >
              Open in new tab ↗
            </a>
          ) : null}
        </div>
        <div className="flex-1 overflow-hidden">
          {signedUrl ? (
            <iframe src={signedUrl} className="h-full w-full border-0" title="Invoice PDF" />
          ) : (
            <div className="flex h-full items-center justify-center text-[12.5px] text-slate-500">
              No PDF available for this invoice
            </div>
          )}
        </div>
      </div>

      <div className="flex w-[520px] shrink-0 flex-col bg-white">
        <InvoiceReviewForm
          invoice={JSON.parse(JSON.stringify(invoice))}
          jobs={lookups.jobs}
          vendors={lookups.vendors}
          initialBtVendorId={initialBtVendorId}
          initialBtJobId={initialBtJobId}
          vendorMatch={vendorMatch}
          jobMatch={jobMatch}
        />
      </div>
    </div>
  );
}
