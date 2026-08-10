import taskRegistryService from "../services/taskRegistry.service.js";
import { sanitizeTaskForClient } from "../services/taskPublicView.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// SANITIZER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips raw SQL fields from a task before returning to the client.
 *
 * Security rationale:
 *   - sqlQuery / sqlQueries are server-side implementation details
 *   - Exposing them leaks schema structure to the client
 *   - The frontend never needs raw SQL — it only needs metadata + results
 *   - This follows the principle of minimal surface area in public APIs
 */
// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks
 *
 * Returns all tasks with optional filtering. SQL fields are stripped.
 *
 * Query params (all optional, combinable):
 *   scope    — filter by scope keyword  e.g. "student", "cohort"
 *   dataset  — filter by dataset compat e.g. "OULAD", "UCI"
 *   search   — keyword search in taskName + actionableQuestion
 *   analysis — filter by analysisType   e.g. "trend", "correlation"
 *
 * Design: filtering is applied in-memory on the registry (53 tasks).
 * No DB query needed — the registry is a static JSON loaded once at startup.
 */
export async function getTasksController(req, res) {
  try {
    const { scope, dataset, search, analysis, includeExperimental } = req.query;

    let tasks = taskRegistryService.getAllTasks();

    // ── Governance Gating ───────────────────────────────────────────────────
    // certified, validated: always exposed
    // experimental: hidden unless ?includeExperimental=true
    // deprecated: never exposed
    tasks = tasks.filter((t) => {
      const status = t.registry_status || "experimental";
      if (status === "deprecated") return false;
      if (status === "experimental" && includeExperimental !== "true") return false;
      return true;
    });

    // Filter: scope (case-insensitive substring)
    if (scope) {
      const kw = scope.toLowerCase();
      tasks = tasks.filter((t) => t.scope?.toLowerCase().includes(kw));
    }

    // Filter: dataset compatibility
    if (dataset) {
      const ds = dataset.toLowerCase();
      tasks = tasks.filter((t) => {
        const compat = (t.datasetCompatibility ?? "").toLowerCase();
        return compat === "both" || compat.includes(ds);
      });
    }

    // Filter: keyword search in name + question
    if (search) {
      const kw = search.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.taskName?.toLowerCase().includes(kw) ||
          t.actionableQuestion?.toLowerCase().includes(kw)
      );
    }

    // Filter: analysisType (from analytics sub-object)
    if (analysis) {
      const kw = analysis.toLowerCase();
      tasks = tasks.filter((t) =>
        t.analytics?.analysisType?.toLowerCase().includes(kw)
      );
    }

    return res.status(200).json({
      success: true,
      count:   tasks.length,
      filters: { scope, dataset, search, analysis },
      tasks:   tasks.map(sanitizeTaskForClient),
    });
  } catch (err) {
    console.error("[getTasksController]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/tasks/:taskId
 *
 * Returns full metadata for a single task. SQL fields are stripped.
 * Used by the frontend to display task details before execution.
 */
export async function getTaskByIdController(req, res) {
  try {
    const { taskId } = req.params;
    const { includeExperimental } = req.query;
    const task = taskRegistryService.getTaskById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error:   `Task "${taskId}" not found in registry.`,
      });
    }

    // ── Governance Gating ───────────────────────────────────────────────────
    const status = task.registry_status || "experimental";
    if (status === "deprecated" || (status === "experimental" && includeExperimental !== "true")) {
      return res.status(403).json({
        success: false,
        error: `Task "${taskId}" is ${status} and is not exposed. ${status === "experimental" ? "Pass ?includeExperimental=true to access." : ""}`.trim()
      });
    }

    return res.status(200).json({
      success: true,
      task:    sanitizeTaskForClient(task),
    });
  } catch (err) {
    console.error("[getTaskByIdController]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
