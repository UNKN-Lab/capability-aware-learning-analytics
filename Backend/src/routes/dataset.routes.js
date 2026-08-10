import express from "express";
import {
  getActiveDatasetController,
  setActiveDatasetController,
  getImportHistoryController,
  switchSampleDatasetController,
  deleteDatasetController,
  renameDatasetController
} from "../controllers/dataset.controller.js";

const router = express.Router();

router.get("/active", getActiveDatasetController);
router.post("/set-active", setActiveDatasetController);
router.get("/history", getImportHistoryController);
router.post("/switch-sample", switchSampleDatasetController);
router.delete("/:id", deleteDatasetController);
router.patch("/:id/rename", renameDatasetController);

export default router;
