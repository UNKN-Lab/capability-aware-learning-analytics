"""Recompute the public paper tables from sanitized frozen records."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable


SCRIPT_PATH = Path(__file__).resolve()
REPRO_DIR = SCRIPT_PATH.parent.parent
REPO_ROOT = REPRO_DIR.parent
INPUT_DIR = REPRO_DIR / "inputs"
PUBLISHED_DIR = REPO_ROOT / "results" / "summary"
DEFAULT_OUTPUT_DIR = REPRO_DIR / "generated" / "paper_tables"

DATASET_ORDER = ["UCI Portuguese", "OULAD"]
TWO_PLACES = Decimal("0.01")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recompute and verify paper-facing aggregate CSV tables."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for regenerated CSV files and the verification report.",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Generate tables without comparing them with results/summary.",
    )
    return parser.parse_args()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_inputs(manifest: dict) -> list[dict]:
    checks = []
    for artifact in manifest["sanitized_artifacts"]:
        path = REPRO_DIR / artifact["path"]
        if not path.is_file():
            raise FileNotFoundError(f"Missing sanitized input: {path}")

        _, rows = read_csv(path)
        actual_hash = sha256_file(path)
        passed = actual_hash == artifact["sha256"] and len(rows) == artifact["rows"]
        checks.append(
            {
                "path": artifact["path"],
                "expected_rows": artifact["rows"],
                "actual_rows": len(rows),
                "expected_sha256": artifact["sha256"],
                "actual_sha256": actual_hash,
                "passed": passed,
            }
        )
        if not passed:
            raise ValueError(
                f"Sanitized input verification failed for {artifact['path']}"
            )
    return checks


def percent(numerator: int, denominator: int) -> str:
    if denominator == 0:
        raise ValueError("Percentage denominator cannot be zero.")
    value = Decimal(numerator) * Decimal(100) / Decimal(denominator)
    return format(value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP), ".2f")


def decimal_mean(values: list[Decimal]) -> str:
    if not values:
        raise ValueError("Cannot compute the mean of an empty list.")
    value = sum(values, Decimal(0)) / Decimal(len(values))
    return format(value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP), ".2f")


def build_mapping_table() -> list[dict[str, str]]:
    _, rows = read_csv(INPUT_DIR / "mapping_snapshot.csv")
    output = []
    scopes = DATASET_ORDER + ["Combined"]

    for dataset in scopes:
        selected = rows if dataset == "Combined" else [r for r in rows if r["dataset"] == dataset]
        counts = Counter(row["category"] for row in selected)
        mappable = sum(1 for row in selected if row["expected_target"].strip())
        exact = counts["exact"]
        near = counts["near_correct"]
        output.append(
            {
                "dataset": dataset,
                "total_fields": str(len(selected)),
                "mappable_fields": str(mappable),
                "exact": str(exact),
                "near_correct": str(near),
                "wrong": str(counts["wrong"]),
                "unknown": str(counts["unknown"]),
                "correctly_excluded": str(counts["correctly_excluded"]),
                "exact_accuracy_percent": percent(exact, mappable),
                "usable_rate_percent": percent(exact + near, mappable),
            }
        )
    return output


def build_task_availability_table(manifest: dict) -> list[dict[str, str]]:
    _, rows = read_csv(INPUT_DIR / "task_availability_snapshot.csv")
    config = manifest["task_availability"]
    output = []

    for dataset in DATASET_ORDER:
        selected = [row for row in rows if row["dataset"] == dataset]
        statuses = Counter(row["status"] for row in selected)
        confidence = Counter(row["confidence"] for row in selected)
        total = len(selected)
        executable = statuses["executable"]
        output.append(
            {
                "dataset": dataset,
                "source_snapshot": config["source_snapshot"],
                "total_tasks": str(total),
                "executable": str(executable),
                "partial": str(statuses["partial"]),
                "insufficient_data": str(statuses["insufficient_data"]),
                "unsupported": str(statuses["unsupported"]),
                "structural_fail": str(sum(row["structural"] == "fail" for row in selected)),
                "semantic_fail": str(sum(row["semantic"] == "fail" for row in selected)),
                "analytical_warn": str(sum(row["analytical"] == "warn" for row in selected)),
                "data_sufficiency_fail": str(
                    sum(row["data_sufficiency"] == "fail" for row in selected)
                ),
                "high_confidence": str(confidence["HIGH"]),
                "low_confidence": str(confidence["LOW"]),
                "reported_executable_coverage_percent": config["datasets"][dataset][
                    "reported_executable_coverage_percent"
                ],
                "recomputed_executable_coverage_percent": percent(executable, total),
            }
        )
    return output


def build_ai_explanation_table(manifest: dict) -> list[dict[str, str]]:
    _, rows = read_csv(INPUT_DIR / "ai_explanation_pair_scores.csv")
    config = manifest["ai_explanation_quality"]["datasets"]
    output = []

    for dataset in DATASET_ORDER:
        selected = [row for row in rows if row["dataset"] == dataset]
        baseline = [Decimal(row["baseline_final_score"]) for row in selected]
        task_aware = [Decimal(row["task_aware_final_score"]) for row in selected]
        deltas = [task - base for task, base in zip(task_aware, baseline)]
        winners = Counter(row["winner"] for row in selected)
        output.append(
            {
                "dataset": dataset,
                "run_utc": config[dataset]["run_utc"],
                "official_scoring_records": str(len(selected) * 2),
                "comparable_pairs": str(len(selected)),
                "baseline_mean_final_score": decimal_mean(baseline),
                "task_aware_mean_final_score": decimal_mean(task_aware),
                "task_aware_wins": str(winners["task_aware_data_summarization"]),
                "baseline_wins": str(winners["baseline_first_20_rows"]),
                "ties": str(winners["tie"]),
                "mean_paired_delta": decimal_mean(deltas),
                "baseline_major_records": str(
                    sum(row["baseline_highest_error_severity"] == "major" for row in selected)
                ),
                "baseline_critical_records": str(
                    sum(row["baseline_highest_error_severity"] == "critical" for row in selected)
                ),
                "task_aware_major_records": str(
                    sum(row["task_aware_highest_error_severity"] == "major" for row in selected)
                ),
                "task_aware_critical_records": str(
                    sum(row["task_aware_highest_error_severity"] == "critical" for row in selected)
                ),
            }
        )
    return output


TABLES = {
    "mapping_accuracy.csv": (
        [
            "dataset",
            "total_fields",
            "mappable_fields",
            "exact",
            "near_correct",
            "wrong",
            "unknown",
            "correctly_excluded",
            "exact_accuracy_percent",
            "usable_rate_percent",
        ],
        build_mapping_table,
    ),
    "task_availability.csv": (
        [
            "dataset",
            "source_snapshot",
            "total_tasks",
            "executable",
            "partial",
            "insufficient_data",
            "unsupported",
            "structural_fail",
            "semantic_fail",
            "analytical_warn",
            "data_sufficiency_fail",
            "high_confidence",
            "low_confidence",
            "reported_executable_coverage_percent",
            "recomputed_executable_coverage_percent",
        ],
        build_task_availability_table,
    ),
    "ai_explanation_quality.csv": (
        [
            "dataset",
            "run_utc",
            "official_scoring_records",
            "comparable_pairs",
            "baseline_mean_final_score",
            "task_aware_mean_final_score",
            "task_aware_wins",
            "baseline_wins",
            "ties",
            "mean_paired_delta",
            "baseline_major_records",
            "baseline_critical_records",
            "task_aware_major_records",
            "task_aware_critical_records",
        ],
        build_ai_explanation_table,
    ),
}


def compare_csv(generated: Path, published: Path) -> None:
    generated_headers, generated_rows = read_csv(generated)
    published_headers, published_rows = read_csv(published)
    if generated_headers != published_headers:
        raise ValueError(
            f"Header mismatch for {generated.name}: "
            f"generated={generated_headers}, published={published_headers}"
        )
    if generated_rows != published_rows:
        for index, (actual, expected) in enumerate(
            zip(generated_rows, published_rows, strict=False), start=1
        ):
            if actual != expected:
                raise ValueError(
                    f"Row {index} mismatch for {generated.name}: "
                    f"generated={actual}, published={expected}"
                )
        raise ValueError(
            f"Row-count mismatch for {generated.name}: "
            f"generated={len(generated_rows)}, published={len(published_rows)}"
        )


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = read_json(REPRO_DIR / "paper_snapshot.json")
    input_checks = verify_inputs(manifest)
    table_checks = []

    for filename, (headers, builder) in TABLES.items():
        rows = builder(manifest) if filename != "mapping_accuracy.csv" else builder()
        output_path = output_dir / filename
        write_csv(output_path, headers, rows)

        if not args.no_verify:
            compare_csv(output_path, PUBLISHED_DIR / filename)
            print(f"PASS {filename}")
        else:
            print(f"WROTE {filename}")
        table_checks.append({"table": filename, "rows": len(rows), "passed": True})

    report = {
        "schema_version": "1.0.0",
        "snapshot_id": manifest["snapshot_id"],
        "input_checks": input_checks,
        "table_checks": table_checks,
        "published_tables_verified": not args.no_verify,
    }
    (output_dir / "verification_report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print("Reproduction completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
