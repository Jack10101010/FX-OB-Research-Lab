import React from "react";
import { IMPACT_SUMMARY as MOCK_IMPACT_SUMMARY } from "../mockData";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Compact two-line label+value cell used inside the sub-metric rows. */
function Stat({ label, value, colorClass = "text-[hsl(var(--text))]" }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab truncate">
        {label}
      </div>
      <div className={`font-num tabular-nums text-[12px] font-semibold leading-tight truncate ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

/** One of the three main columns — headline R + 2×2 sub-metrics. */
function RunCol({ eyebrow, netR, netRClass, stats, testId }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-[9.5px] font-ui uppercase tracking-[0.16em] font-semibold text-muted-lab mb-2">
        {eyebrow}
      </div>
      <div className={`font-num tabular-nums text-[2.1rem] font-bold leading-none mb-3 ${netRClass}`}>
        {netR}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
    </div>
  );
}

/** Delta column — headline + row-chip breakdown. */
function DeltaCol({ delta, testId }) {
  const netRPos = delta.netR >= 0;
  const wrPos   = delta.wr   >= 0;
  const pfPos   = delta.pf   != null && delta.pf >= 0;
  const ddPos   = delta.dd   >= 0;

  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-[9.5px] font-ui uppercase tracking-[0.16em] font-semibold text-muted-lab mb-2">
        Delta Impact
      </div>
      <div
        className={`font-num tabular-nums text-[2.1rem] font-bold leading-none mb-3 ${
          netRPos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"
        }`}
      >
        {netRPos ? "+" : ""}{delta.netR}R
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="row-chip row-chip-secondary">{Math.abs(delta.trades)} removed</span>
        <span className={`row-chip ${delta.losses_removed > 0 ? "row-chip-success" : "row-chip-secondary"}`}>
          {delta.losses_removed} losses out
        </span>
        <span className={`row-chip ${delta.winners_removed > 0 ? "row-chip-warning" : "row-chip-secondary"}`}>
          {delta.winners_removed} wins out
        </span>
        <span className={`row-chip ${wrPos ? "row-chip-success" : "row-chip-danger"}`}>
          ΔWR {wrPos ? "+" : ""}{delta.wr}%
        </span>
        {delta.pf != null && (
          <span className={`row-chip ${pfPos ? "row-chip-success" : "row-chip-danger"}`}>
            ΔPF {pfPos ? "+" : ""}{delta.pf}
          </span>
        )}
        <span className={`row-chip ${ddPos ? "row-chip-success" : "row-chip-danger"}`}>
          ΔDD {ddPos ? "+" : ""}{delta.dd}R
        </span>
      </div>
    </div>
  );
}

/** → / = separator shown only on lg+. */
function Divider({ char }) {
  return (
    <div className="hidden lg:flex items-center px-3 shrink-0 text-xl font-light text-muted-lab select-none">
      {char}
    </div>
  );
}

/** Original / Filtered segmented toggle. */
function PreviewToggle({ previewMode, setPreviewMode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:block text-[9.5px] font-ui uppercase tracking-[0.12em] text-muted-lab">
        Preview
      </span>
      <div className="inline-flex items-center gap-0.5 rounded p-0.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))]">
        {[
          { v: "original", label: "Original" },
          { v: "filtered", label: "Filtered" },
        ].map((o) => {
          const active = previewMode === o.v;
          return (
            <button
              key={o.v}
              onClick={() => setPreviewMode(o.v)}
              data-testid={`impact-preview-${o.v}`}
              className={[
                "px-2.5 py-1 text-[11px] font-medium font-ui rounded-sm transition-all",
                active
                  ? "bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                  : "text-muted-lab hover:text-[hsl(var(--text))]",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function RunImpactSummary({ previewMode, setPreviewMode, impactSummary, resultViewLabel }) {
  const { baseline, preview, delta } = impactSummary ?? MOCK_IMPACT_SUMMARY;
  const baselineEyebrow = resultViewLabel ?? "Current View";

  const baseNetRPos    = baseline.netR >= 0;
  const previewNetRPos = preview.netR  >= 0;

  return (
    <div
      className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] overflow-hidden"
      data-testid="run-impact-summary"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--border-soft))]">
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-ui uppercase tracking-[0.16em] font-semibold text-muted-lab">
            Run Impact Summary
          </span>
          <span className="row-chip row-chip-secondary">Live</span>
          {resultViewLabel && resultViewLabel !== "Baseline" && (
            <span className="row-chip row-chip-cyan">{resultViewLabel}</span>
          )}
        </div>
        <PreviewToggle previewMode={previewMode} setPreviewMode={setPreviewMode} />
      </div>

      {/* Body: Original → Filtered = Delta */}
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Original */}
        <div className="flex-1 min-w-0 px-4 py-3 lg:border-r lg:border-[hsl(var(--border-soft))]">
          <RunCol
            eyebrow={baselineEyebrow}
            netR={`${baseNetRPos ? "+" : ""}${baseline.netR}R`}
            netRClass={baseNetRPos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}
            stats={[
              { label: "Trades",   value: baseline.trades },
              { label: "Win Rate", value: `${baseline.wr}%` },
              { label: "PF",       value: baseline.pf ?? "∞" },
              { label: "Max DD",   value: `${baseline.dd}R`, colorClass: "text-[hsl(var(--danger))]" },
            ]}
            testId="impact-baseline"
          />
        </div>

        <Divider char="→" />

        {/* Filtered */}
        <div className="flex-1 min-w-0 px-4 py-3 lg:border-r lg:border-[hsl(var(--border-soft))]">
          <RunCol
            eyebrow="After Session Rules"
            netR={`${previewNetRPos ? "+" : ""}${preview.netR}R`}
            netRClass={previewNetRPos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}
            stats={[
              { label: "Trades",   value: preview.trades },
              { label: "Win Rate", value: `${preview.wr}%` },
              { label: "PF",       value: preview.pf ?? "∞" },
              { label: "Max DD",   value: `${preview.dd}R`, colorClass: "text-[hsl(var(--danger))]" },
            ]}
            testId="impact-preview"
          />
        </div>

        <Divider char="=" />

        {/* Delta */}
        <div className="flex-1 min-w-0 px-4 py-3">
          <DeltaCol delta={delta} testId="impact-delta" />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[hsl(var(--border-soft))] text-[10px] font-ui text-muted-lab">
        All times shown in UTC · Reflects current session rules and filters.
      </div>
    </div>
  );
}
