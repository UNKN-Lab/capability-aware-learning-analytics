/*
  Warnings:

  - You are about to drop the `flat_engagement_event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `flat_student_summary` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "flat_engagement_event";

-- DropTable
DROP TABLE "flat_student_summary";

-- CreateTable
CREATE TABLE "student" (
    "student_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "gender" TEXT,
    "age_years" INTEGER,
    "age_group" TEXT,
    "region" TEXT,
    "residence_area" TEXT,
    "school" TEXT,
    "family_size" TEXT,
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
    "parent_cohabitation_status" TEXT,
    "travel_time" INTEGER,
    "free_time" INTEGER,
    "go_out_freq" INTEGER,
    "alcohol_weekday" INTEGER,
    "alcohol_weekend" INTEGER,
    "health_status" INTEGER,
    "family_relation" INTEGER,
    "has_romantic" BOOLEAN,
    "has_extracurricular" BOOLEAN,
    "has_paid_class" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "student_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "course" (
    "course_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "course_name" TEXT,
    "subject_area" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "class" (
    "class_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "class_run" TEXT,
    "semester" TEXT,
    "academic_year" TEXT,
    "duration_days" INTEGER,
    "delivery_mode" TEXT,
    "platform" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "class_pkey" PRIMARY KEY ("class_id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "enrollment_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "enrollment_start_day" INTEGER,
    "enrollment_end_day" INTEGER,
    "final_outcome" TEXT,
    "previous_attempt_count" INTEGER,
    "study_load_credits" INTEGER,
    "absences" INTEGER,
    "studytime" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("enrollment_id")
);

-- CreateTable
CREATE TABLE "assessment" (
    "assessment_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "assessment_name" TEXT,
    "assessment_type" TEXT,
    "assessment_order" INTEGER,
    "due_day" INTEGER,
    "weight_pct" DOUBLE PRECISION,
    "is_final_assessment" BOOLEAN,
    "competency_tag" TEXT,
    "week_of_class" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("assessment_id")
);

-- CreateTable
CREATE TABLE "assessment_result" (
    "result_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "score_raw" DOUBLE PRECISION,
    "score_normalized" DOUBLE PRECISION,
    "pass_flag" BOOLEAN,
    "submission_day" INTEGER,
    "submission_delay_days" INTEGER,
    "is_banked" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_result_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "event" (
    "event_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "resource_id" TEXT,
    "resource_type" TEXT,
    "available_from_week" INTEGER,
    "available_to_week" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "engagement" (
    "engagement_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "event_day" INTEGER,
    "week_number" INTEGER,
    "engagement_count" INTEGER,
    "log_click_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_pkey" PRIMARY KEY ("engagement_id")
);

-- CreateTable
CREATE TABLE "enrollment_features" (
    "ef_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "lifestyle_risk_score" DOUBLE PRECISION,
    "support_score" DOUBLE PRECISION,
    "social_balance_score" DOUBLE PRECISION,
    "family_stability_score" DOUBLE PRECISION,
    "disadvantage_score" DOUBLE PRECISION,
    "avg_score" DOUBLE PRECISION,
    "performance_trend" DOUBLE PRECISION,
    "score_consistency" DOUBLE PRECISION,
    "pass_rate" DOUBLE PRECISION,
    "total_engagement_count" INTEGER,
    "active_day_count" INTEGER,
    "study_effort_level" TEXT,
    "engagement_score" DOUBLE PRECISION,
    "consistency_level" TEXT,
    "vle_diversity_score" DOUBLE PRECISION,
    "forum_engagement_rate" DOUBLE PRECISION,
    "quiz_engagement_rate" DOUBLE PRECISION,
    "resource_engagement_rate" DOUBLE PRECISION,
    "weekly_engagement_drop" DOUBLE PRECISION,
    "early_warning_week" INTEGER,
    "absences_rate" DOUBLE PRECISION,
    "punctuality_rate" DOUBLE PRECISION,
    "submission_delay_avg" DOUBLE PRECISION,
    "registration_lead_time" INTEGER,
    "withdrew_early" BOOLEAN,
    "at_risk_score" INTEGER,
    "at_risk_label" TEXT,

    CONSTRAINT "enrollment_features_pkey" PRIMARY KEY ("ef_id")
);

-- CreateTable
CREATE TABLE "flat_enrollment_master" (
    "id" BIGSERIAL NOT NULL,
    "import_batch_id" TEXT NOT NULL,
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
    "has_romantic" BOOLEAN,
    "has_extracurricular" BOOLEAN,
    "has_paid_class" BOOLEAN,
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
    "parent_cohabitation_status" TEXT,
    "course_name" TEXT,
    "subject_area" TEXT,
    "course_run" TEXT,
    "course_duration_days" INTEGER,
    "study_load_credits" INTEGER,
    "final_outcome" TEXT,
    "previous_attempt_count" INTEGER,
    "enrollment_start_day" INTEGER,
    "enrollment_end_day" INTEGER,
    "total_engagement_count" INTEGER,
    "active_day_count" INTEGER,
    "absence_count" INTEGER,
    "study_effort_level" TEXT,
    "consistency_level" TEXT,
    "avg_score" DOUBLE PRECISION,
    "performance_trend" DOUBLE PRECISION,
    "score_consistency" DOUBLE PRECISION,
    "absences_rate" DOUBLE PRECISION,
    "punctuality_rate" DOUBLE PRECISION,
    "engagement_score" DOUBLE PRECISION,
    "vle_diversity_score" DOUBLE PRECISION,
    "forum_engagement_rate" DOUBLE PRECISION,
    "quiz_engagement_rate" DOUBLE PRECISION,
    "resource_engagement_rate" DOUBLE PRECISION,
    "weekly_engagement_drop" DOUBLE PRECISION,
    "early_warning_week" INTEGER,
    "submission_delay_avg" DOUBLE PRECISION,
    "registration_lead_time" INTEGER,
    "withdrew_early" BOOLEAN,
    "at_risk_score" INTEGER,
    "at_risk_label" TEXT,
    "lifestyle_risk_score" DOUBLE PRECISION,
    "support_score" DOUBLE PRECISION,
    "social_balance_score" DOUBLE PRECISION,
    "family_stability_score" DOUBLE PRECISION,
    "disadvantage_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flat_enrollment_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "batch_id" TEXT NOT NULL,
    "batch_name" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "learning_mode" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "upload_session" (
    "session_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_session_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "student_batch_id_idx" ON "student"("batch_id");

-- CreateIndex
CREATE INDEX "student_source_dataset_idx" ON "student"("source_dataset");

-- CreateIndex
CREATE INDEX "course_batch_id_idx" ON "course"("batch_id");

-- CreateIndex
CREATE INDEX "class_batch_id_idx" ON "class"("batch_id");

-- CreateIndex
CREATE INDEX "class_course_id_idx" ON "class"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_batch_id_course_id_class_run_key" ON "class"("batch_id", "course_id", "class_run");

-- CreateIndex
CREATE INDEX "enrollment_batch_id_idx" ON "enrollment"("batch_id");

-- CreateIndex
CREATE INDEX "enrollment_student_id_idx" ON "enrollment"("student_id");

-- CreateIndex
CREATE INDEX "enrollment_class_id_idx" ON "enrollment"("class_id");

-- CreateIndex
CREATE INDEX "enrollment_student_id_class_id_source_dataset_idx" ON "enrollment"("student_id", "class_id", "source_dataset");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_batch_id_student_id_class_id_key" ON "enrollment"("batch_id", "student_id", "class_id");

-- CreateIndex
CREATE INDEX "assessment_batch_id_idx" ON "assessment"("batch_id");

-- CreateIndex
CREATE INDEX "assessment_class_id_idx" ON "assessment"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_batch_id_class_id_assessment_order_key" ON "assessment"("batch_id", "class_id", "assessment_order");

-- CreateIndex
CREATE INDEX "assessment_result_batch_id_idx" ON "assessment_result"("batch_id");

-- CreateIndex
CREATE INDEX "assessment_result_assessment_id_idx" ON "assessment_result"("assessment_id");

-- CreateIndex
CREATE INDEX "assessment_result_student_id_idx" ON "assessment_result"("student_id");

-- CreateIndex
CREATE INDEX "assessment_result_enrollment_id_idx" ON "assessment_result"("enrollment_id");

-- CreateIndex
CREATE INDEX "assessment_result_student_id_source_dataset_idx" ON "assessment_result"("student_id", "source_dataset");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_result_batch_id_enrollment_id_assessment_id_key" ON "assessment_result"("batch_id", "enrollment_id", "assessment_id");

-- CreateIndex
CREATE INDEX "event_batch_id_idx" ON "event"("batch_id");

-- CreateIndex
CREATE INDEX "event_class_id_idx" ON "event"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_batch_id_class_id_resource_id_key" ON "event"("batch_id", "class_id", "resource_id");

-- CreateIndex
CREATE INDEX "engagement_batch_id_idx" ON "engagement"("batch_id");

-- CreateIndex
CREATE INDEX "engagement_event_id_idx" ON "engagement"("event_id");

-- CreateIndex
CREATE INDEX "engagement_student_id_idx" ON "engagement"("student_id");

-- CreateIndex
CREATE INDEX "engagement_enrollment_id_idx" ON "engagement"("enrollment_id");

-- CreateIndex
CREATE INDEX "engagement_week_number_idx" ON "engagement"("week_number");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_batch_id_student_id_event_id_event_day_key" ON "engagement"("batch_id", "student_id", "event_id", "event_day");

-- CreateIndex
CREATE INDEX "enrollment_features_batch_id_idx" ON "enrollment_features"("batch_id");

-- CreateIndex
CREATE INDEX "enrollment_features_enrollment_id_idx" ON "enrollment_features"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_features_enrollment_id_key" ON "enrollment_features"("enrollment_id");

-- CreateIndex
CREATE INDEX "flat_enrollment_master_import_batch_id_idx" ON "flat_enrollment_master"("import_batch_id");

-- CreateIndex
CREATE INDEX "flat_enrollment_master_student_id_course_id_source_dataset_idx" ON "flat_enrollment_master"("student_id", "course_id", "source_dataset");

-- CreateIndex
CREATE INDEX "upload_session_expires_at_idx" ON "upload_session"("expires_at");

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessment"("assessment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollment"("enrollment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollment"("enrollment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_features" ADD CONSTRAINT "enrollment_features_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_features" ADD CONSTRAINT "enrollment_features_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollment"("enrollment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flat_enrollment_master" ADD CONSTRAINT "flat_enrollment_master_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flat_assessment_result" ADD CONSTRAINT "flat_assessment_result_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batch"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;
