/**
 * migrate-alias-memory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration script: reads learnedAliases.json → inserts into alias_memory table.
 *
 * WHEN TO RUN:
 *   Run ONCE after applying the Prisma migration that creates the alias_memory table.
 *   Safe to run multiple times (uses upsert → idempotent).
 *
 * HOW TO RUN:
 *   node prisma/migrations/migrate-alias-memory.js
 *
 * AFTER RUNNING:
 *   Verify rows in DB:
 *     SELECT * FROM alias_memory;
 *   Then delete the old file:
 *     del src\config\learnedAliases.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALIAS_FILE_PATH = path.resolve(
  __dirname,
  "../../src/config/learnedAliases.json"
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── 1. Read old JSON file ─────────────────────────────────────────────────
  let oldAliases = {};
  try {
    const raw = await fs.readFile(ALIAS_FILE_PATH, "utf-8");
    oldAliases = JSON.parse(raw);
    console.log(`[Migration] Found ${Object.keys(oldAliases).length} entries in learnedAliases.json`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log("[Migration] learnedAliases.json not found — nothing to migrate. Done.");
      return;
    }
    throw err;
  }

  const entries = Object.entries(oldAliases);
  if (entries.length === 0) {
    console.log("[Migration] File is empty — nothing to migrate. Done.");
    return;
  }

  // ── 2. Upsert each entry into alias_memory ────────────────────────────────
  let inserted = 0;
  let skipped = 0;

  for (const [normalizedKey, value] of entries) {
    const canonicalField = value?.canonical_field;
    const learnedCount   = value?.learned_count ?? 1;
    const lastUsedAt     = value?.last_used_at ? new Date(value.last_used_at) : new Date();

    if (!canonicalField) {
      console.warn(`[Migration] Skipping key "${normalizedKey}": no canonical_field`);
      skipped++;
      continue;
    }

    await prisma.aliasMemory.upsert({
      where:  { normalized_key: normalizedKey },
      update: {
        canonical_field: canonicalField,
        learned_count:   learnedCount,
        last_used_at:    lastUsedAt,
        // raw_column: old JSON didn't store this → keep existing or use key as fallback
      },
      create: {
        normalized_key,
        raw_column:      normalizedKey, // best we can do — original was not stored
        canonical_field: canonicalField,
        learned_count:   learnedCount,
        last_used_at:    lastUsedAt,
      },
    });

    inserted++;
  }

  console.log(`[Migration] Done. Inserted/updated: ${inserted}, Skipped: ${skipped}`);
  console.log(`[Migration] You can now safely delete src/config/learnedAliases.json`);
}

main()
  .catch((err) => {
    console.error("[Migration] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
