import React from "react";
import { SectionLabel } from "./primitives";
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, LabelList,
} from "recharts";
import {
  NET_R_BY_SESSION     as MOCK_NET_R_BY_SESSION,
  TRADES_BY_DIRECTION  as MOCK_TRADES_BY_DIRECTION,
  TRADES_BY_STRUCTURE  as MOCK_TRADES_BY_STRUCTURE,
  TOP_ENTRY_MODEL      as MOCK_TOP_ENTRY_MODEL,
} from "../mockData";

const tooltipStyle = {
  backgroundColor: "hsl(221 47% 11%)",
  border: "1px solid hsl(214 30% 20%)",
  borderRadius: 3,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

function Card({ children, className = "", testId }) {
  return (
    <div
      data-testid={testId}
      className={`rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export default function VisualSummaryStrip({ visualData, sessionVisualData }) {
  const netRBySession     = visualData?.netRBySession ?? MOCK_NET_R_BY_SESSION;
  const tradesByDirection = sessionVisualData?.tradesByDirection ?? visualData?.tradesByDirection ?? MOCK_TRADES_BY_DIRECTION;
  const tradesByStructure = sessionVisualData?.tradesByStructure ?? visualData?.tradesByStructure ?? MOCK_TRADES_BY_STRUCTURE;
  const topEntryModel     = sessionVisualData?.topEntryModel     ?? visualData?.topEntryModel     ?? MOCK_TOP_ENTRY_MODEL;

  // Compute totals + legend dynamically from data arrays
  const dirTotal  = tradesByDirection.reduce((s, d) => s + d.value, 0);
  const dirLegend = tradesByDirection.map((d) => ({
    name:  d.name,
    value: `${d.value} (${dirTotal > 0 ? ((d.value / dirTotal) * 100).toFixed(1) : 0}%)`,
    color: d.color,
  }));

  const structTotal  = tradesByStructure.reduce((s, d) => s + d.value, 0);
  const structLegend = tradesByStructure.map((d) => ({
    name:  d.name,
    value: `${d.value} (${structTotal > 0 ? ((d.value / structTotal) * 100).toFixed(1) : 0}%)`,
    color: d.color,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <NetRBySession data={netRBySession} />
      <TradesByDonut
        title="Trades by Direction"
        data={tradesByDirection}
        total={dirTotal}
        legend={dirLegend}
        testId="trades-by-direction"
      />
      <TradesByDonut
        title="Trades by Structure"
        data={tradesByStructure}
        total={structTotal}
        legend={structLegend}
        testId="trades-by-structure"
      />
      <TopEntryModel data={topEntryModel} />
    </div>
  );
}

function NetRBySession({ data }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>Net R by Session</SectionLabel>
        <span className="text-[9px] text-muted-lab font-ui uppercase tracking-[0.12em]">
          Filtered Preview
        </span>
      </div>
      <div className="h-44" data-testid="chart-net-r-by-session">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 12, bottom: 4, left: -16 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
              axisLine={{ stroke: "hsl(214 30% 20%)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "rgba(34,211,238,0.05)" }}
              contentStyle={tooltipStyle}
              labelStyle={{ color: "#94A3B8", fontSize: 10 }}
              formatter={(v) => [`${v > 0 ? "+" : ""}${v}R`, "Net R"]}
            />
            <Bar dataKey="netR" radius={[3, 3, 0, 0]}>
              {data.map((d) => (
                <Cell
                  key={d.name}
                  fill={d.netR >= 0 ? "#22C55E" : "#EF4444"}
                  fillOpacity={0.85}
                />
              ))}
              <LabelList
                dataKey="netR"
                position="top"
                style={{ fill: "#E5EDF7", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                formatter={(v) => `${v > 0 ? "+" : ""}${v}R`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TradesByDonut({ title, data, total, legend, testId }) {
  return (
    <Card>
      <div className="mb-3">
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="flex flex-col items-center gap-3" data-testid={testId}>
        {/* Donut — smaller so it leaves room for the legend */}
        <div className="relative h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={30}
                outerRadius={50}
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
            <span className="font-num tabular-nums text-xl font-bold text-[hsl(var(--text))]">{total}</span>
            <span className="text-[9px] text-muted-lab uppercase tracking-[0.12em] font-ui">Trades</span>
          </div>
        </div>
        {/* Legend — full card width, no overflow risk */}
        <ul className="w-full space-y-2">
          {legend.map((l) => (
            <li key={l.name} className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: l.color }} />
              <span className="font-ui text-xs font-medium text-[hsl(var(--text))] shrink-0">{l.name}</span>
              <span className="ml-auto font-num text-xs text-[hsl(var(--text-2))] shrink-0 whitespace-nowrap">{l.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TopEntryModel({ data }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>Top Entry Model</SectionLabel>
        <span className="text-[9px] text-muted-lab font-ui uppercase tracking-[0.12em]">
          By Net R
        </span>
      </div>
      <div className="h-44" data-testid="chart-top-entry">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 32, bottom: 4, left: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fill: "#94A3B8", fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace" }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip
              cursor={{ fill: "rgba(34,211,238,0.05)" }}
              contentStyle={tooltipStyle}
              formatter={(v) => [`${v > 0 ? "+" : ""}${v}R`, "Net R"]}
            />
            <Bar dataKey="netR" radius={[3, 3, 3, 3]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.netR >= 0 ? "#22C55E" : "#EF4444"} fillOpacity={0.85} />
              ))}
              <LabelList
                dataKey="netR"
                position="right"
                style={{ fill: "#E5EDF7", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                formatter={(v) => `${v > 0 ? "+" : ""}${v}R`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
