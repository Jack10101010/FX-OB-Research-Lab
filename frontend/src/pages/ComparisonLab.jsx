import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonSelect, NeonButton } from "@/components/lab/controls";
import { getRunDisplayName, compactTimeframe, useDataset, addProjectFinding, getTradeUniverse } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { collectAllEntryKeys, buildAvailableOptions } from "@/data/tradeUniverse";
import { TradeUniverseBadge } from "@/components/lab/TradeUniverseBadge";
// RB-8d: canonical Results Basis summaries replace the deprecated lib/metrics.
import { toCanonicalSummaryRow, maxDrawdownFromCurve } from "@/data/resultsBasis";
import { useResultsLens } from "@/data/useResultsLens";
import { evaluateCompare } from "@/data/useCompareGuard";
import { buildResearchFindingPayload } from "@/data/projectWorkflow";
import { Plus, X, Trophy, Crown, FileText, Check } from "lucide-react";
import {
    AreaChart, Area, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const PALETTE = [
    { line: "hsl(var(--accent-primary))",   tone: "primary",   short: "A" },
    { line: "hsl(var(--accent-secondary))", tone: "secondary", short: "B" },
    { line: "hsl(var(--accent-glow))",      tone: "primary",   short: "C" },
    { line: "hsl(var(--warning))",          tone: "warning",   short: "D" },
    { line: "hsl(var(--success))",          tone: "success",   short: "E" },
];

// Phase 3B-3 — stable scenario override so useTradeUniverse memoizes
// correctly. ComparisonLab pins to the baseline universe regardless of the
// user's currently-selected Strategy Map scenario; cross-run comparison is
// done against each run's primary variant. Scenario-aware comparison is a
// future feature (Phase 3C) and requires its own UX (global selector,
// missing-scenario fallbacks, etc.).
const BASELINE_SCENARIO_OVERRIDE = Object.freeze({ family: "baseline" });

// COCKPIT-2A — explainable winner. Pure: scores runs across directional metrics
// using values the page already computes (no new analytics). All five use
// "higher wins" — for Max DD the values are ≤ 0 R, so less-negative (higher)
// is the improvement. A metric is only awarded when there is a single clear
// winner; null/undefined/non-finite values are skipped. Overall winner = most
// metric wins, tie-broken by Net R; falls back to the pure Net R winner when no
// metric produces a clear leader.
const WINNER_METRICS = [
    { key: "netR",       label: "Net R" },
    { key: "winRate",    label: "Win Rate" },
    { key: "pf",         label: "Profit Factor" },
    { key: "maxDd",      label: "Max DD" },
    { key: "validation", label: "Validation" },
];

function netROrNegInf(row) {
    const v = Number(row?.netR);
    return Number.isFinite(v) ? v : -Infinity;
}

function computeExplainableWinner(metricRows) {
    const n = Array.isArray(metricRows) ? metricRows.length : 0;
    if (n === 0) {
        return { winnerIdx: 0, winnerLabels: [], winnerWinCount: 0, totalMetrics: WINNER_METRICS.length, otherLeads: [], smallSample: false, winnerTrades: null, maxTrades: 0 };
    }

    const winsCount = new Array(n).fill(0);
    const metricWinnerByKey = {};
    for (const m of WINNER_METRICS) {
        let bestIdx = -1, bestVal = -Infinity, tie = false;
        for (let i = 0; i < n; i += 1) {
            const v = Number(metricRows[i]?.[m.key]);
            if (!Number.isFinite(v)) continue;            // skip null/undefined/NaN
            if (v > bestVal) { bestVal = v; bestIdx = i; tie = false; }
            else if (v === bestVal) { tie = true; }       // shared best → no clear winner
        }
        if (bestIdx >= 0 && !tie) {
            winsCount[bestIdx] += 1;
            metricWinnerByKey[m.key] = bestIdx;
        }
    }

    const anyWins = winsCount.some((c) => c > 0);
    let winnerIdx = 0;
    if (anyWins) {
        let bestScore = -1, bestNetR = -Infinity;
        for (let i = 0; i < n; i += 1) {
            const score = winsCount[i];
            const netR = netROrNegInf(metricRows[i]);
            if (score > bestScore || (score === bestScore && netR > bestNetR)) {
                bestScore = score; bestNetR = netR; winnerIdx = i;
            }
        }
    } else {
        // Fallback: pure Net R winner (preserves prior behavior).
        winnerIdx = metricRows.reduce(
            (best, _r, i, all) => (netROrNegInf(all[i]) > netROrNegInf(all[best]) ? i : best),
            0,
        );
    }

    const winnerLabels = WINNER_METRICS.filter((m) => metricWinnerByKey[m.key] === winnerIdx).map((m) => m.label);
    const otherLeads = WINNER_METRICS
        .filter((m) => metricWinnerByKey[m.key] != null && metricWinnerByKey[m.key] !== winnerIdx)
        .map((m) => ({ idx: metricWinnerByKey[m.key], label: m.label }));

    const tradeCounts = metricRows.map((r) => Number(r?.trades)).filter(Number.isFinite);
    const maxTrades = tradeCounts.length ? Math.max(...tradeCounts) : 0;
    const winnerTrades = Number(metricRows[winnerIdx]?.trades);
    const smallSample = Number.isFinite(winnerTrades) && maxTrades > 0 && winnerTrades < 0.5 * maxTrades;

    return {
        winnerIdx,
        winnerLabels,
        winnerWinCount: winsCount[winnerIdx],
        totalMetrics: WINNER_METRICS.length,
        otherLeads,
        smallSample,
        winnerTrades: Number.isFinite(winnerTrades) ? winnerTrades : null,
        maxTrades,
    };
}

// ── 3C local helpers ─────────────────────────────────────────────────────────

/** Rebuild an equity curve from a trade list (cumulative R). */
function rebuildEquityCurve(trades) {
    let cum = 0;
    return (trades || []).map((t, i) => {
        cum += Number(t.r) || 0;
        const ts = t.entry || t.fill || t.exit || null;
        const ref = ts ? new Date(ts) : null;
        const valid = ref && isFinite(ref.getTime());
        return {
            i,
            netR: Number(cum.toFixed(2)),
            date: valid ? ref.toISOString().slice(0, 10) : "",
            label: valid
                ? ref.toLocaleString("en", { month: "short", year: "2-digit" })
                : String(i),
        };
    });
}

/** Sum of t.r across a trade list, rounded to 1 dp. */
function netRFromTrades(trades) {
    return Number(
        ((trades || []).reduce((s, t) => s + (Number(t.r) || 0), 0)).toFixed(1),
    );
}

/** Human-readable label for a scenario option (family / threshold / fillMode). */
function scenarioOptionLabel(family, threshold, fillMode) {
    if (!family || family === "baseline") return "Baseline (default)";
    const thresh = threshold != null ? ` ${threshold}%` : "";
    const fill = fillMode === "same" ? " · Same"
               : fillMode === "next" ? " · Next"
               : (typeof fillMode === "string" && /^d(\d+)$/i.test(fillMode))
                   ? ` · Delay +${fillMode.slice(1)}`
               : "";
    if (family === "triggered_edge") return `Triggered Edge${thresh}${fill}`;
    if (family === "penetration")    return `Penetration${thresh}${fill}`;
    return `${family}${thresh}${fill}`;
}

export default function ComparisonLab() {
    const { RUNS, EQUITY_CURVE, TRADES, ACTIVE_RUN, ACTIVE_PROJECT, getRunData } = useDataset();
    // Phase 3B-3 — ComparisonLab is intentionally baseline-only. We resolve
    // the baseline universe via useTradeUniverse with an explicit override so
    // the TradeUniverseBadge shows the unprotected reference source even when
    // the user has a triggered-edge scenario selected in Strategy Map. No
    // analytics consume this universe — RUNS / bundle.trades / bundle.equityCurve
    // still drive every comparison panel on the page. The badge exists purely
    // to make the page's design contract visible.
    const baselineUniverse = useTradeUniverse(null, BASELINE_SCENARIO_OVERRIDE);
    const importedRuns = RUNS.filter((r) => r._source === "imported");
    const [ids, setIds] = useState(() => importedRuns.slice(0, 2).map((r) => r.id));

    const setAt = (idx, v) => setIds((prev) => prev.map((x, i) => (i === idx ? v : x)));
    const addRun = () => {
        if (ids.length >= 5) return;
        const used = new Set(ids);
        const next = importedRuns.find((r) => !used.has(r.id)) || importedRuns[0];
        if (!next) return;
        setIds((p) => [...p, next.id]);
    };
    const removeAt = (idx) => {
        if (ids.length <= 2) return;
        setIds((p) => p.filter((_, i) => i !== idx));
    };

    const runs = ids.map((id) => RUNS.find((r) => r.id === id)).filter(Boolean);
    const baseline = runs[0];

    // ── 3C: global scenario selector ─────────────────────────────────────────
    // null = baseline mode (default). Applies the same scenario to every slot.
    const [globalScenario, setGlobalScenario] = useState(null);
    // Reset to baseline whenever the set of compared runs changes.
    useEffect(() => { setGlobalScenario(null); }, [ids]);

    const effectiveScenario = globalScenario || BASELINE_SCENARIO_OVERRIDE;
    const isScenarioMode    = Boolean(globalScenario?.family && globalScenario.family !== "baseline");

    // Resolve a TradeUniverse for each slot against the same effective scenario.
    const slotUniverses = useMemo(
        () => runs.map((r) => getTradeUniverse(r.id, effectiveScenario)),
        [runs, effectiveScenario],
    );

    // 3C-FINALIZE — scenario coverage. In scenario mode a slot is comparable
    // only when its resolved universe actually carries scenario trades; slots
    // that fall back to baseline are EXCLUDED from the verdict/deltas so a single
    // comparison never mixes scenario numbers against baseline-fallback numbers.
    // Baseline mode: every slot is comparable.
    const slotHasScenario = (idx) =>
        isScenarioMode
        && slotUniverses[idx]?.universeType === "scenario"
        && (slotUniverses[idx]?.trades?.length || 0) > 0;
    const slotComparable = (idx) => !isScenarioMode || slotHasScenario(idx);
    const scenarioCoverage = (() => {
        if (!isScenarioMode) return { present: runs.length, total: runs.length, missingRunIds: [] };
        const missingRunIds = runs.filter((_r, idx) => !slotHasScenario(idx)).map((r) => r?.id).filter(Boolean);
        return { present: runs.length - missingRunIds.length, total: runs.length, missingRunIds };
    })();
    const hasPartialScenarioCoverage = isScenarioMode && scenarioCoverage.missingRunIds.length > 0;

    // Union of scenario keys found across all selected runs (for the selector).
    const allAvailableOptions = useMemo(() => {
        const allKeys = new Set(["baseline"]);
        runs.forEach((r) => {
            const bundle = getRunData(r.id);
            if (!bundle) return;
            collectAllEntryKeys(bundle, bundle.trades || []).forEach((k) => allKeys.add(k));
        });
        return buildAvailableOptions([...allKeys]);
    }, [runs, getRunData]);

    // Flat list of string-serialised options for the NeonSelect.
    const scenarioSelectOptions = useMemo(() => {
        const opts = [{ value: "", label: "Baseline (default)" }];
        const {
            availableFamilies = [],
            thresholdsByFamily = {},
            fillModesByFamilyThreshold = {},
        } = allAvailableOptions;
        for (const family of availableFamilies.filter((f) => f !== "baseline")) {
            const thresholds = thresholdsByFamily[family] || [];
            for (const threshold of thresholds) {
                const ftKey = `${family}::${threshold}`;
                const fillModes = fillModesByFamilyThreshold[ftKey] || [];
                for (const fm of fillModes) {
                    const fillMode = fm === "both" ? null : fm;
                    opts.push({
                        value: JSON.stringify({ family, threshold, fillMode }),
                        label: scenarioOptionLabel(family, threshold, fillMode),
                    });
                }
            }
        }
        return opts;
    }, [allAvailableOptions]);

    const selectedScenarioValue = globalScenario ? JSON.stringify(globalScenario) : "";
    const handleScenarioChange  = (v) => {
        if (!v) { setGlobalScenario(null); return; }
        try { setGlobalScenario(JSON.parse(v)); } catch { setGlobalScenario(null); }
    };

    // Best-effort label for the active scenario (used in chips + finding titles).
    const activeScenarioLabel = isScenarioMode
        ? (slotUniverses.find((u) => u?.universeType === "scenario" && u.trades.length > 0)?.label
           || scenarioOptionLabel(globalScenario?.family, globalScenario?.threshold, globalScenario?.fillMode))
        : "Baseline";

    // ── 3C: per-slot analysis views ──────────────────────────────────────────
    // Centralises "what trades/curve does this slot analyse?" for all analytics
    // paths. In scenario mode a slot's analysisTrades = scenarioTrades when the
    // scenario is present; when the scenario is MISSING it explicitly falls back
    // to baselineTrades so no analytics path ever sees an empty array due to a
    // missing scenario. In baseline mode analysisTrades = bundle.trades throughout.
    const slotViews = useMemo(
        () => runs.map((r, idx) => {
            const bundle          = getRunData(r.id);
            const universe        = slotUniverses[idx];
            const missingScenario = isScenarioMode
                && Boolean(universe?.warnings?.some((w) => w.code === "NO_TRADES_FOR_SCENARIO"));
            const scenarioTrades  = universe?.trades  || [];
            const baselineTrades  = bundle?.trades    || [];
            const baselineCurve   = bundle?.equityCurve || [];
            const analysisTrades  = isScenarioMode && !missingScenario
                ? scenarioTrades
                : baselineTrades;
            const analysisCurve   = isScenarioMode && !missingScenario
                ? rebuildEquityCurve(scenarioTrades)
                : baselineCurve;
            return { bundle, universe, missingScenario, scenarioTrades, baselineTrades, baselineCurve, analysisTrades, analysisCurve };
        }),
        [runs, getRunData, slotUniverses, isScenarioMode],
    );

    // ── RB-8d: Results Basis context. ────────────────────────────────────────
    // RB-8d: Results Basis context. ComparisonLab is baseline-only and Raw R;
    // Current Equity cross-run comparison is a future feature (Phase 3C).
    const lens = useResultsLens();
    const compareGuard = useMemo(
        () => evaluateCompare(
            { basis: lens.basis, accountSettings: lens.accountSettings },
            { basis: lens.basis, accountSettings: lens.accountSettings },
        ),
        [lens.basis, lens.accountSettings],
    );

    // Canonical Profit Factor (RB-8d): from each run's trades via the single
    // Results Basis calculator. PF is coerced to null when undefined (no losses)
    // to preserve the legacy "Limited Data" display the old computeProfitFactor
    // produced. DD stays CURVE-based (maxDrawdownFromCurve) for exact parity.
    const finitePF = (pf) => (Number.isFinite(pf) ? pf : null);
    const realPF_active = finitePF(toCanonicalSummaryRow(TRADES, { basis: "raw_r" }).profitFactor);
    const realDD_active = maxDrawdownFromCurve(EQUITY_CURVE);
    const runMetrics = (r) => {
        if (!r) return { pf: null, maxDd: null };
        const slotIdx = runs.indexOf(r);
        const view    = slotIdx >= 0 ? slotViews[slotIdx] : null;
        const { analysisTrades = [], analysisCurve = [] } = view || {};
        if (analysisTrades.length) {
            // Prefer pre-built curve for DD parity; rebuild only when absent.
            const curve = analysisCurve.length ? analysisCurve : rebuildEquityCurve(analysisTrades);
            return {
                pf:    finitePF(toCanonicalSummaryRow(analysisTrades, { basis: "raw_r" }).profitFactor),
                maxDd: maxDrawdownFromCurve(curve),
            };
        }
        // Fallback: only the active mock run has pre-computed globals.
        if (r.id === ACTIVE_RUN.id) return { pf: realPF_active, maxDd: realDD_active };
        return { pf: null, maxDd: null };
    };

    // Canonical Summary WR (RB-8d): wins/(wins+losses) from each slot's
    // analysisTrades (scenario or baseline fallback); falls back to run summary.
    const canonicalWRById = useMemo(() => {
        const map = new Map();
        runs.forEach((r, idx) => {
            if (!r) return;
            const { analysisTrades = [] } = slotViews[idx] || {};
            const summary = analysisTrades.length
                ? toCanonicalSummaryRow(analysisTrades, { basis: "raw_r" })
                : toCanonicalSummaryRow(r, { basis: "raw_r" });
            map.set(r.id, summary.winRate != null ? summary.winRate : (Number(r.winRate) || 0));
        });
        return map;
    }, [runs, slotViews]);
    const wrOf = (r) => (r && canonicalWRById.has(r.id) ? canonicalWRById.get(r.id) : Number(r?.winRate) || 0);

    // Per-run equity curves from analysisCurve (scenario or baseline fallback).
    // Longer curve wins skeleton alignment.
    const equityMerged = useMemo(() => {
        const curves = runs.map((_r, i) => (slotViews[i]?.analysisCurve || []));
        // Use the longest available curve as the x-axis skeleton
        const skeleton = curves.reduce(
            (best, c) => (c.length > (best?.length || 0) ? c : best),
            EQUITY_CURVE,
        );
        if (!skeleton?.length) return [];
        return skeleton.map((p, idx) => {
            const row = { label: p.label, i: p.i };
            curves.forEach((curve, i) => {
                if (curve?.length) {
                    const e = curve[Math.min(idx, curve.length - 1)];
                    row[`r${i}`] = e ? e.netR : null;
                } else {
                    // No equity data for this slot — omit rather than fabricate
                    row[`r${i}`] = null;
                }
            });
            return row;
        });
    }, [runs, EQUITY_CURVE, slotViews]);

    // Per-run monthly from analysisTrades (scenario or baseline fallback).
    const monthlyMerged = useMemo(() => {
        const perRun = runs.map((_r, idx) => {
            const { analysisTrades = [] } = slotViews[idx] || {};
            if (!analysisTrades.length) return {};
            const map = {};
            analysisTrades.forEach((t) => {
                const date = t.entry ? new Date(t.entry) : null;
                if (!date || !isFinite(date.getTime())) return;
                const year = date.getUTCFullYear();
                const month = date.getUTCMonth();
                const key = `${year}-${String(month + 1).padStart(2, "0")}`;
                const m = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]} '${String(year).slice(-2)}`;
                if (!map[key]) map[key] = { m, v: 0 };
                map[key].v += Number(t.r) || 0;
            });
            return map;
        });
        const allKeys = [...new Set(perRun.flatMap((m) => Object.keys(m)))].sort();
        if (!allKeys.length) return [];
        return allKeys.map((key) => {
            const m = perRun.find((pm) => pm[key])?.m || key;
            const row = { m };
            runs.forEach((_, idx) => {
                row[`r${idx}`] = perRun[idx][key] != null ? Number(perRun[idx][key].v.toFixed(2)) : null;
            });
            return row;
        });
    }, [runs, slotViews]);

    // KPI matrix rows
    // RB-8d.1 Net R decision: Net R and Trades intentionally stay the run's
    // AUTHORITATIVE HEADLINE summary values (r.netR / r.trades) — the same numbers
    // shown on run cards, Runs, and Projects. The canonical performance-net from
    // toCanonicalSummaryRow(bundle.trades).netR can differ (it excludes
    // non-performance rows and uses performance categories; e.g. +39.3R on the
    // sample baseline) AND would diverge from the Raw-R equity curve and the
    // monthly chart (both sum raw t.r). Switching is deferred until that parity is
    // proven across all compared runs and the change is approved. WR is canonical
    // (wins/(wins+losses)); PF/DD are canonical via resultsBasis.
    const KPI_DEFS = [
        { key: "netR",          label: "Net R",            fmt: (v) => `${v >= 0 ? "+" : ""}${v}R`,         delta: (v, base) => `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}R`,  posIfGreater: true },
        { key: "winRate",       label: "Win Rate",         fmt: (v) => `${v.toFixed(1)}%`,                  delta: (v, base) => `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}%`, posIfGreater: true },
        { key: "trades",        label: "Trades",           fmt: (v) => String(v),                            delta: (v, base) => `${v - base >= 0 ? "+" : ""}${v - base}`,             posIfGreater: null },
        { key: "_pf",           label: "Profit Factor",    posIfGreater: true,    compute: true },
        { key: "_dd",           label: "Max Drawdown",     posIfGreater: true,    compute: true },
        { key: "reverseCancels",label: "Reverse Cancels",  fmt: (v) => v != null ? String(v) : "—",             delta: (v, base) => v != null && base != null ? `${v - base >= 0 ? "+" : ""}${v - base}` : "—", posIfGreater: false },
        { key: "validation",    label: "Validation",       fmt: (v) => v != null ? `${Number(v).toFixed(1)}%` : "—", delta: (v, base) => v != null && base != null ? `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}%` : "—", posIfGreater: true },
    ];

    // COCKPIT-2A — explainable winner from per-run values. In scenario mode,
    // Net R and Trades come from analysisTrades (scenario or baseline fallback)
    // so the winner reflects the selected scenario, not the run totals.
    const winnerInfo = computeExplainableWinner(
        runs.map((r, idx) => {
            // Excluded (non-comparable) scenario slots contribute all-null rows so
            // they win no metric and cannot be crowned via the Net R fallback.
            if (isScenarioMode && !slotComparable(idx)) {
                return { netR: null, winRate: null, pf: null, maxDd: null, validation: null, trades: null };
            }
            const { analysisTrades = [], missingScenario } = slotViews[idx] || {};
            // hasTrades: true only when we have actual scenario data (not a fallback).
            const hasTrades = isScenarioMode && !missingScenario && analysisTrades.length > 0;
            return {
                netR:       hasTrades ? netRFromTrades(analysisTrades) : r?.netR,
                winRate:    wrOf(r),
                pf:         runMetrics(r).pf,
                maxDd:      runMetrics(r).maxDd,
                validation: r?.validation,
                trades:     hasTrades ? analysisTrades.length : r?.trades,
            };
        }),
    );
    const winnerIdx = runs.length > 0 ? winnerInfo.winnerIdx : 0;
    // Only crown / show a verdict when the winner is a comparable slot and (in
    // scenario mode) at least one slot actually has scenario data.
    const showWinner = runs.length > 1
        && slotComparable(winnerIdx)
        && (!isScenarioMode || scenarioCoverage.present > 0);
    const winnerOtherLeadText = (() => {
        const groups = {};
        winnerInfo.otherLeads.forEach((o) => { (groups[o.idx] = groups[o.idx] || []).push(o.label); });
        return Object.entries(groups)
            .map(([idx, labels]) => `Run ${PALETTE[Number(idx) % PALETTE.length].short} leads ${labels.join(" & ")}`)
            .join("; ");
    })();

    // COCKPIT-2B — Save the comparison verdict as a project finding (reuses the
    // shared findings loop; no new findings system). Target project resolves from
    // the baseline run, else any selected run, else the active run / project.
    const targetProjectId =
        runs[0]?.projectId
        || runs.find((r) => r?.projectId)?.projectId
        || ACTIVE_RUN?.projectId
        || ACTIVE_PROJECT?.id
        || null;
    const [comparisonSaved, setComparisonSaved] = useState(false);
    // Reset the saved marker when the selected runs or the winner change.
    useEffect(() => { setComparisonSaved(false); }, [ids, winnerIdx]);

    const handleSaveComparison = () => {
        const winnerRun = runs[winnerIdx];
        const baselineRun = runs[0];
        if (!targetProjectId || comparisonSaved || !winnerRun) return;
        const winnerShort = PALETTE[winnerIdx % PALETTE.length].short;
        const leadsText = winnerInfo.winnerWinCount > 0
            ? `leads ${winnerInfo.winnerWinCount}/${winnerInfo.totalMetrics} (${winnerInfo.winnerLabels.join(", ")})`
            : "tie-broken by Net R (no single metric leader)";
        const noteParts = [
            `Winner: ${getRunDisplayName(winnerRun)} ${leadsText}.`,
            `Baseline: ${getRunDisplayName(baselineRun)}.`,
        ];
        if (winnerOtherLeadText) noteParts.push(`${winnerOtherLeadText}.`);
        if (winnerInfo.smallSample) {
            noteParts.push(`Small sample: winner ${winnerInfo.winnerTrades} trades vs ${winnerInfo.maxTrades} max — directional.`);
        }
        if (isScenarioMode) {
            noteParts.push(`Scenario: ${activeScenarioLabel}.`);
        }
        if (hasPartialScenarioCoverage) {
            noteParts.push(`Coverage: ${scenarioCoverage.present}/${scenarioCoverage.total} runs have the scenario; missing runs excluded.`);
        }
        const entry = addProjectFinding(targetProjectId, buildResearchFindingPayload({
            source: "comparison",
            tag: "Comparison",
            title: isScenarioMode
                ? `Comparison · ${activeScenarioLabel} · Run ${winnerShort} leads`
                : `Comparison · Run ${winnerShort} leads`,
            note: noteParts.join(" "),
            runId: baselineRun?.id,
            sourceRunId: baselineRun?.id,
            comparedRunId: winnerRun?.id,
            table: "Comparison Lab",
            metaExtra: {
                runIds: runs.map((r) => r?.id).filter(Boolean),
                winnerRunId: winnerRun?.id || null,
                winnerIdx,
                metricsWon: winnerInfo.winnerLabels,
                smallSample: winnerInfo.smallSample,
                targetProjectId,
                scenarioCoverage: {
                    present: scenarioCoverage.present,
                    total: scenarioCoverage.total,
                    missingRunIds: scenarioCoverage.missingRunIds,
                },
            },
        }));
        if (entry) setComparisonSaved(true);
    };

    // ── Empty state: need at least 2 imported runs to compare ────────
    if (importedRuns.length < 2) {
        return (
            <div className="pb-12">
                <LabRunHero
                    pageLabel="Comparison Lab"
                    title="Multi-Run Comparison"
                    description="Compare equity curves, monthly performance, and KPI deltas across multiple runs."
                    actions={<Link to="/runs"><NeonButton tone="ghost">Browse Runs</NeonButton></Link>}
                />
                <div className="px-6 py-20 flex flex-col items-center text-center gap-4">
                    <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">
                        {importedRuns.length === 0 ? "No Imported Runs" : "Need At Least 2 Runs"}
                    </div>
                    <p className="text-[13px] text-[hsl(var(--text-2))] max-w-[480px] leading-relaxed">
                        {importedRuns.length === 0
                            ? "Import at least 2 runs to start comparing strategies."
                            : "Import one more run to unlock the comparison view."}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                        <Link to="/projects"><NeonButton tone="secondary">Go to Projects</NeonButton></Link>
                        <Link to="/strategy"><NeonButton tone="primary">Open Strategy Builder</NeonButton></Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Comparison Lab"
                title="Multi-Run Comparison"
                description={`Comparing ${runs.length} run${runs.length === 1 ? "" : "s"} — Run A is the baseline.`}
                actions={
                    <>
                        <Link to="/runs"><NeonButton tone="ghost">Browse Runs</NeonButton></Link>
                        <NeonButton icon={Plus} tone="primary" onClick={addRun} disabled={ids.length >= 5} data-testid="cmp-add-run">Add Run ({ids.length}/5)</NeonButton>
                    </>
                }
            />

            {/* 3C — universe badge + scenario selector. In baseline mode the badge
                mirrors the active run's baseline (unchanged from 3B-3). In scenario
                mode it shows the first slot's resolved universe. Analytics are now
                fully scenario-aware via slotUniverses (equity, monthly, WR, PF, DD,
                Net R, Trades). obStats / deltaRows are not present on this page. */}
            <div className="px-6 mt-2 mb-3 flex flex-col gap-1.5">
                <TradeUniverseBadge universe={isScenarioMode ? slotUniverses[0] : baselineUniverse} />
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">Compare Basis</span>
                    <Pill tone="muted">Raw R</Pill>
                    <span className="text-[10px] text-muted-lab">canonical summaries · WR = wins/(wins+losses)</span>
                    {lens.isCurrentEquity && (
                        <span className="text-[10px] text-[hsl(var(--warning))]">
                            Current Equity mode is not yet enabled for cross-run comparison.
                        </span>
                    )}
                    {compareGuard.warnings.map((w) => (
                        <span key={w.code} className="text-[10px] text-muted-lab" title={w.code}>{w.message}</span>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))] shrink-0">
                        Compare Scenario
                    </span>
                    <NeonSelect
                        testId="cmp-scenario-select"
                        value={selectedScenarioValue}
                        onChange={handleScenarioChange}
                        options={scenarioSelectOptions}
                        className="max-w-[280px]"
                    />
                </div>
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    {isScenarioMode
                        ? `Scenario mode · ${activeScenarioLabel} · Raw R`
                        : "Comparing primary-variant baselines · Raw R"}
                </p>
                {hasPartialScenarioCoverage && (
                    <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-2.5 py-1.5" data-testid="cmp-partial-coverage">
                        <span className="text-[10.5px] leading-relaxed text-[hsl(var(--text-2))]">
                            Partial coverage — {scenarioCoverage.present} of {scenarioCoverage.total} runs have {activeScenarioLabel}; missing runs are excluded from verdict/deltas.
                        </span>
                    </div>
                )}
            </div>

            {/* Run selectors */}
            <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {ids.map((id, idx) => {
                    const p = PALETTE[idx % PALETTE.length];
                    const isWinner = idx === winnerIdx && showWinner;
                    return (
                        <div key={idx} className={`relative clip-bevel p-[1px] ${isWinner ? "bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-glow))]" : "bg-[hsl(var(--border-mid))]"}`}>
                            <div className="clip-bevel bg-[hsl(var(--panel))] px-3 py-2.5">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="w-2.5 h-2.5" style={{ background: p.line, boxShadow: `0 0 8px ${p.line}` }} />
                                    <span className="text-[10px] font-ui uppercase tracking-[0.14em] text-muted-lab">Run {p.short}{idx === 0 ? " · Baseline" : ""}</span>
                                    {isWinner && <Crown className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] ml-auto" />}
                                    {ids.length > 2 && (
                                        <button onClick={() => removeAt(idx)} data-testid={`cmp-remove-${idx}`} className="ml-auto text-muted-lab hover:text-[hsl(var(--danger))]">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <NeonSelect testId={`cmp-run-${idx}`} value={id} onChange={(v) => setAt(idx, v)} options={importedRuns.map((r) => ({ value: r.id, label: getRunDisplayName(r) }))} className="w-full" />
                                <div className="mt-2 flex items-center justify-between font-ui text-[11px]">
                                    <span className="text-[hsl(var(--text-2))]">{runs[idx]?.symbol} · {compactTimeframe(runs[idx]?.detectionTf)}</span>
                                    <ColoredR value={(() => {
                                        const sv = slotViews[idx];
                                        return isScenarioMode && !sv?.missingScenario && sv?.analysisTrades?.length
                                            ? netRFromTrades(sv.analysisTrades)
                                            : (runs[idx]?.netR || 0);
                                    })()} />
                                </div>
                                {/* 3C: per-slot scenario presence / missing chip */}
                                {isScenarioMode && (() => {
                                    const sv = slotViews[idx];
                                    if (sv?.missingScenario) return (
                                        <div className="mt-1 text-[10px] font-ui text-[hsl(var(--warning))] leading-snug">
                                            ⚠ No {activeScenarioLabel} data — showing baseline
                                        </div>
                                    );
                                    if (sv?.universe?.universeType === "scenario" && sv.scenarioTrades.length > 0) return (
                                        <div className="mt-1">
                                            <Pill tone="success">{sv.universe.label} · {sv.scenarioTrades.length} trades</Pill>
                                        </div>
                                    );
                                    return null;
                                })()}
                                {runs[idx]?.id && (
                                    <Link
                                        to={`/runs/${encodeURIComponent(runs[idx].id)}`}
                                        className="mt-1.5 inline-block text-[9.5px] font-ui uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:text-white"
                                    >
                                        Open →
                                    </Link>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick KPI deltas */}
            <div className="px-6 mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {runs.slice(1).map((r, idx) => {
                    const p = PALETTE[(idx + 1) % PALETTE.length];
                    const slotIdx = idx + 1;
                    // In scenario mode, a Δ is only meaningful when BOTH the compared
                    // slot and the baseline slot have scenario data — otherwise we'd
                    // subtract a scenario net from a baseline-fallback net.
                    if (isScenarioMode && (!slotComparable(slotIdx) || !slotComparable(0))) {
                        return (
                            <MetricChip
                                key={idx}
                                label={`Δ Net R · ${p.short} − A`}
                                value="—"
                                sub={`No ${activeScenarioLabel} data for ${!slotComparable(0) ? "Run A" : getRunDisplayName(r)}`}
                                tone="muted"
                            />
                        );
                    }
                    const svSlot = slotViews[slotIdx];
                    const svBase = slotViews[0];
                    const rNet = isScenarioMode && !svSlot?.missingScenario && svSlot?.analysisTrades?.length
                        ? netRFromTrades(svSlot.analysisTrades)
                        : r.netR;
                    const baseNet = isScenarioMode && !svBase?.missingScenario && svBase?.analysisTrades?.length
                        ? netRFromTrades(svBase.analysisTrades)
                        : baseline.netR;
                    const dNet = rNet - baseNet;
                    return (
                        <MetricChip
                            key={idx}
                            label={`Δ Net R · ${p.short} − A`}
                            value={`${dNet >= 0 ? "+" : ""}${dNet.toFixed(1)}R`}
                            sub={`${getRunDisplayName(r)} vs ${getRunDisplayName(baseline)}`}
                            tone={dNet >= 0 ? "success" : "danger"}
                        />
                    );
                })}
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Equity Curve Overlay (Net R)" action={<Legend runs={runs} />}>
                    <div style={{ width: "100%", height: 300 }}>
                        <ResponsiveContainer>
                            <AreaChart data={equityMerged} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                <defs>
                                    {runs.map((_, idx) => (
                                        <linearGradient key={idx} id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%"  stopColor={PALETTE[idx % PALETTE.length].line} stopOpacity={0.25} />
                                            <stop offset="100%" stopColor={PALETTE[idx % PALETTE.length].line} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} interval={Math.floor(equityMerged.length / 8)} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                {runs.map((_, idx) => (
                                    <Area key={idx} type="monotone" dataKey={`r${idx}`} stroke={PALETTE[idx % PALETTE.length].line} strokeWidth={1.6} fill={`url(#grad-${idx})`} dot={false} isAnimationActive={false} name={`Run ${PALETTE[idx % PALETTE.length].short}`} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <NeonPanel title="KPI Matrix" action={<Pill tone="primary">{runs.length} RUNS</Pill>}>
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-[11.5px]" data-testid="cmp-kpi-table">
                            <thead>
                                <tr className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                    <th className="text-left py-2 pr-2 font-ui">Metric</th>
                                    {runs.map((_, idx) => (
                                        <th key={idx} className="text-right py-2 px-2 font-ui">{PALETTE[idx % PALETTE.length].short}</th>
                                    ))}
                                </tr>
                                <tr><td colSpan={runs.length + 1} className="p-0 h-px bg-[hsl(var(--border-soft))]" /></tr>
                            </thead>
                            <tbody>
                                {KPI_DEFS.map((def) => (
                                    <tr key={def.key} className="border-b border-[hsl(var(--border-soft)/0.4)]">
                                        <td className="text-muted-lab py-1.5 pr-2 uppercase text-[10px] tracking-wider font-ui">{def.label}</td>
                                        {runs.map((r, idx) => {
                                            const isBaseline = idx === 0;
                                            // Real-PF / Real-DD computed only when full data available
                                            if (def.compute) {
                                                const m = runMetrics(r);
                                                const bm = runMetrics(baseline);
                                                const v    = def.key === "_pf" ? m.pf  : m.maxDd;
                                                const base = def.key === "_pf" ? bm.pf : bm.maxDd;
                                                if (v == null) {
                                                    return (
                                                        <td key={idx} className="text-right py-1.5 px-2 text-muted-lab" title="Full trade history required to compute this metric">
                                                            <span className="italic text-[10.5px]">Limited Data</span>
                                                        </td>
                                                    );
                                                }
                                                const display = def.key === "_pf" ? v.toFixed(2) : `${v.toFixed(1)}R`;
                                                const tone = isBaseline || base == null
                                                    ? "text-white"
                                                    : (def.posIfGreater
                                                        ? (v > base ? "text-[hsl(var(--success))]" : v < base ? "text-[hsl(var(--danger))]" : "text-white")
                                                        : (v < base ? "text-[hsl(var(--success))]" : v > base ? "text-[hsl(var(--danger))]" : "text-white"));
                                                const dtxt = base != null ? `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(2)}${def.key === "_dd" ? "R" : ""}` : "—";
                                                return (
                                                    <td key={idx} className={`text-right py-1.5 px-2 font-num tabular-nums ${tone}`}>
                                                        {display}
                                                        {!isBaseline && base != null && (
                                                            <div className="text-[9.5px] text-muted-lab leading-none">{dtxt}</div>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            // Scenario mode: Net R and Trades come from analysisTrades
                                            // (scenario data, or baseline fallback when missing).
                                            const { analysisTrades: slotAt, missingScenario: slotMs } = slotViews[idx] || {};
                                            const { analysisTrades: baseAt, missingScenario: baseMs } = slotViews[0] || {};
                                            const slotHasTrades = isScenarioMode && !slotMs && (slotAt?.length || 0) > 0;
                                            const baseHasTrades = isScenarioMode && !baseMs && (baseAt?.length || 0) > 0;
                                            const v = def.key === "winRate" ? wrOf(r)
                                                : slotHasTrades && def.key === "netR"   ? netRFromTrades(slotAt)
                                                : slotHasTrades && def.key === "trades" ? slotAt.length
                                                : r[def.key];
                                            const baseVal = def.key === "winRate" ? wrOf(baseline)
                                                : baseHasTrades && def.key === "netR"   ? netRFromTrades(baseAt)
                                                : baseHasTrades && def.key === "trades" ? baseAt.length
                                                : baseline[def.key];
                                            const tone = isBaseline || def.posIfGreater == null
                                                ? "text-white"
                                                : (def.posIfGreater ? (v > baseVal ? "text-[hsl(var(--success))]" : v < baseVal ? "text-[hsl(var(--danger))]" : "text-white")
                                                                    : (v < baseVal ? "text-[hsl(var(--success))]" : v > baseVal ? "text-[hsl(var(--danger))]" : "text-white"));
                                            return (
                                                <td key={idx} className={`text-right py-1.5 px-2 font-num tabular-nums ${tone}`}>
                                                    {def.fmt(v)}
                                                    {!isBaseline && (
                                                        <div className="text-[9.5px] text-muted-lab leading-none">{def.delta(v, baseVal)}</div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {runs.length > 1 && showWinner && (
                        <div className="mt-3 flex flex-col gap-1">
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-[hsl(var(--accent-primary)/0.5)] clip-bevel-sm bg-[hsl(var(--accent-primary)/0.07)] self-start">
                                <Trophy className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))]" />
                                <span className="text-[11px] font-ui uppercase tracking-wider text-white">
                                    Winner · Run {PALETTE[winnerIdx % PALETTE.length].short}
                                    {runs[winnerIdx] ? ` · ${getRunDisplayName(runs[winnerIdx])}` : ""}
                                </span>
                            </div>
                            <div className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                                {winnerInfo.winnerWinCount > 0
                                    ? `Leads ${winnerInfo.winnerWinCount}/${winnerInfo.totalMetrics}: ${winnerInfo.winnerLabels.join(", ")}.`
                                    : "Tie-broken by Net R — no single metric leader."}
                                {winnerOtherLeadText ? ` ${winnerOtherLeadText}.` : ""}
                            </div>
                            {winnerInfo.smallSample && (
                                <div className="text-[10px] font-ui text-[hsl(var(--warning))]">
                                    ⚠ Small sample — winner has {winnerInfo.winnerTrades} trades vs {winnerInfo.maxTrades} max; treat as directional.
                                </div>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                                {targetProjectId ? (
                                    <NeonButton
                                        icon={comparisonSaved ? Check : FileText}
                                        tone="secondary"
                                        onClick={handleSaveComparison}
                                        disabled={comparisonSaved}
                                        data-testid="cmp-save-finding"
                                        className={comparisonSaved ? "opacity-60 cursor-default" : undefined}
                                    >
                                        {comparisonSaved ? "Saved to project" : "Save as Finding"}
                                    </NeonButton>
                                ) : (
                                    <span className="text-[10px] font-ui text-muted-lab">Link a compared run to a project to save findings.</span>
                                )}
                            </div>
                        </div>
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Monthly Performance">
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                            <BarChart data={monthlyMerged} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                {runs.map((_, idx) => (
                                    <Bar key={idx} dataKey={`r${idx}`} fill={PALETTE[idx % PALETTE.length].line} radius={[2, 2, 0, 0]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <ParetoFrontier runs={runs} runMetrics={runMetrics} wrOf={wrOf} />
            </div>
        </div>
    );
}

function Legend({ runs }) {
    return (
        <div className="flex items-center gap-3 text-[10.5px] font-ui flex-wrap">
            {runs.map((r, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2" style={{ background: PALETTE[idx % PALETTE.length].line }} />
                    <Link to={`/runs/${encodeURIComponent(r.id)}`} className="text-[hsl(var(--text-2))] hover:text-white">
                        {PALETTE[idx % PALETTE.length].short}: {getRunDisplayName(r)}
                    </Link>
                </span>
            ))}
        </div>
    );
}

// ── Pareto Frontier · Net R vs Drawdown ──────────────────────────────
// Read-only robustness panel: best return-vs-drawdown tradeoff across the
// runs already selected in Comparison Lab. A run is Pareto-efficient when no
// other run has Net R >= and absolute Max Drawdown <=, while being strictly
// better in at least one of the two. Uses runMetrics() for per-run drawdown.
function ParetoFrontier({ runs, runMetrics, wrOf }) {
    const isNum = (v) => Number.isFinite(Number(v));
    const r1 = (v) => Number(v).toFixed(1);

    const points = (runs || []).map((r) => {
        const m = (runMetrics ? runMetrics(r) : null) || {};
        const netR = isNum(r?.netR) ? Number(r.netR) : null;
        const ddRaw = isNum(m.maxDd) ? Number(m.maxDd) : null;
        const ddAbs = ddRaw != null ? Math.abs(ddRaw) : null;
        // RB-8d.1: WR label uses the same canonical WR (wins/(wins+losses)) as
        // the KPI matrix, not the backend run-summary win rate.
        const wr = wrOf ? wrOf(r) : (isNum(r?.winRate) ? Number(r.winRate) : null);
        return {
            id: r?.id,
            displayName: getRunDisplayName(r),
            symbol: r?.symbol || "—",
            tf: compactTimeframe(r?.detectionTf),
            rr: isNum(r?.rr) ? Number(r.rr) : null,
            netR,
            ddAbs,
            winRate: isNum(wr) ? Number(wr) : null,
            trades: isNum(r?.trades) ? Number(r.trades) : null,
            // Pre-formatted, NaN-safe display strings
            rrLabel: isNum(r?.rr) ? r1(r.rr) : "—",
            netRLabel: netR != null ? `${netR >= 0 ? "+" : ""}${r1(netR)}R` : "Limited Data",
            ddLabel: ddAbs != null ? `${r1(ddAbs)}R` : "Limited Data",
            wrLabel: isNum(wr) ? `${r1(wr)}%` : "—",
            tradesLabel: isNum(r?.trades) ? String(Number(r.trades)) : "—",
        };
    });

    const valid = points.filter((p) => p.netR != null && p.ddAbs != null);

    valid.forEach((p) => {
        p.pareto = !valid.some((o) =>
            o !== p &&
            o.netR >= p.netR && o.ddAbs <= p.ddAbs &&
            (o.netR > p.netR || o.ddAbs < p.ddAbs)
        );
    });

    const paretoCount = valid.filter((p) => p.pareto).length;
    const board = [...valid].sort((a, b) => (b.netR - a.netR) || (a.ddAbs - b.ddAbs));

    if (valid.length < 2) {
        return (
            <NeonPanel className="xl:col-span-3" title="Pareto Frontier · Net R vs Drawdown">
                <div className="flex flex-col items-center text-center gap-2 py-10" data-testid="pareto-limited">
                    <span className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">Limited Data</span>
                    <p className="text-[12.5px] text-muted-lab max-w-md">
                        Import or select at least 2 runs with Net R and Max Drawdown to view the Pareto frontier.
                    </p>
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel className="xl:col-span-3" title="Pareto Frontier · Net R vs Drawdown" action={<Pill tone="primary">{paretoCount} EFFICIENT</Pill>}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2" data-testid="pareto-chart" style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                        <ScatterChart margin={{ top: 12, right: 16, left: -8, bottom: 12 }}>
                            <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" />
                            <XAxis
                                type="number"
                                dataKey="ddAbs"
                                name="Max Drawdown"
                                tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }}
                                tickFormatter={(v) => `${v}R`}
                                label={{ value: "Max Drawdown (R)", position: "insideBottom", offset: -4, fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }}
                            />
                            <YAxis
                                type="number"
                                dataKey="netR"
                                name="Net R"
                                tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }}
                                tickFormatter={(v) => `${v}R`}
                            />
                            <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--border-mid))" }} content={<ParetoTooltip />} />
                            <Scatter data={valid} isAnimationActive={false}>
                                {valid.map((p, i) => (
                                    <Cell
                                        key={i}
                                        fill={p.pareto ? "hsl(var(--accent-primary))" : "hsl(var(--muted)/0.4)"}
                                        stroke={p.pareto ? "hsl(var(--accent-primary))" : "hsl(var(--border-mid))"}
                                        strokeWidth={p.pareto ? 1.5 : 1}
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>

                <div className="lg:col-span-1">
                    <DataTable
                        testId="pareto-leaderboard"
                        columns={[
                            { key: "id", label: "Run", render: (r) => (
                                <Link to={`/runs/${encodeURIComponent(r.id)}`} className="text-[hsl(var(--accent-primary))] hover:text-white">{r.displayName}</Link>
                            ) },
                            { key: "netR",    label: "Net R",    align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "ddAbs",   label: "Max DD",   align: "right", render: (r) => r.ddLabel },
                            { key: "rr",      label: "RR",       align: "right", render: (r) => r.rrLabel },
                            { key: "winRate", label: "Win Rate", align: "right", render: (r) => r.wrLabel },
                            { key: "pareto",  label: "Pareto",   align: "right", render: (r) => (
                                r.pareto ? <Pill tone="primary">EFFICIENT</Pill> : <Pill tone="muted">—</Pill>
                            ) },
                        ]}
                        rows={board}
                        rowKey="id"
                        selectedKey={board.find((p) => p.pareto)?.id}
                    />
                </div>
            </div>
        </NeonPanel>
    );
}

function ParetoTooltip({ active, payload }) {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    return (
        <div className="clip-bevel-sm bg-[hsl(var(--panel-2))] border border-[hsl(var(--accent-primary)/0.4)] px-3 py-2 font-ui text-[11px]">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2" style={{ background: p.pareto ? "hsl(var(--accent-primary))" : "hsl(var(--muted))" }} />
                <span className="text-white">{p.displayName}</span>
                {p.pareto && <span className="text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">Efficient</span>}
            </div>
            <div className="text-muted-lab mt-1">{p.symbol} · {p.tf} · RR {p.rrLabel}</div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span className="text-muted-lab">Net R</span><span className="text-right text-white">{p.netRLabel}</span>
                <span className="text-muted-lab">Max DD</span><span className="text-right text-white">{p.ddLabel}</span>
                <span className="text-muted-lab">Win Rate</span><span className="text-right text-white">{p.wrLabel}</span>
                <span className="text-muted-lab">Trades</span><span className="text-right text-white">{p.tradesLabel}</span>
            </div>
        </div>
    );
}
