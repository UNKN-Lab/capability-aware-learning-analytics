/**
 * Builds the public task metadata object returned to clients.
 *
 * SQL templates are server-only implementation details used by the analytics
 * runner. Keeping them out of API responses prevents leaking schema/query
 * internals and keeps frontend payloads focused on renderable task metadata.
 */
export function sanitizeTaskForClient(task) {
  if (!task || typeof task !== "object") return task;

  const { sqlQuery, sqlQueries, ...publicFields } = task;
  return publicFields;
}
