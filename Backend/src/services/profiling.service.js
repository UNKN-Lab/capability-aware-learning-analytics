import fs from "fs";
import csv from "csv-parser";

const SAMPLE_LIMIT = 100;
const DISTINCT_TRACK_LIMIT = 5000;

function detectType(values) {
  const cleaned = values.filter((v) => v !== null && v !== "");

  if (cleaned.length === 0) return "unknown";

  const isNumeric = cleaned.every((v) => !isNaN(Number(v)));
  if (isNumeric) return "numeric";

  const isBoolean = cleaned.every(
    (v) =>
      ["true", "false", "0", "1", "yes", "no", "y", "n"].includes(
        String(v).trim().toLowerCase()
      )
  );
  if (isBoolean) return "boolean";

  return "string";
}

export function profileCSV(filePath, options = {}) {
  const separator = options.separator || ",";

  return new Promise((resolve, reject) => {
    const rows = [];
    const columnStats = {};
    let totalRows = 0;

    fs.createReadStream(filePath)
      .pipe(csv({ separator }))
      .on("data", (row) => {
        totalRows++;

        if (rows.length < SAMPLE_LIMIT) {
          rows.push(row);
        }

        for (const [key, value] of Object.entries(row)) {
          if (!columnStats[key]) {
            columnStats[key] = {
              values: [],
              nullCount: 0,
              distinctValues: new Set(),
              distinctOverflow: false
            };
          }

          if (value === "" || value === null || value === undefined) {
            columnStats[key].nullCount++;
          } else {
            if (columnStats[key].distinctValues.size < DISTINCT_TRACK_LIMIT) {
              columnStats[key].distinctValues.add(value);
            } else if (!columnStats[key].distinctValues.has(value)) {
              columnStats[key].distinctOverflow = true;
            }
          }

          if (columnStats[key].values.length < SAMPLE_LIMIT) {
            columnStats[key].values.push(value);
          }
        }
      })
      .on("end", () => {
        const columns = Object.entries(columnStats).map(([col, stats]) => ({
          raw_column: col,
          detected_type: detectType(stats.values),
          sample_values: stats.values.slice(0, 5),
          null_ratio: totalRows === 0 ? 0 : stats.nullCount / totalRows,
          distinct_count: stats.distinctValues.size,
          distinct_count_capped: stats.distinctOverflow,
          distinct_count_note: stats.distinctOverflow
            ? `Distinct count capped at ${DISTINCT_TRACK_LIMIT} values for memory safety.`
            : null
        }));

        resolve({
          columns,
          sample_rows: rows,
          row_count: totalRows,
          detected_separator: separator
        });
      })
      .on("error", reject);
  });
}
