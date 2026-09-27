# Paper-facing aggregate results

## Scope

These results evaluate the research prototype on the UCI Portuguese Student
Performance dataset and OULAD. All values are aggregates from frozen evaluation
runs. The raw logs, record-level model outputs, prompts, and student-level data
are not part of the public release.

## Mapping accuracy

Mapping was evaluated at the file-qualified raw-field level against manually
prepared ground truth. Mapper confidence was not treated as an accuracy metric.

| Dataset | Total fields | Mappable | Exact | Near-correct | Wrong | Correctly excluded | Exact accuracy | Usable rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| UCI Portuguese | 33 | 31 | 31 | 0 | 0 | 2 | 100.0% | 100.0% |
| OULAD | 43 | 43 | 28 | 11 | 4 | 0 | 65.1% | 90.7% |
| Combined | 76 | 74 | 59 | 11 | 4 | 2 | 79.7% | 94.6% |

Near-correct mappings were operationally recoverable but still required user
review or rule correction. This result supports assisted mapping, not fully
automatic schema alignment.

Across the 74 mappable fields, the exact proportion was 59/74, or 79.7%
(Wilson 95% CI [69.2%, 87.3%]). Counting the 11 near-correct suggestions gives
70/74, or 94.6% exact-or-near-correct coverage (Wilson 95% CI [86.9%, 97.9%]).
Near-correct suggestions still required user confirmation or correction. The
machine-readable interval estimates are provided in
[`mapping_interval_estimates.csv`](mapping_interval_estimates.csv).

## Task availability

The same fixed registry of 52 analytical tasks was evaluated for both datasets.

| Dataset | Executable | Partial | Insufficient data | Executable coverage |
| --- | ---: | ---: | ---: | ---: |
| UCI Portuguese | 24 | 6 | 22 | 46.15% |
| OULAD | 44 | 8 | 0 | 84.62% |

The difference reflects dataset-specific populated capabilities. It should not
be interpreted as a difference in the number of declared tasks.

Executable coverage is calculated directly from the frozen 52-task catalogue:
24/52 = 46.15% for UCI Portuguese and 44/52 = 84.62% for OULAD.

## AI explanation quality

The official evaluation compared the historical first-20-row condition with
task-aware evidence summarization. Only availability-gated task pairs were
scored.

| Dataset | Pairs | First-20 mean (SD) | Task-aware mean (SD) | Paired delta, 95% BCa CI | Wilcoxon W | p-value | Rank-biserial r |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| UCI Portuguese | 24 | 6.78 (2.16) | 8.84 (1.01) | 2.06 [1.37, 3.03] | 0 | 1.91e-6 | 1.00 |
| OULAD | 44 | 6.96 (1.07) | 8.51 (0.72) | 1.54 [1.27, 1.92] | 0 | 4.55e-13 | 1.00 |

The official scoring set contains 48 UCI records and 88 OULAD records, with two
modes per pair. All non-tied comparisons favored the task-aware mode within the
tested protocol. Task-aware outputs still contained major errors, with 8 such
records for UCI and 3 for OULAD. The result therefore supports measured
improvement, not guaranteed explanation correctness.

The paired analysis used two-sided 95% BCa bootstrap intervals from 100,000
resamples (seed 20260919). Exact two-sided Wilcoxon signed-rank tests omitted
zero differences from the ranks, and matched-pairs rank-biserial correlation
quantified effect size. The 20 UCI wins with four ties and 42 OULAD wins with
two ties are retained as descriptive results.

### Dimension-level results

Holm adjustment was applied within each dataset across the seven rubric
dimensions. The final score is a weighted composite and was not included as an
eighth dimension in the correction family.

| Dataset | Dimension | First-20 mean (SD) | Task-aware mean (SD) | Delta, 95% BCa CI | Holm-adjusted p | Rank-biserial r |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| UCI Portuguese | Faithfulness | 6.33 (2.60) | 8.88 (1.30) | 2.54 [1.71, 3.58] | 2.67e-5 | 1.00 |
| UCI Portuguese | Numerical correctness | 8.13 (2.11) | 9.79 (0.51) | 1.67 [0.96, 2.71] | 9.77e-4 | 1.00 |
| UCI Portuguese | Completeness | 6.29 (2.51) | 8.21 (2.19) | 1.92 [1.21, 3.04] | 1.53e-4 | 1.00 |
| UCI Portuguese | Task relevance | 7.42 (1.93) | 9.04 (1.23) | 1.63 [1.04, 2.42] | 2.44e-4 | 1.00 |
| UCI Portuguese | Actionability | 6.13 (2.11) | 7.79 (1.61) | 1.67 [1.08, 2.67] | 9.16e-5 | 1.00 |
| UCI Portuguese | Clarity | 8.33 (0.64) | 8.83 (0.48) | 0.50 [0.21, 0.79] | 0.00964 | 0.75 |
| UCI Portuguese | Safety/fairness | 7.08 (1.69) | 8.17 (1.13) | 1.08 [0.67, 1.54] | 7.32e-4 | 1.00 |
| OULAD | Faithfulness | 7.23 (1.12) | 8.84 (0.48) | 1.61 [1.36, 2.00] | 7.96e-13 | 1.00 |
| OULAD | Numerical correctness | 7.50 (1.02) | 8.91 (0.29) | 1.41 [1.18, 1.82] | 1.14e-12 | 1.00 |
| OULAD | Completeness | 6.48 (1.05) | 8.80 (0.70) | 2.32 [2.05, 2.66] | 1.14e-12 | 1.00 |
| OULAD | Task relevance | 7.43 (1.07) | 8.86 (0.46) | 1.43 [1.18, 1.86] | 1.14e-12 | 1.00 |
| OULAD | Actionability | 6.68 (0.67) | 7.93 (0.25) | 1.25 [1.07, 1.50] | 1.14e-12 | 1.00 |
| OULAD | Clarity | 7.86 (0.41) | 7.95 (0.30) | 0.09 [0.00, 0.25] | 0.3125 | 0.67 |
| OULAD | Safety/fairness | 6.84 (0.37) | 7.98 (0.15) | 1.14 [1.05, 1.27] | 7.96e-13 | 1.00 |

All seven UCI differences remained significant after Holm adjustment. Six of
seven OULAD differences remained significant; clarity did not. High task-aware
scores, particularly 9.79 for UCI numerical correctness, indicate ceiling
compression and reduced discrimination among strong outputs. Full-precision
aggregate values are available in
[`ai_explanation_inferential_statistics.csv`](ai_explanation_inferential_statistics.csv).

## System performance

Measurements were collected on Windows 10 using an Intel Core i5-1135G7,
approximately 8 GB RAM, Node.js 22.14.0, local PostgreSQL, and sequential
requests. Backend scenarios used five warm-up requests and 30 measured requests
per scenario.

| Scenario | Dataset | Runs | Average (ms) | P95 (ms) | Maximum (ms) | Error rate |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Task availability | UCI | 30 | 841.282 | 1,249.040 | 1,275.836 | 0% |
| Task availability | OULAD | 30 | 28,790.822 | 31,048.256 | 91,670.026 | 0% |
| Simple analytics A-B02 | UCI | 30 | 16.761 | 26.149 | 37.832 | 0% |
| Simple analytics A-B02 | OULAD | 30 | 66.890 | 102.880 | 115.171 | 0% |
| Trend analytics S-T01 | UCI | 30 | 59.235 | 71.140 | 548.506 | 0% |
| Trend analytics S-T01 | OULAD | 30 | 107.205 | 138.737 | 139.987 | 0% |

AI explanation generation included an external model call. Ten measured runs
per dataset averaged 8,283.000 ms for UCI and 9,584.017 ms for OULAD, with no
measured errors. The estimated combined cost of the 20 calls was USD 0.011238.

The UCI API import benchmark averaged 2,408.664 ms across 10 runs. A single full
OULAD load processed 10,655,280 raw clickstream rows in 1,028,042.561 ms,
approximately 17.13 minutes. The OULAD result is a single-run observation and
must not be interpreted as a stable population estimate.

## Limitations

- Evaluation used two dataset configurations and a fixed 52-task registry.
- Explanation scores depend on the frozen judge model, prompt, weights, and
  severity-cap protocol.
- No large-scale learner, instructor, or administrator user study was conducted.
- Performance was measured on one development computer with sequential
  requests. It does not establish concurrent or production-scale capacity.
- CPU and RAM measurements, retained internally, represent whole-system usage
  and are not process-isolated measurements.
- Dataset redistribution and raw evaluation evidence are intentionally excluded.

The machine-readable values corresponding to these tables are available in the
CSV files in this directory.
