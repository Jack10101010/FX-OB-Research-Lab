// ── MarketStateCard.jsx ────────────────────────────────────────────────────
// PRESENTATION ONLY. Renders a per-trade market-state snapshot produced by
// data/marketState.js (via useMarketStatePanel / stateForTrade). Performs NO
// indicator math — it only formats fields already present on the snapshot row.
//
// Design: compact key/value rows (no large coloured panels) so it stays scannable
// and can absorb future fields without a redesign — add a row to ROW_DEFS.

import React from "react";
import { marketStateColor } from "@/lib/chartStyles";
import { formatMarketStateSource } from "@/data/marketStateSource";

const fmt = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));

// Row definitions: each maps the snapshot → a compact { label, value, hint }.
// Extensible: append a new entry to surface a future field with no layout change.
const ROW_DEFS = [
    {
        label: "Trend",
        value: (s) => s.trendState ?? "—",
        hint: (s) => (s.pxVsEma == null ? "" : `close vs EMA ${fmt(s.pxVsEma)}%`),
    },
    {
        label: "EMA status",
        value: (s) => (s.pxVsEma == null ? "—" : s.pxVsEma > 0 ? "Above" : "Below"),
        hint: (s) => (s.ema == null ? "" : `EMA ${fmt(s.ema, 5)}`),
    },
    {
        label: "BBW status",
        value: (s) => s.volatilityState ?? "—",
        hint: (s) => (s.bbw == null ? "" : `BBW ${fmt(s.bbw)} vs ${fmt(s.bbwThreshold, 3)}`),
    },
    {
        label: "ADX status",
        value: (s) => s.chopState ?? "—",
        hint: (s) => (s.adx == null ? "" : `ADX ${fmt(s.adx)}`),
    },
    {
        label: "Confirmation",
        value: (s) => (s.confirmed ? "Confirmed" : "Pending"),
        hint: () => "",
    },
    {
        label: "Known at",
        value: (s) => s.knownAt ?? "—",
        hint: (s) => (s.shiftedDays ? `shifted ${s.shiftedDays}d` : ""),
    },
    {
        label: "Source",
        value: (s) => formatMarketStateSource(s.source),
        hint: (s) => (s.version ? `v${s.version}` : ""),
    },
];

function Row({ label, value, hint }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-lab">{label}</span>
            <span className="text-right">
                <span className="text-white font-num text-[11px]">{value}</span>
                {hint ? <span className="block text-[9.5px] text-muted-lab font-num">{hint}</span> : null}
            </span>
        </div>
    );
}

export function MarketStateCard({ snapshot, title = "Market State" }) {
    const c = snapshot?.marketState ? marketStateColor(snapshot.marketState) : null;
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-title-lab">{title}</span>
                {snapshot?.marketState ? (
                    <span
                        className="text-[10.5px] font-num px-1.5 py-0.5 clip-bevel-sm border"
                        style={{ color: c.text, borderColor: c.stroke, background: c.fill }}
                    >
                        {snapshot.marketState}
                    </span>
                ) : (
                    <span className="text-[10.5px] font-ui text-muted-lab">unavailable</span>
                )}
            </div>

            {snapshot ? (
                <div className="space-y-1">
                    {ROW_DEFS.map((r) => (
                        <Row key={r.label} label={r.label} value={r.value(snapshot)} hint={r.hint(snapshot)} />
                    ))}
                </div>
            ) : (
                <div className="text-[10.5px] font-ui text-muted-lab leading-relaxed">
                    No state for this trade — the day is outside the loaded candle window or inside
                    the indicator warm-up period.
                </div>
            )}
        </div>
    );
}

export default MarketStateCard;
