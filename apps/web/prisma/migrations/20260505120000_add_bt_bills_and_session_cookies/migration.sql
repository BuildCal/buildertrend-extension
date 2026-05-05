-- The encryptedCookies column already exists on BTSessionStatus (added via
-- raw SQL from session_store.py earlier in development). This migration
-- formalises it in the migration history. Idempotent.
ALTER TABLE "BTSessionStatus" ADD COLUMN IF NOT EXISTS "encryptedCookies" TEXT;

-- New mirror table for BT bills.
CREATE TABLE IF NOT EXISTS "bt_bills" (
    "btBillId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "btJobId" INTEGER,
    "btVendorId" INTEGER,
    "btPurchaseOrderId" INTEGER,
    "billNumber" TEXT,
    "billTitle" TEXT,
    "paymentAmount" DECIMAL(12,2),
    "invoicedDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "isPastDue" BOOLEAN NOT NULL DEFAULT false,
    "payToName" TEXT,
    "paymentStatus" INTEGER,
    "purchaseOrderNumber" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_bills_pkey" PRIMARY KEY ("btBillId")
);

CREATE INDEX IF NOT EXISTS "bt_bills_builderId_idx" ON "bt_bills"("builderId");
CREATE INDEX IF NOT EXISTS "bt_bills_btJobId_idx" ON "bt_bills"("btJobId");
CREATE INDEX IF NOT EXISTS "bt_bills_btVendorId_idx" ON "bt_bills"("btVendorId");
CREATE INDEX IF NOT EXISTS "bt_bills_btPurchaseOrderId_idx" ON "bt_bills"("btPurchaseOrderId");
CREATE INDEX IF NOT EXISTS "bt_bills_paymentStatus_idx" ON "bt_bills"("paymentStatus");
CREATE INDEX IF NOT EXISTS "bt_bills_invoicedDate_idx" ON "bt_bills"("invoicedDate");

-- Foreign keys (added separately so we can use IF NOT EXISTS pattern via
-- DO blocks, since FK constraints don't support IF NOT EXISTS directly).
DO $$ BEGIN
    ALTER TABLE "bt_bills" ADD CONSTRAINT "bt_bills_btJobId_fkey"
        FOREIGN KEY ("btJobId") REFERENCES "bt_jobs"("btJobId")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "bt_bills" ADD CONSTRAINT "bt_bills_btVendorId_fkey"
        FOREIGN KEY ("btVendorId") REFERENCES "bt_vendors"("btVendorId")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "bt_bills" ADD CONSTRAINT "bt_bills_btPurchaseOrderId_fkey"
        FOREIGN KEY ("btPurchaseOrderId") REFERENCES "bt_purchase_orders"("btPurchaseOrderId")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
