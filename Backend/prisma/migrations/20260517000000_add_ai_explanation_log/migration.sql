-- CreateTable
CREATE TABLE "ai_explanation_log" (
    "log_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "execution_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "student_id" TEXT,
    "explanation_strategy" TEXT NOT NULL,
    "target_audience" TEXT[],
    "granularity" TEXT,
    "aggregation_level" TEXT,
    "is_degraded" BOOLEAN NOT NULL DEFAULT false,
    "degraded_reason" TEXT,
    "confidence_level" TEXT,
    "confidence_reason" TEXT,
    "explanation_text" TEXT,
    "structured_output" JSONB,
    "datasets_snapshot" JSONB,
    "latency_ms" INTEGER,
    "python_latency_ms" INTEGER,
    "model_version" TEXT,
    "prompt_token_count" INTEGER,
    "response_token_count" INTEGER,

    CONSTRAINT "ai_explanation_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE INDEX "ai_explanation_log_execution_id_idx" ON "ai_explanation_log"("execution_id");

-- CreateIndex
CREATE INDEX "ai_explanation_log_task_id_created_at_idx" ON "ai_explanation_log"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_explanation_log_student_id_idx" ON "ai_explanation_log"("student_id");

-- CreateIndex
CREATE INDEX "ai_explanation_log_is_degraded_idx" ON "ai_explanation_log"("is_degraded");
