import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { MetricChip } from "@/components/lab/MetricChip";
import { EquityCurveV2, MiniLine } from "@/components/lab/EquityCurve";
import { DataTable, Pill } from "@/components/lab/DataTable";
import { NeonButton, NeonInput, NeonSelect, FilterToggle } from "@/components/lab/controls";
import { RunConfigStrip } from "@/components/lab/RunConfigStrip";
import { compactTimeframe, formatRunDateRange, getRunDisplayName, reloadFullRunFromSidecar, updateRunBundle, useDataset } from "@/data/store";
import { setActiveRunId, setSelectedTradeVariant } from "@/data/store";
import { getNextStep, resolveRunReference, summarizeRunForDelta, buildRunDelta } from "@/data/projectWorkflow";
import { ResearchStrip } from "@/components/lab/ResearchStrip";
import { useResultsLens } from "@/data/useResultsLens";
import {
    buildAccountEquityCurve,
    formatAccountValue,
    summarizeAccountEquity,
} from "@/components/lab/account/accountEquity";
import {
    buildFundingChallengeEquityCurve,
    normalizeFundingChallengeSettings,
    simulateFundingChallenge,
} from "@/components/lab/account/fundingChallenge";
import { FolderKanban, Map as MapIcon, GitCompareArrows, TrendingUp, Hash, Activity, Target, AlertTriangle, ShieldCheck, Edit3, X as XIcon, SlidersHorizontal, ChevronDown, Eye } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
    isPerformanceTrade,
    isWinTrade,
    isLossTrade,
    displayOutcomeLabel,
    outcomeToneForTrade,
    summarizeTradeClassifications,
    classifyTrade,
    PERFORMANCE_CATEGORIES,
} from "@/data/tradeClassification";
import { TradeSanityStrip } from "@/components/lab/TradeSanityStrip";
// RW-2: scenario-aware result-view selector (display-only; analytics wired in RW-3).
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { buildAvailableOptions, collectAllEntryKeys, entryTradesByMode, buildCanonicalKey, derivePrimaryResultView } from "@/data/tradeUniverse";
// RW-4A: directional scenario label formatter
import { formatDirectionalScenarioLabel } from "@/components/lab/entries/analytics/entryFormatters";

// RB-8a/8b: account config lives in the global store (state.accountSettings),
// read/written via useResultsLens (lens.accountSettings / lens.setAccountSettings)
// and persisted under fxob_account_settings_v1. RunDetail keeps no local copy.
// The legacy fxob_account_view_settings_v1 key is migrated once by the store
// loader and is intentionally left intact.
const FUNDING_CHALLENGE_SETTINGS_KEY = "fxob_funding_challenge_settings_v1";

// Performance-trade gate for the KPI strip. Delegates to the canonical
// classifier in tradeClassification.js — this is the single source of truth.
// Previously this inlined its own substring-matching logic and silently
// included outcome="INVALID" rows because it only matched "INVALIDATED".
function isValidExecutedTrade(trade) {
    return isPerformanceTrade(trade);
}

// +1 = win, -1 = loss, 0 = flat / not a performance trade. Delegates to
// canonical isWin/isLoss/isFlat so this exactly matches the categories the
// rest of the app uses.
function tradeResultSign(trade) {
    if (isWinTrade(trade)) return 1;
    if (isLossTrade(trade)) return -1;
    return 0;
}

function formatRunMonthSpan(value) {
    const range = normalizeRunDateRange(value);
    if (!range?.from || !range?.to) return "";
    const start = parseRunDateValue(range.from);
    const end = parseRunDateValue(range.to);
    if (!start || !end || end <= start) return "";
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (days < 30) return "<1 month";
    const endMonthDays = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    const calendarMonths = ((end.getUTCFullYear() - start.getUTCFullYear()) * 12)
        + (end.getUTCMonth() - start.getUTCMonth())
        + ((end.getUTCDate() - start.getUTCDate()) / endMonthDays);
    const months = Math.max(1, Math.round(Number.isFinite(calendarMonths) ? calendarMonths : days / 30.44));
    return `${months} ${months === 1 ? "month" : "months"}`;
}

function normalizeRunDateRange(value) {
    if (!value) return null;
    if (typeof value === "object") return { from: value.from, to: value.to };
    const parts = String(value).split("→").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return { from: parts[0], to: parts[1] };
    return null;
}

function parseRunDateValue(value) {
    if (!value || value === "?") return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
        return Number.isFinite(date.getTime()) ? date : null;
    }
    const short = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2}|\d{4})$/);
    if (short) {
        const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            .indexOf(short[2].slice(0, 3).toLowerCase());
        const year = Number(short[3].length === 2 ? `20${short[3]}` : short[3]);
        if (month >= 0) {
            const date = new Date(Date.UTC(year, month, Number(short[1])));
            return Number.isFinite(date.getTime()) ? date : null;
        }
    }
    return null;
}

function readFirstPresent(...values) {
    return values.find((value) => value != null && value !== "" && value !== "—");
}

function readNumberValue(...values) {
    const value = readFirstPresent(...values);
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatNumberValue(value) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : "—";
}

function formatPercentValue(value) {
    const formatted = formatNumberValue(value);
    return formatted === "—" ? formatted : `${formatted}%`;
}

function formatPipValue(value) {
    const formatted = formatNumberValue(value);
    if (formatted === "—") return formatted;
    return `${formatted} ${Number(formatted) === 1 ? "pip" : "pips"}`;
}

function formatTickValue(value) {
    const formatted = formatNumberValue(value);
    if (formatted === "—") return formatted;
    return `${formatted} ${Number(formatted) === 1 ? "tick" : "ticks"}`;
}

function formatChallengeStatus(status) {
    if (status === "passed") return "Passed";
    if (status === "failed") return "Failed";
    if (status === "funded") return "Funded";
    if (status === "not_started") return "Not Started";
    if (status === "unavailable") return "Unavailable";
    return "In Progress";
}

function challengeTone(status) {
    if (status === "passed" || status === "funded") return "success";
    if (status === "failed") return "danger";
    if (status === "not_started" || status === "unavailable") return "muted";
    return "secondary";
}

function formatChallengeDate(value) {
    if (!value) return "—";
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return value;
    return `${date.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function formatStructureFilterValue(value) {
    const text = String(value || "both").toLowerCase();
    if (text === "bos") return "BOS";
    if (text === "choch") return "CHoCH";
    return "Both";
}

function loadFundingChallengeSettings() {
    try {
        return normalizeFundingChallengeSettings(JSON.parse(localStorage.getItem(FUNDING_CHALLENGE_SETTINGS_KEY) || "{}"));
    } catch {
        return normalizeFundingChallengeSettings();
    }
}

function saveFundingChallengeSettings(settings) {
    try {
        localStorage.setItem(FUNDING_CHALLENGE_SETTINGS_KEY, JSON.stringify(normalizeFundingChallengeSettings(settings)));
    } catch {
        // Funding overlay preferences are optional.
    }
}

function FundingPhaseCard({ title, phase, currency }) {
    const status = phase?.status || "not_started";
    return (
        <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] font-ui uppercase tracking-widest text-muted-lab leading-snug">{title}</div>
                <div className="shrink-0"><Pill tone={challengeTone(status)}>{formatChallengeStatus(status)}</Pill></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                    <div className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Trigger</div>
                    <div className="mt-1 text-[15px] font-semibold tabular-nums text-[hsl(var(--text))]">
                        {phase?.tradeNumber ? `Trade ${phase.tradeNumber}` : "—"}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Equity</div>
                    <div className="mt-1 text-[15px] font-semibold tabular-nums text-[hsl(var(--text))]">
                        {formatAccountValue(phase?.equity, currency)}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Days</div>
                    <div className="mt-1 text-[13px] tabular-nums text-[hsl(var(--text-2))]">
                        {phase?.tradingDays ?? 0} {phase?.minTradingDaysMet ? "met" : "pending"}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Date</div>
                    <div className="mt-1 text-[13px] tabular-nums text-[hsl(var(--text-2))]">
                        {formatChallengeDate(phase?.date)}
                    </div>
                </div>
            </div>
            <div className="mt-3 text-[10.5px] leading-relaxed text-muted-lab">
                Target {formatAccountValue(phase?.targetEquity, currency)} · Max loss floor {formatAccountValue(phase?.lossFloor, currency)}
            </div>
        </div>
    );
}

export default function RunDetail() {
    const { ACTIVE_RUN, TRADES, RUNS, PROJECTS, getRunData, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS, SCENARIO } = useDataset();
    // RB-8b: basis + account config consumed through the canonical lens hook.
    const lens = useResultsLens();
    const params = useParams();
    const navigate = useNavigate();
    const runId = params.runId === "active" ? ACTIVE_RUN.id : decodeURIComponent(params.runId || ACTIVE_RUN.id);
    const run = RUNS.find((r) => r.id === runId) || ACTIVE_RUN;
    // Per-run lookup: imported bundles carry their own trades + equity curve.
    const runData = getRunData(runId);

    // ── Result View state ────────────────────────────────────────────────────
    // Isolated from the global SCENARIO so a stale Strategy Map selection for
    // a different run never corrupts Run Workspace. Bootstraps from the global
    // scenario only when it explicitly targets this run.
    //
    // Priority: A. explicit global SCENARIO for this run
    //           B. derivePrimaryResultView (config-intent aware)
    //           C. baseline fallback
    function getInitialResultView(bundle) {
        return derivePrimaryResultView(bundle) ?? {
            family: "baseline",
            threshold: null,
            fillMode: null,
            directionalStorageKey: null,
        };
    }
    const [resultView, setResultView] = React.useState(() => {
        if (SCENARIO?.runId === runId && SCENARIO?.family && SCENARIO.family !== "baseline") {
            return { family: SCENARIO.family, threshold: SCENARIO.threshold, fillMode: SCENARIO.fillMode };
        }
        return getInitialResultView(runData);
    });
    // Reset to primary result view whenever the user switches to a different run.
    React.useEffect(() => {
        if (SCENARIO?.runId === runId && SCENARIO?.family && SCENARIO.family !== "baseline") {
            setResultView({ family: SCENARIO.family, threshold: SCENARIO.threshold, fillMode: SCENARIO.fillMode });
        } else {
            setResultView(getInitialResultView(runData));
        }
    }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps
    // Resolve the selected universe. Drives selector labels, metadata, warnings,
    // and — via displayTrades — all analytics sections (KPIs, equity, ledger).
    const universe = useTradeUniverse(runId, resultView);
    // Build the flat list of selectable Result View options for this bundle.
    const resultViewOptions = React.useMemo(() => {
        const allKeys = collectAllEntryKeys(runData || {}, runData?.trades || []);
        const opts = buildAvailableOptions(allKeys);
        const views = [{ key: "baseline", label: "Baseline Reference", family: "baseline", threshold: null, fillMode: null }];
        const { availableFamilies = [], thresholdsByFamily = {}, fillModesByFamilyThreshold = {} } = opts;
        availableFamilies.filter((f) => f !== "baseline").forEach((family) => {
            const familyLabel = family === "triggered_edge" ? "Triggered Edge"
                : family === "penetration" ? "Penetration"
                : String(family).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            (thresholdsByFamily[family] || []).forEach((threshold) => {
                const threshStr = threshold != null ? ` ${threshold}%` : "";

                // RW-11A: Penetration has no candle fill mode (depth-based entry,
                // no Same/Next/Both concept). Push exactly one option per threshold.
                if (family === "penetration") {
                    views.push({
                        key: `${family}_${threshold}_nofill`,
                        label: `${familyLabel}${threshStr}`,
                        family,
                        threshold,
                        fillMode: null,
                    });
                    return; // skip fill-mode iteration entirely
                }

                const ftKey = `${family}::${threshold}`;
                const ftModes = fillModesByFamilyThreshold[ftKey] || [];
                // Track which fill modes already have an explicit option so we
                // do not create duplicates when injecting virtual Same/Next below.
                const ftModeSet = new Set(ftModes);
                ftModes.forEach((fillMode) => {
                    // RW-9: expanded labels for candle-fill clarity.
                    const fillStr = fillMode === "next" ? " · Next candle"
                        : fillMode === "same" ? " · Same candle"
                        : fillMode === "both" ? " · Both"
                        : fillMode === "d2"   ? " · Delay +2"
                        : fillMode === "d3"   ? " · Delay +3"
                        : "";
                    views.push({
                        key: `${family}_${threshold}_${fillMode ?? "both"}`,
                        label: `${familyLabel}${threshStr}${fillStr}`,
                        family,
                        threshold,
                        fillMode: fillMode === "both" ? null : (fillMode || null),
                    });

                    // RW-9: when a bare/combined option exists ("both"), inject virtual
                    // "Same candle" and "Next candle" options immediately after so the
                    // user can inspect each fill mode explicitly. selectTrades already
                    // handles this split via `filled_on_trigger_candle` filtering — we
                    // only need to confirm the combined pool has that field populated,
                    // and that explicit _same/_next keys don't already cover the mode.
                    // RW-11A: triggered_edge only — penetration is handled above.
                    if (fillMode === "both" && family === "triggered_edge") {
                        const bareKey = buildCanonicalKey(family, threshold, null);
                        const combinedPool = entryTradesByMode(runData || {})[bareKey] || [];
                        const hasSplitData = combinedPool.some(
                            (t) => t.filled_on_trigger_candle !== undefined
                                || t.filledOnTriggerCandle !== undefined,
                        );
                        if (hasSplitData) {
                            if (!ftModeSet.has("same")) {
                                views.push({
                                    key: `${family}_${threshold}_same`,
                                    label: `${familyLabel}${threshStr} · Same candle`,
                                    family,
                                    threshold,
                                    fillMode: "same",
                                    fromCombinedPool: true,
                                });
                            }
                            if (!ftModeSet.has("next")) {
                                views.push({
                                    key: `${family}_${threshold}_next`,
                                    label: `${familyLabel}${threshStr} · Next candle`,
                                    family,
                                    threshold,
                                    fillMode: "next",
                                    fromCombinedPool: true,
                                });
                            }
                        }
                    }
                });
            });
        });
        // RW-4A: directional backend scenarios (bundle.directionalResults silo)
        const drMeta = runData?.directionalResults?.scenarioMeta || {};
        Object.entries(drMeta).forEach(([storageKey, meta]) => {
            const scenarioId = meta?.scenarioId || storageKey.replace(/^[^_]+__/, "");
            views.push({
                key: `directional_${storageKey}`,
                label: formatDirectionalScenarioLabel(scenarioId),
                family: "directional",
                directionalStorageKey: storageKey,
                executionMode: meta?.executionMode || null,
                threshold: null,
                fillMode: null,
            });
        });
        return views;
    }, [runData]);

    // ── RW-10A: grouped navigation + active option ───────────────────────────
    const resultViewGroups = React.useMemo(() => {
        const FILL_SLOTS = [
            { fillMode: null,   displayLabel: "Both" },
            { fillMode: "same", displayLabel: "Same candle" },
            { fillMode: "next", displayLabel: "Next candle" },
            { fillMode: "d2",   displayLabel: "Delay +2" },
            { fillMode: "d3",   displayLabel: "Delay +3" },
        ];
        const groups = [];
        const baselineOpt = resultViewOptions.find((o) => o.family === "baseline");
        if (baselineOpt) {
            groups.push({
                groupKey: "baseline",
                groupLabel: null,
                slots: [{ ...FILL_SLOTS[0], displayLabel: "Baseline Reference", available: true, opt: baselineOpt }],
            });
        }
        const seen = new Set();
        resultViewOptions.filter((o) => o.family !== "baseline").forEach((opt) => {
            const gKey = `${opt.family}::${opt.threshold}`;
            if (seen.has(gKey)) return;
            seen.add(gKey);
            const familyLabel = opt.family === "triggered_edge" ? "Triggered Edge"
                : opt.family === "penetration" ? "Penetration"
                : String(opt.family).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const threshStr = opt.threshold != null ? ` ${opt.threshold}%` : "";
            const groupOpts = resultViewOptions.filter(
                (o) => o.family === opt.family && o.threshold === opt.threshold,
            );
            const slots = FILL_SLOTS.map((slot) => {
                const match = groupOpts.find((o) => o.fillMode === slot.fillMode);
                return { ...slot, available: Boolean(match), opt: match || null };
            });
            groups.push({ groupKey: gKey, groupLabel: `${familyLabel}${threshStr}`, slots });
        });
        // RW-4A: directional scenarios group
        const directionalOpts = resultViewOptions.filter((o) => o.family === "directional");
        if (directionalOpts.length > 0) {
            groups.push({
                groupKey: "directional",
                groupLabel: "Directional Scenarios",
                slots: directionalOpts.map((opt) => ({
                    fillMode: null,
                    displayLabel: opt.label,
                    available: true,
                    opt,
                })),
            });
        }
        return groups;
    }, [resultViewOptions]);

    const activeResultViewOption = React.useMemo(() => {
        const isScenario = Boolean(resultView?.family && resultView.family !== "baseline");
        return resultViewOptions.find((opt) => (
            opt.family === "baseline"
                ? !isScenario
                : resultView?.family === "directional"
                    ? opt.family === "directional" && opt.directionalStorageKey === resultView?.directionalStorageKey
                    : resultView?.family === opt.family
                        && resultView?.threshold === opt.threshold
                        && resultView?.fillMode === opt.fillMode
        )) || null;
    }, [resultViewOptions, resultView]);
    // Readable label for the trade breakdown modal header
    const breakdownViewLabel = React.useMemo(() => {
        const fam = resultView?.family;
        const thr = resultView?.threshold;
        const fm  = resultView?.fillMode;
        if (!fam || fam === "baseline") return "Baseline Reference";
        if (fam === "directional") {
            const sk = resultView?.directionalStorageKey || "";
            const scenarioId = sk.replace(/^[^_]+__/, "");
            return formatDirectionalScenarioLabel(scenarioId) || "Directional Scenario";
        }
        if (fam === "penetration") return thr != null ? `Penetration ${thr}%` : "Penetration";
        if (fam === "triggered_edge") {
            const base = thr != null ? `Triggered Edge ${thr}%` : "Triggered Edge";
            const mode = fm === "same" ? " · Same Candle"
                       : fm === "next" ? " · Next Candle"
                       : fm === "d2"   ? " · Delay +2"
                       : fm === "d3"   ? " · Delay +3"
                       : " · Both";
            return base + mode;
        }
        return activeResultViewOption?.label || String(fam).replace(/_/g, " ");
    }, [resultView, activeResultViewOption]);
    // ── end Result View state ────────────────────────────────────────────────

    const runConfig = runData?.config || run?.config || {};
    const displayName = getRunDisplayName(runData || run);
    const projectId = runData?.projectId || runData?.summary?.projectId || run?.projectId || run?.summary?.projectId;
    // WF-2: surface the project workflow "next step" on the Run Workspace.
    const linkedProject = projectId ? (PROJECTS || []).find((p) => p.id === projectId) || null : null;
    const runRole = runData?.runRole || runData?.summary?.runRole || run?.runRole || "imported";
    const nextStep = linkedProject ? getNextStep(linkedProject, linkedProject.checklist || {}) : null;
    // WF-3: headline "what changed?" delta vs the most relevant reference run.
    const runReference = React.useMemo(
        () => resolveRunReference({ currentRun: run, project: linkedProject, runs: RUNS }),
        [run, linkedProject, RUNS],
    );
    const deltaRows = React.useMemo(() => {
        if (!runReference.run) return [];
        const current = summarizeRunForDelta(run, runData?.trades);
        const refData = getRunData(runReference.run.id);
        const reference = summarizeRunForDelta(runReference.run, refData?.trades);
        return buildRunDelta(current, reference);
    }, [run, runData, runReference, getRunData]);
    const runSymbol = run.symbol || runData?.summary?.symbol || runData?.config?.symbol || "—";
    const runTf = compactTimeframe(run.detectionTf || runData?.summary?.detectionTf || runData?.summary?.detection_tf || runData?.config?.detection_timeframe || "—");
    const runRr = Number(run.rr ?? runData?.summary?.rr ?? runData?.config?.rr_multiple);
    const entryDepthPct = readNumberValue(runConfig.ob_entry_depth_pct, runConfig.obEntryDepthPct, run.obEntryDepthPct);
    const entryBufferPips = readNumberValue(runConfig.entry_buffer_pips, runConfig.entry_buffer, runConfig.entryBuffer, run.entryBuffer);
    const stopBufferPips = readNumberValue(runConfig.stop_buffer_pips, runConfig.stop_buffer, runConfig.stopBuffer, run.stopBuffer);
    const verifyLimitTicks = readNumberValue(runConfig.verify_limit_ticks, runConfig.verify_ticks, runConfig.verifyTicks, run.verifyTicks);
    const structureFilter = readFirstPresent(runConfig.structure_filter, runConfig.structureFilter, runConfig.structure_type, run.structureFilter);
    const rawRunDateRange = run.dateRange || runData?.summary?.dateRange || "";
    const runDateRange = formatRunDateRange(rawRunDateRange);
    const runMonthSpan = formatRunMonthSpan(rawRunDateRange);
    const runDateRangeLine = runDateRange && runMonthSpan ? `${runDateRange} • ${runMonthSpan}` : runDateRange;
    const runSwitcherOptions = React.useMemo(() => (RUNS || []).map((candidate) => {
        const candidateData = getRunData(candidate.id);
        const candidateConfig = candidateData?.config || candidate?.config || {};
        const candidateStructure = readFirstPresent(
            candidateConfig.structure_filter,
            candidateConfig.structureFilter,
            candidateConfig.structure_type,
            candidate.structureFilter,
        );
        const label = candidate.displayName || candidate.name || getRunDisplayName(candidateData || candidate) || candidate.id;
        return {
            value: candidate.id,
            label: candidateStructure ? `${label} · ${formatStructureFilterValue(candidateStructure)}` : label,
        };
    }), [RUNS, getRunData]);
    const [editingName, setEditingName] = React.useState(false);
    const [draftName, setDraftName] = React.useState(displayName);
    // ── Equity chart controls ────────────────────────────────────────────────
    const [equityFiltersOpen, setEquityFiltersOpen] = React.useState(false);
    const [accountFundingCollapsed, setAccountFundingCollapsed] = React.useState(false);
    const [showDots,     setShowDots]     = React.useState(true);
    const [showDrawdown, setShowDrawdown] = React.useState(true);
    const [showNews,     setShowNews]     = React.useState(true);
    // ── Equity research filters (affect chart only) ──────────────────────────
    const [equitySessionFilter,   setEquitySessionFilter]   = React.useState("All");
    const [equityDirectionFilter, setEquityDirectionFilter] = React.useState("All");
    const [equityStructureFilter, setEquityStructureFilter] = React.useState("All");
    const [equityExcludeNews,     setEquityExcludeNews]     = React.useState(false);
    const [equityExcludeMissed,   setEquityExcludeMissed]   = React.useState(false);
    const [ledgerResultFilter,    setLedgerResultFilter]    = React.useState("All");
    const [ledgerSessionFilter,   setLedgerSessionFilter]   = React.useState("All");
    const [ledgerDirectionFilter, setLedgerDirectionFilter] = React.useState("All");
    const [ledgerSearch,          setLedgerSearch]          = React.useState("");
    const [activeResultsTab,      setActiveResultsTab]      = React.useState("config");
    const [resultsLayoutMode,     setResultsLayoutMode]     = React.useState("tabbed");
    const [runDetailSettingsOpen, setRunDetailSettingsOpen] = React.useState(false);
    // RB-8a/8b: account config is the single store slice, read via the lens.
    const accountSettings = lens.accountSettings;
    const [fundingSettings, setFundingSettings] = React.useState(loadFundingChallengeSettings);
    const [fundingChartMode, setFundingChartMode] = React.useState("funding_phase");
    const [reloadBusy, setReloadBusy] = React.useState(false);
    const [reloadError, setReloadError] = React.useState("");
    const [activeKpiModal, setActiveKpiModal] = React.useState(null); // "net"|"winRate"|"trades"|"expectancy"|"profitFactor"|"drawdown"
    const autoReloadAttempted = React.useRef(new Set());
    // Account settings persistence is owned by the store (setAccountSettings).
    React.useEffect(() => {
        saveFundingChallengeSettings(fundingSettings);
    }, [fundingSettings]);
    const accountModeEnabled = accountSettings.mode !== "r_only";
    const accountModeOptions = [
        { value: "current_equity_pct", label: "% of current equity" },
        { value: "initial_equity_pct", label: "% of initial balance" },
        { value: "fixed_dollar", label: "Fixed dollar risk" },
    ];
    const patchAccountSettings = React.useCallback((patch) => {
        lens.setAccountSettings(patch); // store normalizes, merges, persists, notifies
    }, [lens]);
    const patchFundingSettings = React.useCallback((patch) => {
        setFundingSettings((current) => normalizeFundingChallengeSettings({ ...current, ...patch }));
    }, []);
    React.useEffect(() => {
        setDraftName(displayName);
        setEditingName(false);
    }, [displayName, runId]);
    const saveName = () => {
        const name = draftName.trim();
        if (!runData || !name) {
            setEditingName(false);
            setDraftName(displayName);
            return;
        }
        updateRunBundle(runId, { displayName: name, name, summary: { displayName: name, name } });
        setEditingName(false);
    };
    const isActiveRun = run.id === ACTIVE_RUN.id;
    React.useEffect(() => {
        const hasRunSpecificData = Boolean(
            runData
            && !runData.indexOnly
            && runData.storageMode !== "index_only"
            && (
                (Array.isArray(runData.trades) && runData.trades.length)
                || Object.values(runData.tradesByVariant || {}).some((trades) => Array.isArray(trades) && trades.length)
                || (Array.isArray(runData.orderBlocks) && runData.orderBlocks.length)
            )
        );
        if (runId && runId !== ACTIVE_RUN.id && hasRunSpecificData) {
            setActiveRunId(runId);
        }
    }, [ACTIVE_RUN.id, runData, runId]);
    const selectedRunVariant =
        ACTIVE_TRADE_VARIANT && runData?.tradesByVariant?.[ACTIVE_TRADE_VARIANT]
            ? ACTIVE_TRADE_VARIANT
            : runData?.primaryVariant;
    // ── RW-3A: legacy resolution path — preserved as the fallback ───────────
    const legacyTradesForRun =
        (selectedRunVariant && runData?.tradesByVariant?.[selectedRunVariant])
        || runData?.trades
        || (isActiveRun ? TRADES : null);

    // ── RW-3B: route all analytics through the selected result view ───────────
    // selectedUniverseTrades is whatever the active universe resolved (baseline or
    // scenario path). When non-empty, tradesForRun points at those trades. When
    // the universe is empty (scenario unavailable, still resolving, or index-only),
    // tradesForRun falls back to legacyTradesForRun so the page never goes blank.
    // obStats / deltaRows stay pinned to runData.trades and runData.orderBlocks —
    // those are intentionally outside the result-view routing.
    // RW-4A: directional backend scenario — bypass universe, read directly from bundle.directionalResults
    const isDirectionalView = resultView?.family === "directional";
    const directionalStorageKey = isDirectionalView ? (resultView?.directionalStorageKey || null) : null;
    const directionalTrades = isDirectionalView
        ? (runData?.directionalResults?.tradesByScenario?.[directionalStorageKey] || [])
        : [];
    const selectedUniverseTrades = isDirectionalView
        ? directionalTrades
        : (Array.isArray(universe?.trades) ? universe.trades : []);
    const hasSelectedUniverseTrades = selectedUniverseTrades.length > 0;
    const tradesForRun = hasSelectedUniverseTrades ? selectedUniverseTrades : legacyTradesForRun;

    // displayTrades is now a direct alias for tradesForRun. It is kept so that
    // existing analytics memos (MONTHLY, R_DIST_V2, filteredLedgerRows, etc.)
    // require no renaming. isScenarioView is kept for the active banner and scope chip.
    const isScenarioView = Boolean(resultView?.family && resultView.family !== "baseline");
    const displayTrades = tradesForRun;

    // ── RW-3A: dev-only baseline parity audit ─────────────────────────────────
    // Compares universe.trades (resolved via resolveBaselineUniverse) against
    // legacyTradesForRun. A mismatch flags that wiring analytics to universe.trades
    // on the baseline path would change numbers — RW-3 must not proceed until all
    // representative runs return { match: true }. Dead-code-eliminated in prod.
    const baselineParityAudit = React.useMemo(() => {
        if (process.env.NODE_ENV === "production") return null;
        const isBaseline = !resultView?.family || resultView.family === "baseline";
        if (!isBaseline) return null; // only meaningful on the baseline path
        const legacyCount = Array.isArray(legacyTradesForRun) ? legacyTradesForRun.length : null;
        const universeCount = Array.isArray(universe?.trades) ? universe.trades.length : null;
        if (legacyCount === null || universeCount === null) {
            return { match: false, reason: "one_side_null", legacyCount, universeCount };
        }
        return {
            match: legacyCount === universeCount,
            reason: legacyCount === universeCount ? "ok" : "count_mismatch",
            legacyCount,
            universeCount,
        };
    }, [resultView, legacyTradesForRun, universe]);

    React.useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        if (!baselineParityAudit) return;
        if (!baselineParityAudit.match) {
            console.warn(
                "[RW-3A] Baseline parity mismatch",
                { runId, ...baselineParityAudit },
            );
        }
    }, [baselineParityAudit, runId]);
    // ── end RW-3A ─────────────────────────────────────────────────────────────

    const hasFullRunData = Boolean(
        runData?.hasFullData
        || (Array.isArray(runData?.trades) && runData.trades.length)
        || Object.values(runData?.tradesByVariant || {}).some((trades) => Array.isArray(trades) && trades.length)
        || Object.values(runData?.entryResults?.tradesByMode || {}).some((trades) => Array.isArray(trades) && trades.length)
    );
    const isIndexOnlyRun = Boolean(runData?.indexOnly || runData?.storageMode === "index_only" || (runData && !hasFullRunData));
    const shouldAutoReloadRun = Boolean(isIndexOnlyRun && runData?.reloadAvailable && runId);
    const requestFullRunReload = React.useCallback(async () => {
        if (!runId || reloadBusy) return;
        console.debug("[RunDetail] reload start", {
            runId,
            indexOnly: Boolean(runData?.indexOnly || runData?.storageMode === "index_only"),
            reloadAvailable: Boolean(runData?.reloadAvailable),
            hasFullData: Boolean(runData?.hasFullData),
            tradesBefore: Array.isArray(runData?.trades) ? runData.trades.length : 0,
        });
        setReloadBusy(true);
        setReloadError("");
        try {
            const reloadedRun = await reloadFullRunFromSidecar(runId);
            console.debug("[RunDetail] reload success", {
                runId,
                tradesAfter: Array.isArray(reloadedRun?.trades) ? reloadedRun.trades.length : 0,
                variants: Object.keys(reloadedRun?.tradesByVariant || {}),
            });
        } catch (error) {
            console.debug("[RunDetail] reload failure", { runId, error });
            const detail = error?.message ? ` (${error.message})` : "";
            setReloadError(`Could not reload full run data from sidecar. Make sure sidecar is running and output folder exists.${detail}`);
        } finally {
            setReloadBusy(false);
        }
    }, [reloadBusy, runData, runId]);
    React.useEffect(() => {
        if (!shouldAutoReloadRun || autoReloadAttempted.current.has(runId)) return;
        console.debug("[RunDetail] auto reload check", {
            runId,
            indexOnly: isIndexOnlyRun,
            reloadAvailable: Boolean(runData?.reloadAvailable),
            hasFullData: hasFullRunData,
            tradesBefore: Array.isArray(runData?.trades) ? runData.trades.length : 0,
        });
        autoReloadAttempted.current.add(runId);
        requestFullRunReload();
    }, [hasFullRunData, isIndexOnlyRun, requestFullRunReload, runData, runId, shouldAutoReloadRun]);
    const totalTradeRows = displayTrades?.length || 0;
    const validTradesForRun = React.useMemo(
        () => (Array.isArray(displayTrades) ? displayTrades.filter(isValidExecutedTrade) : []),
        [displayTrades],
    );
    const validTradeCount = validTradesForRun.length;
    const validNetR = validTradesForRun.reduce((sum, trade) => {
        const r = numericTradeR(trade);
        return r == null ? sum : sum + r;
    }, 0);
    const validWinsCount = validTradesForRun.filter((trade) => tradeResultSign(trade) > 0).length;
    const validLossesCount = validTradesForRun.filter((trade) => tradeResultSign(trade) < 0).length;
    const validWinRate = validWinsCount + validLossesCount > 0
        ? (validWinsCount / (validWinsCount + validLossesCount)) * 100
        : null;
    const expectancy = validTradeCount > 0 ? validNetR / validTradeCount : null;
    const grossWins = validTradesForRun.reduce((sum, trade) => {
        const r = numericTradeR(trade) ?? 0;
        return r > 0 ? sum + r : sum;
    }, 0);
    const grossLosses = validTradesForRun.reduce((sum, trade) => {
        const r = numericTradeR(trade) ?? 0;
        return r < 0 ? sum + Math.abs(r) : sum;
    }, 0);
    const pf = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? Infinity : null);
    const maxDd = validTradesForRun.length ? (() => {
        let cumR = 0;
        let peak = 0;
        let worst = 0;
        validTradesForRun.forEach((trade) => {
            cumR += numericTradeR(trade) ?? 0;
            if (cumR > peak) peak = cumR;
            const drawdown = cumR - peak;
            if (drawdown < worst) worst = drawdown;
        });
        return Math.abs(worst);
    })() : null;
    const accountSummary = React.useMemo(
        () => summarizeAccountEquity(validTradesForRun, accountSettings),
        [validTradesForRun, accountSettings],
    );
    const fundingChallenge = React.useMemo(
        () => simulateFundingChallenge(validTradesForRun, accountSettings, fundingSettings),
        [validTradesForRun, accountSettings, fundingSettings],
    );
    const accountCurrency = accountSettings.currency;
    const useFundingPhaseChart = fundingSettings.enabled && accountModeEnabled && fundingChartMode === "funding_phase";
    // Funded/live period metrics — derived from fundingChallenge.fundedPoints (the
    // already-sorted slice), NOT from validTradesForRun.slice(fundedStart.tradeIndex),
    // because fundedStart.tradeIndex is an index into the internally-sorted trade list
    // used by simulateFundingChallenge and may not match the unsorted validTradesForRun.
    const fundedTrades = React.useMemo(() => {
        if (!useFundingPhaseChart || fundingChallenge.status !== "funded") return [];
        return (fundingChallenge.fundedPoints || []).map((p) => p.trade).filter(Boolean);
    }, [useFundingPhaseChart, fundingChallenge]);
    const fundedStats = React.useMemo(() => {
        if (!fundedTrades.length) return null;
        const wins = fundedTrades.filter((t) => tradeResultSign(t) > 0).length;
        const losses = fundedTrades.filter((t) => tradeResultSign(t) < 0).length;
        const grossW = fundedTrades.reduce((sum, t) => {
            const r = numericTradeR(t) ?? 0;
            return r > 0 ? sum + r : sum;
        }, 0);
        const grossL = fundedTrades.reduce((sum, t) => {
            const r = numericTradeR(t) ?? 0;
            return r < 0 ? sum + Math.abs(r) : sum;
        }, 0);
        return {
            tradeCount: fundedTrades.length,
            wins,
            losses,
            winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
            pf: grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : null,
        };
    }, [fundedTrades]);
    const fundedSummary = React.useMemo(
        () => (fundedTrades.length ? summarizeAccountEquity(fundedTrades, accountSettings) : null),
        [fundedTrades, accountSettings],
    );
    const fundingPhase1Target = accountSettings.startingBalance * (1 + fundingSettings.phase1TargetPct / 100);
    const fundingPhase2Target = accountSettings.startingBalance * (1 + fundingSettings.phase2TargetPct / 100);
    const fundingLossFloor = accountSettings.startingBalance * (1 - fundingSettings.maxOverallLossPct / 100);
    const netMetricValue = accountModeEnabled
        ? formatAccountValue(accountSummary.netPnlAmount, accountCurrency)
        : `${validNetR >= 0 ? "+" : ""}${validNetR.toFixed(1)}R`;
    const netMetricSub = accountModeEnabled
        ? `${formatSignedR(validNetR, 1)} total R · ${validTradeCount} valid`
        : `${validTradeCount} valid trade${validTradeCount === 1 ? "" : "s"}`;
    const expectancyMetricValue = accountModeEnabled
        ? formatAccountValue(accountSummary.expectancyAmount, accountCurrency)
        : (expectancy != null ? `${expectancy.toFixed(3)}R` : "N/A");
    const expectancyMetricSub = accountModeEnabled
        ? `${expectancy != null ? formatSignedR(expectancy, 3) : "—"} / trade`
        : (expectancy != null ? "PER TRADE" : "Limited Data");
    const maxDdMetricValue = accountModeEnabled
        ? formatAccountValue(accountSummary.maxDrawdownAmount, accountCurrency)
        : (maxDd != null ? `${maxDd.toFixed(1)}R` : "N/A");
    const maxDdMetricSub = accountModeEnabled
        ? `${Math.abs(accountSummary.maxDrawdownPct || 0).toFixed(1)}% · ${maxDd != null ? `${maxDd.toFixed(1)}R` : "—"} drawdown`
        : (maxDd != null ? "Worst equity dip" : "Limited Data");
    const accountAuditLine = accountModeEnabled
        ? [
            `Total R ${formatSignedR(accountSummary.totalR ?? validNetR, 2)}`,
            accountSettings.mode === "current_equity_pct"
                ? `Final risk ${formatAccountValue(accountSummary.finalRiskAmount, accountCurrency)}`
                : null,
        ].filter(Boolean).join(" · ")
        : "";
    const tradeSubtext = totalTradeRows && totalTradeRows !== validTradeCount
        ? `${validTradeCount} valid · ${totalTradeRows} rows`
        : `${validTradeCount || Number(run.trades) || 0} valid trades`;

    // ── Scope chip data ──────────────────────────────────────────────────────
    // Surfaces the active trade universe, variant, Results Basis, and Account
    // View. The Universe row updates dynamically with the selected Result View
    // (displayTrades), so the user always knows exactly what trades are driving
    // the visible KPIs, equity curve, and ledger.
    const variantKeys = Object.keys(runData?.tradesByVariant || {});
    const entryScenarioKeys = Object.keys(runData?.entryResults?.tradesByMode || {})
        .filter((k) => k && k !== "baseline" && k !== "entry_baseline");
    const hasEntryScenarios = entryScenarioKeys.length > 0;
    const scopeChip = {
        variantLabel: selectedRunVariant ? variantLabel(selectedRunVariant) : null,
        variantCount: variantKeys.length,
        hasEntryScenarios,
        isIndexOnly: isIndexOnlyRun,
        // RB-8b.1: surface TWO distinct facts so the user can't conflate them:
        //   • the GLOBAL Results Basis (Settings · Results Basis lens), and
        //   • RunDetail's local ACCOUNT VIEW — an explicit account simulation
        //     (R remains the source of truth) that drives the $ metrics here.
        // RunDetail is the Current-Equity host: its Account View toggle, not the
        // global basis, governs whether this page renders R or account dollars.
        globalBasisLabel: lens.basisLabel,
        accountSimulation: accountModeEnabled,
        accountViewSub: accountModeEnabled
            ? `${accountModeOptions.find((o) => o.value === accountSettings.mode)?.label || accountSettings.mode} · ${accountSettings.currency}`
            : null,
    };
    const filteredLedgerRows = React.useMemo(() => {
        const rows = Array.isArray(displayTrades) ? displayTrades : [];
        const query = ledgerSearch.trim().toLowerCase();
        return rows.filter((trade) => {
            if (ledgerResultFilter !== "All" && !matchesLedgerResultFilter(trade, ledgerResultFilter, runRr)) return false;
            if (ledgerSessionFilter !== "All") {
                const session = displaySession(trade);
                if (ledgerSessionFilter === "Unassigned") {
                    if (session !== "—") return false;
                } else if (session !== ledgerSessionFilter) {
                    return false;
                }
            }
            if (ledgerDirectionFilter !== "All" && trade.direction !== ledgerDirectionFilter) return false;
            if (query) {
                const haystack = [
                    trade.displayTradeId,
                    trade.rawTradeId,
                    trade.id,
                    trade.displayObId,
                    trade.obId,
                    trade.outcome,
                    formatOutcome(trade),
                    displaySession(trade),
                    trade.direction,
                    trade.structure,
                ].join(" ").toLowerCase();
                if (!haystack.includes(query)) return false;
            }
            return true;
        });
    }, [displayTrades, ledgerResultFilter, ledgerSessionFilter, ledgerDirectionFilter, ledgerSearch, runRr]);

    // ── Equity research filters: filtered subset of trades for chart ─────────
    const filteredTradesForEquity = React.useMemo(() => {
        if (!validTradesForRun.length) return [];
        return validTradesForRun.filter((trade) => {
            // Session
            if (equitySessionFilter !== "All") {
                const sess = fillSessionForTrade(trade);
                const isUnassigned = !sess || sess === "Unknown";
                const match = equitySessionFilter === "Unassigned"
                    ? isUnassigned
                    : sess === equitySessionFilter;
                if (!match) return false;
            }
            // Direction
            if (equityDirectionFilter !== "All") {
                if (String(trade.direction || "").trim() !== equityDirectionFilter) return false;
            }
            // Structure
            if (equityStructureFilter !== "All") {
                if (String(trade.structure || "").trim() !== equityStructureFilter) return false;
            }
            // Exclude news-affected
            if (equityExcludeNews) {
                const newsAction = String(trade.news_action || "").trim();
                const outcome    = String(trade.outcome || "").toUpperCase();
                const missedRsn  = String(trade.missed_reason || "").toLowerCase();
                if (newsAction || trade.news_blackout || outcome.includes("NEWS") || missedRsn.includes("news")) return false;
            }
            // Exclude missed / session-filtered
            if (equityExcludeMissed) {
                const missedRsn = String(trade.missed_reason || "").trim();
                const outcome   = String(trade.outcome || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
                if (trade.missed_trade || missedRsn || outcome.includes("SESSION_FILTERED") || outcome.includes("NEWS_TOUCH_CANCEL")) return false;
            }
            return true;
        });
    }, [validTradesForRun, equitySessionFilter, equityDirectionFilter, equityStructureFilter, equityExcludeNews, equityExcludeMissed]);

    // ── Equity chart data: synthetic START at 0R + recomputed from filtered trades ──
    const equityChartData = React.useMemo(() => {
        if (useFundingPhaseChart) {
            // Funding phase chart always uses the full valid trade set so that
            // phase boundaries (pass indices, funded-start) are stable and match
            // the FundingPhaseCard figures.  Chart filters must not silently shift
            // which trade number constitutes "Phase 1 Pass" or "Funded Start".
            if (!validTradesForRun.length) return [];
            return buildFundingChallengeEquityCurve(validTradesForRun, accountSettings, fundingSettings);
        }
        if (!filteredTradesForEquity.length) return [];
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const accountCurve = accountModeEnabled
            ? buildAccountEquityCurve(filteredTradesForEquity, accountSettings)
            : [];
        // Synthetic anchor — the curve starts at 0R before the first trade
        const startPoint = {
            i:                      0,
            date:                   "",
            label:                  "",      // no x-label; first real trade's month is the first tick
            netR:                   accountModeEnabled ? accountSettings.startingBalance : 0,
            tradeR:                 0,
            outcome:                "",
            direction:              "",
            structure:              "",
            session:                "",
            displayTradeId:         "START",
            entryTime:              "",
            news_action:            "",
            news_flatten_r:         null,
            missed_reason:          "",
            protection_exit_reason: "",
            drawdown:               0,
            isAtHigh:               true,
            isStart:                true,
            equityAfter:            accountModeEnabled ? accountSettings.startingBalance : null,
            cumulativeR:            0,
        };
        let cumR = 0;
        let peak = accountModeEnabled ? accountSettings.startingBalance : 0;
        const chartRows = accountModeEnabled ? accountCurve : filteredTradesForEquity;
        const tradePoints = chartRows.map((row, idx) => {
            const trade = accountModeEnabled ? row.trade : row;
            const r = numericTradeR(trade) ?? 0;
            cumR += r;
            const accountPoint = accountModeEnabled ? row : null;
            const netR = accountModeEnabled
                ? Number(accountPoint?.equityAfter ?? accountPoint?.netR ?? accountSettings.startingBalance)
                : Number(cumR.toFixed(2));
            if (netR > peak) peak = netR;
            const drawdown = accountModeEnabled
                ? Number(accountPoint?.accountDrawdownAmount ?? (netR - peak))
                : Number((netR - peak).toFixed(2));
            let label = "";
            if (trade.entry) {
                const d = new Date(trade.entry);
                if (isFinite(d.getTime())) {
                    label = `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(-2)}`;
                }
            }
            return {
                i:                      idx + 1,  // 0 = START, trades start at 1
                date:                   trade.entry ? String(trade.entry).slice(0, 10) : "",
                label,
                netR,
                tradeR:                 r,
                outcome:                trade.outcome || "",
                direction:              trade.direction || "",
                structure:              trade.structure || "",
                session:                trade.fillSession || trade.session || "",
                displayTradeId:         trade.displayTradeId || trade.id || "",
                entryTime:              trade.entry || "",
                news_action:            trade.news_action || "",
                news_flatten_r:         trade.news_flatten_r ?? null,
                missed_reason:          trade.missed_reason || "",
                protection_exit_reason: trade.protection_exit_reason || "",
                drawdown,
                accountDrawdownPct:     accountModeEnabled
                    ? (accountPoint?.accountDrawdownPct ?? null)
                    : null,
                isAtHigh:               drawdown >= 0,
                equityAfter:            accountPoint?.equityAfter ?? null,
                pnlAmount:              accountPoint?.pnlAmount ?? null,
                riskAmount:             accountPoint?.riskAmount ?? null,
                cumulativeR:            Number(cumR.toFixed(2)),
            };
        });
        return [startPoint, ...tradePoints];
    }, [accountModeEnabled, accountSettings, filteredTradesForEquity, fundingSettings, useFundingPhaseChart, validTradesForRun]);

    // ── Per-run analytics — computed from this run's trades, not global store ──
    const MONTHLY = React.useMemo(() => {
        if (!displayTrades?.length) return [];
        const map = {};
        displayTrades.forEach((t) => {
            const date = t.entry ? new Date(t.entry) : null;
            if (!date || !isFinite(date.getTime())) return;
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            const key = `${year}-${String(month + 1).padStart(2, "0")}`;
            const m = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]} '${String(year).slice(-2)}`;
            if (!map[key]) map[key] = { key, m, v: 0 };
            map[key].v += numericTradeR(t) ?? 0;
        });
        return Object.values(map)
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((e) => ({ m: e.m, v: Number(e.v.toFixed(2)) }));
    }, [displayTrades]);

    // ── OB stats derived from imported order blocks ──
    const obStats = React.useMemo(() => {
        const obs    = runData?.orderBlocks || [];
        const trades = runData?.trades      || [];
        const cfg    = runData?.config      || {};

        // ── Direction counts ──────────────────────────────────────────────────
        const bullish = obs.filter((ob) => {
            const side = String(ob.side ?? ob.direction ?? ob.type ?? "").toLowerCase();
            return side === "bull" || side === "bullish" || side === "long";
        }).length;
        const bearish = obs.filter((ob) => {
            const side = String(ob.side ?? ob.direction ?? ob.type ?? "").toLowerCase();
            return side === "bear" || side === "bearish" || side === "short";
        }).length;

        // ── Avg OB width ──────────────────────────────────────────────────────
        const avgWidthPips = obs.length > 0
            ? (obs.reduce((s, ob) => {
                const top = Number(ob.top ?? ob.obTop ?? 0);
                const bot = Number(ob.bot ?? ob.bottom ?? ob.obBottom ?? 0);
                return s + Math.abs(top - bot);
            }, 0) / obs.length * 10000)
            : null;

        // ── Lifecycle classification (strict priority order) ───────────────────
        let sessionFilteredCount  = 0;
        let newsCancelledCount    = 0;
        let reverseCancelledCount = 0;
        let invalidatedCount      = 0;
        let filledCount           = 0;
        let unfilledCount         = 0;

        // Trade lookup for win/loss join
        const tradeById = {};
        trades.forEach((t) => { if (t.id) tradeById[t.id] = t; });

        let filledWins     = 0;
        let filledLosses   = 0;
        let filledBE       = 0;
        let filledUnlinked = 0;

        obs.forEach((ob) => {
            const scTime   = ob.sessionCancelTime       ?? ob.session_cancel_time        ?? null;
            const nbTime   = ob.newsBlackoutTriggerTime ?? ob.news_blackout_trigger_time ?? null;
            const rvTime   = ob.reverseTouchTime        ?? ob.reverse_touch_time         ?? null;
            const invTime  = ob.invalidationTime        ?? ob.invalidation_time          ?? null;
            const fillTime = ob.fillTime                ?? ob.fill_time                  ?? null;
            const ltId     = String(ob.linkedTradeId    ?? ob.linked_trade_id            ?? "");

            if (scTime !== null && scTime !== "") {
                sessionFilteredCount++;
            } else if (nbTime !== null && nbTime !== "") {
                newsCancelledCount++;
            } else if (rvTime !== null && rvTime !== "") {
                reverseCancelledCount++;
            } else if (invTime !== null && invTime !== "") {
                invalidatedCount++;
            } else if ((fillTime !== null && fillTime !== "") || ltId !== "") {
                filledCount++;
                const linkedTrade = ltId ? tradeById[ltId] : null;
                if (linkedTrade) {
                    const r    = numericTradeR(linkedTrade);
                    const norm = normalizeOutcome(linkedTrade?.outcome);
                    if (norm === "WIN"  || (r != null && r >  0.005)) filledWins++;
                    else if (norm === "LOSS" || (r != null && r < -0.005)) filledLosses++;
                    else filledBE++;
                } else {
                    filledUnlinked++;
                }
            } else {
                unfilledCount++;
            }
        });

        const total         = obs.length;
        const eligibleCount = Math.max(0, total - sessionFilteredCount - newsCancelledCount - reverseCancelledCount - invalidatedCount);

        // ── Directional trade stats (executed trades only) ────────────────────
        const execTrades  = trades.filter(isValidExecutedTrade);
        const longTrades  = execTrades.filter((t) => !String(t.direction || "").toLowerCase().startsWith("short"));
        const shortTrades = execTrades.filter((t) =>  String(t.direction || "").toLowerCase().startsWith("short"));
        const sumNetR     = (arr) => Number(arr.reduce((s, t) => s + (numericTradeR(t) || 0), 0).toFixed(2));

        const dirStats = {
            long: {
                obCount: bullish,
                trades:  longTrades.length,
                wins:    longTrades.filter((t) => tradeResultSign(t) > 0).length,
                losses:  longTrades.filter((t) => tradeResultSign(t) < 0).length,
                be:      longTrades.filter((t) => tradeResultSign(t) === 0).length,
                netR:    sumNetR(longTrades),
            },
            short: {
                obCount: bearish,
                trades:  shortTrades.length,
                wins:    shortTrades.filter((t) => tradeResultSign(t) > 0).length,
                losses:  shortTrades.filter((t) => tradeResultSign(t) < 0).length,
                be:      shortTrades.filter((t) => tradeResultSign(t) === 0).length,
                netR:    sumNetR(shortTrades),
            },
        };
        dirStats.long.convPct  = bullish > 0 ? (dirStats.long.trades  / bullish) * 100 : null;
        dirStats.short.convPct = bearish > 0 ? (dirStats.short.trades / bearish) * 100 : null;

        // ── Integrity signals ─────────────────────────────────────────────────
        const sessionFilterEnabled = cfg.session_filter_enabled === true || String(cfg.session_filter_enabled) === "true";
        const newsEnabled          = !!(run?.news_blackout_enabled ?? cfg.news_blackout_enabled);
        const configDir            = String(cfg.trade_direction || "both").toLowerCase().trim();
        const directionRestricted  = configDir !== "both" && configDir !== "" && configDir !== "—";
        const directionRespected   = directionRestricted && execTrades.length > 0
            ? execTrades.every((t) => {
                const td = String(t.direction || "").toLowerCase();
                if (configDir === "long")  return td === "long"  || td === "bull" || td === "bullish";
                if (configDir === "short") return td === "short" || td === "bear" || td === "bearish";
                return true;
            })
            : false;

        return {
            total,
            bullish,
            bearish,
            avgWidthPips,
            // Lifecycle funnel
            sessionFilteredCount,
            newsCancelledCount,
            reverseCancelledCount,
            invalidatedCount,
            filledCount,
            unfilledCount,
            eligibleCount,
            // Filled breakdown
            filledWins,
            filledLosses,
            filledBE,
            filledUnlinked,
            // Direction stats
            dirStats,
            // Integrity
            sessionFilterEnabled,
            newsEnabled,
            directionRestricted,
            directionRespected,
        };
    }, [runData, run]);

    // ── Outcome summary ──────────────────────────────────────────────────────
    const outcomeSummary = React.useMemo(() => {
        if (!displayTrades?.length) return null;
        let wins = 0, losses = 0, breakeven = 0, special = 0;
        let sumWin = 0, sumLoss = 0;
        let bestR = -Infinity, worstR = Infinity;
        let newsFlatten = 0, newsTouchCancel = 0, newsBlackout = 0;
        let sessionFiltered = 0, unfilled = 0, missed = 0;
        displayTrades.forEach((t) => {
            const norm = normalizeOutcome(t?.outcome);
            const r = numericTradeR(t);
            if (norm === "NEWS_FLATTEN") newsFlatten++;
            if (norm === "NEWS_TOUCH_CANCEL" || norm === "NEWS_CANCEL") { newsTouchCancel++; special++; return; }
            if (norm === "NEWS_BLACKOUT") { newsBlackout++; special++; return; }
            if (norm === "SESSION_FILTERED") { sessionFiltered++; special++; return; }
            if (norm === "UNFILLED") { unfilled++; special++; return; }
            const missedReason = String(t?.missed_reason || t?.missedReason || "").trim();
            if (t?.missed_trade || t?.missedTrade || missedReason || norm === "MISSED") { missed++; special++; return; }
            if (!isValidExecutedTrade(t) || r == null) { special++; return; }
            if (r > 0.005) { wins++; sumWin += r; if (r > bestR) bestR = r; return; }
            if (r < -0.005) { losses++; sumLoss += r; if (r < worstR) worstR = r; return; }
            breakeven++;
        });
        const total    = wins + losses + breakeven + special;
        const winDenom = wins + losses;
        const winRate  = winDenom > 0 ? (wins / winDenom) * 100 : null;
        const avgWin   = wins   > 0  ? sumWin  / wins   : null;
        const avgLoss  = losses > 0  ? sumLoss / losses : null;
        const payoffRatio = avgWin != null && avgLoss != null && avgLoss !== 0
            ? Math.abs(avgWin / avgLoss)
            : null;
        return {
            wins, losses, breakeven, special, total,
            winRate, avgWin, avgLoss, payoffRatio,
            bestR:  bestR  === -Infinity ? null : bestR,
            worstR: worstR ===  Infinity ? null : worstR,
            newsFlatten, newsTouchCancel, newsBlackout, sessionFiltered, unfilled, missed,
        };
    }, [displayTrades]);

    // ── Semantic R distribution ──────────────────────────────────────────────
    const R_DIST_V2 = React.useMemo(() => {
        if (!displayTrades?.length) return [];
        const winTarget = Number.isFinite(Number(runRr)) ? Number(runRr) : 3.3;
        const winMidStart = Math.max(2, Math.floor(winTarget - 1));
        const BUCKETS = [
            { label: "≤ −1R",     test: (r) => r <= -0.95, color: "hsl(var(--bear))" },
            { label: "-1R → 0R",  test: (r) => r > -0.95 && r < -0.005, color: "hsl(var(--bear)/0.55)" },
            { label: "0R",        test: (r) => Math.abs(r) <= 0.005, color: "hsl(var(--muted))" },
            { label: "0R → +1R",  test: (r) => r > 0.005 && r < 1, color: "hsl(var(--accent-primary)/0.55)" },
            { label: "+1R → +2R", test: (r) => r >= 1 && r < 2, color: "hsl(var(--accent-primary)/0.75)" },
            { label: `+${winMidStart}R → +${formatBucketR(winTarget)}R`, test: (r) => r >= winMidStart && r < winTarget - 0.05, color: "hsl(var(--accent-primary))" },
            { label: `> +${formatBucketR(winTarget)}R`, test: (r) => r >= winTarget - 0.05, color: "hsl(var(--success))" },
        ];
        const counts = BUCKETS.map(() => 0);
        let valid = 0;
        displayTrades.filter(isValidExecutedTrade).forEach((t) => {
            const r = numericTradeR(t);
            if (r == null) return;
            valid++;
            for (let i = 0; i < BUCKETS.length; i++) {
                if (BUCKETS[i].test(r)) { counts[i]++; break; }
            }
        });
        const maxCount = Math.max(...counts, 1);
        return BUCKETS.map((b, i) => ({
            label: b.label,
            count: counts[i],
            pct:   valid > 0 ? (counts[i] / valid) * 100 : 0,
            bar:   counts[i] / maxCount,
            color: b.color,
        }));
    }, [displayTrades, runRr]);

    const directionalOutcomeStats = React.useMemo(() => {
        const stats = {
            Long: { side: "LONG", trades: 0, wins: 0, losses: 0, partial: 0, netR: 0 },
            Short: { side: "SHORT", trades: 0, wins: 0, losses: 0, partial: 0, netR: 0 },
        };
        validTradesForRun.forEach((trade) => {
            const side = String(trade.direction || "").toLowerCase().startsWith("short") ? "Short" : "Long";
            const r = numericTradeR(trade);
            if (r == null) return;
            const bucket = stats[side];
            bucket.trades++;
            bucket.netR += r;
            if (r > 0.005) bucket.wins++;
            else if (r < -0.005) bucket.losses++;
            if ((r > 0.005 && r < runRr - 0.05) || (r < -0.005 && r > -0.95)) bucket.partial++;
        });
        return Object.values(stats).map((stat) => ({
            ...stat,
            netR: Number(stat.netR.toFixed(2)),
            winRate: stat.wins + stat.losses > 0 ? (stat.wins / (stat.wins + stat.losses)) * 100 : null,
            avgR: stat.trades > 0 ? stat.netR / stat.trades : null,
        }));
    }, [validTradesForRun, runRr]);

    // ── Auto insights ────────────────────────────────────────────────────────
    const autoInsights = React.useMemo(() => {
        if (!outcomeSummary || !R_DIST_V2.length) return [];
        const insights = [];
        const { wins, losses, newsFlatten, newsBlackout, sessionFiltered, missed,
                avgWin, avgLoss, payoffRatio, bestR } = outcomeSummary;
        // Full-stop loss concentration
        const fullStop = R_DIST_V2.find((b) => b.label === "≤ −1R");
        if (fullStop && losses > 0) {
            const pct = Math.round((fullStop.count / losses) * 100);
            if (pct >= 75) insights.push(`${pct}% of losses are full −1R stop-outs`);
        }
        // Top win bucket
        const gt3 = R_DIST_V2[R_DIST_V2.length - 1];
        if (gt3 && wins > 0 && gt3.count > 0) {
            const pct = Math.round((gt3.count / wins) * 100);
            if (pct >= 40) insights.push(`${pct}% of wins exceed +3R`);
            else if (bestR != null && bestR > 3) insights.push(`Best trade reached +${bestR.toFixed(1)}R`);
        }
        // Payoff ratio
        if (payoffRatio != null && payoffRatio >= 2.5 && insights.length < 2) {
            insights.push(`Payoff ratio ${payoffRatio.toFixed(1)}× — wins dwarf losses`);
        }
        // News flatten
        if (newsFlatten > 0 && insights.length < 2) {
            insights.push(`News flatten early-exited ${newsFlatten} trade${newsFlatten > 1 ? "s" : ""}`);
        }
        // Session filter
        if (sessionFiltered > 0 && insights.length < 2) {
            insights.push(`Session filter removed ${sessionFiltered} setup${sessionFiltered > 1 ? "s" : ""}`);
        }
        // News blackout
        if (newsBlackout > 0 && insights.length < 2) {
            insights.push(`${newsBlackout} trade${newsBlackout > 1 ? "s" : ""} blocked by news blackout`);
        }
        // Missed
        if (missed > 0 && insights.length < 2) {
            insights.push(`${missed} missed trade${missed > 1 ? "s" : ""} not reflected in equity`);
        }
        const longStats = directionalOutcomeStats.find((stat) => stat.side === "LONG");
        const shortStats = directionalOutcomeStats.find((stat) => stat.side === "SHORT");
        if (longStats && shortStats && insights.length < 3) {
            const totalNet = longStats.netR + shortStats.netR;
            if (shortStats.trades > 0 && longStats.trades === 0) {
                insights.push("No long trades executed");
            } else if (longStats.trades > 0 && shortStats.trades === 0) {
                insights.push("No short trades executed");
            } else if (Math.abs(totalNet) > 0.5) {
                const leader = shortStats.netR >= longStats.netR ? shortStats : longStats;
                const share = Math.round((leader.netR / totalNet) * 100);
                if (share > 60) insights.push(`${leader.side === "SHORT" ? "Shorts" : "Longs"} produced ${share}% of net R`);
            } else if (longStats.avgR != null && shortStats.avgR != null && Math.abs(longStats.avgR - shortStats.avgR) >= 0.5) {
                const gap = Math.abs(longStats.avgR - shortStats.avgR);
                insights.push(`${longStats.avgR < shortStats.avgR ? "Longs" : "Shorts"} underperformed by ${gap.toFixed(1)}R avg`);
            }
        }
        return insights.slice(0, 3);
    }, [outcomeSummary, R_DIST_V2, directionalOutcomeStats]);

    const resultsTabs = React.useMemo(() => ([
        { id: "config", label: "Config" },
        { id: "trades", label: "Trades" },
        { id: "ob-stats", label: "OB Stats" },
        { id: "outcomes", label: "Outcomes" },
        { id: "monthly", label: "Monthly" },
        { id: "baseline-splits", label: "Baseline Splits" },
        { id: "entry-timing", label: "Entry Timing" },
        { id: "research",    label: "Research" },
    ]), []);
    const currentResultsTab = resultsTabs.some((tab) => tab.id === activeResultsTab)
        ? activeResultsTab
        : resultsTabs[0].id;
    const showResultsSection = (tabId) => resultsLayoutMode === "stacked" || currentResultsTab === tabId;

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Run Workspace"
                title={displayName}
                runLine={`Run: ${displayName} · ${totalTradeRows || Number(run.trades) || 0} trades`}
                configLine={[
                    structureFilter ? `Structure ${formatStructureFilterValue(structureFilter)}` : null,
                    entryDepthPct != null ? `Entry Depth ${formatPercentValue(entryDepthPct)}` : null,
                    entryBufferPips != null ? `Entry Buffer ${formatPipValue(entryBufferPips)}` : null,
                    stopBufferPips != null ? `Stop Buffer ${formatPipValue(stopBufferPips)}` : null,
                    verifyLimitTicks != null ? `Verify ${formatTickValue(verifyLimitTicks)}` : null,
                ].filter(Boolean).join(" · ")}
                dateRangeLine={runDateRangeLine}
                actions={(
                    <>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-lab">Run</span>
                            <NeonSelect
                                value={run?.id || runId || ""}
                                onChange={(value) => {
                                    if (value && value !== runId) navigate(`/runs/${encodeURIComponent(value)}`);
                                }}
                                options={runSwitcherOptions}
                            />
                        </div>
                        <Link to={projectId ? `/projects/${encodeURIComponent(projectId)}` : "/projects"}>
                            <NeonButton icon={FolderKanban} tone="ghost">Open Project</NeonButton>
                        </Link>
                        <Link to="/strategy-map"><NeonButton icon={MapIcon} tone="primary">Open Strategy Map</NeonButton></Link>
                        <Link to="/comparison"><NeonButton icon={GitCompareArrows} tone="ghost">Compare Run</NeonButton></Link>
                        <div className="relative">
                            <NeonButton
                                icon={Edit3}
                                tone="ghost"
                                onClick={() => setRunDetailSettingsOpen((value) => !value)}
                            >
                                Settings
                            </NeonButton>
                            {runDetailSettingsOpen && (
                                <div className="absolute right-0 top-full z-40 mt-2 w-[280px] border border-[hsl(var(--border-soft)/0.9)] bg-[hsl(var(--panel)/0.98)] shadow-[0_18px_60px_hsl(var(--bg)/0.45)] clip-bevel-sm p-3">
                                    <div className="text-[10px] font-ui uppercase tracking-widest text-muted-lab">Run Detail Layout</div>
                                    <div className="mt-3 flex flex-col gap-2">
                                        <FilterToggle
                                            active={resultsLayoutMode === "tabbed"}
                                            inactiveBorder="mid"
                                            onClick={() => setResultsLayoutMode("tabbed")}
                                        >
                                            Tabbed view
                                        </FilterToggle>
                                        <FilterToggle
                                            active={resultsLayoutMode === "stacked"}
                                            inactiveBorder="mid"
                                            onClick={() => setResultsLayoutMode("stacked")}
                                        >
                                            Stacked view
                                        </FilterToggle>
                                    </div>
                                    <div className="mt-3 text-[10.5px] leading-relaxed text-muted-lab">
                                        Tabbed view keeps results below the equity curve in one full-width host. Stacked view restores the original long page.
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            />

            {/* RW-13: Entry Model Card — controls left, current view right */}
            <div className="px-6 mb-2">
                {scopeChip.isIndexOnly ? (
                    <div className="flex items-center gap-1.5 px-1 py-0.5">
                        <ScopeRow label="Status"><Pill tone="warning">Index-only metadata</Pill></ScopeRow>
                    </div>
                ) : (
                    <>
                        {(() => {
                            // ── Derived selection state ───────────────────────────────────────
                            const selModel     = (!resultView?.family || resultView.family === "baseline") ? "baseline" : resultView.family;
                            const selThreshold = resultView?.threshold ?? null;
                            const selFillMode  = resultView?.fillMode  ?? null;

                            const availFamilies = new Set(resultViewOptions.map((o) => o.family));

                            const ALL_HINT_THRESHOLDS = [10, 25, 50, 75];
                            const modelThresholds = [...new Set([
                                ...resultViewOptions
                                    .filter((o) => o.family === selModel)
                                    .map((o) => o.threshold)
                                    .filter((t) => t != null),
                                ...ALL_HINT_THRESHOLDS,
                            ])].sort((a, b) => a - b);
                            const availModelThresholds = new Set(
                                resultViewOptions
                                    .filter((o) => o.family === selModel)
                                    .map((o) => o.threshold),
                            );

                            const availFillModes = new Set(
                                resultViewOptions
                                    .filter((o) => o.family === selModel && o.threshold === selThreshold)
                                    .map((o) => o.fillMode),
                            );

                            const pickFillMode = (family, threshold, preferFm) => {
                                const opts = resultViewOptions
                                    .filter((o) => o.family === family && o.threshold === threshold)
                                    .map((o) => o.fillMode);
                                if (opts.includes(preferFm)) return preferFm;
                                if (opts.includes(null))    return null;
                                if (opts.includes("same"))  return "same";
                                if (opts.includes("next"))  return "next";
                                return null;
                            };
                            const pickThreshold = (family, preferThresh) => {
                                const opts = resultViewOptions
                                    .filter((o) => o.family === family)
                                    .map((o) => o.threshold)
                                    .filter((t) => t != null)
                                    .sort((a, b) => a - b);
                                if (opts.includes(preferThresh)) return preferThresh;
                                return opts[0] ?? null;
                            };

                            const ENTRY_MODELS = [
                                { key: "baseline",       label: "Baseline" },
                                { key: "penetration",    label: "Penetration" },
                                { key: "triggered_edge", label: "Triggered Edge" },
                            ];
                            const FILL_MODE_SLOTS = [
                                { fillMode: null,   label: "Both" },
                                { fillMode: "same", label: "Same candle" },
                                { fillMode: "next", label: "Next candle" },
                                { fillMode: "d2",   label: "Delay +2" },
                                { fillMode: "d3",   label: "Delay +3" },
                            ];

                            const showThresholdRow = selModel !== "baseline";
                            const showFillModeRow  = selModel === "triggered_edge" && selThreshold != null; // RW-11A: penetration has no fill mode

                            const btnActive = "bg-[hsl(var(--accent-primary)/0.15)] border-[hsl(var(--accent-primary)/0.55)] text-[hsl(var(--accent-primary))]";
                            const btnIdle   = "bg-transparent border-[hsl(var(--border-soft))] text-[hsl(var(--text-muted))] hover:border-[hsl(var(--accent-primary)/0.4)] hover:text-[hsl(var(--text-base))]";
                            const btnDim    = "border-[hsl(var(--border-soft)/0.3)] text-[hsl(var(--text-muted)/0.35)] cursor-default";
                            const btnBase   = "px-2.5 py-[3px] text-[11px] font-ui tracking-[0.02em] border clip-bevel-sm transition-colors select-none whitespace-nowrap";
                            const btnSm     = "px-2 py-[2px] text-[11px] font-ui tracking-[0.02em] border clip-bevel-sm transition-colors select-none whitespace-nowrap";

                            // ── Summary vars ─────────────────────────────────────────────────
                            const identityLabel = !isScenarioView
                                ? (activeResultViewOption?.label || "Baseline Reference")
                                : (activeResultViewOption?.label || universe?.label || String(resultView?.family || ""));
                            const modelChipLabel = !isScenarioView ? "Baseline"
                                : resultView?.family === "directional" ? "Directional"
                                : resultView?.family === "penetration" ? "Penetration"
                                : resultView?.family === "triggered_edge" ? "Triggered Edge"
                                : String(resultView?.family || "").replace(/_/g, " ").replace(/\w/g, (c) => c.toUpperCase());
                            const modeChipLabel = !isScenarioView ? "Standard edge"
                                : resultView?.fillMode === "same" ? "Same candle"
                                : resultView?.fillMode === "next" ? "Next candle"
                                : resultView?.fillMode === "d2"   ? "Delay +2"
                                : resultView?.fillMode === "d3"   ? "Delay +3"
                                : "Both";
                            const analyticsChipLabel = !isScenarioView ? "Baseline trades"
                                : isDirectionalView ? (hasSelectedUniverseTrades ? "Backend · Split-pass" : "Baseline fallback")
                                : hasSelectedUniverseTrades ? "Scenario trades"
                                : "Baseline fallback";
                            const isUnavailable = isScenarioView && !hasSelectedUniverseTrades;

                            // ── RW-13: prominent current view string ──────────────────────────
                            const currentViewDisplay = (() => {
                                if (!isScenarioView) return "Baseline Reference";
                                const fam = resultView?.family;
                                const thr = resultView?.threshold;
                                if (fam === "directional") {
                                    const sk = resultView?.directionalStorageKey || "";
                                    const scenarioId = sk.replace(/^[^_]+__/, "");
                                    return formatDirectionalScenarioLabel(scenarioId) || identityLabel;
                                }
                                if (fam === "penetration") return thr != null ? `Penetration ${thr}%` : "Penetration";
                                if (fam === "triggered_edge") {
                                    const base = thr != null ? `Triggered Edge ${thr}%` : "Triggered Edge";
                                    const mode = selFillMode === "same" ? " · Same Candle"
                                               : selFillMode === "next" ? " · Next Candle"
                                               : selFillMode === "d2"   ? " · Delay +2"
                                               : selFillMode === "d3"   ? " · Delay +3"
                                               : " · Both";
                                    return base + mode;
                                }
                                return identityLabel;
                            })();

                            return (
                                <div className={[
                                    "clip-bevel-sm border mb-2",
                                    isScenarioView
                                        ? hasSelectedUniverseTrades
                                            ? "border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.05)]"
                                            : "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.05)]"
                                        : "border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.2)]",
                                ].join(" ")}>
                                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] divide-y xl:divide-y-0 xl:divide-x divide-[hsl(var(--border-soft)/0.3)]">

                                        {/* Left col: Entry Model controls + scope row */}
                                        <div className="px-4 py-3">
                                            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                                                Entry Model
                                            </div>
                                            {/* Row A — Model selector */}
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                {ENTRY_MODELS.map(({ key, label }) => {
                                                    const isAvail  = availFamilies.has(key);
                                                    const isActive = selModel === key;
                                                    return isAvail ? (
                                                        <button
                                                            key={key}
                                                            type="button"
                                                            onClick={() => {
                                                                if (key === "baseline") {
                                                                    setResultView({ family: "baseline", threshold: null, fillMode: null });
                                                                } else {
                                                                    const t  = pickThreshold(key, selThreshold);
                                                                    const fm = pickFillMode(key, t, selFillMode);
                                                                    setResultView({ family: key, threshold: t, fillMode: fm });
                                                                }
                                                            }}
                                                            className={[btnBase, isActive ? btnActive : btnIdle].join(" ")}
                                                        >
                                                            {label}
                                                        </button>
                                                    ) : (
                                                        <span
                                                            key={key}
                                                            className={[btnBase, btnDim].join(" ")}
                                                            title="No data for this entry model in this run."
                                                        >
                                                            {label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                            {/* Row B — Threshold (only for non-baseline models) */}
                                            {showThresholdRow && (
                                                <div className="flex flex-wrap items-center gap-2 mb-2 pl-3 border-l border-[hsl(var(--border-soft)/0.3)]">
                                                    <span className="text-[9.5px] font-ui uppercase tracking-[0.07em] text-[hsl(var(--text-2)/0.65)] shrink-0 mr-0.5">Threshold</span>
                                                    {modelThresholds.map((t) => {
                                                        const isAvail  = availModelThresholds.has(t);
                                                        const isActive = selThreshold === t;
                                                        return isAvail ? (
                                                            <button
                                                                key={t}
                                                                type="button"
                                                                onClick={() => {
                                                                    const fm = pickFillMode(selModel, t, selFillMode);
                                                                    setResultView({ family: selModel, threshold: t, fillMode: fm });
                                                                }}
                                                                className={[btnSm, isActive ? btnActive : btnIdle].join(" ")}
                                                            >
                                                                {t}%
                                                            </button>
                                                        ) : (
                                                            <span
                                                                key={t}
                                                                className={[btnSm, btnDim].join(" ")}
                                                                title="No data for this threshold in this run."
                                                            >
                                                                {t}%
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {/* Row C — Fill Mode (only once model + threshold selected) */}
                                            {showFillModeRow && (
                                                <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-[hsl(var(--border-soft)/0.3)]">
                                                    <span className="text-[9.5px] font-ui uppercase tracking-[0.07em] text-[hsl(var(--text-2)/0.65)] shrink-0 mr-0.5">Fill Mode</span>
                                                    {FILL_MODE_SLOTS.map(({ fillMode: fm, label }) => {
                                                        const isAvail  = availFillModes.has(fm);
                                                        const isActive = selFillMode === fm;
                                                        return isAvail ? (
                                                            <button
                                                                key={label}
                                                                type="button"
                                                                onClick={() => setResultView({
                                                                    family: selModel,
                                                                    threshold: selThreshold,
                                                                    fillMode: fm,
                                                                })}
                                                                className={[btnSm, isActive ? btnActive : btnIdle].join(" ")}
                                                            >
                                                                {label}
                                                            </button>
                                                        ) : (
                                                            <span
                                                                key={label}
                                                                className={[btnSm, btnDim].join(" ")}
                                                                title="No data for this fill mode in this run."
                                                            >
                                                                {label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {/* RW-4A: Directional Backend Scenarios */}
                                            {(() => {
                                                const dirOpts = resultViewOptions.filter((o) => o.family === "directional");
                                                if (!dirOpts.length) return null;
                                                return (
                                                    <div className="mt-2 pt-2 border-t border-[hsl(var(--border-soft)/0.2)]">
                                                        <span className="text-[9.5px] font-ui uppercase tracking-[0.07em] text-[hsl(var(--text-2)/0.65)] block mb-1.5">Directional Scenarios</span>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {dirOpts.map((opt) => {
                                                                const isActive = isDirectionalView && directionalStorageKey === opt.directionalStorageKey;
                                                                return (
                                                                    <button
                                                                        key={opt.key}
                                                                        type="button"
                                                                        onClick={() => setResultView({
                                                                            family: "directional",
                                                                            directionalStorageKey: opt.directionalStorageKey,
                                                                            threshold: null,
                                                                            fillMode: null,
                                                                        })}
                                                                        className={[btnBase, isActive ? btnActive : btnIdle].join(" ")}
                                                                        title={opt.executionMode ? `Execution: ${opt.executionMode.replace(/_/g, " ")}` : undefined}
                                                                    >
                                                                        {opt.label}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {/* Scope chips */}
                                            <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                                                <ScopeRow label="Variant">
                                                    <Pill tone="muted">{scopeChip.variantLabel || "Primary"}</Pill>
                                                </ScopeRow>
                                                <ScopeRow label="Basis">
                                                    <Pill tone="muted">{scopeChip.globalBasisLabel}</Pill>
                                                </ScopeRow>
                                                <ScopeRow label="Account">
                                                    <Pill tone={scopeChip.accountSimulation ? "secondary" : "muted"}>
                                                        {scopeChip.accountSimulation ? "Sim" : "R"}
                                                    </Pill>
                                                    {scopeChip.accountViewSub && (
                                                        <span className="text-[9.5px] text-muted-lab opacity-70">{scopeChip.accountViewSub}</span>
                                                    )}
                                                </ScopeRow>
                                                {/* Dev parity audit — baseline path only, hidden in production */}
                                                {process.env.NODE_ENV !== "production" && !isScenarioView && baselineParityAudit && (
                                                    <span className={[
                                                        "text-[9.5px] font-ui ml-2",
                                                        baselineParityAudit.match
                                                            ? "text-[hsl(var(--text-muted))] opacity-60"
                                                            : "text-[hsl(var(--warning))]",
                                                    ].join(" ")}>
                                                        Parity: {baselineParityAudit.match ? "✓" : "⚠"}
                                                        {" "}legacy {baselineParityAudit.legacyCount} / universe {baselineParityAudit.universeCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right col: Current Result View — dominant element */}
                                        <div className="px-3 py-2">
                                            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-1">
                                                Current Result View
                                            </div>
                                            {/* Dominant view label */}
                                            <div className={[
                                                "font-ui font-bold leading-tight mb-2",
                                                isUnavailable
                                                    ? "text-[hsl(var(--warning))] text-[20px]"
                                                    : isScenarioView
                                                        ? "text-[hsl(var(--accent-primary))] text-[20px]"
                                                        : "text-white text-[20px]",
                                            ].join(" ")}>
                                                {currentViewDisplay}
                                            </div>
                                            {/* Inline stats row */}
                                            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1.5">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.55)]">Trades</span>
                                                    <span className="text-[13px] font-num tabular-nums font-semibold text-[hsl(var(--text-2))]">
                                                        {isScenarioView && hasSelectedUniverseTrades
                                                            ? selectedUniverseTrades.length
                                                            : Array.isArray(legacyTradesForRun) ? legacyTradesForRun.length : 0}
                                                    </span>
                                                </div>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.55)]">Analytics</span>
                                                    <span className={[
                                                        "text-[12px] font-semibold",
                                                        !isScenarioView
                                                            ? "text-[hsl(var(--text-2))]"
                                                            : hasSelectedUniverseTrades
                                                                ? "text-[hsl(var(--accent-secondary))]"
                                                                : "text-[hsl(var(--warning))]",
                                                    ].join(" ")}>{analyticsChipLabel}</span>
                                                </div>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.55)]">Status</span>
                                                    <span className={[
                                                        "text-[12px] font-semibold",
                                                        isUnavailable ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]",
                                                    ].join(" ")}>
                                                        {isUnavailable ? "Unavailable" : "Available"}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Scenario baseline count / directional source info */}
                                            {isScenarioView && hasSelectedUniverseTrades && (
                                                <div className="text-[10px] text-[hsl(var(--text-2)/0.55)]">
                                                    {isDirectionalView ? (
                                                        <>
                                                            <span className="text-[hsl(var(--text-2))]">Backend · Split-pass</span>
                                                            {activeResultViewOption?.executionMode && (
                                                                <span className="ml-1.5 opacity-55">· {activeResultViewOption.executionMode.replace(/_/g, " ")}</span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            Baseline: <span className="tabular-nums text-[hsl(var(--text-2))]">{Array.isArray(legacyTradesForRun) ? legacyTradesForRun.length : 0}</span>
                                                            {activeResultViewOption?.fromCombinedPool && (
                                                                <span className="ml-1.5 opacity-55">split from combined pool</span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            {/* Warnings (entry model scenarios only; directional bypasses universe) */}
                                            {isScenarioView && !isDirectionalView && (() => {
                                                const warnings = (universe?.warnings || []).filter(
                                                    (w) => w?.code === "FILL_MODE_COERCED" || w?.code === "BOTH_UNAVAILABLE_NO_COMBINED",
                                                );
                                                return warnings.length > 0 ? (
                                                    <div className="mt-1.5 flex flex-col gap-1">
                                                        {warnings.map((w) => (
                                                            <span
                                                                key={w.code}
                                                                className={[
                                                                    "px-1.5 py-0.5 text-[9.5px] border clip-bevel-sm",
                                                                    w.code === "FILL_MODE_COERCED"
                                                                        ? "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))]"
                                                                        : "border-[hsl(var(--warning)/0.45)] text-[hsl(var(--warning))]",
                                                                ].join(" ")}
                                                                title={w.code}
                                                            >
                                                                {w.message}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>

                                    </div>
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>

            {isIndexOnlyRun && (
                <div className="px-6 mb-4">
                    <div className="flex items-start justify-between gap-3 border border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm px-3 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--accent-secondary))]" />
                        <div className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-[hsl(var(--text-2))]">
                            <span className="text-[hsl(var(--text))] font-medium">Metadata-only run.</span>{" "}
                            {reloadBusy
                                ? "Reloading full run data from sidecar..."
                                : runData?.reloadAvailable
                                    ? "Full data is kept out of localStorage and auto-loads from the sidecar/output folder when opened."
                                    : "Full trade data is not in memory after refresh. Reload full run data from the sidecar/output folder for detailed analytics."}
                            {reloadError && (
                                <span className="block mt-1 text-[hsl(var(--warning))]">{reloadError}</span>
                            )}
                        </div>
                        {runData?.reloadAvailable && (
                            <NeonButton tone="secondary" onClick={requestFullRunReload} disabled={reloadBusy}>
                                {reloadBusy ? "Reloading..." : "Reload Full Data"}
                            </NeonButton>
                        )}
                    </div>
                </div>
            )}

            {/* RW-13: Account View + Funding Challenge — merged side-by-side card */}
            <div className="px-6 mb-4">
                <div className="clip-bevel-sm border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.15)]">
                    {/* Collapse header */}
                    <button
                        onClick={() => setAccountFundingCollapsed((v) => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[hsl(var(--panel-2)/0.3)] transition-colors"
                    >
                        <ChevronDown className={[
                            "w-3 h-3 text-[hsl(var(--text-2)/0.5)] transition-transform duration-200 shrink-0",
                            accountFundingCollapsed ? "-rotate-90" : "",
                        ].join(" ")} />
                        <span className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))]">
                            Account &amp; Funding
                        </span>
                        {accountFundingCollapsed && (
                            <span className="text-[9.5px] font-ui text-[hsl(var(--text-2)/0.5)] truncate">
                                {accountModeEnabled
                                    ? `${accountAuditLine || "Account mode"}${fundingSettings.enabled ? " · Funding On" : ""}`
                                    : `R only${fundingSettings.enabled ? " · Funding On" : ""}`}
                            </span>
                        )}
                    </button>
                    {!accountFundingCollapsed && (
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] divide-y xl:divide-y-0 xl:divide-x divide-[hsl(var(--border-soft)/0.3)] border-t border-[hsl(var(--border-soft)/0.3)]">

                        {/* Left col: Account View */}
                        <div className="px-3 py-2.5">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))]">Account View</span>
                                {accountModeEnabled && accountAuditLine && (
                                    <span className="text-[10px] text-[hsl(var(--text-2)/0.55)] truncate hidden sm:inline">{accountAuditLine}</span>
                                )}
                            </div>
                            <div className="space-y-2">
                                {/* Row 1: Unit + Account Mode */}
                                <div className="flex flex-wrap items-end gap-2">
                                    <label className="min-w-[118px]">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Unit</span>
                                        <NeonSelect
                                            value={accountModeEnabled ? "account" : "r_only"}
                                            onChange={(value) => {
                                                patchAccountSettings({
                                                    mode: value === "account"
                                                        ? (accountSettings.mode === "r_only" ? "current_equity_pct" : accountSettings.mode)
                                                        : "r_only",
                                                });
                                            }}
                                            options={[
                                                { value: "r_only", label: "R" },
                                                { value: "account", label: "Account" },
                                            ]}
                                        />
                                    </label>
                                    {accountModeEnabled && (
                                        <label className="min-w-[190px]">
                                            <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Account Mode</span>
                                            <NeonSelect
                                                value={accountSettings.mode}
                                                onChange={(value) => {
                                                    // When switching to fixed-dollar mode, default risk amount
                                                    // to 10% of the starting balance as a sensible starting point.
                                                    const patch = { mode: value };
                                                    if (value === "fixed_dollar") {
                                                        patch.fixedRiskAmount = Math.round(accountSettings.startingBalance * 0.1);
                                                    }
                                                    patchAccountSettings(patch);
                                                }}
                                                options={accountModeOptions}
                                            />
                                        </label>
                                    )}
                                    {!accountModeEnabled && (
                                        <span className="text-[10.5px] text-[hsl(var(--text-2)/0.5)] italic">R only · select Account to enable simulation</span>
                                    )}
                                </div>
                                {/* Row 2: Currency + Starting Balance + Risk (account mode only) */}
                                {accountModeEnabled && (
                                    <div className="flex flex-wrap items-end gap-2">
                                        <label className="w-[92px]">
                                            <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Currency</span>
                                            <NeonInput
                                                value={accountSettings.currency}
                                                onChange={(event) => patchAccountSettings({ currency: event.target.value })}
                                            />
                                        </label>
                                        <label className="w-[140px]">
                                            <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Starting Balance</span>
                                            <NeonInput
                                                type="number"
                                                value={accountSettings.startingBalance}
                                                onChange={(event) => patchAccountSettings({ startingBalance: event.target.value })}
                                            />
                                        </label>
                                        {accountSettings.mode === "fixed_dollar" ? (
                                            <label className="w-[130px]">
                                                <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Risk Amount</span>
                                                <NeonInput
                                                    type="number"
                                                    value={accountSettings.fixedRiskAmount}
                                                    onChange={(event) => patchAccountSettings({ fixedRiskAmount: event.target.value })}
                                                />
                                            </label>
                                        ) : (
                                            <label className="w-[100px]">
                                                <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Risk %</span>
                                                <NeonInput
                                                    type="number"
                                                    value={accountSettings.riskPct}
                                                    onChange={(event) => patchAccountSettings({ riskPct: event.target.value })}
                                                />
                                            </label>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right col: Funding Challenge */}
                        <div className="px-3 py-2.5">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))]">Funding Challenge</span>
                                <Pill tone={fundingSettings.enabled ? "primary" : "muted"}>{fundingSettings.enabled ? "FTMO 2-Step" : "Off"}</Pill>
                                <FilterToggle
                                    active={fundingSettings.enabled}
                                    onClick={() => patchFundingSettings({ enabled: !fundingSettings.enabled })}
                                >
                                    {fundingSettings.enabled ? "Overlay On" : "Overlay Off"}
                                </FilterToggle>
                            </div>
                            {/* Controls — 5-col responsive grid when overlay is on, preset-only when off */}
                            {fundingSettings.enabled ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-1.5 gap-y-2 mb-3">
                                    <label className="min-w-0">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Preset</span>
                                        <NeonSelect
                                            className="w-full"
                                            value={fundingSettings.preset}
                                            onChange={(value) => patchFundingSettings({ preset: value })}
                                            options={[{ value: "ftmo_2_step", label: "FTMO 2-Step" }]}
                                        />
                                    </label>
                                    <label className="min-w-0">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Phase 1 Target %</span>
                                        <NeonInput
                                            className="w-full"
                                            type="number"
                                            value={fundingSettings.phase1TargetPct}
                                            onChange={(event) => patchFundingSettings({ phase1TargetPct: event.target.value })}
                                        />
                                    </label>
                                    <label className="min-w-0">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Phase 2 Target %</span>
                                        <NeonInput
                                            className="w-full"
                                            type="number"
                                            value={fundingSettings.phase2TargetPct}
                                            onChange={(event) => patchFundingSettings({ phase2TargetPct: event.target.value })}
                                        />
                                    </label>
                                    <label className="min-w-0">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Max Overall Loss %</span>
                                        <NeonInput
                                            className="w-full"
                                            type="number"
                                            value={fundingSettings.maxOverallLossPct}
                                            onChange={(event) => patchFundingSettings({ maxOverallLossPct: event.target.value })}
                                        />
                                    </label>
                                    <label className="min-w-0">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Min Days</span>
                                        <NeonInput
                                            className="w-full"
                                            type="number"
                                            value={fundingSettings.minTradingDays}
                                            onChange={(event) => patchFundingSettings({ minTradingDays: event.target.value })}
                                        />
                                    </label>
                                </div>
                            ) : (
                                <div className="mb-3">
                                    <label className="inline-block min-w-[140px]">
                                        <span className="mb-1 block text-[9.5px] font-ui uppercase tracking-widest text-[hsl(var(--text-2)/0.65)]">Preset</span>
                                        <NeonSelect
                                            value={fundingSettings.preset}
                                            onChange={(value) => patchFundingSettings({ preset: value })}
                                            options={[{ value: "ftmo_2_step", label: "FTMO 2-Step" }]}
                                        />
                                    </label>
                                </div>
                            )}
                            {fundingSettings.enabled ? (
                                fundingChallenge.reason === "account_mode_required" ? (
                                    <div className="text-[11px] text-[hsl(var(--warning))]">
                                        Enable Account view to simulate funding targets. R-only mode has no account balance path.
                                    </div>
                                ) : (
                                    <div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <FundingPhaseCard
                                                title="Phase 1 Challenge"
                                                phase={fundingChallenge.phase1}
                                                currency={accountCurrency}
                                            />
                                            <FundingPhaseCard
                                                title="Phase 2 Verification"
                                                phase={fundingChallenge.phase2}
                                                currency={accountCurrency}
                                            />
                                            <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-[10px] font-ui uppercase tracking-widest text-muted-lab">Funded Start</div>
                                                    <Pill tone={fundingChallenge.status === "funded" ? "success" : "muted"}>
                                                        {formatChallengeStatus(fundingChallenge.status)}
                                                    </Pill>
                                                </div>
                                                <div className="mt-3 text-[20px] font-semibold text-[hsl(var(--text))] tabular-nums">
                                                    {fundingChallenge.fundedStart?.tradeNumber ? `Trade ${fundingChallenge.fundedStart.tradeNumber}` : "—"}
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-lab">
                                                    {fundingChallenge.fundedStart?.date ? formatChallengeDate(fundingChallenge.fundedStart.date) : "Requires both phases passed"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="text-[11px] text-[hsl(var(--text-2)/0.55)]">
                                    Turn on the overlay to test FTMO-style targets against the account equity path.
                                </div>
                            )}
                        </div>

                    </div>
                    )}
                </div>
            </div>
            <div className="kpi-strip">
                <MetricChip
                    label={accountModeEnabled ? "Net PnL" : "Net R"}
                    value={netMetricValue}
                    sub={netMetricSub}
                    tone="primary"
                    icon={TrendingUp}
                    valueClassName={validNetR > 0 ? "!text-[hsl(var(--success))] text-glow-success" : validNetR < 0 ? "!text-[hsl(var(--danger))]" : "!text-[hsl(var(--text))]"}
                    subClassName="!text-[hsl(var(--text-2))]"
                    onClick={() => setActiveKpiModal("net")}
                />
                <MetricChip
                    label="Win Rate"
                    value={validWinRate != null ? `${validWinRate.toFixed(1)}%` : "N/A"}
                    sub={<><span className="text-[hsl(var(--success))]">{validWinsCount}</span>{` / ${validLossesCount}`}</>}
                    tone="secondary"
                    icon={Target}
                    subClassName="!text-[hsl(var(--text-2))]"
                    onClick={() => setActiveKpiModal("winRate")}
                />
                <MetricChip label="Trades"        value={String(validTradeCount)}   sub={tradeSubtext}           tone="muted"     icon={Hash}          subClassName="!text-[hsl(var(--text-2))]" onClick={() => setActiveKpiModal("trades")} />
                <MetricChip label="Expectancy"    value={expectancyMetricValue}      sub={expectancyMetricSub}    tone="primary"   icon={Activity}      subClassName="!text-[hsl(var(--text-2))]" onClick={() => setActiveKpiModal("expectancy")} />
                <MetricChip label="Profit Factor" value={pf != null ? (isFinite(pf) ? pf.toFixed(2) : "∞") : "N/A"} sub={pf != null ? "Σ wins / |Σ losses|" : "Limited Data"} tone="secondary" icon={ShieldCheck} subClassName="!text-[hsl(var(--text-2))]" onClick={() => setActiveKpiModal("profitFactor")} />
                <MetricChip label="Max Drawdown"  value={maxDdMetricValue}           sub={maxDdMetricSub}         tone="danger"    icon={AlertTriangle}  subClassName="!text-[hsl(var(--text-2))]" onClick={() => setActiveKpiModal("drawdown")} />
            </div>

            {/* ── Funded / Live Period strip — shown only when FTMO overlay is active ── */}
            {useFundingPhaseChart && fundingChallenge.status === "funded" && fundedStats && fundedSummary && (
                <>
                    <div className="px-6 mt-4 mb-1 text-[9px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--warning))]">
                        ◆ Funded / Live Period
                    </div>
                    <div className="kpi-strip">
                        <MetricChip
                            size="compact"
                            label="Net PnL"
                            value={formatAccountValue(fundedSummary.netPnlAmount, accountCurrency)}
                            sub={`${formatSignedR(fundedSummary.totalR, 1)} R`}
                            tone={fundedSummary.netPnlAmount >= 0 ? "primary" : "danger"}
                            icon={TrendingUp}
                        />
                        <MetricChip
                            size="compact"
                            label="Trades"
                            value={String(fundedStats.tradeCount)}
                            sub={`from trade ${fundingChallenge.fundedStart?.tradeNumber ?? "—"}`}
                            tone="muted"
                            icon={Hash}
                        />
                        <MetricChip
                            size="compact"
                            label="Win Rate"
                            value={fundedStats.winRate != null ? `${fundedStats.winRate.toFixed(1)}%` : "N/A"}
                            sub={<><span className="text-[hsl(var(--success))]">{fundedStats.wins}</span>{` / ${fundedStats.losses}`}</>}
                            tone="secondary"
                            icon={Target}
                        />
                        <MetricChip
                            size="compact"
                            label="Max Drawdown"
                            value={formatAccountValue(fundedSummary.maxDrawdownAmount, accountCurrency)}
                            sub={`${Math.abs(fundedSummary.maxDrawdownPct ?? 0).toFixed(1)}%`}
                            tone="danger"
                            icon={AlertTriangle}
                        />
                        <MetricChip
                            size="compact"
                            label="Profit Factor"
                            value={fundedStats.pf != null ? (isFinite(fundedStats.pf) ? fundedStats.pf.toFixed(2) : "∞") : "N/A"}
                            sub="Σ wins / |Σ losses|"
                            tone="secondary"
                            icon={ShieldCheck}
                        />
                    </div>
                </>
            )}

            {/* ── Ghost Tracking KPI strip — shown only when ghost data is present ── */}
            {(() => {
                const gs = runData?.summary || {};
                const total = gs.ghost_candidates_total ?? null;
                if (total == null || total === 0) return null;
                const ghostWins    = gs.ghost_wins    ?? 0;
                const ghostLosses  = gs.ghost_losses  ?? 0;
                const ghostNever   = gs.ghost_never_triggered ?? 0;
                const ghostNetR    = gs.ghost_net_r   ?? null;
                const ghostWinRate = (ghostWins + ghostLosses) > 0
                    ? ((ghostWins / (ghostWins + ghostLosses)) * 100).toFixed(1)
                    : null;
                return (
                    <>
                        <div className="px-6 mt-4 mb-1 text-[9px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--accent-primary)/0.6)]">
                            ◆ Ghost Tracking — Observational
                        </div>
                        <div className="kpi-strip">
                            <MetricChip
                                size="compact"
                                label="Ghost Candidates"
                                value={String(total)}
                                sub="would-be cancelled OBs"
                                tone="muted"
                                icon={Eye}
                            />
                            <MetricChip
                                size="compact"
                                label="Ghost Wins"
                                value={String(ghostWins)}
                                sub={ghostWinRate != null ? `${ghostWinRate}% ghost win rate` : "—"}
                                tone="success"
                                icon={TrendingUp}
                            />
                            <MetricChip
                                size="compact"
                                label="Ghost Losses"
                                value={String(ghostLosses)}
                                sub="would have stopped out"
                                tone="danger"
                                icon={AlertTriangle}
                            />
                            <MetricChip
                                size="compact"
                                label="Never Triggered"
                                value={String(ghostNever)}
                                sub="price never reached trigger"
                                tone="muted"
                                icon={Hash}
                            />
                            <MetricChip
                                size="compact"
                                label="Ghost Net R"
                                value={ghostNetR != null ? (ghostNetR >= 0 ? `+${ghostNetR.toFixed(2)}R` : `${ghostNetR.toFixed(2)}R`) : "—"}
                                sub="if none were cancelled"
                                tone={ghostNetR != null ? (ghostNetR >= 0 ? "primary" : "danger") : "muted"}
                                icon={Activity}
                            />
                        </div>
                    </>
                );
            })()}

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel
                    className="xl:col-span-3"
                    title="Equity Curve"
                    action={useFundingPhaseChart ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Pill tone="success">Phase 1 Pass</Pill>
                            <Pill tone="secondary">Verification Start</Pill>
                            <Pill tone="success">Phase 2 Pass</Pill>
                            <Pill tone="primary">Funded Start</Pill>
                        </div>
                    ) : null}
                >
                    {/* ── Filters button + popover ─────────────────────────────── */}
                    <div className="relative inline-block mb-3">
                        <button
                            onClick={() => setEquityFiltersOpen((v) => !v)}
                            className={[
                                "flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-ui uppercase tracking-[0.07em] border clip-bevel-sm transition-colors select-none",
                                equityFiltersOpen
                                    ? "border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]"
                                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary)/0.35)] hover:text-[hsl(var(--text))]",
                            ].join(" ")}
                        >
                            <SlidersHorizontal className="w-3 h-3" />
                            Filters
                        </button>

                        {equityFiltersOpen && (
                            <>
                                {/* Click-outside trap */}
                                <div className="fixed inset-0 z-20" onClick={() => setEquityFiltersOpen(false)} />
                                {/* Popover panel */}
                                <div className="absolute left-0 top-full mt-1.5 z-30 w-[300px] clip-bevel bg-[hsl(var(--panel))] border border-[hsl(var(--accent-border)/0.45)] shadow-2xl p-4 space-y-3.5">

                                    {/* Section A — Chart Filters */}
                                    <div>
                                        <div className="text-[9px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text-2)/0.55)] mb-2">Chart Filters</div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <NeonSelect
                                                value={equitySessionFilter}
                                                onChange={setEquitySessionFilter}
                                                options={["All","Asia","London","London Lull","New York","Outside","Unassigned"].map((v) => ({ value: v, label: v === "All" ? "Session: All" : v }))}
                                            />
                                            <NeonSelect
                                                value={equityDirectionFilter}
                                                onChange={setEquityDirectionFilter}
                                                options={["All","Long","Short"].map((v) => ({ value: v, label: v === "All" ? "Direction: All" : v }))}
                                            />
                                            <NeonSelect
                                                value={equityStructureFilter}
                                                onChange={setEquityStructureFilter}
                                                options={["All","BOS","CHoCH"].map((v) => ({ value: v, label: v === "All" ? "Structure: All" : v }))}
                                            />
                                            <FilterToggle active={equityExcludeNews}   inactiveBorder="mid" onClick={() => setEquityExcludeNews((v) => !v)}>Excl. News</FilterToggle>
                                            <FilterToggle active={equityExcludeMissed} inactiveBorder="mid" onClick={() => setEquityExcludeMissed((v) => !v)}>Excl. Missed</FilterToggle>
                                        </div>
                                        <div className="mt-1.5 text-[9px] font-ui text-[hsl(var(--text-2)/0.45)] italic">Affect chart only — not KPI analytics</div>
                                    </div>

                                    {/* Section B — Funding Chart (only when funding overlay is active) */}
                                    {fundingSettings.enabled && accountModeEnabled && (
                                        <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-3">
                                            <div className="text-[9px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text-2)/0.55)] mb-2">Funding Chart</div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <FilterToggle active={fundingChartMode === "funding_phase"} inactiveBorder="mid" onClick={() => setFundingChartMode("funding_phase")}>
                                                    Funding Phase Equity
                                                </FilterToggle>
                                                <FilterToggle active={fundingChartMode === "continuous"} inactiveBorder="mid" onClick={() => setFundingChartMode("continuous")}>
                                                    Continuous Account Equity
                                                </FilterToggle>
                                            </div>
                                        </div>
                                    )}

                                    {/* Section C — Visual Layers */}
                                    <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-3">
                                        <div className="text-[9px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text-2)/0.55)] mb-2">Visual Layers</div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <FilterToggle active={showDots}     inactiveBorder="mid" onClick={() => setShowDots((v) => !v)}>Trade Dots</FilterToggle>
                                            <FilterToggle active={showDrawdown} inactiveBorder="mid" onClick={() => setShowDrawdown((v) => !v)}>Drawdown</FilterToggle>
                                            <FilterToggle active={showNews}     inactiveBorder="mid" onClick={() => setShowNews((v) => !v)}>News</FilterToggle>
                                        </div>
                                    </div>

                                </div>
                            </>
                        )}
                    </div>

                    {equityChartData.length === 0 ? (
                        <div className="py-10 text-center font-ui text-[11px] text-muted-lab">
                            No trades match current equity filters.
                        </div>
                    ) : (
                        <EquityCurveV2
                            data={equityChartData}
                            height={340}
                            showDots={showDots}
                            showDrawdown={showDrawdown}
                            showNews={showNews || useFundingPhaseChart}
                            accountMode={accountModeEnabled}
                            currency={accountCurrency}
                            referenceLevels={useFundingPhaseChart ? [
                                { y: fundingLossFloor,                label: "Blowout Floor", color: "hsl(var(--bear))",            dash: "4 2" },
                                { y: accountSettings.startingBalance, label: "Baseline",      color: "hsl(var(--muted))",          dash: "2 4" },
                                { y: fundingPhase2Target,             label: "P2 Target",     color: "hsl(var(--accent-secondary))", dash: "4 2" },
                                { y: fundingPhase1Target,             label: "P1 Target",     color: "hsl(var(--success))",        dash: "4 2" },
                            ] : []}
                        />
                    )}

                    {/* Reference levels footer — shown below chart when funding phase overlay is active */}
                    {useFundingPhaseChart && (
                        <div className="mt-2 text-[9.5px] font-ui text-[hsl(var(--text-2)/0.5)] leading-relaxed">
                            Reference levels: Challenge target {formatAccountValue(fundingPhase1Target, accountCurrency)} · Verification target {formatAccountValue(fundingPhase2Target, accountCurrency)} · Loss floor {formatAccountValue(fundingLossFloor, accountCurrency)}
                        </div>
                    )}
                </NeonPanel>

                <ResultsTabFrame
                    mode={resultsLayoutMode}
                    tabs={resultsTabs}
                    activeTab={currentResultsTab}
                    onTabChange={setActiveResultsTab}
                >
                {showResultsSection("baseline-splits") && <SessionSplit trades={displayTrades} />}

                {showResultsSection("config") && <NeonPanel className="xl:col-span-3" title="Configuration" action={<Pill tone="muted">Compact</Pill>}>
                    <div className="space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                    {/* ── Group A — Market / Detection ─────────────────────── */}
                    <ConfigGroup title="Market & Detection" paddingClassName="px-3 pt-3 pb-7">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-ui text-[11px]">
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Symbol</div>
                            <div className="text-right text-white font-semibold">{runSymbol}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Detection TF</div>
                            <div className="text-right text-white">{runTf}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Execution TF</div>
                            <div className="text-right text-white">{compactTimeframe(run.executionTf || runData?.config?.execution_timeframe) || "—"}</div>
                            <div className="col-span-2 border-t border-[hsl(var(--border-soft)/0.4)] my-0.5" />
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Date Range</div>
                            <div className="text-right text-white">{runDateRange}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Structure</div>
                            <div className="text-right">
                                {(() => {
                                    const v = structureFilter;
                                    if (!v) return <span className="text-muted-lab">—</span>;
                                    return <span className="px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]">{formatStructureFilterValue(v)}</span>;
                                })()}
                            </div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Direction</div>
                            <div className="text-right">
                                {(() => {
                                    const v = runData?.config?.trade_direction;
                                    if (!v) return <span className="text-muted-lab">—</span>;
                                    const vl = v.toLowerCase();
                                    const cls = vl === "long"
                                        ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]"
                                        : vl === "short"
                                        ? "border-[hsl(var(--accent-secondary)/0.4)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.08)]"
                                        : "border-[hsl(var(--border-soft))] text-white";
                                    return <span className={`px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border ${cls}`}>{v}</span>;
                                })()}
                            </div>
                        </div>
                    </ConfigGroup>

                    {/* ── Group B — Execution / Risk ───────────────────────── */}
                    <ConfigGroup title="Execution & Risk" paddingClassName="px-3 pt-3 pb-[36px]">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-ui text-[11px]">
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">RR</div>
                            <div className="text-right text-[hsl(var(--accent-primary))] font-semibold">{Number.isFinite(runRr) ? `${runRr.toFixed(1)}×` : "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Entry Depth</div>
                            <div className="text-right text-white">{formatPercentValue(entryDepthPct)}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Entry Buffer</div>
                            <div className="text-right text-white">{formatPipValue(entryBufferPips)}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Stop Buffer</div>
                            <div className="text-right text-white">{formatPipValue(stopBufferPips)}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Verify Ticks</div>
                            <div className="text-right text-white">{formatTickValue(verifyLimitTicks)}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Execution</div>
                            <div className="text-right text-white">{variantLabel(run.executionMode || runData?.config?.execution_mode)}</div>
                        </div>
                    </ConfigGroup>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
                    <div className="flex h-full flex-col justify-between gap-3">

                    {/* ── Group C — Filters (collapse when all permissive) ──── */}
                    {(() => {
                        const cfg = runData?.config || {};
                        const sfEnabled = cfg.session_filter_enabled === true || String(cfg.session_filter_enabled) === "true";
                        const allowedSessions = Array.isArray(cfg.allowed_sessions) ? cfg.allowed_sessions : [];
                        const originSession = cfg.ob_origin_session ?? cfg.origin_session ?? null;
                        const detectionSession = cfg.ob_detection_session ?? cfg.detection_session ?? null;
                        const allPermissive = !sfEnabled
                            && (!originSession    || ["any","Any",""].includes(String(originSession).trim()))
                            && (!detectionSession || ["any","Any",""].includes(String(detectionSession).trim()));
                        if (allPermissive) {
                            return (
                                <ConfigGroup title="Session Filters" paddingClassName="px-3 pt-3 pb-14">
                                    <div className="font-ui text-[10px] text-muted-lab">Session filter: Off · All sessions eligible</div>
                                </ConfigGroup>
                            );
                        }
                        return (
                            <ConfigGroup title="Session Filters" paddingClassName="px-3 pt-3 pb-14">
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-ui text-[11px]">
                                    <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Session Filter</div>
                                    <div className="text-right">
                                        <span className={`px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border ${sfEnabled ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]" : "border-[hsl(var(--border-soft))] text-muted-lab"}`}>
                                            {sfEnabled ? "✓ Enabled" : "Off"}
                                        </span>
                                    </div>
                                    {sfEnabled && allowedSessions.length > 0 && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Allowed</div>
                                            <div className="text-right flex flex-wrap gap-1 justify-end">
                                                {allowedSessions.map((s) => (
                                                    <span key={s} className="px-1 py-0.5 text-[8.5px] font-ui uppercase border border-[hsl(var(--accent-primary)/0.3)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)]">{s}</span>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {originSession && !["any","Any",""].includes(String(originSession).trim()) && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">OB Origin</div>
                                            <div className="text-right text-white">{originSession}</div>
                                        </>
                                    )}
                                    {detectionSession && !["any","Any",""].includes(String(detectionSession).trim()) && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">OB Detection</div>
                                            <div className="text-right text-white">{detectionSession}</div>
                                        </>
                                    )}
                                </div>
                            </ConfigGroup>
                        );
                    })()}

                    <ConfigGroup title="Advanced / Misc">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-ui text-[11px]">
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Swing</div>
                            <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.swing_length ?? "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">OB Filter</div>
                            <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.ob_filter ?? "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Conflict</div>
                            <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.position_conflict ?? runData?.config?.conflict ?? "—"}</div>
                            {(runData?.config?.position_conflict === "block_opposite" || runData?.config?.conflict === "block_opposite") && (
                                <>
                                    <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Cancel Action</div>
                                    <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.cancel_action ?? "—"}</div>
                                </>
                            )}
                        </div>
                    </ConfigGroup>
                    </div>

                    {/* ── Group D — News / Costs (collapse when news off) ───── */}
                    {(() => {
                        const cfg = runData?.config || {};
                        const newsOn   = !!(run?.news_blackout_enabled ?? cfg.news_blackout_enabled);
                        const spread   = cfg.spread_pips ?? cfg.spread ?? null;
                        const slippage = cfg.slippage_pips ?? cfg.slippage ?? null;
                        const commission = cfg.commission_r_per_trade ?? cfg.commission ?? null;
                        const hasAnyCost = [spread, slippage, commission].some((v) => v != null && Number(v) !== 0);
                        if (!newsOn) {
                            return (
                                <ConfigGroup title="News & Costs">
                                    <div className="font-ui text-[10px] text-muted-lab">
                                        {"News protection: Off"}
                                        {hasAnyCost
                                            ? ` · Spread ${spread ?? "—"} · Slip ${slippage ?? "—"} · Comm ${commission != null ? `${commission}R` : "—"}`
                                            : " · No cost model applied"}
                                    </div>
                                </ConfigGroup>
                            );
                        }
                        const mBefore  = cfg.news_blackout_minutes_before;
                        const mAfter   = cfg.news_blackout_minutes_after;
                        const impacts  = Array.isArray(cfg.news_blackout_impacts)    ? cfg.news_blackout_impacts    : [];
                        const currs    = Array.isArray(cfg.news_blackout_currencies) ? cfg.news_blackout_currencies : [];
                        const cancelT  = cfg.news_cancel_if_touched_during_blackout;
                        const flatAct  = cfg.news_flatten_active_trades;
                        const flatLead = cfg.news_flatten_minutes_before_blackout;
                        return (
                            <ConfigGroup title="News & Costs">
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-ui text-[11px]">
                                    <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">News Blackout</div>
                                    <div className="text-right">
                                        <span className="px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]">✓ On</span>
                                    </div>
                                    {(mBefore != null || mAfter != null) && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Window</div>
                                            <div className="text-right text-white">
                                                {[mBefore != null && `−${mBefore}m`, mAfter != null && `+${mAfter}m`].filter(Boolean).join(" / ")}
                                            </div>
                                        </>
                                    )}
                                    {impacts.length > 0 && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Impacts</div>
                                            <div className="text-right flex flex-wrap gap-1 justify-end">
                                                {impacts.map((imp) => (
                                                    <span key={imp} className="px-1 py-0.5 text-[8.5px] font-ui uppercase border border-[hsl(var(--warning)/0.3)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)]">{imp}</span>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {currs.length > 0 && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Currencies</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{currs.join(", ")}</div>
                                        </>
                                    )}
                                    {cancelT != null && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Cancel Touched</div>
                                            <div className="text-right">
                                                <span className={`px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border ${cancelT ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]" : "border-[hsl(var(--border-soft))] text-muted-lab"}`}>
                                                    {cancelT ? "✓ On" : "Off"}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {flatAct != null && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Flatten Active</div>
                                            <div className="text-right">
                                                <span className={`px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border ${flatAct ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]" : "border-[hsl(var(--border-soft))] text-muted-lab"}`}>
                                                    {flatAct ? "✓ On" : "Off"}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {flatLead != null && flatAct && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Flatten Lead</div>
                                            <div className="text-right text-white">{flatLead} min before</div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-3 pt-2.5 border-t border-[hsl(var(--border-soft)/0.4)]">
                                    {hasAnyCost ? (
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-ui text-[11px]">
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Spread</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{spread != null ? `${spread} pip` : "—"}</div>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Slippage</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{slippage != null ? `${slippage} pip` : "—"}</div>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Commission</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{commission != null ? `${commission}R` : "—"}</div>
                                        </div>
                                    ) : (
                                        <div className="font-ui text-[10px] text-muted-lab">No cost model applied</div>
                                    )}
                                </div>
                            </ConfigGroup>
                        );
                    })()}
                    </div>
                    </div>
                </NeonPanel>}

                {showResultsSection("trades") && <NeonPanel
                    className="xl:col-span-2"
                    title="Trade Ledger"
                    action={
                        <div className="flex items-center gap-2">
                            {isActiveRun && <VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />}
                            <Pill tone="secondary">{filteredLedgerRows.length} / {(displayTrades || []).length} SHOWN</Pill>
                        </div>
                    }
                >
                    <div className="mb-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <NeonSelect
                            value={ledgerResultFilter}
                            onChange={setLedgerResultFilter}
                            options={["All", "Wins", "Losses", "Partial Wins", "Partial Losses", "Breakeven / Zero", "Special / Missed"]}
                        />
                        <NeonSelect
                            value={ledgerSessionFilter}
                            onChange={setLedgerSessionFilter}
                            options={["All", "London", "New York", "Asia", "London Lull", "Outside", "Unassigned"]}
                        />
                        <NeonSelect
                            value={ledgerDirectionFilter}
                            onChange={setLedgerDirectionFilter}
                            options={["All", "Long", "Short"]}
                        />
                        <NeonInput
                            placeholder="Search trade / OB / result…"
                            value={ledgerSearch}
                            onChange={(e) => setLedgerSearch(e.target.value)}
                        />
                    </div>
                    {/* Sanity strip summarizing whatever the ledger filters currently
                        show. When filters are off this equals the full primary-variant
                        roll-up (matches the KPI strip). When filters narrow rows down,
                        the strip narrows with them — that's the whole point. */}
                    <div className="mb-3">
                        <TradeSanityStrip
                            trades={filteredLedgerRows}
                            title="Ledger sanity"
                            subtitle={
                                ledgerResultFilter !== "All"
                                || ledgerSessionFilter !== "All"
                                || ledgerDirectionFilter !== "All"
                                || ledgerSearch
                                    ? "Filtered ledger rows"
                                    : "All performance trades"
                            }
                        />
                    </div>
                    <DataTable
                        testId="run-detail-trades"
                        maxHeight={360}
                        columns={[
                            { key: "displayTradeId", label: "Trade ID", mono: true, render: (r) => r.displayTradeId || r.id || "—" },
                            { key: "displayObId",    label: "OB ID",    mono: true, render: (r) => r.displayObId || formatObId(r.obId) },
                            { key: "direction", label: "Dir", render: (r) => <Pill tone={r.direction === "Long" ? "success" : "danger"}>{r.direction}</Pill> },
                            { key: "structure", label: "Struct" },
                            { key: "fillSession", label: "Fill Session", render: displaySession },
                            { key: "entry",     label: "Entry Time", mono: true, render: (r) => formatUtcDisplay(r.entry) },
                            { key: "exit",      label: "Exit Time",  mono: true, render: (r) => formatUtcDisplay(r.exit) },
                            { key: "entryPrice",label: "Entry",   align: "right", mono: true, render: (r) => formatPrice(r.entryPrice) },
                            { key: "stop",      label: "Stop",    align: "right", mono: true, render: (r) => formatPrice(r.stop) },
                            { key: "tp",        label: "TP",      align: "right", mono: true, render: (r) => formatPrice(r.tp) },
                            { key: "r",         label: "R",       align: "right", render: (r) => <LedgerR trade={r} value={r.r} /> },
                            { key: "outcome",   label: "Result",  render: (r) => <Pill tone={resultTone(r)}>{formatOutcome(r)}</Pill> },
                        ]}
                        rows={filteredLedgerRows}
                    />
                </NeonPanel>}

                {showResultsSection("ob-stats") && <NeonPanel title="Order Block Stats">
                    {obStats.total === 0 ? (
                        <div className="py-6 text-center font-ui text-[11px] text-muted-lab">
                            {runData ? "No order block data in this run." : "Import a run to see order block stats."}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3.5">

                            {/* ── Zone 1 — Execution Summary (3×2 compact grid) ── */}
                            <div className="grid grid-cols-3 gap-1.5">
                                {[
                                    { label: "Detected", value: obStats.total,         cls: "text-white" },
                                    { label: "Eligible",  value: obStats.eligibleCount, cls: "text-[hsl(var(--accent-secondary))]" },
                                    { label: "Executed",  value: obStats.filledCount,   cls: "text-[hsl(var(--accent-primary))]" },
                                    { label: "Wins",      value: validWinsCount,         cls: "text-[hsl(var(--success))]" },
                                    { label: "Losses",    value: validLossesCount,       cls: "text-[hsl(var(--danger))]" },
                                    { label: "Unfilled",  value: obStats.unfilledCount, cls: "text-muted-lab" },
                                ].map(({ label, value, cls }) => (
                                    <div key={label} className="flex flex-col items-center justify-center px-2 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm">
                                        <span className={`font-num text-[14px] font-bold leading-none tabular-nums ${cls}`}>{value}</span>
                                        <span className="mt-0.5 font-ui text-[8.5px] uppercase tracking-wider text-muted-lab">{label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── Zone 2 — Integrity badges ───────────────────── */}
                            {(() => {
                                const { total, sessionFilteredCount, newsCancelledCount, reverseCancelledCount,
                                        invalidatedCount, filledCount, eligibleCount, bullish, bearish,
                                        sessionFilterEnabled, newsEnabled, directionRestricted, directionRespected } = obStats;
                                const badges = [];
                                if (sessionFilterEnabled && sessionFilteredCount > 0)
                                    badges.push({ text: "✓ Session filter", type: "success" });
                                if (newsEnabled && newsCancelledCount > 0)
                                    badges.push({ text: "✓ News blackout", type: "success" });
                                if (directionRestricted && directionRespected)
                                    badges.push({ text: "✓ Direction OK", type: "success" });
                                if (total > 0 && invalidatedCount / total > 0.20)
                                    badges.push({ text: `⚠ High invalidation ${Math.round(invalidatedCount / total * 100)}%`, type: "warning" });
                                if (eligibleCount > 0 && filledCount / eligibleCount < 0.30)
                                    badges.push({ text: `⚠ Low fill conv. ${Math.round(filledCount / eligibleCount * 100)}%`, type: "warning" });
                                if (total > 0 && sessionFilteredCount / total > 0.20)
                                    badges.push({ text: `⚠ Session filter ${Math.round(sessionFilteredCount / total * 100)}%`, type: "warning" });
                                if (total > 0 && newsCancelledCount / total > 0.10)
                                    badges.push({ text: `⚠ News cancel ${Math.round(newsCancelledCount / total * 100)}%`, type: "warning" });
                                if (total > 0 && (bullish / total > 0.70 || bearish / total > 0.70))
                                    badges.push({ text: `⚠ ${bullish > bearish ? "Bull" : "Bear"} skew ${Math.round(Math.max(bullish, bearish) / total * 100)}%`, type: "warning" });
                                if (!badges.length) return null;
                                return (
                                    <div className="flex flex-wrap gap-1">
                                        {badges.slice(0, 6).map((b, i) => (
                                            <span key={i} className={`px-1.5 py-0.5 font-ui text-[9px] border clip-bevel-sm ${b.type === "success" ? "border-[hsl(var(--success)/0.35)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)]" : "border-[hsl(var(--warning)/0.35)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)]"}`}>
                                                {b.text}
                                            </span>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* ── Zone 3 — Lifecycle Funnel ───────────────────── */}
                            {(() => {
                                const { total, eligibleCount, filledCount, unfilledCount,
                                        sessionFilteredCount, newsCancelledCount, reverseCancelledCount,
                                        invalidatedCount, filledWins, filledLosses, filledBE, filledUnlinked } = obStats;
                                const pct = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
                                const R = (key, indent, connector, label, count, denom, colorCls) => (
                                    <div key={key} className="flex items-baseline font-code text-[10.5px]" style={{ paddingLeft: `${indent * 11}px` }}>
                                        {connector
                                            ? <span className="text-muted-lab mr-1 w-4 shrink-0 text-[9.5px]">{connector}</span>
                                            : indent > 0 ? <span className="w-4 mr-1 shrink-0" /> : null}
                                        <span className={`flex-1 ${colorCls}`}>{label}</span>
                                        <span className="tabular-nums text-white">{count}</span>
                                        <span className="tabular-nums text-muted-lab ml-1.5 w-8 text-right text-[9.5px]">{pct(count, denom)}</span>
                                    </div>
                                );
                                const rows = [
                                    R("det",  0, null, "Detected",         total,               total,         "text-white"),
                                    R("eli",  1, "├─", "Eligible",         eligibleCount,        total,         "text-[hsl(var(--accent-primary))]"),
                                    R("fil",  2, "├─", "Filled",           filledCount,          eligibleCount, "text-[hsl(var(--accent-primary))]"),
                                    ...(filledWins   > 0 ? [R("fw",  3, "├─", "Win",           filledWins,   filledCount, "text-[hsl(var(--success))]")] : []),
                                    ...(filledLosses > 0 ? [R("fl",  3, "├─", "Loss",          filledLosses, filledCount, "text-[hsl(var(--danger))]")]  : []),
                                    ...(filledBE     > 0 ? [R("fbe", 3, "└─", "BE / Partial",  filledBE,     filledCount, "text-muted-lab")]            : []),
                                    R("unf",  2, "└─", "Unfilled",         unfilledCount,        eligibleCount, "text-white"),
                                    ...(sessionFilteredCount  > 0 ? [R("sf",  1, "├─", "Session Filtered", sessionFilteredCount,  total, "text-[hsl(var(--warning))]")] : []),
                                    ...(newsCancelledCount    > 0 ? [R("nc",  1, "├─", "News Cancelled",   newsCancelledCount,    total, "text-[hsl(var(--warning))]")] : []),
                                    ...(invalidatedCount      > 0 ? [R("inv", 1, "├─", "Invalidated",      invalidatedCount,      total, "text-muted-lab")]             : []),
                                    ...(reverseCancelledCount > 0 ? [R("rc",  1, "└─", "Reverse Cancel",   reverseCancelledCount, total, "text-[hsl(var(--warning))]")] : []),
                                ];
                                return (
                                    <div>
                                        <div className="text-[9px] font-ui uppercase tracking-widest text-muted-lab mb-1.5 opacity-60">Lifecycle</div>
                                        <div className="flex flex-col gap-px">{rows}</div>
                                        {filledUnlinked > 0 && (
                                            <div className="mt-1.5 font-ui text-[9px] text-muted-lab italic">
                                                {filledUnlinked} OB{filledUnlinked !== 1 ? "s" : ""} filled but unlinked — W/L may be understated.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── Zone 4 — Directional Sanity (stacked) ───────── */}
                            {(obStats.dirStats.long.trades > 0 || obStats.dirStats.short.trades > 0) && (
                                <div>
                                    <div className="text-[9px] font-ui uppercase tracking-widest text-muted-lab mb-1.5 opacity-60">Directional</div>
                                    <div className="flex flex-col gap-1.5">
                                        {[
                                            { key: "long",  label: "Long",  accentCls: "text-[hsl(var(--accent-primary))]",   borderCls: "border-[hsl(var(--accent-primary)/0.2)]" },
                                            { key: "short", label: "Short", accentCls: "text-[hsl(var(--accent-secondary))]", borderCls: "border-[hsl(var(--accent-secondary)/0.2)]" },
                                        ].map(({ key, label, accentCls, borderCls }) => {
                                            const s = obStats.dirStats[key];
                                            const other = key === "long" ? obStats.dirStats.short : obStats.dirStats.long;
                                            const convGap = s.convPct != null && other.convPct != null ? Math.abs(s.convPct - other.convPct) : 0;
                                            const convAmber = convGap > 15 && s.convPct != null && s.convPct < (other.convPct ?? 0);
                                            return (
                                                <div key={key} className={`border ${borderCls} bg-[hsl(var(--panel-2)/0.4)] clip-bevel-sm px-2.5 py-2`}>
                                                    {/* Header row */}
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-ui text-[9px] uppercase tracking-wider font-semibold ${accentCls}`}>{label}</span>
                                                        <span className={`font-num text-[11px] font-semibold tabular-nums ${s.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}`}>
                                                            {s.netR >= 0 ? "+" : ""}{s.netR.toFixed(1)}R
                                                        </span>
                                                    </div>
                                                    {/* Stats row */}
                                                    <div className="flex items-center gap-2 font-num text-[10px] text-muted-lab flex-wrap">
                                                        <span>{s.obCount} OBs</span>
                                                        <span className="opacity-40">·</span>
                                                        <span>{s.trades}T</span>
                                                        <span className="opacity-40">·</span>
                                                        <span><span className="text-[hsl(var(--success))]">{s.wins}W</span> <span className="text-[hsl(var(--danger))]">{s.losses}L</span> <span>{s.be}BE</span></span>
                                                        {s.convPct != null && (
                                                            <>
                                                                <span className="opacity-40">·</span>
                                                                <span className={convAmber ? "text-[hsl(var(--warning))]" : ""}>{s.convPct.toFixed(0)}% conv</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Zone 5 — Insight Lines ──────────────────────── */}
                            {(() => {
                                const { total, filledCount, eligibleCount, sessionFilteredCount,
                                        reverseCancelledCount, invalidatedCount, bullish, bearish, dirStats } = obStats;
                                const insights = [];
                                if (eligibleCount > 0 && filledCount / eligibleCount < 0.28)
                                    insights.push(`Only ${Math.round(filledCount / eligibleCount * 100)}% of eligible OBs filled — check entry depth or session timing.`);
                                if (total > 0 && sessionFilteredCount / total > 0.22)
                                    insights.push(`${Math.round(sessionFilteredCount / total * 100)}% of detected OBs were session-filtered before fill.`);
                                if (total > 0 && reverseCancelledCount / total > 0.08)
                                    insights.push(`Reverse conflict cancellations unusually high (${reverseCancelledCount}) — consider conflict settings.`);
                                if (total > 0 && bullish / total > 0.70)
                                    insights.push(`Strong bullish detection skew this run (${Math.round(bullish / total * 100)}% of OBs).`);
                                if (total > 0 && bearish / total > 0.70)
                                    insights.push(`Strong bearish detection skew this run (${Math.round(bearish / total * 100)}% of OBs).`);
                                if (invalidatedCount > filledCount && invalidatedCount > 10)
                                    insights.push(`More OBs invalidated (${invalidatedCount}) than filled (${filledCount}) — review swing/TF sensitivity.`);
                                if (dirStats.long.netR > 0 && dirStats.short.netR < 0 && Math.abs(dirStats.short.netR) > 2)
                                    insights.push("Long OBs are driving returns; Short OBs are net negative this run.");
                                if (!insights.length) return null;
                                return (
                                    <div className="flex flex-col gap-1">
                                        {insights.slice(0, 3).map((insight, i) => (
                                            <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 border-l-2 border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.05)]">
                                                <span className="font-ui text-[9.5px] text-[hsl(var(--accent-primary))] shrink-0 mt-px">→</span>
                                                <span className="font-ui text-[9.5px] text-[hsl(var(--text-2))] leading-snug">{insight}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* ── Zone 6 — OB Lab CTA ─────────────────────────── */}
                            <Link
                                to="/order-block-lab"
                                className="flex items-center justify-between gap-2 px-2.5 py-2 border border-[hsl(var(--accent-primary)/0.22)] bg-[hsl(var(--accent-primary)/0.04)] clip-bevel-sm hover:bg-[hsl(var(--accent-primary)/0.09)] hover:border-[hsl(var(--accent-primary)/0.4)] transition-colors"
                            >
                                <div>
                                    <div className="font-ui text-[10px] uppercase tracking-wider text-[hsl(var(--accent-primary))]">→ Order Block Lab</div>
                                    <div className="font-ui text-[8.5px] text-muted-lab mt-0.5 leading-snug">Structure · Width · Penetration · Age · Session analysis</div>
                                </div>
                                <span className="text-[hsl(var(--accent-primary)/0.5)] text-[10px] shrink-0">↗</span>
                            </Link>

                        </div>
                    )}
                </NeonPanel>}

                {showResultsSection("outcomes") && <NeonPanel className="xl:col-span-2" title="Outcome Distribution">
                    {!outcomeSummary || outcomeSummary.total === 0 ? (
                        <div className="py-6 text-center font-ui text-[11px] text-muted-lab">
                            No trade outcome data available.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 2xl:grid-cols-[1.15fr_0.85fr] gap-5">
                            <div className="flex flex-col gap-4">
                            {/* Zone A — Outcome Summary chips */}
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: "Wins",      value: outcomeSummary.wins,      tone: "hsl(var(--success))" },
                                    { label: "Losses",    value: outcomeSummary.losses,    tone: "hsl(var(--bear))" },
                                    { label: "Breakeven", value: outcomeSummary.breakeven, tone: "hsl(var(--muted))" },
                                    { label: "Special",   value: outcomeSummary.special,   tone: "hsl(var(--warning))" },
                                ].map(({ label, value, tone }) => (
                                    <div
                                        key={label}
                                        className="flex flex-col items-center justify-center px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm min-w-[64px]"
                                    >
                                        <span className="text-[18px] font-semibold leading-none tabular-nums" style={{ color: tone }}>{value}</span>
                                        <span className="mt-1 text-[11px] font-medium text-muted-lab">{label}</span>
                                    </div>
                                ))}
                                <div className="flex flex-col items-center justify-center px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm min-w-[72px]">
                                    <span className="text-[18px] font-semibold leading-none tabular-nums text-[hsl(var(--accent-primary))]">
                                        {outcomeSummary.winRate != null ? `${outcomeSummary.winRate.toFixed(1)}%` : "—"}
                                    </span>
                                    <span className="mt-1 text-[11px] font-medium text-muted-lab">Win Rate</span>
                                </div>
                                {expectancy != null && (
                                    <div className="flex flex-col items-center justify-center px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm min-w-[72px]">
                                        <span className={`text-[18px] font-semibold leading-none tabular-nums ${expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--bear))]"}`}>
                                            {`${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(2)}R`}
                                        </span>
                                        <span className="mt-1 text-[11px] font-medium text-muted-lab">Expectancy</span>
                                    </div>
                                )}
                            </div>

                            {/* Zone B — R Distribution horizontal bars */}
                            {R_DIST_V2.some((b) => b.count > 0) && (
                                <div>
                                    <div className="flex items-end justify-between gap-3 mb-2">
                                        <SectionKicker>Executed R Distribution</SectionKicker>
                                        <div className="text-[11px] font-medium text-muted-lab">Valid executed trades only</div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {R_DIST_V2.map((bucket) => (
                                            <div key={bucket.label} className="flex items-center gap-2">
                                                <div className="w-[72px] shrink-0 text-[11px] text-right text-muted-lab">{bucket.label}</div>
                                                <div className="flex-1 h-[10px] rounded-sm bg-[hsl(var(--panel-2))] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-sm transition-all"
                                                        style={{ width: `${bucket.bar * 100}%`, background: bucket.color, minWidth: bucket.count > 0 ? "3px" : "0" }}
                                                    />
                                                </div>
                                                <div className="w-[52px] shrink-0 text-[11px] text-muted-lab text-right tabular-nums">
                                                    {bucket.count > 0 ? `${bucket.count} · ${bucket.pct.toFixed(0)}%` : "—"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Zone C — Trade quality */}
                            {(outcomeSummary.avgWin != null || outcomeSummary.avgLoss != null) && (
                                <div>
                                    <div className="mb-2"><SectionKicker>Trade Quality</SectionKicker></div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                        {[
                                            { label: "Avg Win",      value: outcomeSummary.avgWin  != null ? `+${outcomeSummary.avgWin.toFixed(2)}R`  : "—", tone: "hsl(var(--success))" },
                                            { label: "Avg Loss",     value: outcomeSummary.avgLoss != null ? `${outcomeSummary.avgLoss.toFixed(2)}R`    : "—", tone: "hsl(var(--bear))" },
                                            { label: "Payoff Ratio", value: outcomeSummary.payoffRatio != null ? `${outcomeSummary.payoffRatio.toFixed(2)}×` : "—", tone: "hsl(var(--accent-primary))" },
                                            { label: "Best Trade",   value: outcomeSummary.bestR  != null ? `+${outcomeSummary.bestR.toFixed(2)}R`  : "—", tone: "hsl(var(--success))" },
                                            { label: "Worst Trade",  value: outcomeSummary.worstR != null ? `${outcomeSummary.worstR.toFixed(2)}R`   : "—", tone: "hsl(var(--bear))" },
                                        ].map(({ label, value, tone }) => (
                                            <div key={label} className="flex flex-col border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-2.5 py-2 clip-bevel-sm">
                                                <span className="text-[13px] font-semibold leading-none tabular-nums" style={{ color: tone }}>{value}</span>
                                                <span className="mt-1 text-[11px] font-medium text-muted-lab">{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Zone D — Special outcomes */}
                            {outcomeSummary.special > 0 && (
                                <div>
                                    <div className="mb-2"><SectionKicker>Setup / Action Diagnostics</SectionKicker></div>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { label: "News Flatten",      value: outcomeSummary.newsFlatten     },
                                            { label: "News Touch Cancel", value: outcomeSummary.newsTouchCancel },
                                            { label: "News Blackout",     value: outcomeSummary.newsBlackout    },
                                            { label: "Session Filtered",  value: outcomeSummary.sessionFiltered },
                                            { label: "Unfilled",          value: outcomeSummary.unfilled        },
                                            { label: "Missed",            value: outcomeSummary.missed          },
                                        ].filter((s) => s.value > 0).map(({ label, value }) => (
                                            <div key={label} className="flex items-center gap-1.5 px-2 py-1 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm">
                                                <span className="text-[11px] font-semibold tabular-nums text-[hsl(var(--warning))]">{value}</span>
                                                <span className="text-[11px] font-medium text-muted-lab">{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            </div>

                            <div className="flex flex-col gap-4">
                            {/* Zone C — Directional outcome */}
                            {directionalOutcomeStats.some((s) => s.trades > 0) && (
                                <div>
                                    <div className="mb-2"><SectionKicker>Long / Short Outcomes</SectionKicker></div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {directionalOutcomeStats.map((stat) => (
                                            <DirectionalOutcomeCard key={stat.side} stat={stat} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Zone E — Auto insights */}
                            {autoInsights.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="mb-0.5"><SectionKicker>Insights</SectionKicker></div>
                                    {autoInsights.map((insight, i) => (
                                        <div key={i} className="flex items-start gap-2 px-3 py-2 border-l-2 border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.06)]">
                                            <span className="text-[12px] text-[hsl(var(--accent-primary))]">→</span>
                                            <span className="text-[12px] leading-5 text-[hsl(var(--text-2))]">{insight}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            </div>
                        </div>
                    )}
                </NeonPanel>}

                {showResultsSection("monthly") && <NeonPanel className="xl:col-span-3" title="Monthly Performance (Net R)">
                    {MONTHLY.length > 0 ? (
                        <div style={{ width: "100%", height: 200 }}>
                            <ResponsiveContainer>
                                <BarChart data={MONTHLY} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                    <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                    <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                    <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                    <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                    <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                                        {MONTHLY.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.75)"} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="py-8 text-center font-ui text-[11px] text-muted-lab">
                            Monthly chart will populate when trades with entry timestamps are available.
                        </div>
                    )}
                </NeonPanel>}

                {showResultsSection("entry-timing") && (
                    <>
                        <SessionMatrix trades={displayTrades} />
                        <TimeOfDayHeatmap trades={displayTrades} />
                    </>
                )}
                {showResultsSection("research") && (
                    <ResearchStrip
                        project={linkedProject}
                        projectId={projectId}
                        runId={runId}
                        runRole={runRole}
                        nextStep={nextStep}
                        runReference={runReference}
                        deltaRows={deltaRows}
                        runs={RUNS}
                    />
                )}
                </ResultsTabFrame>
            </div>
            {activeKpiModal && (
                <KpiDetailModal
                    mode={activeKpiModal}
                    onClose={() => setActiveKpiModal(null)}
                    resultViewLabel={breakdownViewLabel}
                    validNetR={validNetR}
                    grossWins={grossWins}
                    grossLosses={grossLosses}
                    validWinsCount={validWinsCount}
                    validLossesCount={validLossesCount}
                    validTradeCount={validTradeCount}
                    validWinRate={validWinRate}
                    expectancy={expectancy}
                    pf={pf}
                    maxDd={maxDd}
                    displayTrades={displayTrades}
                    validTrades={validTradesForRun}
                    accountModeEnabled={accountModeEnabled}
                    accountSummary={accountSummary}
                    accountCurrency={accountCurrency}
                />
            )}
        </div>
    );
}

function KpiDetailModal({
    mode, onClose, resultViewLabel,
    validNetR, grossWins, grossLosses,
    validWinsCount, validLossesCount, validTradeCount,
    validWinRate, expectancy, pf, maxDd,
    displayTrades, validTrades,
    accountModeEnabled, accountSummary, accountCurrency,
}) {
    React.useEffect(() => {
        function onKey(e) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Per-direction W/L breakdown from valid (performance) trades
    const dirBreakdown = React.useMemo(() => {
        const b = {
            long:  { wins: 0, losses: 0, total: 0 },
            short: { wins: 0, losses: 0, total: 0 },
        };
        (validTrades || []).forEach(t => {
            const raw = String(t?.direction ?? t?.side ?? t?.bias ?? "").trim().toLowerCase();
            let dir = null;
            if (raw === "long" || raw === "buy" || raw.startsWith("bull")) dir = "long";
            else if (raw === "short" || raw === "sell" || raw.startsWith("bear")) dir = "short";
            if (!dir) return;
            b[dir].total++;
            const sign = tradeResultSign(t);
            if (sign > 0) b[dir].wins++;
            else if (sign < 0) b[dir].losses++;
        });
        return b;
    }, [validTrades]);

    // Classification summary — only computed for "trades" mode
    const classSummary = React.useMemo(() =>
        mode === "trades" ? summarizeTradeClassifications(displayTrades || []) : null,
    [mode, displayTrades]);

    const avgWin  = validWinsCount  > 0 ? grossWins  / validWinsCount  : null;
    const avgLoss = validLossesCount > 0 ? grossLosses / validLossesCount : null;
    const breakevenCount = validTradeCount - validWinsCount - validLossesCount;

    const TITLE = {
        net:          accountModeEnabled ? "Net PnL" : "Net R",
        winRate:      "Win Rate",
        trades:       "Trade Count",
        expectancy:   "Expectancy",
        profitFactor: "Profit Factor",
        drawdown:     "Max Drawdown",
    }[mode] || mode;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-sm mx-4 clip-bevel bg-[hsl(var(--panel))] border border-[hsl(var(--accent-border)/0.5)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[hsl(var(--border-soft)/0.5)]">
                    <div>
                        <div className="text-[10px] font-ui font-semibold uppercase tracking-[0.12em] text-[hsl(var(--accent-primary))]">
                            {TITLE}
                        </div>
                        <div className="text-[13px] font-display font-semibold text-[hsl(var(--text))] mt-0.5">
                            {resultViewLabel}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--panel-2)/0.6)] transition-colors"
                    >
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Body — per-mode content */}
                <div className="px-5 py-4 space-y-4">
                    {mode === "net" && (
                        <KpiNetContent
                            validNetR={validNetR} grossWins={grossWins} grossLosses={grossLosses}
                            validWinsCount={validWinsCount} validLossesCount={validLossesCount}
                            expectancy={expectancy} avgWin={avgWin} avgLoss={avgLoss}
                            accountModeEnabled={accountModeEnabled} accountSummary={accountSummary}
                            accountCurrency={accountCurrency}
                        />
                    )}
                    {mode === "winRate" && (
                        <KpiWinRateContent
                            validWinRate={validWinRate} validWinsCount={validWinsCount}
                            validLossesCount={validLossesCount} validTradeCount={validTradeCount}
                            breakevenCount={breakevenCount} dirBreakdown={dirBreakdown}
                        />
                    )}
                    {mode === "trades" && classSummary && (
                        <KpiTradesContent classSummary={classSummary} dirBreakdown={dirBreakdown} />
                    )}
                    {mode === "expectancy" && (
                        <KpiExpectancyContent
                            expectancy={expectancy} validNetR={validNetR} validTradeCount={validTradeCount}
                            avgWin={avgWin} avgLoss={avgLoss}
                            validWinRate={validWinRate} validWinsCount={validWinsCount} validLossesCount={validLossesCount}
                            accountModeEnabled={accountModeEnabled} accountSummary={accountSummary}
                            accountCurrency={accountCurrency}
                        />
                    )}
                    {mode === "profitFactor" && (
                        <KpiProfitFactorContent
                            pf={pf} grossWins={grossWins} grossLosses={grossLosses}
                            validWinsCount={validWinsCount} validLossesCount={validLossesCount}
                            avgWin={avgWin} avgLoss={avgLoss}
                        />
                    )}
                    {mode === "drawdown" && (
                        <KpiDrawdownContent
                            maxDd={maxDd} accountModeEnabled={accountModeEnabled}
                            accountSummary={accountSummary} accountCurrency={accountCurrency}
                            validTradeCount={validTradeCount}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Net R / Net PnL breakdown ─────────────────────────────────────────── */
function KpiNetContent({ validNetR, grossWins, grossLosses, validWinsCount, validLossesCount, expectancy, avgWin, avgLoss, accountModeEnabled, accountSummary, accountCurrency }) {
    const netColor = validNetR > 0 ? "text-[hsl(var(--success))]" : validNetR < 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]";
    return (
        <>
            {/* Primary value */}
            <div className="flex items-baseline gap-2">
                <span className={`text-[32px] font-display font-bold leading-none tabular-nums ${netColor}`}>
                    {accountModeEnabled
                        ? formatAccountValue(accountSummary?.netPnlAmount, accountCurrency)
                        : `${validNetR >= 0 ? "+" : ""}${validNetR.toFixed(2)}R`}
                </span>
                {accountModeEnabled && (
                    <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">
                        {`${validNetR >= 0 ? "+" : ""}${validNetR.toFixed(1)}R`}
                    </span>
                )}
            </div>

            {/* Gross breakdown */}
            <div>
                <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-primary))] mb-2">
                    Gross Breakdown
                </div>
                <div className="space-y-1.5">
                    <BRow label="Gross wins"   value={`+${grossWins.toFixed(2)}R`}   tone="success" note={validWinsCount   > 0 ? `${validWinsCount} wins`   : null} />
                    <BRow label="Gross losses" value={`-${grossLosses.toFixed(2)}R`} tone="danger"  note={validLossesCount > 0 ? `${validLossesCount} losses` : null} />
                    <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-1.5">
                        <BRow label="Net" value={`${validNetR >= 0 ? "+" : ""}${validNetR.toFixed(2)}R`} tone={validNetR > 0 ? "success" : validNetR < 0 ? "danger" : "muted"} />
                    </div>
                </div>
            </div>

            {/* Per-trade averages */}
            {(avgWin != null || avgLoss != null) && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-secondary))] mb-2">
                        Per Trade
                    </div>
                    <div className="space-y-1.5">
                        {avgWin  != null && <BRow label="Avg win"   value={`+${avgWin.toFixed(3)}R`}  tone="success" />}
                        {avgLoss != null && <BRow label="Avg loss"  value={`-${avgLoss.toFixed(3)}R`} tone="danger"  />}
                        {expectancy != null && (
                            <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-1.5">
                                <BRow label="Expectancy" value={`${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(3)}R`} tone={expectancy > 0 ? "success" : expectancy < 0 ? "danger" : "muted"} note="per trade" />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

/* ─── Win Rate breakdown ────────────────────────────────────────────────── */
function KpiWinRateContent({ validWinRate, validWinsCount, validLossesCount, validTradeCount, breakevenCount, dirBreakdown }) {
    const denominator = validWinsCount + validLossesCount;
    const hasDirections = dirBreakdown.long.total > 0 || dirBreakdown.short.total > 0;
    const longWR  = dirBreakdown.long.total  > 0 ? (dirBreakdown.long.wins  / dirBreakdown.long.total)  * 100 : null;
    const shortWR = dirBreakdown.short.total > 0 ? (dirBreakdown.short.wins / dirBreakdown.short.total) * 100 : null;
    return (
        <>
            {/* Primary value */}
            <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-display font-bold leading-none tabular-nums text-[hsl(var(--accent-secondary))]">
                    {validWinRate != null ? `${validWinRate.toFixed(1)}%` : "N/A"}
                </span>
            </div>

            {/* W / L / BE counts */}
            <div>
                <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-primary))] mb-2">
                    Performance trades — {validTradeCount}
                </div>
                <div className="space-y-1.5">
                    <BRow label="Wins"    count={validWinsCount}   tone="success" />
                    <BRow label="Losses"  count={validLossesCount} tone="danger"  />
                    {breakevenCount > 0 && <BRow label="Breakeven" count={breakevenCount} tone="muted" />}
                    {denominator > 0 && (
                        <div className="pt-1 text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-70">
                            = {validWinsCount} / ({validWinsCount} + {validLossesCount}) = {validWinRate?.toFixed(1)}%
                        </div>
                    )}
                </div>
            </div>

            {/* By direction */}
            {hasDirections && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-secondary))] mb-2">
                        By Direction
                    </div>
                    <div className="space-y-1.5">
                        {dirBreakdown.long.total > 0 && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[hsl(var(--success))]">↑</span>
                                    <span className="text-[11px] font-display text-[hsl(var(--text))]">Long</span>
                                    <span className="text-[10px] font-ui tabular-nums text-[hsl(var(--text-2))]">{dirBreakdown.long.total}</span>
                                </div>
                                <span className="text-[10.5px] font-ui tabular-nums">
                                    <span className="text-[hsl(var(--success))]">{dirBreakdown.long.wins}W</span>
                                    <span className="mx-1 opacity-30">·</span>
                                    <span className="text-[hsl(var(--danger))]">{dirBreakdown.long.losses}L</span>
                                    {longWR != null && <span className="ml-1.5 text-[hsl(var(--text-2))]">{longWR.toFixed(0)}%</span>}
                                </span>
                            </div>
                        )}
                        {dirBreakdown.short.total > 0 && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[hsl(var(--danger))]">↓</span>
                                    <span className="text-[11px] font-display text-[hsl(var(--text))]">Short</span>
                                    <span className="text-[10px] font-ui tabular-nums text-[hsl(var(--text-2))]">{dirBreakdown.short.total}</span>
                                </div>
                                <span className="text-[10.5px] font-ui tabular-nums">
                                    <span className="text-[hsl(var(--success))]">{dirBreakdown.short.wins}W</span>
                                    <span className="mx-1 opacity-30">·</span>
                                    <span className="text-[hsl(var(--danger))]">{dirBreakdown.short.losses}L</span>
                                    {shortWR != null && <span className="ml-1.5 text-[hsl(var(--text-2))]">{shortWR.toFixed(0)}%</span>}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

/* ─── Trades (classification) breakdown ────────────────────────────────── */
function KpiTradesContent({ classSummary, dirBreakdown }) {
    const { total, wins, losses, flats, newsFlattenWins, newsFlattenLosses, newsFlattenFlats, invalidCancelled, unfilled, sessionFiltered, newsCancelled, open, unknown, performanceTrades } = classSummary;
    const excludedTotal = (invalidCancelled || 0) + (unfilled || 0) + (sessionFiltered || 0) + (newsCancelled || 0) + (open || 0) + (unknown || 0);
    const hasDirections = dirBreakdown.long.total > 0 || dirBreakdown.short.total > 0;
    return (
        <>
            <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-display font-bold leading-none tabular-nums text-[hsl(var(--text))]">{total}</span>
                <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">total rows</span>
            </div>
            <div>
                <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-primary))] mb-2">
                    Valid / Performance — {performanceTrades}
                </div>
                <div className="space-y-1.5">
                    <BRow label="Wins"   count={wins}   tone="success" note={newsFlattenWins   > 0 ? `${newsFlattenWins} news-flatten`   : null} />
                    <BRow label="Losses" count={losses} tone="danger"  note={newsFlattenLosses > 0 ? `${newsFlattenLosses} news-flatten` : null} />
                    {flats > 0 && <BRow label="Breakeven" count={flats} tone="muted" note={newsFlattenFlats > 0 ? `${newsFlattenFlats} news-flatten` : null} />}
                </div>
            </div>
            {hasDirections && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-secondary))] mb-2">
                        By Direction
                    </div>
                    <div className="space-y-1.5">
                        {dirBreakdown.long.total > 0 && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[hsl(var(--success))]">↑</span>
                                    <span className="text-[11px] font-display text-[hsl(var(--text))]">Long</span>
                                    <span className="text-[10px] font-ui tabular-nums text-[hsl(var(--text-2))]">{dirBreakdown.long.total}</span>
                                </div>
                                <span className="text-[10.5px] font-ui tabular-nums">
                                    <span className="text-[hsl(var(--success))]">{dirBreakdown.long.wins}W</span>
                                    <span className="mx-1 opacity-30">·</span>
                                    <span className="text-[hsl(var(--danger))]">{dirBreakdown.long.losses}L</span>
                                </span>
                            </div>
                        )}
                        {dirBreakdown.short.total > 0 && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[hsl(var(--danger))]">↓</span>
                                    <span className="text-[11px] font-display text-[hsl(var(--text))]">Short</span>
                                    <span className="text-[10px] font-ui tabular-nums text-[hsl(var(--text-2))]">{dirBreakdown.short.total}</span>
                                </div>
                                <span className="text-[10.5px] font-ui tabular-nums">
                                    <span className="text-[hsl(var(--success))]">{dirBreakdown.short.wins}W</span>
                                    <span className="mx-1 opacity-30">·</span>
                                    <span className="text-[hsl(var(--danger))]">{dirBreakdown.short.losses}L</span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {excludedTotal > 0 && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                        Excluded / Non-performance
                    </div>
                    <div className="space-y-1.5">
                        {invalidCancelled > 0 && <BRow label="Protected (OB filtered)" count={invalidCancelled} tone="muted" />}
                        {unfilled        > 0 && <BRow label="Unfilled"                 count={unfilled}        tone="muted" />}
                        {sessionFiltered > 0 && <BRow label="Session filtered"          count={sessionFiltered} tone="muted" />}
                        {newsCancelled   > 0 && <BRow label="News cancelled"            count={newsCancelled}   tone="muted" />}
                        {open            > 0 && <BRow label="Open"                      count={open}            tone="muted" />}
                        {unknown         > 0 && <BRow label="Unknown"                   count={unknown}         tone="muted" />}
                    </div>
                </div>
            )}
        </>
    );
}

/* ─── Expectancy breakdown ──────────────────────────────────────────────── */
function KpiExpectancyContent({ expectancy, validNetR, validTradeCount, avgWin, avgLoss, validWinRate, validWinsCount, validLossesCount, accountModeEnabled, accountSummary, accountCurrency }) {
    const expColor = expectancy > 0 ? "text-[hsl(var(--success))]" : expectancy < 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]";
    const wrDecimal = validWinRate != null ? validWinRate / 100 : null;
    return (
        <>
            <div className="flex items-baseline gap-2">
                <span className={`text-[32px] font-display font-bold leading-none tabular-nums ${expColor}`}>
                    {accountModeEnabled && accountSummary?.expectancyAmount != null
                        ? formatAccountValue(accountSummary.expectancyAmount, accountCurrency)
                        : (expectancy != null ? `${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(3)}R` : "N/A")}
                </span>
                {accountModeEnabled && expectancy != null && (
                    <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">
                        {`${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(3)}R`}
                    </span>
                )}
                <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">per trade</span>
            </div>

            {/* Calculation */}
            {expectancy != null && validTradeCount > 0 && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-primary))] mb-2">
                        Calculation
                    </div>
                    <div className="text-[10.5px] font-ui text-[hsl(var(--text-2))] space-y-1">
                        <div className="flex items-center justify-between">
                            <span>Net R</span>
                            <span className="tabular-nums text-[hsl(var(--text))]">{`${validNetR >= 0 ? "+" : ""}${validNetR.toFixed(2)}R`}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Valid trades</span>
                            <span className="tabular-nums text-[hsl(var(--text))]">{validTradeCount}</span>
                        </div>
                        <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-1 flex items-center justify-between">
                            <span>Net R ÷ trades</span>
                            <span className={`tabular-nums font-semibold ${expColor}`}>
                                {`${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(3)}R`}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Components */}
            {(avgWin != null || avgLoss != null) && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-secondary))] mb-2">
                        Components
                    </div>
                    <div className="space-y-1.5">
                        {avgWin != null && (
                            <div className="flex items-center justify-between text-[10.5px] font-ui">
                                <span className="text-[hsl(var(--text-2))]">
                                    Avg win
                                    {wrDecimal != null && <span className="opacity-60 ml-1">× {(wrDecimal * 100).toFixed(0)}% WR</span>}
                                </span>
                                <span className="text-[hsl(var(--success))] tabular-nums">
                                    +{avgWin.toFixed(3)}R
                                    {wrDecimal != null && <span className="opacity-60 ml-1">= +{(avgWin * wrDecimal).toFixed(3)}R</span>}
                                </span>
                            </div>
                        )}
                        {avgLoss != null && (
                            <div className="flex items-center justify-between text-[10.5px] font-ui">
                                <span className="text-[hsl(var(--text-2))]">
                                    Avg loss
                                    {wrDecimal != null && <span className="opacity-60 ml-1">× {((1 - wrDecimal) * 100).toFixed(0)}% LR</span>}
                                </span>
                                <span className="text-[hsl(var(--danger))] tabular-nums">
                                    -{avgLoss.toFixed(3)}R
                                    {wrDecimal != null && <span className="opacity-60 ml-1">= -{(avgLoss * (1 - wrDecimal)).toFixed(3)}R</span>}
                                </span>
                            </div>
                        )}
                        {avgWin != null && avgLoss != null && (
                            <div className="text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-60 mt-1">
                                Payoff ratio: {(avgWin / avgLoss).toFixed(2)} : 1
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

/* ─── Profit Factor breakdown ───────────────────────────────────────────── */
function KpiProfitFactorContent({ pf, grossWins, grossLosses, validWinsCount, validLossesCount, avgWin, avgLoss }) {
    const pfDisplay = pf != null ? (isFinite(pf) ? pf.toFixed(2) : "∞") : "N/A";
    const pfTone = pf == null ? "text-[hsl(var(--text-2))]" : pf >= 2 ? "text-[hsl(var(--success))]" : pf >= 1 ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--danger))]";
    return (
        <>
            <div className="flex items-baseline gap-2">
                <span className={`text-[32px] font-display font-bold leading-none tabular-nums ${pfTone}`}>
                    {pfDisplay}
                </span>
            </div>

            <div>
                <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-primary))] mb-2">
                    Gross R
                </div>
                <div className="space-y-1.5">
                    <BRow label="Gross wins"   value={`+${grossWins.toFixed(2)}R`}   tone="success" note={`${validWinsCount} wins`} />
                    <BRow label="Gross losses" value={`${grossLosses.toFixed(2)}R`}   tone="danger"  note={`${validLossesCount} losses`} />
                    {grossLosses > 0 && isFinite(pf) && (
                        <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-1.5 text-[9.5px] font-ui text-[hsl(var(--text-2))]">
                            {grossWins.toFixed(2)} ÷ {grossLosses.toFixed(2)} = {pf.toFixed(2)}
                        </div>
                    )}
                </div>
            </div>

            {(avgWin != null || avgLoss != null) && (
                <div>
                    <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-secondary))] mb-2">
                        Per Trade
                    </div>
                    <div className="space-y-1.5">
                        {avgWin  != null && <BRow label="Avg win"  value={`+${avgWin.toFixed(3)}R`}  tone="success" />}
                        {avgLoss != null && <BRow label="Avg loss" value={`-${avgLoss.toFixed(3)}R`} tone="danger"  />}
                        {avgWin != null && avgLoss != null && (
                            <div className="text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-60">
                                Payoff ratio: {(avgWin / avgLoss).toFixed(2)} : 1
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-60">
                {pf == null ? "Not enough data" : pf < 1 ? "< 1.0 — unprofitable" : pf === Infinity ? "No losses recorded" : pf < 1.5 ? "1.0–1.5 — marginal" : pf < 2 ? "1.5–2.0 — solid" : "> 2.0 — strong"}
            </div>
        </>
    );
}

/* ─── Max Drawdown breakdown ────────────────────────────────────────────── */
function KpiDrawdownContent({ maxDd, accountModeEnabled, accountSummary, accountCurrency, validTradeCount }) {
    const ddR = maxDd != null ? maxDd.toFixed(2) : null;
    const ddPct = accountSummary?.maxDrawdownPct != null ? Math.abs(accountSummary.maxDrawdownPct).toFixed(1) : null;
    return (
        <>
            <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-display font-bold leading-none tabular-nums text-[hsl(var(--danger))]">
                    {accountModeEnabled && accountSummary?.maxDrawdownAmount != null
                        ? formatAccountValue(accountSummary.maxDrawdownAmount, accountCurrency)
                        : (ddR != null ? `-${ddR}R` : "N/A")}
                </span>
                {accountModeEnabled && ddR != null && (
                    <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">-{ddR}R</span>
                )}
            </div>

            <div>
                <div className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-primary))] mb-2">
                    Details
                </div>
                <div className="space-y-1.5">
                    {ddR != null && <BRow label="Max dip (R)" value={`-${ddR}R`} tone="danger" />}
                    {ddPct != null && accountModeEnabled && <BRow label="% of account" value={`-${ddPct}%`} tone="danger" />}
                    {accountModeEnabled && accountSummary?.maxDrawdownAmount != null && (
                        <BRow label="$ amount" value={formatAccountValue(accountSummary.maxDrawdownAmount, accountCurrency)} tone="danger" />
                    )}
                    <BRow label="Computed from" value={`${validTradeCount} trades`} tone="muted" />
                </div>
            </div>

            <div className="text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-60 leading-relaxed">
                Largest peak-to-trough equity decline across the run's R curve.
            </div>
        </>
    );
}

/* ─── Shared row primitive ──────────────────────────────────────────────── */
function BRow({ label, count, value, tone = "muted", note }) {
    const valColor = {
        success: "text-[hsl(var(--success))]",
        danger:  "text-[hsl(var(--danger))]",
        warning: "text-[hsl(var(--warning))]",
        muted:   "text-[hsl(var(--text-2))]",
    }[tone] || "text-[hsl(var(--text-2))]";

    const displayValue = value ?? (count != null ? String(count) : "—");

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-display text-[hsl(var(--text))]">{label}</span>
                {note && <span className="text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-60">{note}</span>}
            </div>
            <span className={`text-[12px] font-display font-semibold tabular-nums ${valColor}`}>{displayValue}</span>
        </div>
    );
}

function ConfigGroup({ title, children, paddingClassName = "p-3" }) {
    return (
        <div className={`clip-bevel-sm border border-[hsl(var(--border-soft)/0.65)] bg-[hsl(var(--panel-2)/0.28)] ${paddingClassName}`}>
            <div className="mb-2 text-[10px] font-ui uppercase tracking-widest text-[hsl(var(--text-2))]">
                {title}
            </div>
            {children}
        </div>
    );
}

function ResultsTabFrame({ mode, tabs, activeTab, onTabChange, children }) {
    if (mode === "stacked") return <>{children}</>;
    const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Results";
    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Run Results"
            action={<Pill tone="primary">{activeLabel}</Pill>}
        >
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[hsl(var(--border-soft)/0.55)] pb-3">
                {tabs.map((tab) => (
                    <FilterToggle
                        key={tab.id}
                        active={activeTab === tab.id}
                        inactiveBorder="mid"
                        onClick={() => onTabChange(tab.id)}
                    >
                        {tab.label}
                    </FilterToggle>
                ))}
            </div>
            <div className="mt-4 space-y-4">
                {children}
            </div>
        </NeonPanel>
    );
}

function VariantSelector({ variants, value }) {
    if (!variants?.length) return null;
    if (variants.length === 1) return <Pill tone="muted">{variantLabel(variants[0])}</Pill>;
    return (
        <NeonSelect
            testId="run-detail-variant"
            value={value || variants[0]}
            onChange={setSelectedTradeVariant}
            options={variants.map((v) => ({ value: v, label: variantLabel(v) }))}
        />
    );
}

function EditableTitle({ value, displayName, editing, canEdit, onEdit, onChange, onSave, onCancel }) {
    if (editing) {
        return (
            <NeonInput
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onSave}
                onKeyDown={(event) => {
                    if (event.key === "Enter") onSave();
                    if (event.key === "Escape") onCancel();
                }}
                className="min-w-[320px] text-[24px] md:text-[30px] font-display"
                autoFocus
            />
        );
    }
    return (
        <span className="group/title inline-flex items-center gap-2" title={displayName}>
            <span>{displayName}</span>
            {canEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="grid place-items-center w-7 h-7 opacity-0 group-hover/title:opacity-100 group-focus-within/title:opacity-100 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))] hover:text-white transition-opacity"
                    aria-label="Rename run"
                >
                    <Edit3 className="w-3.5 h-3.5" />
                </button>
            )}
        </span>
    );
}

function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v || "N/A";
}

// Small label+value cell used inside the scope chip strip. Keeps the strip
// readable when several labelled facts sit next to each other.
function ScopeRow({ label, children }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab">
                {label}
            </span>
            {children}
        </span>
    );
}

function normalizeTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let text = String(value).trim();
    if (!text) return null;
    text = text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text = `${text}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text = `${text}Z`;
    const ms = Date.parse(text);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function formatUtcDisplay(value) {
    const ts = normalizeTimestamp(value);
    if (ts == null) return "—";
    const date = new Date(ts * 1000);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getUTCDate();
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

function formatPrice(value) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    return Number(value).toFixed(5).replace(/\.?0+$/, "");
}

function formatR(value) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    const n = Number(value);
    if (Math.abs(n) < 0.0001) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(/\.?0+$/, "")}R`;
}

function formatSignedR(value, digits = 1) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    const n = Number(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}R`;
}

function formatBucketR(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "3";
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function SectionKicker({ children }) {
    return (
        <div className="text-[12px] font-semibold tracking-[0.03em] text-[hsl(var(--accent-primary))]">
            <span className="inline-block w-4 h-px bg-[hsl(var(--accent-primary)/0.75)] mr-2 align-middle" />
            {children}
        </div>
    );
}

function DirectionalOutcomeCard({ stat }) {
    const netTone = stat.netR > 0 ? "text-[hsl(var(--success))]" : stat.netR < 0 ? "text-[hsl(var(--bear))]" : "text-muted-lab";
    const accent = stat.side === "LONG" ? "hsl(var(--accent-primary)/0.55)" : "hsl(var(--accent-secondary)/0.55)";
    return (
        <div className="border bg-[hsl(var(--panel-2))] clip-bevel-sm px-3 py-2.5" style={{ borderColor: accent }}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold text-white">{stat.side}</span>
                <span className={`text-[14px] font-semibold tabular-nums ${netTone}`}>{formatSignedR(stat.netR)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <OutcomeMiniStat label="Trades" value={stat.trades} />
                <OutcomeMiniStat label="W/L/P" value={`${stat.wins} / ${stat.losses} / ${stat.partial}`} />
                <OutcomeMiniStat label="WR" value={stat.winRate != null ? `${stat.winRate.toFixed(0)}%` : "—"} />
                <OutcomeMiniStat label="Avg" value={stat.avgR != null ? formatSignedR(stat.avgR) : "—"} />
            </div>
        </div>
    );
}

function OutcomeMiniStat({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.35)] px-2 py-1">
            <span className="font-medium text-muted-lab">{label}</span>
            <span className="text-[hsl(var(--text))] tabular-nums">{value}</span>
        </div>
    );
}

function LedgerR({ value, trade = null }) {
    const label = formatR(value);
    if (label === "—") return <span className="text-muted-lab">—</span>;
    const n = Number(value);
    const color = n > 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    const breakdown = trade ? rCostBreakdown(trade) : null;
    if (!breakdown?.show) return <span className={`${color} tabular-nums font-semibold`}>{label}</span>;
    return (
        <span
            className="inline-flex flex-col items-end leading-tight"
            title={`Gross ${formatSignedR(breakdown.gross, 2)} · Costs ${formatCostR(breakdown.cost)} · Net ${formatSignedR(breakdown.net, 2)}`}
        >
            <span className={`${color} tabular-nums font-semibold`}>{label}</span>
            <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted-lab">
                gross {formatSignedR(breakdown.gross, 2).replace("R", "")} · cost {formatCostR(breakdown.cost).replace("R", "")}
            </span>
        </span>
    );
}

function rCostBreakdown(trade) {
    const net = numericTradeR(trade);
    const gross = parseNumericValue(trade?.grossR ?? trade?.gross_r);
    const cost = parseNumericValue(trade?.totalCostR ?? trade?.total_cost_r);
    const show = net != null && (
        (cost != null && Math.abs(cost) > 0.000001) ||
        (gross != null && Math.abs(gross - net) > 0.000001)
    );
    return { show, net, gross: gross ?? net, cost: cost ?? Math.max(0, (gross ?? net) - net) };
}

function formatCostR(value) {
    const n = parseNumericValue(value);
    if (n == null || Math.abs(n) < 0.000001) return "—";
    return `${n > 0 ? "-" : ""}${Math.abs(n).toFixed(2)}R`;
}

function formatObId(value) {
    if (value == null || value === "") return "—";
    const match = String(value).match(/\d+/);
    return match ? `OB-${String(Number(match[0])).padStart(3, "0")}` : String(value);
}

function displaySession(row) {
    const value = row?.fillSession || row?.fill_session || row?.session || row?.trade_session || row?.entry_session;
    return value && value !== "—" ? value : "—";
}

function normalizeOutcome(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function numericTradeR(trade) {
    const raw = trade?.r ?? trade?.net_r ?? trade?.netR ?? trade?.pnl_r ?? trade?.pnlR ?? trade?.resultR ?? trade?.news_flatten_r;
    return parseNumericValue(raw);
}

function parseNumericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(String(value ?? "").replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function hasRealTradeEntry(row) {
    return Boolean(row?.entry || row?.fill_time || row?.fillTime || row?.entry_time || row?.entryTime);
}

function ledgerResultBucket(row, rrTarget = 3.3) {
    const outcome = normalizeOutcome(row?.outcome);
    const missedReason = String(row?.missed_reason || row?.missedReason || "").trim();
    const r = numericTradeR(row);
    const target = Number.isFinite(Number(rrTarget)) ? Number(rrTarget) : 3.3;
    if (
        !hasRealTradeEntry(row)
        || row?.missed_trade
        || row?.missedTrade
        || (missedReason && r == null)
        || (r == null && ["SESSION_FILTERED", "UNFILLED", "NEWS_TOUCH_CANCEL", "NEWS_BLACKOUT"].some((key) => outcome.includes(key)))
    ) {
        return "Special / Missed";
    }
    if (!Number.isFinite(r) || Math.abs(r) < 0.005) return "Breakeven / Zero";
    if (r > 0.005 && r < target - 0.05) return "Partial Wins";
    if (r < -0.005 && r > -0.95) return "Partial Losses";
    if (r > 0.005) return "Wins";
    if (r < -0.005) return "Losses";
    return "Special / Missed";
}

function matchesLedgerResultFilter(row, filter, rrTarget = 3.3) {
    const bucket = ledgerResultBucket(row, rrTarget);
    if (filter === "Wins") return bucket === "Wins" || bucket === "Partial Wins";
    if (filter === "Losses") return bucket === "Losses" || bucket === "Partial Losses";
    return bucket === filter;
}

// Canonical Pill tone for the ledger Result column. INVALID_CANCELLED →
// "secondary" (violet PROTECTED), not "warning", so protected rows no longer
// look like errors.
function resultTone(row) {
    return outcomeToneForTrade(row);
}

function sessionFilteredLabel(row) {
    const session = row?.missed_session
        || row?.blocked_session
        || row?.session_filtered_session
        || row?.fillSession
        || row?.fill_session
        || row?.session
        || row?.trade_session
        || row?.entry_session
        || row?.close_breach_session;
    return session && session !== "—" ? `SESSION FILTERED - ${session}` : "SESSION FILTERED";
}

function formatOutcome(row) {
    const outcome = row?.outcome;
    const normalized = normalizeOutcome(outcome);
    if (normalized === "SESSION_FILTERED") return sessionFilteredLabel(row);
    // displayOutcomeLabel handles INVALID / INVALIDATED → PROTECTED ENTRY
    // and leaves WIN / LOSS / NEWS_FLATTEN / UNFILLED untouched.
    return displayOutcomeLabel(outcome, { length: "medium" });
}

function Stat({ label, value, tone }) {
    const color = { primary: "text-[hsl(var(--accent-primary))]", secondary: "text-[hsl(var(--accent-secondary))]", warning: "text-[hsl(var(--warning))]", muted: "text-white" }[tone];
    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2.5 bg-[hsl(var(--panel-2)/0.5)]">
            <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{label}</div>
            <div className={`text-[18px] font-display font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
        </div>
    );
}

const SESSION_COLUMNS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];

function deriveSessionFromTimestamp(value) {
    if (value == null || value === "") return "Unknown";
    const d = new Date(value);
    if (!isFinite(d.getTime())) return "Unknown";
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7) return "Asia";
    if (hour >= 7 && hour < 10) return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

function normalizeSession(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("lull")) return "London Lull";
    if (lower.includes("london")) return "London";
    if (lower.includes("new") || lower === "ny" || lower.includes("nyse")) return "New York";
    if (lower.includes("asia") || lower.includes("tokyo")) return "Asia";
    if (lower.includes("outside")) return "Outside";
    if (lower === "unknown" || lower === "—") return "Unknown";
    return text;
}

function originSessionForTrade(trade) {
    return normalizeSession(trade?.obOriginSession)
        || normalizeSession(trade?.originSession)
        || normalizeSession(trade?.obSession)
        || normalizeSession(trade?.obDirection)
        || normalizeSession(trade?.direction)
        || normalizeSession(trade?.session)
        || "Unknown";
}

function fillSessionForTrade(trade) {
    return normalizeSession(trade?.fillSession)
        || normalizeSession(trade?.fill_session)
        || normalizeSession(trade?.session)
        || normalizeSession(trade?.entrySession)
        || normalizeSession(trade?.entry_session)
        || normalizeSession(trade?.trade_session)
        || deriveSessionFromTimestamp(trade?.entry || trade?.fill_time || trade?.fillTime || trade?.entry_time || trade?.entryTime);
}

// ── Session Split ─────────────────────────────────────────────────────────────
// Static split: groups all run trades by fill session, computes an independent
// cumulative-R curve for each group. Unaffected by the main chart filters.

const SPLIT_SESSION_ORDER = ["Asia", "London", "London Lull", "New York", "Outside"];

function SessionSplit({ trades }) {
    const sessions = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades.filter(isValidExecutedTrade) : [];
        if (!list.length) return [];

        // Group by fill session; "Unknown" → "Unassigned"
        const groups = {};
        list.forEach((trade) => {
            const raw = fillSessionForTrade(trade);
            const key = !raw || raw === "Unknown" ? "Unassigned" : raw;
            if (!groups[key]) groups[key] = [];
            groups[key].push(trade);
        });

        const orderedKeys = [...SPLIT_SESSION_ORDER, "Unassigned"];
        const result = [];

        orderedKeys.forEach((key) => {
            const sessionTrades = groups[key];
            // Skip sessions with no trades; always skip empty Unassigned
            if (!sessionTrades?.length) return;

            let cumR   = 0;
            let peak   = 0;
            let maxDD  = 0;
            let wins   = 0;

            const sparkData = sessionTrades.map((trade) => {
                cumR  += Number(trade.r) || 0;
                const netR = Number(cumR.toFixed(2));
                if (netR > peak) peak = netR;
                const dd = netR - peak;
                if (dd < maxDD) maxDD = dd;
                if (tradeResultSign(trade) > 0) wins++;
                return { v: netR };
            });

            result.push({
                name:     key,
                count:    sessionTrades.length,
                netR:     Number(cumR.toFixed(2)),
                winRate:  Number(((wins / sessionTrades.length) * 100).toFixed(1)),
                maxDD:    Number(maxDD.toFixed(2)),
                sparkData,
            });
        });

        return result;
    }, [trades]);

    // ── Collapse state — default closed, persisted to localStorage ───────────
    const [open, setOpen] = React.useState(() => {
        try {
            const v = localStorage.getItem("fxob_run_detail_session_split_open_v1");
            return v === null ? false : v === "true";
        } catch { return false; }
    });
    const toggle = () =>
        setOpen((v) => {
            const next = !v;
            try { localStorage.setItem("fxob_run_detail_session_split_open_v1", String(next)); } catch {}
            return next;
        });

    if (!sessions.length) {
        return (
            <NeonPanel className="xl:col-span-3" title="Session Split">
                <div className="py-6 text-center font-ui text-[11px] text-muted-lab">
                    No session split data available.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Session Split"
            action={
                <div className="flex items-center gap-2">
                    <Pill tone="muted">UNFILTERED · ALL VARIANT TRADES</Pill>
                    <button
                        type="button"
                        onClick={toggle}
                        className="px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-muted-lab hover:text-white transition-colors"
                    >
                        {open ? "▲ Collapse" : "▼ Expand"}
                    </button>
                </div>
            }
        >
            {open && <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sessions.map((sess) => {
                    const pos       = sess.netR >= 0;
                    const sparkColor = pos ? "hsl(var(--accent-primary))" : "hsl(var(--bear))";
                    const rColor     = pos
                        ? "text-[hsl(var(--accent-primary))]"
                        : "text-[hsl(var(--bear))]";
                    const rLabel = `${sess.netR >= 0 ? "+" : ""}${sess.netR.toFixed(2)}R`;
                    const ddColor = sess.maxDD < -0.005
                        ? "text-[hsl(var(--bear))]"
                        : "text-white";

                    return (
                        <div
                            key={sess.name}
                            className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.5)] clip-bevel-sm p-3 flex flex-col gap-2"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <span className="font-ui text-[10px] uppercase tracking-wider text-muted-lab">
                                    {sess.name}
                                </span>
                                <span className="font-num text-[9px] text-muted-lab">
                                    {sess.count} trade{sess.count !== 1 ? "s" : ""}
                                </span>
                            </div>

                            {/* Net R */}
                            <div className={`font-display text-[22px] font-semibold tabular-nums leading-none ${rColor}`}>
                                {rLabel}
                            </div>

                            {/* Win rate + max DD */}
                            <div className="flex items-center gap-4 font-num text-[10px]">
                                <span className="text-muted-lab">
                                    WR&nbsp;
                                    <span className="text-white">{sess.winRate.toFixed(0)}%</span>
                                </span>
                                <span className="text-muted-lab">
                                    DD&nbsp;
                                    <span className={ddColor}>
                                        {sess.maxDD < -0.005
                                            ? `${sess.maxDD.toFixed(1)}R`
                                            : "—"}
                                    </span>
                                </span>
                            </div>

                            {/* Sparkline */}
                            {sess.sparkData.length > 1 && (
                                <div style={{ width: "100%", height: 52 }}>
                                    <MiniLine data={sess.sparkData} dataKey="v" color={sparkColor} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>}
        </NeonPanel>
    );
}

function SessionMatrix({ trades }) {
    const data = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const rows = [];
        const rowSet = new Set();
        const cells = {};

        list.forEach((trade) => {
            const row = originSessionForTrade(trade);
            const col = fillSessionForTrade(trade);
            const key = `${row}|||${col}`;
            const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
            if (!rowSet.has(row)) {
                rowSet.add(row);
                rows.push(row);
            }
            if (!cells[key]) cells[key] = { netR: 0, count: 0, row, col };
            cells[key].netR += r;
            cells[key].count += 1;
        });

        const entries = Object.values(cells);
        const best = entries.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worst = entries.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const active = entries.reduce((acc, cur) => (!acc || cur.count > acc.count ? cur : acc), null);
        const maxAbs = entries.reduce((m, cur) => Math.max(m, Math.abs(cur.netR)), 0) || 1;
        return { rows: rows.length ? rows : ["Unknown"], cells, best, worst, active, maxAbs, count: list.length };
    }, [trades]);

    const fmtR = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`;
    const pairLabel = (cell) => cell ? `${cell.row} × ${cell.col}` : "—";

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Session Origin × Fill Session (Net R)"
            action={<Pill tone="muted">{data.count} TRADES</Pill>}
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" data-testid="session-matrix-summary">
                <MetricChip label="Best Pair" value={data.best ? fmtR(data.best.netR) : "—"} sub={pairLabel(data.best)} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Pair" value={data.worst ? fmtR(data.worst.netR) : "—"} sub={pairLabel(data.worst)} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Most Active" value={data.active ? `${data.active.count}` : "—"} sub={pairLabel(data.active)} tone="secondary" icon={Activity} />
            </div>

            <div className="overflow-x-auto scrollbar-thin" data-testid="session-matrix">
                <table className="w-full min-w-[720px] text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="font-ui text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Origin / Fill</th>
                            {SESSION_COLUMNS.map((session) => (
                                <th key={session} className="font-ui text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider">{session}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => (
                            <tr key={row}>
                                <td className="font-ui text-muted-lab px-2 py-1 whitespace-nowrap">{row}</td>
                                {SESSION_COLUMNS.map((col) => {
                                    const cell = data.cells[`${row}|||${col}`];
                                    if (!cell) {
                                        return (
                                            <td key={col}>
                                                <div className="font-ui clip-bevel-sm px-2 py-2 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.16 + 0.48 * (Math.abs(cell.netR) / data.maxAbs)).toFixed(3);
                                    const bg = cell.netR >= 0
                                        ? `hsl(var(--accent-primary) / ${alpha})`
                                        : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={col}>
                                            <div className="font-num clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums" style={{ background: bg }}>
                                                <div>{fmtR(cell.netR)}</div>
                                                <div className="text-[9px] text-white/70">{cell.count} trade{cell.count === 1 ? "" : "s"}</div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

// ── Entry Time Heatmap · Day-of-week × Hour-of-day (Net R) ───────────
// Read-only: buckets the run's trades by their entry timestamp's weekday and
// hour, summing Net R per cell. Timestamp-safe (invalid/missing entries are
// skipped) and renders no NaN.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

function TimeOfDayHeatmap({ trades }) {
    const data = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const cells = {};        // `${day}-${hour}` -> { netR, count }
        const dayStats = {};     // day -> { netR, count }
        const hourStats = {};    // hour -> { netR, count }
        const hourCount = {};    // hour -> trade count
        const hourSet = new Set();
        let used = 0, skipped = 0;

        list.forEach((t) => {
            const d = t?.entry != null && t.entry !== "" ? new Date(t.entry) : null;
            if (!d || !isFinite(d.getTime())) { skipped++; return; }
            const day = d.getDay();
            const hour = d.getHours();
            const rv = Number.isFinite(Number(t?.r)) ? Number(t.r) : 0;
            const key = `${day}-${hour}`;
            if (!cells[key]) cells[key] = { netR: 0, count: 0 };
            cells[key].netR += rv;
            cells[key].count += 1;
            if (!dayStats[day]) dayStats[day] = { netR: 0, count: 0, day };
            dayStats[day].netR += rv;
            dayStats[day].count += 1;
            if (!hourStats[hour]) hourStats[hour] = { netR: 0, count: 0, hour };
            hourStats[hour].netR += rv;
            hourStats[hour].count += 1;
            hourSet.add(hour);
            hourCount[hour] = (hourCount[hour] || 0) + 1;
            used += 1;
        });

        const hours = [...hourSet].sort((a, b) => a - b);

        const days = Object.values(dayStats);
        const hourEntries = Object.values(hourStats);
        const bestDay = days.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worstDay = days.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const bestHour = hourEntries.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worstHour = hourEntries.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const activeDay = days.reduce((acc, cur) => (!acc || cur.count > acc.count ? cur : acc), null);
        const populatedSlots = Object.values(cells);
        const profitableSlots = populatedSlots.filter((c) => c.netR > 0).length;
        const profitableSlotPct = populatedSlots.length ? (profitableSlots / populatedSlots.length) * 100 : null;
        const maxAbs = Object.values(cells).reduce((m, v) => Math.max(m, Math.abs(v.netR)), 0) || 1;
        return { cells, hours, bestDay, worstDay, bestHour, worstHour, activeDay, profitableSlotPct, used, skipped, maxAbs };
    }, [trades]);

    const { cells, hours, bestDay, worstDay, bestHour, worstHour, activeDay, profitableSlotPct, used, skipped, maxAbs } = data;
    const fmtHour = (h) => `${String(h).padStart(2, "0")}:00`;
    const fmtR = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`;

    if (!used) {
        return (
            <NeonPanel className="xl:col-span-3" title="Entry Time Heatmap · All Trades by Weekday × Hour">
                <div data-testid="tod-heatmap-empty" className="py-8 text-center text-muted-lab font-ui text-[12px]">
                    No timestamped trades available to build the time-of-day heatmap.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Entry Time Heatmap · All Trades by Weekday × Hour"
            action={<Pill tone="muted">{used} trades{skipped ? ` · ${skipped} undated` : ""}</Pill>}
        >
            <div className="mb-3 text-[11px] font-ui text-muted-lab">
                Aggregates every trade in the selected run by entry weekday and hour.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4" data-testid="tod-summary">
                <MetricChip label="Best Day by Net R"    value={bestDay ? fmtR(bestDay.netR) : "—"}       sub={bestDay ? DOW[bestDay.day] : "—"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Day by Net R"   value={worstDay ? fmtR(worstDay.netR) : "—"}     sub={worstDay ? DOW[worstDay.day] : "—"} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Best Hour by Net R"   value={bestHour ? fmtR(bestHour.netR) : "—"}     sub={bestHour ? fmtHour(bestHour.hour) : "—"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Hour by Net R"  value={worstHour ? fmtR(worstHour.netR) : "—"}   sub={worstHour ? fmtHour(worstHour.hour) : "—"} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Most Active Day"      value={activeDay ? DOW[activeDay.day] : "—"}     sub={activeDay ? `${activeDay.count} trade${activeDay.count === 1 ? "" : "s"}` : "—"} tone="secondary" icon={Activity} />
                <MetricChip label="Profitable Slot %"    value={profitableSlotPct != null ? `${profitableSlotPct.toFixed(1)}%` : "—"} sub="positive Net R cells" tone="secondary" icon={Activity} />
            </div>

            <div className="overflow-x-auto scrollbar-thin" data-testid="tod-heatmap">
                <table className="text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="font-ui text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Day / Hr</th>
                            {hours.map((h) => (
                                <th key={h} className="font-num text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider tabular-nums">{fmtHour(h)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {DOW_ORDER.map((day) => (
                            <tr key={day}>
                                <td className="font-ui text-muted-lab px-2 py-1">{DOW[day]}</td>
                                {hours.map((h) => {
                                    const c = cells[`${day}-${h}`];
                                    if (!c || c.count === 0) {
                                        return (
                                            <td key={h}>
                                                <div className="font-ui clip-bevel-sm px-2 py-1 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.15 + 0.5 * (Math.abs(c.netR) / maxAbs)).toFixed(3);
                                    const bg = c.netR >= 0
                                        ? `hsl(var(--accent-primary) / ${alpha})`
                                        : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={h}>
                                            <div
                                                className="font-num clip-bevel-sm px-2 py-1 text-center text-white tabular-nums"
                                                style={{ background: bg }}
                                                title={`${DOW[day]} ${fmtHour(h)} · ${c.count} trade${c.count === 1 ? "" : "s"}`}
                                            >
                                                {fmtR(c.netR).replace("R", "")}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}
