// BreakevenTab — Break-even Replay research surface for Protection Lab.
// BE-Replay Phase 3 (trigger basis selector). Candle-walk simulation only — NOT an exact backtest.
// Confidence tier: REPLAY (between EXACT and ESTIMATE).
// No equity curve overlay in V1. No delay/buffer controls in V1.
//
// Performance note: scenario computation is deferred to after first paint via
// useEffect + setTimeout(0) / requestIdleCallback. This prevents the 6×
// candle-walk from blocking the initial tab render.
import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import {
    replayBeScenario,
    buildBeScenarioSummary,
    beReplayAvailability,
} from "@/data/beReplay";
import { resolveBeScenarioSource, hasAnyExactBe, describeBeAvailability } from "@/data/beResolve";
import { useDataset } from "@/data/store";
import { ShieldAlert, AlertTriangle, TrendingUp, BarChart2, Hash, Activity, Loader2, FlaskConical, Circle, CheckCircle2 } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

// Stable empty references so absent BE maps don't create new objects every
// render (which would thrash the scenario-compute effect's dependency array).
const EMPTY_BE_MAP = Object.freeze({});

const ARM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
const DEFAULT_ARM = 0.5;
const DEFAULT_TRIGGER = "wick";

// Base params — triggerBasis is NOT here; it comes from state so it can be toggled.
const REPLAY_PARAMS = Object.freeze({
    stopMode:     "entry",
    delayCandles: 0,
    bufferR:      0,
});

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
                <Pill tone={row.source === "EXACT" ? "success" : "secondary"}>
                    {row.source === "EXACT" ? "EXACT" : "REPLAY"}
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

// ── Main export ───────────────────────────────────────────────────────────────

export function BreakevenTab({ trades, candles, activeRun, activeRunId, beResults, beTradesByMode, executionMode }) {
    // BE Exact Replay maps (BE-FRONTEND-INTEGRATION Phase H). When the backend
    // exported exact scenarios for this run we prefer them per arm+trigger and
    // fall back to the client-side candle-walk REPLAY otherwise.
    const beResultsMap     = beResults     ?? activeRun?.beResults     ?? EMPTY_BE_MAP;
    const beTradesByModeMap = beTradesByMode ?? activeRun?.beTradesByMode ?? EMPTY_BE_MAP;
    const beExecutionMode  = executionMode ?? activeRun?.primaryVariant ?? null;
    const hasExact = React.useMemo(
        () => hasAnyExactBe(beResultsMap, beTradesByModeMap),
        [beResultsMap, beTradesByModeMap],
    );
    // ── All hooks unconditionally before any early return ─────────────────

    // Candle loading (mirrors useRetestData pattern).
    // When candles live in IndexedDB the store delivers CANDLES=[] until
    // loadCandlesForRun() is called. We trigger it here and show a preparing
    // state instead of a false "candles not found" gate.
    const { loadCandlesForRun } = useDataset();
    const [candleLoadState, setCandleLoadState] = React.useState("idle"); // idle|loading|ready|empty|failed
    const loadTokenRef = React.useRef(0);

    const noCandles = !Array.isArray(candles) || !candles.length;

    React.useEffect(() => {
        const token = ++loadTokenRef.current;

        if (!noCandles) {
            setCandleLoadState("ready");
            return;
        }

        const mayHave = !!(
            activeRun?.hasCandles ||
            activeRun?.candlesStorage ||
            activeRun?.reloadAvailable ||
            activeRun?.sidecarRunId || activeRun?.sidecarJobId || activeRun?.originalRunId ||
            activeRun?.outputFolder || activeRun?.sourceOutputFolder
        );

        if (!mayHave || !activeRunId) {
            setCandleLoadState("empty");
            return;
        }

        setCandleLoadState("loading");
        loadCandlesForRun(activeRunId)
            .then(() => {
                if (token !== loadTokenRef.current) return;
                // Store notifies after load; CANDLES prop updates on next render.
                // "ready" here is optimistic — gate stays as "preparing" until
                // noCandles goes false (candles prop propagates).
                setCandleLoadState("ready");
            })
            .catch(() => {
                if (token !== loadTokenRef.current) return;
                setCandleLoadState("failed");
            });
    }, [activeRunId, noCandles]); // eslint-disable-line react-hooks/exhaustive-deps

    const [armLevelR, setArmLevelR]       = React.useState(DEFAULT_ARM);
    const [triggerBasis, setTriggerBasis] = React.useState(DEFAULT_TRIGGER);

    // ── BE EXACT diagnostic ───────────────────────────────────────────────
    // Logs exactly why the tab is showing EXACT or REPLAY for the current run +
    // selection, so a "why no EXACT?" can be answered from the browser console
    // without guesswork. Cheap, read-only, fires when the run/selection changes.
    React.useEffect(() => {
        const d = describeBeAvailability(beResultsMap, beTradesByModeMap, {
            executionMode: beExecutionMode, triggerBasis, armLevelR,
        });
        const resolved = resolveBeScenarioSource({
            armLevelR, triggerBasis, executionMode: beExecutionMode,
            beResults: beResultsMap, beTradesByMode: beTradesByModeMap,
        });
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[BE] ${resolved.source} · run=${activeRunId ?? "?"} · ${triggerBasis} ${armLevelR}R`);
        // eslint-disable-next-line no-console
        console.info({
            activeRunId,
            executionModePassed: beExecutionMode,
            resolvedExecutionMode: d.resolvedExecutionMode,
            hasAnyExact: d.hasAnyExact,
            beResultsExecutionModes: d.beResultsExecutionModes,
            beTradesExecutionModes: d.beTradesExecutionModes,
            beResultsScenarioKeys: d.beResultsScenarioKeys,
            beTradesScenarioKeys: d.beTradesScenarioKeys,
            requestedKey: d.requestedKey,
            source: resolved.source,
            reason: resolved.reason,
            matchedScenarioKey: resolved.scenarioKey,
        });
        // eslint-disable-next-line no-console
        console.groupEnd();
    }, [activeRunId, armLevelR, triggerBasis, beExecutionMode, beResultsMap, beTradesByModeMap]);

    // Fast check only — no candle walking, safe to run synchronously.
    const availability = React.useMemo(
        () => beReplayAvailability(trades, candles),
        [trades, candles],
    );

    // Heavy compute deferred to after first paint.
    // null  = computing (loading state)
    // []    = nothing to compute (gate failed)
    // [...] = ready
    const [scenarios, setScenarios] = React.useState(null);

    React.useEffect(() => {
        // Re-check availability inside the effect so the dep array stays clean.
        const avail = beReplayAvailability(trades, candles);
        // Nothing to show only when REPLAY can't run AND there is no EXACT data.
        if (!avail.available && !hasExact) {
            setScenarios([]);
            return;
        }

        // Signal loading to trigger a repaint before the heavy work starts.
        setScenarios(null);

        let cancelled = false;
        const compute = () => {
            if (cancelled) return;
            const baseline = computeBaseline(trades);
            const result = ARM_LEVELS.map((arm) => {
                // Prefer backend EXACT for this arm + trigger when available.
                const resolved = resolveBeScenarioSource({
                    armLevelR: arm,
                    triggerBasis,
                    executionMode: beExecutionMode,
                    beResults: beResultsMap,
                    beTradesByMode: beTradesByModeMap,
                    baseline,
                });
                if (resolved.source === "EXACT") {
                    return { armLevelR: arm, summary: resolved.summary, source: "EXACT", scenarioKey: resolved.scenarioKey };
                }
                // REPLAY fallback — only if candle-walk is actually available.
                if (avail.available) {
                    const results = replayBeScenario(trades, candles, { ...REPLAY_PARAMS, triggerBasis, armLevelR: arm });
                    const summary = buildBeScenarioSummary(results, baseline);
                    return { armLevelR: arm, summary, source: "REPLAY", scenarioKey: null };
                }
                // EXACT-only run with no candles: this arm wasn't exported.
                return { armLevelR: arm, summary: null, source: "REPLAY", scenarioKey: null };
            });
            if (!cancelled) setScenarios(result);
        };

        // Prefer requestIdleCallback so the browser can paint first; fall back
        // to setTimeout(0) which at minimum defers past the current task.
        const handle = typeof requestIdleCallback !== "undefined"
            ? requestIdleCallback(compute, { timeout: 1500 })
            : setTimeout(compute, 0);

        return () => {
            cancelled = true;
            if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(handle);
            else clearTimeout(handle);
        };
    }, [trades, candles, triggerBasis, hasExact, beResultsMap, beTradesByModeMap, beExecutionMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Must be before any early return (hooks rule).
    const tableColumns = React.useMemo(
        () => buildTableColumns(armLevelR, setArmLevelR),
        [armLevelR],
    );

    // ── Gate: three-state candle resolution ──────────────────────────────
    //
    // State 1 — preparing: noCandles=true but load is in-flight (or the store
    //   prop hasn't propagated after load resolved). Never show "re-export" here.
    // State 2 — missing:   load completed and genuinely no candles exist.
    // State 3 — unavailable: candles present but coverage/trades check failed.
    // EXACT backend results need no candles — only gate on candles for REPLAY.
    if (noCandles && !hasExact) {
        if (candleLoadState === "empty") {
            return (
                <NeonPanel title="Break-even Replay · Candle Data Required" action={<Pill tone="muted">DATA REQUIRED</Pill>}>
                    <div className="flex flex-col gap-3 py-2">
                        <p className="text-[13px] font-display text-[hsl(var(--text-2))] leading-relaxed">
                            candles.csv not found in this bundle. Re-export with candles to enable Break-even Replay.
                        </p>
                        <p className="text-[11px] font-ui text-[hsl(var(--text-2)/0.7)]">
                            Break-even Replay requires 15-min or finer OHLC candles aligned to trade fill and exit timestamps.
                        </p>
                    </div>
                </NeonPanel>
            );
        }
        if (candleLoadState === "failed") {
            return (
                <NeonPanel title="Break-even Replay · Load Error" action={<Pill tone="warning">LOAD ERROR</Pill>}>
                    <div className="flex flex-col gap-3 py-2">
                        <p className="text-[13px] font-display text-[hsl(var(--text-2))] leading-relaxed">
                            Could not load candle data for this run. Try reloading or re-exporting with candles.
                        </p>
                    </div>
                </NeonPanel>
            );
        }
        // idle | loading | ready-but-prop-not-yet-propagated → show preparing
        return (
            <NeonPanel title="Break-even Replay · Preparing">
                <ComputingRow label="Loading candle data…" />
            </NeonPanel>
        );
    }
    if (!availability.available && !hasExact) {
        let gateMsg;
        if (availability.reason === "low_coverage") {
            gateMsg = `Candle coverage too low (${availability.coveragePct}%). ${availability.resolvedCount} of ${availability.filledCount} trades can be resolved. Re-export with updated candles.`;
        } else if (availability.reason === "no_filled_trades") {
            gateMsg = "No filled trades found with fill and exit timestamps. Break-even Replay cannot run.";
        } else {
            gateMsg = "Candle data found but Break-even Replay is unavailable for this run.";
        }
        return (
            <NeonPanel title="Break-even Replay · Unavailable" action={<Pill tone="muted">UNAVAILABLE</Pill>}>
                <div className="flex flex-col gap-3 py-2">
                    <p className="text-[13px] font-display text-[hsl(var(--text-2))] leading-relaxed">{gateMsg}</p>
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2)/0.7)]">
                        Break-even Replay requires 15-min or finer OHLC candles aligned to trade fill and exit timestamps.
                    </p>
                </div>
            </NeonPanel>
        );
    }

    // ── Derived display state ─────────────────────────────────────────────
    const computing = scenarios === null;
    const selected = Array.isArray(scenarios) && scenarios.length
        ? (scenarios.find((sc) => sc.armLevelR === armLevelR) ?? scenarios[0])
        : null;
    const s = selected?.summary ?? null;
    // Source of the currently selected scenario, and whether ANY arm is EXACT.
    const selectedSource = selected?.source ?? (hasExact ? "EXACT" : "REPLAY");
    const isExact = selectedSource === "EXACT";
    const anyExact = Array.isArray(scenarios) && scenarios.some((sc) => sc.source === "EXACT");

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
            source:          source ?? "REPLAY",
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

            {/* ── 1. Confidence banner — EXACT or REPLAY tier ─────────────── */}
            <div className={cn(
                "rounded-[6px] border px-4 py-3",
                isExact
                    ? "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.06)]"
                    : "border-[hsl(var(--accent-secondary)/0.4)] bg-[hsl(var(--accent-secondary)/0.06)]",
            )}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Pill tone={isExact ? "success" : "secondary"}>{isExact ? "EXACT TIER" : "REPLAY TIER"}</Pill>
                    <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">
                        {isExact
                            ? "backend exact replay · 1-minute execution · spread / news / conflict handled"
                            : "candle-resolution · spread not modelled · same-candle conservative"}
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
                        {!anyExact ? null : (
                            <p className="text-[11px] font-ui text-[hsl(var(--text-2)/0.8)] leading-relaxed">
                                Arm levels without an exported backend scenario fall back to candle-resolution
                                REPLAY — the Source column marks each row.
                            </p>
                        )}
                    </div>
                ) : (
                <div className="flex flex-col gap-1.5">
                    {!hasExact && (
                        <p className="text-[11px] font-ui text-[hsl(var(--text-1))] leading-relaxed">
                            <span className="font-semibold">Backend EXACT results not found for this run.</span>{" "}
                            Showing frontend REPLAY fallback. Re-run the backtest with break-even enabled
                            (and re-import the bundle) to see exact 1-minute results.
                        </p>
                    )}
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <span className="font-semibold text-[hsl(var(--text-1))]">Candle-resolution replay:</span>{" "}
                        arm/exit detection uses 15-min OHLC bars. Not tick-level.
                    </p>
                    {triggerBasis === "wick" ? (
                        <p className="text-[11px] font-ui text-[hsl(var(--warning))] leading-relaxed">
                            <span className="font-semibold">Wick trigger — same-candle ambiguity risk:</span>{" "}
                            when the arm and the BE stop are both touched on the same bar, ordering is unknown.
                            The conservative rule assumes BE triggered first. Ambig% in the table shows how often this applies.
                            High ambiguity at tight arm levels (e.g. 0.25R) makes results least reliable.
                        </p>
                    ) : (
                        <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            <span className="font-semibold text-[hsl(var(--text-1))]">Close trigger — slower arming:</span>{" "}
                            BE arms only after a candle closes beyond the arm level, not on a wick touch.
                            This reduces same-candle ambiguity but may miss arming on fast moves.
                            Close trigger is not more "exact" than wick — it is a different approximation.
                        </p>
                    )}
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <span className="font-semibold text-[hsl(var(--text-1))]">Spread and slippage not modelled.</span>{" "}
                        BE exit R = 0R (entry price, no fill cost).
                    </p>
                </div>
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
                                return (
                                    <button
                                        key={arm}
                                        type="button"
                                        onClick={() => setArmLevelR(arm)}
                                        className={cn(
                                            "flex flex-col items-center px-3.5 py-2 rounded-[4px] border text-[11px] font-ui font-semibold transition-colors",
                                            active
                                                ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                                : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                                        )}
                                    >
                                        <span>{arm}R</span>
                                        <span className="text-[9.5px] font-normal mt-0.5 opacity-60">
                                            {sc && sc.summary ? `${sc.summary.beExitCount} exits` : computing ? "…" : "—"}
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
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setTriggerBasis(opt.value)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-[4px] border text-[11px] font-ui font-semibold transition-colors",
                                            active
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
                    <ComputingRow label="Walking candles for all arm levels…" />
                ) : (
                    <>
                        <DataTable
                            columns={tableColumns}
                            rows={tableRows}
                            rowKey="id"
                            selectedKey={armLevelR}
                            onRowClick={(row) => setArmLevelR(row.arm)}
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

            {/* ── 8. Planned Research: Dynamic Stop Reduction ──────────────── */}
            <NeonPanel
                title="Planned Research · Dynamic Stop Reduction"
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
