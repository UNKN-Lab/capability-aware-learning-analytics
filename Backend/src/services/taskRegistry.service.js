import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scoreAgg as canonicalScoreAgg } from "../lib/sqlFragments.js";

// Construct absolute path to the taskRegistry.json file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGISTRY_PATH = path.join(__dirname, "../config/taskRegistry.json");

/**
 * TaskRegistryService
 *
 * This service handles reading, filtering, and retrieving task definitions
 * from the taskRegistry.json seed file. It acts as the single source of truth
 * for Analytics-time tasks (Phase 2), providing SQL queries, AI prompts,
 * and visualization metadata for the frontend.
 */
class TaskRegistryService {
  constructor() {
    this.tasks = [];
    this.isLoaded = false;
    this.loadedMtimeMs = 0;
  }

  /**
   * Internal helper to load tasks from JSON if not already loaded.
   */
  _ensureLoaded() {
    try {
      const registryStat = fs.statSync(REGISTRY_PATH);
      if (this.isLoaded && this.loadedMtimeMs === registryStat.mtimeMs) return;

      const rawData = fs.readFileSync(REGISTRY_PATH, "utf-8");
      this.tasks = JSON.parse(rawData);
      // Pre-process all SQL templates to strip -- comments at load time
      // so that buildPositionalQuery never encounters :params inside comments
      this.tasks.forEach(task => {
        this._applyRuntimeSqlCorrections(task);
        this._preprocessSql(task);
      });
      this.loadedMtimeMs = registryStat.mtimeMs;
      this.isLoaded = true;
    } catch (error) {
      console.error("Failed to load taskRegistry.json:", error);
      throw new Error("Task registry could not be loaded. Ensure the JSON file exists.");
    }
  }

  /**
   * Apply narrowly scoped corrections that must remain effective for every
   * registry consumer. S-T13 previously calculated the class maximum after
   * filtering to the selected student, which made every non-zero relative
   * absence index equal to 1. It also treated missing engagement observations
   * as observed zero engagement when calculating the composite risk score.
   */
  _applyRuntimeSqlCorrections(task) {
    const correctedTaskIds = new Set([
      "S-B02", "S-T04", "S-T12", "S-T13",
      "A-B04", "A-S01", "A-S04", "A-S05", "A-S08",
      "A-C03", "A-G03", "A-G15", "A-G16",
    ]);
    if (!task || !correctedTaskIds.has(task.taskId)) return;
    if (Array.isArray(task.sqlQueries)) {
      task.sqlQueries = task.sqlQueries.map((sqlQuery) => {
        const queryTask = { ...task, sqlQuery, sqlQueries: undefined };
        this._applyRuntimeSqlCorrections(queryTask);
        return queryTask.sqlQuery;
      });
    }
    if (typeof task.sqlQuery !== "string") return;

    if (task.taskId === "A-S05") {
      const generatedProxyFirst = "WHEN a.assessment_order IS NOT NULL THEN CONCAT(COALESCE(NULLIF(a.assessment_type, ''), 'Assessment'), ' ', a.assessment_order) WHEN a.assessment_name IS NOT NULL AND a.assessment_name !~ '^[0-9]+$' AND a.assessment_name <> a.assessment_type THEN a.assessment_name";
      const sourceNameFirst = "WHEN a.assessment_name IS NOT NULL AND a.assessment_name !~ '^[0-9]+$' AND a.assessment_name <> a.assessment_type THEN a.assessment_name WHEN a.assessment_order IS NOT NULL THEN CONCAT(COALESCE(NULLIF(a.assessment_type, ''), 'Assessment'), ' ', a.assessment_order)";
      task.sqlQuery = task.sqlQuery.split(generatedProxyFirst).join(sourceNameFirst);
      return;
    }

    if (task.taskId === "A-S04") {
      task.sqlQuery = task.sqlQuery
        .replace(
          "COUNT(*) FILTER (WHERE ar.submission_day <= a.due_day) * 1.0\n           / NULLIF(COUNT(*), 0)",
          "COUNT(*) FILTER (WHERE a.due_day IS NOT NULL\n                              AND ar.submission_day IS NOT NULL\n                              AND ar.submission_day <= a.due_day) * 1.0\n           / NULLIF(COUNT(*) FILTER (WHERE a.due_day IS NOT NULL\n                                      AND ar.submission_day IS NOT NULL), 0)"
        )
        .replace(
          "SELECT flag_name, flag_value, threshold, triggered, severity, flag_description, recommended_action, support_category\nFROM (",
          "SELECT flag_name, flag_value, threshold, triggered, severity, flag_description, recommended_action, support_category,\n       (flag_value IS NOT NULL) AS evidence_available\nFROM ("
        )
        .replace(
          "sa.avg_score            AS flag_value,",
          "ROUND(sa.avg_score::numeric, 2)::float8 AS flag_value,"
        )
        .replace(
          "COALESCE(sa.perf_trend, 0) AS flag_value,",
          "ROUND(sa.perf_trend::numeric, 2)::float8 AS flag_value,"
        );
      return;
    }

    const legacyRiskScoreTaskIds = new Set(["A-S01", "A-S08", "A-C03", "A-G15", "A-G16"]);
    if (legacyRiskScoreTaskIds.has(task.taskId)) {
      task.sqlQuery = this._replaceCteBlock(task.sqlQuery, "score_agg", canonicalScoreAgg)
        .replace(/sa\.avg_score\s*<\s*40/g, "sa.avg_score < sa.pass_threshold");
    }

    task.sqlQuery = task.sqlQuery
      .replace(
        "COALESCE(es.engagement_score, 0) AS engagement_score,",
        "es.engagement_score AS engagement_score,"
      )
      .replace(
        "(COALESCE(es.engagement_score, 0) < 0.15) AS flag_low_engagement,",
        "(COALESCE(es.has_engagement_data, false) AND es.engagement_score < 0.15) AS flag_low_engagement,"
      )
      .replace(
        "+ (CASE WHEN COALESCE(es.engagement_score, 0) < 0.15 THEN 1 ELSE 0 END)",
        "+ (CASE WHEN COALESCE(es.has_engagement_data, false) AND es.engagement_score < 0.15 THEN 1 ELSE 0 END)"
      )
      .replace(
        "ELSE 1.0\n         END AS punctuality_rate",
        "ELSE NULL\n         END AS punctuality_rate"
      )
      .replace(
        "COALESCE(p.punctuality_rate, 1)::float8 AS punctuality_rate,",
        "p.punctuality_rate::float8 AS punctuality_rate,"
      )
      .replace(
        "(COALESCE(p.punctuality_rate, 1) < 0.7) AS flag_low_punctuality,",
        "(p.punctuality_rate IS NOT NULL AND p.punctuality_rate < 0.7) AS flag_low_punctuality,"
      )
      .replace(
        "+ (CASE WHEN COALESCE(p.punctuality_rate, 1) < 0.7 THEN 1 ELSE 0 END)",
        "+ (CASE WHEN p.punctuality_rate IS NOT NULL AND p.punctuality_rate < 0.7 THEN 1 ELSE 0 END)"
      )
      .replace(
        "rf.punctuality_rate,\n       rf.previous_attempt_count,",
        "rf.punctuality_rate,\n       (rf.punctuality_rate IS NOT NULL) AS punctuality_rate_available,\n       rf.previous_attempt_count,"
      );

    // Older compact SQL variants use single-line formulas. Apply the same
    // availability-safe semantics without changing valid OULAD observations.
    task.sqlQuery = task.sqlQuery
      .replace(
        /COUNT\(\*\) FILTER \(WHERE ar\.submission_day <= a\.due_day\) \* 1\.0\s*\/\s*NULLIF\(COUNT\(\*\), 0\)/g,
        "COUNT(*) FILTER (WHERE a.due_day IS NOT NULL AND ar.submission_day IS NOT NULL AND ar.submission_day <= a.due_day) * 1.0 / NULLIF(COUNT(*) FILTER (WHERE a.due_day IS NOT NULL AND ar.submission_day IS NOT NULL), 0)"
      )
      .replace(/COALESCE\(p\.punctuality_rate,\s*1(?:\.0)?\)/g, "p.punctuality_rate")
      .replace(/COALESCE\(es\.engagement_score,\s*0\)/g, "es.engagement_score");

    if (task.taskId !== "S-T13") return;

    task.sqlQuery = task.sqlQuery
      .replace(
        "FROM enrollment e\n  WHERE e.student_id = :student_id\n    AND e.class_id = :class_id\n)\nSELECT rf.avg_score,",
        "FROM enrollment e\n  WHERE e.class_id = :class_id\n)\nSELECT rf.avg_score,"
      )
      .replace(
        "LEFT JOIN absence_calc ac ON ac.student_id = rf.student_id",
        "LEFT JOIN absence_calc ac ON ac.student_id = rf.student_id\n                             AND ac.class_id = :class_id"
      );
  }

  _replaceCteBlock(sql, cteName, replacement) {
    const matcher = new RegExp(`\\b${cteName}\\s+AS(?:\\s+MATERIALIZED)?\\s*\\(`, "i");
    const match = matcher.exec(sql);
    if (!match) return sql;

    const openParenIndex = match.index + match[0].lastIndexOf("(");
    let depth = 0;
    let inSingleQuote = false;

    for (let index = openParenIndex; index < sql.length; index += 1) {
      const char = sql[index];
      if (char === "'" && sql[index - 1] !== "\\") {
        if (inSingleQuote && sql[index + 1] === "'") {
          index += 1;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (inSingleQuote) continue;
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0) {
        return `${sql.slice(0, match.index)}${replacement}${sql.slice(index + 1)}`;
      }
    }

    return sql;
  }

  /**
   * Strips SQL line comments (-- ...) from sqlQuery and sqlQueries fields.
   *
   * Handles both multi-line SQL (with \n) and single-line SQL (no \n).
   * For single-line SQL like "-- comment textSELECT ...", it finds --
   * comment regions and removes them up to the next statement keyword.
   *
   * Also validates that no single sqlQuery contains multiple statements.
   * Multi-statement tasks MUST use sqlQueries[] — see Bug #2 post-mortem.
   *
   * This runs ONCE at load time so buildPositionalQuery only sees clean SQL.
   */
  _preprocessSql(task) {
    if (task.sqlQuery) {
      task.sqlQuery = this._stripSqlComments(task.sqlQuery);

      // ── Guard: detect multi-statement sqlQuery ──────────────────────────
      // A semicolon followed by a statement keyword means the task was
      // authored incorrectly. PostgreSQL will reject this with:
      //   "cannot insert multiple commands into a prepared statement"
      // Fix: split into sqlQueries[] in taskRegistry.json.
      if (/;\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(task.sqlQuery)) {
        console.error(
          `[TaskRegistry] ⚠️  MULTI-STATEMENT sqlQuery detected in task "${task.taskId}". ` +
          `Split into sqlQueries[] in taskRegistry.json to fix this. ` +
          `This task will fail at runtime.`
        );
      }
    }
    if (Array.isArray(task.sqlQueries)) {
      task.sqlQueries = task.sqlQueries.map(q => this._stripSqlComments(q));
    }
  }

  /**
   * Strips -- line comments from a SQL string.
   * Works for both multi-line (\n separated) and single-line SQL.
   */
  _stripSqlComments(sql) {
    if (!sql) return sql;

    // If the SQL has real newlines, process line by line (reliable)
    if (sql.includes('\n')) {
      return sql.split('\n')
        .map(line => {
          const commentIdx = line.indexOf('--');
          return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
        })
        .join('\n')
        .trim();
    }

    // ── Single-line SQL (JSON-encoded without real \n) ──────────────────────
    //
    // BUG in old regex /--.*?(?=KEYWORD)/gi:
    //   Non-greedy .*? stopped at the FIRST keyword inside comment text.
    //   e.g. "column removed from enrollment" contains FROM → regex stopped
    //   early, leaving "from enrollment)SELECT..." → PostgreSQL syntax error.
    //
    // FIX: Iteratively strip leading -- blocks. For each block, scan forward
    //   to find the next STATEMENT-STARTING keyword (SELECT/WITH/INSERT/
    //   UPDATE/DELETE). Clause keywords (FROM/JOIN/WHERE etc.) are excluded —
    //   they commonly appear in comment descriptions.
    //
    // Edge case handled: "-- Same as S-T02SELECT..." → \b fails because digits
    //   count as word chars. We use a char-level check instead: the char
    //   immediately before the keyword must NOT be [a-zA-Z] (letters only).
    //   Digits/symbols/spaces/start-of-string are all valid boundaries.
    //   This matches "02SELECT" (digit→letter = ok) and ")SELECT" (paren = ok)
    //   but rejects "xSELECT" (letter→letter = likely inside a word).
    //
    // Handles chained comments:
    //   "-- note1-- note2SELECT ..."  → "SELECT ..."
    //   "-- AI synthesis from S-B01-- note...WITH cte" → "WITH cte"
    //   "-- Same as S-T02SELECT ..."  → "SELECT ..."
    // ───────────────────────────────────────────────────────────────────────
    const STMT_KEYWORD_RE = /(SELECT|WITH|INSERT|UPDATE|DELETE)/gi;
    let result = sql;

    for (let iter = 0; iter < 30; iter++) {
      const trimmed = result.trimStart();
      if (!trimmed.startsWith('--')) break;   // no more leading comments

      // Find ALL statement-keyword occurrences starting after '--'
      STMT_KEYWORD_RE.lastIndex = 2;
      let match;
      let foundIdx = -1;

      while ((match = STMT_KEYWORD_RE.exec(trimmed)) !== null) {
        const pos = match.index;
        // The char immediately before the keyword must NOT be a letter
        // (prevents matching mid-word occurrences like "xSELECT")
        const charBefore = pos > 0 ? trimmed[pos - 1] : '';
        if (!/[a-zA-Z]/.test(charBefore)) {
          foundIdx = pos;
          break;  // take the first valid occurrence
        }
      }

      if (foundIdx === -1) {
        result = '';  // entire string is comment
        break;
      }

      result = trimmed.slice(foundIdx);
      // Loop again — result may still start with another -- block
    }

    return result.trim();
  }

  /**
   * Returns all available tasks in the registry.
   * @returns {Array<Object>} List of all tasks
   */
  getAllTasks() {
    this._ensureLoaded();
    return this.tasks;
  }

  /**
   * Retrieves a specific task by its exact Task ID.
   * @param {string} taskId - e.g., "S-B01"
   * @returns {Object|null} The task object or null if not found
   */
  getTaskById(taskId) {
    this._ensureLoaded();
    const task = this.tasks.find((t) => t.taskId === taskId);
    return task || null;
  }

  /**
   * Filters tasks by scope (e.g., "1 student", "Cohort").
   * Returns tasks that contain the given scope string (case-insensitive).
   * @param {string} scopeKeyword - e.g., "student" or "cohort"
   * @returns {Array<Object>} List of matching tasks
   */
  getTasksByScope(scopeKeyword) {
    this._ensureLoaded();
    if (!scopeKeyword) return this.getAllTasks();

    const lowerKeyword = scopeKeyword.toLowerCase();
    return this.tasks.filter((t) => 
      t.scope && t.scope.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * Filters tasks by dataset compatibility.
   * "both" tasks are always included.
   * @param {string} dataset - e.g., "OULAD" or "UCI"
   * @returns {Array<Object>} List of compatible tasks
   */
  getTasksByCompatibility(dataset) {
    this._ensureLoaded();
    if (!dataset) return this.getAllTasks();

    const normalizedDataset = dataset.toLowerCase();
    
    return this.tasks.filter((t) => {
      if (!t.datasetCompatibility) return true; // Assume compatible if not specified
      
      const comp = t.datasetCompatibility.toLowerCase();
      // "both" is compatible with any dataset
      if (comp === "both") return true;
      // Exact match (e.g., "oulad_only" includes "oulad")
      if (comp.includes(normalizedDataset)) return true;
      
      return false;
    });
  }

  /**
   * Searches tasks by keyword in the task name or actionable question.
   * @param {string} keyword - The search term
   * @returns {Array<Object>} List of matching tasks
   */
  searchTasks(keyword) {
    this._ensureLoaded();
    if (!keyword) return this.getAllTasks();

    const lowerKeyword = keyword.toLowerCase();
    return this.tasks.filter((t) => {
      const matchName = t.taskName && t.taskName.toLowerCase().includes(lowerKeyword);
      const matchQuestion = t.actionableQuestion && t.actionableQuestion.toLowerCase().includes(lowerKeyword);
      return matchName || matchQuestion;
    });
  }
}

// Export a singleton instance
const taskRegistryService = new TaskRegistryService();
export default taskRegistryService;
