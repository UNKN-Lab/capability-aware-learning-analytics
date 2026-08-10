import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ── Lazy-loaded pages (code splitting — each route is its own JS chunk) ────────
const HomePage           = lazy(() => import("./pages/HomePage"));
const RoleSelectionPage  = lazy(() => import("./pages/RoleSelectionPage"));
const ImportPage         = lazy(() => import("./pages/ImportPage"));
const UploadStep         = lazy(() => import("./pages/import-steps/UploadStep"));
const ReviewStep         = lazy(() => import("./pages/import-steps/ReviewStep"));
const ConfirmStep        = lazy(() => import("./pages/import-steps/ConfirmStep"));
const CompleteStep       = lazy(() => import("./pages/import-steps/CompleteStep"));
const DataSelectionPage  = lazy(() => import("./pages/DataSelectionPage"));
const StudentDashboardPage = lazy(() => import("./pages/StudentDashboardPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AnalyticsWorkspace = lazy(() => import("./pages/AnalyticsWorkspace"));

// ── Minimal fallback shown while a lazy chunk loads ───────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        <span className="text-xs text-slate-400 font-medium tracking-wide">Loading...</span>
      </div>
    </div>
  );
}


/**
 * Main Application Component
 * Managed with React Router v6
 *
 * Flow: / (Home) → /choose-role → /import/upload → /import/review → /import/confirm → /import/complete
 */
export default function App() {
  return (
    <BrowserRouter>
      {/* Suspense wraps all lazy routes — shows PageLoader until chunk is ready */}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* 1. Homepage — Landing page */}
          <Route path="/" element={<HomePage />} />

          {/* 2. Choose Role */}
          <Route path="/choose-role" element={<RoleSelectionPage />} />

          {/* 3. Data Selection */}
          <Route path="/data-selection" element={<DataSelectionPage />} />

          {/* 4. Analytics Workspace (Phase 2 — task browsing + execution) */}
          <Route path="/analytics" element={<AnalyticsWorkspace />} />

          {/* 5. Dashboards */}
          <Route path="/student/dashboard" element={<StudentDashboardPage />} />
          <Route path="/student/dashboard/:taskId" element={<StudentDashboardPage />} />
          <Route path="/admin/dashboard"   element={<AdminDashboardPage />} />
          <Route path="/admin/dashboard/:taskId" element={<AdminDashboardPage />} />

          {/* 5. Import Workspace — Multi-step Flow */}
          <Route path="/import" element={<ImportPage />}>
            <Route index element={<Navigate to="upload" replace />} />
            <Route path="upload"  element={<UploadStep />} />
            <Route path="review"  element={<ReviewStep />} />
            <Route path="confirm" element={<ConfirmStep />} />
            <Route path="complete" element={<CompleteStep />} />
          </Route>

          {/* 6. Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
