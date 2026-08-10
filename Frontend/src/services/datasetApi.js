/**
 * datasetApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ĐÂY LÀ GÌ?
 *   Service layer cho tất cả API calls liên quan đến dataset management.
 *   Tách biệt khỏi importApi.js (import pipeline) vì 2 concern khác nhau:
 *     - importApi.js: Xử lý việc đưa dữ liệu vào hệ thống (write path)
 *     - datasetApi.js: Quản lý dataset đang active, lịch sử (read/config path)
 *
 * TRẠNG THÁI HIỆN TẠI: STUB
 *   Các function bên dưới đang trả về mock data hoặc giá trị tối thiểu.
 *   Phase 2 sẽ replace bằng fetch() thật đến backend.
 *   Lý do tạo stub ngay: AppContext cần import file này để compile được —
 *   nếu file không tồn tại, app crash ngay khi khởi động.
 *
 * CONTRACT (sẽ được implement đầy đủ ở Phase 2):
 *   getActiveDataset()              → GET /api/datasets/active
 *   setActiveDataset(dataset)       → POST /api/datasets/set-active
 *   getImportHistory()              → GET /api/datasets/history
 *   switchSampleDataset(name)       → POST /api/datasets/switch-sample
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

/**
 * Helper: Xử lý JSON response và ném lỗi rõ ràng nếu request thất bại.
 * Tương tự pattern đang dùng trong importApi.js (giữ nhất quán).
 */
async function handleJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid JSON response from server");
  }

  if (!response.ok) {
    console.error(`[datasetApi] ${response.status}:`, data);
    const error = new Error(data?.message || data?.error || "API request failed");
    error.status = response.status;
    error.response = data;
    throw error;
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// STUB IMPLEMENTATIONS (Phase 2 sẽ replace bằng fetch() thật)
// ─────────────────────────────────────────────────────────────────────────────

export async function getActiveDataset() {
  const response = await fetch(`${API_BASE}/datasets/active`);
  const data = await handleJsonResponse(response);
  return data.activeDataset || null;
}

export async function setActiveDataset(dataset) {
  const response = await fetch(`${API_BASE}/datasets/set-active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dataset),
  });
  return handleJsonResponse(response);
}

export async function getImportHistory() {
  const response = await fetch(`${API_BASE}/datasets/history`);
  const data = await handleJsonResponse(response);
  return data.history || [];
}

export async function switchSampleDataset(datasetName) {
  const response = await fetch(`${API_BASE}/datasets/switch-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset: datasetName }),
  });
  return handleJsonResponse(response);
}

export async function deleteDataset(datasetId) {
  const response = await fetch(`${API_BASE}/datasets/${datasetId}`, {
    method: "DELETE",
  });
  return handleJsonResponse(response);
}

export async function renameDataset(datasetId, newName) {
  const response = await fetch(`${API_BASE}/datasets/${datasetId}/rename`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName }),
  });
  return handleJsonResponse(response);
}

