import prisma from "../lib/prisma.js";
import { SAMPLE_BATCHES } from "../config/sampleBatches.js";
import { deleteImportBatch, renameImportBatch } from "../services/historyManager.service.js";
import {
  activateDatasetByBatchId,
  normalizeActiveDatasetFromBatch
} from "../services/activeDataset.service.js";

const SAMPLE_DATASETS = {
  OULAD: {
    requestKey: "OULAD",
    id: SAMPLE_BATCHES.OULAD.batch_id,
    name: SAMPLE_BATCHES.OULAD.batch_name,
    type: "sample",
    source: "OULAD",
    legacyIds: ["OULAD"]
  },
  UCI: {
    requestKey: "UCI",
    id: SAMPLE_BATCHES.UCI_MAT.batch_id,
    name: SAMPLE_BATCHES.UCI_MAT.batch_name,
    type: "sample",
    source: "UCI",
    legacyIds: ["UCI", SAMPLE_BATCHES.UCI_POR.batch_id]
  }
};

function getDefaultSampleDataset() {
  return SAMPLE_DATASETS.OULAD;
}

function getSampleDatasetByRequestKey(requestKey) {
  return SAMPLE_DATASETS[requestKey] || null;
}

function appStateMatchesBatch(appState, batch) {
  if (!appState || !batch) return false;

  const expected = normalizeActiveDatasetFromBatch(
    batch,
    appState.active_dataset_set_at
  );

  return (
    appState.active_dataset_id === expected.id &&
    appState.active_dataset_name === expected.name &&
    appState.active_dataset_type === expected.type &&
    appState.active_dataset_source === expected.source
  );
}

// ==========================================
// 1. GET /api/datasets/active
// ==========================================
export async function getActiveDatasetController(req, res) {
  try {
    const appState = await prisma.appState.findUnique({
      where: { id: 1 }
    });

    if (appState?.active_dataset_id) {
      const activeBatch = await prisma.importBatch.findUnique({
        where: { batch_id: appState.active_dataset_id }
      });

      if (activeBatch) {
        const activeFlags = await prisma.importBatch.findMany({
          where: { is_active: true },
          select: { batch_id: true }
        });
        const hasOnlySelectedActiveFlag =
          activeFlags.length === 1 &&
          activeFlags[0].batch_id === activeBatch.batch_id;

        if (!hasOnlySelectedActiveFlag || !appStateMatchesBatch(appState, activeBatch)) {
          const activeDataset = await activateDatasetByBatchId(activeBatch.batch_id, {
            setAt: appState.active_dataset_set_at || new Date()
          });

          return res.json({
            success: true,
            activeDataset
          });
        }

        return res.json({
          success: true,
          activeDataset: normalizeActiveDatasetFromBatch(
            activeBatch,
            appState.active_dataset_set_at
          )
        });
      }
    }

    const activeDataset = await activateDatasetByBatchId(SAMPLE_BATCHES.OULAD.batch_id);

    return res.json({
      success: true,
      activeDataset
    });
  } catch (error) {
    console.error("Failed to get active dataset:", error);

    if (error.code === "DATASET_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Default sample dataset not found."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}

// ==========================================
// 2. POST /api/datasets/set-active
// ==========================================
export async function setActiveDatasetController(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Dataset ID is required." });
    }

    const activeDataset = await activateDatasetByBatchId(id);

    return res.json({
      success: true,
      activeDataset
    });
  } catch (error) {
    console.error("Failed to set active dataset:", error);

    if (error.code === "DATASET_NOT_FOUND") {
      return res.status(404).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}

// ==========================================
// 3. GET /api/datasets/history
// ==========================================
export async function getImportHistoryController(req, res) {
  try {
    const history = await prisma.importBatch.findMany({
      where: { is_sample: false },
      orderBy: { imported_at: 'desc' }
    });

    return res.json({
      success: true,
      history: history.map(item => ({
        import_batch_id: item.batch_id,
        batch_name: item.batch_name,
        source_dataset: item.source_dataset,
        row_count: item.row_count,
        created_at: item.imported_at,
        learning_mode: item.learning_mode,
        is_sample: item.is_sample,
        is_active: item.is_active,
        status: item.status
      }))
    });
  } catch (error) {
    console.error("Failed to get import history:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}

// ==========================================
// 4. POST /api/datasets/switch-sample
// ==========================================
export async function switchSampleDatasetController(req, res) {
  try {
    const { dataset } = req.body;

    const targetDataset = getSampleDatasetByRequestKey(dataset);

    if (!targetDataset) {
      return res.status(400).json({ success: false, message: "Invalid sample dataset." });
    }

    const batch = await prisma.importBatch.findUnique({
      where: { batch_id: targetDataset.id }
    });

    if (!batch || !batch.is_sample) {
      return res.status(404).json({
        success: false,
        message: "Sample dataset not found in database."
      });
    }

    const activeDataset = await activateDatasetByBatchId(targetDataset.id);

    return res.json({
      success: true,
      activeDataset
    });
  } catch (error) {
    console.error("Failed to switch sample dataset:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}

// ==========================================
// 5. DELETE /api/datasets/:id
// ==========================================
export async function deleteDatasetController(req, res) {
  try {
    const batchId = req.params.id;

    if (!batchId) {
      return res.status(400).json({ success: false, message: "Dataset ID is required." });
    }

    // Attempt to delete (this will cascade delete all related tables)
    await deleteImportBatch(batchId);

    // Check if the deleted dataset was the active one
    const appState = await prisma.appState.findUnique({
      where: { id: 1 }
    });

    if (appState && appState.active_dataset_id === batchId) {
      // Fallback to default OULAD sample
      const fallbackDataset = getDefaultSampleDataset();
      const activeDataset = await activateDatasetByBatchId(fallbackDataset.id);
      
      return res.json({
        success: true,
        message: "Dataset deleted successfully. Active dataset reset to OULAD Sample.",
        wasActive: true,
        newActiveDataset: activeDataset
      });
    }

    return res.json({
      success: true,
      message: "Dataset deleted successfully.",
      wasActive: false
    });
  } catch (error) {
    console.error("Failed to delete dataset:", error);
    
    if (error.code === "BATCH_NOT_FOUND") {
      return res.status(404).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}

// ==========================================
// 6. PATCH /api/datasets/:id/rename
// ==========================================
export async function renameDatasetController(req, res) {
  try {
    const batchId = req.params.id;
    const { newName } = req.body;

    if (!batchId) {
      return res.status(400).json({ success: false, message: "Dataset ID is required." });
    }

    if (!newName || typeof newName !== "string" || newName.trim() === "") {
      return res.status(400).json({ success: false, message: "A valid newName is required." });
    }

    const result = await renameImportBatch(batchId, newName.trim());

    return res.json({
      success: true,
      message: "Dataset renamed successfully.",
      dataset: result
    });
  } catch (error) {
    console.error("Failed to rename dataset:", error);
    
    if (error.code === "BATCH_NOT_FOUND") {
      return res.status(404).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
