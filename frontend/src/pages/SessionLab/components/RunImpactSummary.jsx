import React from "react";
import { Panel, SectionLabel, Metric, DeltaText, fmtR, fmtPct } from "./primitives";
import { ArrowRight, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { IMPACT_SUMMARY } from "../mockData";

const Col = ({ label, accent, children, testId }) => (
  <div
    className={[
      "relative rounded-lg p-4 md:p-5 border bg-gradient-to-b",
      accent === "baseline"
        ? "from-[#172331] to-[#121C29] border-[#223142]"
        : accent === "preview"
        ? "from-[#0F2A33] to-[#0D1520] border-[#22D3EE]/40"
        : "from-[#102117] to-[#0D1520] border-[#22C55E]/30",
    ].join(" ")}
    data-testid={testId}
  >
    <div className="label-eyebrow mb-2">{label}</div>
    {children}
  </div>
);

export default function RunImpactSummary({ previewMode, setPreviewMode }) {
  const { baseline, preview, delta } = IMPACT_SUMMARY;

  return (
    <Panel className="p-5 md:p-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <SectionLabel>Run Impact Summary</SectionLabel>
          <span className="rounded-full bg-[#22D3EE]/10 text-[#22D3EE] text-[10px] font-semibold px-2 py-0.5 border border-[#22D3EE]/30 uppercase tracking-wider">
            Live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">Preview Mode</span>
          <div className="inline-flex items-center gap-1 rounded-lg border border-[#223142] bg-[#0D1520] p-1">
            {[
              { v: "original", label: "Original Run" },
              { v: "filtered", label: "Filtered Preview" },
            ].map((o) => {
              const active = previewMode === o.v;
              return (
                <button
                  key={o.v}
                  onClick={() => setPreviewMode(o.v)}
                  data-testid={`impact-preview-${o.v}`}
                  className={[
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    active
                      ? "bg-[#22D3EE]/15 text-[#22D3EE]"
                      : "text-[#94A3B8] hover:text-[#E5EDF7]",
                  ].join(" ")}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-4">
        {/* Baseline */}
        <Col label="ORIGINAL RUN (BASELINE)" accent="baseline" testId="impact-baseline">
          <div className="font-display text-5xl md:text-6xl font-bold tabular leading-none text-[#22C55E]">
            +{baseline.netR}R
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
            <SmallStat label="Trades" value={baseline.trades} />
            <SmallStat label="WR" value={`${baseline.wr}%`} />
            <SmallStat label="PF" value={baseline.pf} />
            <SmallStat label="Max DD" value={`${baseline.dd}R`} tone="neg" />
          </div>
        </Col>

        <div className="hidden lg:flex items-center justify-center text-[#22D3EE]">
          <ArrowRight size={28} />
        </div>

        {/* Preview */}
        <Col label="CURRENT FILTERED PREVIEW" accent="preview" testId="impact-preview">
          <div className="font-display text-5xl md:text-6xl font-bold tabular leading-none text-[#22D3EE]">
            +{preview.netR}R
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
            <SmallStat label="Trades" value={preview.trades} />
            <SmallStat label="WR" value={`${preview.wr}%`} />
            <SmallStat label="PF" value={preview.pf} />
            <SmallStat label="Max DD" value={`${preview.dd}R`} tone="neg" />
          </div>
        </Col>

        <div className="hidden lg:flex items-center justify-center text-[#94A3B8]">
          <span className="text-2xl font-light">=</span>
        </div>

        {/* Delta */}
        <Col label="DELTA (PREVIEW − BASELINE)" accent="delta" testId="impact-delta">
          <div className="font-display text-5xl md:text-6xl font-bold tabular leading-none text-[#22C55E]">
            +{delta.netR}R
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <SmallStat label="ΔTrades" value="+8" tone="pos" />
            <SmallStat label="ΔWR" value={`+${delta.wr}%`} tone="pos" />
            <SmallStat label="ΔPF" value={`+${delta.pf}`} tone="pos" />
            <SmallStat label="ΔDD" value={`+${delta.dd}R`} tone="pos" />
            <SmallStat label="Losses out" value={delta.losses_removed} tone="pos" />
            <SmallStat label="Winners out" value={delta.winners_removed} tone="neg" />
          </div>
        </Col>
      </div>

      {/* Bottom hint */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
        <Info size={12} className="text-[#3B82F6]" />
        <span>These results reflect your current session rules and filters below.</span>
        <span className="text-[#E5EDF7] font-medium">All times shown in UTC.</span>
        <span className="ml-auto inline-flex items-center gap-3">
          <ChipStat icon={TrendingUp} color="#22C55E" label="Trades Removed" value={Math.abs(delta.trades)} />
          <ChipStat icon={TrendingUp} color="#22C55E" label="Net R Saved" value={`+${delta.netR}R`} />
          <ChipStat icon={Minus} color="#22D3EE" label="WR Change" value={`+${delta.wr}%`} />
        </span>
      </div>
    </Panel>
  );
}

function SmallStat({ label, value, tone = "default" }) {
  const cls =
    tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : "text-[#E5EDF7]";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-[#64748B] font-mono">
        {label}
      </span>
      <span className={`font-mono tabular text-sm font-semibold ${cls}`}>{value}</span>
    </div>
  );
}

function ChipStat({ icon: Icon, color, label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#223142] bg-[#0D1520] px-2.5 py-1">
      <Icon size={10} style={{ color }} />
      <span className="text-[10px] text-[#64748B] uppercase tracking-wider">{label}</span>
      <span className="text-[11px] font-mono font-semibold" style={{ color }}>
        {value}
      </span>
    </span>
  );
}
