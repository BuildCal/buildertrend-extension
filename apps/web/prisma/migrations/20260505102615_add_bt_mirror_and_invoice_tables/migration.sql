/*
  Warnings:

  - You are about to drop the `PendingBill` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'EXTRACTED', 'IN_REVIEW', 'PENDING_PM_APPROVAL', 'PENDING_DIRECTOR_APPROVAL', 'APPROVED', 'POSTING', 'POSTED', 'REJECTED', 'ERROR');

-- DropForeignKey
ALTER TABLE "PendingBill" DROP CONSTRAINT "PendingBill_reviewedById_fkey";

-- DropTable
DROP TABLE "PendingBill";

-- DropEnum
DROP TYPE "BillStatus";

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "sourceExtractionId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "vendorNameRaw" TEXT NOT NULL,
    "jobReferenceRaw" TEXT,
    "amountTotal" DECIMAL(12,2) NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT,
    "pdfUrl" TEXT,
    "resolvedVendorId" INTEGER,
    "resolvedJobId" INTEGER,
    "resolvedPayload" JSONB,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'EXTRACTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "btBillId" INTEGER,
    "btExternalId" TEXT,
    "postedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isExpense" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBtVendorId" INTEGER,
    "btPurchaseOrderId" INTEGER,
    "poMatchStatus" TEXT,
    "poVarianceAmount" DECIMAL(12,2),
    "poVarianceReason" TEXT,
    "subtotal" DECIMAL(12,2),
    "gstAmount" DECIMAL(12,2),
    "gstTreatment" TEXT,
    "resolvedBtCostCodeId" INTEGER,
    "filePath" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "extractionWarnings" JSONB,
    "pmApprovedById" TEXT,
    "pmApprovedAt" TIMESTAMP(3),
    "directorApprovedById" TEXT,
    "directorApprovedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_jobs" (
    "btJobId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jobNumber" TEXT,
    "status" TEXT,
    "address" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_jobs_pkey" PRIMARY KEY ("btJobId")
);

-- CreateTable
CREATE TABLE "bt_vendors" (
    "btVendorId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "userType" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_vendors_pkey" PRIMARY KEY ("btVendorId")
);

-- CreateTable
CREATE TABLE "bt_cost_codes" (
    "btCostCodeId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "btJobId" INTEGER,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_cost_codes_pkey" PRIMARY KEY ("btCostCodeId")
);

-- CreateTable
CREATE TABLE "bt_purchase_orders" (
    "btPurchaseOrderId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "btJobId" INTEGER,
    "btVendorId" INTEGER,
    "poNumber" TEXT,
    "title" TEXT,
    "status" TEXT,
    "totalAmount" DECIMAL(12,2),
    "invoicedAmount" DECIMAL(12,2),
    "issueDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_purchase_orders_pkey" PRIMARY KEY ("btPurchaseOrderId")
);

-- CreateTable
CREATE TABLE "bt_purchase_order_lines" (
    "id" TEXT NOT NULL,
    "btPurchaseOrderId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2),
    "unitPrice" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "btCostCodeId" INTEGER,

    CONSTRAINT "bt_purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "btVendorId" INTEGER NOT NULL,
    "notes" TEXT,
    "defaultCostCodeId" INTEGER,
    "accountsEmail" TEXT,
    "abn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("btVendorId")
);

-- CreateTable
CREATE TABLE "vendor_aliases" (
    "id" TEXT NOT NULL,
    "btVendorId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2),
    "unitPrice" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "btCostCodeId" INTEGER,
    "btJobId" INTEGER,
    "gstTreatment" TEXT,
    "gstAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_approval_logs" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "notes" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_sourceExtractionId_key" ON "invoices"("sourceExtractionId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");

-- CreateIndex
CREATE INDEX "bt_jobs_builderId_idx" ON "bt_jobs"("builderId");

-- CreateIndex
CREATE INDEX "bt_vendors_builderId_idx" ON "bt_vendors"("builderId");

-- CreateIndex
CREATE INDEX "bt_vendors_name_idx" ON "bt_vendors"("name");

-- CreateIndex
CREATE INDEX "bt_cost_codes_builderId_idx" ON "bt_cost_codes"("builderId");

-- CreateIndex
CREATE INDEX "bt_cost_codes_btJobId_idx" ON "bt_cost_codes"("btJobId");

-- CreateIndex
CREATE INDEX "bt_purchase_orders_builderId_idx" ON "bt_purchase_orders"("builderId");

-- CreateIndex
CREATE INDEX "bt_purchase_orders_btJobId_idx" ON "bt_purchase_orders"("btJobId");

-- CreateIndex
CREATE INDEX "bt_purchase_orders_btVendorId_idx" ON "bt_purchase_orders"("btVendorId");

-- CreateIndex
CREATE INDEX "bt_purchase_orders_status_idx" ON "bt_purchase_orders"("status");

-- CreateIndex
CREATE INDEX "bt_purchase_order_lines_btPurchaseOrderId_idx" ON "bt_purchase_order_lines"("btPurchaseOrderId");

-- CreateIndex
CREATE INDEX "vendor_aliases_alias_idx" ON "vendor_aliases"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_aliases_btVendorId_alias_key" ON "vendor_aliases"("btVendorId", "alias");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_approval_logs_invoiceId_idx" ON "invoice_approval_logs"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_btPurchaseOrderId_fkey" FOREIGN KEY ("btPurchaseOrderId") REFERENCES "bt_purchase_orders"("btPurchaseOrderId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_purchase_orders" ADD CONSTRAINT "bt_purchase_orders_btJobId_fkey" FOREIGN KEY ("btJobId") REFERENCES "bt_jobs"("btJobId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_purchase_orders" ADD CONSTRAINT "bt_purchase_orders_btVendorId_fkey" FOREIGN KEY ("btVendorId") REFERENCES "bt_vendors"("btVendorId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_purchase_order_lines" ADD CONSTRAINT "bt_purchase_order_lines_btPurchaseOrderId_fkey" FOREIGN KEY ("btPurchaseOrderId") REFERENCES "bt_purchase_orders"("btPurchaseOrderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_btVendorId_fkey" FOREIGN KEY ("btVendorId") REFERENCES "bt_vendors"("btVendorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_aliases" ADD CONSTRAINT "vendor_aliases_btVendorId_fkey" FOREIGN KEY ("btVendorId") REFERENCES "vendor_profiles"("btVendorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_approval_logs" ADD CONSTRAINT "invoice_approval_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
