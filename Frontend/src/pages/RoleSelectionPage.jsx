import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import AdminConfirmModal from "../components/AdminConfirmModal";
import Navbar from "../components/layout/Navbar";
// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
function BookOpenIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
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

function GraduationCapIcon({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function ShieldIcon({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 4v5c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-4z" />
    </svg>
  );
}

function ArrowRightIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function BrainIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  );
}

function TrendingUpIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function TargetIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function AwardIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

function UsersIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BarChart3Icon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function SettingsIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="m4.93 4.93 2.83 2.83" />
      <path d="m16.24 16.24 2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="m4.93 19.07 2.83-2.83" />
      <path d="m16.24 7.76 2.83-2.83" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function CheckCircle2Icon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────
function RoleCard({ role, isHovered, onHover, onLeave, onClick }) {
  const Icon = role.id === "student" ? GraduationCapIcon : ShieldIcon;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
        className="w-full sm:flex-1 sm:min-w-[280px] sm:max-w-[510px]"
      style={{
        position: "relative",
        cursor: "pointer",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
        transform: isHovered ? "translateY(-6px)" : "translateY(0)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-8px",
          borderRadius: "30px",
          background: role.glow,
          filter: "blur(24px)",
          opacity: isHovered ? 1 : 0.55,
          transition: "opacity 0.25s ease",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          borderRadius: "22px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(10px)",
          border: isHovered
            ? `1.5px solid ${role.borderActive}`
            : "1px solid rgba(226,232,240,0.9)",
          boxShadow: isHovered
            ? "0 22px 50px rgba(15,23,42,0.12)"
            : "0 14px 32px rgba(15,23,42,0.08)",
          transition: "all 0.25s ease",
        }}
      >
        <div
          style={{
            height: "4px",
            background: role.headerGradient,
          }}
        />

        <div
          style={{
            padding: "var(--desktop-role-card-header-pad)",
            background: role.softBackground,
            borderBottom: "1px solid rgba(226,232,240,0.8)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "var(--desktop-role-card-header-gap)",
              marginBottom: "var(--desktop-role-card-header-margin)",
            }}
          >
            <div
              style={{
                width: "var(--desktop-role-card-icon-size)",
                height: "var(--desktop-role-card-icon-size)",
                borderRadius: "var(--desktop-role-card-icon-radius)",
                background: role.headerGradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                boxShadow: role.iconShadow,
                transform: isHovered ? "scale(1.06) rotate(4deg)" : "scale(1)",
                transition: "transform 0.25s ease",
              }}
            >
              <Icon size="var(--desktop-role-card-icon-glyph-size)" />
            </div>

            <div
              style={{
                padding: "var(--desktop-role-card-badge-pad)",
                borderRadius: "999px",
                fontSize: "var(--desktop-role-card-badge-size)",
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: role.badgeText,
                background: role.badgeBg,
                whiteSpace: "nowrap",
              }}
            >
              {role.tagline}
            </div>
          </div>

          <h2
            style={{
              fontSize: "var(--desktop-role-card-title-size)",
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 6px 0",
              letterSpacing: "-0.02em",
            }}
          >
            {role.label}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "var(--desktop-role-card-desc-size)",
              lineHeight: 1.62,
              color: "#475569",
              maxWidth: "440px",
            }}
          >
            {role.description}
          </p>
        </div>

        <div style={{ padding: "var(--desktop-role-card-body-pad)" }}>
          <div style={{ marginBottom: "12px" }}>
            {role.features.map((feature, index) => {
              const FeatureIcon = feature.icon;
              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--desktop-role-card-feature-gap)",
                    padding: "var(--desktop-role-card-feature-pad-y) 0",
                    borderBottom:
                      index === role.features.length - 1
                        ? "none"
                        : "1px solid #f1f5f9",
                  }}
                >
                  <div
                    style={{
                      width: "var(--desktop-role-card-feature-box-size)",
                      height: "var(--desktop-role-card-feature-box-size)",
                      borderRadius: "10px",
                      background: feature.bg,
                      color: feature.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FeatureIcon size="var(--desktop-role-card-feature-icon-size)" />
                  </div>

                  <span
                    style={{
                      fontSize: "var(--desktop-role-card-feature-text-size)",
                      color: "#334155",
                      lineHeight: 1.45,
                      fontWeight: 500,
                    }}
                  >
                    {feature.text}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              padding: "var(--desktop-role-card-button-pad)",
              border: "none",
              borderRadius: "14px",
              cursor: "pointer",
              background: role.headerGradient,
              color: "white",
              fontWeight: 600,
              fontSize: "var(--desktop-role-card-button-size)",
              boxShadow: role.buttonShadow,
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
              transform: isHovered ? "translateY(-1px)" : "translateY(0)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = role.buttonShadowHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = isHovered
                ? "translateY(-1px)"
                : "translateY(0)";
              e.currentTarget.style.boxShadow = role.buttonShadow;
            }}
          >
            Continue as {role.label}
            <ArrowRightIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ChooseRoleScreen ────────────────────────────────────────────────────
export default function ChooseRoleScreen() {
  const navigate = useNavigate();
  const [hoveredRole, setHoveredRole] = useState(null);
  
  const { isFirstUse, markAsUsed, activeDataset, isLoading } = useAppContext();
  const [showAdminConfirmModal, setShowAdminConfirmModal] = useState(false);

  const roles = useMemo(
    () => [
      {
        id: "student",
        label: "Student",
        tagline: "Personal Growth",
        description:
          "Access your personalized learning profile, monitor study progress, and receive AI-guided insights to improve your learning strategy.",
        accent: "#059669",
        accent2: "#2563eb",
        borderActive: "rgba(16,185,129,0.45)",
        badgeBg: "#d1fae5",
        badgeText: "#047857",
        softBackground:
          "linear-gradient(135deg, rgba(236,253,245,0.95), rgba(255,255,255,0.92))",
        headerGradient: "linear-gradient(135deg,#10b981,#059669)",
        glow: "radial-gradient(circle, rgba(16,185,129,0.18), rgba(16,185,129,0.02) 70%)",
        iconShadow: "0 10px 24px rgba(16,185,129,0.30)",
        buttonShadow: "0 8px 24px rgba(5,150,105,0.28)",
        buttonShadowHover: "0 12px 28px rgba(5,150,105,0.38)",
        stats: { users: "10,000+", rating: "4.8/5" },
        features: [
          {
            icon: BrainIcon,
            text: "AI-powered learning insights",
            bg: "#ecfdf5",
            color: "#059669",
          },
          {
            icon: TrendingUpIcon,
            text: "Track your progress over time",
            bg: "#eff6ff",
            color: "#2563eb",
          },
          {
            icon: TargetIcon,
            text: "Personalized recommendations",
            bg: "#f5f3ff",
            color: "#7c3aed",
          },
          {
            icon: AwardIcon,
            text: "Achievement and outcome tracking",
            bg: "#fffbeb",
            color: "#d97706",
          },
        ],
      },
      {
        id: "administrator",
        label: "Administrator",
        tagline: "Management Control",
        description:
          "Monitor cohort performance, analyze class-level learning behavior, and manage educational insights with a broader academic view.",
        accent: "#2563eb",
        accent2: "#0891b2",
        borderActive: "rgba(59,130,246,0.45)",
        badgeBg: "#dbeafe",
        badgeText: "#1d4ed8",
        softBackground:
          "linear-gradient(135deg, rgba(239,246,255,0.95), rgba(255,255,255,0.92))",
        headerGradient: "linear-gradient(135deg,#3b82f6,#2563eb)",
        glow: "radial-gradient(circle, rgba(59,130,246,0.18), rgba(59,130,246,0.02) 70%)",
        iconShadow: "0 10px 24px rgba(37,99,235,0.28)",
        buttonShadow: "0 8px 24px rgba(37,99,235,0.25)",
        buttonShadowHover: "0 12px 28px rgba(37,99,235,0.34)",
        stats: { users: "500+", rating: "4.9/5" },
        features: [
          {
            icon: UsersIcon,
            text: "Manage student cohorts",
            bg: "#eff6ff",
            color: "#2563eb",
          },
          {
            icon: BarChart3Icon,
            text: "Class-wide analytics dashboard",
            bg: "#ecfeff",
            color: "#0891b2",
          },
          {
            icon: SettingsIcon,
            text: "Configure learning models",
            bg: "#eef2ff",
            color: "#4f46e5",
          },
          {
            icon: CheckCircle2Icon,
            text: "Performance monitoring workflow",
            bg: "#eff6ff",
            color: "#1d4ed8",
          },
        ],
      },
    ],
    [],
  );

  const handleSelectRole = (role) => {
    console.log("[RoleSelection] select role", {
      role,
      isLoading,
      isFirstUse,
      activeDatasetId: activeDataset?.id ?? null,
    });

    if (isLoading) return; // Prevent clicks while initializing

    if (role === "student") {
      navigate("/student/dashboard");
      return;
    }

    // Role is Administrator
    if (isFirstUse) {
      markAsUsed();
      navigate("/data-selection");
    } else {
      setShowAdminConfirmModal(true);
    }
  };

  // Back button for Navbar right slot
  const backButton = (
    <button
      type="button"
      onClick={() => navigate("/")}
      className="border border-slate-300/90 bg-white/85 backdrop-blur text-slate-600 rounded-xl px-2.5 py-2 text-xs font-semibold cursor-pointer hover:bg-white transition-colors sm:px-3 sm:text-sm"
    >
      ← Home
    </button>
  );

  return (
    /*
     * Mobile/tablet  → min-h-screen, scrollable
     * Desktop (lg+)  → h-screen, overflow-hidden — fits 100vh
     */
    <div
      className="viewport-shell flex flex-col overflow-x-hidden"
      style={{ background: "linear-gradient(150deg,#f0fdf4 0%,#ffffff 55%,#eff6ff 100%)", position: "relative" }}
    >
      {/* Loading Overlay */}
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm transition-opacity duration-300 ${
          isLoading ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mb-4"></div>
        <p className="text-slate-600 font-medium tracking-wide animate-pulse">Initializing System...</p>
      </div>

      {/* Ambient glow orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[10%] left-[8%] w-[min(520px,60vw)] h-[min(520px,60vw)] rounded-full"
          style={{ background: "radial-gradient(circle,rgba(16,185,129,0.08),transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute top-[18%] -right-[6%] w-[min(620px,70vw)] h-[min(620px,70vw)] rounded-full"
          style={{ background: "radial-gradient(circle,rgba(59,130,246,0.06),transparent 70%)", filter: "blur(80px)" }} />
      </div>

      {/* ── NAVBAR ── */}
      <Navbar rightSlot={backButton} />

      {/*
       * Main content: fills remaining height on desktop (flex-1 + min-h-0),
       * centers vertically, allows y-scroll only if content is taller than
       * remaining space (rare on desktop, normal on mobile).
       */}
      <div className="relative z-[2] flex-1 min-h-0 w-full flex flex-col justify-center px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto">

        {/* Hero text */}
        <div className="text-center mb-3 sm:mb-4 lg:mb-3 flex-shrink-0" style={{ maxWidth: "800px", margin: "0 auto 1rem", width: "100%" }}>
          <h1
            className="font-bold leading-[1.12] tracking-tight text-center mb-2 sm:mb-2.5"
            style={{
              fontSize: "clamp(1.8rem, 3.2vw, 3rem)",
              letterSpacing: "-0.025em",
            }}
          >
            <span
              className="block"
              style={{
                background: "linear-gradient(90deg,#059669,#0d9488 50%,#2563eb)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Choose Your
            </span>
            <span className="block text-slate-900">
              Analytics Workspace
            </span>
          </h1>
          <p
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              textAlign: "center",
              fontSize: "clamp(0.85rem, 1.2vw, 0.95rem)",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            Continue as a student for personalized learning insights, or enter
            the administrator workspace to monitor broader class performance and
            engagement patterns.
          </p>
        </div>

        {/* Role Cards — stack on mobile, row on sm+ */}
        <div className="flex flex-col gap-3 items-stretch sm:flex-row sm:flex-wrap sm:justify-center sm:items-stretch sm:gap-4 lg:gap-4 flex-shrink-0">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              isHovered={hoveredRole === role.id}
              onHover={() => setHoveredRole(role.id)}
              onLeave={() => setHoveredRole(null)}
              onClick={() => handleSelectRole(role.id)}
            />
          ))}
        </div>
      </div>

      {/* Admin Confirm Modal */}
      <AdminConfirmModal
        isOpen={showAdminConfirmModal}
        onClose={() => setShowAdminConfirmModal(false)}
        activeDataset={activeDataset}
        onContinue={() => navigate("/admin/dashboard")}
        onChangeDataset={() => navigate("/data-selection")}
      />
    </div>
  );
}

