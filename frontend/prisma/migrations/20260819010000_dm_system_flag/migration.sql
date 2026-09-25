-- System-generated direct-message receipts (e.g. "your appeal was reviewed").
-- Additive columns: safe for existing rows.
ALTER TABLE "DirectMessage" ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false;
-- Source activity id for a receipt, so each event produces exactly one receipt.
ALTER TABLE "DirectMessage" ADD COLUMN "refId" TEXT;
CREATE UNIQUE INDEX "DirectMessage_refId_key" ON "DirectMessage"("refId");
