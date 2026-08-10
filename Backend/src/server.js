import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import importRoutes from "./routes/import.routes.js";
import datasetRoutes from "./routes/dataset.routes.js";
import taskRoutes from "./routes/task.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import studentsRoutes from "./routes/students.routes.js";
import classesRoutes from "./routes/classes.routes.js";

import { seedSampleDatasets } from "./services/sampleSeeder.service.js";
import { clearExpiredUploadSessions } from "./services/uploadSession.store.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:5175",
    ],
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/api/import", importRoutes);
app.use("/api/datasets", datasetRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/classes", classesRoutes);


app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend is running",
  });
});

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);

  if (process.env.AUTO_SEED_SAMPLES === "true") {
    try {
      await seedSampleDatasets();
    } catch (error) {
      console.error("Sample dataset seeding failed during startup:", error);
    }
  } else {
    console.log("Sample dataset auto-seeding skipped. Set AUTO_SEED_SAMPLES=true to enable.");
  }

  try {
    await clearExpiredUploadSessions();
  } catch (error) {
    console.error("Failed to clear expired upload sessions:", error);
  }
});
