/**
 * useTaskRegistry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook để fetch và cache danh sách analytical tasks từ Task Registry.
 *
 * Sử dụng TanStack Query (react-query) thay vì useEffect + useState thủ công:
 *   - Auto-caching: tasks chỉ fetch 1 lần, cache 10 phút
 *   - Background refetch: khi tab focus lại (disabled vì tasks là static)
 *   - Loading/error states: built-in, không cần quản lý thủ công
 *   - Deduplication: nhiều component gọi hook này → chỉ 1 request
 *
 * Task Registry là static JSON (53 tasks) — gần như không bao giờ thay đổi
 * trong 1 session, nên staleTime = 10 phút là hợp lý.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useQuery } from "@tanstack/react-query";
import { fetchTasks, fetchTaskById } from "../services/analyticsApi";

const EMPTY_TASKS = [];

/**
 * Fetch task list with optional filters.
 *
 * @param {Object} [filters]
 * @param {string} [filters.scope]    — "student" | "class" | "cohort" | "comparison"
 * @param {string} [filters.dataset]  — "both" | "OULAD" | "UCI"
 * @param {string} [filters.search]   — keyword search
 * @param {string} [filters.analysis] — analysis type filter
 * @returns {{ tasks, count, isLoading, isError, error, refetch }}
 */
export function useTaskRegistry(filters = {}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    // queryKey includes filters → different filters = different cache entries
    queryKey: ["tasks", filters],
    queryFn: () => fetchTasks(filters),
    staleTime: 10 * 60 * 1000, // 10 min — tasks are static metadata
    placeholderData: { success: true, count: 0, tasks: [] },
  });

  return {
    tasks: data?.tasks ?? EMPTY_TASKS,
    count: data?.count ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * Fetch a single task's full metadata by ID.
 *
 * @param {string|null} taskId — Task ID to fetch. Pass null to skip.
 * @returns {{ task, isLoading, isError, error }}
 */
export function useTaskDetail(taskId) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTaskById(taskId),
    enabled: !!taskId, // Only fetch when taskId is truthy
    staleTime: 10 * 60 * 1000,
  });

  return {
    task: data?.task ?? null,
    isLoading,
    isError,
    error,
  };
}
