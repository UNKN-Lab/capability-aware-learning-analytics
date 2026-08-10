/**
 * persistenceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ĐÂY LÀ GÌ?
 *   Đây là lớp trung gian duy nhất được phép đọc/ghi localStorage trong toàn app.
 *   Không component hoặc hook nào được gọi localStorage trực tiếp — đều phải qua đây.
 *
 * TẠI SAO CẦN?
 *   1. Đóng gói key name: Thay đổi tên key chỉ cần sửa 1 chỗ (object KEYS bên dưới).
 *   2. Xử lý lỗi tập trung: JSON.parse có thể throw nếu dữ liệu bị corrupt.
 *      Thay vì try/catch ở mỗi component, xử lý 1 lần ở đây.
 *   3. Dễ mock trong testing: Chỉ cần mock module này là test được toàn bộ
 *      persistence logic mà không cần browser thật.
 *   4. Dễ migrate: Nếu sau này muốn chuyển sang IndexedDB hoặc sessionStorage
 *      → chỉ sửa file này, không đụng vào bất kỳ component nào.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const KEYS = {
  ACTIVE_DATASET: "app:activeDataset",
  IS_FIRST_USE: "app:isFirstUse",
};

//
// ActiveDataset: {
//   id:     string  — import_batch_id (e.g. "sess_abc__file_1") hoặc "OULAD" | "UCI"
//   name:   string  — Tên hiển thị (e.g. "My Dataset Apr 2026", "OULAD Dataset")
//   type:   "sample" | "imported"
//   source: "OULAD" | "UCI" | "CUSTOM"
//   setAt:  string  — ISO timestamp khi admin chọn dataset này
// }
//
// PersistedState: {
//   activeDataset: ActiveDataset | null
//   isFirstUse:    boolean
// }
// ──────────────────────────────────────────────────────────────────────────

/**
 * Đọc toàn bộ state đã lưu từ localStorage.
 *
 * Logic isFirstUse:
 *   - Key chưa tồn tại (null) → người dùng thực sự lần đầu → isFirstUse = true
 *   - Key = "false" → đã từng dùng → isFirstUse = false
 *   - Mọi giá trị khác → coi là lần đầu (an toàn hơn)
 *
 * @returns {PersistedState}
 */
export function loadPersistedState() {
  try {
    const rawDataset = localStorage.getItem(KEYS.ACTIVE_DATASET);
    const rawFirstUse = localStorage.getItem(KEYS.IS_FIRST_USE);

    return {
      activeDataset: rawDataset ? JSON.parse(rawDataset) : null,
      // null (key chưa tồn tại) → true; "false" → false; anything else → true
      isFirstUse: rawFirstUse !== "false",
    };
  } catch (error) {
    // Xảy ra khi: JSON bị corrupt, localStorage bị disabled (private mode một số browser)
    console.warn("[persistenceService] Failed to load persisted state:", error);
    return { activeDataset: null, isFirstUse: true };
  }
}

/**
 * Lưu activeDataset vào localStorage.
 * Nếu truyền null → xóa key (dọn dẹp khi reset).
 *
 * @param {ActiveDataset | null} dataset
 */
export function saveActiveDataset(dataset) {
  try {
    if (dataset) {
      localStorage.setItem(KEYS.ACTIVE_DATASET, JSON.stringify(dataset));
    } else {
      localStorage.removeItem(KEYS.ACTIVE_DATASET);
    }
  } catch (error) {
    // Xảy ra khi: localStorage đầy (quota exceeded)
    console.warn("[persistenceService] Failed to save activeDataset:", error);
  }
}

/**
 * Lưu trạng thái "đã từng dùng".
 * Chỉ có 1 chiều: true → false. Không bao giờ set lại thành true bằng tay.
 *
 * @param {boolean} isFirstUse
 */
export function saveFirstUseFlag(isFirstUse) {
  try {
    localStorage.setItem(KEYS.IS_FIRST_USE, String(isFirstUse));
  } catch (error) {
    console.warn("[persistenceService] Failed to save isFirstUse flag:", error);
  }
}

/**
 * Xóa toàn bộ state đã persist.
 * Dùng cho: nút "Reset" trong dev/debug, hoặc khi cần factory reset hệ thống.
 */
export function clearPersistedState() {
  try {
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn(
      "[persistenceService] Failed to clear persisted state:",
      error,
    );
  }
}
