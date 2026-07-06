-- Print queue dismissal flag. Non-destructive: nullable, default NULL.
-- NULL = pending print; non-null = dismissed from print window. Order itself is untouched.
ALTER TABLE "Order" ADD COLUMN "printQueueRemovedAt" TIMESTAMP(3);

CREATE INDEX "Order_status_printQueueRemovedAt_idx" ON "Order"("status", "printQueueRemovedAt");
