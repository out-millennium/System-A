-- Appeals against ban/mute (reviewed one level above the actor).
CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "filerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModerationAppeal_status_idx" ON "ModerationAppeal"("status");
CREATE INDEX "ModerationAppeal_actionId_idx" ON "ModerationAppeal"("actionId");
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ModerationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_filerId_fkey" FOREIGN KEY ("filerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
