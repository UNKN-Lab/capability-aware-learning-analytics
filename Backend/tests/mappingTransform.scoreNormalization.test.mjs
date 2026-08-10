import test from "node:test";
import assert from "node:assert/strict";

import { transformRawRowsToCanonical } from "../src/services/mappingTransform.service.js";

function scoreMapping(sourceField) {
  return {
    id: `map_${sourceField}`,
    source_fields: [sourceField],
    canonical_field: "score_normalized",
    transform: "normalize_score",
    status: "confirmed",
    confidence: 0.98,
    entity_scope: "assessment",
    review_comment: null
  };
}

function profiling(columns) {
  return {
    columns: columns.map((raw_column) => ({
      raw_column,
      detected_type: "numeric",
      sample_values: []
    }))
  };
}

function confirmedMapping(sourceDataset, columns) {
  return {
    dataset_name: sourceDataset,
    source_dataset: sourceDataset,
    mapping_status: "confirmed",
    version: 1,
    confirmed_at: "2026-06-20T00:00:00.000Z",
    field_mappings: columns.map(scoreMapping)
  };
}

test("generic UCI import preserves raw grades and normalizes G1/G2/G3 to 0..100", () => {
  const columns = ["G1", "G2", "G3"];
  const result = transformRawRowsToCanonical({
    mappingConfig: confirmedMapping("UCI", columns),
    profilingResult: profiling(columns),
    rawRows: [{ G1: "7", G2: "8", G3: "10" }],
    batchId: "test_uci"
  });

  assert.deepEqual(
    result.output.assessment_result.map(({ score_raw, score_normalized, pass_flag }) => ({
      score_raw,
      score_normalized,
      pass_flag
    })),
    [
      { score_raw: 7, score_normalized: 35, pass_flag: false },
      { score_raw: 8, score_normalized: 40, pass_flag: true },
      { score_raw: 10, score_normalized: 50, pass_flag: true }
    ]
  );
  assert.deepEqual(
    result.output.assessment.map(({
      assessment_name,
      assessment_type,
      assessment_order,
      due_day,
      week_of_class,
      weight_pct,
      is_final_assessment
    }) => ({
      assessment_name,
      assessment_type,
      assessment_order,
      due_day,
      week_of_class,
      weight_pct,
      is_final_assessment
    })),
    [
      {
        assessment_name: "G1",
        assessment_type: "quiz",
        assessment_order: 1,
        due_day: 21,
        week_of_class: 3,
        weight_pct: 25,
        is_final_assessment: false
      },
      {
        assessment_name: "G2",
        assessment_type: "quiz",
        assessment_order: 2,
        due_day: 56,
        week_of_class: 8,
        weight_pct: 35,
        is_final_assessment: false
      },
      {
        assessment_name: "G3",
        assessment_type: "exam",
        assessment_order: 3,
        due_day: 98,
        week_of_class: 14,
        weight_pct: 40,
        is_final_assessment: true
      }
    ]
  );
  const weightedAverage =
    result.output.assessment_result.reduce((sum, row, index) => {
      return sum + row.score_normalized * result.output.assessment[index].weight_pct;
    }, 0) /
    result.output.assessment.reduce((sum, row) => sum + row.weight_pct, 0);
  assert.equal(weightedAverage, 42.75);
  assert.equal(result.output.enrollment[0].final_outcome, "Pass");
});

test("generic OULAD import preserves scores already expressed on 0..100", () => {
  const columns = ["score"];
  const result = transformRawRowsToCanonical({
    mappingConfig: confirmedMapping("OULAD", columns),
    profilingResult: profiling(columns),
    rawRows: [{
      id_student: "123",
      code_module: "AAA",
      code_presentation: "2014J",
      score: "73"
    }],
    batchId: "test_oulad"
  });

  const [assessmentResult] = result.output.assessment_result;
  assert.equal(assessmentResult.score_raw, 73);
  assert.equal(assessmentResult.score_normalized, 73);
  assert.equal(assessmentResult.pass_flag, true);
});

test("UCI final outcome uses the source G3 pass threshold of 10/20", () => {
  const columns = ["G1", "G2", "G3"];
  const result = transformRawRowsToCanonical({
    mappingConfig: confirmedMapping("UCI", columns),
    profilingResult: profiling(columns),
    rawRows: [{ G1: "12", G2: "11", G3: "8" }],
    batchId: "test_uci_outcome"
  });

  assert.equal(result.output.assessment_result[2].score_normalized, 40);
  assert.equal(result.output.enrollment[0].final_outcome, "Fail");
});
