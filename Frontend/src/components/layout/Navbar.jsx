// ─── Shared Navbar Component ──────────────────────────────────────────────────
// Used by: HomePage, RoleSelectionPage
// Props:
//   rightSlot  - optional JSX element rendered on the right side (e.g. back button)

function BookOpenIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export default function Navbar({ rightSlot }) {
  return (
    <nav className="
      desktop-shell desktop-shell--nav w-full
      flex-shrink-0 h-16 flex items-center justify-between
      relative z-50
    ">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white flex-shrink-0"
          style={{
            background: "linear-gradient(135deg,#10b981,#059669)",
            boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
          }}
        >
          <BookOpenIcon />
        </div>

        <div className="leading-none">
          <div className="text-[11px] font-bold tracking-[0.1em] text-gray-800 uppercase leading-tight hidden sm:block">
            Learning Analytics Dashboard
          </div>
          {/* Compact brand for very small screens */}
          <div className="text-[11px] font-bold tracking-[0.05em] text-gray-800 uppercase leading-tight sm:hidden">
            LA Dashboard
          </div>
          <div className="text-[10px] font-medium text-emerald-600 tracking-[0.04em]">
            AI-Assisted Data Analysis
          </div>
        </div>
      </div>

      {/* Right slot */}
      {rightSlot && (
        <div className="flex-shrink-0">
          {rightSlot}
        </div>
      )}
    </nav>
  );
}
