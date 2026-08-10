function getSearchValue(searchParams, key) {
  if (!searchParams) return "";
  if (typeof searchParams.get === "function") return searchParams.get(key) || "";
  return searchParams[key] || "";
}

function hasTask(tasks, taskId) {
  return tasks.some((task) => task.taskId === taskId);
}

function isExecutable(task) {
  return task?.availability?.status === "executable";
}

function resolveFallbackTaskId(tasks, defaultTaskId) {
  if (hasTask(tasks, defaultTaskId)) return defaultTaskId;
  return tasks.find(isExecutable)?.taskId || tasks[0]?.taskId || "";
}

function findTabIdForTask(taskId, tabs) {
  return tabs.find((tab) => tab.prefixes.includes(taskId))?.id || tabs[0]?.id || "";
}

function findClassId(classes, candidate) {
  if (classes.some((item) => item.class_id === candidate)) return candidate;
  return classes[0]?.class_id || "";
}

function findStudentId(students, candidate) {
  if (students.some((item) => item.student_id === candidate)) return candidate;
  return students[0]?.student_id || "";
}

function findComparisonStudents(students, s1Candidate, s2Candidate) {
  const s1 = findStudentId(students, s1Candidate);
  const s2 =
    students.find((item) => item.student_id === s2Candidate && item.student_id !== s1)?.student_id ||
    students.find((item) => item.student_id !== s1)?.student_id ||
    "";

  return { s1, s2 };
}

function buildUrl(path, query) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  const searchText = search.toString();
  return searchText ? `${path}?${searchText}` : path;
}

export function buildStudentDashboardUrl({ taskId, classId, studentId }) {
  return buildUrl(`/student/dashboard/${encodeURIComponent(taskId)}`, {
    classId,
    studentId,
  });
}

export function buildAdminDashboardUrl({ taskId, classId, studentId, s1, s2, taskType }) {
  if (taskType === "single") {
    return buildUrl(`/admin/dashboard/${encodeURIComponent(taskId)}`, {
      classId,
      studentId,
    });
  }

  if (taskType === "comparison") {
    return buildUrl(`/admin/dashboard/${encodeURIComponent(taskId)}`, {
      classId,
      s1,
      s2,
    });
  }

  return buildUrl(`/admin/dashboard/${encodeURIComponent(taskId)}`, {
    classId,
  });
}

export function resolveStudentDashboardUrlState({
  routeTaskId,
  searchParams,
  tasks,
  classes,
  students,
  tabs,
  defaultTaskId,
  currentUrl,
}) {
  const fallbackTaskId = resolveFallbackTaskId(tasks, defaultTaskId);
  const taskId = hasTask(tasks, routeTaskId) ? routeTaskId : fallbackTaskId;
  const classId = findClassId(classes, getSearchValue(searchParams, "classId"));
  const studentId = findStudentId(students, getSearchValue(searchParams, "studentId"));
  const tabId = findTabIdForTask(taskId, tabs);
  const canonicalUrl = taskId ? buildStudentDashboardUrl({ taskId, classId, studentId }) : "/student/dashboard";

  return {
    taskId,
    tabId,
    classId,
    studentId,
    canonicalUrl,
    shouldReplaceUrl: Boolean(currentUrl && canonicalUrl && currentUrl !== canonicalUrl),
  };
}

export function resolveAdminDashboardUrlState({
  routeTaskId,
  searchParams,
  tasks,
  classes,
  students,
  tabs,
  defaultTaskId,
  taskGroups,
  currentUrl,
}) {
  const fallbackTaskId = resolveFallbackTaskId(tasks, defaultTaskId);
  const taskId = hasTask(tasks, routeTaskId) ? routeTaskId : fallbackTaskId;
  const taskType = getAdminTaskType(taskId, taskGroups);
  const classId = findClassId(classes, getSearchValue(searchParams, "classId"));
  const tabId = findTabIdForTask(taskId, tabs);
  const studentId = findStudentId(students, getSearchValue(searchParams, "studentId"));
  const { s1, s2 } = findComparisonStudents(
    students,
    getSearchValue(searchParams, "s1"),
    getSearchValue(searchParams, "s2")
  );
  const canonicalUrl = taskId
    ? buildAdminDashboardUrl({ taskId, classId, studentId, s1, s2, taskType })
    : "/admin/dashboard";

  return {
    taskId,
    taskType,
    tabId,
    classId,
    studentId,
    s1,
    s2,
    canonicalUrl,
    shouldReplaceUrl: Boolean(currentUrl && canonicalUrl && currentUrl !== canonicalUrl),
  };
}

export function getAdminTaskType(taskId, taskGroups) {
  if (taskGroups.single.includes(taskId)) return "single";
  if (taskGroups.comparison.includes(taskId)) return "comparison";
  return "class";
}
