import { once } from "node:events";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import pgCopyStreams from "pg-copy-streams";
import { pool } from "../lib/prisma.js";

const { from: copyFrom } = pgCopyStreams;
const COPY_PAYLOAD_FLUSH_BYTES = 1024 * 1024;

function csvString(value) {
  if (value === null || value === undefined) return "\\N";
  return String(value)
    .replaceAll("\t", " ")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

function csvNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "\\N";
  return String(value);
}

function engagementToCopyLine(row) {
  return [
    csvString(row.engagement_id),
    csvString(row.batch_id),
    csvString(row.event_id),
    csvString(row.student_id),
    csvString(row.enrollment_id),
    csvString(row.source_dataset),
    csvNumber(row.event_day),
    csvNumber(row.week_number),
    csvNumber(row.engagement_count),
    csvNumber(row.log_click_score),
  ].join("\t") + "\n";
}

async function writeWithBackpressure(stream, text) {
  if (!stream.write(text)) {
    await once(stream, "drain");
  }
}

export async function createEngagementCopySink() {
  const client = await pool.connect();
  let copyStream = null;
  let copyFinished = null;
  let released = false;
  let copiedRows = 0;

  async function release() {
    if (!released) {
      released = true;
      client.release();
    }
  }

  try {
    copyStream = client.query(copyFrom(`
      COPY engagement (
        engagement_id,
        batch_id,
        event_id,
        student_id,
        enrollment_id,
        source_dataset,
        event_day,
        week_number,
        engagement_count,
        log_click_score
      )
      FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')
    `));

    copyFinished = new Promise((resolve, reject) => {
      copyStream.on("close", resolve);
      copyStream.on("error", reject);
    });

    return {
      async writeRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return;

        const payloadParts = [];
        let payloadBytes = 0;
        for (const row of rows) {
          const line = engagementToCopyLine(row);
          payloadParts.push(line);
          payloadBytes += Buffer.byteLength(line);

          if (payloadBytes >= COPY_PAYLOAD_FLUSH_BYTES) {
            // eslint-disable-next-line no-await-in-loop
            await writeWithBackpressure(copyStream, payloadParts.join(""));
            payloadParts.length = 0;
            payloadBytes = 0;
          }
        }

        if (payloadParts.length > 0) {
          await writeWithBackpressure(copyStream, payloadParts.join(""));
        }

        copiedRows += rows.length;
      },

      async finish() {
        copyStream.end();
        await copyFinished;
        await release();
        return copiedRows;
      },

      async abort() {
        if (copyStream && !copyStream.destroyed) {
          copyStream.destroy();
        }
        await release();
      },
    };
  } catch (error) {
    if (copyStream && !copyStream.destroyed) {
      copyStream.destroy();
    }
    await release();
    throw error;
  }
}

const ENGAGEMENT_SECONDARY_INDEXES = [
  "engagement_batch_id_idx",
  "engagement_batch_id_student_id_event_id_event_day_key",
  "engagement_enrollment_id_idx",
  "engagement_event_id_idx",
  "engagement_student_id_idx",
  "engagement_week_number_idx",
];

const ENGAGEMENT_FOREIGN_KEYS = [
  "engagement_batch_id_fkey",
  "engagement_enrollment_id_fkey",
  "engagement_event_id_fkey",
  "engagement_student_id_fkey",
];

export async function clearEngagementForBatch(
  batchId = "SAMPLE_OULAD",
) {
  const client = await pool.connect();
  try {
    const otherBatchResult = await client.query(
      "SELECT COUNT(*)::bigint AS count FROM engagement WHERE batch_id <> $1",
      [batchId],
    );
    const otherBatchRows = Number(otherBatchResult.rows[0]?.count || 0);

    if (otherBatchRows === 0) {
      await client.query("TRUNCATE TABLE engagement");
      return { strategy: "truncate", deleted_rows: null };
    }

    const deleted = await client.query(
      "DELETE FROM engagement WHERE batch_id = $1",
      [batchId],
    );
    return {
      strategy: "delete_batch_rows",
      deleted_rows: Number(deleted.rowCount || 0),
    };
  } finally {
    client.release();
  }
}

async function dropEngagementIndexesAndConstraints(client) {
  for (const constraint of [...ENGAGEMENT_FOREIGN_KEYS, "engagement_pkey"]) {
    // Names are static constants owned by the Prisma schema.
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `ALTER TABLE engagement DROP CONSTRAINT IF EXISTS "${constraint}"`,
    );
  }

  for (const index of ENGAGEMENT_SECONDARY_INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(`DROP INDEX IF EXISTS "${index}"`);
  }
}

async function recreateEngagementIndexesAndConstraints(client, options = {}) {
  const { validateForeignKeys = true } = options;
  await client.query(`
    ALTER TABLE engagement
    ADD CONSTRAINT engagement_pkey PRIMARY KEY (engagement_id)
  `);
  await client.query(`
    CREATE UNIQUE INDEX engagement_batch_id_student_id_event_id_event_day_key
    ON engagement (batch_id, student_id, event_id, event_day)
  `);
  await client.query(
    "CREATE INDEX engagement_batch_id_idx ON engagement (batch_id)",
  );
  await client.query(
    "CREATE INDEX engagement_enrollment_id_idx ON engagement (enrollment_id)",
  );
  await client.query(
    "CREATE INDEX engagement_event_id_idx ON engagement (event_id)",
  );
  await client.query(
    "CREATE INDEX engagement_student_id_idx ON engagement (student_id)",
  );
  await client.query(
    "CREATE INDEX engagement_week_number_idx ON engagement (week_number)",
  );

  await client.query(`
    ALTER TABLE engagement
    ADD CONSTRAINT engagement_batch_id_fkey
    FOREIGN KEY (batch_id) REFERENCES import_batch(batch_id)
    ON UPDATE CASCADE ON DELETE CASCADE NOT VALID
  `);
  await client.query(`
    ALTER TABLE engagement
    ADD CONSTRAINT engagement_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES enrollment(enrollment_id)
    ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID
  `);
  await client.query(`
    ALTER TABLE engagement
    ADD CONSTRAINT engagement_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES event(event_id)
    ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID
  `);
  await client.query(`
    ALTER TABLE engagement
    ADD CONSTRAINT engagement_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES student(student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID
  `);

  if (validateForeignKeys) {
    for (const constraint of ENGAGEMENT_FOREIGN_KEYS) {
      // Validation scans once per relationship after the bulk load.
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `ALTER TABLE engagement VALIDATE CONSTRAINT "${constraint}"`,
      );
    }
  }
}

export async function rebuildOuladEngagementFromCsv({
  sourceFile,
  batchId = "SAMPLE_OULAD",
}) {
  const client = await pool.connect();
  const timings = {};
  const startedAt = Date.now();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL synchronous_commit = off");
    await client.query("SET LOCAL maintenance_work_mem = '1GB'");
    await client.query("SET LOCAL work_mem = '256MB'");

    const otherBatchResult = await client.query(
      "SELECT COUNT(*)::bigint AS count FROM engagement WHERE batch_id <> $1",
      [batchId],
    );
    const otherBatchRows = Number(otherBatchResult.rows[0]?.count || 0);

    const clearStartedAt = Date.now();
    if (otherBatchRows === 0) {
      await client.query("TRUNCATE TABLE engagement");
    } else {
      await client.query("DELETE FROM engagement WHERE batch_id = $1", [
        batchId,
      ]);
    }
    timings.clear_existing_ms = Date.now() - clearStartedAt;

    const schemaDropStartedAt = Date.now();
    await dropEngagementIndexesAndConstraints(client);
    timings.drop_indexes_constraints_ms = Date.now() - schemaDropStartedAt;

    await client.query(`
      CREATE TEMP TABLE oulad_student_vle_stage (
        code_module text,
        code_presentation text,
        id_student text,
        id_site text,
        event_day integer,
        sum_click integer
      ) ON COMMIT DROP
    `);

    const copyStartedAt = Date.now();
    const copyStream = client.query(
      copyFrom(`
        COPY oulad_student_vle_stage (
          code_module,
          code_presentation,
          id_student,
          id_site,
          event_day,
          sum_click
        )
        FROM STDIN
        WITH (FORMAT csv, HEADER true)
      `),
    );
    await pipeline(fs.createReadStream(sourceFile), copyStream);
    timings.copy_raw_csv_ms = Date.now() - copyStartedAt;

    const rawCountResult = await client.query(
      "SELECT COUNT(*)::bigint AS count FROM oulad_student_vle_stage",
    );
    const rawRowCount = Number(rawCountResult.rows[0]?.count || 0);

    const insertStartedAt = Date.now();
    const insertResult = await client.query(
      `
        WITH deduplicated AS MATERIALIZED (
          SELECT
            code_module,
            code_presentation,
            id_student,
            id_site,
            event_day,
            SUM(COALESCE(sum_click, 0))::integer AS sum_click
          FROM oulad_student_vle_stage
          GROUP BY
            code_module,
            code_presentation,
            id_student,
            id_site,
            event_day
        )
        INSERT INTO engagement (
          engagement_id,
          batch_id,
          event_id,
          student_id,
          enrollment_id,
          source_dataset,
          event_day,
          week_number,
          engagement_count,
          log_click_score
        )
        SELECT
          $1 || '_ENG_' || st.student_id || '_' || ev.event_id || '_' || d.event_day,
          $1,
          ev.event_id,
          st.student_id,
          enr.enrollment_id,
          'OULAD',
          d.event_day,
          FLOOR(d.event_day / 7.0)::integer + 1,
          d.sum_click,
          LN(d.sum_click + 1)
        FROM deduplicated d
        JOIN student st
          ON st.student_id = $1 || '_STU_' || d.id_student
         AND st.batch_id = $1
        JOIN enrollment enr
          ON enr.student_id = st.student_id
         AND enr.class_id =
             $1 || '_CLASS_' || d.code_module || '_' || d.code_presentation
         AND enr.batch_id = $1
        JOIN event ev
          ON ev.event_id = $1 || '_EVT_' || d.id_site
         AND ev.class_id = enr.class_id
         AND ev.batch_id = $1
      `,
      [batchId],
    );
    timings.insert_deduplicated_ms = Date.now() - insertStartedAt;

    const schemaBuildStartedAt = Date.now();
    await recreateEngagementIndexesAndConstraints(client);
    timings.rebuild_indexes_constraints_ms =
      Date.now() - schemaBuildStartedAt;

    await client.query("COMMIT");

    return {
      raw_row_count: rawRowCount,
      inserted_row_count: Number(insertResult.rowCount || 0),
      other_batch_rows_preserved: otherBatchRows,
      timings_ms: timings,
      total_ms: Date.now() - startedAt,
      strategy:
        "copy_raw_stage_drop_indexes_insert_deduplicated_rebuild_indexes",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

