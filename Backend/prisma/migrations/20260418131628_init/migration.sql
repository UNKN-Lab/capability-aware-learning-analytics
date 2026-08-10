-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('QUIZ', 'MIDTERM', 'FINAL');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('SELF', 'INSTRUCTOR');

-- CreateTable
CREATE TABLE "ai_logs" (
    "log_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "model_name" TEXT,
    "snapshot_json" JSONB,
    "prompt_text" TEXT,
    "raw_output_text" TEXT,
    "parsed_output_json" JSONB,
    "verdict" TEXT,
    "warnings_json" JSONB,
    "latency_ms" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "classes" (
    "class_id" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "term" TEXT,
    "year" INTEGER,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("class_id")
);

-- CreateTable
CREATE TABLE "courses" (
    "course_id" TEXT NOT NULL,
    "course_name" TEXT NOT NULL,
    "credits" INTEGER,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "enrollment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("enrollment_id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "eval_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT,
    "eval_type" "EvaluationType" NOT NULL,
    "eval_date" DATE NOT NULL,
    "comment_text" TEXT,
    "rating" INTEGER,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("eval_id")
);

-- CreateTable
CREATE TABLE "scores" (
    "score_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "assessment_type" "AssessmentType" NOT NULL,
    "assessment_date" DATE NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "max_score" DOUBLE PRECISION,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("score_id")
);

-- CreateTable
CREATE TABLE "skills" (
    "skill_id" TEXT NOT NULL,
    "skill_name" TEXT NOT NULL,
    "skill_group" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("skill_id")
);

-- CreateTable
CREATE TABLE "student_skills" (
    "student_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "level" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_skills_pkey" PRIMARY KEY ("student_id","skill_id")
);

-- CreateTable
CREATE TABLE "students" (
    "student_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "gender" TEXT,
    "dob" TIMESTAMP(3),
    "class_id" TEXT NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "study_time" (
    "study_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT,
    "study_date" DATE NOT NULL,
    "minutes_spent" INTEGER NOT NULL,
    "session_count" INTEGER,

    CONSTRAINT "study_time_pkey" PRIMARY KEY ("study_id")
);

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_course_id_term_key" ON "enrollments"("student_id", "course_id", "term");

-- CreateIndex
CREATE INDEX "evaluations_course_id_idx" ON "evaluations"("course_id");

-- CreateIndex
CREATE INDEX "evaluations_eval_date_idx" ON "evaluations"("eval_date");

-- CreateIndex
CREATE INDEX "evaluations_student_id_idx" ON "evaluations"("student_id");

-- CreateIndex
CREATE INDEX "scores_assessment_date_idx" ON "scores"("assessment_date");

-- CreateIndex
CREATE INDEX "scores_course_id_idx" ON "scores"("course_id");

-- CreateIndex
CREATE INDEX "scores_student_id_idx" ON "scores"("student_id");

-- CreateIndex
CREATE INDEX "student_skills_skill_id_idx" ON "student_skills"("skill_id");

-- CreateIndex
CREATE INDEX "students_class_id_idx" ON "students"("class_id");

-- CreateIndex
CREATE INDEX "study_time_course_id_idx" ON "study_time"("course_id");

-- CreateIndex
CREATE INDEX "study_time_student_id_idx" ON "study_time"("student_id");

-- CreateIndex
CREATE INDEX "study_time_study_date_idx" ON "study_time"("study_date");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("skill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_time" ADD CONSTRAINT "study_time_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_time" ADD CONSTRAINT "study_time_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;
