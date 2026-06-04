import React from "react";
import { Panel, SectionLabel, fmtR } from "./primitives";
import { SESSION_IMPACT_CARDS } from "../mockData";
import { Info } from "lucide-react";

function ImpactCard({ data }) {
  const m = data.metrics;
  const d = data.deltas;

  const rows = [
    { label: "Net R",  value: typeof m.netR === "number" ? `+${m.netR}R` : m.netR,  delta: `Δ ${fmtR(d.netR, 1)}`, deltaPos: typeof d.netR === "number" && d.netR > 0 },
    { label: "Trades", value: m.trades, delta: `Δ ${d.trades}`, deltaPos: typeof d.trades === "number" && d.trades > 0 },
    { label: "WR",     value: `${m.wr}%`, delta: `Δ +${d.wr}%`, deltaPos: typeof d.wr === "number" && d.wr > 0 },
    { label: "PF",     value: m.pf, delta: `Δ ${typeof d.pf === "string" ? d.pf : `+${d.pf}`}`, deltaPos: true },
    { label: "Max DD", value: `${m.dd}R`, delta: `Δ +${d.dd}R`, deltaPos: true },
  ];

  return (
    <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
      <div className="label-eyebrow mb-3">{data.scenario}</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-3">
        {rows.map((r) => (
          <Metric key={r.label} label={r.label} value={r.value} delta={r.delta} deltaPos={r.deltaPos} />
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, delta, deltaPos }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] text-[#64748B] uppercase tracking-wider font-mono truncate">{label}</div>
      <div className="font-mono tabular text-sm font-bold text-[#E5EDF7] truncate">{value}</div>
      <div className={`text-[10px] font-mono mt-0.5 truncate ${deltaPos ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{delta}</div>
    </div>
  );
}

export default function ImpactOnRun() {
  return (
    <Panel className="p-4" data-testid="impact-on-run">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="font-display text-base font-bold text-[#E5EDF7]">Impact of This Session</span>
          <span className="text-[10px] text-[#64748B] font-mono uppercase tracking-wider">What-if scenarios</span>
        </div>
      </div>

      <div className="space-y-3">
        {SESSION_IMPACT_CARDS.map((c) => (
          <ImpactCard key={c.scenario} data={c} />
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-[#3B82F6]/30 bg-[#3B82F6]/8 p-3 text-[11px]">
        <Info size={13} className="text-[#3B82F6] mt-0.5 shrink-0" />
        <div>
          <div className="text-[#60A5FA] font-medium">Changes above update preview metrics in real time.</div>
          <div className="text-[#94A3B8] mt-0.5">Use this to test ideas and discover what truly drives your edge.</div>
        </div>
      </div>
    </Panel>
  );
}
