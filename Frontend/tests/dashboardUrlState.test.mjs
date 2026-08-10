import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDashboardUrl,
  buildStudentDashboardUrl,
  resolveAdminDashboardUrlState,
  resolveStudentDashboardUrlState,
} from "../src/utils/dashboardUrlState.js";

const classes = [{ class_id: "CLASS_A" }, { class_id: "CLASS_B" }];
const students = [
  { student_id: "S01" },
  { student_id: "S02" },
  { student_id: "S03" },
];

const studentTasks = [
  { taskId: "S-B01", availability: { status: "executable" } },
  { taskId: "S-B02", availability: { status: "insufficient_data" } },
];

const adminTasks = [
  { taskId: "A-B01", availability: { status: "executable" } },
  { taskId: "A-S02", availability: { status: "executable" } },
  { taskId: "A-C01", availability: { status: "executable" } },
];

const studentTabs = [{ id: "student_basic", prefixes: ["S-B01", "S-B02"] }];
const adminTabs = [
  { id: "admin_basic", prefixes: ["A-B01"] },
  { id: "admin_single", prefixes: ["A-S02"] },
  { id: "admin_compare", prefixes: ["A-C01"] },
];
const adminTaskGroups = {
  single: ["A-S02"],
  comparison: ["A-C01"],
};

test("buildStudentDashboardUrl keeps only student task params", () => {
  assert.equal(
    buildStudentDashboardUrl({ taskId: "S-B02", classId: "CLASS_A", studentId: "S01" }),
    "/student/dashboard/S-B02?classId=CLASS_A&studentId=S01"
  );
});

test("resolveStudentDashboardUrlState normalizes invalid class and student", () => {
  const resolved = resolveStudentDashboardUrlState({
    routeTaskId: "S-B02",
    searchParams: new URLSearchParams("classId=bad&studentId=missing"),
    tasks: studentTasks,
    classes,
    students,
    tabs: studentTabs,
    defaultTaskId: "S-B01",
    currentUrl: "/student/dashboard/S-B02?classId=bad&studentId=missing",
  });

  assert.equal(resolved.taskId, "S-B02");
  assert.equal(resolved.classId, "CLASS_A");
  assert.equal(resolved.studentId, "S01");
  assert.equal(resolved.shouldReplaceUrl, true);
  assert.equal(resolved.canonicalUrl, "/student/dashboard/S-B02?classId=CLASS_A&studentId=S01");
});

test("resolveStudentDashboardUrlState rejects wrong-role task", () => {
  const resolved = resolveStudentDashboardUrlState({
    routeTaskId: "A-B01",
    searchParams: new URLSearchParams("classId=CLASS_A&studentId=S01"),
    tasks: studentTasks,
    classes,
    students,
    tabs: studentTabs,
    defaultTaskId: "S-B01",
    currentUrl: "/student/dashboard/A-B01?classId=CLASS_A&studentId=S01",
  });

  assert.equal(resolved.taskId, "S-B01");
  assert.equal(resolved.canonicalUrl, "/student/dashboard/S-B01?classId=CLASS_A&studentId=S01");
});

test("buildAdminDashboardUrl omits params outside the task type", () => {
  assert.equal(
    buildAdminDashboardUrl({
      taskId: "A-B01",
      classId: "CLASS_A",
      studentId: "S01",
      s1: "S02",
      s2: "S03",
      taskType: "class",
    }),
    "/admin/dashboard/A-B01?classId=CLASS_A"
  );
  assert.equal(
    buildAdminDashboardUrl({
      taskId: "A-S02",
      classId: "CLASS_A",
      studentId: "S01",
      s1: "S02",
      s2: "S03",
      taskType: "single",
    }),
    "/admin/dashboard/A-S02?classId=CLASS_A&studentId=S01"
  );
  assert.equal(
    buildAdminDashboardUrl({
      taskId: "A-C01",
      classId: "CLASS_A",
      studentId: "S01",
      s1: "S02",
      s2: "S03",
      taskType: "comparison",
    }),
    "/admin/dashboard/A-C01?classId=CLASS_A&s1=S02&s2=S03"
  );
});

test("resolveAdminDashboardUrlState keeps comparison students distinct", () => {
  const resolved = resolveAdminDashboardUrlState({
    routeTaskId: "A-C01",
    searchParams: new URLSearchParams("classId=CLASS_A&s1=S01&s2=S01&studentId=S03"),
    tasks: adminTasks,
    classes,
    students,
    tabs: adminTabs,
    defaultTaskId: "A-B01",
    taskGroups: adminTaskGroups,
    currentUrl: "/admin/dashboard/A-C01?classId=CLASS_A&s1=S01&s2=S01&studentId=S03",
  });

  assert.equal(resolved.taskId, "A-C01");
  assert.equal(resolved.taskType, "comparison");
  assert.equal(resolved.s1, "S01");
  assert.equal(resolved.s2, "S02");
  assert.equal(resolved.canonicalUrl, "/admin/dashboard/A-C01?classId=CLASS_A&s1=S01&s2=S02");
});
