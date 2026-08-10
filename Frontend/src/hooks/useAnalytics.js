/**
 * useAnalytics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook để chạy analytical task và quản lý state của kết quả.
 *
 * Dùng useMutation (không phải useQuery) vì:
 *   - Analytics execution là "action" (user click Run), không phải "data fetch"
 *   - Mỗi lần run có params khác nhau → không cache được như task list
 *   - Cần biết trạng thái: idle → pending → success/error
 *
 * Hook cung cấp:
 *   - run(taskId, params)  → trigger POST /api/analytics/run
 *   - result, meta         → parsed response khi thành công
 *   - isRunning, runError  → loading & error states
 *   - reset()              → clear kết quả cũ (khi user chọn task mới)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMutation } from "@tanstack/react-query";
import { runAnalyticsTask } from "../services/analyticsApi";

/**
 * @returns {{
 *   run: (taskId: string, params: Object) => void,
 *   result: Object | null,
 *   datasets: Object | null,
 *   meta: Object | null,
 *   executionId: string | null,
 *   isRunning: boolean,
 *   isSuccess: boolean,
 *   isError: boolean,
 *   runError: Error | null,
 *   reset: () => void,
 * }}
 */
export function useAnalytics() {
  const mutation = useMutation({
    mutationFn: ({ taskId, params }) => runAnalyticsTask(taskId, params),
  });

  return {
    // Action
    run: (taskId, params) => mutation.mutate({ taskId, params }),
    reset: mutation.reset,

    // Raw response
    result: mutation.data ?? null,

    // Parsed fields (convenience accessors)
    datasets: mutation.data?.datasets ?? null,
    meta: mutation.data?.meta ?? null,
    executionId: mutation.data?.executionId ?? null,

    // States
    isRunning: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    runError: mutation.error ?? null,
  };
}
