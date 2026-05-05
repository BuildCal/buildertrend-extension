-- Drop foreign key constraints on bt_bills.
--
-- Mirror tables aren't all fully synced yet — bills can reference POs that
-- haven't been imported because we haven't built PO sync yet. The FKs
-- cause spurious rejections. Re-add them once all source tables sync.

ALTER TABLE "bt_bills" DROP CONSTRAINT IF EXISTS "bt_bills_btJobId_fkey";
ALTER TABLE "bt_bills" DROP CONSTRAINT IF EXISTS "bt_bills_btVendorId_fkey";
ALTER TABLE "bt_bills" DROP CONSTRAINT IF EXISTS "bt_bills_btPurchaseOrderId_fkey";
