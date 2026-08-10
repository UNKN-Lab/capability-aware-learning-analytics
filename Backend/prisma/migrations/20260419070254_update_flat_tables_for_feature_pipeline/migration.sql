/*
  Warnings:

  - The primary key for the `flat_assessment_result` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `flat_engagement_event` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `flat_student_summary` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `import_batch_id` to the `flat_assessment_result` table without a default value. This is not possible if the table is not empty.
  - Added the required column `import_batch_id` to the `flat_engagement_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `import_batch_id` to the `flat_student_summary` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "flat_assessment_result" DROP CONSTRAINT "flat_assessment_result_pkey",
ADD COLUMN     "course_name" TEXT,
ADD COLUMN     "course_run" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD COLUMN     "import_batch_id" TEXT NOT NULL,
ADD COLUMN     "subject_area" TEXT,
ALTER COLUMN "assessment_order" DROP NOT NULL,
ALTER COLUMN "assessment_result_id" DROP NOT NULL,
ADD CONSTRAINT "flat_assessment_result_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "flat_engagement_event" DROP CONSTRAINT "flat_engagement_event_pkey",
ADD COLUMN     "age_group" TEXT,
ADD COLUMN     "course_run" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD COLUMN     "import_batch_id" TEXT NOT NULL,
ADD COLUMN     "subject_area" TEXT,
ALTER COLUMN "event_day" DROP NOT NULL,
ALTER COLUMN "engagement_event_id" DROP NOT NULL,
ADD CONSTRAINT "flat_engagement_event_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "flat_student_summary" DROP CONSTRAINT "flat_student_summary_pkey",
ADD COLUMN     "absences_rate" DOUBLE PRECISION,
ADD COLUMN     "at_risk_label" TEXT,
ADD COLUMN     "at_risk_score" INTEGER,
ADD COLUMN     "avg_score" DOUBLE PRECISION,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disadvantage_score" DOUBLE PRECISION,
ADD COLUMN     "early_warning_week" INTEGER,
ADD COLUMN     "engagement_score" DOUBLE PRECISION,
ADD COLUMN     "family_stability_score" DOUBLE PRECISION,
ADD COLUMN     "forum_engagement_rate" DOUBLE PRECISION,
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD COLUMN     "import_batch_id" TEXT NOT NULL,
ADD COLUMN     "lifestyle_risk_score" DOUBLE PRECISION,
ADD COLUMN     "performance_trend" DOUBLE PRECISION,
ADD COLUMN     "punctuality_rate" DOUBLE PRECISION,
ADD COLUMN     "quiz_engagement_rate" DOUBLE PRECISION,
ADD COLUMN     "registration_lead_time" INTEGER,
ADD COLUMN     "resource_engagement_rate" DOUBLE PRECISION,
ADD COLUMN     "score_consistency" DOUBLE PRECISION,
ADD COLUMN     "social_balance_score" DOUBLE PRECISION,
ADD COLUMN     "submission_delay_avg" DOUBLE PRECISION,
ADD COLUMN     "support_score" DOUBLE PRECISION,
ADD COLUMN     "vle_diversity_score" DOUBLE PRECISION,
ADD COLUMN     "weekly_engagement_drop" DOUBLE PRECISION,
ADD COLUMN     "withdrew_early" INTEGER,
ADD CONSTRAINT "flat_student_summary_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "flat_assessment_result_import_batch_id_idx" ON "flat_assessment_result"("import_batch_id");

-- CreateIndex
CREATE INDEX "flat_assessment_result_student_id_course_id_source_dataset_idx" ON "flat_assessment_result"("student_id", "course_id", "source_dataset");

-- CreateIndex
CREATE INDEX "flat_assessment_result_assessment_id_idx" ON "flat_assessment_result"("assessment_id");

-- CreateIndex
CREATE INDEX "flat_engagement_event_import_batch_id_idx" ON "flat_engagement_event"("import_batch_id");

-- CreateIndex
CREATE INDEX "flat_engagement_event_student_id_course_id_source_dataset_idx" ON "flat_engagement_event"("student_id", "course_id", "source_dataset");

-- CreateIndex
CREATE INDEX "flat_engagement_event_event_day_idx" ON "flat_engagement_event"("event_day");

-- CreateIndex
CREATE INDEX "flat_student_summary_import_batch_id_idx" ON "flat_student_summary"("import_batch_id");

-- CreateIndex
CREATE INDEX "flat_student_summary_student_id_course_id_source_dataset_idx" ON "flat_student_summary"("student_id", "course_id", "source_dataset");
