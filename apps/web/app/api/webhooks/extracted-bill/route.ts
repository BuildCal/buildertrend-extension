/**
 * POST /api/webhooks/extracted-bill
 *
 * An extraction tool POSTs here when it finishes processing a bill PDF.
 * We validate the payload and add it to the review queue.
 *
 * Authentication: shared bearer token in Authorization header.
 * Idempotency: source_extraction_id is the unique key.
 */

import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const PayloadSchema = z.object({
  source_extraction_id: z.string().min(1),
  vendor_name: z.string().min(1),
  job_reference: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  invoice_date: z.string().datetime(),
  amount_total: z.number().positive(),
  pdf_url: z.string().url().nullable().optional(),
  raw: z.record(z.unknown()),
});

function bearerMatches(header: string, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.EXTRACTOR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "webhook is not configured" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!bearerMatches(authHeader, webhookSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

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
