/*
  Warnings:

  - You are about to drop the `enrollment_features` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `flat_assessment_result` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `flat_enrollment_master` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "enrollment_features" DROP CONSTRAINT "enrollment_features_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "enrollment_features" DROP CONSTRAINT "enrollment_features_enrollment_id_fkey";

-- DropForeignKey
ALTER TABLE "flat_assessment_result" DROP CONSTRAINT "flat_assessment_result_import_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "flat_enrollment_master" DROP CONSTRAINT "flat_enrollment_master_import_batch_id_fkey";

-- AlterTable
ALTER TABLE "engagement" ADD COLUMN     "engagement_level" TEXT;

-- AlterTable
ALTER TABLE "enrollment" ADD COLUMN     "is_passed" BOOLEAN;

-- DropTable
DROP TABLE "enrollment_features";

-- DropTable
DROP TABLE "flat_assessment_result";

-- DropTable
DROP TABLE "flat_enrollment_master";
