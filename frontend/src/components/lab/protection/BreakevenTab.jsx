// BreakevenTab — Break-even research surface for Protection Lab. EXACT-only.
// Renders backend EXACT break-even scenarios per arm/trigger; arms with no exported
// scenario are marked "Not Exported". No client-side candle-walk replay is performed
// (the legacy Phase 1 REPLAY tier is disabled), so no candles are loaded.
import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { resolveBeScenarioSource, hasAnyExactBe, entryVariantHasExact, describeBeAvailability, parseBeScenarioKey } from "@/data/beResolve";
import { useLazyBeScenario } from "@/data/useLazyRows";
import { buildBeAffectedTrades } from "@/data/protectionTimeline";
import { buildSelectiveBeUniverse, buildSessionAttribution, buildBeTradeExplorerRows, DEFAULT_ARM_LEVELS } from "@/data/selectiveBeUniverse";
import { BeTradeExplorer } from "@/components/lab/protection/BeTradeExplorer";
import { BE_ARM_LEVEL_CHOICES } from "@/data/configTranslator";
import { summarizeTradeSanity } from "@/data/tradeClassification";
import { useDataset, setFocusedBeTrade, setScenario, findBeFileForRun } from "@/data/store";
import { buildProtectionLabel } from "@/data/protectionLayers";
import { familyFromKey, extractThreshold, fillModeFromKey } from "@/data/tradeUniverse";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, AlertTriangle, TrendingUp, BarChart2, Hash, Activity, Loader2, FlaskConical, Circle, CheckCircle2 } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

// Stable empty references so absent BE maps don't create new objects every
// render (which would thrash the scenario-compute effect's dependency array).
const EMPTY_BE_MAP = Object.freeze({});

// Supported BE arm levels — canonical list from configTranslator (research
// expansion adds 2.5/3/3.5R). Ungenerated arms resolve REPLAY/unavailable.
const ARM_LEVELS = BE_ARM_LEVEL_CHOICES;
const DEFAULT_ARM = 0.5;
const DEFAULT_TRIGGER = "wick";

// EXACT-ONLY — Protection Lab is EXACT-only by default. The client-side candle-walk
// REPLAY (legacy Phase 1 tier) is NOT run: exported arms show backend EXACT, non-exported
// arms show "Not Exported", and no candles are loaded. Flip BE_DEBUG to re-enable the
// per-render console diagnostic (it logs on BE-map churn).
const BE_DEBUG = false;

const TRIGGER_OPTIONS = [
    {
        value: "wick",
        label: "Wick touch",
        desc:  "Arms BE as soon as the candle wick reaches the arm level.",
    },
    {
        value: "close",
        label: "Candle close",
        desc:  "Arms BE only after the candle closes beyond the arm level. Slower but less ambiguous.",
    },
];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function rnd2(v) { return Math.round(Number(v) * 100) / 100; }
function fmtR(v)   { const n = rnd2(v); return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`; }
function fmtEff(v) { return v != null && Number.isFinite(Number(v)) ? rnd2(v).toFixed(2) : "—"; }
function fmtCov(v) { return v != null ? `${rnd2(v).toFixed(1)}%` : "—"; }
function fmtPct(v) { return v != null ? `${rnd2(v).toFixed(0)}%` : "—"; }

function computeBaseline(trades) {
    if (!Array.isArray(trades) || !trades.length) return null;
    const rs = trades.map((t) => Number(t.r) || 0);
    const netR = rs.reduce((s, r) => s + r, 0);
    const posR = rs.filter((r) => r > 0).reduce((s, r) => s + r, 0);
    const negR = rs.filter((r) => r < 0).reduce((s, r) => s + Math.abs(r), 0);
    const profitFactor = negR > 0 ? rnd2(posR / negR) : null;
    let cum = 0, peak = -Infinity, maxDrawdown = 0;
    for (const r of rs) {
        cum += r;
        if (cum > peak) peak = cum;
        const dd = cum - peak;
        if (dd < maxDrawdown) maxDrawdown = dd;
    }
    let worstLossStreak = 0, cur = 0;
    for (const r of rs) {
        if (r < 0) { cur++; if (cur > worstLossStreak) worstLossStreak = cur; }
        else cur = 0;
    }
    return { netR: rnd2(netR), maxDrawdown: rnd2(maxDrawdown), profitFactor, worstLossStreak };
}

function classifyVerdict(s) {
    if (!s || s.coveragePct < 50) {
        return { label: "NEEDS DATA", tone: "muted",
            sub: "Candle coverage is insufficient for a reliable verdict." };
    }
    if (s.deltaNetR >= 0) {
        return { label: "LIKELY HELPFUL", tone: "success",
            sub: "BE protection improves net R at this arm level. Validate with an exact backtest before applying." };
    }
    if (s.deltaNetR >= -5 || (s.deltaNetR < -5 && s.efficiencyRatio >= 0.5)) {
        return { label: "MIXED", tone: "warning",
            sub: "Winner cost and loser savings are close. Small arm-level changes may significantly alter the trade-off." };
    }
    return { label: "UNLIKELY TO HELP", tone: "danger",
        sub: "Winner cost outweighs loser savings at this arm level. Consider a wider arm or a different protection strategy." };
}

// ── Local UI primitives ───────────────────────────────────────────────────────

function Note({ tone = "muted", children }) {
    const color = tone === "warning" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]";
    return <div className={`mt-2 text-[11.5px] font-ui leading-relaxed ${color}`}>{children}</div>;
}

function ComputingRow({ label = "Computing scenarios…" }) {
    return (
        <div className="flex items-center gap-2 py-3 px-1 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(var(--accent-secondary))] shrink-0" />
            {label}
        </div>
    );
}

// ── Table column definitions ──────────────────────────────────────────────────

function buildTableColumns(armLevelR, setArmLevelR) {
    return [
        {
            key: "arm", label: "Arm", sortable: false, width: "64px",
            render: (row) => (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setArmLevelR(row.arm); }}
                    className={cn("row-chip", row.arm === armLevelR ? "row-chip-primary" : "row-chip-muted")}
                >
                    {row.arm}R
                </button>
            ),
        },
        {
            key: "source", label: "Source", sortable: false, width: "76px",
            render: (row) => (
                <Pill tone={row.source === "EXACT" ? "success" : "muted"}>
                    {row.source === "EXACT" ? "EXACT" : "Not Exported"}
                </Pill>
            ),
        },
        {
            key: "netR", label: "Net R", align: "right",
            render: (row) => row.netR != null
                ? <ColoredR value={row.netR} />
                : <span className="text-[hsl(var(--text-2))]">—</span>,
        },
        {
            key: "deltaNetR", label: "Δ Net R", align: "right",
            render: (row) => row.deltaNetR != null
                ? <ColoredR value={row.deltaNetR} />
                : <span className="text-[hsl(var(--text-2))]">—</span>,
        },
        {
            key: "profitFactor", label: "PF", align: "right",
            render: (row) => (
                <span className={cn("font-num tabular-nums",
                    row.profitFactor == null ? "text-[hsl(var(--text-2))]"
                    : row.profitFactor >= 1  ? "text-[hsl(var(--success))]"
                    :                          "text-[hsl(var(--danger))]",
                )}>
                    {row.profitFactor != null ? rnd2(row.profitFactor).toFixed(2) : "—"}
                </span>
            ),
        },
        {
            key: "maxDD", label: "Max DD", align: "right",
            render: (row) => (
                <span className="font-num tabular-nums text-[hsl(var(--danger))]">
                    {row.maxDD != null ? `${rnd2(row.maxDD).toFixed(1)}R` : "—"}
                </span>
            ),
        },
        {
            key: "worstStreak", label: "W.Streak", align: "right",
            render: (row) => <span className="font-num tabular-nums text-[hsl(var(--text-2))]">{row.worstStreak}</span>,
        },
        {
            key: "lossesSaved", label: "Saved", align: "right",
            render: (row) => <span className="font-num tabular-nums text-[hsl(var(--success))]">{row.lossesSaved}</span>,
        },
        {
            key: "winnersCut", label: "Cut", align: "right",
            render: (row) => <span className="font-num tabular-nums text-[hsl(var(--danger))]">{row.winnersCut}</span>,
        },
        {
            key: "beExits", label: "BE Exits", align: "right",
            render: (row) => <span className="font-num tabular-nums text-[hsl(var(--text-2))]">{row.beExits}</span>,
        },
        {
            key: "efficiencyRatio", label: "Eff. Ratio", align: "right",
            render: (row) => {
                const eff = row.efficiencyRatio;
                const cls = eff == null ? "text-[hsl(var(--text-2))]"
                    : eff >= 1   ? "text-[hsl(var(--success))]"
                    : eff >= 0.5 ? "text-[hsl(var(--warning))]"
                    :              "text-[hsl(var(--danger))]";
                return <span className={cn("font-num tabular-nums", cls)}>{fmtEff(eff)}</span>;
            },
        },
        {
            key: "ambigPct", label: "Ambig%", align: "right",
            render: (row) => {
                const v = row.ambigPct;
                const cls = v == null ? "text-[hsl(var(--text-2))]"
                    : v >= 50 ? "text-[hsl(var(--warning))]"
                    : v >= 25 ? "text-[hsl(var(--text-1))]"
                    :           "text-[hsl(var(--text-2))]";
                return <span className={cn("font-num tabular-nums", cls)}>{fmtPct(v)}</span>;
            },
        },
    ];
}

// ── Selective BE cohort panel ───────────────────────────────────────────────────

function CohortChips({ label, options, selected, onToggle }) {
    // options: array of strings OR { value, label }.
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="w-[64px] shrink-0 text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">{label}</span>
            {options.map((opt) => {
                const value = typeof opt === "string" ? opt : opt.value;
                const text = typeof opt === "string" ? opt : opt.label;
                const active = selected.includes(value);
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => onToggle(value)}
                        className={cn(
                            "px-2.5 py-1 rounded-[4px] border text-[10.5px] font-ui transition-colors",
                            active
                                ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                        )}
                    >
                        {text}
                    </button>
                );
            })}
        </div>
    );
}

// Human-readable label for an entry-variant key (for the EXACT-coverage notice).
function entryVariantLabel(key) {
    if (!key || key === "baseline" || key === "entry_baseline") return "Baseline";
    const fam = familyFromKey(key);
    const thr = extractThreshold(key);
    if (fam === "triggered_edge") {
        const fm = fillModeFromKey(key);
        const fmLabel = fm === "same" ? " Same" : fm === "next" ? " Next" : "";
        return `Triggered Edge${thr != null ? ` ${thr}%` : ""}${fmLabel}`;
    }
    if (fam === "penetration") return `Penetration${thr != null ? ` ${thr}%` : ""}`;
    return key;
}

// Shared formatters for the selective-BE comparison primitives.
const fmtBeR   = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${v >= 0 ? "+" : ""}${(Math.round(v * 100) / 100).toFixed(2)}R`);
const fmtBePct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
const fmtBePf  = (v) => (v == null ? "—" : v === Infinity ? "∞" : (Math.round(v * 100) / 100).toFixed(2));
// Δ is selective − original; sign convention is uniform: positive Δ = improvement
// (netR/WR/PF up; maxDrawdownR is ≤ 0, so a less-negative dip is a positive Δ).
const beDeltaTone = (d) => (d == null ? "text-[hsl(var(--text-2))]" : d > 0 ? "text-[hsl(var(--success))]" : d < 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]");
const fmtBeDeltaR = (d) => (d == null ? "—" : `${d >= 0 ? "+" : ""}${(Math.round(d * 100) / 100).toFixed(2)}R`);

/** Compact universe column — core metrics only (Original Run / Selective BE Applied). */
function BeStatRow({ k, v, vTone }) {
    return (
        <div className="flex items-center justify-between py-0.5">
            <span className="text-[10px] font-ui text-[hsl(var(--text-2))]">{k}</span>
            <span className={cn("text-[11.5px] font-num tabular-nums", vTone || "text-[hsl(var(--text-1))]")}>{v}</span>
        </div>
    );
}

function UniverseCol({ title, subtitle, tone = "muted", s, breakdown = null, titleAttr, footer = null }) {
    if (!s) return null;
    const headTone = tone === "success" ? "text-[hsl(var(--success))]" : tone === "primary" ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-1))]";
    return (
        <div className="flex-1 min-w-0 rounded-[4px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)] px-3 py-2">
            <div className={cn("text-[11px] font-ui font-semibold", headTone)} title={titleAttr}>{title}</div>
            {subtitle && <div className="text-[9px] font-ui text-[hsl(var(--text-2)/0.8)]">{subtitle}</div>}
            <div className="mt-1.5">
                <BeStatRow k="Net R" v={fmtBeR(s.netR)} vTone={s.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"} />
                <BeStatRow k="Win Rate" v={fmtBePct(s.winRate)} />
                <BeStatRow k="Profit Factor" v={fmtBePf(s.profitFactor)} />
                <BeStatRow k="Max DD" v={fmtBeR(s.maxDrawdownR)} vTone="text-[hsl(var(--danger))]" />
                <BeStatRow k="Trades" v={String(s.performanceTrades ?? s.total ?? "—")} />
                {breakdown && (
                    <div className="mt-1 border-t border-[hsl(var(--border-soft)/0.6)] pt-1">
                        <BeStatRow k="Wins / Losses" v={`${s.wins ?? 0} / ${s.losses ?? 0}`} />
                        <BeStatRow k="Long / Short" v={`${breakdown.longs ?? 0} / ${breakdown.shorts ?? 0}`} />
                        <BeStatRow k="CHoCH / BOS" v={`${breakdown.choch ?? 0} / ${breakdown.bos ?? 0}`} />
                    </div>
                )}
                {footer}
            </div>
        </div>
    );
}

/** Prominent Difference card — selective-vs-original. The panel's headline answer. */
function DifferenceCard({ o, sel, affected, lossesSaved, winnersCut, title = "Difference vs Original", titleAttr }) {
    if (!o || !sel) return null;
    const dNetR = sel.netR - o.netR;
    const dWR   = (o.winRate == null || sel.winRate == null) ? null : sel.winRate - o.winRate;
    const bothPfFinite = Number.isFinite(o.profitFactor) && Number.isFinite(sel.profitFactor);
    const dPF   = bothPfFinite ? sel.profitFactor - o.profitFactor : null;
    const dDD   = (o.maxDrawdownR == null || sel.maxDrawdownR == null) ? null : sel.maxDrawdownR - o.maxDrawdownR;
    const Big = ({ k, v, tone }) => (
        <div className="flex flex-col">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">{k}</span>
            <span className={cn("text-[15px] font-num tabular-nums font-semibold", tone)}>{v}</span>
        </div>
    );
    const Small = ({ k, v, tone }) => (
        <div className="flex items-center justify-between py-0.5">
            <span className="text-[10px] font-ui text-[hsl(var(--text-2))]">{k}</span>
            <span className={cn("text-[11.5px] font-num tabular-nums", tone || "text-[hsl(var(--text-1))]")}>{v}</span>
        </div>
    );
    const dWRs = dWR == null ? "—" : `${dWR >= 0 ? "+" : ""}${Math.round(dWR)}%`;
    const dPFs = dPF == null ? "—" : `${dPF >= 0 ? "+" : ""}${(Math.round(dPF * 100) / 100).toFixed(2)}`;
    return (
        <div className="flex-1 min-w-0 rounded-[6px] border-2 border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.06)] px-3.5 py-2.5">
            <div className="text-[11px] font-ui font-semibold text-[hsl(var(--accent-primary))] mb-2" title={titleAttr}>{title}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-2">
                <Big k="Δ Net R"         v={fmtBeDeltaR(dNetR)} tone={beDeltaTone(dNetR)} />
                <Big k="Δ Win Rate"      v={dWRs}               tone={beDeltaTone(dWR)} />
                <Big k="Δ Profit Factor" v={dPFs}               tone={beDeltaTone(dPF)} />
                <Big k="Δ Max DD"        v={fmtBeDeltaR(dDD)}   tone={beDeltaTone(dDD)} />
            </div>
            <div className="border-t border-[hsl(var(--border-soft))] pt-1.5">
                <Small k="Trades affected" v={String(affected ?? 0)} />
                <Small k="Losses saved"   v={lossesSaved == null ? "—" : String(lossesSaved)} tone="text-[hsl(var(--success))]" />
                <Small k="Winners cut"    v={winnersCut == null ? "—" : String(winnersCut)} tone="text-[hsl(var(--danger))]" />
            </div>
        </div>
    );
}

// ── Debug attribution table (per-session affected / saved / cut / Δ R) ────────
// `attribution` = { rows:[{session,affected,saved,cut,deltaR}], totals }.
// `sessionOrder` (optional) forces a fixed row set so excluded sessions show 0s
// in the cohort table. `includedSessions` (lowercased Set) highlights in-cohort
// rows. `tone` = "cohort" (bright) | "global" (muted reference).
function AttributionTable({ title, subtitle, attribution, sessionOrder = null, includedSessions = null, tone = "cohort", summaryDelta = null }) {
    if (!attribution) return null;
    const bySession = new Map(attribution.rows.map((r) => [r.session, r]));
    const sessions = sessionOrder && sessionOrder.length
        ? sessionOrder
        : attribution.rows.map((r) => r.session);
    const zero = (session) => ({ session, applied: 0, saved: 0, cut: 0, tpKept: 0, newsFlat: 0, same: 0, deltaR: 0 });
    const rows = sessions.map((s) => bySession.get(s) || zero(s));
    const t = attribution.totals;
    const isCohort = tone === "cohort";
    const dR = (v) => `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}R`;
    const dRTone = (v) => (v > 0.005 ? "text-[hsl(var(--success))]" : v < -0.005 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]");
    const deltaMismatch = summaryDelta != null && Math.abs(Number(summaryDelta) - Number(t.deltaR)) > 0.011;
    // Compact headers (tooltip = full meaning). Columns: Applied · Saved · Cut · TP Kept · News Flat · Same · Δ R.
    const HEADS = [
        { k: "applied", h: "Appl", t: "BE Applied — trade received the BE rule (SL moved to BE)" },
        { k: "saved", h: "Sv", t: "Saved — original loser improved by BE", c: "text-[hsl(var(--success))]" },
        { k: "cut", h: "Ct", t: "Cut — original winner worsened by BE", c: "text-[hsl(var(--danger))]" },
        { k: "tpKept", h: "TP", t: "TP Kept — BE applied but trade still finished a winner (no R change)" },
        { k: "newsFlat", h: "Nws", t: "News Flat — BE applied but final result is news-flattened / forced flat" },
        { k: "same", h: "Sm", t: "Same — unchanged (same loss / breakeven / other), R not changed by BE" },
    ];
    return (
        <div className={cn(
            "rounded-[4px] border p-2 flex flex-col gap-1",
            isCohort
                ? "border-[hsl(var(--accent-secondary)/0.55)] bg-[hsl(var(--accent-secondary)/0.08)]"
                : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)]",
        )}>
            <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-[11px] font-ui font-semibold uppercase tracking-[0.06em]", isCohort ? "text-[hsl(var(--accent-secondary))]" : "text-[hsl(var(--text-2))]")}>{title}</span>
                {subtitle && <span className="text-[9.5px] font-ui text-[hsl(var(--text-3))]">{subtitle}</span>}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-ui tabular-nums">
                <thead>
                    <tr className="text-[hsl(var(--text-3))]">
                        <th className="text-left font-normal py-0.5">Sess</th>
                        {HEADS.map((c) => <th key={c.k} className="text-right font-normal px-0.5" title={c.t}>{c.h}</th>)}
                        <th className="text-right font-normal px-0.5" title="Δ R — net R change vs original, summed">Δ R</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const included = !isCohort || includedSessions == null || includedSessions.size === 0
                            || includedSessions.has(String(r.session).trim().toLowerCase());
                        return (
                            <tr key={r.session} className={cn(
                                "border-t border-[hsl(var(--border-soft)/0.4)]",
                                isCohort && !included ? "opacity-40" : "",
                                isCohort && included && r.applied > 0 ? "text-[hsl(var(--text))]" : "text-[hsl(var(--text-2))]",
                            )}>
                                <td className="text-left py-0.5">{r.session}</td>
                                {HEADS.map((c) => <td key={c.k} className={cn("text-right px-0.5", c.c)}>{r[c.k] ?? 0}</td>)}
                                <td className={cn("text-right px-0.5", dRTone(r.deltaR))}>{dR(r.deltaR)}</td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr className="border-t border-[hsl(var(--border-soft))] font-semibold text-[hsl(var(--text))]">
                        <td className="text-left py-0.5">Total</td>
                        {HEADS.map((c) => <td key={c.k} className={cn("text-right px-0.5", c.c)}>{t[c.k] ?? 0}</td>)}
                        <td className={cn("text-right px-0.5", dRTone(t.deltaR))}>{dR(t.deltaR)}</td>
                    </tr>
                </tfoot>
            </table>
            </div>
            {summaryDelta != null && (
                <span className={cn("text-[9.5px] font-ui", deltaMismatch ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-3))]")}>
                    {deltaMismatch ? `⚠ footer Δ ${dR(t.deltaR)} ≠ summary ${dR(summaryDelta)}` : `✓ matches summary Δ ${dR(summaryDelta)}`}
                </span>
            )}
        </div>
    );
}

function SelectiveBeCohortPanel({
    beCohorts, toggleCohort, resetCohorts, cohortsActive, compare, selective, globalCounts, scenarioLabel, triggerBasis, onSetTrigger,
    scenarioArm, onSetArmLevel,
    cohortAttribution = null, globalAttribution = null, globalSummaryDelta = null, showAttribution = true, onToggleAttribution,
    onOpenAsResultView, openAsResultViewEnabled = false, activeProtectionLabel = null, onClearResultViewLayer,
    exactCoverage = null,
}) {
    if (!compare) return null;
    const o = compare.original;
    const sel = compare.selective;
    const noFilter = selective?.isNoFilterSelected ?? !cohortsActive;
    const filterLabel = selective?.selectedFilterLabel ?? "None";
    const applied = selective?.applied ?? 0;
    const noBe = noFilter || applied === 0;
    const card2Subtitle = noBe ? "No BE applied" : `BE applied to: ${filterLabel}`;
    return (
        <NeonPanel
            title="Apply BE to Cohorts"
            action={
                <div className="flex items-center gap-1.5 flex-wrap">
                    {noBe ? (
                        <Pill tone="muted">No BE applied · 0 trades</Pill>
                    ) : (
                        <>
                            <Pill tone="muted">BE applied to {applied} trades</Pill>
                            <Pill tone="success">Saved {selective?.summary.lossesSaved ?? 0}</Pill>
                            <Pill tone="danger">Cut {selective?.summary.winnersCut ?? 0}</Pill>
                            <Pill tone="muted">Filter: {filterLabel}</Pill>
                        </>
                    )}
                    <Pill tone="warning">EXPLORATORY</Pill>
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                {/* Active protected Result View banner — separate from the local
                    preview below so the two are never conflated. */}
                {activeProtectionLabel && (
                    <div className="flex items-center gap-2 flex-wrap px-2.5 py-1.5 rounded-[4px] border border-[hsl(var(--accent-secondary)/0.5)] bg-[hsl(var(--accent-secondary)/0.1)]">
                        <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))]">Active View</span>
                        <span className="text-[11px] font-ui font-semibold text-[hsl(var(--text))]">{activeProtectionLabel}</span>
                        <Pill tone="warning">EXPLORATORY</Pill>
                        <span className="text-[10px] font-ui text-[hsl(var(--text-2)/0.8)]">Applied app-wide. The cards below are a separate local preview.</span>
                        {onClearResultViewLayer && (
                            <button type="button" onClick={onClearResultViewLayer} className="row-chip row-chip-muted text-[10.5px] ml-auto">Clear View Layer</button>
                        )}
                    </div>
                )}
                {/* Promotion: turn the local selective-BE preview into a global
                    Result View. Gated on EXACT + ≥1 cohort filter + ≥1 trade. */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={onOpenAsResultView}
                        disabled={!openAsResultViewEnabled}
                        className={cn(
                            "px-3 py-1 rounded-[4px] border text-[10.5px] font-ui font-semibold transition-colors",
                            openAsResultViewEnabled
                                ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.55)] text-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.24)] cursor-pointer"
                                : "bg-[hsl(var(--panel-2)/0.3)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2)/0.5)] cursor-not-allowed",
                        )}
                        title={openAsResultViewEnabled
                            ? "Apply this selective BE across the whole app (Run Detail, Strategy Map, labs) as an exploratory View."
                            : "Select an EXACT BE scenario and at least one cohort that applies to ≥1 trade."}
                    >
                        Open as View
                    </button>
                    <span className="text-[10px] font-ui text-[hsl(var(--text-2)/0.75)]">
                        Promotes the preview below to a global protected View. Does not silently apply global BE.
                    </span>
                </div>
                {/* Filters (left) + debug attribution panels (right), above the cards. */}
                <div className="flex gap-3 flex-wrap lg:flex-nowrap items-start">
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-snug">
                    The scenario ({scenarioLabel}) sets the BE rule. Arm Level (below) sets which trades are eligible —
                    by default the scenario&apos;s own arm. Direction / Structure / Session chips further narrow the cohort.
                </p>

                <CohortChips label="Direction" options={["Long", "Short"]} selected={beCohorts.directions} onToggle={(v) => toggleCohort("directions", v)} />
                <CohortChips label="Structure" options={["CHoCH", "BOS"]} selected={beCohorts.structures} onToggle={(v) => toggleCohort("structures", v)} />
                <CohortChips label="Session" options={["Asia", "London", "London Lull", "New York", "Outside"]} selected={beCohorts.sessions} onToggle={(v) => toggleCohort("sessions", v)} />
                {/* Arm Level Reached — SINGLE-select (radio). Always set; defaults
                    to the scenario arm. Reaching a higher level implies the lower
                    ones, so only one threshold is meaningful at a time. */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-[64px] shrink-0 text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">Arm Level</span>
                        {BE_ARM_LEVEL_CHOICES.map((lvl) => {
                            const active = beCohorts.armLevel === lvl;
                            const isScenarioArm = lvl === scenarioArm;
                            // Only arm levels with a GENERATED BE scenario (current trigger)
                            // are selectable — matches the main Arm Level card. Un-run arms
                            // (e.g. 0.25R) are greyed instead of offered.
                            const armSet = exactCoverage?.armsByTrigger?.[triggerBasis];
                            const covered = !exactCoverage?.hasAny
                                || (!!armSet && [...armSet].some((a) => Math.abs(Number(a) - Number(lvl)) < 1e-6));
                            return (
                                <button
                                    key={lvl}
                                    type="button"
                                    disabled={!covered}
                                    onClick={() => { if (covered) onSetArmLevel(lvl); }}
                                    className={cn(
                                        "px-2.5 py-1 rounded-[4px] border text-[10.5px] font-ui transition-colors",
                                        !covered
                                            ? "opacity-40 cursor-not-allowed bg-[hsl(var(--panel-2)/0.2)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]"
                                            : active
                                                ? "bg-[hsl(var(--accent-secondary)/0.16)] border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]"
                                                : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                                    )}
                                    title={!covered
                                        ? `${lvl}R BE was not generated for this run — re-run with this arm to enable it`
                                        : isScenarioArm ? "Scenario arm level (default)" : `Apply the ${scenarioArm}R BE only to trades that reached ${lvl}R`}
                                >
                                    {lvl}R{isScenarioArm ? " ·" : ""}
                                </button>
                            );
                        })}
                    </div>
                    <p className="pl-[72px] text-[10px] font-ui text-[hsl(var(--text-3))] leading-snug">
                        {beCohorts.armLevel == null
                            ? "No arm level selected — BE is not applied. Click an arm level to apply BE; click it again to remove."
                            : beCohorts.armLevel === scenarioArm
                                ? `Scenario applies ${scenarioArm}R BE only to trades that reached ${scenarioArm}R (the scenario's own arm).`
                                : `Scenario applies ${scenarioArm}R BE only to trades that reached ${beCohorts.armLevel}R.`}
                    </p>
                </div>
                {onSetTrigger && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-[64px] shrink-0 text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">Arm Trigger</span>
                        {[{ value: "wick", label: "Wick" }, { value: "close", label: "Candle Close" }].map((opt) => {
                            const active = triggerBasis === opt.value;
                            // Grey out a trigger basis that has no EXACT BE generated for
                            // this entry view (matches the main scenario selector).
                            const covered = !exactCoverage?.hasAny || exactCoverage.triggers.has(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    disabled={!covered}
                                    onClick={() => { if (covered) onSetTrigger(opt.value); }}
                                    title={!covered ? `${opt.label} BE was not generated for this entry view — re-run with this trigger to enable EXACT` : undefined}
                                    className={cn(
                                        "px-2.5 py-1 rounded-[4px] border text-[10.5px] font-ui transition-colors",
                                        !covered
                                            ? "opacity-40 cursor-not-allowed bg-[hsl(var(--panel-2)/0.2)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]"
                                            : active
                                                ? "bg-[hsl(var(--accent-secondary)/0.16)] border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]"
                                                : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                                    )}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                        <span className="text-[10px] font-ui text-[hsl(var(--text-2)/0.7)]">How the BE arm is reached — wick touch vs candle body close.</span>
                    </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={resetCohorts} className="row-chip row-chip-muted text-[10.5px]">Reset to scenario arm</button>
                    <span className="text-[10px] font-ui text-[hsl(var(--text-2)/0.8)]">Direction/Structure/Session: within a group = OR, across groups = AND. Arm Level is single-select and always set. Reset clears chips and restores the {scenarioArm}R scenario arm.</span>
                </div>
                </div>{/* end left filter column */}

                {/* Right: debug attribution panels — side by side, visible while changing filters. */}
                <div className="w-full lg:w-[560px] shrink-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">Attribution Debug</span>
                        <button
                            type="button"
                            onClick={onToggleAttribution}
                            className={cn(
                                "px-2 py-0.5 rounded-[4px] border text-[10.5px] font-ui transition-colors",
                                showAttribution
                                    ? "bg-[hsl(var(--accent-secondary)/0.16)] border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]"
                                    : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]",
                            )}
                            title="Show/hide the per-session attribution tables. Default ON."
                        >
                            {showAttribution ? "Show Attribution Debug: ON" : "Show Attribution Debug: OFF"}
                        </button>
                    </div>
                    {showAttribution && (
                        <div className="flex flex-col sm:flex-row gap-2 items-start">
                            <div className="flex-1 min-w-0 w-full">
                                <AttributionTable
                                    title="Current Cohort Impact"
                                    subtitle="follows filters"
                                    tone="cohort"
                                    attribution={cohortAttribution}
                                    sessionOrder={(globalAttribution?.rows || []).map((r) => r.session)}
                                    includedSessions={new Set((beCohorts.sessions || []).map((s) => String(s).trim().toLowerCase()))}
                                    summaryDelta={selective?.summary?.deltaNetR}
                                />
                            </div>
                            <div className="flex-1 min-w-0 w-full">
                                <AttributionTable
                                    title="Global BE Impact"
                                    subtitle="all trades · ignores filters"
                                    tone="global"
                                    attribution={globalAttribution}
                                    summaryDelta={globalSummaryDelta}
                                />
                            </div>
                        </div>
                    )}
                </div>
                </div>{/* end filters + attribution row */}

                {/* Original Run vs Original Run + Selective BE → Difference */}
                <div className="flex gap-3 flex-wrap lg:flex-nowrap items-stretch">
                    <UniverseCol
                        title="Original Run" subtitle="Full run · no BE" tone="muted" s={o}
                        breakdown={compare.fullBreakdown}
                        titleAttr="The run exactly as originally traded. No BE applied."
                    />
                    <UniverseCol
                        title="Original Run + Selective BE" subtitle={card2Subtitle} tone={noFilter ? "muted" : "success"} s={sel}
                        breakdown={compare.fullBreakdown}
                        titleAttr="The same full run, but trades matching your selected chips use the selected BE scenario."
                    />
                    <DifferenceCard
                        title="Difference"
                        titleAttr="How much the full run changes after applying BE only to the selected cohort."
                        o={o}
                        sel={sel}
                        affected={applied}
                        lossesSaved={selective?.summary.lossesSaved}
                        winnersCut={selective?.summary.winnersCut}
                    />
                </div>

                {/* Counts + warnings */}
                <div className="flex items-center gap-3 flex-wrap text-[11px] font-ui text-[hsl(var(--text-2))]">
                    {noFilter && <Pill tone="muted">No BE applied — pick cohorts above</Pill>}
                    {!noFilter && selective?.summary.lowSample && <Pill tone="warning">Low sample ({selective.summary.sampleSize})</Pill>}
                    {selective?.warnings?.includes("unmatched_be") && <Pill tone="warning">{selective.skippedMissingBe} missing BE → kept original</Pill>}
                </div>

                <Note tone="warning">
                    Selective BE is exploratory. Cohort slicing is prone to overfitting — always check sample size
                    and the impact. Validate on separate runs before treating it as a rule.
                </Note>
            </div>
        </NeonPanel>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BreakevenTab({
    trades, activeRun, activeRunId,
    beResults, beTradesByMode, executionMode,
    entryVariantKey = "baseline", resultViewLabel,
}) {
    // BE Exact Replay maps (BE-FRONTEND-INTEGRATION P2 · variant-aware). Storage
    // is nested beResults/beTradesByMode[mode][entryVariantKey][beKey]. EXACT is
    // resolved per the CURRENT result view's entry variant; a variant NEVER
    // falls back to baseline BE. Anything without exact BE for the current view
    // is shown as "Not Exported" (EXACT-only — no client-side replay).
    const beResultsMap     = beResults     ?? activeRun?.beResults     ?? EMPTY_BE_MAP;
    const beTradesByModeMap = beTradesByMode ?? activeRun?.beTradesByMode ?? EMPTY_BE_MAP;
    const beExecutionMode  = executionMode ?? activeRun?.primaryVariant ?? null;
    const requestedEntryVariantKey = entryVariantKey || "baseline";
    const requestedViewLabel = resultViewLabel || entryVariantLabel(requestedEntryVariantKey);

    // Does this run have ANY exact BE?
    const beDataPresentAnywhere = React.useMemo(
        () => hasAnyExactBe(beResultsMap, beTradesByModeMap),
        [beResultsMap, beTradesByModeMap],
    );
    // NO-BE GUARD — did this run generate ANY BE scenario at all? Resident EXACT maps
    // (beDataPresentAnywhere) OR the generated scenario index (covers lazy/large runs
    // whose BE rows are deferred). When false, BE was disabled / never run, so we show
    // the "No BE scenarios were run for this run." panel.
    const hasAnyBeScenario = Boolean(
        beDataPresentAnywhere
        || (Array.isArray(activeRun?.beScenarioIndex) && activeRun.beScenarioIndex.length > 0)
    );
    // Entry variants that HAVE exact BE on this run (mode-level; independent of the
    // active result view). availableEntryVariantKeys = union of entry keys with BE.
    const beVariantsWithExact = React.useMemo(
        () => describeBeAvailability(beResultsMap, beTradesByModeMap, { executionMode: beExecutionMode })
            .availableEntryVariantKeys || [],
        [beResultsMap, beTradesByModeMap, beExecutionMode],
    );
    // Default entry variant for the BE view. When BE was run for variants, a VARIANT
    // is the default — baseline is only a fallback (shown when it's the active view's
    // own variant, or when no variant BE exists):
    //   1. active result view's variant, if non-baseline and has BE
    //   2. else first non-baseline variant with BE   (prefer variants)
    //   3. else active view's variant if it has BE   (baseline view + baseline-only BE)
    //   4. else baseline
    const defaultBeVariant = React.useMemo(() => {
        const has = (k) => beVariantsWithExact.includes(k);
        const nonBaseline = beVariantsWithExact.filter((k) => k && k !== "baseline");
        if (requestedEntryVariantKey !== "baseline" && has(requestedEntryVariantKey)) return requestedEntryVariantKey;
        if (nonBaseline.length) return nonBaseline[0];
        if (has(requestedEntryVariantKey)) return requestedEntryVariantKey;
        return "baseline";
    }, [beVariantsWithExact, requestedEntryVariantKey]);
    // User-overridable selection of which entry variant's BE to view (chips below).
    // Resets when the run / active result view changes so a new run re-defaults.
    const [beVariantSelection, setBeVariantSelection] = React.useState(null);
    React.useEffect(() => { setBeVariantSelection(null); }, [entryVariantKey, activeRunId]);
    // Keep the selection valid if the available variants change.
    const beEntryVariantKey = (beVariantSelection && beVariantsWithExact.includes(beVariantSelection))
        ? beVariantSelection
        : defaultBeVariant;
    const viewLabel = entryVariantLabel(beEntryVariantKey);

    const hasExact = React.useMemo(
        () => entryVariantHasExact(beResultsMap, beTradesByModeMap, {
            executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey,
        }),
        [beResultsMap, beTradesByModeMap, beExecutionMode, beEntryVariantKey],
    );
    // BE-EXACT-COVERAGE — which (trigger, arm) BE scenarios were actually generated
    // for the CURRENT entry variant. Drives greying-out of un-run arm/trigger options
    // so the user can't select a scenario that silently falls back to REPLAY. Derived
    // from the generated scenario keys (independent of trigger/arm → no TDZ here).
    const beExactCoverage = React.useMemo(() => {
        const d = describeBeAvailability(beResultsMap, beTradesByModeMap, {
            executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey,
        });
        const keys = new Set([...(d.beResultsScenarioKeys || []), ...(d.beTradesScenarioKeys || [])]);
        // Include the lazy/cube scenario index: a large run defers BE trade rows, so
        // only the loaded scenario(s) appear in beResults/beTradesByMode — the full
        // set of GENERATED arms/triggers lives in beScenarioIndex. Without this, the
        // selectors would grey every arm except the one already loaded (bug: "only
        // 0.5R selectable"). Filter the index to the current entry variant + mode.
        const idx = Array.isArray(activeRun?.beScenarioIndex) ? activeRun.beScenarioIndex : [];
        for (const s of idx) {
            if (!s || !s.scenarioKey) continue;
            if (beExecutionMode && s.executionMode && s.executionMode !== beExecutionMode) continue;
            if ((s.entryVariantKey || "baseline") !== beEntryVariantKey) continue;
            keys.add(s.scenarioKey);
        }
        const triggers = new Set();
        const armsByTrigger = {};
        for (const k of keys) {
            const p = parseBeScenarioKey(k);
            if (!p || p.armLevelR == null) continue;
            triggers.add(p.triggerBasis);
            (armsByTrigger[p.triggerBasis] || (armsByTrigger[p.triggerBasis] = new Set())).add(p.armLevelR);
        }
        return { hasAny: keys.size > 0, triggers, armsByTrigger };
    }, [beResultsMap, beTradesByModeMap, beExecutionMode, beEntryVariantKey, activeRun]);
    const isArmExact = React.useCallback((arm, trigger) => {
        const set = beExactCoverage.armsByTrigger[trigger];
        return !!set && [...set].some((a) => Math.abs(Number(a) - Number(arm)) < 1e-6);
    }, [beExactCoverage]);
    // ── All hooks unconditionally before any early return ─────────────────

    // EXACT-ONLY — Protection Lab loads no candles for BE; backend EXACT needs none.
    const { SCENARIO } = useDataset();

    const [armLevelR, setArmLevelR]       = React.useState(DEFAULT_ARM);
    const [triggerBasis, setTriggerBasis] = React.useState(DEFAULT_TRIGGER);

    // EXACT-ONLY — default the selection onto an EXPORTED (arm, trigger) so the main view
    // shows EXACT data, not a blank "Not Exported" cell (e.g. a run that only exported
    // 0.25R should land on 0.25R). Only moves when the current selection isn't exported;
    // once it lands on an exported cell, isArmExact is true and it stops (no loop).
    React.useEffect(() => {
        if (!beExactCoverage.hasAny) return;
        const triggers = [...(beExactCoverage.triggers || [])];
        if (!triggers.length) return;
        const trig = triggers.includes(triggerBasis) ? triggerBasis : triggers[0];
        if (trig !== triggerBasis) setTriggerBasis(trig);
        if (!isArmExact(armLevelR, trig)) {
            const arms = [...(beExactCoverage.armsByTrigger[trig] || [])].sort((a, b) => a - b);
            if (arms.length) setArmLevelR(arms[0]);
        }
    }, [beExactCoverage, isArmExact, armLevelR, triggerBasis]);

    // LARGE-RUN-IMPORT Phase 2 — for a lazy/large run, lazily fetch the SELECTED
    // BE scenario's rows (one CSV) so EXACT replaces the REPLAY/unavailable
    // fallback. No-op for small/eager runs and once the scenario is loaded.
    // beTradesByModeMap updates via the store notify, re-resolving EXACT below.
    const beLazyStatus = useLazyBeScenario(activeRunId, activeRun, {
        executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey, triggerBasis, armLevelR,
    });

    // ── BE EXACT diagnostic ───────────────────────────────────────────────
    // Logs exactly why the tab is showing EXACT or REPLAY for the current run +
    // selection, so a "why no EXACT?" can be answered from the browser console
    // without guesswork. Cheap, read-only, fires when the run/selection changes.
    React.useEffect(() => {
        // EXACT-ONLY — diagnostic logging is OFF by default (it logs a large object on
        // every BE-map change, which inflated memory during replay churn). Flip BE_DEBUG.
        if (!BE_DEBUG) return;
        const d = describeBeAvailability(beResultsMap, beTradesByModeMap, {
            executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey, triggerBasis, armLevelR,
        });
        const resolved = resolveBeScenarioSource({
            armLevelR, triggerBasis, executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey,
            beResults: beResultsMap, beTradesByMode: beTradesByModeMap,
        });
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[BE] ${resolved.source} · run=${activeRunId ?? "?"} · view=${beEntryVariantKey} · ${triggerBasis} ${armLevelR}R`);
        // eslint-disable-next-line no-console
        console.info({
            activeRunId,
            executionModePassed: beExecutionMode,
            resolvedExecutionMode: d.resolvedExecutionMode,
            entryVariantKey: beEntryVariantKey,
            resultViewLabel: viewLabel,
            entryHasExact: d.entryHasExact,
            availableEntryVariantKeys: d.availableEntryVariantKeys,
            hasAnyExact: d.hasAnyExact,
            beResultsScenarioKeys: d.beResultsScenarioKeys,
            beTradesScenarioKeys: d.beTradesScenarioKeys,
            requestedKey: d.requestedKey,
            source: resolved.source,
            reason: resolved.reason,
            matchedScenarioKey: resolved.scenarioKey,
            // LARGE-RUN-IMPORT Phase 2 — lazy BE load status for this selection.
            lazyLoading: beLazyStatus.loading,
            lazyError: beLazyStatus.error,
        });
        // eslint-disable-next-line no-console
        console.groupEnd();
    }, [activeRunId, armLevelR, triggerBasis, beExecutionMode, beEntryVariantKey, beResultsMap, beTradesByModeMap, viewLabel, beLazyStatus.loading, beLazyStatus.error]);

    // EXACT-only scenario list.
    // null  = computing (loading state)
    // []    = nothing to compute (gate failed)
    // [...] = ready
    const [scenarios, setScenarios] = React.useState(null);

    React.useEffect(() => {
        // EXACT-ONLY scenario builder. Resolve each arm from backend EXACT BE; arms with
        // no exported (or not-yet-loaded) scenario are marked NOT_EXPORTED. The legacy
        // candle-walk REPLAY is NOT run here — no candles, no candle index, no idle-callback
        // heavy pass. Cheap: O(arms) resolver lookups, so we compute synchronously.
        if (!hasAnyBeScenario) {
            setScenarios([]);
            return;
        }
        const baseline = computeBaseline(trades);
        const result = ARM_LEVELS.map((arm) => {
            const resolved = resolveBeScenarioSource({
                armLevelR: arm,
                triggerBasis,
                executionMode: beExecutionMode,
                entryVariantKey: beEntryVariantKey,
                beResults: beResultsMap,
                beTradesByMode: beTradesByModeMap,
                baseline,
            });
            if (resolved.source === "EXACT") {
                return { armLevelR: arm, summary: resolved.summary, source: "EXACT", scenarioKey: resolved.scenarioKey };
            }
            // Not exported (or not yet loaded) — never client-side REPLAY.
            return { armLevelR: arm, summary: null, source: "NOT_EXPORTED", scenarioKey: null };
        });
        setScenarios(result);
    }, [trades, triggerBasis, hasExact, beEntryVariantKey, beResultsMap, beTradesByModeMap, beExecutionMode, hasAnyBeScenario]); // eslint-disable-line react-hooks/exhaustive-deps

    // Must be before any early return (hooks rule).
    const tableColumns = React.useMemo(
        () => buildTableColumns(armLevelR, setArmLevelR),
        [armLevelR],
    );

    // ── Affected-trade list (Protection Lab → Break-even) ─────────────────
    // EXACT-only for V1. Resolves the SELECTED arm + trigger for the current
    // result view's entry variant, then lists trades the BE stop actually fired
    // on (loss saved / winner cut / neutral BE exit when unpaired).
    const navigate = useNavigate();
    const selectedBeScenario = React.useMemo(() => {
        if (!hasExact) return null;
        return resolveBeScenarioSource({
            armLevelR, triggerBasis, executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey,
            beResults: beResultsMap, beTradesByMode: beTradesByModeMap,
        });
    }, [hasExact, armLevelR, triggerBasis, beExecutionMode, beEntryVariantKey, beResultsMap, beTradesByModeMap]);
    const affectedRows = React.useMemo(() => {
        if (selectedBeScenario?.source !== "EXACT" || !Array.isArray(selectedBeScenario.trades)) return [];
        return buildBeAffectedTrades({
            beTrades: selectedBeScenario.trades,
            baselineTrades: trades,
            scenario: { armLevelR, triggerBasis, beScenarioKey: selectedBeScenario.scenarioKey, stopBufferR: 0, delayCandles: 0 },
        });
    }, [selectedBeScenario, trades, armLevelR, triggerBasis]);
    const onViewBeTradeOnMap = React.useCallback((row) => {
        setFocusedBeTrade({
            runId: activeRunId,
            tradeId: row.baseTradeId || row.id,
            beArmLevel: armLevelR,
            beTriggerBasis: triggerBasis,
        });
        navigate("/strategy-map");
    }, [activeRunId, armLevelR, triggerBasis, navigate]);

    // ── Selective BE (apply BE to cohorts) — EXACT only, current view scoped ──
    // ARM-LEVEL-UX-FIX: Arm Level Reached is now a SINGLE value (armLevel), always
    // set, defaulting to the current scenario arm (armLevelR). Direction/structure/
    // session stay multi-select arrays.
    const [beCohorts, setBeCohorts] = React.useState({ directions: [], structures: [], sessions: [], armLevel: armLevelR });
    // Keep the arm filter defaulted to the scenario arm: when the user picks a
    // different BE scenario (armLevelR changes), reset the arm filter to it. The
    // user can still pick a different arm chip afterwards (single-select radio).
    React.useEffect(() => {
        setBeCohorts((c) => (c.armLevel === armLevelR ? c : { ...c, armLevel: armLevelR }));
    }, [armLevelR]);
    const toggleCohort = React.useCallback((dim, value) => {
        setBeCohorts((c) => {
            const cur = c[dim] || [];
            const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
            return { ...c, [dim]: next };
        });
    }, []);
    // Arm Level Reached is nullable single-select: clicking a level selects it;
    // clicking the active level again deselects it (→ null = no BE applied).
    const setArmLevel = React.useCallback((value) => {
        setBeCohorts((c) => ({ ...c, armLevel: c.armLevel === value ? null : value }));
    }, []);
    // Reset clears direction/structure/session and restores the arm to the
    // scenario arm (NOT empty) — arm is always set in normal use.
    const resetCohorts = React.useCallback(
        () => setBeCohorts({ directions: [], structures: [], sessions: [], armLevel: armLevelR }),
        [armLevelR],
    );
    const cohortsActive = Boolean(
        beCohorts.directions.length || beCohorts.structures.length || beCohorts.sessions.length || beCohorts.armLevel != null,
    );
    const selectiveBe = React.useMemo(() => {
        if (selectedBeScenario?.source !== "EXACT" || !Array.isArray(selectedBeScenario.trades)) return null;
        // Arm Level is the master switch: no arm selected ⇒ no BE applied at all,
        // even if Direction/Structure/Session chips are set. Pass empty filters so
        // the builder matches zero trades (never treat null arm as "unrestricted").
        const filters = beCohorts.armLevel == null ? {} : beCohorts;
        return buildSelectiveBeUniverse({
            originalTrades: trades,
            beTrades: selectedBeScenario.trades,
            filters,
            scenario: { beScenarioKey: selectedBeScenario.scenarioKey },
        });
    }, [selectedBeScenario, trades, beCohorts]);
    // ARM-LEVEL-UX/DEBUG-ATTRIBUTION — global BE universe (BE applied to ALL
    // paired trades, ignoring cohort filters) for the Global BE Impact panel.
    const globalBeUniverse = React.useMemo(() => {
        if (selectedBeScenario?.source !== "EXACT" || !Array.isArray(selectedBeScenario.trades)) return null;
        return buildSelectiveBeUniverse({
            originalTrades: trades,
            beTrades: selectedBeScenario.trades,
            filters: {},
            applyToAll: true,
            scenario: { beScenarioKey: selectedBeScenario.scenarioKey },
        });
    }, [selectedBeScenario, trades]);
    const cohortAttribution = React.useMemo(() => (selectiveBe ? buildSessionAttribution(selectiveBe.trades) : null), [selectiveBe]);
    // Master BE Trade Explorer rows — one row per original trade, enriched with BE
    // lifecycle + Max Arm. Built with the panel's filters so Current Cohort mode
    // mirrors the cards. Null arm ⇒ no selective effect (selectiveApplied false).
    const explorerRows = React.useMemo(() => {
        if (selectedBeScenario?.source !== "EXACT" || !Array.isArray(selectedBeScenario.trades)) return [];
        return buildBeTradeExplorerRows({
            originalTrades: trades,
            beTrades: selectedBeScenario.trades,
            filters: beCohorts,
            selectedScenario: { beScenarioKey: selectedBeScenario.scenarioKey },
            availableArmLevels: DEFAULT_ARM_LEVELS,
        });
    }, [selectedBeScenario, trades, beCohorts]);
    const globalAttribution = React.useMemo(() => (globalBeUniverse ? buildSessionAttribution(globalBeUniverse.trades) : null), [globalBeUniverse]);
    // Show Attribution Debug — default ON, persisted locally.
    const [showAttribution, setShowAttribution] = React.useState(() => {
        try { return localStorage.getItem("fxob_be_attribution_debug") !== "off"; } catch { return true; }
    });
    const toggleAttribution = React.useCallback(() => {
        setShowAttribution((v) => {
            const next = !v;
            try { localStorage.setItem("fxob_be_attribution_debug", next ? "on" : "off"); } catch { /* best effort */ }
            return next;
        });
    }, []);
    const beCompare = React.useMemo(() => {
        if (selectedBeScenario?.source !== "EXACT") return null;
        return {
            original: summarizeTradeSanity(trades),                                          // Card 1: full run, no BE
            filteredOriginal: selectiveBe ? summarizeTradeSanity(selectiveBe.filteredOriginalTrades) : null,   // Card 2: cohort, no BE
            filteredProtected: selectiveBe ? summarizeTradeSanity(selectiveBe.filteredProtectedTrades) : null, // Card 3: cohort, with BE
            selective: selectiveBe ? summarizeTradeSanity(selectiveBe.trades) : null,         // Card 4 basis: full run, BE on cohort
            globalBe: summarizeTradeSanity(selectedBeScenario.trades || []),                  // reference: BE on all
            fullBreakdown: selectiveBe?.meta?.fullBreakdown ?? null,
            filteredBreakdown: selectiveBe?.meta?.filteredBreakdown ?? null,
        };
    }, [selectedBeScenario, trades, selectiveBe]);

    // ── PROTECTION-LAYER Phase 2 — "Open as Result View" promotion ────────────
    // Promote the current selective-BE config into the global scenario as a
    // break_even layer on top of the CURRENT base entry view, so every page reads
    // the same protected universe.trades. We never silently apply global BE: the
    // button is gated on EXACT + ≥1 cohort filter + ≥1 trade actually affected.
    const baseEntryView = React.useMemo(() => {
        const fam = familyFromKey(beEntryVariantKey);
        if (!fam || fam === "baseline") return { family: "baseline", threshold: null, fillMode: null };
        return { family: fam, threshold: extractThreshold(beEntryVariantKey), fillMode: fillModeFromKey(beEntryVariantKey) };
    }, [beEntryVariantKey]);

    const activeLayers = (SCENARIO?.runId === activeRunId && Array.isArray(SCENARIO?.layers)) ? SCENARIO.layers : [];
    const activeProtectionLabel = activeLayers.length ? buildProtectionLabel(activeLayers[0]) : null;

    const openAsResultViewEnabled = Boolean(
        selectedBeScenario?.source === "EXACT"
        && selectedBeScenario.scenarioKey
        && beCohorts.armLevel != null      // no arm = no BE → nothing to promote
        && selectiveBe && selectiveBe.applied > 0,
    );

    const onOpenAsResultView = React.useCallback(() => {
        if (selectedBeScenario?.source !== "EXACT" || !selectedBeScenario.scenarioKey) return;
        if (beCohorts.armLevel == null || !(selectiveBe && selectiveBe.applied > 0)) return;
        const layer = {
            type: "break_even",
            mode: "selective",
            params: { beScenarioKey: selectedBeScenario.scenarioKey, armLevelR, triggerBasis },
            filters: beCohorts,
            exploratory: true,
            label: `BE ${armLevelR}R ${triggerBasis === "wick" ? "Wick" : "Close"} · ${selectiveBe.selectedFilterLabel}`,
        };
        // Base entry view + layer set together (setScenario keeps layers because
        // the patch carries them explicitly).
        setScenario({
            runId: activeRunId || null,
            ...baseEntryView,
            positionVariant: beExecutionMode,
            layers: [layer],
        });
    }, [selectedBeScenario, cohortsActive, selectiveBe, armLevelR, triggerBasis, beCohorts, baseEntryView, beExecutionMode, activeRunId]);

    const onClearResultViewLayer = React.useCallback(() => {
        setScenario({ runId: activeRunId || null, layers: [] });
    }, [activeRunId]);

    // ── Gate 0: NO BE — this run generated no BE scenarios (BE disabled / no BE CSVs).
    // Short-circuit before any candle load or replay: there is nothing to show and the
    // candle-walk REPLAY fallback must NOT run (wrong + can freeze). Independent of
    // large/lazy. EXACT and BE-indexed (lazy) runs have hasAnyBeScenario=true and skip this.
    if (!hasAnyBeScenario) {
        return (
            <NeonPanel title="Break-even Replay · No BE Scenarios" action={<Pill tone="muted">NO BE</Pill>}>
                <div className="flex flex-col gap-3 py-2">
                    <p className="text-[13px] font-display text-[hsl(var(--text-2))] leading-relaxed">
                        No BE scenarios were run for this run.
                    </p>
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2)/0.7)]">
                        Break-even results appear here when a run is executed with break-even enabled. This run
                        has no exact BE data and no BE scenario index, so no replay is performed.
                    </p>
                </div>
            </NeonPanel>
        );
    }

    // EXACT-ONLY — the candle "preparing / required / unavailable" gates are removed:
    // Protection Lab never loads candles for BE. The table below renders EXACT cells and
    // marks the rest "Not Exported". (Run with no BE at all is handled by Gate 0 above.)

    // ── Derived display state ─────────────────────────────────────────────
    const computing = scenarios === null;
    const selected = Array.isArray(scenarios) && scenarios.length
        ? (scenarios.find((sc) => sc.armLevelR === armLevelR) ?? scenarios[0])
        : null;
    const s = selected?.summary ?? null;
    // Source of the currently selected scenario, and whether ANY arm is EXACT.
    const selectedSource = selected?.source ?? (hasExact ? "EXACT" : "NOT_EXPORTED");
    const isExact = selectedSource === "EXACT";
    const anyExact = Array.isArray(scenarios) && scenarios.some((sc) => sc.source === "EXACT");

    // ── LAZY-BE-EXACT — explicit exact-trade load state for the SELECTED scenario.
    // The comparison cards + EXACT chart require selectedBeScenario.trades to be a
    // loaded array. On a lazy/cube run those rows are deferred, so an EXACT scenario
    // can be detected by summary while its trades are still null. Make that state
    // explicit instead of silently vanishing the cards / falling back to REPLAY.
    const selExactSummary = selectedBeScenario?.source === "EXACT";
    const selExactTradesLoaded = selExactSummary && Array.isArray(selectedBeScenario?.trades);
    const isLazyRun = Boolean(activeRun?.lazy);
    const beFileForSel = isLazyRun
        ? findBeFileForRun(activeRun, {
            executionMode: beExecutionMode, entryVariantKey: beEntryVariantKey, triggerBasis, armLevelR,
        })
        : null;
    // Exact trades are obtainable: either already detected (summary) or a matching
    // BE file is indexed for lazy load. Used to suppress silent REPLAY.
    const exactObtainable = selExactSummary || Boolean(beFileForSel);
    const exactFailed = exactObtainable && !selExactTradesLoaded && Boolean(beLazyStatus?.error);
    const exactPending = exactObtainable && !selExactTradesLoaded && !exactFailed
        && (Boolean(beLazyStatus?.loading) || Boolean(beFileForSel) || selExactSummary && isLazyRun);
    const exactLoaded = selExactTradesLoaded;

    const verdict = classifyVerdict(s);
    const verdictColorClass = {
        success: "text-[hsl(var(--success))]",
        warning: "text-[hsl(var(--warning))]",
        danger:  "text-[hsl(var(--danger))]",
        muted:   "text-[hsl(var(--text-2))]",
    }[verdict.tone] ?? "text-[hsl(var(--text-2))]";
    const verdictPanelClass = {
        success: "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.05)]",
        warning: "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)]",
        danger:  "border-[hsl(var(--danger)/0.35)]  bg-[hsl(var(--danger)/0.05)]",
        muted:   "border-[hsl(var(--border-soft))]  bg-[hsl(var(--panel-2)/0.3)]",
    }[verdict.tone] ?? "border-[hsl(var(--border-soft))]";

    const effTone = s?.efficiencyRatio != null
        ? s.efficiencyRatio >= 1 ? "success" : s.efficiencyRatio >= 0.5 ? "warning" : "danger"
        : "muted";

    const tableRows = Array.isArray(scenarios)
        ? scenarios.map(({ armLevelR: arm, summary: sm, source }) => ({
            id: arm, arm,
            source:          source ?? "NOT_EXPORTED",
            netR:            sm?.netR ?? null,
            deltaNetR:       sm?.deltaNetR ?? null,
            profitFactor:    sm?.profitFactor ?? null,
            maxDD:           sm?.maxDrawdown ?? null,
            worstStreak:     sm?.worstLossStreak ?? 0,
            lossesSaved:     sm?.lossesSaved ?? 0,
            winnersCut:      sm?.winnersCut ?? 0,
            beExits:         sm?.beExitCount ?? 0,
            efficiencyRatio: sm?.efficiencyRatio ?? null,
            // EXACT rows have no same-candle ambiguity (1-minute execution).
            ambigPct: source === "EXACT"
                ? null
                : (sm && sm.beExitCount > 0
                    ? rnd2((sm.sameCandleAmbiguousCount / sm.beExitCount) * 100)
                    : null),
        }))
        : [];

    return (
        <div className="flex flex-col gap-4 pb-8">
            {/* BE entry-view selector — BE defaults to a VARIANT when variants were
                run (baseline is a fallback). When the BE view differs from the active
                result view, say so; the chips below switch between variants with BE. */}
            {beDataPresentAnywhere && beVariantsWithExact.length > 0 && (
                <div className="flex flex-col gap-1.5 px-3 py-2 clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.4)] bg-[hsl(var(--accent-secondary)/0.07)]">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">BE entry view</span>
                        {beVariantsWithExact.map((vk) => {
                            const active = vk === beEntryVariantKey;
                            return (
                                <button
                                    key={vk}
                                    type="button"
                                    onClick={() => setBeVariantSelection(vk)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-[4px] border text-[10.5px] font-ui font-semibold transition-colors",
                                        active
                                            ? "bg-[hsl(var(--accent-secondary)/0.18)] border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))]"
                                            : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                                    )}
                                >
                                    {entryVariantLabel(vk)}
                                </button>
                            );
                        })}
                    </div>
                    {beEntryVariantKey !== requestedEntryVariantKey && (
                        <span className="text-[10px] font-ui text-[hsl(var(--text-2)/0.8)]">
                            Showing BE for <span className="text-[hsl(var(--text-1))]">{viewLabel}</span>; the active result view is{" "}
                            <span className="text-[hsl(var(--text-1))]">{requestedViewLabel}</span> (no auto-fallback — pick a chip to change).
                        </span>
                    )}
                </div>
            )}

            {/* LAZY-RUN-PERFORMANCE Phase 1 — compact loading/error banner for the
                on-demand BE scenario fetch (large/lazy runs). Uses beLazyStatus
                from useLazyBeScenario; renders nothing for small/eager runs. */}
            {(beLazyStatus?.loading || beLazyStatus?.error || exactPending || exactFailed) && (
                <div
                    data-testid="lazy-be-status"
                    className={`flex items-center gap-2 px-3 py-2 clip-bevel-sm border ${
                        (beLazyStatus?.error || exactFailed)
                            ? "border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.08)]"
                            : "border-[hsl(var(--accent-secondary)/0.5)] bg-[hsl(var(--accent-secondary)/0.08)]"
                    }`}
                >
                    {(beLazyStatus?.error || exactFailed) ? (
                        <span className="text-[11px] font-ui text-[hsl(var(--danger))]">
                            Could not load EXACT break-even trades for this scenario
                            {beLazyStatus?.error ? `: ${beLazyStatus.error}` : "."} Showing the REPLAY estimate as a labelled fallback — ensure the sidecar is running, then reselect the scenario.
                        </span>
                    ) : (
                        <>
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-[hsl(var(--accent-secondary))] border-t-transparent animate-spin" />
                            <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">
                                Loading EXACT break-even trades on demand… comparison will refresh when rows arrive.
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* (The "no EXACT for this entry view" case is handled by the dedicated
                empty-state early return above — it shows no data + a Show-baseline-BE
                opt-in rather than a silent REPLAY/baseline substitution.) */}

            {/* ── 0. Break-even headline KPIs — mirror the model/variant strip above
                   so the BE-adjusted result sits directly under it for comparison. */}
            {s && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MetricChip label="BE Net R"      value={s.netR != null ? fmtR(s.netR) : "—"} sub={`${armLevelR}R arm · break-even`} tone={s.netR >= 0 ? "primary" : "danger"} icon={TrendingUp} />
                    <MetricChip label="Δ Net R"       value={s.deltaNetR != null ? fmtR(s.deltaNetR) : "—"} sub="vs no-BE baseline" tone={s.deltaNetR >= 0 ? "success" : "danger"} icon={Activity} />
                    <MetricChip label="Profit Factor" value={s.profitFactor != null ? String(s.profitFactor) : "—"} sub="break-even adjusted" tone={s.profitFactor != null && s.profitFactor >= 1.5 ? "success" : s.profitFactor != null && s.profitFactor < 1 ? "danger" : "muted"} icon={BarChart2} />
                    <MetricChip label="Max DD"        value={s.maxDrawdown != null ? fmtR(s.maxDrawdown) : "—"} sub="worst equity dip" tone={s.maxDrawdown < -2 ? "danger" : s.maxDrawdown < 0 ? "warning" : "muted"} icon={AlertTriangle} />
                    <MetricChip label="Losses Saved"  value={String(s.lossesSaved)} sub={`+${rnd2(s.loserRSaved).toFixed(1)}R recovered`} tone="success" icon={ShieldAlert} />
                    <MetricChip label="Winners Cut"   value={String(s.winnersCut)} sub={`-${rnd2(s.winnerRCost).toFixed(1)}R cost`} tone="danger" icon={TrendingUp} />
                </div>
            )}

            {/* ── 1. Confidence banner — EXACT or NOT EXPORTED (EXACT-only mode) ─── */}
            <div className={cn(
                "rounded-[6px] border px-4 py-3",
                isExact
                    ? "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.06)]"
                    : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)]",
            )}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Pill tone={isExact ? "success" : "muted"}>{isExact ? "EXACT TIER" : "NOT EXPORTED"}</Pill>
                    <Pill tone={isExact ? "success" : "muted"}>
                        {isExact ? `BE data: ${viewLabel}` : `BE data: not exported · ${viewLabel}`}
                    </Pill>
                    <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">
                        {isExact
                            ? "backend exact replay · 1-minute execution · spread / news / conflict handled"
                            : "this arm/trigger was not exported by the backtester"}
                    </span>
                </div>
                {isExact ? (
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            <span className="font-semibold text-[hsl(var(--text-1))]">Backend exact replay:</span>{" "}
                            this arm + trigger was simulated on 1-minute execution candles by the backtester.
                            Arm/stop detection, spread, news and conflict handling match the live engine — no
                            same-candle ambiguity.
                        </p>
                        {anyExact && (
                            <p className="text-[11px] font-ui text-[hsl(var(--text-2)/0.8)] leading-relaxed">
                                Arm levels without an exported backend scenario are marked
                                <span className="font-semibold"> Not Exported</span> in the Source column — no
                                client-side replay is performed.
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <span className="font-semibold text-[hsl(var(--text-1))]">Not exported.</span>{" "}
                        No backend EXACT break-even scenario exists for {viewLabel ? `“${viewLabel}”` : "this view"}
                        {" "}at this arm/trigger. {beDataPresentAnywhere
                            ? "Other arms/views in this run have exact BE — select an exported arm above, or re-run the BE matrix to cover this one."
                            : "Re-run with break-even enabled (or the BE matrix) to generate exact results."}{" "}
                        Protection Lab is EXACT-only — no candle-resolution replay is run.
                    </p>
                )}
            </div>

            {/* ── 2. Arm level + trigger selector ────────────────────────── */}
            <NeonPanel title="Arm Level &amp; Trigger Basis">
                <div className="flex flex-col gap-4">

                    {/* Arm level pills */}
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {ARM_LEVELS.map((arm) => {
                                const sc = Array.isArray(scenarios) ? scenarios.find((x) => x.armLevelR === arm) : null;
                                const active = arm === armLevelR;
                                // Greyed when EXACT BE exists for this entry view but this
                                // arm wasn't generated for the current trigger — selecting it
                                // would silently fall back to REPLAY, so disable it instead.
                                const covered = !beExactCoverage.hasAny || isArmExact(arm, triggerBasis);
                                return (
                                    <button
                                        key={arm}
                                        type="button"
                                        disabled={!covered}
                                        onClick={() => { if (covered) setArmLevelR(arm); }}
                                        title={!covered ? `${arm}R ${triggerBasis} BE was not generated for this entry view — re-run with this arm to enable EXACT` : undefined}
                                        className={cn(
                                            "flex flex-col items-center px-3.5 py-2 rounded-[4px] border text-[11px] font-ui font-semibold transition-colors",
                                            !covered
                                                ? "opacity-40 cursor-not-allowed bg-[hsl(var(--panel-2)/0.2)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]"
                                                : active
                                                    ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                                    : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                                        )}
                                    >
                                        <span>{arm}R</span>
                                        <span className="text-[9.5px] font-normal mt-0.5 opacity-60">
                                            {!covered ? "not run" : sc && sc.summary ? `${sc.summary.beExitCount} exits` : computing ? "…" : "—"}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Trigger basis selector */}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10.5px] font-ui font-semibold text-[hsl(var(--text-2))] uppercase tracking-wider">
                            Trigger basis
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                            {TRIGGER_OPTIONS.map((opt) => {
                                const active = triggerBasis === opt.value;
                                // Greyed when EXACT BE exists for this view but this trigger
                                // basis wasn't generated — avoids a silent REPLAY fallback.
                                const covered = !beExactCoverage.hasAny || beExactCoverage.triggers.has(opt.value);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={!covered}
                                        onClick={() => { if (covered) setTriggerBasis(opt.value); }}
                                        title={!covered ? `${opt.label} BE was not generated for this entry view — re-run with this trigger to enable EXACT` : undefined}
                                        className={cn(
                                            "px-3 py-1.5 rounded-[4px] border text-[11px] font-ui font-semibold transition-colors",
                                            !covered
                                                ? "opacity-40 cursor-not-allowed bg-[hsl(var(--panel-2)/0.2)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]"
                                                : active
                                                    ? "bg-[hsl(var(--accent-secondary)/0.16)] border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]"
                                                    : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10.5px] font-ui text-[hsl(var(--text-2)/0.75)] leading-snug">
                            {TRIGGER_OPTIONS.find((o) => o.value === triggerBasis)?.desc}
                        </p>
                    </div>

                    {/* Status line */}
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2))]">
                        Stop mode: <span className="text-[hsl(var(--text-1))]">Entry (0R)</span>
                        {" · "}Trigger: <span className="text-[hsl(var(--text-1))]">{triggerBasis === "wick" ? "Wick" : "Close"}</span>
                        {" · "}Delay: <span className="text-[hsl(var(--text-1))]">0 bars</span>
                    </p>
                </div>
            </NeonPanel>

            {/* ── 3. Verdict hero — shown first so the answer is immediately visible */}
            <NeonPanel
                title={`Break-even Verdict · ${armLevelR}R Arm`}
                action={<Pill tone={isExact ? "success" : "secondary"}>{isExact ? "EXACT" : "REPLAY"}</Pill>}
            >
                {computing ? (
                    <ComputingRow />
                ) : s ? (
                    <div className={cn("rounded-[6px] border p-4", verdictPanelClass)}>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <div className={cn("text-[22px] font-display font-bold tracking-tight leading-none", verdictColorClass)}>
                                    {verdict.label}
                                </div>
                                <div className="mt-2 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed max-w-prose">
                                    {verdict.sub}
                                </div>
                                <div className="mt-2 text-[10.5px] font-ui text-[hsl(var(--text-2)/0.65)] italic">
                                    {isExact
                                        ? "Exact backend replay — 1-minute execution matching the live engine."
                                        : "Validate with an exact backend replay before applying."}
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <div className={cn("text-[38px] font-display font-bold leading-none tabular-nums", verdictColorClass)}>
                                    {s.deltaNetR != null ? fmtR(s.deltaNetR) : "—"}
                                </div>
                                <div className="text-[10.5px] font-ui text-[hsl(var(--text-2))] mt-1.5">
                                    vs no-BE baseline
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No scenario data.</div>
                )}
            </NeonPanel>

            {/* ── 4. Scenario comparison table — evidence for the verdict ─── */}
            <NeonPanel title="Scenario Comparison · All Arm Levels">
                {computing ? (
                    <ComputingRow label="Resolving EXACT scenarios…" />
                ) : (
                    <>
                        <DataTable
                            columns={tableColumns}
                            rows={tableRows}
                            rowKey="id"
                            selectedKey={armLevelR}
                            onRowClick={(row) => { if (!beExactCoverage.hasAny || isArmExact(row.arm, triggerBasis)) setArmLevelR(row.arm); }}
                            defaultSortKey={null}
                        />
                        <Note>
                            All scenarios: entry stop · {triggerBasis === "wick" ? "wick trigger" : "close trigger"} · 0 delay.
                            Δ Net R vs no-BE baseline.
                            Ambig% = same-candle exits where arm and stop touched the same bar (ordering unknown).
                        </Note>
                    </>
                )}
            </NeonPanel>

            {/* ── 5. Detail cards — only after scenarios are ready ────────── */}
            {s && (
                <div className="kpi-strip">
                    <MetricChip
                        label="Losses Saved"
                        value={String(s.lossesSaved)}
                        sub={`+${rnd2(s.loserRSaved).toFixed(1)}R recovered`}
                        tone="success"
                        icon={ShieldAlert}
                    />
                    <MetricChip
                        label="Winners Cut"
                        value={String(s.winnersCut)}
                        sub={`-${rnd2(s.winnerRCost).toFixed(1)}R cost`}
                        tone="danger"
                        icon={TrendingUp}
                    />
                    <MetricChip
                        label="Efficiency Ratio"
                        value={fmtEff(s.efficiencyRatio)}
                        sub="R recovered per R cost"
                        tone={effTone}
                        icon={BarChart2}
                    />
                    <MetricChip
                        label="Same-Candle Ambiguous"
                        value={String(s.sameCandleAmbiguousCount)}
                        sub="conservative rule applied"
                        tone="warning"
                        icon={AlertTriangle}
                    />
                </div>
            )}

            {/* ── 6. Coverage panel ────────────────────────────────────────── */}
            {s && (
                <NeonPanel title="Coverage &amp; Missing Paths">
                    <div className="kpi-strip">
                        <MetricChip
                            label="Replayed"
                            value={String(s.replayedCount)}
                            sub={`${fmtCov(s.coveragePct)} of trades`}
                            tone="primary"
                            icon={Hash}
                        />
                        <MetricChip
                            label="Missing Path"
                            value={String(s.missingPathCount)}
                            sub="sub-bar exits · original R used"
                            tone="muted"
                            icon={Activity}
                        />
                    </div>
                    <Note>
                        Missing-path trades use the original realized R. Zero-length windows
                        (fill and exit in same 15-min bar) cannot be walked.
                    </Note>
                </NeonPanel>
            )}

            {/* ── 6b. BE Trade Explorer (EXACT only) — master one-row-per-trade table ─ */}
            {isExact && (
                <BeTradeExplorer
                    rows={explorerRows}
                    scenarioLabel={`EXACT · ${armLevelR}R ${triggerBasis === "wick" ? "Wick" : "Close"}`}
                    cohortActive={cohortsActive}
                    cohortDelta={selectiveBe?.summary?.deltaNetR ?? null}
                    globalDelta={globalBeUniverse?.summary?.deltaNetR ?? null}
                    filters={beCohorts}
                    onViewOnMap={onViewBeTradeOnMap}
                />
            )}

            {/* ── 6c. Selective BE — apply BE to cohorts (EXACT only) ──────── */}
            {isExact && beCompare && (
                <SelectiveBeCohortPanel
                    beCohorts={beCohorts}
                    toggleCohort={toggleCohort}
                    resetCohorts={resetCohorts}
                    cohortsActive={cohortsActive}
                    compare={beCompare}
                    selective={selectiveBe}
                    globalCounts={{
                        lossesSaved: affectedRows.filter((r) => r.classification === "loss_saved").length,
                        winnersCut: affectedRows.filter((r) => r.classification === "winner_cut").length,
                    }}
                    scenarioLabel={`${armLevelR}R ${triggerBasis === "wick" ? "Wick" : "Close"}`}
                    scenarioArm={armLevelR}
                    onSetArmLevel={setArmLevel}
                    triggerBasis={triggerBasis}
                    onSetTrigger={setTriggerBasis}
                    cohortAttribution={cohortAttribution}
                    globalAttribution={globalAttribution}
                    globalSummaryDelta={globalBeUniverse?.summary?.deltaNetR}
                    showAttribution={showAttribution}
                    onToggleAttribution={toggleAttribution}
                    onOpenAsResultView={onOpenAsResultView}
                    openAsResultViewEnabled={openAsResultViewEnabled}
                    activeProtectionLabel={activeProtectionLabel}
                    onClearResultViewLayer={onClearResultViewLayer}
                    exactCoverage={beExactCoverage}
                />
            )}

            {/* LAZY-BE-EXACT — when an EXACT scenario is detected but its trade rows
                are still pending (or failed to load), keep the comparison area
                VISIBLE with an explicit explanation rather than silently hiding the
                cards. Prevents the "looks like REPLAY / cards vanished" regression. */}
            {!beCompare && (exactPending || exactFailed) && (
                <NeonPanel
                    title="Break-even Comparison"
                    action={<Pill tone={exactFailed ? "danger" : "secondary"}>{exactFailed ? "EXACT LOAD FAILED" : "LOADING EXACT"}</Pill>}
                >
                    {exactFailed ? (
                        <div className="flex flex-col gap-2 py-2">
                            <p className="text-[13px] font-display text-[hsl(var(--text-2))] leading-relaxed">
                                EXACT break-even trade rows for this scenario could not be loaded, so the
                                cohort comparison cards are unavailable.
                            </p>
                            <p className="text-[11px] font-ui text-[hsl(var(--text-2)/0.7)]">
                                Ensure the local sidecar is running, then reselect the arm/trigger to retry.
                                Any figures shown elsewhere on this page are the labelled REPLAY estimate, not EXACT.
                            </p>
                        </div>
                    ) : (
                        <ComputingRow label="Loading EXACT break-even trades for comparison…" />
                    )}
                </NeonPanel>
            )}

            {/* ── 7. Research methodology disclosure (collapsible) ─────────── */}
            <NeonPanel title="Research Methodology · Break-even Replay" collapsible defaultCollapsed>
                <div className="flex flex-col gap-2.5 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    <p>
                        <span className="font-semibold text-[hsl(var(--accent-secondary))]">Confidence tier: REPLAY</span>{" "}
                        — between EXACT (tick-level backtest) and ESTIMATE (flag-based upper bound).
                        Numbers are candle-resolution approximations.
                    </p>
                    <p>
                        <span className="font-semibold text-[hsl(var(--text-1))]">What this is:</span>{" "}
                        Candle-walk simulation of a break-even stop rule using imported OHLC bars.
                        Arm detection uses the selected trigger basis; stop detection uses wick high/low.
                    </p>
                    <p>
                        <span className="font-semibold text-[hsl(var(--text-1))]">What this is NOT:</span>{" "}
                        Tick-level simulation. Spread/slippage model. Confirmation of which event
                        happened first on the same candle.
                    </p>
                    <p>
                        <span className="font-semibold text-[hsl(var(--text-1))]">Trigger basis — Wick vs Close:</span>{" "}
                        Wick mode arms BE the moment a candle wick reaches the arm price. It is faster
                        but creates same-candle ambiguity at tight arm levels — the Ambig% column quantifies this.
                        Close mode arms BE only after a full candle closes beyond the arm price, reducing ambiguity
                        but potentially missing arms during sharp moves. Neither mode is "more exact" than the other;
                        they model different real-world BE activation decisions.
                    </p>
                    <p>
                        <span className="font-semibold text-[hsl(var(--text-1))]">Same-candle rule:</span>{" "}
                        When arm level and entry price are both touched on the same OHLC bar (wick mode),
                        BE stop is conservatively assumed to have triggered first. This understates wins and
                        overstates BE rescues. Ambig% in the table shows the fraction of BE exits affected.
                    </p>
                    <p>
                        <span className="font-semibold text-[hsl(var(--text-1))]">Relationship to Distance To Stop:</span>{" "}
                        Break-even Replay and Distance To Stop are complementary, not comparable.
                        Distance To Stop is a fast MFE upper-bound hypothesis generator (no candles
                        required). Break-even Replay is candle-level validation. Their numbers will
                        differ — this is expected.
                    </p>
                </div>
            </NeonPanel>

            {/* ── 8. Planned Research: Dynamic Risk Reduction / Partial Stop Tightening ── */}
            <NeonPanel
                title="Planned Research · Dynamic Risk Reduction / Partial Stop Tightening"
                collapsible
                defaultCollapsed
                action={
                    <div className="flex items-center gap-1.5">
                        <Pill tone="muted">PLANNED</Pill>
                        <Pill tone="warning">NOT VALIDATED</Pill>
                    </div>
                }
            >
                <DynamicStopPanel />
            </NeonPanel>

        </div>
    );
}

// ── Dynamic Stop Reduction research panel ────────────────────────────────────

function RqItem({ children }) {
    return (
        <li className="flex items-start gap-2 text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
            <Circle className="w-2.5 h-2.5 mt-[3px] shrink-0 text-[hsl(var(--text-2)/0.4)]" />
            <span>{children}</span>
        </li>
    );
}

function RqSection({ title, items }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-ui font-semibold uppercase tracking-wider text-[hsl(var(--text-2))]">{title}</span>
            <ul className="flex flex-col gap-1">
                {items.map((q, i) => <RqItem key={i}>{q}</RqItem>)}
            </ul>
        </div>
    );
}

function ReqItem({ children }) {
    return (
        <li className="flex items-start gap-2 text-[11px] font-ui text-[hsl(var(--warning))] leading-relaxed">
            <CheckCircle2 className="w-3 h-3 mt-[2px] shrink-0 opacity-50" />
            <span>{children}</span>
        </li>
    );
}

function DynamicStopPanel() {
    return (
        <div className="flex flex-col gap-4 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">

            {/* Hypothesis warning */}
            <div className="rounded-[4px] border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)] px-3 py-2.5 flex items-start gap-2.5">
                <FlaskConical className="w-3.5 h-3.5 mt-[1px] shrink-0 text-[hsl(var(--warning))]" />
                <p className="text-[11px] font-ui text-[hsl(var(--warning))] leading-relaxed">
                    <span className="font-semibold">Research hypothesis — not yet implemented.</span>{" "}
                    No engine, no candle replay, no numbers exist for this strategy yet. Everything here
                    is a design specification for future research. Do not assume partial reduction performs
                    better than full break-even or no protection.
                </p>
            </div>

            {/* Purpose */}
            <div className="flex flex-col gap-1">
                <span className="text-[10.5px] font-ui font-semibold uppercase tracking-wider text-[hsl(var(--text-2))]">Purpose</span>
                <p>
                    Test whether reducing <em>some</em> of the remaining risk after price moves in favour
                    can reduce drawdown and improve funded-account survivability — without the full winner
                    cost that standard break-even imposes. The hypothesis is that a partial reduction
                    sacrifices less expectancy while still rescuing meaningful downside.
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2)/0.65)] italic mt-0.5">
                    This is not assumed to be better. It is a hypothesis to be tested against
                    no protection and full break-even on the same trade sample.
                </p>
            </div>

            {/* Continuum */}
            <div className="rounded-[4px] bg-[hsl(var(--panel-2)/0.5)] border border-[hsl(var(--border-soft))] px-3 py-2.5">
                <span className="text-[10.5px] font-ui font-semibold text-[hsl(var(--text-1))] block mb-2">
                    Relationship to full break-even — it's the same axis
                </span>
                <div className="flex items-center gap-0 flex-wrap text-[10px] font-ui">
                    {[
                        { label: "No protection",  sub: "0% reduction", tone: "text-[hsl(var(--text-2))]" },
                        { label: "20% partial",    sub: "stop = −0.8R", tone: "text-[hsl(var(--text-2))]" },
                        { label: "50% partial",    sub: "stop = −0.5R", tone: "text-[hsl(var(--text-2))]" },
                        { label: "80% partial",    sub: "stop = −0.2R", tone: "text-[hsl(var(--text-2))]" },
                        { label: "Full BE (100%)", sub: "stop = 0R",    tone: "text-[hsl(var(--accent-secondary))]" },
                    ].map((item, i, arr) => (
                        <div key={i} className="flex items-center">
                            <div className="flex flex-col items-center px-2.5 py-1.5 rounded-[3px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-1)/0.5)]">
                                <span className={cn("font-semibold", item.tone)}>{item.label}</span>
                                <span className="text-[9px] opacity-60 mt-0.5">{item.sub}</span>
                            </div>
                            {i < arr.length - 1 && (
                                <span className="px-1 text-[hsl(var(--text-2)/0.3)]">→</span>
                            )}
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-[hsl(var(--text-2)/0.6)] italic mt-2">
                    100% reduction = standard break-even. This feature is a superset of what the current BE tab measures.
                    The current tab is already the rightmost column above.
                </p>
            </div>

            {/* Mechanics example */}
            <div className="flex flex-col gap-2">
                <span className="text-[10.5px] font-ui font-semibold uppercase tracking-wider text-[hsl(var(--text-2))]">
                    Example mechanic (entry = 0R, original stop = −1R)
                </span>
                <div className="rounded-[4px] border border-[hsl(var(--border-soft))] overflow-hidden text-[10.5px] font-ui">
                    <div className="grid grid-cols-4 bg-[hsl(var(--panel-2)/0.8)] px-3 py-1.5 text-[10px] font-semibold text-[hsl(var(--text-1))] uppercase tracking-wider">
                        <span>Price reaches</span>
                        <span>Arm level</span>
                        <span>Risk reduction</span>
                        <span>New stop</span>
                    </div>
                    {[
                        { reach: "+0.5R", arm: "0.5R", pct: "50%",  stop: "−0.5R",    note: "" },
                        { reach: "+1R",   arm: "1R",   pct: "80%",  stop: "−0.2R",    note: "" },
                        { reach: "+2R",   arm: "2R",   pct: "50%",  stop: "−0.5R",    note: "" },
                        { reach: "+1R",   arm: "1R",   pct: "100%", stop: "0R",        note: "= full BE" },
                    ].map((row, i) => (
                        <div key={i} className={cn(
                            "grid grid-cols-4 px-3 py-1.5 border-t border-[hsl(var(--border-soft))]",
                            i % 2 === 0 ? "bg-[hsl(var(--panel-1)/0.3)]" : "",
                        )}>
                            <span className="text-[hsl(var(--success))]">{row.reach}</span>
                            <span className="text-[hsl(var(--text-1))]">{row.arm}</span>
                            <span className="text-[hsl(var(--accent-secondary))]">{row.pct}</span>
                            <span className="text-[hsl(var(--warning))]">
                                {row.stop}
                                {row.note && <span className="ml-1 text-[hsl(var(--text-2)/0.6)] text-[9px] not-italic">{row.note}</span>}
                            </span>
                        </div>
                    ))}
                </div>
                <p className="text-[10.5px] text-[hsl(var(--text-2)/0.65)] italic">
                    Proposed formula: new stop = entry − originalRisk × (1 − reductionPct).
                    Arm level and reduction % are independent variables — both must be swept in the research.
                </p>
            </div>

            {/* Research questions grid */}
            <div className="flex flex-col gap-3">
                <span className="text-[10.5px] font-ui font-semibold uppercase tracking-wider text-[hsl(var(--text-2))]">
                    Research questions — must be answered before trusting any result
                </span>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <RqSection title="Mechanics" items={[
                        "When exactly does the stop move — on arm wick touch or candle close?",
                        "What price level arms the reduction (same as BE arm, or configurable)?",
                        "Where exactly does the new stop go — % of original risk or fixed R offset?",
                        "Does it trigger on wick or close (separate sweep from current BE trigger)?",
                        "Does it activate immediately or on the next candle open?",
                        "Is there an optional delay in candles before activation?",
                        "Can the stop move multiple times at different arm levels, or only once?",
                        "If moved multiple times, how are successive reductions compounded?",
                    ]} />
                    <RqSection title="Outcome behaviour" items={[
                        "If price returns after arming, what R is recorded at the new stop?",
                        "How many losers become reduced-loss vs full-loss vs saved-entirely?",
                        "How many winners get stopped out early vs hitting TP unaffected?",
                        "How much winner R is sacrificed per arm + reduction combination?",
                        "How much loser R is saved per arm + reduction combination?",
                        "What is the resulting Net R vs no-protection baseline?",
                        "How does Efficiency Ratio compare to full BE at the same arm level?",
                        "At what reduction % does winner damage exceed loser savings?",
                    ]} />
                    <RqSection title="Risk & funded-account impact" items={[
                        "How much does max drawdown change (improve or worsen)?",
                        "How much does worst loss streak change?",
                        "Does it improve daily drawdown survivability on funded accounts?",
                        "Does it reduce peak-to-trough account volatility?",
                        "Is drawdown improvement worth any net-R cost?",
                        "At what reduction % does the survivability trade-off become unfavourable?",
                    ]} />
                    <RqSection title="Validation requirements" items={[
                        "Compare against: no protection AND full BE (100%) on same trade set",
                        "Sweep arm levels: 0.5R, 1R, 1.5R, 2R",
                        "Sweep reduction levels: 20%, 50%, 80%, 100%",
                        "Compare wick vs close activation at each combination",
                        "Compare delay 0 vs delay +1 candle at each combination",
                        "Measure and report Ambig% (same-candle) for every scenario",
                        "Label all outputs clearly as REPLAY tier — not exact",
                        "Do not optimise to a single run — validate across multiple samples",
                        "Results must be tested before any real trading application",
                    ]} />
                </div>
            </div>

            {/* Required checklist */}
            <div className="flex flex-col gap-2">
                <span className="text-[10.5px] font-ui font-semibold uppercase tracking-wider text-[hsl(var(--text-2))]">
                    Required before any number can be trusted
                </span>
                <ul className="flex flex-col gap-1.5">
                    {[
                        "Exact trigger rule finalised and locked (wick / close / next-candle)",
                        "Exact stop placement formula agreed and documented",
                        "Wick vs close trigger comparison run at all arm + reduction combinations",
                        "Delay candle option included in full parameter sweep",
                        "Winner-cost and loser-saved measured separately per scenario",
                        "Net R, max DD, worst-streak compared against full BE and no-BE baselines",
                        "REPLAY tier label applied clearly to every output — never presented as exact",
                    ].map((item, i) => <ReqItem key={i}>{item}</ReqItem>)}
                </ul>
            </div>

        </div>
    );
}
