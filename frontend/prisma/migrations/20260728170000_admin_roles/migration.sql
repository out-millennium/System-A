-- Admin roles: role ("user"/"admin") and adminLevel (1..5, null for users).
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "User" ADD COLUMN "adminLevel" INTEGER;
