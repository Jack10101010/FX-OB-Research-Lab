import React from "react";
import { SectionLabel, fmtR } from "../primitives";
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, LabelList,
  PieChart, Pie,
} from "recharts";
import { OB_DATA } from "../../mockData";
import { Info } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

function HBars({ data, title, testId }) {
  return (
    <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>{title}</SectionLabel>
        <span className="text-[9px] text-[#64748B] font-mono uppercase tracking-wider">By Net R</span>
      </div>
      <div className="h-56" data-testid={testId}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="session"
              type="category"
              tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" }}
              axisLine={false}
              tickLine={false}
              width={86}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtR(v, 2), "Net R"]} />
            <Bar dataKey="netR" radius={[3, 3, 3, 3]}>
              {data.map((d) => (
                <Cell key={d.session} fill={d.netR >= 0 ? "#22C55E" : "#EF4444"} fillOpacity={0.85} />
              ))}
              <LabelList
                dataKey="netR"
                position="right"
                style={{ fill: "#E5EDF7", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                formatter={(v) => fmtR(v, 2)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BucketTable({ title, items, valueLabel = "Net R" }) {
  return (
    <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
      <SectionLabel className="mb-3">{title}</SectionLabel>
      <div className="overflow-hidden rounded-md border border-[#223142]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#172331] text-[#64748B] uppercase tracking-wider text-[9px]">
              <th className="text-left px-3 py-2 font-medium">Bucket</th>
              <th className="text-right px-2 py-2 font-medium">Trades</th>
              <th className="text-right px-2 py-2 font-medium">%</th>
              <th className="text-right px-3 py-2 font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.bucket} className="border-t border-[#223142]/40 hover:bg-[#172331]/40">
                <td className="px-3 py-1.5 text-[#E5EDF7] font-mono">{b.bucket}</td>
                <td className="px-2 py-1.5 font-mono text-right text-[#94A3B8]">{b.trades}</td>
                <td className="px-2 py-1.5 font-mono text-right text-[#94A3B8]">{b.pct}%</td>
                <td className={`px-3 py-1.5 font-mono text-right ${b.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(b.netR, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OrderBlockLab() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#94A3B8]">OB origin, detection and quality analysis.</p>
        <div className="flex items-center gap-2 rounded-md border border-[#F59E0B]/30 bg-[#F59E0B]/8 px-3 py-1.5">
          <Info size={12} className="text-[#F59E0B]" />
          <span className="text-[10px] text-[#F59E0B] font-mono uppercase tracking-wider">
            OB fields require re-import for legacy runs
          </span>
        </div>
      </div>

      {/* Row 1: Origin + Detection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HBars data={OB_DATA.origin} title="OB Origin Session" testId="ob-origin-chart" />
        <HBars data={OB_DATA.detection} title="OB Detection Session" testId="ob-detection-chart" />
      </div>

      {/* Row 2: News vs Clean + OB Width + meta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* News vs Clean */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
          <SectionLabel className="mb-3">News vs Clean OBs</SectionLabel>
          <div className="flex items-center gap-4">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={OB_DATA.newsClean} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                    {OB_DATA.newsClean.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-mono tabular text-2xl font-bold text-[#E5EDF7]">27</span>
                <span className="text-[9px] text-[#64748B] uppercase tracking-wider font-mono">Total OBs</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2 text-xs">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#F59E0B]" />
                <span className="text-[#E5EDF7] font-medium">News OB</span>
                <span className="ml-auto text-[#94A3B8] font-mono">9 (33.3%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#22C55E]" />
                <span className="text-[#E5EDF7] font-medium">Clean OB</span>
                <span className="ml-auto text-[#94A3B8] font-mono">18 (66.7%)</span>
              </li>
            </ul>
          </div>
        </div>

        <BucketTable title="OB Width (ATR)" items={OB_DATA.width} />

        {/* Meta stats */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4 flex flex-col gap-4">
          <SectionLabel>Quality Snapshot</SectionLabel>
          <div className="space-y-4">
            <MiniStat label="Avg OB Width" value={OB_DATA.meta.avgWidth} tone="cyan" />
            <MiniStat label="OB Fill Rate" value={OB_DATA.meta.fillRate} tone="pos" />
            <MiniStat label="OB Success Rate" value={OB_DATA.meta.successRate} tone="amber" />
          </div>
        </div>
      </div>

      {/* Row 3: OB Age + Success metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BucketTable title="OB Age at Entry" items={OB_DATA.age} />

        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
          <SectionLabel className="mb-3">OB Success Rate by Type</SectionLabel>
          <ul className="space-y-2.5">
            {[
              { name: "BOS OB",   wr: 68, color: "#3B82F6" },
              { name: "CHoCH OB", wr: 42, color: "#A855F7" },
              { name: "News OB",  wr: 33, color: "#F59E0B" },
              { name: "Wide OB",  wr: 27, color: "#EF4444" },
              { name: "Old OB",   wr: 39, color: "#94A3B8" },
            ].map((r) => (
              <li key={r.name} className="grid grid-cols-[120px_1fr_50px] items-center gap-3 text-xs">
                <span className="text-[#E5EDF7] font-mono">{r.name}</span>
                <div className="h-3 w-full bg-[#172331] rounded-sm overflow-hidden">
                  <div className="h-full" style={{ width: `${r.wr}%`, backgroundColor: r.color, opacity: 0.85 }} />
                </div>
                <span className="font-mono text-right text-[#E5EDF7]">{r.wr}% WR</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : tone === "cyan" ? "text-[#22D3EE]" : tone === "amber" ? "text-[#F59E0B]" : "text-[#E5EDF7]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-mono tabular text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
