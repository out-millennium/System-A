-- User moderation (ban / mute) applied by admins (Stage 5).
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bannedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "mutedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mutedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "muteReason" TEXT;
