import prisma from "../lib/prisma.js";
import crypto from "crypto";

// ==========================================
// CONSTANTS
// ==========================================
const DEFAULT_CHUNK_SIZE = 5000;

// ==========================================
// HELPERS
// ==========================================
function chunkArray(array, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Deduplicate arrays based on a unique key extractor
function deduplicate(array, keyExtractor) {
  if (!Array.isArray(array)) return [];
  const map = new Map();
  for (const item of array) {
    const key = keyExtractor(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

async function insertInChunks(txDelegate, rows, chunkSize) {
  if (!rows || rows.length === 0) return 0;
  const chunks = chunkArray(rows, chunkSize);
  for (const chunk of chunks) {
    await txDelegate.createMany({
      data: chunk,
      skipDuplicates: true // Critical for PostgreSQL when multiple CSV rows share a Course/Student etc.
    });
  }
  return rows.length;
}

function inferLearningMode(sourceDataset) {
  const normalized = String(sourceDataset || "").toLowerCase();
  if (normalized.includes("oulad")) return "online";
  if (normalized.includes("uci")) return "offline";
  return null;
}

// ==========================================
// MAIN SERVICE
// ==========================================
export async function insertNormalizedEntities({
  normalizedData,
  batchId,
  batchName,
  sourceDataset,
  chunkSize = DEFAULT_CHUNK_SIZE
}) {
  if (!normalizedData || typeof normalizedData !== "object") {
    throw new Error("normalizedData must be a valid object containing entity arrays.");
  }

  const safeBatchId = batchId || `batch_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const safeSourceDataset = sourceDataset || "CUSTOM";
  const learningMode = inferLearningMode(safeSourceDataset);

  // 1. Deduplicate Memory Arrays before insertion
  const deduplicated = {
    course: deduplicate(normalizedData.course, c => c.course_id),
    class: deduplicate(normalizedData.class, c => c.class_id),
    student: deduplicate(normalizedData.student, s => s.student_id),
    enrollment: deduplicate(normalizedData.enrollment, e => e.enrollment_id),
    assessment: deduplicate(normalizedData.assessment, a => a.assessment_id),
    assessment_result: deduplicate(normalizedData.assessment_result, er => er.result_id),
    event: deduplicate(normalizedData.event, e => e.event_id),
    engagement: deduplicate(normalizedData.engagement, e => e.engagement_id)
  };

  const totalInputRows = 
    deduplicated.student.length +
    deduplicated.course.length +
    deduplicated.class.length +
    deduplicated.enrollment.length +
    deduplicated.assessment.length +
    deduplicated.assessment_result.length +
    deduplicated.event.length +
    deduplicated.engagement.length;

  const results = {};

  await prisma.$transaction(async (tx) => {
    // 1. Upsert ImportBatch
    await tx.importBatch.upsert({
      where: { batch_id: safeBatchId },
      update: {}, // keep existing if running multiple files for same batch
      create: {
        batch_id: safeBatchId,
        batch_name: batchName || "Imported Dataset",
        source_dataset: safeSourceDataset,
        learning_mode: learningMode,
        imported_at: new Date(),
        is_active: false,
        is_sample: false,
        row_count: 0, // will be updated later
        status: "processing"
      }
    });

    // 2. Sequential Inserts following Topological Sort (FK constraints)
    results.course = await insertInChunks(tx.course, deduplicated.course, chunkSize);
    results.class = await insertInChunks(tx.class, deduplicated.class, chunkSize);
    results.student = await insertInChunks(tx.student, deduplicated.student, chunkSize);
    results.enrollment = await insertInChunks(tx.enrollment, deduplicated.enrollment, chunkSize);
    results.assessment = await insertInChunks(tx.assessment, deduplicated.assessment, chunkSize);
    results.assessment_result = await insertInChunks(tx.assessmentResult, deduplicated.assessment_result, chunkSize);
    results.event = await insertInChunks(tx.event, deduplicated.event, chunkSize);
    results.engagement = await insertInChunks(tx.engagement, deduplicated.engagement, chunkSize);
  }, {
    timeout: 120000
  });

  return {
    success: true,
    batch_id: safeBatchId,
    summary: {
      total_rows_inserted: totalInputRows,
      entity_counts: results
    }
  };
}

