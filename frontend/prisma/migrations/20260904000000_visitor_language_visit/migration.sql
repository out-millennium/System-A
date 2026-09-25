-- Pseudonymous first-visit language gate.
-- Raw IP addresses are never stored; the application stores a keyed HMAC only.
CREATE TABLE "VisitorLanguageVisit" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitorLanguageVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitorLanguageVisit_ipHash_key" ON "VisitorLanguageVisit"("ipHash");
CREATE INDEX "VisitorLanguageVisit_lastSeenAt_idx" ON "VisitorLanguageVisit"("lastSeenAt");
