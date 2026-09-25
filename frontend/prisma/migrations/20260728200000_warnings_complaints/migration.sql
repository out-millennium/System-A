-- Admin discipline: mute fields, warnings and complaints.
ALTER TABLE "User" ADD COLUMN "adminMutedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "adminMuteReason" TEXT;

CREATE TABLE "Warning" (
    "id" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Warning_targetId_idx" ON "Warning"("targetId");
CREATE INDEX "Warning_issuerId_idx" ON "Warning"("issuerId");
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "warningId" TEXT NOT NULL,
    "filerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");
CREATE INDEX "Complaint_warningId_idx" ON "Complaint"("warningId");
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_warningId_fkey" FOREIGN KEY ("warningId") REFERENCES "Warning"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_filerId_fkey" FOREIGN KEY ("filerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
