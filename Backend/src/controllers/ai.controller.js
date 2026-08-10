/**
 * ai.controller.js
 * Node proxy: enriches payload with task metadata → forwards to Python FastAPI AI service.
 *
 * Phase 3 STEP 3 — Skeleton (DEGRADED fallback only until Python service is live)
 *
 * Flow:
 *   Frontend → POST /api/ai/explain
 *     → read task from taskRegistryService
 *     → build enriched payload (adds explanation_strategy, target_audience, analysis_context, visualization_config)
 *     → POST to AI_SERVICE_URL/explain (axios, timeout=AI_SERVICE_TIMEOUT_MS)
 *     → return structured response or DEGRADED if service down
 */

import axios from "axios";
import taskRegistryService from "../services/taskRegistry.service.js";
import prisma from "../lib/prisma.js";
const AI_SERVICE_URL     = process.env.AI_SERVICE_URL      || "http://localhost:8000";
const AI_SERVICE_TIMEOUT = parseInt(process.env.AI_SERVICE_TIMEOUT_MS) || 15000;

/**
 * Build the DEGRADED response shape (CONTRACT 3).
 * Returned whenever Python service is unavailable — chart rendering is never blocked.
 */
function buildDegradedResponse(taskId, executionId, reason) {
  return {
    task_id:              taskId      ?? null,
    execution_id:         executionId ?? null,
    degraded:             true,
    explanation: {
      summary:                  "AI explanation is temporarily unavailable.",
      insights:                 [],
      educational_implications: [],
      recommendations:          [],
      warnings:                 [reason ?? "LLM service timeout. Please try again later."],
    },
    confidence:           { level: null, reason: null, based_on: [] },
    explanation_type:     null,
    explanation_strategy: null,
    ai_summary_method:    "unavailable",
    ai_summary_version:   "unavailable",
    baseline_available:   true,
    input_summary_type:   "unavailable",
    safety_flags:         [],
    meta: {
      model:       null,
      latency_ms:  AI_SERVICE_TIMEOUT + 1,
      token_usage: null,
      strategy:    null,
      granularity: null,
      cost_usd:    null,
    },
  };
}

/**
 * Helper: Detect proxy competency mode from datasets rows.
 * Reads competency_source field injected by SQL CASE expression.
 * Returns null if task has no competency dimension.
 */
function buildSemanticContext(task, datasets) {
  const allRows = Object.values(datasets).flat();
  // competency_source is in SQL output for S-T02, A-S05, A-G04 only
  const hasSource = allRows.some(r => r?.competency_source != null);
  if (!hasSource) return null;

  const hasProxy  = allRows.some(r => r?.competency_source === "proxy");
  const hasNative = allRows.some(r => r?.competency_source === "native");
  const hasUnknown = allRows.some(r => r?.competency_source === "unknown");

  const competencyMode =
    hasNative && hasProxy   ? "mixed"   :
    hasNative               ? "native"  :
    hasProxy                ? "proxy"   :
    hasUnknown              ? "unknown" : null;

  if (!competencyMode) return null;

  return {
    competency_mode:        competencyMode,
    competency_proxy_note:  task.semanticNote ?? null,
  };
}

function buildAISummaryConfig(task) {
  if (!task?.aiSummaryType) return null;

  return {
    summary_type:           task.aiSummaryType,
    target_group:           task.aiTargetGroup ?? null,
    comparison_groups:      Array.isArray(task.aiComparisonGroups) ? task.aiComparisonGroups : [],
    dynamic_comparison_groups: task.aiDynamicComparisonGroups === true,
    comparison_alignment_columns: Array.isArray(task.aiComparisonAlignmentColumns)
      ? task.aiComparisonAlignmentColumns : [],
    divergence_threshold:   task.aiDivergenceThreshold ?? null,
    time_column:            task.aiTimeColumn ?? null,
    x_column:               task.aiXColumn ?? null,
    y_column:               task.aiYColumn ?? null,
    metric_column:          task.aiMetricColumn ?? null,
    entity_column:          task.aiEntityColumn ?? null,
    color_column:           task.aiColorColumn ?? null,
    coefficient_column:     task.aiCoefficientColumn ?? null,
    coefficient_method:     task.aiCoefficientMethod ?? null,
    sample_size_column:     task.aiSampleSizeColumn ?? null,
    p_value_column:         task.aiPValueColumn ?? null,
    outlier_policy:         task.aiOutlierPolicy ?? null,
    group_column:           task.aiGroupColumn ?? null,
    group_key_columns:      Array.isArray(task.aiGroupKeyColumns) ? task.aiGroupKeyColumns : [],
    series_column:          task.aiSeriesColumn ?? null,
    gap_column:             task.aiGapColumn ?? null,
    reliability_column:     task.aiReliabilityColumn ?? null,
    minimum_reliable_count: task.aiMinimumReliableCount ?? null,
    minimum_sample_size:    task.aiMinimumSampleSize ?? null,
    category_column:        task.aiCategoryColumn ?? null,
    bin_column:             task.aiBinColumn ?? null,
    count_column:           task.aiCountColumn ?? null,
    percent_column:         task.aiPercentColumn ?? null,
    metric_columns:         Array.isArray(task.aiMetricColumns) ? task.aiMetricColumns : [],
    status_columns:         Array.isArray(task.aiStatusColumns) ? task.aiStatusColumns : [],
    threshold_columns:      Array.isArray(task.aiThresholdColumns) ? task.aiThresholdColumns : [],
    benchmark_columns:      Array.isArray(task.aiBenchmarkColumns) ? task.aiBenchmarkColumns : [],
    sensitive_columns:      Array.isArray(task.aiSensitiveColumns) ? task.aiSensitiveColumns : [],
    metric_availability_columns:
      task.aiMetricAvailabilityColumns && typeof task.aiMetricAvailabilityColumns === "object"
        ? task.aiMetricAvailabilityColumns : {},
    threshold_sources:      task.aiThresholdSources && typeof task.aiThresholdSources === "object"
      ? task.aiThresholdSources : {},
    benchmark_sources:      task.aiBenchmarkSources && typeof task.aiBenchmarkSources === "object"
      ? task.aiBenchmarkSources : {},
    metric_key_column:      task.aiMetricKeyColumn ?? null,
    metric_value_column:    task.aiMetricValueColumn ?? null,
    entity_order:           Array.isArray(task.aiEntityOrder) ? task.aiEntityOrder : [],
    metric_directions:      task.aiMetricDirections && typeof task.aiMetricDirections === "object"
      ? task.aiMetricDirections : {},
    metric_units:           task.aiMetricUnits && typeof task.aiMetricUnits === "object"
      ? task.aiMetricUnits : {},
    metric_thresholds:      task.aiMetricThresholds && typeof task.aiMetricThresholds === "object"
      ? task.aiMetricThresholds : {},
    minimum_entity_count:   Number.isInteger(task.aiMinimumEntityCount)
      ? task.aiMinimumEntityCount : 2,
    require_metric_directions: task.aiRequireMetricDirections === true,
    require_metric_units:      task.aiRequireMetricUnits === true,
    require_metric_thresholds: task.aiRequireMetricThresholds === true,
    selected_entity_column:    task.aiSelectedEntityColumn ?? null,
    entity_evidence_available_column: task.aiEntityEvidenceAvailableColumn ?? null,
    sensitive_context_policy:  task.aiSensitiveContextPolicy ?? null,
    require_sensitive_context_policy: task.aiRequireSensitiveContextPolicy === true,
    focus_categories:       Array.isArray(task.aiFocusCategories) ? task.aiFocusCategories : [],
    focus_bins:             Array.isArray(task.aiFocusBins) ? task.aiFocusBins : [],
    category_order:         Array.isArray(task.aiCategoryOrder) ? task.aiCategoryOrder : [],
    expected_categories:    Array.isArray(task.aiExpectedCategories) ? task.aiExpectedCategories : [],
    expected_groups:        Array.isArray(task.aiExpectedGroups) ? task.aiExpectedGroups : [],
    bin_order:              Array.isArray(task.aiBinOrder) ? task.aiBinOrder : [],
    expected_bins:          Array.isArray(task.aiExpectedBins) ? task.aiExpectedBins : [],
    numeric_threshold:      task.aiNumericThreshold ?? null,
    threshold_direction:    task.aiThresholdDirection ?? null,
    sort_by:                task.aiSortBy ?? null,
    sort_direction:         task.aiSortDirection ?? null,
    flag_name_column:       task.aiFlagNameColumn ?? null,
    flag_value_column:      task.aiFlagValueColumn ?? null,
    threshold_column:       task.aiThresholdColumn ?? null,
    triggered_column:       task.aiTriggeredColumn ?? null,
    severity_column:        task.aiSeverityColumn ?? null,
    description_column:     task.aiDescriptionColumn ?? null,
    recommended_action_column: task.aiRecommendedActionColumn ?? null,
    support_category_column:   task.aiSupportCategoryColumn ?? null,
    severity_order:         Array.isArray(task.aiSeverityOrder) ? task.aiSeverityOrder : [],
    flag_order:             Array.isArray(task.aiFlagOrder) ? task.aiFlagOrder : [],
    max_flags:              task.aiMaxFlags ?? null,
    secondary_metric_columns: Array.isArray(task.aiSecondaryMetricColumns) ? task.aiSecondaryMetricColumns : [],
    flag_columns:             Array.isArray(task.aiFlagColumns) ? task.aiFlagColumns : [],
    action_columns:           Array.isArray(task.aiActionColumns) ? task.aiActionColumns : [],
    label_columns:            Array.isArray(task.aiLabelColumns) ? task.aiLabelColumns : [],
    evidence_columns:         Array.isArray(task.aiEvidenceColumns) ? task.aiEvidenceColumns : [],
    evidence_dataset_roles:
      task.aiEvidenceDatasetRoles
      && typeof task.aiEvidenceDatasetRoles === "object"
      && !Array.isArray(task.aiEvidenceDatasetRoles)
        ? task.aiEvidenceDatasetRoles : {},
    action_source:            task.aiActionSource ?? null,
    action_rule_set_id:       task.aiActionRuleSetId ?? null,
    action_rule_version:      task.aiActionRuleVersion ?? null,
    action_evidence_contract: Array.isArray(task.aiActionEvidenceContract)
      ? task.aiActionEvidenceContract : [],
    action_derived_evidence:  Array.isArray(task.aiActionDerivedEvidence)
      ? task.aiActionDerivedEvidence : [],
    action_conflict_rules:    Array.isArray(task.aiActionConflictRules)
      ? task.aiActionConflictRules : [],
    action_rules:             Array.isArray(task.aiActionRules) ? task.aiActionRules : [],
    priority_column:          task.aiPriorityColumn ?? null,
    owner_column:             task.aiOwnerColumn ?? null,
    time_horizon_column:      task.aiTimeHorizonColumn ?? null,
    trigger_columns:          Array.isArray(task.aiTriggerColumns) ? task.aiTriggerColumns : [],
    max_actions:              Number.isInteger(task.aiMaxActions) ? task.aiMaxActions : null,
    provenance_required_fields: Array.isArray(task.aiProvenanceRequiredFields)
      ? task.aiProvenanceRequiredFields : [],
    require_complete_action_provenance:
      task.aiRequireCompleteActionProvenance !== false,
    unsupported_action_behavior:
      task.aiUnsupportedActionBehavior ?? "emit_unsupported_actions",
    sensitive_action_policy: task.aiSensitiveActionPolicy ?? null,
    require_sensitive_action_policy:
      task.aiRequireSensitiveActionPolicy === true,
    max_points:               task.aiMaxPoints ?? null,
    top_k:                    task.aiTopK ?? null,
    bottom_k:                 task.aiBottomK ?? null,
  };
}

function buildDatasetsSnapshot(datasets) {
  if (!datasets || typeof datasets !== "object") return null;
  const snapshot = {};
  for (const [label, rows] of Object.entries(datasets)) {
    if (!Array.isArray(rows)) continue;
    const nullCount = rows.filter(r => Object.values(r).some(v => v === null)).length;
    snapshot[label] = {
      rowCount: rows.length,
      nullPct:  rows.length > 0 ? +(nullCount / rows.length).toFixed(3) : 0,
    };
  }
  return snapshot;
}

/**
 * Helper: Asynchronously log the AI execution to Prisma without blocking the request.
 */
async function logExplanation({ payload, responseData, isDegraded, degradedReason, startTime }) {
  const latencyMs = Date.now() - startTime;
  
  try {
    const studentId = payload.student_context?.student_id ?? null;
    const meta = responseData?.meta ?? {};

    await prisma.aiExplanationLog.create({
      data: {
        execution_id:         payload.execution_id,
        task_id:              payload.task_id,
        student_id:           studentId,

        // Strategy metadata (snapshot from registry)
        explanation_strategy: payload.explanation_strategy ?? "unknown",
        target_audience:      payload.target_audience ?? [],
        granularity:          payload.analysis_context?.granularity ?? null,
        aggregation_level:    payload.analysis_context?.aggregation_level ?? null,

        // Outcome
        is_degraded:          isDegraded,
        degraded_reason:      degradedReason ?? null,

        // Quality
        confidence_level:     responseData?.confidence?.level ?? null,
        confidence_reason:    responseData?.confidence?.reason ?? null,

        // Output Storage
        explanation_text:     responseData?.explanation?.summary ?? null,
        structured_output:    responseData ?? null,
        datasets_snapshot:    buildDatasetsSnapshot(payload.datasets),

        // Timing
        latency_ms:           latencyMs,
        python_latency_ms:    meta.latency_ms ?? null,

        // Provenance
        model_version:        meta.model ?? null,
        prompt_token_count:   meta.token_usage?.prompt_tokens ?? null,
        response_token_count: meta.token_usage?.completion_tokens ?? null,
      }
    });
  } catch (err) {
    console.error("[ai.controller] Failed to log AI explanation to Prisma:", err.message);
  }
}

/**
 * POST /api/ai/explain
 */
export async function explainController(req, res) {
  const { taskId, executionId, datasets, meta, studentContext } = req.body;
  const startTime = Date.now();

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!taskId) {
    return res.status(400).json({
      success: false,
      error: { code: "MISSING_FIELD", message: "taskId is required." },
    });
  }
  if (!executionId) {
    return res.status(400).json({
      success: false,
      error: { code: "MISSING_FIELD", message: "executionId is required." },
    });
  }
  if (!datasets || typeof datasets !== "object") {
    return res.status(400).json({
      success: false,
      error: { code: "MISSING_FIELD", message: "datasets object is required." },
    });
  }

  // ── Resolve task metadata ───────────────────────────────────────────────────
  const task = taskRegistryService.getTaskById(taskId);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: "TASK_NOT_FOUND", message: `No task found with id '${taskId}'.` },
    });
  }

  // ── Build enriched payload (node enriches with task metadata) ───────────────
  const payload = {
    task_id:              taskId,
    execution_id:         executionId,
    task_name:            task.taskName,
    analysis_type:        task.analytics?.analysisType ?? null,
    explanation_strategy: task.explanation_strategy,
    explanation_type:     task.analytics?.explanationType ?? null,
    ai_prompt_hint:       task.aiPromptHint ?? null,
    actionable_question:  task.actionableQuestion ?? null,
    target_audience:      task.target_audience,
    visualization_config: task.visualization_config ?? null,
    analysis_context:     task.analysis_context ?? null,
    datasets,
    confidence: {
      level:  meta?.dataQuality?.confidence        ?? "LOW",
      reason: meta?.dataQuality?.confidence_reason ?? "Unknown.",
    },
    student_context:  studentContext ?? null,
    query_labels:     task.query_labels ?? [],
    semantic_context: buildSemanticContext(task, datasets),  // proxy competency detection
    ai_summary_config: buildAISummaryConfig(task),
  };

  // ── Forward to Python AI service ────────────────────────────────────────────
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/explain`,
      payload,
      { timeout: AI_SERVICE_TIMEOUT },
    );
    
    // Log asynchronously
    logExplanation({
      payload,
      responseData: response.data,
      isDegraded: false,
      startTime
    });

    return res.json(response.data);
  } catch (err) {
    // Graceful degradation — chart is NEVER blocked by AI failure
    const reason =
      err.code === "ECONNABORTED"
        ? `AI service timeout after ${AI_SERVICE_TIMEOUT}ms.`
        : err.code === "ECONNREFUSED"
        ? "AI service unavailable (connection refused)."
        : `AI service error: ${err.message}`;

    console.error(`[ai.controller] Degraded — ${reason}`);
    const degradedResponse = buildDegradedResponse(taskId, executionId, reason);
    
    // Log fallback asynchronously
    logExplanation({
      payload,
      responseData: degradedResponse,
      isDegraded: true,
      degradedReason: reason,
      startTime
    });

    // Return 200 OK with degraded=true so frontend fetch doesn't throw
    // Wait, contract 3 says Node proxy returns the response. Usually 200 is better for degraded UI.
    // Changing from 503 to 200 because it's a handled fallback, not a complete server crash.
    return res.status(200).json(degradedResponse);
  }
}
