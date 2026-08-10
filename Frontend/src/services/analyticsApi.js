/**
 * analyticsApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service layer cho Task Registry + Analytics Execution.
 *
 * Backend APIs consumed:
 *   GET  /api/tasks              → List all 53 tasks (filterable)
 *   GET  /api/tasks/:taskId      → Single task metadata
 *   POST /api/analytics/run      → Execute analytical query
 *
 * Pattern: Follows the same fetch + handleJsonResponse pattern
 * established in importApi.js and datasetApi.js for consistency.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_BASE =
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:4000/api";

// ─── Response Helper ────────────────────────────────────────────────────────

async function handleJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid JSON response from server");
  }

  if (!response.ok) {
    console.error(`[analyticsApi] ${response.status}:`, data);
    const error = new Error(
      data?.message || data?.error || "API request failed"
    );
    error.status = response.status;
    error.response = data;
    throw error;
  }

  return data;
}

// ─── Task Registry API ──────────────────────────────────────────────────────

/**
 * Fetch all tasks from the registry with optional filters.
 *
 * @param {Object} [filters]
 * @param {string} [filters.scope]    — "student" | "class" | "cohort" | "comparison"
 * @param {string} [filters.dataset]  — "both" | "OULAD" | "UCI"
 * @param {string} [filters.search]   — keyword search in taskName + actionableQuestion
 * @param {string} [filters.analysis] — "trend" | "correlation" | "distribution" | etc.
 * @returns {Promise<{ success: boolean, count: number, tasks: Object[] }>}
 */
export async function fetchTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.dataset) params.set("dataset", filters.dataset);
  if (filters.search) params.set("search", filters.search);
  if (filters.analysis) params.set("analysis", filters.analysis);

  const qs = params.toString();
  const url = `${API_BASE}/tasks${qs ? `?${qs}` : ""}`;

  const response = await fetch(url);
  return handleJsonResponse(response);
}

/**
 * Fetch full metadata for a single task.
 *
 * @param {string} taskId — e.g. "S-T01", "A-G03"
 * @returns {Promise<{ success: boolean, task: Object }>}
 */
export async function fetchTaskById(taskId) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`);
  return handleJsonResponse(response);
}

/**
 * Fetch task metadata already merged with backend availability validation.
 *
 * @param {string} datasetId
 * @param {string} [classId]
 * @param {string} [role]
 * @param {Object} [options]
 * @param {boolean} [options.includeExperimental]
 * @returns {Promise<{ success: boolean, summary: Object, tasks: Object[] }>}
 */
export async function fetchAvailableTasks(datasetId, classId, role, options = {}) {
  const params = new URLSearchParams({ datasetId });
  if (classId) params.set("classId", classId);
  if (role) params.set("role", role);
  if (options.includeExperimental === true) params.set("includeExperimental", "true");

  const response = await fetch(`${API_BASE}/tasks/available?${params}`);
  return handleJsonResponse(response);
}

/**
 * Validate whether a task is executable for a dataset/class before showing it.
 *
 * @param {string} taskId
 * @param {string} datasetId
 * @param {string} [classId]
 * @returns {Promise<{ success: boolean, result: Object }>}
 */
export async function validateAnalyticsTask(taskId, datasetId, classId) {
  const params = new URLSearchParams({ datasetId });
  if (classId) params.set("classId", classId);

  const response = await fetch(
    `${API_BASE}/tasks/validate-one/${taskId}?${params}`
  );
  return handleJsonResponse(response);
}

// ─── Analytics Execution API ────────────────────────────────────────────────

/**
 * Execute an analytical task against the active dataset.
 *
 * @param {string} taskId — Task to execute (e.g. "S-T01")
 * @param {Object} params — Runtime parameters
 * @param {string} params.batch_id    — Dataset batch ID (required)
 * @param {string} params.class_id    — Class ID (required for most tasks)
 * @param {string} [params.student_id] — For single-student scope tasks
 * @param {string} [params.enrollment_id] — For OULAD engagement tasks
 * @param {string} [params.s1]        — For comparison tasks (student 1)
 * @param {string} [params.s2]        — For comparison tasks (student 2)
 * @returns {Promise<{
 *   success: boolean,
 *   executionId: string,
 *   taskId: string,
 *   datasets: Object,
 *   meta: Object
 * }>}
 */
export async function runAnalyticsTask(taskId, params) {
  const response = await fetch(`${API_BASE}/analytics/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, params }),
  });
  return handleJsonResponse(response);
}

// ─── AI Explanation API ─────────────────────────────────────────────────────

/**
 * Request AI explanation for an analytics result.
 * Node proxy → Python FastAPI AI service.
 *
 * @param {Object} payload
 * @param {string} payload.taskId       — Task that was executed
 * @param {string} payload.executionId  — Execution ID for traceability
 * @param {Object} payload.datasets     — Analytics result datasets
 * @param {Object} payload.meta         — dataQuality info
 * @param {Object} [payload.studentContext] — Student demographics
 * @returns {Promise<Object>} — ExplainResponse or DegradedResponse
 */
export async function getAIExplanation({ taskId, executionId, datasets, meta, studentContext }) {
  const response = await fetch(`${API_BASE}/ai/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, executionId, datasets, meta, studentContext }),
  });
  return handleJsonResponse(response);
}

// ─── Student API ────────────────────────────────────────────────────────────

/**
 * Get student summary (demographics + performance metrics).
 *
 * @param {string} studentId
 * @param {string} batchId
 * @param {string} [classId]
 * @returns {Promise<Object>}
 */
export async function getStudentSummary(studentId, batchId, classId) {
  const params = new URLSearchParams({ batchId });
  if (classId) params.set("classId", classId);

  const response = await fetch(
    `${API_BASE}/students/${studentId}/summary?${params}`
  );
  return handleJsonResponse(response);
}

/**
 * Get paginated list of students.
 *
 * @param {string} batchId
 * @param {string} [classId]
 * @returns {Promise<Object>}
 */
export async function getStudents(batchId, classId) {
  const params = new URLSearchParams({ batchId });
  if (classId) params.set("classId", classId);

  const response = await fetch(`${API_BASE}/students?${params}`);
  return handleJsonResponse(response);
}

/**
 * Get list of classes in a dataset batch.
 *
 * @param {string} batchId
 * @returns {Promise<{ success: boolean, count: number, classes: Object[] }>}
 */
export async function fetchClasses(batchId) {
  const response = await fetch(`${API_BASE}/classes?batchId=${batchId}`);
  return handleJsonResponse(response);
}
