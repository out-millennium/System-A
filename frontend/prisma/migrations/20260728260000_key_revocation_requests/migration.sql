-- Admin API-key revocation requests.
CREATE TABLE "ApiKeyRevocationRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ApiKeyRevocationRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApiKeyRevocationRequest_status_idx" ON "ApiKeyRevocationRequest"("status");
CREATE INDEX "ApiKeyRevocationRequest_requesterId_idx" ON "ApiKeyRevocationRequest"("requesterId");
ALTER TABLE "ApiKeyRevocationRequest" ADD CONSTRAINT "ApiKeyRevocationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
