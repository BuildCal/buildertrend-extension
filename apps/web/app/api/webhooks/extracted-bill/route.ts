/**
 * POST /api/webhooks/extracted-bill
 *
 * Your Claude-based extraction tool POSTs here when it finishes processing
 * a bill PDF. We validate the payload and add it to the review queue.
 *
 * Authentication: shared bearer token in Authorization header.
 * Idempotency: source_extraction_id is the unique key.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const webhookSecret = process.env.EXTRACTOR_WEBHOOK_SECRET!;

const PayloadSchema = z.object({
  source_extraction_id: z.string().min(1),
  vendor_name: z.string().min(1),
  job_reference: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  invoice_date: z.string().datetime(),
  amount_total: z.number().positive(),
  pdf_url: z.string().url().nullable().optional(),
  raw: z.record(z.unknown()), // Keep the full extraction for review/audit
});

export async function POST(req: NextRequest) {
  // Auth: bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${webhookSecret}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate
  const parsed = PayloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Idempotency: if we've seen this source_extraction_id before, return the
  // existing record rather than creating a duplicate.
  const existing = await prisma.invoice.findUnique({
    where: { sourceExtractionId: data.source_extraction_id },
  });
  if (existing) {
    return NextResponse.json(
      { id: existing.id, status: "duplicate" },
      { status: 200 }
    );
  }

  const bill = await prisma.invoice.create({
    data: {
      sourceExtractionId: data.source_extraction_id,
      rawPayload: data.raw as object,
      vendorNameRaw: data.vendor_name,
      jobReferenceRaw: data.job_reference ?? null,
      invoiceNumber: data.invoice_number ?? null,
      invoiceDate: new Date(data.invoice_date),
      amountTotal: data.amount_total,
      pdfUrl: data.pdf_url ?? null,
    },
  });

  await audit({
    action: "bill.received",
    resourceId: bill.id,
    detail: {
      vendor: data.vendor_name,
      amount: data.amount_total,
      source_extraction_id: data.source_extraction_id,
    },
  });

  return NextResponse.json({ id: bill.id, status: "queued" }, { status: 201 });
}
