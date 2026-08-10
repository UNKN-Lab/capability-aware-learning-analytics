import { reseedSampleDatasets } from "../src/services/sampleSeeder.service.js";

function formatCounts(counts = {}) {
  return `student=${counts.student || 0}, course=${counts.course || 0}, class=${counts.class || 0}, enrollment=${counts.enrollment || 0}, assessment=${counts.assessment || 0}, assessment_result=${counts.assessment_result || 0}, event=${counts.event || 0}, engagement=${counts.engagement || 0}`;
}

function printPreview(preview) {
  console.log("=== Sample Reseed Preview (dry-run) ===");
  console.log(`timestamp: ${preview.timestamp}`);
  console.log(`batches to clear: ${preview.batchesToClear.join(", ")}`);
  console.log("");

  console.log("active dataset impact:");
  console.log(`- current: ${preview.activeImpact.current || "none"}`);
  console.log(`- kind: ${preview.activeImpact.kind}`);
  console.log(`- post-apply plan: ${preview.activeImpact.postApplyPlan}`);
  console.log("");

  for (const batch of preview.batches) {
    console.log(`batch: ${batch.batchId}`);
    const missing = (batch.missingFiles || []).join(", ");
    console.log(`- files missing: ${missing || "none"}`);
    console.log("- csv files:");
    for (const file of batch.fileChecks || []) {
      const rawCount = batch.rawRowCounts?.[file.fileName];
      const rawCountText = typeof rawCount === "number" ? rawCount : "n/a";
      console.log(`  - ${file.fileName}: ${file.exists ? "found" : "missing"}, raw_rows=${rawCountText}`);
    }
    console.log(`- canonical counts: ${formatCounts(batch.canonicalCounts)}`);
    console.log(`- canonical row_count: ${batch.canonicalRowCount || 0}`);
    console.log(`- warnings: ${(batch.warnings || []).length}`);
    for (const warning of batch.warnings || []) {
      console.log(`  * ${warning}`);
    }
    console.log(`- errors: ${(batch.validationErrors || []).length}`);
    for (const err of batch.validationErrors || []) {
      console.log(`  * ${err}`);
    }
    const seedState = preview.shouldSeedMatrix.find((item) => item.batchId === batch.batchId);
    console.log(`- would seed on apply: ${seedState?.wouldSeed ? "yes" : "no"}`);
    console.log("");
  }

  if (preview.validationFailed) {
    console.log("preview result: VALIDATION FAILED (apply should not run)");
  } else {
    console.log("preview result: OK");
  }
}

function printApplyResult(result) {
  console.log("=== Sample Reseed Apply Result ===");
  console.log(`timestamp: ${result.timestamp}`);
  for (const item of result.perBatchResults || []) {
    if (item.skipped) {
      console.log(`- ${item.batchId}: skipped (${item.reason})`);
    } else {
      console.log(`- ${item.batchId}: inserted ${item.canonicalRowCount} canonical rows`);
    }
  }
  console.log(`active sync: ${result.activeSync?.strategy || "n/a"} -> ${result.activeSync?.activated || "n/a"}`);
  console.log(`active after: ${result.activeStateAfter?.active_dataset_id || "none"}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");

  const result = await reseedSampleDatasets({
    apply,
    forceReseed: true,
  });

  if (!apply) {
    printPreview(result);
    if (result.validationFailed) {
      process.exitCode = 1;
    }
    return;
  }

  printApplyResult(result);
}

main().catch((error) => {
  console.error("Sample reseed script failed.");
  console.error(error?.message || error);
  if (error?.preview) {
    printPreview(error.preview);
  }
  process.exitCode = 1;
});
