# Public reproduction package

This directory contains the minimum public-safe artifacts needed to recompute
the paper-facing aggregate results.

```text
inputs/       Frozen sanitized evaluation records
scripts/      Aggregation and fresh-run utilities
generated/    Local outputs, ignored by Git
paper_snapshot.json
```

The input records intentionally exclude raw datasets, student-level data,
prompts, model responses, judge rationales, and private logs. See the root
`REPRODUCIBILITY.md` for the complete workflow and limitations.
