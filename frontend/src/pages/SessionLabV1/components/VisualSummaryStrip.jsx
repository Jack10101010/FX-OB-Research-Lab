import React from "react";
import { Panel, SectionLabel } from "./primitives";
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, LabelList,
} from "recharts";
import {
  NET_R_BY_SESSION,
  TRADES_BY_DIRECTION,
  TRADES_BY_STRUCTURE,
  TOP_ENTRY_MODEL,
} from "../mockData";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

export default function VisualSummaryStrip() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <NetRBySession />
      <TradesByDonut
        title="Trades by Direction"
        data={TRADES_BY_DIRECTION}
        total={27}
        legend={[
          { name: "Long", value: "18 (66.7%)", color: "#22C55E" },
          { name: "Short", value: "9 (33.3%)", color: "#EF4444" },
        ]}
        testId="trades-by-direction"
      />
      <TradesByDonut
        title="Trades by Structure"
        data={TRADES_BY_STRUCTURE}
        total={27}
        legend={[
          { name: "BOS", value: "17 (63.0%)", color: "#3B82F6" },
          { name: "CHoCH", value: "10 (37.0%)", color: "#A855F7" },
        ]}
        testId="trades-by-structure"
      />
      <TopEntryModel />
    </div>
  );
}

function NetRBySession() {
  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>Net R by Session</SectionLabel>
        <span className="text-[9px] text-[#64748B] font-mono uppercase tracking-wider">
          Filtered Preview
        </span>
      </div>
      <div className="h-44" data-testid="chart-net-r-by-session">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={NET_R_BY_SESSION} margin={{ top: 16, right: 8, bottom: 4, left: -16 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono" }}
              axisLine={{ stroke: "#223142" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "rgba(34,211,238,0.06)" }}
              contentStyle={tooltipStyle}
              labelStyle={{ color: "#94A3B8", fontSize: 10 }}
              formatter={(v) => [`${v > 0 ? "+" : ""}${v}R`, "Net R"]}
            />
            <Bar dataKey="netR" radius={[4, 4, 0, 0]}>
              {NET_R_BY_SESSION.map((d) => (
                <Cell
                  key={d.name}
                  fill={d.netR >= 0 ? "#22C55E" : "#EF4444"}
                  fillOpacity={0.85}
                />
              ))}
              <LabelList
                dataKey="netR"
                position="top"
                style={{ fill: "#E5EDF7", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                formatter={(v) => `${v > 0 ? "+" : ""}${v}R`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function TradesByDonut({ title, data, total, legend, testId }) {
  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="relative flex items-center gap-4" data-testid={testId}>
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={42}
                outerRadius={64}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono tabular text-2xl font-bold text-[#E5EDF7]">{total}</span>
            <span className="text-[9px] text-[#64748B] uppercase tracking-wider font-mono">Trades</span>
          </div>
        </div>
        <ul className="flex-1 space-y-2">
          {legend.map((l) => (
            <li key={l.name} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: l.color }}
              />
              <span className="text-[#E5EDF7] font-medium">{l.name}</span>
              <span className="ml-auto text-[#94A3B8] font-mono">{l.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function TopEntryModel() {
  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>Top Entry Model</SectionLabel>
        <span className="text-[9px] text-[#64748B] font-mono uppercase tracking-wider">
          By Net R
        </span>
      </div>
      <div className="h-44" data-testid="chart-top-entry">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={TOP_ENTRY_MODEL}
            layout="vertical"
            margin={{ top: 4, right: 28, bottom: 4, left: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" }}
              axisLine={false}
              tickLine={false}
              width={86}
            />
            <Tooltip
              cursor={{ fill: "rgba(34,211,238,0.06)" }}
              contentStyle={tooltipStyle}
              formatter={(v) => [`${v > 0 ? "+" : ""}${v}R`, "Net R"]}
            />
            <Bar dataKey="netR" radius={[4, 4, 4, 4]}>
              {TOP_ENTRY_MODEL.map((d) => (
                <Cell key={d.name} fill={d.netR >= 0 ? "#22C55E" : "#EF4444"} fillOpacity={0.85} />
              ))}
              <LabelList
                dataKey="netR"
                position="right"
                style={{ fill: "#E5EDF7", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                formatter={(v) => `${v > 0 ? "+" : ""}${v}R`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
