-- Initial OPS-INTAKE-01 slice schema.

CREATE TYPE "SessionStatus" AS ENUM (
  'created',
  'awaiting_extraction',
  'ready_for_review',
  'completed'
);

CREATE TYPE "OrderStatus" AS ENUM (
  'captured',
  'extracted',
  're_extracted',
  'submitted',
  'awaiting_merchant'
);

CREATE TABLE "Merchant" (
  "id" TEXT NOT NULL,
  "wpUserId" INTEGER NOT NULL,
  "merchantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "status" "SessionStatus" NOT NULL,
  "photoCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "photoUrl" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "aiFields" JSONB,
  "correctedFields" JSONB,
  "confidence" DOUBLE PRECISION,
  "shipmentId" TEXT,
  "reviewedBy" TEXT,
  "submittedAt" TIMESTAMP(3),
  "claimedBy" TEXT,
  "claimedAt" TIMESTAMP(3),

  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Extraction" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "rawRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Correction" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "aiValue" TEXT NOT NULL,
  "correctedValue" TEXT NOT NULL,
  "correctedBy" TEXT NOT NULL,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionLog" (
  "id" BIGSERIAL NOT NULL,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB,

  CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Merchant_wpUserId_key" ON "Merchant"("wpUserId");
CREATE UNIQUE INDEX "Order_sessionId_sequence_key" ON "Order"("sessionId", "sequence");
CREATE UNIQUE INDEX "Extraction_orderId_key" ON "Extraction"("orderId");

CREATE INDEX "Session_status_createdAt_idx" ON "Session"("status", "createdAt");
CREATE INDEX "Order_sessionId_status_idx" ON "Order"("sessionId", "status");
CREATE INDEX "ActionLog_entity_entityId_idx" ON "ActionLog"("entity", "entityId");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Extraction"
  ADD CONSTRAINT "Extraction_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Correction"
  ADD CONSTRAINT "Correction_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
