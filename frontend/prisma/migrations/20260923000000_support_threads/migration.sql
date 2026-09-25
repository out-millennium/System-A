-- User-to-admin support threads, escalation, photo attachment, and message complaints.
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'support',
    "requestedLevel" INTEGER NOT NULL,
    "assignedLevel" INTEGER NOT NULL,
    "assignedAdminId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'message',
    "attachmentData" TEXT,
    "attachmentMime" TEXT,
    "attachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessageComplaint" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filerId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "SupportMessageComplaint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");
CREATE INDEX "SupportTicket_assignedAdminId_status_idx" ON "SupportTicket"("assignedAdminId", "status");
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE INDEX "SupportMessage_authorId_createdAt_idx" ON "SupportMessage"("authorId", "createdAt");
CREATE UNIQUE INDEX "SupportMessageComplaint_messageId_filerId_key" ON "SupportMessageComplaint"("messageId", "filerId");
CREATE INDEX "SupportMessageComplaint_status_createdAt_idx" ON "SupportMessageComplaint"("status", "createdAt");
CREATE INDEX "SupportMessageComplaint_filerId_createdAt_idx" ON "SupportMessageComplaint"("filerId", "createdAt");

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessageComplaint"
  ADD CONSTRAINT "SupportMessageComplaint_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessageComplaint"
  ADD CONSTRAINT "SupportMessageComplaint_filerId_fkey"
  FOREIGN KEY ("filerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessageComplaint"
  ADD CONSTRAINT "SupportMessageComplaint_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
