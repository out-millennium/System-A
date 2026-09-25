-- Admin account-deletion requests.
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountDeletionRequest_status_idx" ON "AccountDeletionRequest"("status");
CREATE INDEX "AccountDeletionRequest_requesterId_idx" ON "AccountDeletionRequest"("requesterId");
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
