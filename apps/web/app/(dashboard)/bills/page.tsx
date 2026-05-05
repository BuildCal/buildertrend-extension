import type { InvoiceStatus } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

const statusBadge: Record<InvoiceStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  EXTRACTED: "bg-yellow-100 text-yellow-900",
  IN_REVIEW: "bg-yellow-100 text-yellow-900",
  PENDING_PM_APPROVAL: "bg-orange-100 text-orange-900",
  PENDING_DIRECTOR_APPROVAL: "bg-orange-200 text-orange-900",
  APPROVED: "bg-blue-100 text-blue-900",
  POSTING: "bg-blue-200 text-blue-900",
  POSTED: "bg-green-100 text-green-900",
  REJECTED: "bg-gray-100 text-gray-700",
  ERROR: "bg-red-100 text-red-900",
};

export default async function BillsPage() {
  const bills = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { reviewedBy: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bill review queue</h1>
          <p className="text-sm text-muted-foreground">
            Bills extracted from invoices. Review and approve to post to Buildertrend.
          </p>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No bills in the queue yet. Send extracted bills to{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            POST /api/webhooks/extracted-bill
          </code>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{bill.vendorNameRaw}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {bill.jobReferenceRaw ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {bill.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    ${bill.amountTotal.toString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[bill.status]}`}
                    >
                      {bill.status.replace("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {bill.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/bills/${bill.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
