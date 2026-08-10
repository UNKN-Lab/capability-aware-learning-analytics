/**
 * Validate task output contract against normalized datasets.
 *
 * Contract shape in taskRegistry:
 *   output_schema: {
 *     required_columns: string[],
 *     optional_columns: string[]
 *   }
 *
 * Rule:
 * - required_columns must exist in at least one returned dataset rowset header.
 * - If all datasets are empty, skip strict validation because that is a data
 *   availability state, not a schema-shape failure.
 */
export function validateOutputSchema(task, datasets) {
  const schema = task?.output_schema;
  if (!schema) return { ok: true };

  const required = Array.isArray(schema.required_columns)
    ? schema.required_columns
    : [];
  if (required.length === 0) return { ok: true };

  const entries = Object.entries(datasets || {});
  const nonEmpty = entries.filter(([, rows]) => Array.isArray(rows) && rows.length > 0);
  if (nonEmpty.length === 0) return { ok: true };

  const available = new Set();
  for (const [, rows] of nonEmpty) {
    const header = Object.keys(rows[0] || {});
    for (const col of header) available.add(col);
  }

  const missing = required.filter((col) => !available.has(col));
  if (missing.length === 0) return { ok: true };

  return {
    ok: false,
    missing,
    required,
    available: Array.from(available).sort(),
  };
}

