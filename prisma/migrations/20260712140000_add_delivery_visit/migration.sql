-- CreateTable
CREATE TABLE "DeliveryVisit" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" INTEGER NOT NULL,
    "driverName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryVisit_shipmentId_idx" ON "DeliveryVisit"("shipmentId");

-- CreateIndex
CREATE INDEX "DeliveryVisit_syncedAt_idx" ON "DeliveryVisit"("syncedAt");
