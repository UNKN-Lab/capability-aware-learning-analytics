import test from "node:test";
import assert from "node:assert/strict";

import taskRegistryService from "../src/services/taskRegistry.service.js";

test("S-T13 calculates relative absence index against the full class", () => {
  const sql = taskRegistryService.getTaskById("S-T13").sqlQuery;

  assert.match(sql, /absence_calc AS \([\s\S]*WHERE e\.class_id = :class_id\s*\)/);
  assert.doesNotMatch(
    sql,
    /absence_calc AS \([\s\S]*WHERE e\.student_id = :student_id\s+AND e\.class_id = :class_id\s*\)/
  );
});

test("S-T13 does not convert unavailable engagement into a low-engagement risk flag", () => {
  const sql = taskRegistryService.getTaskById("S-T13").sqlQuery;

  assert.match(sql, /es\.engagement_score AS engagement_score/);
  assert.match(
    sql,
    /COALESCE\(es\.has_engagement_data, false\) AND es\.engagement_score < 0\.15/
  );
});

test("S-B02 uses the same engagement availability rule as S-T13", () => {
  const sql = taskRegistryService.getTaskById("S-B02").sqlQuery;

  assert.match(sql, /es\.engagement_score AS engagement_score/);
  assert.match(
    sql,
    /COALESCE\(es\.has_engagement_data, false\) AND es\.engagement_score < 0\.15/
  );
  assert.doesNotMatch(sql, /COALESCE\(es\.engagement_score, 0\) < 0\.15/);
});

test("S-B02 and S-T13 preserve unavailable punctuality instead of defaulting to 100 percent", () => {
  for (const taskId of ["S-B02", "S-T13"]) {
    const sql = taskRegistryService.getTaskById(taskId).sqlQuery;
    assert.match(sql, /ELSE NULL\s+END AS punctuality_rate/);
    assert.match(sql, /p\.punctuality_rate IS NOT NULL AND p\.punctuality_rate < 0\.7/);
    assert.doesNotMatch(sql, /COALESCE\(p\.punctuality_rate, 1\)/);
  }

  const riskCardSql = taskRegistryService.getTaskById("S-B02").sqlQuery;
  assert.match(
    riskCardSql,
    /\(rf\.punctuality_rate IS NOT NULL\) AS punctuality_rate_available/
  );
});

test("A-G03 cohort queue uses the same metric availability rules as student risk cards", () => {
  const sql = taskRegistryService.getTaskById("A-G03").sqlQuery;

  assert.match(sql, /es\.engagement_score AS engagement_score/);
  assert.match(sql, /ELSE NULL\s+END AS punctuality_rate/);
  assert.match(sql, /\(rf\.punctuality_rate IS NOT NULL\) AS punctuality_rate_available/);
  assert.match(sql, /COALESCE\(es\.has_engagement_data, false\) AND es\.engagement_score < 0\.15/);
  assert.match(sql, /p\.punctuality_rate IS NOT NULL AND p\.punctuality_rate < 0\.7/);
});

test("all risk and intervention tasks avoid missing-as-zero/one fallbacks", () => {
  const taskIds = [
    "S-T04", "S-T12", "A-B04", "A-S01",
    "A-S08", "A-C03", "A-G15", "A-G16",
  ];

  for (const taskId of taskIds) {
    const task = taskRegistryService.getTaskById(taskId);
    const sql = [task.sqlQuery, ...(task.sqlQueries || [])].filter(Boolean).join("\n");
    assert.doesNotMatch(
      sql,
      /COUNT\(\*\) FILTER \(WHERE ar\.submission_day <= a\.due_day\) \* 1\.0\s*\/\s*NULLIF\(COUNT\(\*\), 0\)/,
      `${taskId} must count only observable due/submission pairs`
    );
    assert.doesNotMatch(
      sql,
      /COALESCE\(p\.punctuality_rate,\s*1(?:\.0)?\)/,
      `${taskId} must preserve unavailable punctuality`
    );
    assert.doesNotMatch(
      sql,
      /COALESCE\(es\.engagement_score,\s*0\)/,
      `${taskId} must preserve unavailable engagement`
    );
  }
});

test("all risk-score tasks use the canonical weighted-aware average and runtime pass threshold", () => {
  const taskIds = [
    "S-B02", "S-T04", "S-T13", "A-B04", "A-S01",
    "A-S08", "A-C03", "A-G03", "A-G15", "A-G16",
  ];

  for (const taskId of taskIds) {
    const task = taskRegistryService.getTaskById(taskId);
    const sql = [task.sqlQuery, ...(task.sqlQueries || [])].filter(Boolean).join("\n");
    assert.match(sql, /SUM\(ar\.score_normalized \* a\.weight_pct\)/, `${taskId} must use weighted-aware avg_score`);
    assert.match(sql, /sa\.avg_score < sa\.pass_threshold/, `${taskId} must use the runtime pass threshold`);
    assert.doesNotMatch(sql, /sa\.avg_score\s*<\s*40/, `${taskId} must not hardcode the low-score threshold`);
  }
});

test("A-S04 only calculates punctuality from observable due/submission pairs", () => {
  const sql = taskRegistryService.getTaskById("A-S04").sqlQuery;

  assert.match(sql, /COUNT\(\*\) FILTER \(WHERE a\.due_day IS NOT NULL\s+AND ar\.submission_day IS NOT NULL\)/);
  assert.match(sql, /\(flag_value IS NOT NULL\) AS evidence_available/);
  assert.match(sql, /ROUND\(sa\.avg_score::numeric, 2\)::float8 AS flag_value/);
  assert.doesNotMatch(sql, /COALESCE\(sa\.perf_trend, 0\) AS flag_value/);
});

test("A-S05 preserves G1/G2/G3 assessment names before generated type/order labels", () => {
  const sql = taskRegistryService.getTaskById("A-S05").sqlQuery;
  const sourceNamePosition = sql.indexOf("WHEN a.assessment_name IS NOT NULL");
  const generatedLabelPosition = sql.indexOf("WHEN a.assessment_order IS NOT NULL");

  assert.ok(sourceNamePosition >= 0);
  assert.ok(generatedLabelPosition >= 0);
  assert.ok(sourceNamePosition < generatedLabelPosition);
  const sourceNameFirstExpression = "WHEN a.assessment_name IS NOT NULL AND a.assessment_name !~ '^[0-9]+$' AND a.assessment_name <> a.assessment_type THEN a.assessment_name WHEN a.assessment_order IS NOT NULL";
  assert.equal(
    sql.split(sourceNameFirstExpression).length - 1,
    2,
    "SELECT and GROUP BY must use the same source-name-first expression"
  );
});
