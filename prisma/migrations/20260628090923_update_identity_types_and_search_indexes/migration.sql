/*
  Warnings:

  - The `expertise` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `experience` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `availability` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `pricing` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `latitude` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `longitude` column on the `Identity` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Identity" DROP COLUMN "expertise",
ADD COLUMN     "expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "experience",
ADD COLUMN     "experience" INTEGER,
DROP COLUMN "availability",
ADD COLUMN     "availability" JSONB,
DROP COLUMN "pricing",
ADD COLUMN     "pricing" JSONB,
DROP COLUMN "latitude",
ADD COLUMN     "latitude" DOUBLE PRECISION,
DROP COLUMN "longitude",
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Identity_profession_idx" ON "Identity"("profession");

-- CreateIndex
CREATE INDEX "Identity_city_state_idx" ON "Identity"("city", "state");

-- CreateIndex
CREATE INDEX "Identity_deletedAt_idx" ON "Identity"("deletedAt");
