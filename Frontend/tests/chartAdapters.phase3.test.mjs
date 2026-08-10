import test from "node:test";
import assert from "node:assert/strict";

import * as lineAdapter from "../src/chartAdapters/line.adapter.js";
import * as barAdapter from "../src/chartAdapters/bar.adapter.js";
import * as scatterAdapter from "../src/chartAdapters/scatter.adapter.js";
import * as pieAdapter from "../src/chartAdapters/pie.adapter.js";
import * as heatmapAdapter from "../src/chartAdapters/heatmap.adapter.js";
import * as tableAdapter from "../src/chartAdapters/table.adapter.js";
import * as cardAdapter from "../src/chartAdapters/card.adapter.js";
import * as checklistAdapter from "../src/chartAdapters/checklist.adapter.js";
import {
  deriveChartRequiredFields,
  resolveDatasetForVisualization,
} from "../src/components/chartSelectionPolicy.js";

test("line adapter keeps real values for full valid data", () => {
  const raw = [
    { week: "W1", avg_score: 10 },
    { week: "W2", avg_score: 0 },
  ];
  const out = lineAdapter.adapt(raw, { x_field: "week", y_field: "avg_score" });
  assert.equal(out.data.length, 2);
  assert.deepEqual(out.data.map((d) => d.y), [10, 0]);
  assert.equal(out.meta.skipped_rows, 0);
});

test("bar adapter returns empty structure for empty data", () => {
  const out = barAdapter.adapt([], { x_field: "k", y_field: "v" });
  assert.deepEqual(out.data, []);
  assert.equal(out.meta.valid_rows, 0);
});

test("line adapter skips row with missing x", () => {
  const raw = [
    { week: "W1", avg_score: 1 },
    { week: null, avg_score: 2 },
  ];
  const out = lineAdapter.adapt(raw, { x_field: "week", y_field: "avg_score" });
  assert.equal(out.data.length, 1);
  assert.equal(out.meta.skipped_rows, 1);
  assert.ok(out.meta.missing_fields.includes("week"));
});

test("bar adapter skips row with missing y (no fake zero)", () => {
  const raw = [
    { cohort: "A", cnt: 5 },
    { cohort: "B", cnt: null },
  ];
  const out = barAdapter.adapt(raw, { x_field: "cohort", y_field: "cnt" });
  assert.equal(out.data.length, 1);
  assert.equal(out.data[0].x, "A");
  assert.equal(out.data[0].y, 5);
  assert.equal(out.data[0].__categoryRaw, "A");
  assert.equal(out.data[0].__categoryLabel, "A");
  assert.equal(out.meta.skipped_rows, 1);
  assert.ok(out.meta.missing_fields.includes("cnt"));
});

test("bar adapter formats assessment_order display without mutating raw values", () => {
  const raw = [
    { assessment_order: 0, score_normalized: 11 },
    { assessment_order: 1, score_normalized: 12.5 },
    { assessment_order: 2, score_normalized: 10 },
  ];
  const out = barAdapter.adapt(raw, {
    x_field: "assessment_order",
    y_field: "score_normalized",
    x_label: "Assessment",
    y_label: "Normalized Score (0-100)",
  });

  assert.deepEqual(out.data.map((row) => row.__categoryLabel), [
    "Assessment 1",
    "Assessment 2",
    "Assessment 3",
  ]);
  assert.deepEqual(out.data.map((row) => row.__categoryRaw), [0, 1, 2]);
  assert.deepEqual(out.data.map((row) => row.assessment_order), [0, 1, 2]);
  assert.deepEqual(out.data.map((row) => row.y), [11, 12.5, 10]);
  assert.deepEqual(out.data.map((row) => row.score_normalized), [11, 12.5, 10]);
});

test("bar adapter keeps non-numeric assessment_order readable", () => {
  const out = barAdapter.adapt(
    [{ assessment_order: "Final", score_normalized: 78.35 }],
    { x_field: "assessment_order", y_field: "score_normalized" }
  );

  assert.equal(out.data[0].__categoryRaw, "Final");
  assert.equal(out.data[0].__categoryLabel, "Final");
});

test("bar adapter formats week_number without shifting the week", () => {
  const out = barAdapter.adapt(
    [{ week_number: 5, weekly_clicks: 1500000 }],
    { x_field: "week_number", y_field: "weekly_clicks" }
  );

  assert.equal(out.data[0].__categoryRaw, 5);
  assert.equal(out.data[0].__categoryLabel, "Week 5");
  assert.equal(out.data[0].week_number, 5);
  assert.equal(out.data[0].y, 1500000);
});

test("grouped bar adapter preserves series values and display category label", () => {
  const raw = [
    { resource_type: "forum", student_id: "student_1", pct_of_total: 60 },
    { resource_type: "forum", student_id: "student_2", pct_of_total: 40 },
  ];
  const out = barAdapter.adapt(raw, {
    x_field: "resource_type",
    y_field: "pct_of_total",
    series_field: "student_id",
    variant: "grouped",
  });

  assert.equal(out.data.length, 1);
  assert.equal(out.data[0].x, "forum");
  assert.equal(out.data[0].__categoryRaw, "forum");
  assert.equal(out.data[0].__categoryLabel, "forum");
  assert.equal(out.data[0].student_1, 60);
  assert.equal(out.data[0].student_2, 40);
  assert.deepEqual(out.bars.map((bar) => bar.dataKey), ["student_1", "student_2"]);
});

test("heatmap adapter keeps null numeric as missing cell", () => {
  const raw = [
    { week: "1", class_name: "A", score: 10 },
    { week: "2", class_name: "A", score: null },
  ];
  const out = heatmapAdapter.adapt(raw, {
    x_field: "week",
    y_field: "score",
    series_field: "class_name",
  });
  const nullCell = out.cells.find((c) => c.row === "A" && c.col === "2");
  assert.equal(nullCell.value, null);
  assert.equal(out.meta.skipped_rows, 0);
});

test("scatter adapter skips invalid numeric strings", () => {
  const raw = [
    { x: "10", y: "20" },
    { x: "abc", y: "5" },
  ];
  const out = scatterAdapter.adapt(raw, { x_field: "x", y_field: "y" });
  assert.equal(out.series[0].data.length, 1);
  assert.deepEqual(out.series[0].data[0], { x: 10, y: 20 });
  assert.equal(out.meta.skipped_rows, 1);
});

test("pie adapter groups excess categories into Other", () => {
  const raw = [
    { label: "A", v: 50 },
    { label: "B", v: 20 },
    { label: "C", v: 10 },
    { label: "D", v: 8 },
    { label: "E", v: 6 },
    { label: "F", v: 4 },
    { label: "G", v: 2 },
  ];
  const out = pieAdapter.adapt(raw, { x_field: "label", y_field: "v" });
  assert.ok(out.data.some((slice) => slice.name === "Other"));
  assert.ok(out.meta.warnings.some((w) => w.includes("Other")));
});

test("table/card/checklist adapters handle minimal valid data", () => {
  const table = tableAdapter.adapt([{ a: 1, b: "x" }], {});
  assert.equal(table.rows.length, 1);

  const card = cardAdapter.adapt([{ total: 10 }], {});
  assert.equal(card.type, "card_list");
  assert.equal(card.items.length, 1);

  const checklist = checklistAdapter.adapt(
    [{ flag_name: "flag_test", triggered: true, severity: "high" }],
    {}
  );
  assert.equal(checklist.items.length, 1);
});

test("checklist distinguishes unavailable evidence from a stable zero", () => {
  const checklist = checklistAdapter.adapt(
    [{
      flag_name: "flag_low_punctuality",
      flag_value: null,
      threshold: 0.7,
      triggered: null,
      severity: "info",
      evidence_available: false,
    }],
    {}
  );

  assert.equal(checklist.items[0].available, false);
  assert.equal(checklist.items[0].triggered, false);
  assert.equal(checklist.summary.unavailable, 1);
  assert.equal(
    checklistAdapter.getChecklistDisplayValue("flag_low_punctuality", null),
    "Not available"
  );
});

test("risk status card uses backend risk score without frontend adjustment", () => {
  const card = cardAdapter.adapt(
    [{
      avg_score: 28.75,
      engagement_score: 0,
      punctuality_rate: 1,
      previous_attempt_count: 0,
      pass_threshold: 40,
      target_threshold: 70,
      at_risk_score: 2,
      at_risk_label: "high",
    }],
    { variant: "risk_status" }
  );

  assert.equal(card.type, "risk_status");
  assert.equal(card.riskScore, 2);
  assert.equal(card.riskLabel, "medium");
  assert.ok(!card.meta.warnings.some((warning) => warning.includes("adjusted by hard rules")));
});

test("risk status card marks unavailable engagement instead of displaying zero", () => {
  const card = cardAdapter.adapt(
    [{
      avg_score: 41.25,
      engagement_score: null,
      engagement_score_available: false,
      punctuality_rate: 1,
      previous_attempt_count: 0,
      pass_threshold: 40,
      target_threshold: 70,
      at_risk_score: 0,
      at_risk_label: "low",
    }],
    { variant: "risk_status" }
  );

  const engagement = card.metrics.find((metric) => metric.key === "engagement_score");
  assert.equal(engagement.value, null);
  assert.equal(engagement.available, false);
});

test("risk status card marks unavailable punctuality instead of displaying 100 percent", () => {
  const card = cardAdapter.adapt(
    [{
      avg_score: 41.25,
      engagement_score: null,
      engagement_score_available: false,
      punctuality_rate: null,
      punctuality_rate_available: false,
      previous_attempt_count: 0,
      pass_threshold: 40,
      target_threshold: 70,
      at_risk_score: 0,
      at_risk_label: "low",
    }],
    { variant: "risk_status" }
  );

  const punctuality = card.metrics.find((metric) => metric.key === "punctuality_rate");
  assert.equal(punctuality.value, null);
  assert.equal(punctuality.available, false);
});

test("A-G03 contact queue preserves unavailable engagement and punctuality", () => {
  const queue = cardAdapter.adapt(
    [{
      student_id: "S001",
      avg_score: 35,
      engagement_score: null,
      engagement_score_available: false,
      punctuality_rate: null,
      punctuality_rate_available: false,
      previous_attempt_count: 1,
      at_risk_score: 3,
      at_risk_label: "high",
      flag_low_score: true,
      flag_repeated: true,
      flag_neg_trend: true,
    }],
    { variant: "at_risk_contact_queue" }
  );

  assert.equal(queue.students[0].engagementScoreAvailable, false);
  assert.equal(queue.students[0].punctualityRateAvailable, false);
  assert.equal(queue.students[0].engagementScore, null);
  assert.equal(queue.students[0].punctualityRate, null);
  assert.match(queue.students[0].recommendedAdminAction, /academic recovery check-in/i);
  assert.match(queue.students[0].recommendedAdminAction, /prior-attempt difficulties/i);
  assert.match(queue.students[0].recommendedAdminAction, /recent feedback/i);
});

test("S-T13 action plan does not treat unavailable engagement as observed zero", () => {
  const card = cardAdapter.adapt(
    [{
      avg_score: 41.25,
      performance_trend: 2.5,
      engagement_score: 0,
      engagement_score_available: false,
      absence_rate: 0.125,
      pass_threshold: 40,
      target_threshold: 70,
      at_risk_score: 0,
      at_risk_label: "low",
    }],
    { variant: "action_plan" }
  );

  assert.deepEqual(card.steps.map((step) => step.key), ["score-target"]);
  assert.equal(card.summary.engagementScore, null);
  assert.equal(card.summary.engagementAvailable, false);
});

test("S-T13 action plan uses the same attendance trigger as AI rules", () => {
  const card = cardAdapter.adapt(
    [{
      avg_score: 75,
      performance_trend: 1,
      engagement_score: null,
      engagement_score_available: false,
      absence_rate: 0.25,
      pass_threshold: 40,
      target_threshold: 70,
      at_risk_score: 0,
      at_risk_label: "low",
    }],
    { variant: "action_plan" }
  );

  assert.deepEqual(card.steps.map((step) => step.key), ["attendance"]);
  assert.match(card.steps[0].reason, /Relative absence index/);
});

test("multi-query selector uses explicit dataset_label and deterministic fallback", () => {
  const taskMeta = {
    query_labels: ["summary", "detail"],
    availability_contract: { chart_required_fields: ["x", "y"] },
  };
  const datasets = {
    summary: [{ x: "A", y: 1 }],
    detail: [{ x: "B", y: 2 }],
  };
  const config = { x_field: "x", y_field: "y", dataset_label: "detail" };
  const required = deriveChartRequiredFields(taskMeta, config, "scatter_plot");
  const explicit = resolveDatasetForVisualization({
    taskMeta,
    datasets,
    config,
    vizType: "scatter_plot",
    chartRequiredFields: required,
  });
  assert.equal(explicit.selectedDatasetLabel, "detail");
  assert.deepEqual(explicit.rawData, datasets.detail);

  const fallback = resolveDatasetForVisualization({
    taskMeta,
    datasets,
    config: { x_field: "x", y_field: "y", dataset_label: "missing" },
    vizType: "scatter_plot",
    chartRequiredFields: required,
  });
  assert.equal(fallback.selectedDatasetLabel, "summary");
  assert.ok(fallback.warnings.length > 0);
});
