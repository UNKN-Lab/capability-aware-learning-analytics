-- CreateTable
CREATE TABLE "app_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "active_dataset_id" TEXT,
    "active_dataset_name" TEXT,
    "active_dataset_type" TEXT,
    "active_dataset_source" TEXT,
    "active_dataset_set_at" TIMESTAMP(3),
    "is_first_use" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_state_pkey" PRIMARY KEY ("id")
);
