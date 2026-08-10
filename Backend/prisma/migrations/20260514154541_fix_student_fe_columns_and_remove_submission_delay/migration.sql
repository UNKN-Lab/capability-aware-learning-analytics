/*
  Warnings:

  - You are about to drop the column `submission_delay_days` on the `assessment_result` table. All the data in the column will be lost.
  - You are about to drop the column `disadvantage_score` on the `enrollment_features` table. All the data in the column will be lost.
  - You are about to drop the column `family_stability_score` on the `enrollment_features` table. All the data in the column will be lost.
  - You are about to drop the column `lifestyle_risk_score` on the `enrollment_features` table. All the data in the column will be lost.
  - You are about to drop the column `social_balance_score` on the `enrollment_features` table. All the data in the column will be lost.
  - You are about to drop the column `support_score` on the `enrollment_features` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assessment_result" DROP COLUMN "submission_delay_days";

-- AlterTable
ALTER TABLE "enrollment_features" DROP COLUMN "disadvantage_score",
DROP COLUMN "family_stability_score",
DROP COLUMN "lifestyle_risk_score",
DROP COLUMN "social_balance_score",
DROP COLUMN "support_score";

-- AlterTable
ALTER TABLE "student" ADD COLUMN     "disadvantage_score" DOUBLE PRECISION,
ADD COLUMN     "family_stability_score" DOUBLE PRECISION,
ADD COLUMN     "lifestyle_risk_score" DOUBLE PRECISION,
ADD COLUMN     "social_balance_score" DOUBLE PRECISION,
ADD COLUMN     "support_score" DOUBLE PRECISION;
