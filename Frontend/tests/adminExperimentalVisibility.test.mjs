import assert from "node:assert/strict";
import test from "node:test";

import { fetchAvailableTasks } from "../src/services/analyticsApi.js";
import {
  ADMIN_ALLOWED_TASK_IDS,
  TARGET_EXPERIMENTAL_ADMIN_TASKS,
  filterUniqueAdminTasks,
  getAvailabilityLabel,
  isTaskExecutable,
} from "../src/utils/adminTaskVisibility.js";

function okResponse(payload = { success: true, tasks: [] }) {
  return {
    ok: true,
    json: async () => payload,
  };
}

test("fetchAvailableTasks omits includeExperimental by default", async () => {
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    return okResponse();
  };

  try {
    await fetchAvailableTasks("DATASET_1", "CLASS_1", "admin");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.pathname, "/api/tasks/available");
  assert.equal(url.searchParams.get("datasetId"), "DATASET_1");
  assert.equal(url.searchParams.get("classId"), "CLASS_1");
  assert.equal(url.searchParams.get("role"), "admin");
  assert.equal(url.searchParams.has("includeExperimental"), false);
});

test("fetchAvailableTasks appends includeExperimental when explicitly requested", async () => {
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    return okResponse();
  };

  try {
    await fetchAvailableTasks("DATASET_1", "CLASS_1", "admin", { includeExperimental: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get("includeExperimental"), "true");
});

test("admin allow-list keeps the four target experimental tasks visible", () => {
  for (const taskId of TARGET_EXPERIMENTAL_ADMIN_TASKS) {
    assert.equal(ADMIN_ALLOWED_TASK_IDS.has(taskId), true, `${taskId} should be allowed in Admin`);
  }

  const tasks = [
    { taskId: "A-S01", availability: { status: "insufficient_data" } },
    { taskId: "A-S08", availability: { status: "unsupported" } },
    { taskId: "A-G15", availability: { status: "insufficient_data" } },
    { taskId: "A-G16", availability: { status: "unsupported" } },
    { taskId: "S-B01", availability: { status: "executable" } },
  ];

  assert.deepEqual(
    filterUniqueAdminTasks(tasks).map((task) => task.taskId),
    TARGET_EXPERIMENTAL_ADMIN_TASKS
  );
});

test("admin availability helpers keep raw validator status as the execution gate", () => {
  const executable = {
    taskId: "A-S01",
    registry_status: "experimental",
    availability: { status: "executable" },
  };
  const insufficient = {
    taskId: "A-G15",
    registry_status: "experimental",
    availability: { status: "insufficient_data" },
  };
  const datasetMismatch = {
    taskId: "A-G16",
    registry_status: "experimental",
    datasetCompatibility: "OULAD_only",
    availability: {
      status: "unsupported",
      disabled_reason: "Legacy datasetCompatibility=OULAD_only does not match dataset=UCI.",
    },
  };
  const unavailable = {
    taskId: "A-B99",
    availability: { status: "unsupported" },
  };

  assert.equal(isTaskExecutable(executable), true);
  assert.equal(isTaskExecutable(insufficient), false);
  assert.equal(isTaskExecutable(datasetMismatch), false);
  assert.equal(getAvailabilityLabel(executable), "Available");
  assert.equal(getAvailabilityLabel(insufficient), "Insufficient data");
  assert.equal(getAvailabilityLabel(datasetMismatch), "Unavailable for this dataset");
  assert.equal(getAvailabilityLabel(unavailable), "Unavailable");
  assert.equal(insufficient.availability.status, "insufficient_data");
  assert.equal(datasetMismatch.availability.status, "unsupported");
});
