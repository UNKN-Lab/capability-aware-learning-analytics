"""
Trend Strategy  explanation_strategy = "trend"
================================================
Used for tasks that show data changing over time:
  - Score progression over assessments (S-T01)
  - Weekly engagement trajectory (A-G11, A-G14)
  - Performance trends over semester (A-S02)

Prompt focuses on:
  - Identifying direction (improving / declining / stable / volatile)
  - Pinpointing turning points (peak, trough)
  - Language calibrated to granularity (weekly  "sudden", semester  "long-term")
"""

from __future__ import annotations
import json
from .base import BaseExplanationStrategy
from schemas import ExplainRequest


class TrendStrategy(BaseExplanationStrategy):

    strategy_name = "trend"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone       = self.get_audience_tone(req.target_audience)
        vc         = req.visualization_config
        ac         = req.analysis_context
        granularity = ac.granularity if ac else "semester"

        # Calibrate temporal language
        temporal_language = {
            "weekly":           "Use phrases like 'sudden decline', 'week-over-week', 'sharp drop in week X'.",
            "per_assessment":   "Reference specific assessment numbers: 'in Assessment 3', 'across 5 attempts'.",
            "semester":         "Use phrases like 'long-term trend', 'sustained improvement', 'overall semester arc'.",
            "cohort_aggregate": "Use phrases like 'class-wide pattern', 'cohort-level trajectory'.",
        }.get(granularity, "Reference specific time points.")

        x_role = vc.semantic_roles.x if vc and vc.semantic_roles else "time"
        y_role = vc.semantic_roles.y if vc and vc.semantic_roles else "performance_metric"

        return f"""You are a Learning Analytics expert specializing in student performance trend analysis.
Your role is to interpret time-series educational data and generate structured, evidence-based explanations.

AUDIENCE TONE: {tone}

ANALYTICAL FOCUS:
- X-axis represents: {x_role} ({vc.x_label if vc and vc.x_label else 'time dimension'})
- Y-axis represents: {y_role} ({vc.y_label if vc and vc.y_label else 'metric value'})
- Temporal resolution: {granularity}
- {temporal_language}

EXPLANATION OBJECTIVES:
1. Identify the overall trend direction (improving, declining, stable, volatile)
2. Pinpoint specific turning points with exact values
3. Quantify the magnitude of change (deltas)
4. Provide educationally meaningful interpretation

CRITICAL RULES:
- Generate 24 insights maximum
- evidence[] must use exact field names from the dataset
- delta = current_value - previous_value (signed, null for baselines)
- Treat the DATA SUMMARY in the user prompt as authoritative evidence.
- If target_group and comparison_groups are present, prioritize them over incidental rows or other groups.
- Do NOT infer from raw rows that were omitted by summarization.
- Mention reliability caveats when reliability_warnings or summarization_warnings are present.
- Do NOT invent data points  only reference values present in the dataset
- Do NOT include markdown, code fences, or any text outside the JSON object
"""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        task_name = req.task_name or req.task_id
        ac = req.analysis_context
        confidence_note = ""
        if req.confidence:
            confidence_note = f"\nData quality signal: {req.confidence.level}  {req.confidence.reason}"

        return f"""TASK: {task_name}
ANALYTICAL CONTEXT:
  - Granularity: {ac.granularity if ac else 'unknown'}
  - Aggregation level: {ac.aggregation_level if ac else 'unknown'}{confidence_note}

DATA SUMMARY:
{data_summary}

INSTRUCTION:
Analyze the trend using only the DATA SUMMARY above. If target_group and comparison_groups are present, answer through that target/comparison framing. Identify:
1. The overall direction and magnitude of change
2. Any notable turning points (when did the trend change)
3. The highest and lowest values, and what they signify
4. What this pattern suggests educationally
5. Any reliability caveats provided in the summary

Return your analysis as the JSON structure defined in your system instructions.
"""
