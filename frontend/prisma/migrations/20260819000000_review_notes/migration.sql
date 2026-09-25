-- Optional "reason for rejection/dismissal" that a reviewer can attach when
-- turning down an appeal, application or request. Nullable everywhere, so this
-- is a safe additive migration with no backfill needed.
ALTER TABLE "Complaint" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "AdminApplication" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "ModerationAppeal" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "AccountDeletionRequest" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "ApiKeyRevocationRequest" ADD COLUMN "reviewNote" TEXT;
