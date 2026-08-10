import prisma from "../lib/prisma.js";

export function normalizeActiveDatasetFromBatch(batch, setAt = null) {
  if (!batch) return null;

  return {
    id: batch.batch_id,
    name: batch.batch_name,
    type: batch.is_sample ? "sample" : "custom",
    source: batch.source_dataset,
    setAt
  };
}

export async function activateDatasetByBatchId(batchId, options = {}) {
  const setAt = options.setAt || new Date();
  let selectedBatch = null;

  const appState = await prisma.$transaction(async (tx) => {
    selectedBatch = await tx.importBatch.findUnique({
      where: { batch_id: batchId }
    });

    if (!selectedBatch) {
      const error = new Error("Dataset not found in database.");
      error.code = "DATASET_NOT_FOUND";
      throw error;
    }

    await tx.importBatch.updateMany({
      where: { is_active: true },
      data: { is_active: false }
    });

    await tx.importBatch.update({
      where: { batch_id: batchId },
      data: { is_active: true }
    });

    return tx.appState.upsert({
      where: { id: 1 },
      update: {
        active_dataset_id: selectedBatch.batch_id,
        active_dataset_name: selectedBatch.batch_name,
        active_dataset_type: selectedBatch.is_sample ? "sample" : "custom",
        active_dataset_source: selectedBatch.source_dataset,
        active_dataset_set_at: setAt,
        is_first_use: false
      },
      create: {
        id: 1,
        active_dataset_id: selectedBatch.batch_id,
        active_dataset_name: selectedBatch.batch_name,
        active_dataset_type: selectedBatch.is_sample ? "sample" : "custom",
        active_dataset_source: selectedBatch.source_dataset,
        active_dataset_set_at: setAt,
        is_first_use: false
      }
    });
  });

  return normalizeActiveDatasetFromBatch(selectedBatch, appState.active_dataset_set_at);
}
