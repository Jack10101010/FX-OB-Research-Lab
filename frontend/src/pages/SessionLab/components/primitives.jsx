import React from "react";

// -------------------- Color tokens (used as className strings) --------------------
export const C = {
  bg: "#050A12",
  panel: "#0D1520",
  card: "#121C29",
  cardSoft: "#172331",
  border: "#223142",
  borderSoft: "#2E4358",
  cyan: "#22D3EE",
  teal: "#14B8A6",
  green: "#22C55E",
  greenDeep: "#16A34A",
  red: "#EF4444",
  redSoft: "#F87171",
  amber: "#F59E0B",
  amberSoft: "#FBBF24",
  blue: "#3B82F6",
  blueSoft: "#60A5FA",
  purple: "#A855F7",
  purpleSoft: "#C084FC",
  text: "#E5EDF7",
  textDim: "#94A3B8",
  textMuted: "#64748B",
};

// -------------------- Panel --------------------
export function Panel({ className = "", children, selected = false, ...rest }) {
  return (
    <div
      {...rest}
      className={[
        "relative rounded-xl border bg-[#121C29]",
        "border-[#223142]",
        selected ? "card-glow border-[#22D3EE]" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

// -------------------- SectionLabel (uppercase eyebrow) --------------------
export function SectionLabel({ children, hint, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="label-eyebrow">{children}</span>
      {hint && <span className="text-[10px] text-[#64748B]">{hint}</span>}
    </div>
  );
}

// -------------------- Metric block --------------------
export function Metric({ label, value, tone = "default", sub, testId, big = false }) {
  const toneClass =
    tone === "pos"
      ? "text-[#22C55E]"
      : tone === "neg"
      ? "text-[#EF4444]"
      : tone === "cyan"
      ? "text-[#22D3EE]"
      : tone === "amber"
      ? "text-[#F59E0B]"
      : "text-[#E5EDF7]";
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="label-eyebrow">{label}</div>
      <div
        className={[
          "font-mono tabular leading-none",
          big ? "text-3xl md:text-4xl font-bold" : "text-xl md:text-2xl font-semibold",
          toneClass,
        ].join(" ")}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#64748B] mt-0.5">{sub}</div>}
    </div>
  );
}

// -------------------- Verdict pill --------------------
export function VerdictPill({ verdict }) {
  const styles = {
    strong:
      "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
    selective:
      "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
    avoid: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
  };
  const label = { strong: "Strong", selective: "Selective", avoid: "Avoid" };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] border ${styles[verdict]}`}
    >
      {label[verdict]}
    </span>
  );
}

// -------------------- Toggle Chip (small inline toggle for session card) --------------------
export function ToggleChip({ label, active, onClick, color = "cyan", testId }) {
  const palette = {
    cyan:   { on: "#22D3EE", bg: "rgba(34,211,238,0.12)" },
    green:  { on: "#22C55E", bg: "rgba(34,197,94,0.12)" },
    red:    { on: "#EF4444", bg: "rgba(239,68,68,0.12)" },
    blue:   { on: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
    purple: { on: "#A855F7", bg: "rgba(168,85,247,0.12)" },
    amber:  { on: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="group flex flex-col items-center gap-1.5 transition-all hover:opacity-90"
    >
      <span className="label-eyebrow text-[9px]">{label}</span>
      <span
        className="relative inline-flex h-5 w-9 items-center rounded-full border transition-all"
        style={{
          backgroundColor: active ? palette.bg : "rgba(34,49,66,0.5)",
          borderColor: active ? palette.on : "#223142",
        }}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all"
          style={{
            left: active ? "calc(100% - 18px)" : "2px",
            backgroundColor: active ? palette.on : "#64748B",
            boxShadow: active ? `0 0 8px ${palette.on}` : "none",
          }}
        />
      </span>
    </button>
  );
}

// -------------------- Tone helpers --------------------
export const toneOf = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "default");
export const fmtR = (v, digits = 1) => {
  if (typeof v !== "number") return v;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}R`;
};
export const fmtPct = (v, digits = 1) => {
  if (typeof v !== "number") return v;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
};

// -------------------- Sparkline (tiny inline SVG) --------------------
export function Sparkline({ data, color = "#22C55E", width = 110, height = 32 }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  const areaPts = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-grad-${color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#spark-grad-${color.replace("#", "")})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// -------------------- Split bar (Long vs Short) --------------------
export function SplitBar({ leftLabel, leftPct, leftColor, rightLabel, rightPct, rightColor, height = 6 }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between text-[10px] text-[#94A3B8] font-mono">
        <span>
          {leftLabel} {leftPct}%
        </span>
        <span>
          {rightLabel} {rightPct}%
        </span>
      </div>
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        <div style={{ width: `${leftPct}%`, backgroundColor: leftColor }} />
        <div style={{ width: `${rightPct}%`, backgroundColor: rightColor }} />
      </div>
    </div>
  );
}

// -------------------- Tone-colored arrow indicator --------------------
export function DeltaText({ value, suffix = "R", digits = 1, neutralZero = true }) {
  const positive = typeof value === "number" && value > 0;
  const negative = typeof value === "number" && value < 0;
  const cls = positive ? "text-[#22C55E]" : negative ? "text-[#EF4444]" : "text-[#94A3B8]";
  const prefix = positive ? "+" : "";
  return (
    <span className={`font-mono tabular ${cls}`}>
      {typeof value === "number" ? `${prefix}${value.toFixed(digits)}${suffix}` : value}
    </span>
  );
}
