# Reproducibility

This document describes how to reconstruct the paper-facing aggregate tables
and how to perform fresh runs of the deterministic application pipeline.

## Reproduction scope

The public package supports two complementary workflows:

1. **Exact table reconstruction** recomputes the mapping, task-availability,
   and AI-explanation tables from frozen, sanitized evaluation records.
2. **Fresh system reruns** execute the current mapping, task-availability, and
   performance code after the user obtains the source datasets.

The repository does not distribute source datasets, student-level records,
raw model prompts, model responses, judge rationales, private logs, or internal
workbooks. The sanitized records contain only the fields needed to recompute
the reported aggregate statistics.

## Requirements

- Python 3.10 or later for exact table reconstruction
- Node.js and npm for fresh application runs
- PostgreSQL for dataset import, task availability, and performance runs
- An OpenAI API key only for a new AI-generation run

No third-party Python package is required for exact table reconstruction.

## Exact reconstruction of the paper tables

From the repository root, run:

```powershell
python .\reproducibility\scripts\reproduce_paper_results.py
```

The script performs four checks:

1. verifies SHA-256 checksums for every sanitized input;
2. recomputes the aggregate mapping-accuracy table;
3. recomputes the task-availability and AI-explanation tables;
4. compares the regenerated tables with `results/summary/`.

Generated files are written to `reproducibility/generated/`, which is ignored
by Git. A successful run ends with:

```text
PASS mapping_accuracy.csv
PASS task_availability.csv
PASS ai_explanation_quality.csv
Reproduction completed successfully.
```

The expected headline values are:

| Result | UCI Portuguese | OULAD |
| --- | ---: | ---: |
| Exact mapping accuracy | 100.00% | 65.12% |
| Usable mapping rate | 100.00% | 90.70% |
| Executable tasks | 24/52 | 44/52 |
| Baseline explanation mean | 6.78 | 6.96 |
| Task-aware explanation mean | 8.84 | 8.51 |
| Mean paired improvement | +2.06 | +1.54 |

The submitted UCI task-availability snapshot reported 48.08% executable
coverage. The reproducibility script also exposes the arithmetically recomputed
value, 24/52 = 46.15%, so the discrepancy remains visible.

## Obtain the datasets for fresh runs

Download each dataset from its official provider and follow its terms:

- UCI Student Performance:
  <https://archive.ics.uci.edu/dataset/320/student+performance>
- Open University Learning Analytics Dataset:
  <https://research.stem.open.ac.uk/ouanalyse/dataset/>

Place the extracted files at these paths:

```text
Backend/uploads/UCI/student-por.csv
Backend/uploads/OULAD/assessments.csv
Backend/uploads/OULAD/courses.csv
Backend/uploads/OULAD/studentAssessment.csv
Backend/uploads/OULAD/studentInfo.csv
Backend/uploads/OULAD/studentRegistration.csv
Backend/uploads/OULAD/studentVle.csv
Backend/uploads/OULAD/vle.csv
```

The `uploads/` directory is ignored and must not be committed.

## Prepare a fresh local environment

Follow the configuration and dependency instructions in `README.md`. Apply the
database schema and load the official datasets into a fresh database:

```powershell
Set-Location Backend
npm.cmd ci
npm.cmd run generate
npm.cmd run migrate
npm.cmd run samples:reseed:apply
```

Use a fresh database or an empty `alias_memory` table for the cold-start mapping
evaluation. Learned aliases can change mapping suggestions and therefore do not
belong in the cold-start protocol.

## Fresh mapping-accuracy run

From the repository root:

```powershell
node .\reproducibility\scripts\evaluate_mapping_accuracy.mjs
```

The script profiles the official input files, invokes the public mapper,
compares its suggestions with `mapping_ground_truth.csv`, and writes fresh
field-level and aggregate outputs under `reproducibility/generated/mapping/`.

## Fresh task-availability run

Start the Backend after reseeding the datasets, then run from another terminal:

```powershell
node .\reproducibility\scripts\collect_task_availability.mjs
```

The collector calls the public task-availability endpoint with evidence-log
generation disabled. It writes only task ID, status, four-layer decisions, and
confidence to `reproducibility/generated/task_availability/`.

## Fresh performance run

With the Backend running and the sample datasets loaded:

```powershell
Set-Location Backend
npm.cmd run performance:benchmark
```

Use `-- --include-ai` only when the AI service and provider configuration are
available. Use `-- --include-import` only when a mutating import benchmark is
intended. Performance results depend on hardware, operating system, database
state, service configuration, and network conditions, so a fresh run is not
expected to match the paper snapshot bit for bit.

## AI-explanation boundary

`ai_explanation_pair_scores.csv` contains one sanitized row per evaluated task
pair. It is sufficient to reproduce the published means, winner counts, ties,
paired deltas, and error-severity counts. It contains no prompt, response,
student record, or judge rationale.

A fresh AI generation and judge run is a replication rather than an exact
reproduction. Provider-side model updates and service availability can change
the output even when the published configuration is reused.

## Interpreting a mismatch

First check the input checksums and repository revision. For fresh runs, also
record dataset versions, database state, runtime versions, model identifier,
and machine configuration. Do not overwrite the frozen files in
`results/summary/` with a fresh run unless a new, reviewed paper snapshot is
being released.
