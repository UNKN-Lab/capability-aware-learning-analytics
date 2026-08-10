/**
 * aliasMemory.repository.js
 *
 * Learned alias memory backed by PostgreSQL (alias_memory table).
 *
 * MIGRATION NOTE:
 *   This file replaces the original filesystem implementation that read/wrote
 *   learnedAliases.json on disk. The JSON file is now obsolete and can be
 *   deleted from src/config/learnedAliases.json.
 *
 * WHY PostgreSQL instead of JSON file:
 *   - Shared across all server instances (horizontal scaling safe)
 *   - Persists across deployments (no data loss on redeploy)
 *   - Supports concurrent writes safely (DB handles locking)
 *   - Auditable: created_at, last_used_at, learned_count are queryable
 *
 * Public API (unchanged from old file — callers need no changes):
 *   normalizeKey(rawColumn)                    → string
 *   getLearnedAliases()                        → Promise<Record<string, AliasEntry>>
 *   saveLearnedAlias(rawColumn, canonicalField) → Promise<void>
 */

import prisma from "../lib/prisma.js";

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw CSV column name into a normalised lookup key.
 * Identical logic to the old implementation — must NOT change
 * or existing learned aliases will become unreachable.
 *
 * "Student_ID"  → "student id"
 * "student-id"  → "student id"
 * "  SCORE  "   → "score"
 */
export function normalizeKey(rawColumn) {
  if (typeof rawColumn !== "string") return "";
  return rawColumn
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns all learned aliases as a flat object keyed by normalised_key.
 *
 * Return shape matches the old JSON file format so that
 * mappingSuggest.service.js needs zero changes:
 *
 *   {
 *     "student id":  { canonical_field: "student_id",  learned_count: 3 },
 *     "module code": { canonical_field: "course_id",   learned_count: 1 },
 *     ...
 *   }
 *
 * Performance note:
 *   alias_memory is expected to be small (< 500 rows for any realistic
 *   deployment). A full-table scan on every mapping-suggest call is fine.
 *   If it ever grows large, add an in-process LRU cache with a short TTL.
 */
export async function getLearnedAliases() {
  try {
    const rows = await prisma.aliasMemory.findMany();

    // Convert array → object for O(1) lookup in mappingSuggest.service.js
    return Object.fromEntries(
      rows.map((row) => [
        row.normalized_key,
        {
          canonical_field: row.canonical_field,
          learned_count:   row.learned_count,
          last_used_at:    row.last_used_at.toISOString(),
        },
      ])
    );
  } catch (err) {
    // Degrade gracefully — mapping still works, just without learned aliases
    console.error("[AliasMemory] Failed to load learned aliases from DB:", err.message);
    return {};
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// WRITE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Persists a user-confirmed column → canonical_field mapping to the DB.
 *
 * Upsert logic (mirrors old JSON logic exactly):
 *   • New key        → INSERT with learned_count = 1
 *   • Same mapping   → UPDATE last_used_at, increment learned_count
 *   • Changed target → UPDATE canonical_field, reset learned_count = 1
 *                      (new user intent overrides old; count resets to signal
 *                       the change, not accumulate a misleading high count)
 *
 * @param {string} rawColumn      - original CSV column name, e.g. "Student_ID"
 * @param {string} canonicalField - target canonical field, e.g. "student_id"
 */
export async function saveLearnedAlias(rawColumn, canonicalField) {
  if (!rawColumn || !canonicalField) return;

  const normalizedKey = normalizeKey(rawColumn);
  if (!normalizedKey) return;

  try {
    // Check whether this normalised key already exists
    const existing = await prisma.aliasMemory.findUnique({
      where: { normalized_key: normalizedKey },
    });

    if (existing) {
      if (existing.canonical_field !== canonicalField) {
        // User changed their mind — new target wins, reset count
        await prisma.aliasMemory.update({
          where: { normalized_key: normalizedKey },
          data: {
            canonical_field: canonicalField,
            raw_column:      rawColumn,        // keep display name fresh
            learned_count:   1,
            last_used_at:    new Date(),
          },
        });
      } else {
        // Same mapping confirmed again — increment trust counter
        await prisma.aliasMemory.update({
          where: { normalized_key: normalizedKey },
          data: {
            learned_count: { increment: 1 },
            last_used_at:  new Date(),
          },
        });
      }
    } else {
      // First time seeing this column pattern
      await prisma.aliasMemory.create({
        data: {
          normalized_key:  normalizedKey,
          raw_column:      rawColumn,
          canonical_field: canonicalField,
          learned_count:   1,
          last_used_at:    new Date(),
        },
      });
    }
  } catch (err) {
    // Non-fatal: alias learning fails silently.
    // Mapping still confirmed — only future suggestions are affected.
    console.error(
      `[AliasMemory] Failed to save alias "${rawColumn}" → "${canonicalField}":`,
      err.message
    );
  }
}
