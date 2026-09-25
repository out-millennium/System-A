-- Applications to become an admin.
CREATE TABLE "AdminApplication" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedLevel" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "AdminApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminApplication_status_idx" ON "AdminApplication"("status");
CREATE INDEX "AdminApplication_applicantId_idx" ON "AdminApplication"("applicantId");
ALTER TABLE "AdminApplication"
    ADD CONSTRAINT "AdminApplication_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
