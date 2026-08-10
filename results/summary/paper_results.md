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
| UCI Portuguese | 33 | 31 | 31 | 0 | 0 | 2 | 100.00% | 100.00% |
| OULAD | 43 | 43 | 28 | 11 | 4 | 0 | 65.12% | 90.70% |
| Combined | 76 | 74 | 59 | 11 | 4 | 2 | 79.73% | 94.59% |

Near-correct mappings were operationally recoverable but still required user
review or rule correction. This result supports assisted mapping, not fully
automatic schema alignment.

## Task availability

The same fixed registry of 52 analytical tasks was evaluated for both datasets.

| Dataset | Executable | Partial | Insufficient data | Executable coverage |
| --- | ---: | ---: | ---: | ---: |
| UCI Portuguese | 25 | 5 | 22 | 48.08% |
| OULAD | 44 | 8 | 0 | 84.62% |

The difference reflects dataset-specific populated capabilities. It should not
be interpreted as a difference in the number of declared tasks.

## AI explanation quality

The official evaluation compared a first-20-rows baseline with task-aware
evidence summarization. Only availability-gated task pairs were scored.

| Dataset | Comparable pairs | Baseline mean | Task-aware mean | Task-aware wins | Baseline wins | Ties | Mean paired delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| UCI Portuguese | 24 | 6.78 | 8.84 | 20 | 0 | 4 | +2.06 |
| OULAD | 44 | 6.96 | 8.51 | 42 | 0 | 2 | +1.54 |

The official scoring set contains 48 UCI records and 88 OULAD records, with two
modes per pair. All non-tied comparisons favored the task-aware mode within the
tested protocol. Task-aware outputs still contained major errors, with 8 such
records for UCI and 3 for OULAD. The result therefore supports measured
improvement, not guaranteed explanation correctness.

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
