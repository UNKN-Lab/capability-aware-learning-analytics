/**
 * AdminConfirmModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * ĐÂY LÀ GÌ?
 *   Popup xác nhận dành riêng cho Admin ĐÃ TỪNG DÙNG hệ thống.
 *
 * TẠI SAO CẦN?
 *   Theo nguyên tắc UX "Re-entry": Khi Admin quay lại hệ thống, thay vì ép họ
 *   vào lại trang Data Selection (mất thời gian), hệ thống tự động gợi nhớ 
 *   dataset đang active và cho họ 2 lựa chọn:
 *   1. Tiếp tục làm việc với dataset hiện tại (Continue).
 *   2. Muốn đổi dataset khác (Choose Different).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { Modal } from "antd";

export default function AdminConfirmModal({
  isOpen,
  onClose,
  activeDataset,
  onContinue,
  onChangeDataset,
}) {
  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      footer={null}
      centered
      className="admin-confirm-modal"
      width={480}
    >
      <div className="text-center p-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 mb-6">
          <svg
            className="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back!</h3>
        <p className="text-gray-500 mb-6 text-base">
          The system is currently configured to use:
          <br />
          <strong className="text-gray-900 block mt-2 text-lg">
            {activeDataset?.name || "OULAD Dataset"}
          </strong>
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onContinue}
            className="w-full inline-flex justify-center rounded-xl border border-transparent bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Continue with Current Dataset
          </button>
          <button
            onClick={onChangeDataset}
            className="w-full inline-flex justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Choose a Different Dataset
          </button>
        </div>
      </div>
    </Modal>
  );
}
