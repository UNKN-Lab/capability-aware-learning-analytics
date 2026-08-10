# Public evaluation results

This directory contains reviewed aggregate results used to support the paper and
thesis claims for the Smart Learning Analytics Dashboard. It intentionally does
not contain record-level judge outputs, prompts, model responses, student-level
data, private evaluation logs, or internal workbooks.

## Result scope

The published summaries cover four evaluation groups:

1. automatic mapping accuracy against manually prepared field-level ground
   truth;
2. task availability for the fixed registry of 52 analytical tasks;
3. availability-gated comparison of baseline and task-aware AI explanations;
4. sequential local-system performance measurements.

The paper-facing interpretation is available in
[`summary/paper_results.md`](summary/paper_results.md). Machine-readable values
are provided as CSV files in the same directory.

## Datasets

- **UCI Portuguese Student Performance** refers to the Portuguese-language
  course subset of the UCI Student Performance dataset:
  <https://archive.ics.uci.edu/dataset/320/student+performance>.
- **OULAD** refers to the anonymized Open University Learning Analytics Dataset:
  <https://research.stem.open.ac.uk/ouanalyse/dataset/>.

No source dataset is redistributed in this repository. Users must obtain the
datasets from their official providers and comply with the applicable dataset
terms and citation requirements.

## Evaluation boundary

The task registry contains 52 tasks and was applied to both datasets. The
official explanation-quality comparison was gated by task availability. It
therefore contains 24 comparable task pairs for UCI and 44 for OULAD, rather
than 52 pairs for each dataset.

The internal evidence-preparation pipeline produced 208 mode-level evidence
records before availability gating. This number must not be interpreted as 208
officially scored records. Official scoring contains 48 UCI records and 88
OULAD records, corresponding to 68 baseline/task-aware pairs.

## Reproducibility

The backend performance runner is distributed at
`Backend/scripts/systemPerformanceBenchmark.mjs`. Its results depend on the
database state, hardware, operating system, external model, and service
configuration. The published performance measurements describe sequential
local execution and are not a production load test.

The explanation-quality results also depend on a frozen judge protocol and
model configuration. They support a comparison within the tested scope, not a
claim that every generated explanation is correct or that the measured effect
generalizes to all datasets, tasks, prompts, or models.

## Provenance and review

The CSV values were transcribed from the final aggregate reports retained in
the lab-internal repository. Raw evidence remains internal for audit and privacy
review. Before citing these files in a publication, verify that the repository
release tag and paper tables use identical values.
