-- Make credential columns optional (OAuth-first / pending accounts).
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "accountName" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "apiKey" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Onboarding flag. Existing rows are already fully set up -> mark onboarded.
ALTER TABLE "User" ADD COLUMN "onboarded" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "onboarded" = true WHERE "accountName" IS NOT NULL AND "apiKey" IS NOT NULL;

-- Linked sign-in methods (credentials / google / github).
CREATE TABLE "LinkedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LinkedAccount_provider_providerAccountId_key"
    ON "LinkedAccount"("provider", "providerAccountId");
CREATE INDEX "LinkedAccount_userId_idx" ON "LinkedAccount"("userId");

ALTER TABLE "LinkedAccount"
    ADD CONSTRAINT "LinkedAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill a credentials sign-in method for every pre-existing account so
-- they can continue to sign in with email/password.
INSERT INTO "LinkedAccount" ("id", "userId", "provider", "providerAccountId", "email", "createdAt")
SELECT
    'cred_' || "id",
    "id",
    'credentials',
    "id",
    "email",
    CURRENT_TIMESTAMP
FROM "User"
WHERE "password" IS NOT NULL;
