import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ExtractedInvoiceData {
  supplier: {
    name: string | null;
    abn: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  invoice: {
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    po_reference: string | null;
    job_reference: string | null;
  };
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
  }>;
  totals: {
    subtotal: number | null;
    gst: number | null;
    total: number;
  };
  confidence: {
    overall: number;
    supplier: number;
    invoice_details: number;
    line_items: number;
    totals: number;
  };
  warnings: string[];
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      filePath,
      extracted,
      originalFileName,
    } = body as {
      filePath: string;
      extracted: ExtractedInvoiceData;
      originalFileName?: string;
    };

    if (!filePath || !extracted) {
      return NextResponse.json({ error: "filePath and extracted required" }, { status: 400 });
    }

    const sourceExtractionId = filePath;

    const existing = await prisma.invoice.findUnique({
      where: { sourceExtractionId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ invoiceId: existing.id, alreadyExisted: true });
    }

    const invoiceDateRaw = extracted.invoice.invoice_date;
    const invoiceDate = invoiceDateRaw ? new Date(invoiceDateRaw) : new Date();

    const total = extracted.totals?.total ?? 0;
    const subtotal = extracted.totals?.subtotal ?? null;
    const gst = extracted.totals?.gst ?? null;
    const gstTreatment =
      gst != null && gst > 0 ? "exclusive" : subtotal === total ? "no_gst" : null;

    const created = await prisma.invoice.create({
      data: {
        sourceExtractionId,
        rawPayload: extracted as unknown as Prisma.InputJsonValue,
        vendorNameRaw: extracted.supplier?.name ?? "Unknown Vendor",
        jobReferenceRaw: extracted.invoice?.job_reference ?? null,
        amountTotal: new Prisma.Decimal(total),
        invoiceDate,
        invoiceNumber: extracted.invoice?.invoice_number ?? null,
        pdfUrl: null,
        filePath,
        subtotal: subtotal != null ? new Prisma.Decimal(subtotal) : null,
        gstAmount: gst != null ? new Prisma.Decimal(gst) : null,
        gstTreatment,
        confidenceScore: extracted.confidence?.overall ?? null,
        extractionWarnings: (extracted.warnings ?? []) as unknown as Prisma.InputJsonValue,
        status: "EXTRACTED",
        lineItems: {
          create: (extracted.line_items ?? []).map((item, idx) => ({
            lineNumber: idx + 1,
            description: item.description,
            quantity: item.quantity != null ? new Prisma.Decimal(item.quantity) : null,
            unitPrice: item.unit_price != null ? new Prisma.Decimal(item.unit_price) : null,
            amount: new Prisma.Decimal(item.amount ?? 0),
          })),
        },
      },
    });

    await audit({
      userId: session.user.id,
      action: "invoice.created_from_upload",
      resourceId: created.id,
      detail: {
        filePath,
        originalFileName,
        vendorName: extracted.supplier?.name,
        total,
        confidence: extracted.confidence?.overall,
      },
    });

    return NextResponse.json({ invoiceId: created.id });
  } catch (error) {
    console.error("[invoices.create] error:", error);
    return NextResponse.json(
      {
        error: "Failed to create invoice",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
