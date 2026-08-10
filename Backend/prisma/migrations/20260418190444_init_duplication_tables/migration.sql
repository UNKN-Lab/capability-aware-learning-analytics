/*
  Warnings:

  - You are about to drop the `dim_assessment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `dim_course_context` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `dim_student_profile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fact_assessment_result` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fact_engagement_event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fact_engagement_summary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fact_enrollment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "dim_assessment" DROP CONSTRAINT "dim_assessment_courseSk_fkey";

-- DropForeignKey
ALTER TABLE "fact_assessment_result" DROP CONSTRAINT "fact_assessment_result_assessmentSk_fkey";

-- DropForeignKey
ALTER TABLE "fact_assessment_result" DROP CONSTRAINT "fact_assessment_result_enrollmentSk_fkey";

-- DropForeignKey
ALTER TABLE "fact_engagement_event" DROP CONSTRAINT "fact_engagement_event_enrollmentSk_fkey";

-- DropForeignKey
ALTER TABLE "fact_engagement_summary" DROP CONSTRAINT "fact_engagement_summary_enrollmentSk_fkey";

-- DropForeignKey
ALTER TABLE "fact_enrollment" DROP CONSTRAINT "fact_enrollment_courseSk_fkey";

-- DropForeignKey
ALTER TABLE "fact_enrollment" DROP CONSTRAINT "fact_enrollment_studentSk_fkey";

-- DropTable
DROP TABLE "dim_assessment";

-- DropTable
DROP TABLE "dim_course_context";

-- DropTable
DROP TABLE "dim_student_profile";

-- DropTable
DROP TABLE "fact_assessment_result";

-- DropTable
DROP TABLE "fact_engagement_event";

-- DropTable
DROP TABLE "fact_engagement_summary";

-- DropTable
DROP TABLE "fact_enrollment";

-- CreateTable
CREATE TABLE "flat_student_summary" (
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "gender" TEXT,
    "age_group" TEXT,
    "region" TEXT,
    "residence_area" TEXT,
    "highest_education" TEXT,
    "socioeconomic_band" TEXT,
    "imd_score_numeric" DOUBLE PRECISION,
    "disability_flag" BOOLEAN,
    "higher_education_intent_flag" BOOLEAN,
    "internet_access_flag" BOOLEAN,
    "school_support_flag" BOOLEAN,
    "family_support_flag" BOOLEAN,
    "mother_education_level" TEXT,
    "father_education_level" TEXT,
    "mother_job" TEXT,
    "father_job" TEXT,
    "guardian_type" TEXT,
    "family_relation" INTEGER,
    "travel_time" INTEGER,
    "free_time" INTEGER,
    "go_out_freq" INTEGER,
    "alcohol_weekday" INTEGER,
    "alcohol_weekend" INTEGER,
    "health_status" INTEGER,
    "Pstatus" TEXT,
    "has_romantic" BOOLEAN,
    "has_extracurricular" BOOLEAN,
    "has_paid_class" BOOLEAN,
    "course_name" TEXT,
    "subject_area" TEXT,
    "course_run" TEXT,
    "course_duration_days" INTEGER,
    "final_outcome" TEXT,
    "previous_attempt_count" INTEGER,
    "study_load_credits" INTEGER,
    "enrollment_start_day" INTEGER,
    "enrollment_end_day" INTEGER,
    "total_engagement_count" INTEGER,
    "active_day_count" INTEGER,
    "absence_count" INTEGER,
    "study_effort_level" TEXT,
    "consistency_level" TEXT,

    CONSTRAINT "flat_student_summary_pkey" PRIMARY KEY ("student_id","course_id","source_dataset")
);

-- CreateTable
CREATE TABLE "flat_assessment_result" (
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "assessment_order" INTEGER NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "assessment_result_id" TEXT NOT NULL,
    "assessment_id" TEXT,
    "score_normalized" DOUBLE PRECISION,
    "submission_day" INTEGER,
    "submission_delay_days" INTEGER,
    "is_banked" BOOLEAN,
    "pass_flag" BOOLEAN,
    "assessment_name" TEXT,
    "assessment_type" TEXT,
    "assessment_due_day" INTEGER,
    "assessment_weight_pct" DOUBLE PRECISION,
    "is_final_assessment" BOOLEAN,
    "final_outcome" TEXT,
    "gender" TEXT,
    "age_group" TEXT,

    CONSTRAINT "flat_assessment_result_pkey" PRIMARY KEY ("assessment_result_id","student_id","course_id","source_dataset")
);

-- CreateTable
CREATE TABLE "flat_engagement_event" (
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "event_day" INTEGER NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "engagement_event_id" TEXT NOT NULL,
    "resource_id" TEXT,
    "resource_type" TEXT,
    "engagement_count" INTEGER,
    "course_name" TEXT,
    "gender" TEXT,
    "final_outcome" TEXT,

    CONSTRAINT "flat_engagement_event_pkey" PRIMARY KEY ("engagement_event_id","student_id","course_id","source_dataset")
);
