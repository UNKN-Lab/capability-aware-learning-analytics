/* eslint-disable no-unused-vars */
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
function ZapIcon({ size = 20 }) {
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
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ArrowRightIcon({ size = 20 }) {
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

function SparklesIcon({ size = 16 }) {
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
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M5 3l.9 2.4L8.3 6.3l-2.4.9L5 9.7l-.9-2.4L1.7 6.3l2.4-.9z" />
      <path d="M19 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
    </svg>
  );
}

function TargetIcon({ size = 12 }) {
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

function AwardIcon({ size = 12 }) {
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

function ClockIcon({ size = 12 }) {
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
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CheckCircle2Icon({ size = 12 }) {
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

function ActivityIcon({ size = 14 }) {
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
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

function BrainIcon({ size = 16 }) {
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
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}

// ─── Mini Donut Chart ─────────────────────────────────────────────────────────
function DonutChart({ value, color, label }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
          style={{ color }}
        >
          {value}%
        </span>
      </div>
      <span className="text-[10px] text-gray-500 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
function MiniBarChart() {
  const bars = [
    { day: "M", h: 55, color: "#10b981" },
    { day: "T", h: 75, color: "#10b981" },
    { day: "W", h: 40, color: "#10b981" },
    { day: "T", h: 85, color: "#059669" },
    { day: "F", h: 65, color: "#10b981" },
    { day: "S", h: 30, color: "#d1fae5" },
    { day: "S", h: 20, color: "#d1fae5" },
  ];
  const maxH = 56;
  return (
    <div className="flex items-end gap-1" style={{ height: `${maxH}px` }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-end gap-0.5 flex-1"
        >
          <div
            className="w-full rounded-sm"
            style={{
              height: `${Math.round((b.h / 100) * maxH)}px`,
              background: b.color,
            }}
          />
          <span className="text-[8px] text-gray-400">{b.day}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Grade Indicator ──────────────────────────────────────────────────────────
function GradeIndicator({ grade, label }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-[11px] text-gray-600 truncate pr-2">{label}</span>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
        {grade}
      </span>
    </div>
  );
}

// ─── 3D Browser Mockup ────────────────────────────────────────────────────────
function BrowserMockup() {
  const stats = [
    {
      label: "Effort Score",
      value: "75%",
      trend: "+5%",
      Icon: TargetIcon,
      colorClass: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Outcome Score",
      value: "85%",
      trend: "+12%",
      Icon: AwardIcon,
      colorClass: "text-blue-600 bg-blue-50",
    },
    {
      label: "Weekly Hours",
      value: "18h",
      trend: "+2h",
      Icon: ClockIcon,
      colorClass: "text-purple-600 bg-purple-50",
    },
    {
      label: "Completion",
      value: "92%",
      trend: "+8%",
      Icon: CheckCircle2Icon,
      colorClass: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <div className="relative w-full mx-auto" style={{ perspective: "1200px" }}>
      {/* Ambient glow */}
      <div
        className="absolute inset-0 rounded-3xl blur-3xl -z-10"
        style={{
          background:
            "linear-gradient(to right, rgba(52,211,153,0.2), rgba(96,165,250,0.2))",
          transform: "scale(0.95)",
        }}
      />

      {/* Browser frame */}
      <div
        className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white"
        style={{
          transform: "rotateX(2deg)",
          boxShadow:
            "0 40px 80px -20px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)",
        }}
      >
        {/* Browser chrome */}
        <div className="bg-gray-100 px-3 py-2 border-b border-gray-200 flex items-center gap-2 sm:px-4 sm:py-3 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 sm:w-3 sm:h-3" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 sm:w-3 sm:h-3" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 sm:w-3 sm:h-3" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-white border border-gray-300 rounded-md px-2 py-0.5 text-[10px] text-gray-400 flex items-center gap-1.5 w-40 sm:px-4 sm:py-1 sm:text-[11px] sm:w-72">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 sm:w-2 sm:h-2" />
              <span className="truncate">
                app.learninganalytics.io/dashboard
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gray-300/60" />
            <div className="w-4 h-4 rounded bg-gray-300/60" />
          </div>
        </div>

        {/* Dashboard content */}
        <div className="bg-gray-50 p-3 sm:p-5">
          {/* Inner navbar */}
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white sm:w-7 sm:h-7"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                <SparklesIcon size={12} />
              </div>
              <span className="text-xs font-semibold text-gray-800 sm:text-sm">
                Learning Analytics
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded-lg sm:px-3 sm:py-1 sm:text-[11px]">
                Dashboard
              </div>
              <div
                className="w-6 h-6 rounded-full sm:w-7 sm:h-7"
                style={{
                  background: "linear-gradient(135deg,#10b981,#3b82f6)",
                }}
              />
            </div>
          </div>

          {/* Summary cards – 2 cols on mobile, 4 on sm+ */}
          <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4 sm:gap-3 sm:mb-4">
            {stats.map(({ label, value, trend, Icon, colorClass }) => (
              <div
                key={label}
                className="bg-white rounded-xl p-2 border border-gray-100 shadow-sm sm:p-3"
              >
                <div className="flex items-center gap-1 mb-1 sm:gap-1.5 sm:mb-2">
                  <div className={`p-0.5 rounded-md ${colorClass} sm:p-1`}>
                    <Icon size={10} />
                  </div>
                  <span className="text-[9px] text-gray-500 sm:text-[10px]">
                    {label}
                  </span>
                </div>
                <div className="text-base font-bold text-gray-900 sm:text-lg">
                  {value}
                </div>
                <div className="text-[9px] text-emerald-600 font-medium sm:text-[10px]">
                  {trend}
                </div>
              </div>
            ))}
          </div>

          {/* Charts grid – stack on mobile, 12-col on sm+ */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:gap-3">
            <div className="sm:col-span-5 bg-white rounded-xl p-3 border border-gray-100 shadow-sm sm:p-4">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-[10px] font-semibold text-gray-700 sm:text-[11px]">
                  Weekly Study Hours
                </span>
                <BarChart3Icon />
              </div>
              <MiniBarChart />
            </div>

            <div className="sm:col-span-4 bg-white rounded-xl p-3 border border-gray-100 shadow-sm sm:p-4">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-[10px] font-semibold text-gray-700 sm:text-[11px]">
                  Time Allocation
                </span>
                <ActivityIcon />
              </div>
              <div className="flex items-center justify-around">
                <DonutChart value={75} color="#10b981" label="Active Study" />
                <DonutChart value={58} color="#3b82f6" label="Review" />
              </div>
            </div>

            <div className="sm:col-span-3 bg-white rounded-xl p-3 border border-gray-100 shadow-sm sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-gray-700 sm:text-[11px]">
                  Predicted Grades
                </span>
                <span className="text-emerald-500">
                  <TrendingUpIcon />
                </span>
              </div>
              <GradeIndicator grade="A+" label="Mathematics" />
              <GradeIndicator grade="B+" label="Physics" />
              <GradeIndicator grade="A" label="CompSci" />
              <GradeIndicator grade="B" label="History" />
            </div>
          </div>

          {/* AI Insight bar */}
          <div
            className="mt-2 flex items-center gap-2 rounded-xl p-2 border border-emerald-100 sm:mt-3 sm:gap-3 sm:p-3"
            style={{
              background: "linear-gradient(to right, #ecfdf5, #eff6ff)",
            }}
          >
            <div
              className="p-1.5 rounded-lg text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              <BrainIcon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-gray-800 sm:text-[11px]">
                AI Insight · HIGH EFFORT / HIGH OUTCOME
              </div>
              <div className="text-[9px] text-gray-500 truncate sm:text-[10px]">
                Your strategy is working — maintain consistency and optimize
                review cycles
              </div>
            </div>
            <div className="px-2 py-1 bg-emerald-600 text-white text-[9px] rounded-lg font-medium cursor-default flex-shrink-0 sm:text-[10px]">
              View Report
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Floating Badge ───────────────────────────────────────────────────────────
function FloatingBadge({ Icon, label, color, delay = "0s" }) {
  return (
    <div
      className="bg-white rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg border"
      style={{
        borderColor:
          color === "emerald" ? "rgba(16,185,129,0.2)" : "rgba(59,130,246,0.2)",
        animation: "bounce 1.5s infinite",
        animationDelay: delay,
      }}
    >
      <Icon size={14} color={color === "emerald" ? "#059669" : "#2563eb"} />
      <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// ─── Main HomePage ────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();

  return (
    /*
     * Desktop (lg+): h-screen + overflow-hidden — must fit 100vh
     * Mobile/tablet : min-h-screen, scrollable
     */
    <div
      className="viewport-shell flex flex-col overflow-x-hidden"
      style={{
        background:
          "linear-gradient(150deg,#d1fae5 0%,#f8faff 45%,#dbeafe 100%)",
      }}
    >
      {/* ── Ambient glows ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-[15%] left-[5%] w-[min(700px,70vw)] h-[min(700px,70vw)] rounded-full"
          style={{
            background:
              "radial-gradient(circle,rgba(16,185,129,0.22),transparent 65%)",
            filter: "blur(70px)",
          }}
        />
        <div
          className="absolute top-[10%] -right-[8%] w-[min(750px,75vw)] h-[min(750px,75vw)] rounded-full"
          style={{
            background:
              "radial-gradient(circle,rgba(59,130,246,0.18),transparent 65%)",
            filter: "blur(90px)",
          }}
        />
        <div
          className="absolute bottom-[-5%] left-[25%] w-[min(500px,50vw)] h-[min(500px,50vw)] rounded-full"
          style={{
            background:
              "radial-gradient(circle,rgba(139,92,246,0.1),transparent 65%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* ── NAVBAR ── */}
      <Navbar />

      {/*
       * Content area — flex-1, centered vertically.
       * KHÔNG dùng overflow-hidden hay h-screen vì sẽ cắt nội dung
       * khi viewport ngắn hơn (nhiều tab, bookmark bar, v.v.)
       * Thay vào đó dùng min-h-screen + scroll tự nhiên.
       */}
      <div
        className="
        desktop-shell
        relative z-10
        flex-1 min-h-0
        flex flex-col items-center desktop-flow-center
        gap-1.5
        pb-2 pt-1
      "
      >
        {/* ── Headline ── */}
        <h1
          className="font-bold text-center text-slate-900 leading-[1.15] tracking-tight flex-shrink-0"
          style={{
            fontSize: "clamp(1.8rem, 3.5vw, 3.2rem)",
            letterSpacing: "-0.025em",
          }}
        >
          <span className="block">Master Your</span>
          <span
            className="block"
            style={{
              background: "linear-gradient(90deg,#059669,#0d9488 50%,#2563eb)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              paddingBottom: "0.08em",
            }}
          >
            Study Flow
          </span>
          <span className="block">with AI Insights</span>
        </h1>

        {/* ── Subtitle ── */}
        <p
          className="text-slate-500 text-center max-w-[560px] leading-relaxed flex-shrink-0"
          style={{
            fontSize: "var(--desktop-body-text-size)",
            lineHeight: "1.5",
          }}
        >
          Unlock your learning potential with powerful analytics. Analyze your
          study habits based on real data to optimize your path to graduation.
        </p>

        {/* ── CTA ── */}
        <div className="flex-shrink-0">
          <button
            id="start-analysis-btn"
            onClick={() => navigate("/choose-role")}
            className="inline-flex items-center gap-2 rounded-xl border-none cursor-pointer text-white font-semibold"
            style={{
              padding:
                "var(--desktop-button-pad-y) var(--desktop-button-pad-x)",
              fontSize: "var(--desktop-button-text-size)",
              background: "linear-gradient(135deg,#059669,#047857)",
              boxShadow: "0 6px 20px rgba(5,150,105,0.35)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 10px 28px rgba(5,150,105,0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow =
                "0 6px 20px rgba(5,150,105,0.35)";
            }}
          >
            <ZapIcon size={15} />
            Start Your Analysis
            <ArrowRightIcon size={15} />
          </button>
        </div>

        <div className="desktop-shell--hero relative w-full flex-shrink-0 mt-2 sm:mt-3">
          {/* Clipped mockup */}
          <div
            className="overflow-hidden rounded-2xl"
            style={{ maxHeight: "var(--desktop-mockup-max-height)" }}
          >
            <BrowserMockup />
          </div>

          {/* Floating badges — outside clip, always overlap bottom edge */}
          <div
            className="
            relative -mt-2 flex justify-between px-2 pointer-events-none
            sm:-mt-3 sm:px-4
            lg:-mt-3 lg:px-6
          "
          >
            <FloatingBadge
              Icon={CheckCircle2Icon}
              label="Personalized Insights"
              color="emerald"
              delay="0s"
            />
            <FloatingBadge
              Icon={BrainIcon}
              label="AI-Powered Analysis"
              color="blue"
              delay="0.4s"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
