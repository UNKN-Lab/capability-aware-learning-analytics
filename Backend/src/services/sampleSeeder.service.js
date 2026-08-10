import prisma from "../lib/prisma.js";
import { SAMPLE_BATCHES } from "../config/sampleBatches.js";
import { activateDatasetByBatchId } from "./activeDataset.service.js";
import {
  SAMPLE_BATCH_WHITELIST,
  SAMPLE_FILE_LAYOUT,
  inspectSampleBatchFiles,
  loadAllSampleBatchesFromCsv,
  loadSampleBatchFromCsv,
} from "./sampleCsvLoader.service.js";
import {
  clearEngagementForBatch,
  rebuildOuladEngagementFromCsv,
} from "./postgresCopy.service.js";

const SAMPLE_BATCH_META = Object.values(SAMPLE_BATCHES).filter((meta) =>
  SAMPLE_BATCH_WHITELIST.includes(meta.batch_id)
);

function requiredEntitiesForBatch(batchId) {
  if (batchId === SAMPLE_BATCHES.OULAD.batch_id) {
    return [
      "student",
      "class",
      "enrollment",
      "assessment",
      "assessment_result",
      "event",
      "engagement",
    ];
  }
  return ["student", "class", "enrollment", "assessment", "assessment_result"];
}

function getLearningModeByBatchId(batchId) {
  if (batchId === SAMPLE_BATCHES.OULAD.batch_id) return "online";
  return "offline";
}

function validateLoadedSampleBatch(loaded, options = {}) {
  const { requireEngagement = true } = options;
  const errors = [...(loaded.errors || [])];
  const counts = loaded.canonicalCounts || {};
  const required = requiredEntitiesForBatch(loaded.batchId).filter(
    (key) => requireEngagement || key !== "engagement"
  );

  for (const key of required) {
    if ((counts[key] || 0) <= 0) {
      errors.push(
        `Validation failed for ${loaded.batchId}: "${key}" must be > 0 (actual ${counts[key] || 0}).`
      );
    }
  }

  if ((loaded.canonicalRowCount || 0) <= 0) {
    errors.push(`Validation failed for ${loaded.batchId}: canonical row count must be > 0.`);
  }

  return {
    ...loaded,
    ok: errors.length === 0,
    validationErrors: errors,
  };
}

function toFirstN(array, n = 20) {
  return Array.isArray(array) ? array.slice(0, n) : [];
}

function printOuladFkDiagnostics({
  eventIds,
  engagementEventIdsSample,
  totalEngagementRowsScanned,
  missingEventIds,
}) {
  console.log("[OULAD FK Diagnostics] event PK field: event.event_id");
  console.log("[OULAD FK Diagnostics] engagement FK field: engagement.event_id");
  console.log(`[OULAD FK Diagnostics] total event rows: ${eventIds.length}`);
  console.log(`[OULAD FK Diagnostics] total engagement rows scanned: ${totalEngagementRowsScanned}`);
  console.log(
    `[OULAD FK Diagnostics] first 20 event IDs: ${JSON.stringify(toFirstN(eventIds, 20))}`
  );
  console.log(
    `[OULAD FK Diagnostics] first 20 engagement event IDs: ${JSON.stringify(
      toFirstN(engagementEventIdsSample, 20)
    )}`
  );
  console.log(
    `[OULAD FK Diagnostics] missing engagement event_id count: ${missingEventIds.length}`
  );
  console.log(
    `[OULAD FK Diagnostics] first 20 missing engagement event IDs: ${JSON.stringify(
      toFirstN(missingEventIds, 20)
    )}`
  );
}

function chunkRows(rows, chunkSize = 5000) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

async function createManyInChunks(delegate, rows, options = {}) {
  const { chunkSize = 5000 } = options;
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let insertedCount = 0;
  for (const chunk of chunkRows(rows, chunkSize)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await delegate.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    insertedCount += result?.count || 0;
  }
  return insertedCount;
}

async function clearSampleBatchData(db, batchId, options = {}) {
  const { skipEngagement = false } = options;
  if (!skipEngagement) {
    await db.engagement.deleteMany({ where: { batch_id: batchId } });
  }
  await db.assessmentResult.deleteMany({ where: { batch_id: batchId } });
  await db.event.deleteMany({ where: { batch_id: batchId } });
  await db.assessment.deleteMany({ where: { batch_id: batchId } });
  await db.enrollment.deleteMany({ where: { batch_id: batchId } });
  await db.class.deleteMany({ where: { batch_id: batchId } });
  await db.course.deleteMany({ where: { batch_id: batchId } });
  await db.student.deleteMany({ where: { batch_id: batchId } });
}

async function insertCanonicalRows(db, dataset) {
  if (dataset.students.length > 0) {
    await createManyInChunks(db.student, dataset.students);
  }
  if (dataset.courses.length > 0) {
    await createManyInChunks(db.course, dataset.courses);
  }
  if (dataset.classes.length > 0) {
    await createManyInChunks(db.class, dataset.classes);
  }
  if (dataset.enrollments.length > 0) {
    await createManyInChunks(db.enrollment, dataset.enrollments);
  }
  if (dataset.assessments.length > 0) {
    await createManyInChunks(db.assessment, dataset.assessments);
  }
  if (dataset.assessment_results.length > 0) {
    await createManyInChunks(db.assessmentResult, dataset.assessment_results);
  }
  if (dataset.events.length > 0) {
    await createManyInChunks(db.event, dataset.events);
  }
  if (dataset.engagements.length > 0) {
    await createManyInChunks(db.engagement, dataset.engagements);
  }
}

async function upsertSampleBatchMeta(db, batchId, canonicalRowCount, status = "completed") {
  const meta = SAMPLE_BATCH_META.find((item) => item.batch_id === batchId);
  if (!meta) {
    throw new Error(`Missing sample meta for batch id ${batchId}`);
  }
  const sourceDataset = batchId.includes("OULAD") ? "OULAD" : "UCI";

  await db.importBatch.upsert({
    where: { batch_id: batchId },
    update: {
      batch_name: meta.batch_name,
      source_dataset: sourceDataset,
      learning_mode: getLearningModeByBatchId(batchId),
      imported_at: new Date(),
      is_sample: true,
      status,
      row_count: canonicalRowCount,
    },
    create: {
      batch_id: batchId,
      batch_name: meta.batch_name,
      source_dataset: sourceDataset,
      learning_mode: getLearningModeByBatchId(batchId),
      imported_at: new Date(),
      is_active: false,
      is_sample: true,
      row_count: canonicalRowCount,
      status,
    },
  });
}

async function getCurrentActiveState() {
  const appState = await prisma.appState.findUnique({
    where: { id: 1 },
    select: {
      id: true,
      active_dataset_id: true,
      active_dataset_name: true,
      active_dataset_type: true,
      active_dataset_source: true,
      active_dataset_set_at: true,
    },
  });

  return appState || null;
}

function computeActiveDatasetImpact(activeStateBefore) {
  const currentId = activeStateBefore?.active_dataset_id || null;
  if (!currentId) {
    return {
      current: null,
      kind: "none",
      postApplyPlan: "activate SAMPLE_OULAD",
    };
  }

  if (SAMPLE_BATCH_WHITELIST.includes(currentId)) {
    return {
      current: currentId,
      kind: "sample",
      postApplyPlan:
        "restore current sample if reseed success and batch exists; fallback SAMPLE_OULAD if invalid",
    };
  }

  return {
    current: currentId,
    kind: "user_import",
    postApplyPlan: "keep current active user-imported dataset",
  };
}

async function syncActiveDatasetAfterReseed(activeStateBefore) {
  const existingActiveBatchId = activeStateBefore?.active_dataset_id || null;
  const existingActiveType = activeStateBefore?.active_dataset_type || null;

  if (!existingActiveBatchId) {
    await activateDatasetByBatchId(SAMPLE_BATCHES.OULAD.batch_id);
    return {
      strategy: "no_active_before_reseed",
      activated: SAMPLE_BATCHES.OULAD.batch_id,
    };
  }

  const activeBatch = await prisma.importBatch.findUnique({
    where: { batch_id: existingActiveBatchId },
    select: { batch_id: true, is_sample: true },
  });

  if (activeBatch && activeBatch.is_sample === false && existingActiveType !== "sample") {
    await activateDatasetByBatchId(existingActiveBatchId, {
      setAt: activeStateBefore.active_dataset_set_at || new Date(),
    });
    return {
      strategy: "preserve_user_import",
      activated: existingActiveBatchId,
    };
  }

  if (SAMPLE_BATCH_WHITELIST.includes(existingActiveBatchId)) {
    const restoredSample = await prisma.importBatch.findUnique({
      where: { batch_id: existingActiveBatchId },
      select: { batch_id: true, is_sample: true, status: true, row_count: true },
    });

    if (
      restoredSample &&
      restoredSample.is_sample &&
      restoredSample.status === "completed" &&
      (restoredSample.row_count || 0) > 0
    ) {
      await activateDatasetByBatchId(existingActiveBatchId, {
        setAt: activeStateBefore.active_dataset_set_at || new Date(),
      });
      return {
        strategy: "restore_existing_sample",
        activated: existingActiveBatchId,
      };
    }
  }

  await activateDatasetByBatchId(SAMPLE_BATCHES.OULAD.batch_id);
  return {
    strategy: "fallback_to_default_sample",
    activated: SAMPLE_BATCHES.OULAD.batch_id,
  };
}

async function batchNeedsSeed(batchId, forceReseed) {
  if (forceReseed) return true;

  const exists = await prisma.importBatch.findUnique({
    where: { batch_id: batchId },
    select: {
      batch_id: true,
      status: true,
      row_count: true,
      is_sample: true,
    },
  });

  if (!exists) return true;
  if (!exists.is_sample) return true;
  if (exists.status !== "completed") return true;
  if ((exists.row_count ?? 0) <= 0) return true;

  const studentCount = await prisma.student.count({
    where: { batch_id: batchId },
  });
  const enrollmentCount = await prisma.enrollment.count({
    where: { batch_id: batchId },
  });
  const assessmentResultCount = await prisma.assessmentResult.count({
    where: { batch_id: batchId },
  });

  return studentCount === 0 || enrollmentCount === 0 || assessmentResultCount === 0;
}

export async function previewSampleReseed(options = {}) {
  const {
    batchIds = SAMPLE_BATCH_WHITELIST,
    forceReseed = true,
    fastOuladPreflight = false,
  } = options;

  const activeStateBefore = await getCurrentActiveState();
  const activeImpact = computeActiveDatasetImpact(activeStateBefore);
  const loaded = await loadAllSampleBatchesFromCsv(batchIds, {
    mode: "dry-run",
    scanOuladEngagementRows: !fastOuladPreflight,
  });
  const validated = loaded.map((item) =>
    validateLoadedSampleBatch(item, {
      requireEngagement:
        !(fastOuladPreflight && item.batchId === SAMPLE_BATCHES.OULAD.batch_id),
    })
  );

  const shouldSeedMatrix = [];
  for (const batchId of batchIds) {
    // eslint-disable-next-line no-await-in-loop
    const needsSeed = await batchNeedsSeed(batchId, forceReseed);
    shouldSeedMatrix.push({ batchId, wouldSeed: needsSeed });
  }

  const hasValidationErrors = validated.some(
    (item) => Array.isArray(item.validationErrors) && item.validationErrors.length > 0
  );

  return {
    timestamp: new Date().toISOString(),
    dryRun: true,
    batchIds,
    batchesToClear: [...batchIds],
    activeStateBefore,
    activeImpact,
    validationFailed: hasValidationErrors,
    shouldSeedMatrix,
    batches: validated,
  };
}

export async function reseedSampleDatasets(options = {}) {
  const {
    apply = false,
    batchIds = SAMPLE_BATCH_WHITELIST,
    forceReseed = true,
  } = options;

  const preview = await previewSampleReseed({
    batchIds,
    forceReseed,
    fastOuladPreflight: apply,
  });
  if (!apply) return preview;

  if (preview.validationFailed) {
    const error = new Error("Sample reseed validation failed. Aborting apply.");
    error.code = "SAMPLE_RESEED_VALIDATION_FAILED";
    error.preview = preview;
    throw error;
  }

  const perBatchResults = [];
  for (const batch of preview.batches) {
    const shouldSeed = preview.shouldSeedMatrix.find((item) => item.batchId === batch.batchId);
    let appliedCanonicalRowCount = batch.canonicalRowCount;
    if (!shouldSeed?.wouldSeed) {
      perBatchResults.push({
        batchId: batch.batchId,
        skipped: true,
        reason: "already_completed_with_data",
        canonicalRowCount: batch.canonicalRowCount,
      });
      continue;
    }

    if (batch.batchId === SAMPLE_BATCHES.OULAD.batch_id) {
      try {
        await upsertSampleBatchMeta(prisma, batch.batchId, 0, "processing");
        await clearEngagementForBatch(batch.batchId);
        await clearSampleBatchData(prisma, batch.batchId, {
          skipEngagement: true,
        });

        const validatedPreflight = batch;
        if (!validatedPreflight.ok) {
          throw new Error(`Preflight validation failed for ${batch.batchId}.`);
        }

        await insertCanonicalRows(prisma, {
          ...validatedPreflight.dataset,
          engagements: [],
        });

        const dbEventCountBeforeEngagementInsert = await prisma.event.count({
          where: { batch_id: batch.batchId },
        });
        const dbEventSampleBeforeEngagementInsert = await prisma.event.findMany({
          where: { batch_id: batch.batchId },
          select: { event_id: true },
          take: 20,
          orderBy: { event_id: "asc" },
        });
        console.log(
          `[OULAD FK Diagnostics] event rows currently in DB before engagement.createMany: ${dbEventCountBeforeEngagementInsert}`
        );
        console.log(
          `[OULAD FK Diagnostics] first 20 DB event IDs before engagement.createMany: ${JSON.stringify(
            dbEventSampleBeforeEngagementInsert.map((item) => item.event_id)
          )}`
        );

        const engagementImport = await rebuildOuladEngagementFromCsv({
          sourceFile: SAMPLE_FILE_LAYOUT.SAMPLE_OULAD
            ? `${SAMPLE_FILE_LAYOUT.SAMPLE_OULAD.baseDir}/studentVle.csv`
            : null,
          batchId: batch.batchId,
        });
        console.log(
          `[OULAD Engagement Bulk Import] raw_rows=${engagementImport.raw_row_count}, rows_inserted=${engagementImport.inserted_row_count}, total_ms=${engagementImport.total_ms}`
        );
        const canonicalRowCount =
          validatedPreflight.canonicalRowCount +
          engagementImport.inserted_row_count;
        await upsertSampleBatchMeta(
          prisma,
          batch.batchId,
          canonicalRowCount,
          "completed"
        );
        appliedCanonicalRowCount = canonicalRowCount;
      } catch (error) {
        await upsertSampleBatchMeta(prisma, batch.batchId, 0, "failed").catch(() => {});
        throw error;
      }
    } else {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(async (tx) => {
        await upsertSampleBatchMeta(tx, batch.batchId, 0, "processing");
        await clearSampleBatchData(tx, batch.batchId);

        const loadedForApply = await loadSampleBatchFromCsv(batch.batchId, {
          mode: "apply",
        });
        const validatedForApply = validateLoadedSampleBatch(loadedForApply);
        if (!validatedForApply.ok) {
          const error = new Error(`Apply validation failed for ${batch.batchId}.`);
          error.code = "SAMPLE_RESEED_APPLY_VALIDATION_FAILED";
          error.batch = validatedForApply;
          throw error;
        }

        await insertCanonicalRows(tx, validatedForApply.dataset);
        await upsertSampleBatchMeta(tx, validatedForApply.batchId, validatedForApply.canonicalRowCount, "completed");
      }).catch(async (error) => {
        await upsertSampleBatchMeta(prisma, batch.batchId, 0, "failed").catch(() => {});
        throw error;
      });
    }

    perBatchResults.push({
      batchId: batch.batchId,
      skipped: false,
      canonicalRowCount: appliedCanonicalRowCount,
    });
  }

  const activeSync = await syncActiveDatasetAfterReseed(preview.activeStateBefore);
  const activeStateAfter = await getCurrentActiveState();

  return {
    ...preview,
    dryRun: false,
    applied: true,
    perBatchResults,
    activeSync,
    activeStateAfter,
  };
}

export async function seedSampleDatasets(options = {}) {
  const {
    forceReseed = false,
    batchIds = null,
  } = options;

  const selectedBatchIds = Array.isArray(batchIds) && batchIds.length > 0
    ? batchIds.filter((id) => SAMPLE_BATCH_WHITELIST.includes(id))
    : SAMPLE_BATCH_WHITELIST;

  const seedDecision = [];
  for (const batchId of selectedBatchIds) {
    // eslint-disable-next-line no-await-in-loop
    const wouldSeed = await batchNeedsSeed(batchId, forceReseed);
    seedDecision.push({ batchId, wouldSeed });
  }

  const neededBatchIds = seedDecision.filter((item) => item.wouldSeed).map((item) => item.batchId);
  if (neededBatchIds.length === 0) {
    console.log("[Seeder] Startup seed skipped: all sample batches already completed with data.");
    return {
      applied: false,
      reason: "all_batches_already_completed_with_data",
      perBatchResults: selectedBatchIds.map((batchId) => ({
        batchId,
        skipped: true,
        reason: "already_completed_with_data",
      })),
    };
  }

  const missingByBatch = [];
  const seedableBatchIds = [];
  for (const batchId of neededBatchIds) {
    // eslint-disable-next-line no-await-in-loop
    const inspection = await inspectSampleBatchFiles(batchId);
    if (inspection.ok) {
      seedableBatchIds.push(batchId);
    } else {
      missingByBatch.push({
        batchId,
        missingFiles: inspection.missingFiles || [],
      });
    }
  }

  for (const item of missingByBatch) {
    console.warn(
      `[Seeder] Startup seed skipped for ${item.batchId}: missing required CSV files (${item.missingFiles.join(", ")}).`
    );
  }

  if (seedableBatchIds.length === 0) {
    return {
      applied: false,
      reason: "missing_csv_for_needed_batches",
      perBatchResults: [
        ...selectedBatchIds
          .filter((batchId) => !neededBatchIds.includes(batchId))
          .map((batchId) => ({
            batchId,
            skipped: true,
            reason: "already_completed_with_data",
          })),
        ...missingByBatch.map((item) => ({
          batchId: item.batchId,
          skipped: true,
          reason: "missing_required_csv_files",
          missingFiles: item.missingFiles,
        })),
      ],
    };
  }

  const result = await reseedSampleDatasets({
    apply: true,
    batchIds: seedableBatchIds,
    forceReseed,
  });

  for (const batchId of selectedBatchIds.filter((id) => !neededBatchIds.includes(id))) {
    console.log(`[Seeder] ${batchId} skipped (already_completed_with_data).`);
  }

  for (const item of missingByBatch) {
    console.log(`[Seeder] ${item.batchId} skipped (missing_required_csv_files).`);
  }

  for (const item of result.perBatchResults || []) {
    if (item.skipped) {
      console.log(`[Seeder] ${item.batchId} skipped (${item.reason}).`);
    } else {
      console.log(`[Seeder] ${item.batchId} loaded (${item.canonicalRowCount} canonical rows).`);
    }
  }

  if (result.activeSync?.activated) {
    console.log(`[Seeder] Active dataset sync: ${result.activeSync.strategy} -> ${result.activeSync.activated}.`);
  }

  return result;
}
