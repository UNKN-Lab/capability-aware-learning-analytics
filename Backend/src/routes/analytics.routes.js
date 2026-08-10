import express from "express";
import { runAnalyticsController } from "../controllers/analytics.controller.js";

const router = express.Router();

/**
 * POST /api/analytics/run
 *
 * Execute an analytics task against the active dataset.
 *
 * Body: {
 *   taskId: string,
 *   params: {
 *     batch_id:       string   (required)
 *     class_id:       string   (required for most tasks)
 *     student_id?:    string   (1-student scope tasks)
 *     enrollment_id?: string   (OULAD engagement tasks: S-T05, S-T06)
 *     s1?:            string   (comparison tasks A-C0x)
 *     s2?:            string   (comparison tasks A-C0x)
 *   }
 * }
 */

/**
 * @swagger
 * /api/analytics/run:
 *   post:
 *     summary: Execute an analytical task
 *     description: |
 *       Runs a specific analytical task (defined in `taskRegistry.json`) against the current
 *       dataset using the provided parameters.
 *
 *       The response `datasets` object is keyed by `task.query_labels[]` — NOT a raw array.
 *       Frontend reads `datasets[query_labels[0]]` as the primary dataset for `ChartRenderer`.
 *
 *       **Normalization:** `normalizeAnalyticsResult()` in `analytics.controller.js` maps
 *       raw SQL result(s) to named keys using `task.query_labels[]`.
 *
 *       **Multi-query tasks** (e.g. S-T07: absence data + score series) return multiple keys:
 *       ```json
 *       { "datasets": { "absence_data": [...], "score_series": [...] } }
 *       ```
 *     tags:
 *       - Analytics
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnalyticsRequest'
 *           examples:
 *             single_student_trend:
 *               summary: "S-T01 — Score trend (single student)"
 *               value:
 *                 taskId: "S-T01"
 *                 params:
 *                   batch_id: "SAMPLE_OULAD"
 *                   class_id: "CLASS_101"
 *                   student_id: "STU_001"
 *             cohort_risk:
 *               summary: "A-G03 — At-risk cohort (admin view)"
 *               value:
 *                 taskId: "A-G03"
 *                 params:
 *                   batch_id: "SAMPLE_OULAD"
 *                   class_id: "CLASS_101"
 *             comparison_two_students:
 *               summary: "A-C01 — Compare 2 students"
 *               value:
 *                 taskId: "A-C01"
 *                 params:
 *                   batch_id: "SAMPLE_OULAD"
 *                   class_id: "CLASS_101"
 *                   s1: "STU_001"
 *                   s2: "STU_002"
 *     responses:
 *       200:
 *         description: Task executed successfully. `datasets` is keyed by `query_labels`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsResponse'
 *             examples:
 *               score_trend:
 *                 summary: "S-T01 — single-query result"
 *                 value:
 *                   success: true
 *                   executionId: "exec_1747405614_a3f2b1c0"
 *                   taskId: "S-T01"
 *                   datasets:
 *                     score_trend:
 *                       - { assessment_order: 1, week_of_class: 3, score_normalized: 78.5, pass_flag: true  }
 *                       - { assessment_order: 2, week_of_class: 6, score_normalized: 65.0, pass_flag: false }
 *                       - { assessment_order: 3, week_of_class: 9, score_normalized: 81.2, pass_flag: true  }
 *                   meta:
 *                     taskId: "S-T01"
 *                     isMultiQuery: false
 *                     queryCount: 1
 *                     executionTimeMs: 42
 *                     queryHash: "a3f2b1c0"
 *                     dataQuality:
 *                       status: "executable"
 *                       confidence: "HIGH"
 *                       confidence_reason: "45 students × 5 assessments across 9 weeks."
 *                       warnings: []
 *               multi_query:
 *                 summary: "S-T07 — multi-query result (absence_data + score_series)"
 *                 value:
 *                   success: true
 *                   executionId: "exec_1747405614_b9c3d2e1"
 *                   taskId: "S-T07"
 *                   datasets:
 *                     absence_data:
 *                       - { absences: 5, absence_rate: 0.25 }
 *                     score_series:
 *                       - { assessment_order: 1, score_normalized: 72.0 }
 *                       - { assessment_order: 2, score_normalized: 58.5 }
 *                   meta:
 *                     taskId: "S-T07"
 *                     isMultiQuery: true
 *                     queryCount: 2
 *                     executionTimeMs: 67
 *                     queryHash: "b9c3d2e1"
 *                     dataQuality:
 *                       status: "executable"
 *                       confidence: "MEDIUM"
 *                       confidence_reason: "UCI dataset — 2 assessments available."
 *                       warnings: ["Absence data available for UCI dataset only"]
 *       400:
 *         description: Missing taskId, params, or required param for this task scope
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: { code: "MISSING_PARAM", message: "student_id is required for task scope '1 student'." }
 *       404:
 *         description: Task not found in registry
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: SQL execution error or internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/run", runAnalyticsController);

export default router;
