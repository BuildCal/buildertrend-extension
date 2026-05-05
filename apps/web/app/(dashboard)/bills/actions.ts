"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { btService, BTServiceError } from "@/lib/bt-service";
import { prisma } from "@/lib/prisma";

/**
 * Bill review / approval / posting actions.
 *
 * These are server actions invoked from the bill detail page.
 * They write audit log entries before AND after every BT mutation
 * so we can reconstruct what happened even if BT calls fail.
 */

const ResolveSchema = z.object({
  billId: z.string().min(1),
  jobId: z.coerce.number().int().positive(),
  vendorId: z.coerce.number().int().positive(),
  costCodeId: z.coerce.number().int().positive(),
  billNumber: z.string().min(1).max(50),
  billTitle: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  unitCost: z.coerce.number().nonnegative(),
  quantity: z.coerce.number().positive().default(1),
  lineItemTitle: z.string().min(1).max(200),
});

export async function resolveAndApprove(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("unauthenticated");

  const parsed = ResolveSchema.parse(Object.fromEntries(formData));
  const userId = session.user.id;

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.billId },
  });
  if (!invoice) throw new Error("Bill not found");
  if (invoice.status !== "EXTRACTED") {
    throw new Error(`Cannot approve a bill in status ${invoice.status}`);
  }

  // Build the resolved (BT-shaped) payload and store before posting,
  // so if anything goes wrong we have it for retry/debugging.
  const dueDate = new Date(invoice.invoiceDate);
  dueDate.setDate(dueDate.getDate() + 7);

  const resolvedRequest = {
    job_id: parsed.jobId,
    vendor_id: parsed.vendorId,
    bill_number: parsed.billNumber,
    bill_title: parsed.billTitle,
    invoice_date: invoice.invoiceDate.toISOString(),
    due_date: dueDate.toISOString(),
    description: parsed.description ?? "",
    line_items: [
      {
        cost_code_id: parsed.costCodeId,
        title: parsed.lineItemTitle,
        description: parsed.description ?? "",
        quantity: parsed.quantity,
        unit_cost: parsed.unitCost,
        unit_type: "ea",
        cost_types: [7],
      },
    ],
    purchase_order_id: null,
    source_extraction_id: invoice.sourceExtractionId,
  };

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "APPROVED",
      resolvedVendorId: parsed.vendorId,
      resolvedJobId: parsed.jobId,
      resolvedPayload: resolvedRequest as object,
      reviewedById: userId,
      reviewedAt: new Date(),
    },
  });

  await audit({
    userId,
    action: "bill.approve",
    resourceId: invoice.id,
    detail: { jobId: parsed.jobId, vendorId: parsed.vendorId },
  });

  // Now actually post to BT
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "POSTING" },
  });

  try {
    await audit({
      userId,
      action: "bill.post.start",
      resourceId: invoice.id,
      detail: { request: resolvedRequest },
    });

    const result = await btService.createBill(resolvedRequest);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "POSTED",
        btBillId: result.bill_id,
        btExternalId: result.external_id,
        postedAt: new Date(),
        errorMessage: null,
      },
    });

    await audit({
      userId,
      action: "bill.post.success",
      resourceId: invoice.id,
      detail: { btBillId: result.bill_id, btExternalId: result.external_id },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const detail =
      e instanceof BTServiceError
        ? { status: e.status, response: e.detail, message }
        : { message };

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "ERROR", errorMessage: message },
    });

    await audit({
      userId,
      action: "bill.post.failure",
      resourceId: invoice.id,
      detail,
    });

    throw e;
  }

  revalidatePath("/bills");
  revalidatePath(`/bills/${invoice.id}`);
}

export async function rejectBill(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("unauthenticated");

  const billId = String(formData.get("billId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!billId) throw new Error("Missing billId");

  await prisma.invoice.update({
    where: { id: billId },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      errorMessage: reason || null,
    },
  });

  await audit({
    userId: session.user.id,
    action: "bill.reject",
    resourceId: billId,
    detail: { reason },
  });

  revalidatePath("/bills");
  revalidatePath(`/bills/${billId}`);
}

export async function retryBill(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("unauthenticated");

  const billId = String(formData.get("billId") ?? "");
  const invoice = await prisma.invoice.findUnique({ where: { id: billId } });
  if (!invoice) throw new Error("Bill not found");
  if (invoice.status !== "ERROR") throw new Error("Only ERROR bills can be retried");
  if (!invoice.resolvedPayload) throw new Error("No resolved payload to retry");

  await prisma.invoice.update({
    where: { id: billId },
    data: { status: "POSTING", errorMessage: null },
  });

  try {
    const result = await btService.createBill(
      invoice.resolvedPayload as Parameters<typeof btService.createBill>[0]
    );
    await prisma.invoice.update({
      where: { id: billId },
      data: {
        status: "POSTED",
        btBillId: result.bill_id,
        btExternalId: result.external_id,
        postedAt: new Date(),
      },
    });
    await audit({
      userId: session.user.id,
      action: "bill.retry.success",
      resourceId: billId,
      detail: { btBillId: result.bill_id },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.invoice.update({
      where: { id: billId },
      data: { status: "ERROR", errorMessage: message },
    });
    await audit({
      userId: session.user.id,
      action: "bill.retry.failure",
      resourceId: billId,
      detail: { message },
    });
    throw e;
  }

  revalidatePath(`/bills/${billId}`);
}
