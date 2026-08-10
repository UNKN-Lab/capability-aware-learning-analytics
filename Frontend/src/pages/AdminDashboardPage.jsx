import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "../contexts/AppContext";
import { runAnalyticsTask, fetchClasses, getStudents, fetchAvailableTasks } from "../services/analyticsApi";
import ChartRenderer from "../components/ChartRenderer";
import AIInsightPanel from "../components/AIInsightPanel";
import {
  buildAdminDashboardUrl,
  getAdminTaskType,
  resolveAdminDashboardUrlState,
} from "../utils/dashboardUrlState";
import {
  ADMIN_BASIC_TASKS,
  ADMIN_SINGLE_STUDENT_TASKS,
  ADMIN_COMPARISON_TASKS,
  ADMIN_COHORT_TASKS,
  filterUniqueAdminTasks,
  getAvailabilityBadgeClass,
  getAvailabilityLabel,
  getDisabledReason,
  isTaskExecutable,
} from "../utils/adminTaskVisibility";

const INCLUDE_EXPERIMENTAL_ADMIN_TASKS = true;

const WORKSPACE_TABS = [
  { id: "admin_basic", label: "Admin - Basic Tasks", prefixes: ADMIN_BASIC_TASKS },
  { id: "admin_single", label: "Admin - Single Student Tasks", prefixes: ADMIN_SINGLE_STUDENT_TASKS },
  { id: "admin_compare", label: "Admin - Comparison Tasks", prefixes: ADMIN_COMPARISON_TASKS },
  { id: "admin_cohort", label: "Admin - Cohort Tasks", prefixes: ADMIN_COHORT_TASKS },
];

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { taskId: routeTaskId } = useParams();
  const [searchParams] = useSearchParams();
  const { activeDataset, isLoading: appLoading } = useAppContext();
  const [currentTab, setCurrentTab] = useState("admin_basic");
  const [activeTaskId, setActiveTaskId] = useState(ADMIN_BASIC_TASKS[0]);
  const [analysisRunNonce, setAnalysisRunNonce] = useState(0);
  const latestTaskRunRef = useRef(0);

  const { data: classesData, isLoading: isClassesLoading, isError: isClassesError, error: classesQueryError } = useQuery({
    queryKey: ["classes", activeDataset?.id],
    queryFn: () => fetchClasses(activeDataset?.id),
    enabled: !!activeDataset?.id,
  });
  const classes = useMemo(() => classesData?.classes ?? [], [classesData?.classes]);

  const [selectedClassId, setSelectedClassId] = useState("");
  const classId = selectedClassId || classes[0]?.class_id || "";

  const { data: studentsData, isLoading: isStudentsLoading, isError: isStudentsError, error: studentsQueryError } = useQuery({
    queryKey: ["students", activeDataset?.id, classId],
    queryFn: () => getStudents(activeDataset?.id, classId),
    enabled: !!activeDataset?.id && !!classId,
  });
  const students = useMemo(() => studentsData?.students ?? [], [studentsData?.students]);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedCompareStudentId, setSelectedCompareStudentId] = useState("");

  const primaryStudentId = selectedStudentId || students[0]?.student_id || "";
  const secondaryStudentId = selectedCompareStudentId || students.find((s) => s.student_id !== primaryStudentId)?.student_id || "";

  const {
    data: availableTasksData,
    isLoading: isAvailabilityLoading,
    isError: isAvailabilityError,
    error: availabilityError,
  } = useQuery({
    queryKey: ["available-tasks", activeDataset?.id, classId, "admin", { includeExperimental: INCLUDE_EXPERIMENTAL_ADMIN_TASKS }],
    queryFn: () => fetchAvailableTasks(activeDataset.id, classId, "admin", { includeExperimental: INCLUDE_EXPERIMENTAL_ADMIN_TASKS }),
    enabled: !!activeDataset?.id && !!classId,
    staleTime: 60 * 1000,
  });
  const allTasksRaw = useMemo(() => availableTasksData?.tasks ?? [], [availableTasksData?.tasks]);
  const uniqueAdminTasks = useMemo(() => filterUniqueAdminTasks(allTasksRaw), [allTasksRaw]);

  const taskMetaById = useMemo(() => {
    const map = new Map();
    for (const task of uniqueAdminTasks) {
      map.set(task.taskId, task);
    }
    return map;
  }, [uniqueAdminTasks]);

  const [taskResults, setTaskResults] = useState({});
  const [loadingTasks, setLoadingTasks] = useState(new Set());

  const resolveEnrollmentId = useCallback((studentId) => 
    students.find((s) => s.student_id === studentId)?.enrollment_id ?? null,
    [students]
  );

  const runTask = useCallback(async (taskId, extraParams = {}) => {
    if (!activeDataset?.id || !classId) return;
    const runId = latestTaskRunRef.current + 1;
    latestTaskRunRef.current = runId;

    const task = taskMetaById.get(taskId);
    if (!isTaskExecutable(task)) {
      setTaskResults((prev) => ({
        ...prev,
        [taskId]: {
          error: getDisabledReason(task),
          taskId,
          availability: task?.availability,
        },
      }));
      return;
    }

    const params = {
      batch_id: activeDataset.id,
      class_id: classId,
      ...extraParams,
    };

    if (params.student_id && !params.enrollment_id) {
      const eid = resolveEnrollmentId(params.student_id);
      if (eid) params.enrollment_id = eid;
    }

    setLoadingTasks((prev) => new Set([...prev, taskId]));
    try {
      const result = await runAnalyticsTask(taskId, params);
      if (latestTaskRunRef.current !== runId) return;
      setTaskResults((prev) => ({ ...prev, [taskId]: result }));
    } catch (err) {
      if (latestTaskRunRef.current !== runId) return;
      console.error(`[AdminDashboard] Task ${taskId} failed:`, err.message);
      setTaskResults((prev) => ({ ...prev, [taskId]: { error: err.message, taskId } }));
    } finally {
      if (latestTaskRunRef.current === runId) {
        setLoadingTasks((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
  }, [activeDataset?.id, classId, resolveEnrollmentId, taskMetaById]);

  const activeTabObj = useMemo(() => WORKSPACE_TABS.find(t => t.id === currentTab), [currentTab]);
  
  const filteredTasks = useMemo(() => {
    if (!activeTabObj) return [];
    return uniqueAdminTasks.filter(t => activeTabObj.prefixes.includes(t.taskId));
  }, [uniqueAdminTasks, activeTabObj]);

  const resolveTaskForTab = useCallback((tabId) => {
    const targetTab = WORKSPACE_TABS.find(t => t.id === tabId);
    if (!targetTab) return null;

    const candidateTasks = targetTab.prefixes
      .map(taskId => uniqueAdminTasks.find(task => task.taskId === taskId))
      .filter(Boolean);

    return (
      candidateTasks.find(isTaskExecutable) ||
      candidateTasks[0] ||
      null
    );
  }, [uniqueAdminTasks]);

  const currentTaskMeta = useMemo(() => taskMetaById.get(activeTaskId), [taskMetaById, activeTaskId]);
  const currentResult = taskResults[activeTaskId];
  const isCurrentTaskLoading = loadingTasks.has(activeTaskId);
  const adminTaskGroups = useMemo(() => ({
    single: ADMIN_SINGLE_STUDENT_TASKS,
    comparison: ADMIN_COMPARISON_TASKS,
  }), []);

  useEffect(() => {
    if (isClassesLoading || !classes.length) return;
    const requestedClassId = searchParams.get("classId");
    if (requestedClassId && classes.some((item) => item.class_id === requestedClassId) && requestedClassId !== classId) {
      setSelectedClassId(requestedClassId);
      setSelectedStudentId("");
      setSelectedCompareStudentId("");
    }
  }, [classes, classId, isClassesLoading, searchParams]);

  useEffect(() => {
    if (
      appLoading ||
      isClassesLoading ||
      isStudentsLoading ||
      isAvailabilityLoading ||
      !activeDataset ||
      !availableTasksData ||
      !classes.length ||
      !students.length ||
      !uniqueAdminTasks.length
    ) {
      return;
    }

    const resolved = resolveAdminDashboardUrlState({
      routeTaskId,
      searchParams,
      tasks: uniqueAdminTasks,
      classes,
      students,
      tabs: WORKSPACE_TABS,
      defaultTaskId: ADMIN_BASIC_TASKS[0],
      taskGroups: adminTaskGroups,
      currentUrl: `${location.pathname}${location.search}`,
    });

    if (resolved.classId && resolved.classId !== classId) {
      setSelectedClassId(resolved.classId);
      setSelectedStudentId("");
      setSelectedCompareStudentId("");
      return;
    }
    if (resolved.taskId && resolved.taskId !== activeTaskId) setActiveTaskId(resolved.taskId);
    if (resolved.tabId && resolved.tabId !== currentTab) setCurrentTab(resolved.tabId);

    if (resolved.taskType === "comparison") {
      if (resolved.s1 && resolved.s1 !== primaryStudentId) setSelectedStudentId(resolved.s1);
      if (resolved.s2 && resolved.s2 !== secondaryStudentId) setSelectedCompareStudentId(resolved.s2);
    } else if (resolved.taskType === "single") {
      if (resolved.studentId && resolved.studentId !== primaryStudentId) setSelectedStudentId(resolved.studentId);
    }

    if (resolved.shouldReplaceUrl) navigate(resolved.canonicalUrl, { replace: true });
  }, [
    activeDataset,
    activeTaskId,
    adminTaskGroups,
    appLoading,
    availableTasksData,
    classId,
    classes,
    currentTab,
    isAvailabilityLoading,
    isClassesLoading,
    isStudentsLoading,
    location.pathname,
    location.search,
    navigate,
    primaryStudentId,
    routeTaskId,
    searchParams,
    secondaryStudentId,
    students,
    uniqueAdminTasks,
  ]);

  const handleTabChange = (tabId) => {
    setCurrentTab(tabId);

    const nextTask = resolveTaskForTab(tabId);
    if (!nextTask) return;

    const taskType = getAdminTaskType(nextTask.taskId, adminTaskGroups);
    setActiveTaskId(nextTask.taskId);
    navigate(buildAdminDashboardUrl({
      taskId: nextTask.taskId,
      classId,
      studentId: primaryStudentId,
      s1: primaryStudentId,
      s2: secondaryStudentId,
      taskType,
    }));
  };

  const handleTaskSelect = (taskId) => {
    setActiveTaskId(taskId);
    setAnalysisRunNonce((value) => value + 1);
    const taskType = getAdminTaskType(taskId, adminTaskGroups);
    navigate(buildAdminDashboardUrl({
      taskId,
      classId,
      studentId: primaryStudentId,
      s1: primaryStudentId,
      s2: secondaryStudentId,
      taskType,
    }));
  };

  const handleClassChange = (nextClassId) => {
    setSelectedClassId(nextClassId);
    setSelectedStudentId("");
    setSelectedCompareStudentId("");
    const taskType = getAdminTaskType(activeTaskId, adminTaskGroups);
    navigate(buildAdminDashboardUrl({
      taskId: activeTaskId,
      classId: nextClassId,
      taskType,
    }));
  };

  const handlePrimaryStudentChange = (nextStudentId) => {
    setSelectedStudentId(nextStudentId);
    const taskType = getAdminTaskType(activeTaskId, adminTaskGroups);
    const nextSecondaryId = taskType === "comparison" && secondaryStudentId === nextStudentId
      ? students.find((item) => item.student_id !== nextStudentId)?.student_id || ""
      : secondaryStudentId;
    if (taskType === "comparison" && nextSecondaryId !== secondaryStudentId) {
      setSelectedCompareStudentId(nextSecondaryId);
    }
    navigate(buildAdminDashboardUrl({
      taskId: activeTaskId,
      classId,
      studentId: nextStudentId,
      s1: nextStudentId,
      s2: nextSecondaryId,
      taskType,
    }));
  };

  const handleSecondaryStudentChange = (nextStudentId) => {
    setSelectedCompareStudentId(nextStudentId);
    navigate(buildAdminDashboardUrl({
      taskId: activeTaskId,
      classId,
      s1: primaryStudentId,
      s2: nextStudentId,
      taskType: "comparison",
    }));
  };

  const runActiveTask = useCallback(() => {
    if (ADMIN_BASIC_TASKS.includes(activeTaskId) || ADMIN_COHORT_TASKS.includes(activeTaskId)) {
      runTask(activeTaskId);
    } else if (ADMIN_SINGLE_STUDENT_TASKS.includes(activeTaskId)) {
      if (primaryStudentId) {
        runTask(activeTaskId, { student_id: primaryStudentId });
      }
    } else if (ADMIN_COMPARISON_TASKS.includes(activeTaskId)) {
      if (primaryStudentId && secondaryStudentId && primaryStudentId !== secondaryStudentId) {
        runTask(activeTaskId, { s1: primaryStudentId, s2: secondaryStudentId });
      }
    }
  }, [activeTaskId, primaryStudentId, runTask, secondaryStudentId]);

  useEffect(() => {
    if (!availableTasksData || !activeDataset?.id || !classId) return;
    if (!isTaskExecutable(currentTaskMeta)) return;
    setTaskResults({});
    runActiveTask();
  }, [
    availableTasksData,
    activeDataset?.id,
    classId,
    activeTaskId,
    analysisRunNonce,
    primaryStudentId,
    secondaryStudentId,
    currentTaskMeta,
    runActiveTask,
  ]);

  useEffect(() => {
    if (!filteredTasks.length || !availableTasksData) return;
    const activeTask = filteredTasks.find(t => t.taskId === activeTaskId);
    if (activeTask) return;

    const firstExecutable = filteredTasks.find(isTaskExecutable);
    if (firstExecutable) setActiveTaskId(firstExecutable.taskId);
    else setActiveTaskId(filteredTasks[0].taskId);
  }, [filteredTasks, activeTaskId, availableTasksData]);

  useEffect(() => {
    setSelectedStudentId("");
    setSelectedCompareStudentId("");
  }, [classId]);

  useEffect(() => {
    if (!appLoading && !activeDataset) {
      navigate("/data-selection", { replace: true });
    }
  }, [appLoading, activeDataset, navigate]);

  if (appLoading || !activeDataset || isClassesLoading || isStudentsLoading || isAvailabilityLoading) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isClassesError || isStudentsError || isAvailabilityError) {
    const message =
      classesQueryError?.message ||
      studentsQueryError?.message ||
      availabilityError?.message ||
      "Unable to load dashboard data.";

    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-red-100 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-bold text-red-700">Dashboard data could not be loaded</p>
          <p className="mt-2 text-xs text-slate-500">{message}</p>
          <button onClick={() => navigate("/data-selection")} className="mt-4 rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Switch Dataset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-fixed-layout h-screen max-h-screen bg-slate-100 p-3 flex flex-col overflow-hidden text-slate-700 font-sans">
      
      {/* Light Clean Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white rounded-t-xl border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold text-sm border border-blue-200">A</div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Admin Executive Report Canvas</h1>
            <p className="text-[10px] text-slate-500">Dataset: <span className="text-blue-600 font-semibold">{activeDataset.name}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={classId}
            onChange={(e) => handleClassChange(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            {classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.course_id} - {c.class_run} ({c.student_count} students)
              </option>
            ))}
          </select>
          <button onClick={() => navigate("/data-selection")} className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-3 py-1.5 transition-colors">Switch Dataset</button>
          <button onClick={() => navigate("/choose-role")} className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors">Switch Role</button>
        </div>
      </header>

      {/* Main Framework Grid */}
      <main className="flex-1 grid grid-cols-[340px_1fr] min-h-0 bg-white rounded-b-xl overflow-hidden shadow-sm border border-t-0 border-slate-200">
        
        {/* Left Control Side Panel */}
        <section className="border-r border-slate-200 flex flex-col min-h-0 bg-slate-50/50">
          
          {/* Category Tabs Menu Dropdown */}
          <div className="p-3 border-b border-slate-200 bg-white shrink-0">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Report Page / Analysis Category</label>
            <select
              value={currentTab}
              onChange={(e) => handleTabChange(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 font-semibold focus:outline-none focus:border-blue-500"
            >
              {WORKSPACE_TABS.map(tab => (
                <option key={tab.id} value={tab.id}>{tab.label}</option>
              ))}
            </select>
          </div>

          {/* Task Selection Rows Container */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1.5">
            {filteredTasks.map((task) => {
              const executable = isTaskExecutable(task);
              return (
                <button
                  key={task.taskId}
                  onClick={() => handleTaskSelect(task.taskId)}
                  disabled={!executable}
                  title={executable ? task.taskName : getDisabledReason(task)}
                  className={`w-full rounded-lg border p-2.5 text-left transition-all block disabled:cursor-not-allowed ${
                    activeTaskId === task.taskId
                      ? "border-blue-500 bg-blue-50/60 shadow-sm"
                      : executable
                        ? "border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50"
                        : "border-slate-100 bg-slate-50 opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <code className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-600 border border-blue-100">
                      {task.taskId}
                    </code>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-slate-800">{task.taskName}</p>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${getAvailabilityBadgeClass(task)}`}>
                          {getAvailabilityLabel(task)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400 truncate font-medium">{task.actionableQuestion}</p>
                      {!executable && (
                        <p className="mt-1 line-clamp-2 text-[10px] font-medium text-slate-500">{getDisabledReason(task)}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredTasks.length === 0 && (
              <div className="rounded-lg border border-slate-100 bg-white p-3 text-xs text-slate-400">
                No admin tasks are available for this dataset/class.
              </div>
            )}
          </div>

          {(ADMIN_SINGLE_STUDENT_TASKS.includes(activeTaskId) || ADMIN_COMPARISON_TASKS.includes(activeTaskId)) && (
          <div className="border-t border-slate-200 bg-white p-3 shrink-0 space-y-2">
            {ADMIN_SINGLE_STUDENT_TASKS.includes(activeTaskId) && (
              <div>
                  <span className="block text-[10px] text-slate-400 font-medium mb-1">Target Student ID</span>
                <select value={primaryStudentId} onChange={(e) => handlePrimaryStudentChange(e.target.value)} className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500">
                  {students.map(s => <option key={s.student_id} value={s.student_id}>{s.student_id}</option>)}
                </select>
              </div>
            )}

            {ADMIN_COMPARISON_TASKS.includes(activeTaskId) && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] text-slate-400 font-medium mb-1">Student 1 ID</span>
                  <select value={primaryStudentId} onChange={(e) => handlePrimaryStudentChange(e.target.value)} className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500">
                    {students.map(s => <option key={s.student_id} value={s.student_id}>{s.student_id}</option>)}
                  </select>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-medium mb-1">Student 2 ID</span>
                  <select value={secondaryStudentId} onChange={(e) => handleSecondaryStudentChange(e.target.value)} className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500">
                    {students.map(s => <option key={s.student_id} value={s.student_id}>{s.student_id}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
          )}
        </section>

        {/* Right Output Visual Area Canvas */}
        <section className="flex flex-col min-h-0 bg-slate-50 p-4">
          {currentTaskMeta ? (
            <div className="h-full flex flex-col min-h-0 space-y-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shrink-0 shadow-sm">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 mr-2">{currentTaskMeta.taskId}</span>
                <span className="text-sm font-bold text-slate-800">{currentTaskMeta.taskName}</span>
                <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-bold ${getAvailabilityBadgeClass(currentTaskMeta)}`}>
                  {getAvailabilityLabel(currentTaskMeta)}
                </span>
                <p className="text-xs text-slate-500 mt-1 font-medium">{currentTaskMeta.actionableQuestion}</p>
                {!isTaskExecutable(currentTaskMeta) && (
                  <p className="mt-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-500">
                    {getDisabledReason(currentTaskMeta)}
                  </p>
                )}
              </div>

              {/* Layout optimization: Grid with responsive columns, chart area takes up full space */}
              <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-3">
                
                {/* Chart Block Area Expanded */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col min-h-0 overflow-hidden shadow-sm">
                  <div className="flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
                    <ChartRenderer
                      taskMeta={currentTaskMeta}
                      datasets={currentResult?.datasets ?? null}
                      isLoading={isCurrentTaskLoading}
                      error={currentResult?.error ?? (!isTaskExecutable(currentTaskMeta) ? getDisabledReason(currentTaskMeta) : null)}
                    />
                  </div>
                </div>

                {/* AI Explanation Side Cards Panel */}
                <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 overflow-hidden shadow-sm">
                  <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"/>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">AI Narrative Analysis</h4>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 text-slate-600">
                    {currentResult?.datasets ? (
                      <AIInsightPanel
                        taskId={currentResult.taskId}
                        executionId={currentResult.executionId}
                        datasets={currentResult.datasets}
                        meta={currentResult.meta}
                        studentContext={null}
                      />
                    ) : (
                      <div className="text-xs text-slate-400 italic text-center pt-12">Awaiting processing pipeline execution output results...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">Select an administrative data node framework item from the sidebar registry.</div>
          )}
        </section>
      </main>
    </div>
  );
}
