-- AlterTable
ALTER TABLE "assessment_result" ADD COLUMN     "updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "course" ADD COLUMN     "updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "engagement" ADD COLUMN     "updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "enrollment" ADD COLUMN     "registration_lead_time" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "updated_at" TIMESTAMP(3);
