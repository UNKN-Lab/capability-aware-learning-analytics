/*
  Warnings:

  - You are about to drop the column `engagement_level` on the `engagement` table. All the data in the column will be lost.
  - You are about to drop the column `is_passed` on the `enrollment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "engagement" DROP COLUMN "engagement_level";

-- AlterTable
ALTER TABLE "enrollment" DROP COLUMN "is_passed";

-- CreateTable
CREATE TABLE "alias_memory" (
    "id" SERIAL NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "raw_column" TEXT NOT NULL,
    "canonical_field" TEXT NOT NULL,
    "learned_count" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alias_memory_normalized_key_key" ON "alias_memory"("normalized_key");

-- CreateIndex
CREATE INDEX "alias_memory_normalized_key_idx" ON "alias_memory"("normalized_key");
