import prisma from "../lib/prisma.js";

// ==========================================
// MAIN SERVICE
// ==========================================

export async function deleteImportBatch(batchId) {
  if (!batchId) {
    throw new Error("batch_id is required to delete an import batch.");
  }

  // Check if batch exists
  const batch = await prisma.importBatch.findUnique({
    where: { batch_id: batchId }
  });

  if (!batch) {
    const error = new Error(`ImportBatch with id "${batchId}" not found.`);
    error.code = "BATCH_NOT_FOUND";
    throw error;
  }

  // Delete batch
  // Thanks to onDelete: Cascade in schema.prisma, 
  // all 8 normalized tables associated with this batch_id 
  // will be automatically deleted by PostgreSQL!
  await prisma.importBatch.delete({
    where: { batch_id: batchId }
  });

  return {
    success: true,
    batch_id: batchId,
    message: "Batch and all cascading relations deleted successfully."
  };
}

export async function renameImportBatch(batchId, newName) {
  if (!batchId || !newName) {
    throw new Error("batch_id and newName are required.");
  }

  const batch = await prisma.importBatch.findUnique({
    where: { batch_id: batchId }
  });

  if (!batch) {
    const error = new Error(`ImportBatch with id "${batchId}" not found.`);
    error.code = "BATCH_NOT_FOUND";
    throw error;
  }

  const updatedBatch = await prisma.importBatch.update({
    where: { batch_id: batchId },
    data: { batch_name: newName }
  });

  // Also update app_state if this batch is currently active
  const appState = await prisma.appState.findUnique({
    where: { id: 1 }
  });

  if (appState && appState.active_dataset_id === batchId) {
    await prisma.appState.update({
      where: { id: 1 },
      data: { active_dataset_name: newName }
    });
  }

  return {
    success: true,
    batch_id: batchId,
    batch_name: updatedBatch.batch_name
  };
}

