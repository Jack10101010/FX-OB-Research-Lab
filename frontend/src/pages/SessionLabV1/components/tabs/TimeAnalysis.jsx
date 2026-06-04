import React, { useState } from "react";
import { SectionLabel, fmtR } from "../primitives";
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import { HOURLY_DATA, DAY_OF_WEEK, WR_HEATMAP } from "../../mockData";
import { Clock, Sun } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

const heatColor = (v) => {
  // 0 (cold/red) -> 50 (amber) -> 100 (green)
  if (v >= 75) return "#22C55E";
  if (v >= 60) return "#65A30D";
  if (v >= 45) return "#F59E0B";
  if (v >= 30) return "#F97316";
  return "#EF4444";
};

export default function TimeAnalysis() {
  const [view, setView] = useState("session"); // session | full

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[hsl(var(--text-2))]">Performance by hour and day of week.</p>
        <div className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-1">
          <button
            data-testid="time-view-session"
            onClick={() => setView("session")}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              view === "session" ? "bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
            ].join(" ")}
          >
            <Clock size={12} />
            Session Hours (07:00 – 10:00 UTC)
          </button>
          <button
            data-testid="time-view-full"
            onClick={() => setView("full")}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              view === "full" ? "bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
            ].join(" ")}
          >
            <Sun size={12} />
            Full Day (00:00 – 24:00 UTC)
          </button>
        </div>
      </div>

      {/* Top row: Hourly Net R + Heatmap + Day of Week */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.4fr_1fr] gap-4">
        {/* Hourly Net R */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Hourly Net R (UTC)</SectionLabel>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={HOURLY_DATA} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223142" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: "#64748B", fontSize: 8.5, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#223142" }} tickLine={false} angle={-15} dy={4} />
                <YAxis tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtR(v, 2), "Net R"]} />
                <Bar dataKey="netR" radius={[3, 3, 0, 0]}>
                  {HOURLY_DATA.map((d) => (
                    <Cell key={d.hour} fill={d.netR >= 0 ? "#22C55E" : "#EF4444"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmap */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Hourly Win Rate (%)</SectionLabel>
          <div className="space-y-1">
            <div className="grid grid-cols-[40px_repeat(6,1fr)] gap-1 text-[9px] font-num text-muted-lab uppercase tracking-wider">
              <div></div>
              {WR_HEATMAP.hours.map((h) => <div key={h} className="text-center">{h}</div>)}
            </div>
            {WR_HEATMAP.rows.map((row) => (
              <div key={row.day} className="grid grid-cols-[40px_repeat(6,1fr)] gap-1">
                <div className="text-[10px] font-num text-[hsl(var(--text-2))] flex items-center">{row.day}</div>
                {row.values.map((v, i) => (
                  <div
                    key={i}
                    className="h-7 rounded flex items-center justify-center text-[10px] font-num font-semibold text-[hsl(var(--bg))]"
                    style={{ backgroundColor: heatColor(v), opacity: 0.85 }}
                    title={`${row.day} ${WR_HEATMAP.hours[i]} – ${v}% WR`}
                  >
                    {v}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 mt-3 text-[9px] text-muted-lab font-num uppercase tracking-wider">
            <span>0%</span>
            <div className="h-2 w-32 rounded-full bg-gradient-to-r from-[#EF4444] via-[#F59E0B] to-[#22C55E]" />
            <span>100%</span>
          </div>
        </div>

        {/* Day of week */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Day of Week (Net R)</SectionLabel>
          <ul className="space-y-2">
            {DAY_OF_WEEK.map((d) => {
              const max = Math.max(...DAY_OF_WEEK.map((x) => Math.abs(x.netR)));
              const pct = (Math.abs(d.netR) / max) * 100;
              const positive = d.netR >= 0;
              return (
                <li key={d.day} className="grid grid-cols-[40px_1fr_60px] items-center gap-2 text-xs">
                  <span className="text-[hsl(var(--text-2))] font-num">{d.day}</span>
                  <div className="h-3 w-full bg-[hsl(var(--panel-2))] rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: positive ? "#22C55E" : "#EF4444",
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span className={`font-num text-right ${positive ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(d.netR, 2)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Hourly summary table */}
      <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
        <SectionLabel className="mb-3">Hourly Summary</SectionLabel>
        <div className="overflow-hidden rounded-md border border-[hsl(var(--border-soft))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--panel-2))] text-muted-lab uppercase tracking-wider text-[9px]">
                <th className="text-left px-3 py-2 font-medium">Hour (UTC)</th>
                <th className="text-right px-2 py-2 font-medium">Trades</th>
                <th className="text-right px-2 py-2 font-medium">Net R</th>
                <th className="text-right px-2 py-2 font-medium">Win Rate</th>
                <th className="text-right px-2 py-2 font-medium">PF</th>
                <th className="text-right px-2 py-2 font-medium">Avg R / Trade</th>
                <th className="text-right px-3 py-2 font-medium">Loss Rate</th>
              </tr>
            </thead>
            <tbody>
              {HOURLY_DATA.map((d) => (
                <tr key={d.hour} className="border-t border-[hsl(var(--border-soft))]/40 hover:bg-[hsl(var(--panel-2))]/40">
                  <td className="px-3 py-1.5 font-num text-[hsl(var(--text))]">{d.hour}</td>
                  <td className="px-2 py-1.5 font-num text-right text-[hsl(var(--text-2))]">{d.trades}</td>
                  <td className={`px-2 py-1.5 font-num text-right ${d.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(d.netR, 2)}</td>
                  <td className="px-2 py-1.5 font-num text-right text-[hsl(var(--text))]">{d.wr}%</td>
                  <td className="px-2 py-1.5 font-num text-right text-[hsl(var(--text))]">{d.pf}</td>
                  <td className={`px-2 py-1.5 font-num text-right ${d.avgR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(d.avgR, 2)}</td>
                  <td className="px-3 py-1.5 font-num text-right text-[#EF4444]">{d.loss}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-muted-lab font-num">Times shown in UTC. Only hours within the selected session are displayed.</p>
      </div>
    </div>
  );
}
