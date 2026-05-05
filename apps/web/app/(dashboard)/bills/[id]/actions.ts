"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface SaveInvoiceInput {
  invoiceId: string;
  btJobId: number | null;
  btVendorId: number | null;
  costCodeRaw: string;
  billNumber: string;
  billTitle: string;
  isExpense: boolean;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    amount: number;
  }>;
}

export async function saveInvoice(input: SaveInvoiceInput): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const trimmed = input.costCodeRaw.trim();
  const costCodeId = trimmed && /^\d+$/.test(trimmed) ? Number(trimmed) : null;

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, resolvedPayload: true },
    });
    if (!invoice) throw new Error("Invoice not found");

    const prevPayload =
      invoice.resolvedPayload &&
      typeof invoice.resolvedPayload === "object" &&
      !Array.isArray(invoice.resolvedPayload)
        ? (invoice.resolvedPayload as Record<string, unknown>)
        : {};
    const mergedPayload = { ...prevPayload, bill_title: input.billTitle };

    const lineIds = new Set(
      (
        await tx.invoiceLineItem.findMany({
          where: { invoiceId: input.invoiceId },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    for (const li of input.lineItems) {
      if (!lineIds.has(li.id)) throw new Error("Invalid line item");
    }

    await tx.invoice.update({
      where: { id: input.invoiceId },
      data: {
        resolvedJobId: input.btJobId,
        resolvedVendorId: input.btVendorId,
        resolvedBtCostCodeId: costCodeId,
        invoiceNumber: input.billNumber || null,
        isExpense: input.isExpense,
        status: "IN_REVIEW",
        resolvedPayload: mergedPayload as object,
      },
    });

    for (const li of input.lineItems) {
      await tx.invoiceLineItem.update({
        where: { id: li.id },
        data: {
          description: li.description,
          quantity: li.quantity != null ? new Prisma.Decimal(li.quantity) : null,
          unitPrice: li.unitPrice != null ? new Prisma.Decimal(li.unitPrice) : null,
          amount: new Prisma.Decimal(li.amount),
        },
      });
    }
  });

  await audit({
    userId: session.user.id,
    action: "invoice.review_saved",
    resourceId: input.invoiceId,
    detail: {
      btJobId: input.btJobId,
      btVendorId: input.btVendorId,
      lineItemCount: input.lineItems.length,
    },
  });

  revalidatePath(`/bills/${input.invoiceId}`);
}

export async function addVendorAlias(input: {
  btVendorId: number;
  alias: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const aliasTrimmed = input.alias.trim();
  if (!aliasTrimmed) return;

  await prisma.vendorProfile.upsert({
    where: { btVendorId: input.btVendorId },
    create: { btVendorId: input.btVendorId },
    update: {},
  });

  await prisma.vendorAlias.upsert({
    where: {
      btVendorId_alias: {
        btVendorId: input.btVendorId,
        alias: aliasTrimmed,
      },
    },
    create: {
      btVendorId: input.btVendorId,
      alias: aliasTrimmed,
    },
    update: {},
  });

  await audit({
    userId: session.user.id,
    action: "vendor.alias_added",
    resourceId: String(input.btVendorId),
    detail: { alias: aliasTrimmed },
  });
}
