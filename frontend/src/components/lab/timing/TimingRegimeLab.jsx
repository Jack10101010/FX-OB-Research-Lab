// TimingRegimeLab.jsx — Timing & Regime Lab, Phase A (read-only foundations).
//
// Merges the old Monthly + Entry Timing tabs into one honest, stability-aware
// surface: overview cards + month / session / hour / weekday / direction tables,
// each carrying the standard KPI set plus a cross-year confidence layer. All math
// lives in data/timingAnalytics.js (pure). No drilldown, matrix, what-if, or
// discovery yet — those are Phase B/C. See TIMING-REGIME-LAB-DESIGN-AUDIT-1.md.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import {
    buildTimingOverview, buildMonthBreakdown, buildSessionBreakdown,
    buildHourBreakdown, buildWeekdayBreakdown, buildDirectionBreakdown,
} from "@/data/timingAnalytics";

const successTone = "text-[hsl(var(--success))]";
const dangerTone = "text-[hsl(var(--danger))]";
const fmtR1 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
const fmtR2 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`);
const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
const confTone = (c) => (c === "High" ? successTone : c === "Medium" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]");
const pfText = (row) => (row.pf == null ? (row.winners > 0 ? "∞" : "—") : row.pf);

// ── Overview card ─────────────────────────────────────────────────────────────
function OverviewCard({ title, card, kind = "net" }) {
    if (!card) {
        return (
            <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.15)] px-3 py-2.5">
                <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">{title}</div>
                <div className="mt-1 text-[13px] font-ui text-muted-lab">—</div>
                <div className="text-[10px] font-ui text-muted-lab">No qualifying bucket</div>
            </div>
        );
    }
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.25)] px-3 py-2.5">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">{title}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[14px] font-ui font-semibold text-[hsl(var(--text-1))]">{card.label}</span>
                <span className={`text-[15px] font-num font-semibold ${rTone(card.netR)}`}>{fmtR1(card.netR)}</span>
            </div>
            <div className="mt-0.5 text-[10px] font-num text-[hsl(var(--text-2))]">
                {card.trades}T · PF {pfText(card)} · WR {card.winRate}% · Exp {fmtR2(card.expectancy)}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`text-[9.5px] font-ui ${confTone(card.confidence)}`}>{card.confidence} confidence</span>
                {kind === "consistency" && <span className="text-[9.5px] font-ui text-muted-lab">· {card.yearsPositive}/{card.yearsPresent} yrs +</span>}
                {card.lowConfidence && <span className="text-[9px] font-ui text-[hsl(var(--warning))]">· low-confidence pick</span>}
            </div>
        </div>
    );
}

// ── Sortable timing table ─────────────────────────────────────────────────────
const COLS = [
    { key: "trades", label: "Trades", num: true },
    { key: "netR", label: "Net R", num: true },
    { key: "pf", label: "PF", num: true },
    { key: "winRate", label: "WR", num: true },
    { key: "expectancy", label: "Exp", num: true },
    { key: "yearsPresent", label: "Yrs Present", num: true },
    { key: "yearsPositive", label: "Yrs Positive", num: true },
    { key: "confidence", label: "Confidence", num: false },
];

function TimingTable({ rows, firstLabel }) {
    const [sort, setSort] = useState({ key: null, dir: "desc" });
    const sorted = useMemo(() => {
        if (!sort.key) return rows;
        const dir = sort.dir === "desc" ? -1 : 1;
        const val = (r) => {
            const v = r[sort.key];
            if (sort.key === "confidence") return { High: 3, Medium: 2, Low: 1 }[v] || 0;
            return v == null ? -Infinity : v;
        };
        return [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
    }, [rows, sort]);
    const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
    const arrow = (key) => (sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : "");
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onSort("label")}>{firstLabel}{arrow("label")}</th>
                    {COLS.map((c) => (
                        <th key={c.key} className={`pr-3 cursor-pointer select-none ${c.num ? "text-right" : ""}`} onClick={() => onSort(c.key)}>{c.label}{arrow(c.key)}</th>
                    ))}
                </tr></thead>
                <tbody>
                    {sorted.map((r) => {
                        const empty = r.trades === 0;
                        return (
                            <tr key={r.key} className={`border-t border-[hsl(var(--border-soft))] ${empty ? "opacity-50" : ""}`}>
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-ui">{r.label}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-1))]">{r.trades}</td>
                                <td className={`pr-3 text-right font-num ${empty ? "text-[hsl(var(--text-2))]" : rTone(r.netR)}`}>{empty ? "—" : fmtR1(r.netR)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{empty ? "—" : pfText(r)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{empty ? "—" : `${r.winRate}%`}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{empty ? "—" : fmtR2(r.expectancy)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.yearsPresent}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.yearsPositive}</td>
                                <td className={`font-ui ${confTone(r.confidence)}`}>{r.confidence}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

const SubLabel = ({ children }) => (
    <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1.5">{children}</div>
);

export default function TimingRegimeLab({ trades }) {
    const list = Array.isArray(trades) ? trades : [];
    const overview = useMemo(() => buildTimingOverview(list), [list]);
    const months = useMemo(() => buildMonthBreakdown(list), [list]);
    const sessions = useMemo(() => buildSessionBreakdown(list), [list]);
    const hours = useMemo(() => buildHourBreakdown(list), [list]);
    const weekdays = useMemo(() => buildWeekdayBreakdown(list), [list]);
    const directions = useMemo(() => buildDirectionBreakdown(list), [list]);

    const hasTimestamps = months.some((m) => m.trades > 0);

    return (
        <NeonPanel className="xl:col-span-3" title="Timing & Regime Lab">
            {/* Honesty notes */}
            <div className="mb-3 space-y-1.5">
                <p className="text-[11px] font-ui text-[hsl(var(--warning))]">
                    Timing buckets are in-sample and highly prone to overfitting. Treat low-n rows as hypotheses only.
                </p>
                <p className="text-[10.5px] font-ui text-muted-lab">
                    Regime data is not currently exported. Bullish / Bearish below means <span className="text-[hsl(var(--text-2))]">trade direction</span>, not HTF market regime.
                </p>
            </div>

            {!hasTimestamps ? (
                <div className="py-8 text-center font-ui text-[12px] text-muted-lab">No timestamped trades available to build timing analytics.</div>
            ) : (
                <div className="space-y-5">
                    {/* Overview cards */}
                    <div>
                        <SubLabel>Timing overview</SubLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                            <OverviewCard title="Best Month" card={overview.bestMonth} />
                            <OverviewCard title="Worst Month" card={overview.worstMonth} />
                            <OverviewCard title="Most Consistent Month" card={overview.mostConsistentMonth} kind="consistency" />
                            <OverviewCard title="Best Session" card={overview.bestSession} />
                            <OverviewCard title="Worst Session" card={overview.worstSession} />
                            <OverviewCard title="Most Consistent Session" card={overview.mostConsistentSession} kind="consistency" />
                            <OverviewCard title="Most Active Session" card={overview.mostActiveSession} />
                            <OverviewCard title="Best Hour" card={overview.bestHour} />
                            <OverviewCard title="Worst Hour" card={overview.worstHour} />
                            <OverviewCard title="Most Consistent Hour" card={overview.mostConsistentHour} kind="consistency" />
                            <OverviewCard title="Most Active Hour" card={overview.mostActiveHour} />
                        </div>
                    </div>

                    <div><SubLabel>Monthly breakdown (month-of-year)</SubLabel><TimingTable rows={months} firstLabel="Month" /></div>
                    <div><SubLabel>Session breakdown</SubLabel><TimingTable rows={sessions} firstLabel="Session" /></div>
                    <div><SubLabel>Hour breakdown (UTC)</SubLabel><TimingTable rows={hours} firstLabel="Hour" /></div>
                    <div><SubLabel>Weekday breakdown</SubLabel><TimingTable rows={weekdays} firstLabel="Weekday" /></div>
                    <div>
                        <SubLabel>Direction proxy (not real regime)</SubLabel>
                        <TimingTable rows={directions} firstLabel="Direction" />
                    </div>
                </div>
            )}
        </NeonPanel>
    );
}
