-- Gateway mirrors, sync state, command log.
-- rawHash on existing mirrors is nullable so the Python bill sync stays compatible.

ALTER TABLE "bt_jobs" ADD COLUMN IF NOT EXISTS "rawHash" TEXT;
ALTER TABLE "bt_purchase_orders" ADD COLUMN IF NOT EXISTS "rawHash" TEXT;
ALTER TABLE "bt_bills" ADD COLUMN IF NOT EXISTS "rawHash" TEXT;

CREATE TABLE "bt_leads" (
    "btLeadId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "btJobId" INTEGER,
    "title" TEXT,
    "status" TEXT,
    "amount" DECIMAL(12,2),
    "rawHash" TEXT,
    "extra" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_leads_pkey" PRIMARY KEY ("btLeadId")
);

CREATE TABLE "bt_contacts" (
    "btContactId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "rawHash" TEXT,
    "extra" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_contacts_pkey" PRIMARY KEY ("btContactId")
);

CREATE TABLE "bt_invoices" (
    "btInvoiceId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "btJobId" INTEGER,
    "title" TEXT,
    "status" TEXT,
    "amount" DECIMAL(12,2),
    "rawHash" TEXT,
    "extra" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_invoices_pkey" PRIMARY KEY ("btInvoiceId")
);

CREATE TABLE "bt_variations" (
    "btVariationId" INTEGER NOT NULL,
    "builderId" INTEGER NOT NULL,
    "btJobId" INTEGER,
    "title" TEXT,
    "status" TEXT,
    "amount" DECIMAL(12,2),
    "rawHash" TEXT,
    "extra" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_variations_pkey" PRIMARY KEY ("btVariationId")
);

CREATE TABLE "bt_sync_state" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lastPulledHash" TEXT,
    "lastPulledAt" TIMESTAMP(3),
    "lastPushedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bt_sync_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bt_command_log" (
    "id" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "payloadSummary" JSONB NOT NULL,
    "btStatus" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_command_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bt_leads_builderId_idx" ON "bt_leads"("builderId");
CREATE INDEX "bt_contacts_builderId_idx" ON "bt_contacts"("builderId");
CREATE INDEX "bt_contacts_name_idx" ON "bt_contacts"("name");
CREATE INDEX "bt_invoices_builderId_idx" ON "bt_invoices"("builderId");
CREATE INDEX "bt_invoices_btJobId_idx" ON "bt_invoices"("btJobId");
CREATE INDEX "bt_variations_builderId_idx" ON "bt_variations"("builderId");
CREATE INDEX "bt_variations_btJobId_idx" ON "bt_variations"("btJobId");
CREATE UNIQUE INDEX "bt_sync_state_entityType_externalId_key" ON "bt_sync_state"("entityType", "externalId");
CREATE INDEX "bt_sync_state_entityType_idx" ON "bt_sync_state"("entityType");
CREATE INDEX "bt_command_log_verb_idx" ON "bt_command_log"("verb");
CREATE INDEX "bt_command_log_createdAt_idx" ON "bt_command_log"("createdAt");
