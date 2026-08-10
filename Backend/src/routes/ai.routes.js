import express from "express";
import { explainController } from "../controllers/ai.controller.js";

const router = express.Router();

/**
 * @swagger
 * /api/ai/explain:
 *   post:
 *     summary: Request AI explanation for an analytics result
 *     description: |
 *       Node proxy endpoint. Receives analytics result + task context from the frontend,
 *       enriches the payload with metadata from `taskRegistry.json`, then forwards to
 *       the Python FastAPI AI service (`POST /explain`).
 *
 *       **Flow:**
 *       ```
 *       Frontend → POST /api/ai/explain (Node)
 *                → enrich payload with task.explanation_strategy,
 *                               task.target_audience,
 *                               task.analysis_context,
 *                               task.visualization_config
 *                → POST http://localhost:8000/explain (Python FastAPI)
 *                → ExplanationStrategyFactory picks Strategy class
 *                → LLM call (JSON mode, max_tokens=800, temp=0, seed=42)
 *                → SafetyFilter (5 categories)
 *                → ObservabilityLogger (ai_explanation_log table)
 *                → Response back to Frontend
 *       ```
 *
 *       **Degradation:** If Python service is unavailable (timeout/crash), returns
 *       `degraded: true` with an `AIDegradedResponse`. Chart rendering is NEVER blocked.
 *
 *       **Timeout chain:**
 *       - Node → Python: 15 000 ms (`AI_SERVICE_TIMEOUT_MS` env var)
 *       - Python → LLM:  12 000 ms (3s buffer)
 *     tags:
 *       - AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AIExplainRequest'
 *           examples:
 *             trend_high_confidence:
 *               summary: "S-T01 — Score trend, HIGH confidence"
 *               value:
 *                 taskId: "S-T01"
 *                 executionId: "exec_1747405614_a3f2b1c0"
 *                 datasets:
 *                   score_trend:
 *                     - { assessment_order: 1, score_normalized: 78.5, pass_flag: true  }
 *                     - { assessment_order: 2, score_normalized: 65.0, pass_flag: false }
 *                     - { assessment_order: 3, score_normalized: 81.2, pass_flag: true  }
 *                 meta:
 *                   dataQuality:
 *                     confidence: "HIGH"
 *                     confidence_reason: "45 students × 5 assessments."
 *                 studentContext:
 *                   student_id: "STU_001"
 *                   gender: "M"
 *                   age_group: "35-55"
 *             risk_medium_confidence:
 *               summary: "S-B02 — Risk status, MEDIUM confidence"
 *               value:
 *                 taskId: "S-B02"
 *                 executionId: "exec_1747405614_b9c3d2e1"
 *                 datasets:
 *                   risk_summary:
 *                     - { avg_score: 38.5, at_risk_label: "high", at_risk_score: 4, engagement_score: 0.12 }
 *                 meta:
 *                   dataQuality:
 *                     confidence: "MEDIUM"
 *                     confidence_reason: "3 assessments only — limited temporal range."
 *                 studentContext: null
 *     responses:
 *       200:
 *         description: |
 *           AI explanation generated successfully. Check `degraded` field first.
 *           If `degraded: true`, render `<AIDegradedBanner />` — explanation fields will be empty.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/AIExplainResponse'
 *                 - $ref: '#/components/schemas/AIDegradedResponse'
 *             examples:
 *               success:
 *                 summary: "Successful explanation (trend, HIGH confidence)"
 *                 value:
 *                   task_id: "S-T01"
 *                   execution_id: "exec_1747405614_a3f2b1c0"
 *                   degraded: false
 *                   explanation:
 *                     summary: "The student's normalized assessment scores show a declining trend from assessment 1 to 2, with a partial recovery at assessment 3."
 *                     insights:
 *                       - title: "Score Decline at Assessment 2"
 *                         description: "Normalized score dropped from 78.5 to 65.0 between assessments 1 and 2."
 *                         severity: "medium"
 *                         evidence:
 *                           - { metric: "score_normalized", value: 65.0, comparison: "down_from_previous", delta: -13.5, context: "assessment_order=2" }
 *                           - { metric: "score_normalized", value: 78.5, comparison: "baseline", delta: null, context: "assessment_order=1" }
 *                     educational_implications:
 *                       - "The pattern suggests increased difficulty or reduced preparation time mid-semester."
 *                     recommendations:
 *                       - { priority: "medium", action: "Review engagement patterns during assessment 2–3 alongside score data.", rationale: "Score decline may correlate with reduced platform activity during that period." }
 *                     warnings: []
 *                   confidence:
 *                     level: "HIGH"
 *                     reason: "45 students × 5 assessments — sufficient data range."
 *                     based_on: ["sufficient_data"]
 *                   explanation_type: "temporal"
 *                   explanation_strategy: "trend"
 *                   ai_summary_method: "task_aware_data_summarization"
 *                   ai_summary_version: "v1"
 *                   baseline_available: true
 *                   input_summary_type: "trend_series"
 *                   safety_flags: []
 *                   meta:
 *                     model: "gpt-4o-mini"
 *                     latency_ms: 1240
 *                     token_usage: { prompt_tokens: 312, completion_tokens: 187, total_tokens: 499 }
 *                     strategy: "trend"
 *                     granularity: "per_assessment"
 *                     cost_usd: 0.00029
 *               degraded:
 *                 summary: "Degraded (Python service unavailable)"
 *                 value:
 *                   task_id: "S-T01"
 *                   execution_id: "exec_1747405614_a3f2b1c0"
 *                   degraded: true
 *                   explanation:
 *                     summary: "AI explanation is temporarily unavailable."
 *                     insights: []
 *                     educational_implications: []
 *                     recommendations: []
 *                     warnings: ["LLM service timeout. Please try again later."]
 *                   confidence: { level: null, reason: null, based_on: [] }
 *                   ai_summary_method: "unavailable"
 *                   ai_summary_version: "unavailable"
 *                   baseline_available: true
 *                   input_summary_type: "unavailable"
 *                   safety_flags: []
 *                   meta: { model: null, latency_ms: 15001, token_usage: null, strategy: null, granularity: null, cost_usd: null }
 *       400:
 *         description: Missing required fields (taskId, executionId, datasets)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Task not found in registry
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: AI service unavailable — returns degraded response (not an error envelope)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIDegradedResponse'
 */
router.post("/explain", explainController);

export default router;
