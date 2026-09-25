-- Permanent "was ever banned" mark. Once true it is never cleared, so a
-- once-banned account can never revoke its own API key or delete its account.
ALTER TABLE "User" ADD COLUMN "wasBanned" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any account that currently has a ban recorded is marked.
UPDATE "User" SET "wasBanned" = true WHERE "bannedAt" IS NOT NULL;
