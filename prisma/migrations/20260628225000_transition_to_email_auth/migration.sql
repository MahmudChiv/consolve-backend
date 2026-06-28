-- Migration: transition_to_email_auth
-- Replace phoneNumber with email on the User table.
-- Existing test rows are given a placeholder email so the NOT NULL + UNIQUE constraint is satisfied.
-- These test rows should be deleted from the Railway dashboard / Prisma Studio before going live.

-- Step 1: Add email as nullable first so we can populate it for existing rows
ALTER TABLE "User" ADD COLUMN "email" TEXT;

-- Step 2: Back-fill existing rows with a unique placeholder derived from their id
UPDATE "User" SET "email" = 'migrated_' || id || '@placeholder.invalid';

-- Step 3: Make the column NOT NULL now that every row has a value
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- Step 4: Drop the old phoneNumber column (and its index/unique constraint)
DROP INDEX IF EXISTS "User_phoneNumber_idx";
ALTER TABLE "User" DROP COLUMN "phoneNumber";

-- Step 5: Create unique constraint and index on email
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");
