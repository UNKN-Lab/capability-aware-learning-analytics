/*
  Warnings:

  - You are about to drop the `ai_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `classes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `courses` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `enrollments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `evaluations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scores` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `skills` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `student_skills` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `students` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `study_time` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_course_id_fkey";

-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_student_id_fkey";

-- DropForeignKey
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_course_id_fkey";

-- DropForeignKey
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_student_id_fkey";

-- DropForeignKey
ALTER TABLE "scores" DROP CONSTRAINT "scores_course_id_fkey";

-- DropForeignKey
ALTER TABLE "scores" DROP CONSTRAINT "scores_student_id_fkey";

-- DropForeignKey
ALTER TABLE "student_skills" DROP CONSTRAINT "student_skills_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "student_skills" DROP CONSTRAINT "student_skills_student_id_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_class_id_fkey";

-- DropForeignKey
ALTER TABLE "study_time" DROP CONSTRAINT "study_time_course_id_fkey";

-- DropForeignKey
ALTER TABLE "study_time" DROP CONSTRAINT "study_time_student_id_fkey";

-- DropTable
DROP TABLE "ai_logs";

-- DropTable
DROP TABLE "classes";

-- DropTable
DROP TABLE "courses";

-- DropTable
DROP TABLE "enrollments";

-- DropTable
DROP TABLE "evaluations";

-- DropTable
DROP TABLE "scores";

-- DropTable
DROP TABLE "skills";

-- DropTable
DROP TABLE "student_skills";

-- DropTable
DROP TABLE "students";

-- DropTable
DROP TABLE "study_time";

-- DropEnum
DROP TYPE "AssessmentType";

-- DropEnum
DROP TYPE "EvaluationType";

-- CreateTable
CREATE TABLE "dim_student_profile" (
    "studentSk" SERIAL NOT NULL,
    "sourceDataset" TEXT NOT NULL,
    "sourceStudentId" TEXT NOT NULL,
    "studentNk" TEXT NOT NULL,
    "gender" TEXT,
    "ageYears" INTEGER,
    "ageGroup" TEXT,
    "region" TEXT,
    "residenceArea" TEXT,
    "highestEducation" TEXT,
    "socioeconomicBand" TEXT,
    "imdScoreNumeric" DOUBLE PRECISION,
    "disabilityFlag" BOOLEAN,
    "higherEducationIntentFlag" BOOLEAN,
    "internetAccessFlag" BOOLEAN,
    "schoolSupportFlag" BOOLEAN,
    "familySupportFlag" BOOLEAN,
    "motherEducationLevel" TEXT,
    "fatherEducationLevel" TEXT,
    "motherJob" TEXT,
    "fatherJob" TEXT,
    "guardianType" TEXT,
    "travelTime" INTEGER,
    "freeTime" INTEGER,
    "goOutFreq" INTEGER,
    "alcoholWeekday" INTEGER,
    "alcoholWeekend" INTEGER,
    "healthStatus" INTEGER,
    "pstatus" TEXT,
    "familyRelation" INTEGER,
    "hasRomantic" BOOLEAN,
    "hasExtracurricular" BOOLEAN,
    "hasPaidClass" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dim_student_profile_pkey" PRIMARY KEY ("studentSk")
);

-- CreateTable
CREATE TABLE "dim_course_context" (
    "courseSk" SERIAL NOT NULL,
    "sourceDataset" TEXT NOT NULL,
    "sourceCourseId" TEXT NOT NULL,
    "courseNk" TEXT NOT NULL,
    "courseRun" TEXT,
    "courseName" TEXT,
    "subjectArea" TEXT,
    "courseDurationDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dim_course_context_pkey" PRIMARY KEY ("courseSk")
);

-- CreateTable
CREATE TABLE "dim_assessment" (
    "assessmentSk" SERIAL NOT NULL,
    "courseSk" INTEGER NOT NULL,
    "sourceDataset" TEXT NOT NULL,
    "sourceAssessmentId" TEXT NOT NULL,
    "assessmentNk" TEXT NOT NULL,
    "assessmentName" TEXT NOT NULL,
    "assessmentType" TEXT,
    "assessmentOrder" INTEGER,
    "assessmentDueDay" INTEGER,
    "assessmentWeightPct" DOUBLE PRECISION,
    "isFinalAssessment" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dim_assessment_pkey" PRIMARY KEY ("assessmentSk")
);

-- CreateTable
CREATE TABLE "fact_enrollment" (
    "enrollmentSk" SERIAL NOT NULL,
    "studentSk" INTEGER NOT NULL,
    "courseSk" INTEGER NOT NULL,
    "sourceDataset" TEXT NOT NULL,
    "sourceEnrollmentId" TEXT NOT NULL,
    "enrollmentNk" TEXT NOT NULL,
    "enrollmentStartDay" INTEGER,
    "enrollmentEndDay" INTEGER,
    "finalOutcomeRaw" TEXT,
    "finalOutcomeNormalized" TEXT,
    "previousAttemptCount" INTEGER,
    "studyLoadCredits" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fact_enrollment_pkey" PRIMARY KEY ("enrollmentSk")
);

-- CreateTable
CREATE TABLE "fact_assessment_result" (
    "assessmentResultSk" SERIAL NOT NULL,
    "enrollmentSk" INTEGER NOT NULL,
    "assessmentSk" INTEGER NOT NULL,
    "scoreRaw" DOUBLE PRECISION,
    "scoreNormalized" DOUBLE PRECISION,
    "submissionDay" INTEGER,
    "isBanked" BOOLEAN,
    "submissionDelayDays" INTEGER,
    "passFlag" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fact_assessment_result_pkey" PRIMARY KEY ("assessmentResultSk")
);

-- CreateTable
CREATE TABLE "fact_engagement_summary" (
    "engagementSummarySk" SERIAL NOT NULL,
    "enrollmentSk" INTEGER NOT NULL,
    "summaryLevel" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "periodStartDay" INTEGER,
    "periodEndDay" INTEGER,
    "absenceCount" INTEGER,
    "totalEngagementCount" INTEGER,
    "activeDayCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fact_engagement_summary_pkey" PRIMARY KEY ("engagementSummarySk")
);

-- CreateTable
CREATE TABLE "fact_engagement_event" (
    "engagementEventSk" SERIAL NOT NULL,
    "enrollmentSk" INTEGER NOT NULL,
    "eventDay" INTEGER,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "engagementCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fact_engagement_event_pkey" PRIMARY KEY ("engagementEventSk")
);

-- CreateIndex
CREATE UNIQUE INDEX "dim_student_profile_studentNk_key" ON "dim_student_profile"("studentNk");

-- CreateIndex
CREATE UNIQUE INDEX "dim_student_profile_sourceDataset_sourceStudentId_key" ON "dim_student_profile"("sourceDataset", "sourceStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "dim_course_context_courseNk_key" ON "dim_course_context"("courseNk");

-- CreateIndex
CREATE UNIQUE INDEX "dim_course_context_sourceDataset_sourceCourseId_key" ON "dim_course_context"("sourceDataset", "sourceCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "dim_assessment_assessmentNk_key" ON "dim_assessment"("assessmentNk");

-- CreateIndex
CREATE UNIQUE INDEX "dim_assessment_sourceDataset_sourceAssessmentId_key" ON "dim_assessment"("sourceDataset", "sourceAssessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "fact_enrollment_enrollmentNk_key" ON "fact_enrollment"("enrollmentNk");

-- CreateIndex
CREATE UNIQUE INDEX "fact_enrollment_sourceDataset_sourceEnrollmentId_key" ON "fact_enrollment"("sourceDataset", "sourceEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "fact_enrollment_studentSk_courseSk_key" ON "fact_enrollment"("studentSk", "courseSk");

-- CreateIndex
CREATE UNIQUE INDEX "fact_assessment_result_enrollmentSk_assessmentSk_key" ON "fact_assessment_result"("enrollmentSk", "assessmentSk");

-- CreateIndex
CREATE UNIQUE INDEX "fact_engagement_summary_enrollmentSk_summaryLevel_periodInd_key" ON "fact_engagement_summary"("enrollmentSk", "summaryLevel", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "fact_engagement_event_enrollmentSk_eventDay_resourceId_key" ON "fact_engagement_event"("enrollmentSk", "eventDay", "resourceId");

-- AddForeignKey
ALTER TABLE "dim_assessment" ADD CONSTRAINT "dim_assessment_courseSk_fkey" FOREIGN KEY ("courseSk") REFERENCES "dim_course_context"("courseSk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_enrollment" ADD CONSTRAINT "fact_enrollment_studentSk_fkey" FOREIGN KEY ("studentSk") REFERENCES "dim_student_profile"("studentSk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_enrollment" ADD CONSTRAINT "fact_enrollment_courseSk_fkey" FOREIGN KEY ("courseSk") REFERENCES "dim_course_context"("courseSk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_assessment_result" ADD CONSTRAINT "fact_assessment_result_enrollmentSk_fkey" FOREIGN KEY ("enrollmentSk") REFERENCES "fact_enrollment"("enrollmentSk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_assessment_result" ADD CONSTRAINT "fact_assessment_result_assessmentSk_fkey" FOREIGN KEY ("assessmentSk") REFERENCES "dim_assessment"("assessmentSk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_engagement_summary" ADD CONSTRAINT "fact_engagement_summary_enrollmentSk_fkey" FOREIGN KEY ("enrollmentSk") REFERENCES "fact_enrollment"("enrollmentSk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_engagement_event" ADD CONSTRAINT "fact_engagement_event_enrollmentSk_fkey" FOREIGN KEY ("enrollmentSk") REFERENCES "fact_enrollment"("enrollmentSk") ON DELETE RESTRICT ON UPDATE CASCADE;
