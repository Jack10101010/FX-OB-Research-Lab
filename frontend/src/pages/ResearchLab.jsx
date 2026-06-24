// ResearchLab.jsx — Research Lab (Phase 1 shell + cohort explorer + Discovery module).
//
// The universal cohort → research-module workbench. Phase 1 proves the workflow
// with ONE module (Discovery / What-If). Pick any cohort (Whole Run, a single
// dimension, or a pair) and see an EXACT summary + ranked in-sample removal
// candidates. All compute is pure (data/researchLab.js + data/cohortFilterSimulator.js).
// See RESEARCH-LAB-ARCHITECTURE-AUDIT-1.md.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Link } from "react-router-dom";
import { useRunDisplayUniverse } from "@/data/useRunDisplayUniverse";
import { DIMENSIONS, availableDimensions } from "@/data/cohortDimensions";
import { buildFilterDiscovery } from "@/data/cohortFilterSimulator";
import { buildResearchUniverse, resolveResearchCohort, cohortSummary, observedValuesFor } from "@/data/researchLab";
import { runExperimentStack, buildExcludeExperiment, buildTargetExperiment, targetLevels } from "@/data/cohortExperiment";

const successTone = "text-[hsl(var(--success))]";
const dangerTone = "text-[hsl(var(--danger))]";
const fmtR1 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
const fmtR2 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`);
const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
const pfShow = (v) => (v == null ? "∞" : v);
const recTone = (t) => (t === "danger" ? dangerTone : t === "warning" ? "text-[hsl(var(--warning))]" : t === "secondary" ? "text-[hsl(var(--accent-secondary))]" : "text-[hsl(var(--text-2))]");

const SubLabel = ({ children }) => (
    <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1.5">{children}</div>
);

function dateSpan(trades) {
    let lo = null, hi = null;
    for (const t of trades) {
        const raw = t?.entry ?? t?.entryTime ?? t?.fill_time;
        const d = raw ? new Date(raw) : null;
        if (!d || !Number.isFinite(d.getTime())) continue;
        if (lo == null || d < lo) lo = d;
        if (hi == null || d > hi) hi = d;
    }
    if (!lo) return null;
    const f = (d) => d.toISOString().slice(0, 10);
    return `${f(lo)} → ${f(hi)}`;
}

// ── Run context card ──────────────────────────────────────────────────────────
function RunContext({ name, summary, span }) {
    const Stat = ({ label, value, tone }) => (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-1.5">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">{label}</div>
            <div className={`text-[14px] font-num ${tone || "text-[hsl(var(--text-1))]"}`}>{value}</div>
        </div>
    );
    return (
        <div className="space-y-2">
            {(name || span) && <div className="text-[12.5px] font-ui text-[hsl(var(--text-1))]">{name}{span ? <span className="text-muted-lab font-num"> · {span}</span> : null}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                <Stat label="Trades" value={summary.trades} />
                <Stat label="W / L" value={<span><span className={successTone}>{summary.winners}</span> / <span className={dangerTone}>{summary.losers}</span></span>} />
                <Stat label="Net R" value={fmtR1(summary.netR)} tone={rTone(summary.netR)} />
                <Stat label="PF" value={pfShow(summary.pf)} />
                <Stat label="WR" value={`${summary.winRate}%`} />
                <Stat label="Exp" value={fmtR2(summary.expectancy)} />
            </div>
        </div>
    );
}

// ── Cohort builder (left rail) ────────────────────────────────────────────────
function CohortBuilder({ availDims, universe, sel, setSel }) {
    const Select = ({ value, onChange, children, testid }) => (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testid}
            className="w-full clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.4)] px-2 py-1 text-[11.5px] font-ui text-[hsl(var(--text-1))] outline-none"
        >
            {children}
        </select>
    );
    const vals1 = useMemo(() => (sel.dim1 ? observedValuesFor(universe, sel.dim1) : []), [universe, sel.dim1]);
    const vals2 = useMemo(() => (sel.dim2 ? observedValuesFor(universe, sel.dim2) : []), [universe, sel.dim2]);
    const dimOpt = (d) => <option key={d.key} value={d.key}>{d.label}</option>;

    return (
        <div className="space-y-3">
            <div>
                <SubLabel>Dimension 1</SubLabel>
                <Select value={sel.dim1} onChange={(v) => setSel((s) => ({ ...s, dim1: v, val1: "" }))} testid="rl-dim1">
                    <option value="">— none (Whole Run) —</option>
                    {availDims.map(dimOpt)}
                </Select>
                {sel.dim1 && (
                    <div className="mt-1.5">
                        <Select value={sel.val1} onChange={(v) => setSel((s) => ({ ...s, val1: v }))} testid="rl-val1">
                            <option value="">— select value —</option>
                            {vals1.map((v) => <option key={v} value={v}>{v}</option>)}
                        </Select>
                    </div>
                )}
            </div>

            <label className="flex items-center gap-2 text-[11px] font-ui text-[hsl(var(--text-2))] cursor-pointer">
                <input type="checkbox" checked={sel.dim2Enabled} onChange={(e) => setSel((s) => ({ ...s, dim2Enabled: e.target.checked }))} data-testid="rl-dim2-toggle" />
                Add second dimension (pair)
            </label>

            {sel.dim2Enabled && (
                <div>
                    <SubLabel>Dimension 2</SubLabel>
                    <Select value={sel.dim2} onChange={(v) => setSel((s) => ({ ...s, dim2: v, val2: "" }))} testid="rl-dim2">
                        <option value="">— select dimension —</option>
                        {availDims.filter((d) => d.key !== sel.dim1).map(dimOpt)}
                    </Select>
                    {sel.dim2 && (
                        <div className="mt-1.5">
                            <Select value={sel.val2} onChange={(v) => setSel((s) => ({ ...s, val2: v }))} testid="rl-val2">
                                <option value="">— select value —</option>
                                {vals2.map((v) => <option key={v} value={v}>{v}</option>)}
                            </Select>
                        </div>
                    )}
                    {sel.dim2 && !sel.val2 && <div className="mt-1 text-[10px] font-ui text-[hsl(var(--warning))]">Second dimension has no value yet — it's ignored until you pick one.</div>}
                </div>
            )}

            <button
                type="button"
                onClick={() => setSel({ dim1: "", val1: "", dim2Enabled: false, dim2: "", val2: "" })}
                className="clip-bevel-sm px-2.5 py-1 text-[10.5px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]"
            >
                Clear → Whole Run
            </button>
        </div>
    );
}

// ── Discovery / What-If module ────────────────────────────────────────────────
function DiscoveryModule({ cohort, onPick, onAddExclusion }) {
    const discovery = useMemo(() => buildFilterDiscovery(cohort.trades, { dims: DIMENSIONS, topN: 30 }), [cohort.trades]);
    const rows = discovery.rows;
    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">Discovery / What-If</span>
                <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--success))]">EXACT · in-sample</span>
            </div>
            <p className="text-[10.5px] font-ui text-muted-lab italic">This removes real trades from the selected cohort and recomputes results. It is exact for this run, but still in-sample — validate out-of-sample before adopting.</p>
            {rows.length === 0 ? (
                <div className="text-[11.5px] font-ui text-muted-lab italic py-2">No meaningful candidates found for this cohort.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px] font-ui whitespace-nowrap">
                        <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[9.5px] tracking-wider text-left">
                            <th className="py-1 pr-3">Candidate</th><th className="pr-3">Dimension</th>
                            <th className="pr-3 text-right">Removed</th><th className="pr-3 text-right">W</th><th className="pr-3 text-right">L</th>
                            <th className="pr-3 text-right">Loss R Saved</th><th className="pr-3 text-right">Winner R Lost</th>
                            <th className="pr-3 text-right">Δ Net R</th><th className="pr-3 text-right">PF B→A</th><th className="pr-3 text-right">WR B→A</th><th className="pr-3">Rec</th><th></th>
                        </tr></thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} onClick={() => onPick(r)} className="border-t border-[hsl(var(--border-soft))] cursor-pointer hover:bg-[hsl(var(--panel-2)/0.3)]">
                                    <td className="py-1 pr-3 text-[hsl(var(--text-1))]">▸ {r.cohort}{r.lowSample ? <span className="text-[hsl(var(--warning))] text-[9px]"> low-n</span> : ""}</td>
                                    <td className="pr-3 text-[hsl(var(--text-2))]">{r.dimLabel}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.tradesRemoved}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.winnersRemoved}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.losersRemoved}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--success))]">+{r.lossRRemoved}R</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--danger))]">−{r.winnerRRemoved}R</td>
                                    <td className={`pr-3 text-right font-num ${rTone(r.netRImpact)}`}>{fmtR1(r.netRImpact)}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{pfShow(r.pfBefore)}→{pfShow(r.pfAfter)}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{r.before.winRate}→{r.after.winRate}%</td>
                                    <td className={`pr-3 font-ui ${recTone(r.recommendation?.tone)}`}>{r.recommendation?.label ?? "—"}</td>
                                    <td>{onAddExclusion && (
                                        <button type="button" onClick={(e) => { e.stopPropagation(); onAddExclusion(r); }} className="clip-bevel-sm px-1.5 py-0.5 text-[9.5px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--danger))]" title="Add this candidate as an exclusion experiment">+ Excl</button>
                                    )}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Cohort Experiments module (Phase 2A — EXACT: exclusions + TP retarget) ────
function MetricsRow({ label, m, delta, strong }) {
    return (
        <tr className={`border-t border-[hsl(var(--border-soft))] ${strong ? "bg-[hsl(var(--success)/0.06)]" : ""}`}>
            <td className={`py-1 pr-3 font-ui ${strong ? "text-[hsl(var(--text-1))] font-semibold" : "text-[hsl(var(--text-2))]"}`}>{label}</td>
            <td className="pr-3 text-right font-num text-[hsl(var(--text-1))]">{m.trades}</td>
            <td className="pr-3 text-right font-num"><span className={successTone}>{m.winners}</span><span className="text-[hsl(var(--text-3))]">/</span><span className={dangerTone}>{m.losers}</span></td>
            <td className={`pr-3 text-right font-num ${rTone(m.netR)}`}>{fmtR1(m.netR)}</td>
            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{pfShow(m.pf)}</td>
            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{m.winRate}%</td>
            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtR2(m.expectancy)}</td>
            <td className={`text-right font-num ${delta == null ? "text-[hsl(var(--text-3))]" : rTone(delta)}`}>{delta == null ? "—" : fmtR1(delta)}</td>
        </tr>
    );
}

function ExperimentsModule({ cohort, availDims, universe, exclusions, setExclusions, tpTarget, setTpTarget }) {
    const [b, setB] = useState({ dim1: "", val1: "", dim2Enabled: false, dim2: "", val2: "" });
    const vals1 = useMemo(() => (b.dim1 ? observedValuesFor(universe, b.dim1) : []), [universe, b.dim1]);
    const vals2 = useMemo(() => (b.dim2 ? observedValuesFor(universe, b.dim2) : []), [universe, b.dim2]);

    const experiments = useMemo(() => {
        const xs = exclusions.map((x) => buildExcludeExperiment(x.dims));
        if (tpTarget) xs.push(buildTargetExperiment(Number(tpTarget)));
        return xs;
    }, [exclusions, tpTarget]);
    const stack = useMemo(() => runExperimentStack(cohort.trades, experiments), [cohort.trades, experiments]);

    const tpStep = stack.steps.find((s) => s.type === "tp");
    const tpUnavailable = !!tpTarget && tpStep && tpStep.result && tpStep.result.available === false;
    const afterTrades = stack.combined.tradesAfter;
    const lowSample = afterTrades > 0 && afterTrades < 15;

    const canAdd = b.dim1 && b.val1 && (!b.dim2Enabled || (b.dim2 && b.val2));
    const addExclusion = () => {
        const dims = [{ dim: b.dim1, value: b.val1 }];
        if (b.dim2Enabled && b.dim2 && b.val2) dims.push({ dim: b.dim2, value: b.val2 });
        setExclusions((xs) => [...xs, { dims }]);
        setB({ dim1: "", val1: "", dim2Enabled: false, dim2: "", val2: "" });
    };
    const Select = ({ value, onChange, children, testid }) => (
        <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
            className="w-full clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.4)] px-2 py-1 text-[11.5px] font-ui text-[hsl(var(--text-1))] outline-none">{children}</select>
    );
    const dimOpt = (d) => <option key={d.key} value={d.key}>{d.label}</option>;

    return (
        <div className="space-y-3">
            <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">Cohort Experiments</span>
                <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--success))]">EXACT · in-sample</span>
            </div>
            <p className="text-[10.5px] font-ui text-muted-lab italic">Exclusions and TP retargets are reconstructed exactly from this run. They are still in-sample research candidates and must be validated OOS.</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Exclusion builder */}
                <div className="space-y-1.5">
                    <SubLabel>Exclusion</SubLabel>
                    <Select value={b.dim1} onChange={(v) => setB((s) => ({ ...s, dim1: v, val1: "" }))} testid="rl-excl-dim1">
                        <option value="">— dimension —</option>{availDims.map(dimOpt)}
                    </Select>
                    {b.dim1 && <Select value={b.val1} onChange={(v) => setB((s) => ({ ...s, val1: v }))} testid="rl-excl-val1"><option value="">— value —</option>{vals1.map((v) => <option key={v} value={v}>{v}</option>)}</Select>}
                    <label className="flex items-center gap-2 text-[10.5px] font-ui text-[hsl(var(--text-2))] cursor-pointer">
                        <input type="checkbox" checked={b.dim2Enabled} onChange={(e) => setB((s) => ({ ...s, dim2Enabled: e.target.checked }))} /> pair (second dimension)
                    </label>
                    {b.dim2Enabled && (
                        <>
                            <Select value={b.dim2} onChange={(v) => setB((s) => ({ ...s, dim2: v, val2: "" }))} testid="rl-excl-dim2"><option value="">— dimension —</option>{availDims.filter((d) => d.key !== b.dim1).map(dimOpt)}</Select>
                            {b.dim2 && <Select value={b.val2} onChange={(v) => setB((s) => ({ ...s, val2: v }))} testid="rl-excl-val2"><option value="">— value —</option>{vals2.map((v) => <option key={v} value={v}>{v}</option>)}</Select>}
                        </>
                    )}
                    <button type="button" disabled={!canAdd} onClick={addExclusion} data-testid="rl-add-exclusion"
                        className={`clip-bevel-sm px-2.5 py-1 text-[10.5px] font-ui border ${canAdd ? "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-3))] opacity-60 cursor-not-allowed"}`}>+ Add exclusion</button>
                </div>

                {/* TP target */}
                <div className="space-y-1.5">
                    <SubLabel>TP retarget</SubLabel>
                    <Select value={tpTarget} onChange={setTpTarget} testid="rl-tp-target">
                        <option value="">— no TP override —</option>
                        {targetLevels.map((t) => <option key={t} value={t}>{t}R</option>)}
                    </Select>
                    {tpUnavailable && <div className="text-[10px] font-ui text-[hsl(var(--warning))]">TP retarget unavailable — no MFE data for this cohort.</div>}
                </div>
            </div>

            {/* Active stack */}
            {(exclusions.length > 0 || tpTarget) && (
                <div>
                    <SubLabel>Active experiment stack</SubLabel>
                    <div className="flex flex-wrap gap-1.5">
                        {exclusions.map((x, i) => (
                            <span key={i} className="clip-bevel-sm px-2 py-0.5 text-[10px] font-ui border border-[hsl(var(--danger)/0.4)] text-[hsl(var(--text-2))]">
                                {i + 1}. {buildExcludeExperiment(x.dims).label}
                                <button type="button" onClick={() => setExclusions((xs) => xs.filter((_, j) => j !== i))} className="ml-1.5 text-[hsl(var(--danger))]" title="Remove">✕</button>
                            </span>
                        ))}
                        {tpTarget && (
                            <span className="clip-bevel-sm px-2 py-0.5 text-[10px] font-ui border border-[hsl(var(--accent-secondary)/0.4)] text-[hsl(var(--text-2))]">
                                {exclusions.length + 1}. TP {tpTarget}R
                                <button type="button" onClick={() => setTpTarget("")} className="ml-1.5 text-[hsl(var(--accent-secondary))]" title="Remove">✕</button>
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Results */}
            <div>
                <SubLabel>Result · combined grade {stack.combined.grade}</SubLabel>
                {lowSample && <div className="text-[10px] font-ui text-[hsl(var(--warning))] mb-1">Low sample after experiments ({afterTrades} trades) — treat any improvement as a hypothesis only.</div>}
                <div className="overflow-x-auto">
                    <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                        <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                            <th className="py-1 pr-3">Stage</th><th className="pr-3 text-right">Trades</th><th className="pr-3 text-right">W/L</th><th className="pr-3 text-right">Net R</th><th className="pr-3 text-right">PF</th><th className="pr-3 text-right">WR</th><th className="pr-3 text-right">Exp</th><th className="text-right">Δ Net R</th>
                        </tr></thead>
                        <tbody>
                            <MetricsRow label="Baseline (cohort)" m={stack.baseline} delta={null} />
                            {stack.steps.map((s, i) => (
                                <MetricsRow key={i} label={`After: ${s.label}`} m={s.after} delta={s.deltaNetR} />
                            ))}
                            {(exclusions.length > 0 || tpTarget) && <MetricsRow label="Combined (exact)" m={stack.combined.after} delta={stack.combined.deltaNetR} strong />}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Research Context banner — which run universe is being analysed ────────────
const VARIANT_SOURCES = new Set(["entry_mode_active", "entry_mode_primary", "entry_mode_fallback"]);
function universeSourceLabel(source, lazy) {
    if (source === "base_trades" || source === "active_variant" || source === "primary_variant") return "Baseline Universe";
    if (VARIANT_SOURCES.has(source)) return lazy ? "Lazy-Hydrated Universe" : "Hydrated Variant Universe";
    return "—";
}
function ResearchContextBanner({ runName, source, universeLabel, lazy, count }) {
    const variant = VARIANT_SOURCES.has(source) ? (universeLabel || "Variant") : "Baseline";
    const Field = ({ label, value, tone }) => (
        <div className="min-w-0">
            <div className="text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-3))]">{label}</div>
            <div className={`text-[12px] font-ui truncate ${tone || "text-[hsl(var(--text-1))]"}`} title={typeof value === "string" ? value : undefined}>{value}</div>
        </div>
    );
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--panel-2)/0.3)] px-3 py-2">
            <div className="text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-secondary))] mb-1.5">Research Context</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                <Field label="Run" value={runName} />
                <Field label="Variant" value={variant} />
                <Field label="Universe" value={`${count} trade${count === 1 ? "" : "s"}`} tone="font-num text-[hsl(var(--text-1))]" />
                <Field label="Source" value={universeSourceLabel(source, lazy)} tone="font-ui text-[hsl(var(--accent-secondary))]" />
            </div>
        </div>
    );
}

export default function ResearchLab() {
    const { runId, runData, runName, trades: resolvedTrades, source, universeLabel, needsHydration, loading: hydrating, error: hydrationError } = useRunDisplayUniverse();
    const universe = useMemo(() => buildResearchUniverse(resolvedTrades || []), [resolvedTrades]);

    const [sel, setSel] = useState({ dim1: "", val1: "", dim2Enabled: false, dim2: "", val2: "" });
    const [exclusions, setExclusions] = useState([]);
    const [tpTarget, setTpTarget] = useState("");

    const availDims = useMemo(() => availableDimensions(universe), [universe]);
    const selection = useMemo(() => {
        const dims = [];
        if (sel.dim1 && sel.val1) dims.push({ dim: sel.dim1, value: sel.val1 });
        if (sel.dim2Enabled && sel.dim2 && sel.val2) dims.push({ dim: sel.dim2, value: sel.val2 });
        return { dims };
    }, [sel]);
    const cohort = useMemo(() => resolveResearchCohort(universe, selection), [universe, selection]);
    const summary = useMemo(() => cohortSummary(cohort), [cohort]);
    const span = useMemo(() => dateSpan(universe), [universe]);

    // Discovery candidate → cohort selection.
    const pickRow = (r) => setSel({
        dim1: r.dimA || "", val1: r.keyA != null ? String(r.keyA) : "",
        dim2Enabled: !!r.isPair, dim2: r.isPair ? (r.dimB || "") : "", val2: r.isPair && r.keyB != null ? String(r.keyB) : "",
    });

    const lowSample = cohort.trades.length > 0 && cohort.trades.length < 15;
    const veryLow = cohort.trades.length > 0 && cohort.trades.length < 8;

    return (
        <div className="pb-12 space-y-4">
            <div>
                <h1 className="text-[18px] font-display font-semibold text-[hsl(var(--text-1))]">Research Lab</h1>
                <p className="text-[11.5px] font-ui text-muted-lab">Universal cohort research workspace. In-sample only — validate candidates out-of-sample before adopting.</p>
            </div>

            {!runData ? (
                <NeonPanel title="Research Lab">
                    <div className="py-10 text-center font-ui text-[12px] text-muted-lab">Import or select a run to use Research Lab.</div>
                </NeonPanel>
            ) : hydrating ? (
                <NeonPanel title="Research Lab">
                    <div className="py-10 text-center font-ui text-[12px] text-muted-lab">Loading run trades…</div>
                </NeonPanel>
            ) : universe.length === 0 ? (
                <NeonPanel title="Research Lab">
                    <div className="py-10 text-center font-ui text-[12px] text-muted-lab space-y-2">
                        {hydrationError ? (
                            <>
                                <div>Could not load this run's trades ({String(hydrationError)}).</div>
                                <div><Link to="/runs/active" className="text-[hsl(var(--accent-secondary))] underline">Open Run Workspace</Link> to hydrate it from the sidecar.</div>
                            </>
                        ) : needsHydration ? (
                            <>
                                <div>This run's trades aren't loaded yet.</div>
                                <div><Link to="/runs/active" className="text-[hsl(var(--accent-secondary))] underline">Open Run Workspace</Link> to hydrate it, then return.</div>
                            </>
                        ) : (
                            <div>No performance trades in this run.</div>
                        )}
                    </div>
                </NeonPanel>
            ) : (
                <>
                    <ResearchContextBanner runName={runName} source={source} universeLabel={universeLabel} lazy={Boolean(runData?.lazy)} count={universe.length} />

                    <NeonPanel title="Active run">
                        <RunContext name={runName} summary={cohortSummary({ trades: universe, label: runName })} span={span} />
                    </NeonPanel>

                    <div className="clip-bevel-sm border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] px-3 py-2">
                        <p className="text-[11px] font-ui text-[hsl(var(--warning))]">Research Lab is in-sample. Discovery candidates are hypotheses, not strategy rules — validate with walk-forward / OOS before adopting.</p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
                        <NeonPanel title="Cohort">
                            <CohortBuilder availDims={availDims} universe={universe} sel={sel} setSel={setSel} />
                        </NeonPanel>

                        <div className="space-y-4">
                            <NeonPanel title="Cohort summary">
                                <div className="space-y-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))]">{cohort.label}</span>
                                        <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--success))]">EXACT</span>
                                        {veryLow && <span className="text-[10px] font-ui text-[hsl(var(--danger))]">· very low sample (&lt;8)</span>}
                                        {!veryLow && lowSample && <span className="text-[10px] font-ui text-[hsl(var(--warning))]">· low sample (&lt;15)</span>}
                                    </div>
                                    <RunContext name="" summary={summary} span={null} />
                                </div>
                            </NeonPanel>

                            <NeonPanel title="Experiments">
                                <ExperimentsModule
                                    cohort={cohort} availDims={availDims} universe={universe}
                                    exclusions={exclusions} setExclusions={setExclusions}
                                    tpTarget={tpTarget} setTpTarget={setTpTarget}
                                />
                            </NeonPanel>

                            <NeonPanel title="Discovery">
                                <DiscoveryModule cohort={cohort} onPick={pickRow} onAddExclusion={(r) => {
                                    const dims = [{ dim: r.dimA, value: String(r.keyA) }];
                                    if (r.isPair) dims.push({ dim: r.dimB, value: String(r.keyB) });
                                    setExclusions((xs) => [...xs, { dims }]);
                                }} />
                            </NeonPanel>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
