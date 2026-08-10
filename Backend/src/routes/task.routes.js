import express from "express";
import {
  getTasksController,
  getTaskByIdController,
} from "../controllers/tasks.controller.js";
import {
  validateAllTasksController,
  getAvailableTasksController,
  listTaskAvailabilityLogsController,
  getTaskAvailabilityLogController,
  validateOneTaskController,
} from "../controllers/taskValidator.controller.js";

const router = express.Router();

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: List all analytical tasks
 *     description: |
 *       Returns metadata for all 53 analytical tasks from `taskRegistry.json`.
 *       Supports filtering by scope, dataset compatibility, and search.
 *
 *       Each task includes `visualization_config`, `explanation_strategy`, `query_labels`,
 *       and `analysis_context` — everything the Frontend needs to render charts and
 *       request AI explanations without hardcoding.
 *     tags:
 *       - Tasks
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: ["student", "class", "cohort", "comparison"]
 *         description: Filter by task scope
 *         example: "student"
 *       - in: query
 *         name: dataset
 *         schema:
 *           type: string
 *           enum: ["both", "OULAD_only", "UCI_only"]
 *         description: Filter by dataset compatibility
 *         example: "both"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by task ID or task name
 *         example: "S-T01"
 *       - in: query
 *         name: includeExperimental
 *         schema:
 *           type: boolean
 *         description: If true, includes tasks with registry_status='experimental'
 *         example: false
 *     responses:
 *       200:
 *         description: A list of task metadata objects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 53
 *                 tasks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TaskMetadata'
 *             example:
 *               success: true
 *               count: 2
 *               tasks:
 *                 - taskId: "S-T01"
 *                   taskName: "Score trend analysis"
 *                   scope: "1 student"
 *                   viz_type: "line_chart"
 *                   explanation_strategy: "trend"
 *                   target_audience: ["student"]
 *                   query_labels: ["score_trend"]
 *                   analysis_context: { granularity: "per_assessment", aggregation_level: "student" }
 *                 - taskId: "A-G03"
 *                   taskName: "Identify at-risk cohort"
 *                   scope: "Many students"
 *                   viz_type: "table"
 *                   explanation_strategy: "risk"
 *                   target_audience: ["instructor", "admin"]
 *                   query_labels: ["at_risk_cohort"]
 *                   analysis_context: { granularity: "semester", aggregation_level: "cohort" }
 */
router.get("/", getTasksController);

/**
 * @swagger
 * /api/tasks/validate/{datasetId}:
 *   get:
 *     summary: Validate all tasks for a dataset
 *     description: Runs the 4-layer capability validator for all 53 tasks against a specific imported dataset batch.
 *     tags:
 *       - Tasks
 *     parameters:
 *       - in: path
 *         name: datasetId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the import batch
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Optional class filter for validation
 *     responses:
 *       200:
 *         description: Validation results for all tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: "boolean", example: true }
 *                 datasetId: { type: "string" }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total: { type: "integer", example: 53 }
 *                     executable: { type: "integer", example: 48 }
 *                     partial: { type: "integer", example: 5 }
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TaskValidationResult'
 *       404:
 *         description: Dataset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/validate/:datasetId", validateAllTasksController);
router.get("/available", getAvailableTasksController);
router.get("/availability-logs", listTaskAvailabilityLogsController);
router.get("/availability-logs/:logId", getTaskAvailabilityLogController);

/**
 * @swagger
 * /api/tasks/validate-one/{taskId}:
 *   get:
 *     summary: Validate a single task
 *     description: Runs the capability validator for a single specific task against an imported dataset batch.
 *     tags:
 *       - Tasks
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the task (e.g. S-B01)
 *       - in: query
 *         name: datasetId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the import batch
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Optional class filter
 *     responses:
 *       200:
 *         description: Validation result for the task
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: "boolean", example: true }
 *                 result:
 *                   $ref: '#/components/schemas/TaskValidationResult'
 *       400:
 *         description: Missing datasetId parameter
 */
router.get("/validate-one/:taskId", validateOneTaskController);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task details
 *     description: |
 *       Returns full metadata for a single task including `visualization_config`,
 *       `explanation_strategy`, `query_labels`, and `analysis_context`.
 *       Internal `sqlQuery` is excluded from the response.
 *     tags:
 *       - Tasks
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID (e.g. S-T01, A-G03)
 *         example: "S-T01"
 *       - in: query
 *         name: includeExperimental
 *         schema:
 *           type: boolean
 *         description: If true, allows access to a task even if its registry_status='experimental'
 *         example: false
 *     responses:
 *       200:
 *         description: Full task metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 task:
 *                   $ref: '#/components/schemas/TaskMetadata'
 *       404:
 *         description: Task not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: { code: "TASK_NOT_FOUND", message: "No task found with id 'X-Y99'." }
 */
router.get("/:taskId", getTaskByIdController);

export default router;
