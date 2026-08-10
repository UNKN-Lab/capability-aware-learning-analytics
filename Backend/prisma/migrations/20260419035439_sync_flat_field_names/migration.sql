/*
  Warnings:

  - You are about to drop the column `Pstatus` on the `flat_student_summary` table. All the data in the column will be lost.
  - You are about to drop the column `has_extracurricular` on the `flat_student_summary` table. All the data in the column will be lost.
  - You are about to drop the column `has_paid_class` on the `flat_student_summary` table. All the data in the column will be lost.
  - You are about to drop the column `has_romantic` on the `flat_student_summary` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "flat_student_summary" DROP COLUMN "Pstatus",
DROP COLUMN "has_extracurricular",
DROP COLUMN "has_paid_class",
DROP COLUMN "has_romantic",
ADD COLUMN     "extracurricular_flag" BOOLEAN,
ADD COLUMN     "paid_class_flag" BOOLEAN,
ADD COLUMN     "parent_cohabitation_status" TEXT,
ADD COLUMN     "romantic_relationship_flag" BOOLEAN;
