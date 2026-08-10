import test from "node:test";
import assert from "node:assert/strict";

import { computeStudentFeatures } from "../src/services/compositeFeatures.service.js";

test("UCI disadvantage score uses failures, parental education, internet, and paid classes", () => {
  const [student] = computeStudentFeatures(
    [{
      student_id: "UCI_STUDENT_1",
      source_dataset: "UCI",
      mother_education_level: 1,
      father_education_level: 1,
      internet_access_flag: false,
      has_paid_class: false,
    }],
    [{
      student_id: "UCI_STUDENT_1",
      previous_attempt_count: 2,
    }]
  );

  assert.equal(student.disadvantage_score, 0.7);
  assert.equal(student.imd_score_numeric, null);
});

test("OULAD disadvantage score continues to use IMD, disability, and education", () => {
  const [student] = computeStudentFeatures([{
    student_id: "OULAD_STUDENT_1",
    source_dataset: "OULAD",
    socioeconomic_band: "20-30%",
    disability_flag: true,
    highest_education: "No Formal quals",
  }]);

  assert.equal(student.disadvantage_score, 0.875);
  assert.equal(student.imd_score_numeric, 25);
  assert.equal(student.support_score, null);
});
