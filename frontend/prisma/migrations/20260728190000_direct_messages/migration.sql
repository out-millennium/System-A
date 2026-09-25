-- Direct messages from admins (level >=2) to users.
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectMessage_recipientId_idx" ON "DirectMessage"("recipientId");
CREATE INDEX "DirectMessage_senderId_idx" ON "DirectMessage"("senderId");
ALTER TABLE "DirectMessage"
    ADD CONSTRAINT "DirectMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage"
    ADD CONSTRAINT "DirectMessage_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
