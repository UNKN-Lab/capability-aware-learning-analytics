
// Lấy Base URL từ file .env, sau đó nối thêm /import cho các endpoint của service này
const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api"}/import`;

/**
 * Helper to handle JSON responses and errors
 */
async function handleJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid JSON response from server");
  }

  if (!response.ok) {
    // Log lỗi chi tiết ra console để dễ debug
    console.error(`[API Error] ${response.status}:`, data);
    
    const error = new Error(data?.message || data?.error || "API request failed");
    error.response = data;
    error.status = response.status;
    throw error;
  }

  return data;
}

/**
 * 1. Profile Uploaded Files
 * Sử dụng XMLHttpRequest thay vì fetch để có thể theo dõi tiến trình upload (XHR upload.onprogress).
 * fetch API không hỗ trợ upload progress natively.
 *
 * @param {Object} params
 * @param {File[]} params.files - Danh sách file cần upload
 * @param {string} params.datasetName - Tên dataset
 * @param {string} params.sourceDataset - Loại source
 * @param {function(number): void} [params.onProgress] - Callback nhận % (0-100) khi upload tiến triển
 */
export function profileImport({ files, datasetName, sourceDataset, onProgress }) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();

    files.forEach((file) => formData.append("files", file));
    if (datasetName) formData.append("datasetName", datasetName);
    if (sourceDataset) formData.append("sourceDataset", sourceDataset);

    console.log(`[API] Profiling ${files.length} files...`);

    const xhr = new XMLHttpRequest();

    // Theo dõi tiến trình upload (bytes sent → %)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("Invalid JSON response from server"));
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        console.error(`[API Error] ${xhr.status}:`, data);
        const error = new Error(data?.message || data?.error || "API request failed");
        error.response = data;
        error.status = xhr.status;
        return reject(error);
      }

      resolve(data);
    };

    xhr.onerror = () => reject(new Error("Network error: could not reach the server."));
    xhr.onabort = () => reject(new Error("Upload was aborted."));

    xhr.open("POST", `${API_BASE_URL}/profile`);
    xhr.send(formData);
  });
}

/**
 * 2. Confirm Mapping for a specific file
 */
export async function confirmMapping({ sessionId, fileId, mappingConfig }) {
  console.log(`[API] Confirming mapping for file: ${fileId}`);

  const response = await fetch(`${API_BASE_URL}/confirm-mapping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, fileId, mappingConfig })
  });

  return handleJsonResponse(response);
}

/**
 * 3. Run Pipeline execution
 */
export async function runImport({ sessionId, options, fileIds }) {
  console.log(`[API] Triggering pipeline run for session: ${sessionId}`);

  const response = await fetch(`${API_BASE_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, fileIds, options })
  });

  return handleJsonResponse(response);
}