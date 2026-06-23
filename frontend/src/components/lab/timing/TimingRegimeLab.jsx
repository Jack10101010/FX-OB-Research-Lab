// TimingRegimeLab.jsx — Timing & Regime Lab (Phase A foundations + Phase B research).
//
// Phase A: overview cards + month/session/hour/weekday/direction tables with a
// cross-year confidence layer. Phase B adds the research layer: a Timing Discovery
// Command Center, a ranked what-if Discovery table (exact in-sample removal),
// clickable Month rows → Month Drilldown, and a Month × Session matrix. All math
// is pure (data/timingAnalytics.js). See TIMING-REGIME-LAB-DESIGN-AUDIT-1.md.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import {
    buildTimingOverview, buildMonthBreakdown, buildSessionBreakdown,
    buildHourBreakdown, buildWeekdayBreakdown, buildDirectionBreakdown,
    buildTimingDiscovery, buildMonthDrilldown, buildMonthSessionMatrix,
    monthSpreadVerdict, timestampedTrades,
} from "@/data/timingAnalytics";

const successTone = "text-[hsl(var(--success))]";
const dangerTone = "text-[hsl(var(--danger))]";
const fmtR1 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
const fmtR2 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`);
const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
const confTone = (c) => (c === "High" ? successTone : c === "Medium" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]");
const pfText = (row) => (row.pf == null ? (row.winners > 0 ? "∞" : "—") : row.pf);
const pfShow = (v) => (v == null ? "∞" : v);
const sigTone = (s) => (s === "Strong" ? successTone : s === "Test" ? "text-[hsl(var(--warning))]" : s === "Watch" ? "text-[hsl(var(--accent-secondary))]" : "text-[hsl(var(--text-3))]");

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

// ── Command Center card (a what-if removal candidate) ─────────────────────────
function CommandCard({ title, cand }) {
    if (!cand) {
        return (
            <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.15)] px-3 py-2.5">
                <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">{title}</div>
                <div className="mt-1 text-[12px] font-ui text-muted-lab">No qualifying candidate</div>
            </div>
        );
    }
    const low = cand.confidence === "Low";
    return (
        <div className={`clip-bevel-sm border px-3 py-2.5 ${low ? "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)]" : "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.06)]"}`}>
            <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">{title}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[12.5px] font-ui font-semibold text-[hsl(var(--text-1))]">Remove {cand.label}</span>
                <span className={`text-[14px] font-num font-semibold ${rTone(cand.deltaNetR)}`}>{fmtR1(cand.deltaNetR)}</span>
            </div>
            <div className="mt-0.5 text-[10px] font-num text-[hsl(var(--text-2))]">
                −{cand.tradesRemoved}T · PF→ {pfShow(cand.afterPF)} · WR→ {cand.afterWR}% · <span className={confTone(cand.confidence)}>{cand.confidence}</span>
            </div>
            {low && <div className="mt-0.5 text-[9px] font-ui text-[hsl(var(--warning))]">High-risk curiosity — not a recommendation.</div>}
            {cand.broad && <div className="mt-0.5 text-[9px] font-ui text-[hsl(var(--warning))]">Broad filter — removes &gt;35% of trades.</div>}
        </div>
    );
}

// ── Phase A breakdown table (sortable; optionally row-clickable) ──────────────
// Column-driven so the header and body never drift, and so the W/L column +
// `hideStabilityCols` toggle apply consistently. `sort: false` columns (W/L) are
// not clickable. W/L reads row.winners / row.losers — never recomputed here.
const NUM = "pr-3 text-right font-num text-[hsl(var(--text-2))]";
const TABLE_COLS = [
    { key: "trades", label: "Trades", align: "right", render: (r) => <span className="text-[hsl(var(--text-1))]">{r.trades}</span> },
    { key: "wl", label: "W / L", align: "right", sort: false, render: (r, e) => (e ? "—" : <span><span className="text-[hsl(var(--success))]">{r.winners}</span> / <span className="text-[hsl(var(--danger))]">{r.losers}</span></span>) },
    { key: "netR", label: "Net R", align: "right", render: (r, e) => <span className={e ? "text-[hsl(var(--text-2))]" : rTone(r.netR)}>{e ? "—" : fmtR1(r.netR)}</span> },
    { key: "pf", label: "PF", align: "right", render: (r, e) => (e ? "—" : pfText(r)) },
    { key: "winRate", label: "WR", align: "right", render: (r, e) => (e ? "—" : `${r.winRate}%`) },
    { key: "expectancy", label: "Exp", align: "right", render: (r, e) => (e ? "—" : fmtR2(r.expectancy)) },
    { key: "yearsPresent", label: "Yrs Present", align: "right", stability: true, render: (r) => r.yearsPresent },
    { key: "yearsPositive", label: "Yrs Positive", align: "right", stability: true, render: (r) => r.yearsPositive },
    { key: "confidence", label: "Confidence", align: "left", render: (r) => <span className={confTone(r.confidence)}>{r.confidence}</span> },
];

function TimingTable({ rows, firstLabel, onRowClick, selectedKey, hideStabilityCols = false }) {
    const cols = useMemo(() => TABLE_COLS.filter((c) => !(hideStabilityCols && c.stability)), [hideStabilityCols]);
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
    const sortable = (c) => c.sort !== false;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onSort("label")}>{firstLabel}{arrow("label")}</th>
                    {cols.map((c) => (
                        <th key={c.key} className={`pr-3 select-none ${c.align === "right" ? "text-right" : ""} ${sortable(c) ? "cursor-pointer" : ""}`} onClick={sortable(c) ? () => onSort(c.key) : undefined}>{c.label}{sortable(c) ? arrow(c.key) : ""}</th>
                    ))}
                </tr></thead>
                <tbody>
                    {sorted.map((r) => {
                        const empty = r.trades === 0;
                        const selected = selectedKey != null && r.key === selectedKey;
                        return (
                            <tr
                                key={r.key}
                                onClick={onRowClick ? () => onRowClick(r) : undefined}
                                className={`border-t border-[hsl(var(--border-soft))] ${empty ? "opacity-50" : ""} ${onRowClick && !empty ? "cursor-pointer hover:bg-[hsl(var(--panel-2)/0.3)]" : ""} ${selected ? "bg-[hsl(var(--accent-secondary)/0.1)]" : ""}`}
                            >
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-ui">{onRowClick && !empty ? "▸ " : ""}{r.label}</td>
                                {cols.map((c) => (
                                    <td key={c.key} className={c.key === "confidence" ? "font-ui" : NUM}>{c.render(r, empty)}</td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── Discovery table (ranked what-if removal candidates) ───────────────────────
const DISCOVERY_SORTS = {
    deltaNetR: (r) => r.deltaNetR,
    tradesRemoved: (r) => r.tradesRemoved,
    afterPF: (r) => (r.afterPF == null ? Infinity : r.afterPF),
    confidence: (r) => ({ High: 3, Medium: 2, Low: 1 }[r.confidence] || 0),
};

function DiscoveryTable({ rows }) {
    const [filter, setFilter] = useState("all");       // all | medhigh | positive
    const [showAll, setShowAll] = useState(false);
    const [sort, setSort] = useState({ key: "deltaNetR", dir: "desc" });

    const filtered = useMemo(() => {
        let r = rows;
        if (filter === "medhigh") r = r.filter((x) => x.confidence !== "Low");
        else if (filter === "positive") r = r.filter((x) => x.deltaNetR > 0);
        const f = DISCOVERY_SORTS[sort.key] || DISCOVERY_SORTS.deltaNetR;
        const dir = sort.dir === "desc" ? -1 : 1;
        return [...r].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0) * dir);
    }, [rows, filter, sort]);
    const shown = showAll ? filtered.slice(0, 200) : filtered.slice(0, 25);
    const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
    const arrow = (key) => (sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : "");
    const FilterBtn = ({ id, children }) => (
        <button type="button" onClick={() => setFilter(id)} className={`clip-bevel-sm px-2 py-0.5 text-[10px] font-ui border ${filter === id ? "border-[hsl(var(--accent-secondary))] text-[hsl(var(--accent-secondary))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}>{children}</button>
    );

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-ui text-muted-lab mr-1">Filter:</span>
                <FilterBtn id="all">All</FilterBtn>
                <FilterBtn id="medhigh">Medium/High</FilterBtn>
                <FilterBtn id="positive">Positive Δ</FilterBtn>
                <span className="text-[10px] font-ui text-muted-lab ml-2">{filtered.length} candidates · showing {shown.length}</span>
                <button type="button" onClick={() => setShowAll((v) => !v)} className="clip-bevel-sm px-2 py-0.5 text-[10px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] ml-auto">{showAll ? "Show top 25" : "Show all"}</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-ui whitespace-nowrap">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[9.5px] tracking-wider text-left">
                        <th className="py-1 pr-3">Candidate</th><th className="pr-3">Type</th>
                        <th className="pr-3 text-right cursor-pointer select-none" onClick={() => onSort("tradesRemoved")}>Removed{arrow("tradesRemoved")}</th>
                        <th className="pr-3 text-right">Rem Net R</th>
                        <th className="pr-3 text-right cursor-pointer select-none" onClick={() => onSort("deltaNetR")}>Δ Net R{arrow("deltaNetR")}</th>
                        <th className="pr-3 text-right cursor-pointer select-none" onClick={() => onSort("afterPF")}>PF B→A{arrow("afterPF")}</th>
                        <th className="pr-3 text-right">WR B→A</th><th className="pr-3 text-right">Exp B→A</th>
                        <th className="pr-3 text-right">Yrs P</th><th className="pr-3 text-right">Yrs +</th>
                        <th className="pr-3 cursor-pointer select-none" onClick={() => onSort("confidence")}>Conf{arrow("confidence")}</th>
                        <th>Signal</th>
                    </tr></thead>
                    <tbody>
                        {shown.map((r, i) => (
                            <tr key={`${r.type}-${r.label}-${i}`} className="border-t border-[hsl(var(--border-soft))]">
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))]">{r.label}</td>
                                <td className="pr-3 text-[hsl(var(--text-2))]">{r.type}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.tradesRemoved}{r.broad ? "*" : ""}</td>
                                <td className={`pr-3 text-right font-num ${rTone(r.removedNetR)}`}>{fmtR1(r.removedNetR)}</td>
                                <td className={`pr-3 text-right font-num ${rTone(r.deltaNetR)}`}>{fmtR1(r.deltaNetR)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{pfShow(r.beforePF)}→{pfShow(r.afterPF)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.beforeWR}→{r.afterWR}%</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtR2(r.beforeExpectancy)}→{fmtR2(r.afterExpectancy)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.yearsPresent}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.yearsPositive}</td>
                                <td className={`pr-3 font-ui ${confTone(r.confidence)}`}>{r.confidence}</td>
                                <td className={`font-ui ${sigTone(r.signal)}`}>{r.signal}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[10px] font-ui text-muted-lab">* removes &gt;35% of trades (broad filter). Exact in-sample removal analysis — treat as research candidates only. Validate with fresh runs / OOS before adopting.</p>
        </div>
    );
}

// ── Month × Session matrix ────────────────────────────────────────────────────
function MonthSessionMatrix({ matrix, onCellClick, selectedMonth }) {
    return (
        <div className="space-y-1.5">
            <div className="overflow-x-auto">
                <table className="w-full table-fixed border-separate border-spacing-1.5">
                    <colgroup>
                        <col style={{ width: "96px" }} />
                        {matrix.sessions.map((s) => <col key={s} />)}
                    </colgroup>
                    <thead><tr>
                        <th className="font-ui text-[hsl(var(--text-2))] text-left px-2 py-1 text-[10px] uppercase tracking-[0.06em]">Month / Session</th>
                        {matrix.sessions.map((s) => <th key={s} className="font-ui text-[hsl(var(--text-2))] px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-center">{s}</th>)}
                    </tr></thead>
                    <tbody>
                        {matrix.rows.map((row) => (
                            <tr key={row.month} className={selectedMonth === row.month ? "bg-[hsl(var(--accent-secondary)/0.1)]" : ""}>
                                <td className="font-ui text-[hsl(var(--text-1))] px-2 py-1 whitespace-nowrap text-[12px]">{row.label}</td>
                                {matrix.sessions.map((s) => {
                                    const c = row.cells[s];
                                    if (!c || c.trades === 0) return <td key={s}><div className="clip-bevel-sm py-3.5 text-center text-[hsl(var(--text-3))] bg-[hsl(var(--panel-2)/0.55)]">·</div></td>;
                                    const ratio = Math.min(1, Math.abs(c.netR) / matrix.maxAbs);
                                    const alpha = (0.3 + 0.62 * ratio).toFixed(3);
                                    const bg = c.netR >= 0 ? `hsl(var(--success) / ${alpha})` : `hsl(var(--danger) / ${alpha})`;
                                    return (
                                        <td key={s}>
                                            <div
                                                onClick={() => onCellClick && onCellClick(row.month)}
                                                title={c.thin ? `Thin cell (${c.trades} trades) — hypothesis only` : `${c.trades} trades`}
                                                className={`clip-bevel-sm px-2 py-2.5 text-center cursor-pointer transition-[filter] hover:brightness-125 ${c.thin ? "opacity-70" : ""}`}
                                                style={{ background: bg }}
                                            >
                                                <div className="font-num text-[14px] font-semibold text-white leading-tight">{fmtR1(c.netR)}</div>
                                                <div className="font-num text-[10.5px] text-white/80 leading-tight mt-0.5">{c.trades}t{c.thin ? " · thin" : ""}</div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[10.5px] font-ui text-muted-lab">Faded cells have &lt; 8 trades — read the row (month) and column (session) margins, not individual thin cells. Click a cell to open that month's drilldown.</p>
        </div>
    );
}

// ── Month what-if mini list ───────────────────────────────────────────────────
function WhatIfMini({ title, rows }) {
    const populated = rows.filter((r) => r.tradesRemoved > 0);
    if (!populated.length) return null;
    return (
        <div>
            <div className="text-[10px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-3))] mb-1">{title}</div>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-ui whitespace-nowrap">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[9.5px] tracking-wider text-left">
                        <th className="py-1 pr-3">Remove</th><th className="pr-3 text-right">−T</th><th className="pr-3 text-right">Δ Net R</th><th className="pr-3 text-right">PF→</th><th className="pr-3 text-right">WR→</th><th className="pr-3">Conf</th><th>Signal</th>
                    </tr></thead>
                    <tbody>
                        {populated.map((r, i) => (
                            <tr key={i} className="border-t border-[hsl(var(--border-soft))]">
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))]">{r.label}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.tradesRemoved}</td>
                                <td className={`pr-3 text-right font-num ${rTone(r.deltaNetR)}`}>{fmtR1(r.deltaNetR)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{pfShow(r.afterPF)}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.afterWR}%</td>
                                <td className={`pr-3 font-ui ${confTone(r.confidence)}`}>{r.confidence}</td>
                                <td className={`font-ui ${sigTone(r.signal)}`}>{r.signal}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MonthDrilldown({ drill, onClose }) {
    if (!drill) return null;
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.4)] bg-[hsl(var(--panel-2)/0.2)] p-3 space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))]">{drill.label} drilldown <span className="text-[11px] font-num text-muted-lab">· {drill.trades} trades</span></div>
                <button type="button" onClick={onClose} className="text-[11px] font-ui text-muted-lab hover:text-[hsl(var(--text-1))]">✕ close</button>
            </div>
            <p className="text-[10.5px] font-ui text-muted-lab">Is {drill.label} bad overall, or only certain sessions/hours within it? Breakdowns below are {drill.label}-only; the what-if removes {drill.label} slices from the full run.</p>
            <div>
                <SubLabel>{drill.label} · year breakdown</SubLabel>
                {(() => {
                    const v = monthSpreadVerdict(drill.breakdowns.year);
                    const vTone = v.tone === "success" ? successTone : v.tone === "danger" ? dangerTone : v.tone === "muted" ? "text-muted-lab" : "text-[hsl(var(--text-1))]";
                    return <p className={`text-[11px] font-ui mb-1.5 ${vTone}`}>{v.text}</p>;
                })()}
                {drill.breakdowns.year.length === 0
                    ? <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No dated trades for this month.</div>
                    : <TimingTable rows={drill.breakdowns.year} firstLabel="Year" hideStabilityCols />}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div><SubLabel>{drill.label} · session</SubLabel><TimingTable rows={drill.breakdowns.session} firstLabel="Session" /></div>
                <div><SubLabel>{drill.label} · weekday</SubLabel><TimingTable rows={drill.breakdowns.weekday} firstLabel="Weekday" /></div>
                <div><SubLabel>{drill.label} · hour</SubLabel><TimingTable rows={drill.breakdowns.hour} firstLabel="Hour" /></div>
                <div><SubLabel>{drill.label} · direction proxy</SubLabel><TimingTable rows={drill.breakdowns.direction} firstLabel="Direction" /></div>
            </div>
            <div>
                <SubLabel>{drill.label} what-if (exact removal from full run)</SubLabel>
                <div className="space-y-3">
                    <WhatIfMini title="Whole month + by session" rows={[drill.whatIf.removeMonth, ...drill.whatIf.bySession]} />
                    <WhatIfMini title="By hour" rows={drill.whatIf.byHour} />
                    <WhatIfMini title="By weekday" rows={drill.whatIf.byWeekday} />
                </div>
            </div>
        </div>
    );
}

const SubLabel = ({ children }) => (
    <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1.5">{children}</div>
);

export default function TimingRegimeLab({ trades }) {
    // One shared, timestamped universe so every panel (overview, tables,
    // discovery, matrix, drilldown) agrees on the denominator.
    const list = useMemo(() => timestampedTrades(trades), [trades]);
    const [selectedMonth, setSelectedMonth] = useState(null);

    const overview = useMemo(() => buildTimingOverview(list), [list]);
    const months = useMemo(() => buildMonthBreakdown(list), [list]);
    const sessions = useMemo(() => buildSessionBreakdown(list), [list]);
    const hours = useMemo(() => buildHourBreakdown(list), [list]);
    const weekdays = useMemo(() => buildWeekdayBreakdown(list), [list]);
    const directions = useMemo(() => buildDirectionBreakdown(list), [list]);
    const discovery = useMemo(() => buildTimingDiscovery(list), [list]);
    const matrix = useMemo(() => buildMonthSessionMatrix(list), [list]);
    const drill = useMemo(() => (selectedMonth == null ? null : buildMonthDrilldown(list, selectedMonth)), [list, selectedMonth]);

    const hasTimestamps = months.some((m) => m.trades > 0);
    const cc = discovery.commandCenter;

    return (
        <NeonPanel className="xl:col-span-3" title="Timing & Regime Lab">
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
                    {/* Command Center */}
                    <div>
                        <SubLabel>Timing discovery command center</SubLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                            <CommandCard title="Best overall candidate" cand={cc.bestOverall} />
                            <CommandCard title="Best month × session" cand={cc.bestMonthSession} />
                            <CommandCard title="Best session × hour" cand={cc.bestSessionHour} />
                            <CommandCard title="Best high-confidence" cand={cc.bestHighConfidence} />
                        </div>
                    </div>

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

                    {/* Monthly table (clickable) + drilldown */}
                    <div>
                        <SubLabel>Monthly breakdown (month-of-year) — click a month to drill in</SubLabel>
                        <TimingTable rows={months} firstLabel="Month" onRowClick={(r) => setSelectedMonth((m) => (m === r.key ? null : r.key))} selectedKey={selectedMonth} />
                    </div>
                    {drill && <MonthDrilldown drill={drill} onClose={() => setSelectedMonth(null)} />}

                    {/* Month × Session matrix */}
                    <div><SubLabel>Month × Session matrix (Net R)</SubLabel><MonthSessionMatrix matrix={matrix} onCellClick={setSelectedMonth} selectedMonth={selectedMonth} /></div>

                    {/* Phase A breakdown tables */}
                    <div><SubLabel>Session breakdown</SubLabel><TimingTable rows={sessions} firstLabel="Session" /></div>
                    <div><SubLabel>Hour breakdown (UTC)</SubLabel><TimingTable rows={hours} firstLabel="Hour" /></div>
                    <div><SubLabel>Weekday breakdown</SubLabel><TimingTable rows={weekdays} firstLabel="Weekday" /></div>
                    <div><SubLabel>Direction proxy (not real regime)</SubLabel><TimingTable rows={directions} firstLabel="Direction" /></div>

                    {/* Discovery table */}
                    <div><SubLabel>Timing discovery — ranked removal candidates</SubLabel><DiscoveryTable rows={discovery.candidates} /></div>
                </div>
            )}
        </NeonPanel>
    );
}
