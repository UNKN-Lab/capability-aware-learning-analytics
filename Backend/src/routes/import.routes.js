import express from "express";
import multer from "multer";
import {
  profileImportController,
  listProfilingMappingLogsController,
  getProfilingMappingLogController,
  listImportConversionLogsController,
  getImportConversionLogController,
  confirmMappingController,
  previewMappingController,
  runImportController
} from "../controllers/import.controller.js";

const router = express.Router();

const upload = multer({
  dest: "uploads/",
  limits: {
    files: 20,
    fileSize: 1024 * 1024 * 1024 // 1GB limit for large datasets like OULAD
  },
  fileFilter: (req, file, cb) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.originalname.toLowerCase().endsWith(".csv");

    if (!isCsv) {
      return cb(new Error("Only CSV files are allowed."));
    }

    cb(null, true);
  }
});

router.get("/profile-logs", listProfilingMappingLogsController);
router.get("/profile-logs/:logId", getProfilingMappingLogController);
router.get("/import-logs", listImportConversionLogsController);
router.get("/import-logs/:logId", getImportConversionLogController);
router.post("/profile", upload.array("files"), profileImportController);
router.post("/confirm-mapping", express.json(), confirmMappingController);
router.post("/preview", express.json(), previewMappingController);
router.post("/run", express.json(), runImportController);

export default router;
