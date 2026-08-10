import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DEFAULT_BATCH_ID = "SAMPLE_OULAD";

function parseArgs(argv) {
  const args = {
    batchId: DEFAULT_BATCH_ID,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--batch-id") {
      args.batchId = argv[i + 1] || args.batchId;
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

async function main() {
  const { batchId, dryRun } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    const before = await client.query(
      `
        SELECT
          COUNT(*)::int AS students,
          COUNT(socioeconomic_band)::int AS socioeconomic_band_non_null,
          COUNT(imd_score_numeric)::int AS imd_score_numeric_non_null,
          COUNT(disadvantage_score)::int AS disadvantage_score_non_null
        FROM student
        WHERE batch_id = $1
      `,
      [batchId]
    );

    const updated = await client.query(
      `
        WITH parsed AS (
          SELECT
            student_id,
            batch_id,
            CASE
              WHEN socioeconomic_band ~ '^[[:space:]]*[0-9]+(\\.[0-9]+)?[[:space:]]*-[[:space:]]*[0-9]+(\\.[0-9]+)?%?[[:space:]]*$'
                THEN (
                  (
                    substring(socioeconomic_band from '^[[:space:]]*([0-9]+(?:\\.[0-9]+)?)')::float8
                    +
                    substring(socioeconomic_band from '-[[:space:]]*([0-9]+(?:\\.[0-9]+)?)')::float8
                  ) / 2.0
                )
              WHEN replace(trim(socioeconomic_band), '%', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN replace(trim(socioeconomic_band), '%', '')::float8
              ELSE imd_score_numeric
            END AS parsed_imd_score,
            disability_flag,
            regexp_replace(lower(coalesce(highest_education, '')), '[^a-z0-9]+', '_', 'g') AS normalized_education
          FROM student
          WHERE batch_id = $1
            AND source_dataset = 'OULAD'
        ),
        computed AS (
          SELECT
            student_id,
            batch_id,
            parsed_imd_score,
            CASE
              WHEN parsed_imd_score IS NOT NULL
                   OR disability_flag IS TRUE
                   OR normalized_education IN ('no_formal', 'no_formal_quals', 'none', 'unknown')
              THEN
                COALESCE(GREATEST(0, LEAST(1, (100.0 - parsed_imd_score) / 100.0)) * 0.5, 0)
                + CASE WHEN disability_flag IS TRUE THEN 0.3 ELSE 0 END
                + CASE WHEN normalized_education IN ('no_formal', 'no_formal_quals', 'none', 'unknown') THEN 0.2 ELSE 0 END
              ELSE NULL
            END AS computed_disadvantage_score
          FROM parsed
        )
        UPDATE student s
        SET
          imd_score_numeric = c.parsed_imd_score,
          disadvantage_score = c.computed_disadvantage_score,
          updated_at = NOW()
        FROM computed c
        WHERE s.student_id = c.student_id
          AND s.batch_id = c.batch_id
          AND (
            s.imd_score_numeric IS DISTINCT FROM c.parsed_imd_score
            OR s.disadvantage_score IS DISTINCT FROM c.computed_disadvantage_score
          )
        RETURNING s.student_id
      `,
      [batchId]
    );

    const after = await client.query(
      `
        SELECT
          COUNT(*)::int AS students,
          COUNT(socioeconomic_band)::int AS socioeconomic_band_non_null,
          COUNT(imd_score_numeric)::int AS imd_score_numeric_non_null,
          COUNT(disadvantage_score)::int AS disadvantage_score_non_null,
          COUNT(*) FILTER (WHERE imd_score_numeric < 0 OR imd_score_numeric > 100)::int AS imd_score_out_of_range,
          COUNT(*) FILTER (WHERE disadvantage_score < 0 OR disadvantage_score > 1)::int AS disadvantage_score_out_of_range
        FROM student
        WHERE batch_id = $1
      `,
      [batchId]
    );

    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    console.log(JSON.stringify({
      batchId,
      dryRun,
      updatedRows: updated.rowCount,
      before: before.rows[0],
      after: after.rows[0],
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
