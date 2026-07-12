import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    Play, RefreshCw, Copy, ChevronDown, ChevronUp, AlertTriangle,
    Database, Bell, Shield, Target, MousePointerClick, Settings as SettingsIcon,
    CalendarRange, Crosshair, ExternalLink, CheckCircle2, Loader2, XCircle,
    FolderInput, ClipboardCopy, Eraser, Ban, FolderOpen, Download,
} from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { NeonInput, NeonSelect, NeonToggle, Segment, Field, NeonButton } from "@/components/lab/controls";
import { NeonDatePicker } from "@/components/lab/NeonDatePicker";
import SessionStrategyGrid from "@/components/lab/sessionStrategy/SessionStrategyGrid";
import { DEFAULT_SESSION_STRATEGY, summarizeEnabledCohorts } from "@/data/sessionStrategyEdits";
import { SESSIONS, CELLS } from "@/data/cohortKeys";
import { attachSessionStrategy } from "@/data/sessionScenarioConfig";
import { buildBacktesterConfig, BE_ARM_LEVEL_CHOICES } from "@/data/configTranslator";
import { defaultsForGroup } from "@/data/configRegistry";
import { deriveRunName, shortPolicyVersion } from "@/data/runs/scenarioPresentation";
import { DATA_RANGES, DATA_RANGE_ORDER, resolveDataRangeKey, dataRangePatch, dataRangeBounds, dataRangeContext, unionBounds, candleFileForStart, resolveFullHistory, preLaunchDateSummary, fileBounds } from "@/data/dataRanges";
import deployedPolicyDoc from "@/data/deployedPolicy.v1.json";
import { MarketStateControls, regimeFilterInvalid } from "@/components/lab/marketState/MarketStateControls";
import PortfolioManagerControls from "@/components/lab/portfolio/PortfolioManagerControls";
import DraftsPanel from "@/components/lab/portfolio/DraftsPanel";
import IncludeDisabledOverride from "@/components/lab/portfolio/IncludeDisabledOverride";
import BestValidatedConfig from "@/components/lab/portfolio/BestValidatedConfig";
import MarketStateTargetOverrides from "@/components/lab/portfolio/MarketStateTargetOverrides";
import TradeEligibility from "@/components/lab/portfolio/TradeEligibility";
import ResolvedRunSummary from "@/components/lab/portfolio/ResolvedRunSummary";
import RecommendedStackStrip from "@/components/lab/portfolio/RecommendedStackStrip";
import { startSidecarRun, getSidecarRun, getSidecarRunBundle, getResultBundleByRunId, revealSidecarRun, cancelSidecarRun, getRunFileByRunId, getMarketDataStatus } from "@/data/sidecarClient";
import { ingestRunBundle } from "@/data/importer";
import { addRunBundle } from "@/data/store";

// ─────────────────────────────────────────────────────────────────────────────────
// Strategy Builder V2 — a NEW, layout-first page that presents the existing builder
// state as ① Backtest Setup → ② Global Strategy → ③ Session Strategy. Reuses the v1
// Session Strategy grid + reducers + compiler + config translator + sidecar client.
// It does NOT modify the old /strategy page, backend, payloads, or run logic.
// ─────────────────────────────────────────────────────────────────────────────────

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "EURJPY", "GBPJPY"];
const ENTRY_MODELS = [
    { value: "baseline", label: "Baseline" },
    { value: "entry_penetration", label: "Penetration" },
    { value: "triggered_edge", label: "Triggered Edge" },
];

// Comprehensive default cfg (UI state) so buildBacktesterConfig produces a valid payload.
const DEFAULT_CFG = {
    symbol: "EURUSD", detectionTf: "M15", executionTf: "1m",
    dateFrom: "2020-01-02", dateTo: "2025-05-18", dataFile: "data/candles/EURUSD_1m.csv",
    swing: 50, obFilter: "ATR", minObSizePips: 0, maxObSizePips: 100,
    structure: "Both", direction: "Both",
    bosLong: true, bosShort: true, chochLong: true, chochShort: true,
    rr: 2, obEntryDepthPct: 0, entryBuffer: 0.0, stopBuffer: 1, verifyTicks: 0,
    executionMode: "multi_position", conflict: "Allow Auto Reversal", cancelAction: "Kill OB",
    sessionFilter: false, london: true, lull: true, newYork: true, asia: true, outside: true,
    originSession: "Any", detectionSession: "Any",
    newsBlackout: true, newsFile: "data/news/master_economic_calendar_2020_present.csv",
    newsBlackoutBefore: 5, newsBlackoutAfter: 5, newsBlackoutImpacts: ["high"], newsBlackoutCurrencies: [],
    newsPausePending: true, newsBlockFills: true, newsCancelIfTouched: true,
    newsFlattenActiveTrades: true, newsFlattenMinutesBefore: 5,
    spread: 0.2, slippage: 0.2, commission: 0,
    entryResearchExportMode: "light",
    entryPenetrationThresholds: "25", useBatchedEntryPenetration: true,
    triggeredEdgeEntries: false, triggeredEdgeThresholds: "25", triggeredEdgeEntryLevelPct: 0,
    triggeredEdgeSameCandleMode: "both", triggeredEdgeDelays: [0, 1],
    entryMode: "single", selectedEntryModel: "triggered_edge",
    singlePenetrationPct: 25, singleTriggeredEdgeThreshold: 25, singleTriggeredEdgeThresholds: [25],
    triggeredEdgeCancelOnRetrace: false, triggeredEdgeCancelRetracePips: 0, triggeredEdgeCancelRetraceObPct: 0,
    triggeredEdgeCancelOnFirstFailedTag: false, triggeredEdgeFftMoveAwayPips: 0, triggeredEdgeFftMoveAwayObMultiple: 0, triggeredEdgeFftMinObWidthPips: 0,
    entryResearchExports: false,
    directionalEntryMode: "symmetric",
    longEntryEnabled: true, longEntryModel: "triggered_edge", longTriggeredEdgeThreshold: 25, longTriggeredEdgeDelays: [0, 1],
    shortEntryEnabled: true, shortEntryModel: "triggered_edge", shortTriggeredEdgeThreshold: 25, shortTriggeredEdgeDelays: [0, 1],
    monteCarlo: false, parallelScenarios: true, maxWorkers: 0,
    beEnabled: true, beArmLevels: [0.5, 1], beTriggerBases: ["wick"], beDelayCandles: 0, beVariants: "all",
    variantMode: "all",
    // Market State / Regime Gate defaults — sourced from CONFIG_REGISTRY (single
    // source of truth), all off by default so existing runs are byte-identical.
    ...defaultsForGroup("regime"),
    // Portfolio Manager defaults — sourced from CONFIG_REGISTRY. Registry default is
    // OFF (safe/legacy); a BRAND-NEW config is nudged ON below (recommended layer),
    // while any persisted config keeps its saved value (never silently changed).
    ...defaultsForGroup("portfolio"),
};

// Short entry-model token for run names: TE / PEN / BASE.
const ENTRY_MODEL_ABBR = { triggered_edge: "TE", entry_penetration: "PEN", baseline: "BASE" };
// Suggested run name: <SYMBOL>_<DETECTION_TF>_<ENTRY_MODEL>_<RR>R_<FROM>_to_<TO>
// e.g. EURUSD_M15_TE_2R_2020-01-02_to_2025-05-18
export function buildSuggestedRunName(cfg) {
    if (!cfg) return "";
    const sym = cfg.symbol || "";
    const tf = cfg.detectionTf || "";
    const model = ENTRY_MODEL_ABBR[cfg.selectedEntryModel] || "BASE";
    const rr = (cfg.rr || cfg.rr === 0) ? `${cfg.rr}R` : "";
    const from = (cfg.dateFrom || "").slice(0, 10);
    const to = (cfg.dateTo || "").slice(0, 10);
    const range = from && to ? `${from}_to_${to}` : (from || to || "");
    return [sym, tf, model, rr, range].filter(Boolean).join("_");
}

// ── V2 page persistence ───────────────────────────────────────────────────────────
// Versioned, V2-specific localStorage key. Independent of the OLD session-profile
// store (the deprecated session-profiles key), which V2 never reads or writes.
// Invalid/older payloads fail safe to defaults (loadPersistedV2 returns null and the
// page seeds from DEFAULT_*).
export const V2_STORAGE_KEY = "fxob_strategy_builder_v2_state";
export const V2_STORAGE_VERSION = 1;
export function loadPersistedV2() {
    try {
        if (typeof window === "undefined" || !window.localStorage) return null;
        const raw = window.localStorage.getItem(V2_STORAGE_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (!p || p.version !== V2_STORAGE_VERSION || typeof p.cfg !== "object" || typeof p.sessionStrategy !== "object") return null;
        return p;
    } catch { return null; }
}
export function clearPersistedV2() {
    try { window.localStorage?.removeItem(V2_STORAGE_KEY); } catch { /* noop */ }
}
const DEFAULT_GRID_UI = { defaultsOpen: false, baselineOpen: false, overridesOpen: true, openSessions: {} };

// ── Sidecar run status helpers ──────────────────────────────────────────────────────
// Terminal sidecar statuses (poll stops here). "succeeded" is normalised to completed by
// the sidecar; we accept both. "queued" / "running" / "starting" / "stalled" keep polling.
export const TERMINAL_STATUSES = new Set(["completed", "succeeded", "failed", "cancelled", "canceled"]);
export const isTerminalStatus = (s) => TERMINAL_STATUSES.has(String(s || "").toLowerCase());
export const isFailureStatus = (s) => ["failed", "cancelled", "canceled"].includes(String(s || "").toLowerCase());
export const isSuccessStatus = (s) => ["completed", "succeeded"].includes(String(s || "").toLowerCase());

export function formatSidecarError(e) {
    if (!e) return "Unknown error.";
    if (e.status === 413) return "Result bundle is too large for browser one-click import (heavy result files). Core results are still importable from the run folder.";
    return e.message || String(e);
}
// Slim, persistable view of the polled sidecar job (no stdout/progress payloads).
export function slimJob(j) {
    if (!j || !j.job_id) return null;
    const { job_id, run_id, status, output_folder, started_at, finished_at, display_name, name, startedAt } = j;
    return { job_id, run_id, status, output_folder, started_at, finished_at, display_name, name, startedAt };
}
function firstIngestError(result) {
    const msgs = [
        ...((result?.validationErrors || []).map((x) => x.message || String(x))),
        ...((result?.errors || []).map((x) => x.error || String(x))),
    ].filter(Boolean);
    return msgs[0] || "";
}
// Honest progress from the sidecar job_response. The percentage is driven by COMPLETED
// scenario passes (`completed_passes`), NOT `current_index`: in parallel mode current_index
// stays pinned (it marks one queued scenario) while completed_passes climbs as workers finish
// — so current_index showed a stuck "1/25 · 4%" for the whole run. completed/total is the real
// fraction. Also surfaces worker status + ETA, all of which the backend already emits.
export function deriveProgress(job) {
    if (!job) return null;
    const p = (job && job.progress) || job || {};
    const total = Number(p.total_passes ?? job.total_passes ?? p.total_scenarios);
    // Prefer completed_passes (correct for both serial and parallel); fall back to
    // current_index only when completed_passes is genuinely absent.
    const done = Number(p.completed_passes ?? p.completed ?? job.completed_passes);
    const idx = Number(p.current_index ?? job.current_index);
    const count = Number.isFinite(done) ? done : (Number.isFinite(idx) ? idx : NaN);
    const stage = p.current_label || job.current_label || p.current_kind || job.current_kind || job.current_symbol || "";
    const stageLabel = p.stage_label || job.stage_label || "";
    const running = Number(p.running);
    const queued = Number(p.queued);
    const workers = Array.isArray(p.workers) ? p.workers : null;
    const elapsedS = Number(p.elapsed_seconds ?? job.elapsed_seconds);
    const etaS = Number(p.eta_seconds ?? job.eta_seconds);
    const base = {
        stage, stageLabel,
        running: Number.isFinite(running) ? running : null,
        queued: Number.isFinite(queued) ? queued : null,
        workers: workers && workers.length ? workers : null,
        elapsed: Number.isFinite(elapsedS) && elapsedS >= 0 ? formatSeconds(elapsedS) : null,
        eta: Number.isFinite(etaS) && etaS > 0 ? formatSeconds(etaS) : null,
    };
    if (Number.isFinite(total) && total > 0 && Number.isFinite(count) && count >= 0) {
        return { ...base, idx: count, total, pct: Math.max(0, Math.min(100, Math.round((count / total) * 100))) };
    }
    if (stage || stageLabel || base.elapsed) return { ...base, idx: null, total: null, pct: null };
    return null;
}

// Pure: "Xm Ys" / "Xs" from a seconds count; null when not a finite non-negative number.
export function formatSeconds(s) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    const r = Math.round(n);
    return r < 60 ? `${r}s` : `${Math.floor(r / 60)}m ${r % 60}s`;
}

// Entry-model display labels (for the run-plan breakdown).
const ENTRY_MODEL_LABEL = { triggered_edge: "Triggered Edge", entry_penetration: "Penetration", baseline: "Baseline" };

// Pure: the list of entry variants a cfg will generate. Shared by the live "Variants
// that will be generated" preview AND the post-run "What was run" snapshot.
export function computeVariantLines(cfg) {
    if (!cfg) return [];
    const teThr = cfg.singleTriggeredEdgeThresholds || [];
    const teArms = (Array.isArray(cfg.triggeredEdgeDelays) && cfg.triggeredEdgeDelays.length) ? cfg.triggeredEdgeDelays : [0];
    const penThr = String(cfg.entryPenetrationThresholds || "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0 && n < 100);
    if (cfg.selectedEntryModel === "baseline") return ["Baseline only — no penetration threshold."];
    if (cfg.selectedEntryModel === "triggered_edge") {
        const out = [];
        for (const t of teThr) for (const a of teArms) out.push(`Triggered Edge ${t}% · C${a}`);
        return out.length ? out : ["Select at least one threshold and one arm candle."];
    }
    return ["Baseline (always run in a penetration sweep)", ...penThr.map((t) => `Penetration ${t}%`)];
}

// Pure: human "what was run" lines for the Global Strategy block, derived from the
// SUBMITTED cfg snapshot (never the live, possibly-edited cfg).
export function globalStrategyLines(cfg) {
    if (!cfg) return [];
    const be = cfg.beEnabled
        ? `${(cfg.beTriggerBases && cfg.beTriggerBases[0]) === "close" ? "Close" : "Wick"} at ${(cfg.beArmLevels || []).map((r) => `${r}R`).join(" / ") || "—"}`
        : "None";
    const news = cfg.newsBlackout ? `${cfg.newsBlackoutBefore ?? "?"}m before / ${cfg.newsBlackoutAfter ?? "?"}m after` : "Off";
    return [
        ["Entry model", ENTRY_MODEL_LABEL[cfg.selectedEntryModel] || cfg.selectedEntryModel || "—"],
        ["Direction", cfg.direction || "—"],
        ["Target", (cfg.rr || cfg.rr === 0) ? `${cfg.rr}R` : "—"],
        ["Break-even", be],
        ["Stop buffer", `${cfg.stopBuffer ?? "—"} pip`],
        ["News blackout", news],
        ["Costs", `spread ${cfg.spread ?? "—"} · slippage ${cfg.slippage ?? "—"} · commission ${cfg.commission ?? "—"}`],
    ];
}

// Pure: split sessions into those with active overrides (enabled session AND enabled
// cohort) and the "no override" remainder (with off-flag), from a sessionStrategy snapshot.
export function sessionPlan(sessionStrategy) {
    const enabled = (sessionStrategy && sessionStrategy.enabled) ? summarizeEnabledCohorts(sessionStrategy) : [];
    const enabledKeys = new Set(enabled.map((s) => s.sessionKey));
    const sessionsCfg = (sessionStrategy && sessionStrategy.sessions) || {};
    const noOverride = SESSIONS
        .filter((s) => !enabledKeys.has(s.key))
        .map((s) => ({ key: s.key, label: s.label, off: sessionsCfg[s.key]?.enabled === false }));
    return { enabled, noOverride };
}

// Pure: "Xm Ys" elapsed from two ISO timestamps; null when either is missing.
export function formatElapsed(startISO, endISO) {
    if (!startISO || !endISO) return null;
    const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Pure: grouped variant structure — arms grouped UNDER each threshold (execution-tree
// presentation). TE → [{threshold, arms:[...]}]; Penetration → [{threshold}]; Baseline → [].
export function computeVariantGroups(cfg) {
    if (!cfg) return { kind: "baseline", baseline: true, groups: [] };
    if (cfg.selectedEntryModel === "triggered_edge") {
        const thr = [...new Set((cfg.singleTriggeredEdgeThresholds || []).map(Number))].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
        const arms = [...new Set(((Array.isArray(cfg.triggeredEdgeDelays) && cfg.triggeredEdgeDelays.length) ? cfg.triggeredEdgeDelays : [0]).map(Number))].sort((a, b) => a - b);
        return { kind: "triggered_edge", baseline: true, groups: thr.map((t) => ({ threshold: t, arms })) };
    }
    if (cfg.selectedEntryModel === "entry_penetration") {
        const pens = [...new Set(String(cfg.entryPenetrationThresholds || "").split(",").map((s) => Number(s.trim())))].filter((n) => Number.isFinite(n) && n > 0 && n < 100).sort((a, b) => a - b);
        return { kind: "entry_penetration", baseline: true, groups: pens.map((t) => ({ threshold: t })) };
    }
    return { kind: "baseline", baseline: true, groups: [] };
}

// Pure: number of ENTRY variant files a cfg generates (baseline + entry variants).
export function countEntryVariants(cfg) {
    const g = computeVariantGroups(cfg);
    if (g.kind === "triggered_edge") return 1 + g.groups.reduce((n, x) => n + (x.arms ? x.arms.length : 0), 0);
    if (g.kind === "entry_penetration") return 1 + g.groups.length;
    return 1; // baseline only
}

// Pure: pre-run "what this run will generate" breakdown. entry = TE×arms or penetration
// count; session = enabled cohort count; total = entry + session (excludes the baseline /
// fair-baseline FLAGS, which are shown as ✓/✗).
export function expectedVariants(cfg, sessionStrategy) {
    const g = computeVariantGroups(cfg);
    const entryCount = g.kind === "triggered_edge"
        ? g.groups.reduce((n, x) => n + (x.arms ? x.arms.length : 0), 0)
        : g.kind === "entry_penetration" ? g.groups.length : 0;
    const enabled = (sessionStrategy && sessionStrategy.enabled) ? summarizeEnabledCohorts(sessionStrategy) : [];
    const sessionCount = enabled.reduce((n, s) => n + s.cohorts.length, 0);
    return {
        kind: g.kind,
        baseline: true,
        fairBaseline: !!(sessionStrategy && sessionStrategy.enabled && sessionStrategy.baseline && sessionStrategy.baseline.enabled),
        entryCount, sessionCount,
        total: entryCount + sessionCount,
        entryFiles: countEntryVariants(cfg), // baseline + entry → comparable to generated file count
    };
}

// Pure: short deterministic fingerprint of the submitted payload (FNV-1a → 6 hex,
// uppercase). Key order is normalised so two equal payloads always hash the same.
function stableStringify(v) {
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
    if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",")}}`;
    return JSON.stringify(v);
}
export function payloadHash(payload) {
    if (!payload) return "";
    const str = stableStringify(payload);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).toUpperCase().padStart(6, "0").slice(-6);
}

// Pure: split a RAW cohort setup into overrides (explicitly set on the cohort) vs inherited
// (falls through to Session Defaults). Dim keys: target/be/riskReduction/riskAmount.
const COHORT_DIM_LABEL = { target: "Target RR", be: "Break-even", riskReduction: "Reduce Risk", riskAmount: "Risk Amount" };
export function cohortOverrideInherited(setup) {
    const s = setup || {};
    const overrides = [];
    const inherited = [];
    for (const k of ["target", "be", "riskReduction", "riskAmount"]) {
        (s[k] != null ? overrides : inherited).push(COHORT_DIM_LABEL[k]);
    }
    return { overrides, inherited };
}

// Pure: enabled cohorts joined to their RAW override/inherited split (label→cellKey via CELLS),
// plus the no-override session list. Used by the execution-tree + copy-config.
const _LABEL_TO_CELL = Object.fromEntries(CELLS.map((c) => [c.label, c.key]));
export function sessionPlanDetailed(sessionStrategy) {
    const enabledSummary = (sessionStrategy && sessionStrategy.enabled) ? summarizeEnabledCohorts(sessionStrategy) : [];
    const sessionsCfg = (sessionStrategy && sessionStrategy.sessions) || {};
    const enabled = enabledSummary.map((s) => ({
        sessionKey: s.sessionKey,
        sessionLabel: s.sessionLabel,
        cohorts: s.cohorts.map((c) => {
            const cellKey = _LABEL_TO_CELL[c.label];
            const setup = sessionsCfg[s.sessionKey]?.setups?.[cellKey];
            return { ...c, ...cohortOverrideInherited(setup) };
        }),
    }));
    const enabledKeys = new Set(enabled.map((s) => s.sessionKey));
    const noOverride = SESSIONS.filter((s) => !enabledKeys.has(s.key)).map((s) => ({ key: s.key, label: s.label, off: sessionsCfg[s.key]?.enabled === false }));
    return { enabled, noOverride };
}

// Pure: clean, human-readable run configuration text for Copy / sharing / debugging.
export function copyRunConfigText(snapshot) {
    if (!snapshot) return "";
    const { cfg, sessionStrategy, runName, payload } = snapshot;
    const L = [];
    L.push(`RUN CONFIGURATION  (config ${payloadHash(payload)})`);
    if (runName) L.push(`Run name: ${runName}`);
    L.push("");
    L.push("GLOBAL STRATEGY");
    for (const [k, v] of globalStrategyLines(cfg)) L.push(`  ${k}: ${v}`);
    const g = computeVariantGroups(cfg);
    L.push("  Variants:");
    if (g.kind === "triggered_edge") for (const grp of g.groups) L.push(`    TE ${grp.threshold}% → ${grp.arms.map((a) => `C${a}`).join(", ")}`);
    else if (g.kind === "entry_penetration") { L.push("    Baseline"); for (const grp of g.groups) L.push(`    Penetration ${grp.threshold}%`); }
    else L.push("    Baseline only");
    L.push("");
    L.push("FAIR BASELINE");
    if (payload && payload.baseline_comparison) {
        const bc = payload.baseline_comparison;
        L.push("  Entry: Baseline");
        L.push(`  Target: ${bc.target?.rr != null ? `${bc.target.rr}R` : "—"}`);
        L.push(`  Break-even: ${bc.be ? `${bc.be.trigger} ${bc.be.arm_r}R` : "None"}`);
        L.push("  Universe: same enabled session cohorts");
    } else { L.push("  Not enabled."); }
    L.push("");
    L.push("SESSION STRATEGY");
    const plan = sessionPlanDetailed(sessionStrategy);
    if (plan.enabled.length === 0) L.push("  No session overrides — all cohorts run the global strategy.");
    for (const s of plan.enabled) {
        L.push(`  ${s.sessionLabel}`);
        for (const c of s.cohorts) {
            L.push(`    ${c.label}: ${c.text}`);
            L.push(`      Overrides: ${c.overrides.length ? c.overrides.join(", ") : "none"}`);
            L.push(`      Inherited: ${c.inherited.length ? c.inherited.join(", ") : "none"}`);
        }
    }
    if (plan.noOverride.length) L.push(`  No overrides: ${plan.noOverride.map((n) => n.label + (n.off ? " (off)" : "")).join(", ")}`);
    return L.join("\n");
}

const TP_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
const TE_THRESHOLDS = [10, 25, 50, 75];          // triggered-edge trigger thresholds (%)
const TE_ARMS = [0, 10, 20, 30, 40, 50];          // arm candles C0..C50 (cfg.triggeredEdgeDelays)
const PEN_THRESHOLDS = [10, 25, 50, 75];          // penetration thresholds (%)

const toggleNum = (arr, v) => { const s = new Set((arr || []).map(Number)); const n = Number(v); s.has(n) ? s.delete(n) : s.add(n); return [...s].sort((a, b) => a - b); };
const parsePen = (csv) => String(csv || "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0 && n < 100);
const joinPen = (arr) => [...new Set(arr.map(Number))].filter((n) => n > 0 && n < 100).sort((a, b) => a - b).join(",");

// Multi-select chip row (equal-width). values is an array of selected choices.
function Chips({ choices, values, onToggle, fmt }) {
    const vals = (values || []).map(Number);
    return (
        <div className="flex flex-wrap gap-2">
            {choices.map((c) => {
                const on = vals.includes(Number(c));
                return (
                    <button key={String(c)} type="button" onClick={() => onToggle(c)}
                        className={["min-w-[3.4rem] text-center text-[12.5px] py-1.5 px-2 clip-bevel-sm border transition-colors",
                            on ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))]"
                                : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"].join(" ")}>
                        {fmt ? fmt(c) : c}
                    </button>
                );
            })}
        </div>
    );
}

// Preset chips + a "+ Add…" popover for any custom integer in [min, max]. Used for both
// trigger/penetration thresholds (min 1, max 99, unit "%") AND arm candles (min 0, prefix
// "C"). Avoids rendering a long preset wall. Custom values appear as chips alongside the
// presets. `values`/`onChange` work on a numeric array; the added value is what the backtest
// runs (it flows straight to triggered_edge_trigger_thresholds / _candle_delays).
function ThresholdChips({ presets, values, onChange, min = 1, max = 99, prefix = "", unit = "%", label = "value", testId }) {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const vals = (values || []).map(Number);
    const all = [...new Set([...(presets || []).map(Number), ...vals])].sort((a, b) => a - b);
    const toggle = (v) => { const s = new Set(vals); s.has(v) ? s.delete(v) : s.add(v); onChange([...s].sort((a, b) => a - b)); };
    const valid = (() => { if (draft === "") return false; const n = Number(draft); return Number.isInteger(n) && n >= min && n <= max; })();
    const confirmAdd = () => {
        if (draft === "") return;
        const n = Number(draft);
        if (!Number.isInteger(n) || n < min || n > max) return;
        if (!vals.includes(n)) onChange([...vals, n].sort((a, b) => a - b));
        setDraft(""); setAdding(false);
    };
    return (
        <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
            {all.map((c) => {
                const on = vals.includes(c);
                return (
                    <button key={c} type="button" onClick={() => toggle(c)}
                        className={["min-w-[3.4rem] text-center text-[12.5px] py-1.5 px-2 clip-bevel-sm border transition-colors",
                            on ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))]"
                                : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"].join(" ")}>{prefix}{c}{unit}</button>
                );
            })}
            <div className="relative">
                <button type="button" onClick={() => setAdding((a) => !a)} data-testid={testId ? `${testId}-add` : undefined}
                    className="text-[12px] py-1.5 px-2.5 clip-bevel-sm border border-dashed border-[hsl(var(--border-mid))] text-muted-lab hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]">+ Add…</button>
                {adding && (
                    <div className="absolute left-0 z-30 mt-1 w-44 p-2.5 clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel))] shadow-[0_10px_34px_-6px_rgba(0,0,0,0.85)]">
                        <div className="text-[10px] uppercase tracking-wide text-muted-lab mb-1.5">Custom {label}</div>
                        <div className="flex items-center gap-1.5">
                            <input type="number" min={min} max={max} value={draft} autoFocus placeholder={`${min}–${max}`}
                                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") setAdding(false); }}
                                className="w-20 px-2 py-1 text-[12px] bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] clip-bevel-sm outline-none focus:border-[hsl(var(--accent-primary))]" />
                            <button type="button" onClick={confirmAdd} disabled={!valid}
                                className="text-[12px] px-2 py-1 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] disabled:opacity-40 hover:bg-[hsl(var(--accent-primary)/0.12)]">Add</button>
                        </div>
                        <div className="text-[10px] text-muted-lab mt-1.5">Integer between {min} and {max}.</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Grouped variant view (execution-tree): arms grouped UNDER each threshold.
function VariantGroupView({ cfg }) {
    const g = computeVariantGroups(cfg);
    if (g.kind === "baseline") return <div className="text-[11.5px] text-muted-lab">Baseline only — no entry variants.</div>;
    if (g.kind === "triggered_edge") {
        if (!g.groups.length) return <div className="text-[11.5px] text-muted-lab">Select at least one threshold and one arm candle.</div>;
        return (
            <ul className="flex flex-col gap-1.5 text-[11.5px] tabular-nums" data-testid="variant-groups">
                {g.groups.map((grp) => (
                    <li key={grp.threshold} className="leading-snug">
                        <span className="text-[hsl(var(--accent-primary))] font-medium">TE {grp.threshold}%</span>
                        <span className="text-muted-lab"> → </span>
                        <span className="text-[hsl(var(--text-2))]">{grp.arms.map((a) => `C${a}`).join(", ")}</span>
                    </li>
                ))}
            </ul>
        );
    }
    return (
        <ul className="flex flex-col gap-1.5 text-[11.5px]" data-testid="variant-groups">
            <li className="text-[hsl(var(--text-2))]">Baseline</li>
            {g.groups.map((grp) => (
                <li key={grp.threshold}><span className="text-[hsl(var(--accent-primary))] font-medium">Penetration {grp.threshold}%</span></li>
            ))}
        </ul>
    );
}

// ── small presentational helpers ─────────────────────────────────────────────────
function SectionShell({ n, title, question, scope, active, onActivate, children, collapsible = false, defaultOpen, chips }) {
    // Collapsible sections show concise summary CHIPS when collapsed (UX polish Part 1).
    const [open, setOpen] = React.useState(collapsible ? Boolean(defaultOpen) : true);
    return (
        <section
            onFocusCapture={onActivate} onMouseDownCapture={onActivate}
            className={[
                // Transparent section base so the global blueprint grid shows through the body.
                "border clip-bevel rounded-sm transition-all",
                active
                    ? "border-[hsl(var(--accent-primary)/0.7)]"
                    : "border-[hsl(var(--border-soft)/0.7)]",
            ].join(" ")}
        >
            {/* Header stays fully opaque */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel))]">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))] text-[15px] font-semibold">{n}</span>
                    <div>
                        <div className="text-[16px] font-semibold text-[hsl(var(--accent-primary))] leading-tight uppercase tracking-wide">{title}</div>
                        {question && <div className="text-[12.5px] text-white mt-0.5">{question}</div>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* collapsed ⇒ concise summary chips instead of the full body */}
                    {collapsible && !open && Array.isArray(chips) && chips.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 justify-end max-w-[560px]" data-testid={`section-chips-${n}`}>
                            {chips.filter(Boolean).map((c, i) => (
                                <span key={i} className="rounded border border-[hsl(var(--border-mid))] px-2 py-0.5 text-[11px] font-ui text-[hsl(var(--text-2))] whitespace-nowrap">{c}</span>
                            ))}
                        </div>
                    )}
                    {(!collapsible || open) && scope && <div className="text-[11.5px] text-muted-lab text-right max-w-[260px]">{scope}</div>}
                    {collapsible && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                            aria-expanded={open}
                            className="rounded border border-[hsl(var(--border-mid))] px-2 py-1 text-[11px] font-ui text-[hsl(var(--text-2))]"
                            data-testid={`section-toggle-${n}`}>
                            {open ? "▴" : "▾"}
                        </button>
                    )}
                </div>
            </div>
            {/* Body slightly transparent — blueprint grid reads through behind the opaque inner cards */}
            {(!collapsible || open) && <div className="p-6 flex flex-col gap-5 bg-[hsl(var(--panel)/0.35)]">{children}</div>}
        </section>
    );
}

// Shared single-active-card focus. The page root clears it (capture phase fires the
// ancestor first), then the clicked Card re-sets it — so exactly one card is highlighted
// and clicking anywhere outside a card turns it off.
const CardFocusCtx = React.createContext(null);

function Card({ icon: Icon, title, children, className = "" }) {
    const id = React.useId();
    const ctx = React.useContext(CardFocusCtx);
    const active = ctx?.activeId === id;
    const activate = () => ctx?.setActiveId(id);
    return (
        <div
            onFocusCapture={activate}
            onMouseDownCapture={activate}
            className={[
                "border bg-[hsl(var(--panel-2))] clip-bevel-sm p-4 transition-all",
                active
                    ? "border-[hsl(var(--accent-primary)/0.7)]"
                    : "border-[hsl(var(--border-soft)/0.6)]",
                className,
            ].join(" ")}
        >
            {title && (
                <div className="flex items-center gap-2 mb-3">
                    {Icon && <Icon className="w-4 h-4 text-[hsl(var(--accent-primary))]" />}
                    <span className="text-[13px] font-semibold text-[hsl(var(--accent-primary))] uppercase tracking-wide">{title}</span>
                </div>
            )}
            {children}
        </div>
    );
}

// Collapsible global Break-even / Reduce-Risk control (display reveal).
function GlobalReveal({ label, on, onToggle, children }) {
    return (
        <div className="border border-[hsl(var(--border-soft)/0.6)] clip-bevel-sm p-3">
            <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[hsl(var(--text-2))]">{label}</span>
                <NeonToggle checked={on} onChange={onToggle} />
            </div>
            {on && <div className="mt-3">{children}</div>}
        </div>
    );
}

export default function StrategyBuilderV2() {
    const persisted = useMemo(loadPersistedV2, []);
    const [cfg, setCfg] = useState(() => {
        const base = { ...DEFAULT_CFG, ...(persisted?.cfg || {}) };
        // Portfolio Manager is the recommended filter layer: default ON for a BRAND-NEW
        // config only. A persisted config that predates PM (no portfolioEnabled key) keeps
        // its legacy behaviour (PM OFF) — never silently changed on reload.
        if (!persisted?.cfg) base.portfolioEnabled = true;
        // Global Market State gate is legacy/advanced and OFF in the recommended stack.
        // Always start the builder draft with EVERY aspect of it OFF (master gate + EMA /
        // BBW / ADX enables + label mode), even if a previous draft had it on. Numeric
        // parameters are kept so re-enabling it for research restores sensible values.
        base.regimeEnabled = false;
        base.regimeMode = "label";
        base.emaEnabled = false;
        base.bbwEnabled = false;
        base.adxEnabled = false;
        return base;
    });
    const [sessionStrategy, setSessionStrategy] = useState(() => persisted?.sessionStrategy || { ...DEFAULT_SESSION_STRATEGY });
    // runName is now an OPTIONAL manual nickname/override (empty ⇒ use the auto name).
    // The canonical auto name is always derived live from the config, so the nickname
    // never replaces or destroys the canonical metadata.
    const [runName, setRunName] = useState(() => (persisted?.runName != null ? persisted.runName : ""));
    const [runNameDirty, setRunNameDirty] = useState(() => !!persisted?.runNameDirty); // legacy persistence key (unused for auto-sync)
    const [gridUi, setGridUi] = useState(() => ({ ...DEFAULT_GRID_UI, ...(persisted?.gridUi || {}) }));
    const [showLegacy, setShowLegacy] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    // Trade Policy working-area tab (Eligibility / Targets / Drafts / Summary).
    const [policyTab, setPolicyTab] = useState("eligibility");

    const [runMsg, setRunMsg] = useState("");
    const [beOn, setBeOn] = useState(false);
    const [rrOn, setRrOn] = useState(false);
    const [activeSection, setActiveSection] = useState(1);   // focus/click highlight
    // Last-run state is restored from persistence so leaving / returning to V2 keeps the
    // Current Run panel (resume polling, import actions, or Open Workspace as appropriate).
    const lastRun = persisted?.lastRun || null;
    const [runJob, setRunJob] = useState(() => lastRun?.job || null);  // merged sidecar job (slim when restored)
    const [running, setRunning] = useState(false);           // submit in flight
    const [runError, setRunError] = useState("");            // polling/transport error (non-terminal)
    const [importedRunId, setImportedRunId] = useState(() => lastRun?.importedRunId || "");  // frontend store run id once imported
    const [importBusy, setImportBusy] = useState(false);
    const [importError, setImportError] = useState(() => lastRun?.importError || "");
    const [importTooLarge, setImportTooLarge] = useState(() => !!lastRun?.importTooLarge);   // result-bundle 413 → folder-import fallback
    const [cancelling, setCancelling] = useState(false);
    const [completionStats, setCompletionStats] = useState(null); // pre-import stats from summary.json
    const importTriggeredRef = useRef(!!lastRun?.importedRunId);   // already imported → don't re-import on reload
    const [runSnapshot, setRunSnapshot] = useState(() => lastRun?.snapshot || null);  // { cfg, sessionStrategy, runName, payload } frozen at submit
    const [importStats, setImportStats] = useState(() => lastRun?.importStats || null);  // derived counts from the imported bundle
    const folderInputRef = useRef(null);                     // webkitdirectory picker for folder import
    const [whatRunOpen, setWhatRunOpen] = useState(false);   // "What was run" collapse
    const [showVariants, setShowVariants] = useState(false); // "All selected variants" summary
    const [activeCardId, setActiveCardId] = useState(null);  // single highlighted internal card

    const set = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));
    const setNum = (k) => (e) => setCfg((c) => ({ ...c, [k]: Number(e.target.value) }));

    // ── Canonical auto name (single source: scenarioPresentation.deriveRunName) ────
    // Derived LIVE from the exact submitted config (same payload path as onRun) so the
    // preview, Runs cards, and Run Workspace header all agree. PM version comes from the
    // deployed policy mirror. The optional nickname (runName) never touches this.
    const PM_VERSION_LABEL = useMemo(() => shortPolicyVersion(deployedPolicyDoc.policy_version), []);
    const autoNameConfig = useMemo(() => {
        const base = buildBacktesterConfig(cfg);
        const stripped = Object.fromEntries(Object.entries(base).filter(([k]) => !String(k).startsWith("_")));
        return attachSessionStrategy(stripped, sessionStrategy);
    }, [cfg, sessionStrategy]);
    const autoName = useMemo(() => deriveRunName(autoNameConfig, {}, { pmVersionLabel: PM_VERSION_LABEL }), [autoNameConfig, PM_VERSION_LABEL]);
    const effectiveRunName = (runName || "").trim() || autoName.full;
    const onRunNameEdit = (e) => setRunName(e.target.value);
    const resetToAutoName = () => setRunName("");

    // Persist the whole V2 page to its own versioned key. Best-effort; never throws.
    // lastRun lets the Current Run panel survive navigation/reload (slim job + snapshot
    // + import status only — never trade/result rows). null when there is no current run.
    useEffect(() => {
        try {
            const lr = runJob ? {
                job: slimJob(runJob), snapshot: runSnapshot, importedRunId, importError, importTooLarge, importStats,
            } : null;
            window.localStorage?.setItem(V2_STORAGE_KEY, JSON.stringify({
                version: V2_STORAGE_VERSION, cfg, sessionStrategy, runName, runNameDirty, gridUi, lastRun: lr,
            }));
        } catch { /* storage full / unavailable — non-fatal */ }
    }, [cfg, sessionStrategy, runName, runNameDirty, gridUi, runJob, runSnapshot, importedRunId, importError, importTooLarge, importStats]);

    // ── End date defaults to the last available candle for the selected symbol ────────
    // On mount and whenever the symbol changes, ask the sidecar for that symbol's
    // market-data status and set the End (To) date to the latest candle date. We also
    // clamp the date pickers to [first_candle, last_candle] so users can't pick outside
    // the data we have. A manual edit to the End date (endDateEdited) is never clobbered.
    // Any sidecar/manifest failure silently keeps the current dates.
    const endDateEdited = useRef(false);
    const [dataDateBounds, setDataDateBounds] = useState(null); // { min, max } "YYYY-MM-DD"
    useEffect(() => {
        let cancelled = false;
        getMarketDataStatus(cfg.symbol)
            .then((status) => {
                if (cancelled || !status?.available || !status?.last_candle) return;
                const last = String(status.last_candle).slice(0, 10);
                const first = status.first_candle ? String(status.first_candle).slice(0, 10) : undefined;
                setDataDateBounds({ min: first, max: last });
                if (endDateEdited.current) return;            // respect a manual End-date choice
                // Only auto-fill the End date for an UNKNOWN candle file. For a known dataset
                // (recent / full) the curated extent in dataRanges is authoritative and pinned,
                // so the symbol-level status (which reports the DEFAULT file's last candle) can
                // never override it — this is what caused two A/B runs on the extended file to
                // end 2026-06-18 vs -19.
                setCfg((prev) => {
                    if (fileBounds(prev)) return prev;        // known dataset → keep pinned dates
                    return prev.dateTo === last ? prev : { ...prev, dateTo: last };
                });
            })
            .catch(() => { /* sidecar unavailable → keep current dates */ });
        return () => { cancelled = true; };
    }, [cfg.symbol]);

    // ── Data Range presets (Recent / Full history / Custom) ───────────────────────────
    // Only sets cfg when the USER picks a preset — never silently on load, so saved configs
    // keep their dataFile/dates. The date pickers clamp to the active preset's own extent
    // (so Full history unlocks 2015), else the fetched market-data bounds.
    const activeDataRange = resolveDataRangeKey(cfg);
    // The pickers span the UNION of all known datasets (2015 → 2026) so a pre-2020 date is ALWAYS
    // selectable — no need to hunt for the "Full history" toggle first. Picking a pre-2020 start
    // auto-upgrades the candle file (setDateFrom below). Falls back to fetched market bounds only
    // if the union is somehow unavailable.
    const effectiveDateBounds = unionBounds() || dataRangeBounds(cfg, dataDateBounds);
    const dataCtx = dataRangeContext(cfg);
    // Pre-launch resolved dates — exactly what will be submitted, so a truncated window
    // (e.g. extended file but 2020 start) is visible BEFORE launch, not discovered later.
    const dateSummary = preLaunchDateSummary(cfg);
    const applyDataRange = (key) => {
        const patch = dataRangePatch(key);
        if (!patch) return;                         // "Custom" → no-op; user edits dates directly
        endDateEdited.current = true;               // preset owns the end date; don't let a status refresh clobber it
        setCfg((c) => ({ ...c, ...patch }));
    };
    // Setting the start date auto-selects the dataset that actually covers it: a pre-2020 start
    // switches to the extended 2015→2026 file, so "select a 2015 date" just works without first
    // toggling the dataset. Never downgrades a Full/extended selection.
    const setDateFrom = (v) => setCfg((c) => ({ ...c, dateFrom: v, dataFile: candleFileForStart(v, c.dataFile) }));

    // Collapsed-section summary chips (UX polish Part 1) — derived live from cfg.
    const yearOf = (d) => (typeof d === "string" && d.length >= 4 ? d.slice(0, 4) : "");
    const setupChips = [
        cfg.symbol,
        [yearOf(cfg.dateFrom), yearOf(cfg.dateTo)].filter(Boolean).join("–"),
        `${cfg.detectionTf || "?"} → ${cfg.executionTf || "?"}`,
    ];
    const globalChips = (() => {
        const out = [];
        if (cfg.selectedEntryModel === "triggered_edge") {
            const thr = (cfg.singleTriggeredEdgeThresholds || []).join("/");
            out.push(`Triggered Edge ${thr || "?"}%`);
            const arms = (Array.isArray(cfg.triggeredEdgeDelays) && cfg.triggeredEdgeDelays.length ? cfg.triggeredEdgeDelays : []).map((a) => `C${a}`).join(" ");
            if (arms) out.push(arms);
        } else if (cfg.selectedEntryModel === "baseline") out.push("Baseline");
        else out.push(String(cfg.selectedEntryModel || ""));
        if (cfg.direction && cfg.direction !== "Both") out.push(cfg.direction);
        out.push(`RR ${cfg.rr}`);
        out.push(cfg.executionMode === "multi_position" ? "Allow Multi Position" : String(cfg.executionMode || ""));
        return out;
    })();

    // ── single payload path (reuses translator + session compiler) ───────────────
    const buildPayload = () => {
        const base = buildBacktesterConfig(cfg);
        const stripped = Object.fromEntries(Object.entries(base).filter(([k]) => !String(k).startsWith("_")));
        return attachSessionStrategy(stripped, sessionStrategy);
    };
    const summary = useMemo(() => (sessionStrategy.enabled ? summarizeEnabledCohorts(sessionStrategy) : []), [sessionStrategy]);
    const enabledSessions = summary.length;
    const enabledCohorts = summary.reduce((n, s) => n + s.cohorts.length, 0);

    const onRun = async () => {
        // Guard against an inverted / empty date window (start after end). Such a run
        // produces 0 candles → 0 order blocks → 0 trades, which is never intended.
        // ISO yyyy-mm-dd strings compare correctly lexicographically.
        const from = (cfg.dateFrom || "").slice(0, 10);
        const to = (cfg.dateTo || "").slice(0, 10);
        if (from && to && from > to) {
            setRunMsg(`Invalid date range: start (${from}) is after end (${to}). Fix the dates before running.`);
            return;
        }
        setRunMsg("Submitting…"); setRunning(true);
        // Reset prior run tracking so a new submit never inherits old import / poll state.
        setRunError(""); setImportError(""); setImportedRunId(""); setImportStats(null); setImportTooLarge(false); setCompletionStats(null); importTriggeredRef.current = false;
        // SNAPSHOT the exact submitted config so "What was run" reflects THIS run even if
        // the user edits the builder afterwards. cfg/sessionStrategy are frozen object
        // references (edits create new objects), so the snapshot never mutates.
        const payload = buildPayload();
        const submitName = effectiveRunName;   // nickname if set, else the canonical auto name
        setRunSnapshot({ cfg, sessionStrategy, runName: submitName, payload });
        try {
            const started = await startSidecarRun(payload, submitName);
            setRunJob({ ...(started || {}), name: submitName, startedAt: new Date().toISOString() });
            setRunMsg(`Run started${started?.run_id ? `: ${started.run_id}` : ""}.`);
        } catch (e) {
            setRunJob(null);
            setRunMsg(`Run failed: ${e?.message || e}`);
        } finally {
            setRunning(false);
        }
    };

    // Shared finaliser for a SUCCESSFUL ingestRunBundle result (sidecar bundle OR folder
    // pick). Tags provenance, stores via addRunBundle, derives honest counts. No parsing here
    // — ingestRunBundle is the single parser. Returns the stored bundle.
    const finalizeImportedBundle = useCallback((result, { job, outputFolder }) => {
        const display = (job?.display_name || job?.name || runName || result.bundle.displayName || result.bundle.name || "").trim();
        const folder = outputFolder || job?.output_folder || "";
        result.bundle.source = "sidecar";
        if (job?.job_id) result.bundle.sidecarJobId = job.job_id;
        result.bundle.outputFolder = folder;
        if (display) { result.bundle.displayName = display; result.bundle.name = display; }
        result.bundle.summary = {
            ...result.bundle.summary,
            ...(display ? { displayName: display, name: display } : {}),
            source: "sidecar", ...(job?.job_id ? { sidecarJobId: job.job_id } : {}), outputFolder: folder,
        };
        const stored = addRunBundle(result.bundle) || result.bundle;
        const b = result.bundle || {};
        const sb = b.scenarioBaselineResults || {};
        const fairBaselineImported = !!((sb.summary && Object.keys(sb.summary).length) || (Array.isArray(sb.sourceFiles) && sb.sourceFiles.length));
        const variantCount = Object.keys(b.tradesByVariant || {}).length || (Array.isArray(b.entryResults?.sourceFiles) ? b.entryResults.sourceFiles.length : 0);
        setImportStats({
            trades: b.summary?.trades ?? (Array.isArray(b.trades) ? b.trades.length : null),
            orderBlocks: Array.isArray(b.orderBlocks) ? b.orderBlocks.length : null,
            variants: variantCount || null,
            fairBaselineImported,
        });
        setImportedRunId(stored.id);
        setImportTooLarge(false); setImportError("");
        setRunMsg("Run imported.");
        return stored;
    }, [runName]);

    // Fetch a sidecar bundle response (small /bundle OR uncapped /result-bundle), hand the
    // raw files to the SHARED parser, finalise into the store. Both paths exclude candles and
    // are EAGER + COMPLETE — never lazy/partial result import.
    const fetchAndIngest = useCallback(async (job, fetchFn) => {
        const payload = await fetchFn(job.job_id);
        const files = (payload.files || []).map((f) => new File([f.content || ""], f.name, { type: "text/plain" }));
        const result = await ingestRunBundle(files);
        if (!result.ok) throw new Error(firstIngestError(result) || "Completed run bundle could not be imported.");
        return finalizeImportedBundle(result, { job, outputFolder: payload.folder });
    }, [finalizeImportedBundle]);

    // ── Auto-import a completed run ───────────────────────────────────────────────────
    // 1) try the small /bundle (candle-excluded). 2) if it 413s (large result set), AUTO
    // import directly from the sidecar's own output folder via /result-bundle (uncapped,
    // candle-excluded, still EAGER + COMPLETE) — no manual step. Only if THAT also fails do
    // we surface the manual folder-import fallback. Never lazy run-result semantics.
    const importCompletedRun = useCallback(async (job) => {
        if (!job?.job_id) return;
        setImportBusy(true); setImportError(""); setImportTooLarge(false);
        try {
            await fetchAndIngest(job, getSidecarRunBundle);
        } catch (e) {
            if (e?.status === 413) {
                try {
                    await fetchAndIngest(job, getResultBundleByRunId);  // direct from folder
                    setImportBusy(false);
                    return;
                } catch (e2) {
                    importTriggeredRef.current = false;
                    setImportTooLarge(true);                            // even the direct path was too big
                    setImportError(formatSidecarError(e2));
                    setImportBusy(false);
                    return;
                }
            }
            importTriggeredRef.current = false;
            setImportError(formatSidecarError(e));
        } finally {
            setImportBusy(false);
        }
    }, [fetchAndIngest]);

    // Manual "Import Directly from Sidecar" (too-large fallback button) — direct folder path.
    const importDirectFromSidecar = useCallback(async (job) => {
        if (!job?.job_id) return;
        setImportBusy(true); setImportError("");
        try {
            await fetchAndIngest(job, getResultBundleByRunId);
            setImportTooLarge(false);
        } catch (e) {
            if (e?.status === 413) setImportTooLarge(true);
            setImportError(formatSidecarError(e));
        } finally {
            setImportBusy(false);
        }
    }, [fetchAndIngest]);

    // Cancel an active run: tells the sidecar to terminate the process, marks the run
    // cancelled (terminal → polling stops), leaves partial output intact.
    const cancelRun = useCallback(async () => {
        if (!runJob?.job_id) return;
        setCancelling(true);
        try {
            const res = await cancelSidecarRun(runJob.job_id);
            setRunJob((prev) => (prev && prev.job_id === (res?.job_id || prev.job_id) ? { ...prev, ...res, status: res?.status || "cancelled" } : prev));
            setRunMsg("Run cancelled.");
        } catch (e) {
            setRunMsg(`Cancel failed: ${e?.message || e}`);
        } finally {
            setCancelling(false);
        }
    }, [runJob]);

    // Reveal the output folder in the OS file manager (Finder). Falls back to copying the path.
    const revealFolder = useCallback(async () => {
        if (!runJob?.job_id) return;
        try { await revealSidecarRun(runJob.job_id); setRunMsg("Revealed in Finder."); }
        catch (e) {
            try { navigator.clipboard?.writeText(runJob.output_folder || ""); setRunMsg("Reveal unavailable — output path copied instead."); }
            catch { setRunMsg(`Reveal failed: ${e?.message || e}`); }
        }
    }, [runJob]);

    // ── Folder import fallback (reads files from disk, NO HTTP bundle cap) ─────────────
    // Uses the SAME shared parser (ingestRunBundle) as the dropzone / Runs page. Imports the
    // complete result set eagerly. The user picks the run's output folder (webkitdirectory).
    const importFromFiles = useCallback(async (fileList) => {
        if (!fileList || !fileList.length) return;
        setImportBusy(true); setImportError(""); setImportTooLarge(false);
        try {
            const result = await ingestRunBundle(fileList);
            if (!result.ok) throw new Error(firstIngestError(result) || "Selected folder is not a complete run (missing required result files).");
            finalizeImportedBundle(result, { job: runJob, outputFolder: runJob?.output_folder });
        } catch (e) {
            setImportError(formatSidecarError(e));
        } finally {
            setImportBusy(false);
        }
    }, [finalizeImportedBundle, runJob]);

    // Clear ONLY the current-run panel (does not touch the builder config). Removes the
    // persisted lastRun (the persist effect writes lastRun:null once runJob is null).
    const clearCurrentRun = () => {
        setRunJob(null); setRunSnapshot(null); setImportStats(null); setCompletionStats(null);
        setImportedRunId(""); setImportError(""); setImportTooLarge(false);
        importTriggeredRef.current = false; setRunError(""); setRunMsg("Current run cleared.");
    };

    // Poll the sidecar while the run is non-terminal. Cleans up on unmount, on a new run
    // (job_id changes), and once the run reaches a terminal status (runInProgress=false).
    const runInProgress = !!runJob?.job_id && !isTerminalStatus(runJob?.status);
    useEffect(() => {
        if (!runJob?.job_id || !runInProgress) return undefined;
        const jid = runJob.job_id;
        const timer = window.setInterval(async () => {
            try {
                const next = await getSidecarRun(jid);
                // Preserve the local-only fields (friendly name + submit timestamp).
                setRunJob((prev) => (prev && prev.job_id === jid ? { ...prev, ...next } : prev));
                setRunError("");
            } catch (e) {
                setRunError(formatSidecarError(e));
            }
        }, 2500);
        return () => window.clearInterval(timer);
    }, [runJob?.job_id, runInProgress]);

    // Auto-import exactly once when the run completes successfully. Failures never import.
    useEffect(() => {
        if (!runJob?.job_id) return;
        if (isSuccessStatus(runJob.status) && !importTriggeredRef.current) {
            importTriggeredRef.current = true;
            importCompletedRun(runJob);
        }
    }, [runJob?.status, runJob?.job_id, importCompletedRun]);

    // Pre-import completion stats: fetch summary.json (one small file) the moment the run
    // completes, so the Current Run card shows real Trades / Order Blocks / Scenarios even
    // before the (possibly large) full import finishes. Best-effort; scenarios come from the
    // polled progress (total_passes). Cleared on a new run / clear.
    useEffect(() => {
        if (!runJob?.job_id || !isSuccessStatus(runJob.status) || completionStats) return undefined;
        let cancelled = false;
        getRunFileByRunId(runJob.job_id, "summary.json").then((res) => {
            if (cancelled) return;
            let sm = {};
            try { sm = JSON.parse(res?.content || "{}"); } catch { sm = {}; }
            const prog = runJob.progress || runJob;
            setCompletionStats({
                trades: sm.trade_count ?? sm.trades ?? null,
                orderBlocks: sm.ob_count ?? sm.detected_ob_count ?? sm.order_blocks ?? null,
                scenarios: Number(prog.total_passes) || Number(prog.total_scenarios) || null,
                fairBaseline: !!(runSnapshot?.payload && runSnapshot.payload.baseline_comparison),
            });
        }).catch(() => { /* summary fetch best-effort */ });
        return () => { cancelled = true; };
    }, [runJob?.status, runJob?.job_id, completionStats, runSnapshot]);
    // "Max Range" = true Full History: the widest dataset with BOTH dates pinned to that
    // file's actual earliest/latest candle extent (2015-01-01 → 2026-06-19). Previously this
    // hardcoded dateFrom:"2020-01-02", which — combined with the extended file — produced
    // 2020-start runs mislabelled "Full history". endDateEdited marks the dates as
    // preset-owned so the async market-data status can't clobber them.
    const onMaxRange = () => { endDateEdited.current = true; setCfg((c) => ({ ...c, ...resolveFullHistory() })); };
    const copyPayload = () => { try { navigator.clipboard?.writeText(JSON.stringify(buildPayload(), null, 2)); setRunMsg("Payload copied."); } catch { /* noop */ } };

    // Selecting an entry model wires the right backend mode + auto-sets variant mode.
    // TE → single mode (multi thresholds × arms); Penetration → research sweep (baseline +
    // penetration variants); Baseline → single baseline only.
    const onEntryModel = (model) => setCfg((c) => {
        const next = { ...c, selectedEntryModel: model };
        if (model === "baseline") { next.entryMode = "single"; next.variantMode = "baseline_only"; next.entryResearchExports = false; next.triggeredEdgeEntries = false; }
        else if (model === "triggered_edge") { next.entryMode = "single"; next.variantMode = "all"; next.entryResearchExports = false; next.triggeredEdgeEntries = false; }
        else if (model === "entry_penetration") { next.entryMode = "research"; next.variantMode = "all"; next.entryResearchExports = true; next.entryResearchExportMode = "custom"; next.triggeredEdgeEntries = false; if (!String(next.entryPenetrationThresholds || "").trim()) next.entryPenetrationThresholds = "25"; }
        return next;
    });

    return (
        <CardFocusCtx.Provider value={{ activeId: activeCardId, setActiveId: setActiveCardId }}>
        <div
            className="min-h-screen text-[hsl(var(--text))]"
            onMouseDownCapture={() => setActiveCardId(null)}
            onFocusCapture={() => setActiveCardId(null)}
        >
            {/* top bar */}
            <div className="sticky top-0 z-30 flex items-center justify-between px-8 py-4 border-b border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--bg)/0.9)] backdrop-blur">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-tight">Strategy Builder <span className="text-[12px] align-middle px-1.5 py-0.5 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]">V2</span></h1>
                    <p className="text-[12.5px] text-muted-lab mt-0.5">Configure your backtest from top to bottom.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] px-2.5 py-1 clip-bevel-sm border border-[hsl(var(--border-mid))] text-muted-lab">Active Config · Unsaved</span>
                    <NeonButton tone="primary" icon={Play} onClick={onRun} disabled={running || runInProgress || regimeFilterInvalid(cfg)} title={regimeFilterInvalid(cfg) ? "Market State filter mode has no allowed states — select at least one." : undefined}>{runInProgress ? "Run in progress…" : "Run Backtest Locally"}</NeonButton>
                    {regimeFilterInvalid(cfg) && (
                        <span className="text-[11px] text-[hsl(var(--danger))]" data-testid="run-regime-invalid">Filter mode: select ≥1 allowed Market State to run.</span>
                    )}
                </div>
            </div>

            <div className="px-8 py-6 mx-auto w-full max-w-[1680px]">
                {/* main column (full-width; step rail removed) */}
                <div className="flex flex-col gap-7">

                    {/* ───────────────── ① BACKTEST SETUP ───────────────── */}
                    <SectionShell collapsible defaultOpen={false} chips={setupChips} n={1} title="Backtest Setup" question="What market and data am I testing?" scope="These settings apply to the entire backtest." active={activeSection === 1} onActivate={() => setActiveSection(1)}>
                        {/* Auto run name (canonical, live) + optional nickname */}
                        <div className="mb-4 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="run-autoname">
                            <span className="text-[10px] uppercase tracking-wide text-muted-lab font-ui">Auto name</span>
                            <span className="text-[13px] text-[hsl(var(--text-1))] font-ui">{autoName.title}</span>
                            <span className="text-[11px] text-[hsl(var(--text-2))] font-ui">{autoName.detail}</span>
                            {(runName || "").trim() && (
                                <span className="ml-auto text-[10px] font-ui text-[hsl(var(--accent-secondary))]">using nickname “{runName.trim()}” — auto name shown above</span>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                            <Field label="Nickname / override" hint="Leave blank to use automatic name.">
                                <div className="flex items-center gap-2">
                                    <NeonInput value={runName} placeholder="Leave blank to use automatic name" onChange={onRunNameEdit} className="w-full" data-testid="run-nickname" />
                                    {(runName || "").trim() && (
                                        <button type="button" onClick={resetToAutoName} data-testid="run-reset-auto" className="text-[11px] text-muted-lab hover:text-white whitespace-nowrap">Reset to auto</button>
                                    )}
                                </div>
                            </Field>
                            <Field label="Symbol"><NeonSelect value={cfg.symbol} onChange={set("symbol")} options={SYMBOLS} /></Field>
                            <Field label="Detection Timeframe"><NeonSelect value={cfg.detectionTf} onChange={set("detectionTf")} options={["M5", "M15", "M30", "H1", "H4"]} /></Field>
                            <Field label="Execution Timeframe" hint="Fixed at 1 minute."><NeonInput value="1m (fixed)" disabled readOnly className="w-full opacity-60" /></Field>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card icon={CalendarRange} title="Date Range" className="lg:col-span-2">
                                {/* Data Range presets — pick the candle dataset without touching raw file names. */}
                                <div className="mb-3" data-testid="v2-data-range">
                                    <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1.5">Data Range</div>
                                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Data range">
                                        {DATA_RANGE_ORDER.map((key) => {
                                            const sel = activeDataRange === key;
                                            const label = key === "custom" ? "Custom" : DATA_RANGES[key].label;
                                            return (
                                                <button key={key} type="button" onClick={() => applyDataRange(key)} disabled={key === "custom"}
                                                    data-testid={`v2-data-range-${key}`}
                                                    className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border transition-colors ${sel ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.12)] text-white" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"} ${key === "custom" ? "cursor-default" : ""}`}
                                                    title={key === "custom" ? "Edit the dates below to define a custom window" : DATA_RANGES[key].help}>
                                                    {label}{sel && key === "custom" ? " (edited)" : ""}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {activeDataRange !== "custom" && (
                                        <div className="text-[10.5px] font-ui text-muted-lab mt-1.5" data-testid="v2-data-range-help">{DATA_RANGES[activeDataRange].help}</div>
                                    )}
                                    {dataCtx.note && (
                                        <div className={`text-[10.5px] font-ui mt-1 ${dataCtx.mode === "cold" ? "text-[hsl(var(--warning))]" : "text-muted-lab"}`} data-testid="v2-data-range-context">{dataCtx.note}</div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                    <Field label="Start Date"><NeonDatePicker testId="v2-date-from" min={effectiveDateBounds?.min} max={effectiveDateBounds?.max} value={cfg.dateFrom} onChange={(v) => setDateFrom(v)} /></Field>
                                    <Field label="End Date" hint="Defaults to the latest available candle."><NeonDatePicker testId="v2-date-to" min={effectiveDateBounds?.min} max={effectiveDateBounds?.max} value={cfg.dateTo} onChange={(v) => { endDateEdited.current = true; set("dateTo")(v); }} /></Field>
                                    <NeonButton tone="ghost" onClick={onMaxRange}>★ Max Range</NeonButton>
                                </div>
                                {effectiveDateBounds?.min && (
                                    <div className="text-[10.5px] text-muted-lab mt-2" data-testid="v2-selectable-range">
                                        Selectable range: {(effectiveDateBounds.min || "").slice(0, 10)} → {(effectiveDateBounds.max || "").slice(0, 10)}
                                    </div>
                                )}
                                <div className="text-[10.5px] text-muted-lab mt-1 flex flex-wrap items-center gap-x-2" data-testid="v2-dataset-line">
                                    <span>{(cfg.dateFrom || "").slice(0, 10)} → {(cfg.dateTo || "").slice(0, 10)}</span>
                                    <span className="text-[hsl(var(--text-3))]">· dataset:</span>
                                    <span className="font-num text-[hsl(var(--text-3))]" title="Candle file sent to the backtester">{cfg.dataFile}</span>
                                </div>

                                {/* Pre-launch resolved-date summary — exactly what will be submitted. */}
                                <div className="mt-2 rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-2.5" data-testid="v2-prelaunch-date-summary">
                                    <div className="text-[10px] text-muted-lab font-ui mb-1 flex items-center gap-2">
                                        Resolved run window
                                        {dateSummary.isFullHistory
                                            ? <span className="text-[hsl(var(--success))]">Full history</span>
                                            : dateSummary.startTruncated
                                                ? <span className="text-[hsl(var(--warning))]">Truncated</span>
                                                : <span className="text-[hsl(var(--text-3))]">Custom window</span>}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 text-[10.5px] font-ui">
                                        <div><div className="text-[hsl(var(--text-3))]">Candle file</div><div className="font-num text-[hsl(var(--text-2))] truncate" title={dateSummary.candleFile}>{dateSummary.candleFile || "—"}</div></div>
                                        <div><div className="text-[hsl(var(--text-3))]">Earliest available</div><div className="font-num text-[hsl(var(--text-2))]">{dateSummary.earliest || "—"}</div></div>
                                        <div><div className="text-[hsl(var(--text-3))]">Latest available</div><div className="font-num text-[hsl(var(--text-2))]">{dateSummary.latest || "—"}</div></div>
                                        <div><div className="text-[hsl(var(--text-3))]">Submitted start</div><div className="font-num" style={{ color: dateSummary.startTruncated ? "hsl(var(--warning))" : "hsl(var(--text-1))" }}>{dateSummary.submittedStart || "—"}</div></div>
                                        <div><div className="text-[hsl(var(--text-3))]">Submitted end</div><div className="font-num" style={{ color: dateSummary.endTruncated ? "hsl(var(--warning))" : "hsl(var(--text-1))" }}>{dateSummary.submittedEnd || "—"}</div></div>
                                    </div>
                                    {dateSummary.warnings.length > 0 && (
                                        <div className="mt-1.5 space-y-1" data-testid="v2-prelaunch-date-warnings">
                                            {dateSummary.warnings.map((w, i) => (
                                                <div key={i} className="text-[10px] font-ui text-[hsl(var(--warning))] flex gap-1.5"><span aria-hidden>⚠</span><span>{w}</span></div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Card>
                            <Card icon={RefreshCw} title="Refresh Market Data">
                                <div className="text-[11.5px] text-muted-lab mb-3">Update candles from your data source.</div>
                                <NeonButton tone="ghost" icon={RefreshCw} onClick={() => setRunMsg("Refresh requested (wire to host).")}>Refresh Data</NeonButton>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card icon={Crosshair} title="Detection Settings" className="lg:col-span-2">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <Field label="Swing Length"><NeonInput type="number" value={cfg.swing} onChange={setNum("swing")} /></Field>
                                    <Field label="OB Filter"><NeonSelect value={cfg.obFilter} onChange={set("obFilter")} options={[{ value: "ATR", label: "ATR" }, { value: "CMR", label: "Cumulative Mean Range" }]} /></Field>
                                    <Field label="Min OB (pips)"><NeonInput type="number" value={cfg.minObSizePips} onChange={setNum("minObSizePips")} /></Field>
                                    <Field label="Max OB (pips)"><NeonInput type="number" value={cfg.maxObSizePips} onChange={setNum("maxObSizePips")} /></Field>
                                </div>
                            </Card>
                            <Card icon={Database} title="Data Source" className="opacity-90">
                                <div className="text-[11.5px] font-mono text-muted-lab break-all">{cfg.dataFile}</div>
                            </Card>
                        </div>

                        <Card icon={SettingsIcon} title="Advanced Execution Assumptions">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Field label="Spread (pips)"><NeonInput type="number" step="0.05" value={cfg.spread} onChange={setNum("spread")} /></Field>
                                <Field label="Slippage (pips)"><NeonInput type="number" step="0.05" value={cfg.slippage} onChange={setNum("slippage")} /></Field>
                                <Field label="Commission (per trade)"><NeonInput type="number" step="0.01" value={cfg.commission} onChange={setNum("commission")} /></Field>
                            </div>
                            <div className="text-[11px] text-muted-lab mt-2">These values are used for performance calculations.</div>
                        </Card>

                        <Card icon={Bell} title="News Blackout">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[12px] text-muted-lab">Pause trading around scheduled news.</span>
                                <NeonToggle checked={cfg.newsBlackout} onChange={set("newsBlackout")} label={cfg.newsBlackout ? "On" : "Off"} />
                            </div>
                            {cfg.newsBlackout && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Field label="Before news (mins)"><NeonInput type="number" value={cfg.newsBlackoutBefore} onChange={setNum("newsBlackoutBefore")} /></Field>
                                    <Field label="After news (mins)"><NeonInput type="number" value={cfg.newsBlackoutAfter} onChange={setNum("newsBlackoutAfter")} /></Field>
                                    <Field label="High impact only"><NeonSelect value={cfg.newsBlackoutImpacts.includes("high") && cfg.newsBlackoutImpacts.length === 1 ? "Yes" : "No"} onChange={(v) => set("newsBlackoutImpacts")(v === "Yes" ? ["high"] : ["high", "medium"])} options={["Yes", "No"]} /></Field>
                                </div>
                            )}
                        </Card>

                        <div className="text-[11.5px] text-muted-lab border-l-2 border-[hsl(var(--accent-secondary)/0.5)] pl-3">
                            These settings affect every trade generated during the backtest.
                        </div>
                    </SectionShell>

                    {/* ───────────────── ② GLOBAL STRATEGY ───────────────── */}
                    <SectionShell collapsible defaultOpen={false} chips={globalChips} n={2} title="Global Strategy" question="How does the normal strategy trade?" scope="These settings apply globally to all sessions." active={activeSection === 2} onActivate={() => setActiveSection(2)}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Entry */}
                            <Card icon={MousePointerClick} title="Entry">
                                <div className="flex flex-col gap-4">
                                    <Field label="Direction Scope">
                                        <Segment options={[{ value: "Long", label: "Long" }, { value: "Short", label: "Short" }, { value: "Both", label: "Both" }]} value={cfg.direction} onChange={set("direction")} />
                                    </Field>
                                    <Field label="Entry Model"><NeonSelect value={cfg.selectedEntryModel} onChange={onEntryModel} options={ENTRY_MODELS} /></Field>

                                    {cfg.selectedEntryModel === "triggered_edge" && (
                                        <>
                                            <Field label="Trigger Thresholds" hint="Presets + “+ Add…” for a custom value.">
                                                <ThresholdChips testId="te-thresholds" presets={TE_THRESHOLDS} values={cfg.singleTriggeredEdgeThresholds}
                                                    onChange={(arr) => set("singleTriggeredEdgeThresholds")(arr)} min={1} max={99} unit="%" label="threshold" />
                                            </Field>
                                            <Field label="Arm Candles" hint="Presets + “+ Add…” for a custom delay.">
                                                <ThresholdChips testId="te-arms" presets={TE_ARMS} values={cfg.triggeredEdgeDelays}
                                                    onChange={(arr) => set("triggeredEdgeDelays")(arr)} min={0} max={999} prefix="C" unit="" label="arm candle (delay)" />
                                            </Field>
                                        </>
                                    )}
                                    {cfg.selectedEntryModel === "entry_penetration" && (
                                        <Field label="Penetration Thresholds" hint="Presets + “+ Add…” for a custom value.">
                                            <ThresholdChips testId="pen-thresholds" presets={PEN_THRESHOLDS} values={parsePen(cfg.entryPenetrationThresholds)}
                                                onChange={(arr) => set("entryPenetrationThresholds")(joinPen(arr))} min={1} max={99} unit="%" label="threshold" />
                                        </Field>
                                    )}
                                    {cfg.selectedEntryModel === "baseline" && (
                                        <div className="text-[11.5px] text-muted-lab">Baseline trades the order-block edge directly — no penetration threshold.</div>
                                    )}

                                    {/* Variants — grouped (arms under threshold) + expected-counts breakdown */}
                                    <div className="border border-[hsl(var(--border-soft)/0.6)] bg-[hsl(var(--panel-2)/0.3)] clip-bevel-sm p-3 leading-relaxed" data-testid="variant-summary">
                                        <div className="text-[10px] uppercase tracking-wide text-muted-lab mb-1.5">Variants that will be generated</div>
                                        <VariantGroupView cfg={cfg} />
                                        {(() => {
                                            const exp = expectedVariants(cfg, sessionStrategy);
                                            const entryLabel = exp.kind === "triggered_edge" ? "Triggered Edge variants" : exp.kind === "entry_penetration" ? "Penetration variants" : null;
                                            return (
                                                <div className="mt-2.5 pt-2 border-t border-[hsl(var(--border-soft)/0.4)] text-[11px]" data-testid="expected-variants">
                                                    <div className="uppercase tracking-wide text-muted-lab mb-1">This run will generate</div>
                                                    <div className="flex flex-col gap-0.5 text-[hsl(var(--text-2))]">
                                                        <div><span className="text-[hsl(var(--success))]">✓</span> Baseline</div>
                                                        {exp.fairBaseline && <div><span className="text-[hsl(var(--success))]">✓</span> Fair Baseline</div>}
                                                        {entryLabel && exp.entryCount > 0 && <div><span className="text-[hsl(var(--success))]">✓</span> {entryLabel} ({exp.entryCount})</div>}
                                                        {exp.sessionCount > 0 && <div><span className="text-[hsl(var(--success))]">✓</span> Session Strategy cohorts ({exp.sessionCount})</div>}
                                                    </div>
                                                    <div className="mt-1.5 text-muted-lab">Estimated total variants: <span className="text-[hsl(var(--text))] font-semibold tabular-nums">{exp.total}</span></div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </Card>


                        </div>

                        {/* Risk */}
                        <Card icon={Target} title="Risk">
                            <Field label="Target RR">
                                <div className="flex flex-wrap items-center gap-2">
                                    {TP_PRESETS.map((p) => (
                                        <button key={p} type="button" onClick={() => set("rr")(p)}
                                            className={["w-14 text-center text-[12.5px] py-1.5 clip-bevel-sm border transition-colors",
                                                Number(cfg.rr) === p ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))]" : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"].join(" ")}>{p}</button>
                                    ))}
                                    <NeonInput type="number" step="0.1" value={cfg.rr} onChange={setNum("rr")} className="w-20" />
                                </div>
                            </Field>
                            <div className="mt-4 max-w-sm">
                                <div className="text-[11px] font-ui uppercase tracking-wide text-[hsl(var(--text-2))] mb-1.5">Risk Amount</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[12.5px] px-2.5 py-1 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text))]">Risk Amount: 1.0x / 1%</span>
                                    <span className="text-[11px] text-muted-lab">basis: current equity</span>
                                </div>
                                <div className="text-[11px] text-muted-lab mt-1.5">Weights results (does not change raw R). Per-cohort risk amount is set in Session Strategy.</div>
                            </div>
                        </Card>

                        {/* Global vs Session */}
                        <div className="border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.06)] clip-bevel-sm px-4 py-3">
                            <div className="text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--accent-primary))]">Global vs Session overrides</div>
                            <div className="text-[12px] text-[hsl(var(--text-2))] mt-1 leading-relaxed">
                                The settings above apply to the entire backtest. Session Strategy (below) only overrides:
                                <span className="text-[hsl(var(--text))]"> Enabled · Target RR · Break-even · Reduce Risk · Risk Amount</span>. Nothing else.
                            </div>
                        </div>
                    </SectionShell>

                    {/* ───────────────── ③ TRADE POLICY ───────────────── */}
                    <SectionShell n={3} title="Trade Policy" question="Which trades are allowed, and what target does each use?" scope="One working area — Eligibility (who trades) · Targets (how far) · Drafts (research) · Summary (deployed policy reference)." active={activeSection === 3} onActivate={() => setActiveSection(3)}>
                        {/* Validated Configurations — always visible at the top of Trade Policy */}
                        <BestValidatedConfig instrument={cfg.symbol || "EURUSD"} onApply={(patch) => setCfg((c) => ({ ...c, ...patch }))} />
                        {sessionStrategy?.enabled && (
                            <div className="clip-bevel-sm border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.08)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--warning))]" data-testid="legacy-owns-scenario">
                                Legacy Session Strategy owns the emitted scenario for this run — Eligibility and Targets below are inactive until it is disabled (Advanced Research / Legacy). The Portfolio Manager still applies.
                            </div>
                        )}
                        <div className="flex items-center gap-1.5" data-testid="policy-tabs">
                            {[["eligibility", "Eligibility"], ["targets", "Targets"], ["drafts", "Drafts"], ["summary", "Summary"]].map(([k, label]) => (
                                <button key={k} type="button" onClick={() => setPolicyTab(k)} data-testid={`policy-tab-${k}`}
                                    className={`px-3 py-1.5 text-[12px] font-ui clip-bevel-sm border ${policyTab === k ? "border-[hsl(var(--accent-primary))] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.10)]" : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        {policyTab === "eligibility" && (
                            <TradeEligibility cfg={cfg} instrument={cfg.symbol || "EURUSD"} superseded={Boolean(sessionStrategy?.enabled)} onField={(k, v) => setCfg((c) => ({ ...c, [k]: v }))} />
                        )}
                        {policyTab === "targets" && (
                            <div className={sessionStrategy?.enabled ? "opacity-40 pointer-events-none select-none" : ""}>
                                <MarketStateTargetOverrides cfg={cfg} instrument={cfg.symbol || "EURUSD"} onField={(k, v) => setCfg((c) => ({ ...c, [k]: v }))} />
                            </div>
                        )}
                        {policyTab === "drafts" && (
                            <DraftsPanel cfg={cfg} onField={(k, v) => setCfg((c) => ({ ...c, [k]: v }))} />
                        )}
                        {policyTab === "summary" && (
                            <PortfolioManagerControls cfg={cfg} instrument={cfg.symbol || "EURUSD"} defaultOpen />
                        )}
                    </SectionShell>

                    {/* ───────────────── ④ TRADE MANAGEMENT ───────────────── */}
                    <SectionShell n={4} title="Trade Management" question="How are open trades protected and managed?" scope="Stop buffer · break-even · entry-model protection. Global settings; per-cohort management lives in Advanced Research / Legacy." active={activeSection === 4} onActivate={() => setActiveSection(4)}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Protection */}
                            <Card icon={Shield} title="Protection">
                                <div className="flex flex-col gap-4">
                                    <Field label="Stop Buffer (pips)"><NeonInput type="number" step="0.1" value={cfg.stopBuffer} onChange={setNum("stopBuffer")} /></Field>

                                    {/* Break-even — multiple arm R levels + trigger bases */}
                                    <div className="border border-[hsl(var(--border-soft)/0.6)] clip-bevel-sm p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] font-medium text-[hsl(var(--text-2))]">Break-even</span>
                                            <NeonToggle checked={!!cfg.beEnabled} onChange={set("beEnabled")} />
                                        </div>
                                        {cfg.beEnabled && (
                                            <div className="mt-3 flex flex-col gap-3">
                                                <Field label="Trigger basis" hint="Single choice — always one valid basis.">
                                                    <Segment
                                                        options={[{ value: "wick", label: "Wick" }, { value: "close", label: "Close" }]}
                                                        value={(Array.isArray(cfg.beTriggerBases) && cfg.beTriggerBases[0]) || "wick"}
                                                        onChange={(v) => set("beTriggerBases")([v])}
                                                    />
                                                </Field>
                                                <Field label="Arm R levels">
                                                    <Chips choices={BE_ARM_LEVEL_CHOICES} values={cfg.beArmLevels} onToggle={(v) => set("beArmLevels")(toggleNum(cfg.beArmLevels, v))} fmt={(c) => `${c}R`} />
                                                </Field>
                                            </div>
                                        )}
                                        <div className="text-[10.5px] text-muted-lab mt-2">Global break-even sweep — per-cohort break-even is set in Session Strategy.</div>
                                    </div>

                                    {/* Reduce Risk — per-cohort only */}
                                    <GlobalReveal label="Reduce Risk (Move Stop)" on={rrOn} onToggle={setRrOn}>
                                        <div className="text-[10.5px] text-muted-lab">No global control — per-cohort move-stop is authored in Session Strategy / Session Defaults below.</div>
                                    </GlobalReveal>

                                    {/* Triggered Edge Protection — real cfg, only when TE is the entry model */}
                                    {cfg.selectedEntryModel === "triggered_edge" && (
                                        <div className="border border-[hsl(var(--border-soft)/0.6)] clip-bevel-sm p-3 flex flex-col gap-3">
                                            <div className="text-[12px] font-medium text-[hsl(var(--text-2))]">Triggered Edge Protection</div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[12px] text-muted-lab">Retrace cancel</span>
                                                <NeonToggle checked={!!cfg.triggeredEdgeCancelOnRetrace} onChange={set("triggeredEdgeCancelOnRetrace")} />
                                            </div>
                                            {cfg.triggeredEdgeCancelOnRetrace && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Field label="Retrace pips"><NeonInput type="number" step="0.1" value={cfg.triggeredEdgeCancelRetracePips} onChange={setNum("triggeredEdgeCancelRetracePips")} /></Field>
                                                    <Field label="Retrace OB %"><NeonInput type="number" step="1" value={cfg.triggeredEdgeCancelRetraceObPct} onChange={setNum("triggeredEdgeCancelRetraceObPct")} /></Field>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <span className="text-[12px] text-muted-lab">FFT move-away</span>
                                                <NeonToggle checked={!!cfg.triggeredEdgeCancelOnFirstFailedTag} onChange={set("triggeredEdgeCancelOnFirstFailedTag")} />
                                            </div>
                                            {cfg.triggeredEdgeCancelOnFirstFailedTag && (
                                                <div className="grid grid-cols-3 gap-3">
                                                    <Field label="Move-away pips"><NeonInput type="number" step="0.1" value={cfg.triggeredEdgeFftMoveAwayPips} onChange={setNum("triggeredEdgeFftMoveAwayPips")} /></Field>
                                                    <Field label="OB multiple"><NeonInput type="number" step="0.1" value={cfg.triggeredEdgeFftMoveAwayObMultiple} onChange={setNum("triggeredEdgeFftMoveAwayObMultiple")} /></Field>
                                                    <Field label="Min OB width"><NeonInput type="number" step="0.1" value={cfg.triggeredEdgeFftMinObWidthPips} onChange={setNum("triggeredEdgeFftMinObWidthPips")} /></Field>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    </SectionShell>

                    {/* ───────────────── ⑤ RESOLVED RUN SUMMARY ───────────────── */}
                    <SectionShell n={5} title="Resolved Run Summary" question="What exactly will this run do?" scope="Entry · Eligibility · Targets · Management · Data — resolved from every layer above, with conflict warnings." active={activeSection === 5} onActivate={() => setActiveSection(5)}>
                        <ResolvedRunSummary cfg={cfg} instrument={cfg.symbol || "EURUSD"} />
                    </SectionShell>

                    <SectionShell collapsible defaultOpen={false} n={6} title="Advanced Research / Legacy"
                        question="Research overrides and legacy layers — nothing here is part of the normal workflow."
                        chips={[sessionStrategy?.enabled ? "Session Strategy ON" : null, cfg.regimeEnabled ? "MS gate ON" : null, cfg.portfolioIncludeDisabledCohorts ? "Include-disabled ON" : null].filter(Boolean).length ? [sessionStrategy?.enabled ? "Session Strategy ON" : null, cfg.regimeEnabled ? "MS gate ON" : null, cfg.portfolioIncludeDisabledCohorts ? "Include-disabled ON" : null].filter(Boolean) : ["All off"]}
                        scope="Recommended research stack · include-disabled override · legacy Session Strategy grid · global Market State gate."
                        active={activeSection === 6} onActivate={() => setActiveSection(6)}>
                        <RecommendedStackStrip cfg={cfg} sessionStrategy={sessionStrategy} onApply={(patch) => setCfg((c) => ({ ...c, ...patch }))} />
                        <IncludeDisabledOverride cfg={cfg} onField={(k, v) => setCfg((c) => ({ ...c, [k]: v }))} />

                        {/* Advanced / Legacy — Session Strategy */}
                        <div className="border-t border-[hsl(var(--border-soft)/0.5)] pt-4" data-testid="advanced-session-strategy">
                            <div className="text-[13px] font-semibold text-[hsl(var(--accent-primary))] uppercase tracking-wide">Advanced / Legacy — Session Strategy</div>
                            <div className="text-[11.5px] text-muted-lab mt-0.5 mb-3">
                                Legacy per-session scenario tools (BE, move-stop, risk amount, fair baseline) for{" "}
                                <span className="text-[hsl(var(--accent-secondary))] italic">{cfg.symbol}</span>.
                                When ENABLED this grid SUPERSEDES the Trade Policy scenario above.
                            </div>
                        {/* top summary strip */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card title="Strategy Summary">
                                <ul className="text-[12.5px] text-[hsl(var(--text-2))] leading-relaxed">
                                    <li>Enabled sessions: <span className="text-[hsl(var(--text))] font-semibold">{enabledSessions} of 6</span></li>
                                    <li>Enabled cohorts: <span className="text-[hsl(var(--text))] font-semibold">{enabledCohorts}</span></li>
                                    <li>Current pair: <span className="text-[hsl(var(--text))] font-semibold">{cfg.symbol}</span></li>
                                </ul>
                            </Card>
                            <Card title="What's Being Overridden">
                                <ul className="text-[12px] text-[hsl(var(--text-2))] leading-relaxed">
                                    {["Enabled (cohorts)", "Target RR", "Break-even", "Reduce Risk", "Risk Amount"].map((x) => (
                                        <li key={x} className="flex items-center gap-1.5"><span className="text-[hsl(var(--success))]">✓</span> {x}</li>
                                    ))}
                                </ul>
                            </Card>
                            <Card title="Fair Baseline">
                                <div className="text-[12px] text-muted-lab leading-relaxed">A standard baseline run is always generated using the same enabled sessions and cohorts to provide a fair comparison.</div>
                            </Card>
                        </div>

                        {/* the reused v1 grid: session defaults, enabled summary, sessions, fair baseline, copy-to */}
                        <SessionStrategyGrid value={sessionStrategy} onChange={setSessionStrategy} symbol={cfg.symbol} ui={gridUi} onUiChange={setGridUi} />
                        </div>

                        {/* Advanced Research — Global Market State Gate */}
                        <div className="border-t border-[hsl(var(--border-soft)/0.5)] pt-4" data-testid="advanced-ms-gate">
                            <div className="text-[13px] font-semibold text-[hsl(var(--accent-primary))] uppercase tracking-wide">Advanced Research — Global Market State Gate</div>
                            <div className="text-[11.5px] text-muted-lab mt-0.5 mb-3">
                                EMA / Bollinger width / ADX global regime gate. Use only for legacy comparisons or explicit
                                research — the Portfolio Manager already applies Market State selectively by cohort.{cfg.regimeEnabled ? " (currently ON)" : ""}
                            </div>
                            {cfg.portfolioEnabled && cfg.regimeEnabled && (
                            <div className="rounded-md border border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)] p-3 mb-3 text-[11px] font-ui text-[hsl(var(--text-1))]" data-testid="pm-ms-warning">
                                <span className="text-[hsl(var(--warning))] font-semibold">Warning:</span> Portfolio Manager already applies Market State selectively by cohort. Research found the global Market State gate was harmful/redundant when PM is enabled. Recommended stack: PM ON, Global Market State gate OFF.
                            </div>
                        )}
                            <MarketStateControls cfg={cfg} onField={(k, v) => setCfg((c) => ({ ...c, [k]: v }))} />
                        </div>
                    </SectionShell>

                    {/* ───────────────── ⑤ MARKET STATE (advanced / legacy) ───────────────── */}
                    

                    {/* config preview */}
                    <div className="border border-[hsl(var(--border-soft)/0.6)] clip-bevel-sm">
                        <button type="button" onClick={() => setShowConfig((v) => !v)} className="flex items-center justify-between w-full px-4 py-3 text-[12.5px] text-muted-lab hover:text-white">
                            <span className="inline-flex items-center gap-2"><Copy className="w-3.5 h-3.5" /> Generated payload (preview == submitted)</span>
                            {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {showConfig && (
                            <div className="px-4 pb-4">
                                <div className="flex justify-end mb-2"><NeonButton tone="ghost" icon={Copy} onClick={copyPayload}>Copy payload</NeonButton></div>
                                <pre className="max-h-96 overflow-auto scrollbar-thin whitespace-pre-wrap border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3 text-[11px] leading-relaxed font-code text-[hsl(var(--accent-secondary))]">{(() => { try { return JSON.stringify(buildPayload(), null, 2); } catch (e) { return `payload error: ${e?.message || e}`; } })()}</pre>
                            </div>
                        )}
                    </div>

                    {/* current run status — live polled */}
                    {(() => {
                        const status = (runJob?.status || (running ? "submitting" : "")).toLowerCase();
                        const prog = deriveProgress(runJob);
                        const failed = isFailureStatus(status);
                        const succeeded = isSuccessStatus(status);
                        const active = !!runJob && !isTerminalStatus(status);
                        const pillLabel = running ? "Submitting…" : (status ? status.charAt(0).toUpperCase() + status.slice(1) : "Idle");
                        const pillClass = failed
                            ? "border-[hsl(var(--danger)/0.6)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]"
                            : succeeded
                                ? "border-[hsl(var(--success)/0.6)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
                                : active || running
                                    ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                                    : "border-[hsl(var(--border-mid))] text-muted-lab";
                        const errText = failed ? (runJob?.progress?.error || runJob?.error || runJob?.stderr_tail || runError || "Run failed.") : "";
                        // Honest runtime from the sidecar timestamps (started→finished); null if absent.
                        const runtime = formatElapsed(runJob?.startedAt || runJob?.started_at, runJob?.finished_at);
                        // Empty-run detection (from imported or pre-import summary stats).
                        const statsForEmpty = importStats || completionStats;
                        const emptyRun = statsForEmpty && (statsForEmpty.orderBlocks === 0 || statsForEmpty.trades === 0);
                        const plan = runSnapshot ? sessionPlanDetailed(runSnapshot.sessionStrategy) : { enabled: [], noOverride: [] };
                        const fairBaselineOn = !!(runSnapshot?.payload && runSnapshot.payload.baseline_comparison);
                        return (
                            <div className="border border-[hsl(var(--border-soft)/0.6)] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm px-4 py-3.5" data-testid="current-run">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12.5px] font-semibold uppercase tracking-wide text-[hsl(var(--text))]">Current Run</span>
                                    <div className="flex items-center gap-2">
                                        {runJob && !active && (
                                            <button type="button" data-testid="clear-current-run" onClick={clearCurrentRun}
                                                className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 clip-bevel-sm border border-[hsl(var(--border-mid))] text-muted-lab hover:text-white hover:border-[hsl(var(--danger)/0.5)]">
                                                <Eraser className="w-3 h-3" /> Clear current run
                                            </button>
                                        )}
                                        <span className={["inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 clip-bevel-sm border", pillClass].join(" ")}>
                                            {active && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {succeeded && <CheckCircle2 className="w-3 h-3" />}
                                            {failed && <XCircle className="w-3 h-3" />}
                                            {pillLabel}
                                        </span>
                                    </div>
                                </div>

                                {!runJob && !running && (
                                    <div className="mt-2 text-[12px] text-muted-lab">No run submitted yet. Click “Run Backtest” to submit; live status will appear here.</div>
                                )}

                                {runJob && (
                                    <>
                                        {/* progress — driven by COMPLETED scenario passes + worker status + ETA */}
                                        {active && (
                                            <div className="mt-2.5">
                                                {prog && prog.pct != null ? (
                                                    <>
                                                        <div className="flex items-center justify-between text-[11.5px] text-muted-lab mb-1">
                                                            <span>{prog.stageLabel || (prog.stage ? `Running: ${prog.stage}` : "Running simulations")}</span>
                                                            <span className="tabular-nums">{prog.idx}/{prog.total} scenarios · {prog.pct}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-[hsl(var(--panel-2))] clip-bevel-sm overflow-hidden">
                                                            <div className="h-full bg-[hsl(var(--accent-primary))] transition-[width] duration-500" style={{ width: `${prog.pct}%` }} />
                                                        </div>
                                                        <div className="flex items-center justify-between text-[10.5px] text-muted-lab mt-1 tabular-nums">
                                                            <span>{prog.running != null ? `${prog.running} running` : ""}{prog.queued != null ? ` · ${prog.queued} queued` : ""}{prog.workers ? ` · ${prog.workers.length} worker${prog.workers.length === 1 ? "" : "s"}` : ""}</span>
                                                            <span>{prog.elapsed ? `elapsed ${prog.elapsed}` : ""}{prog.eta ? ` · ~${prog.eta} left` : ""}</span>
                                                        </div>
                                                    </>
                                                ) : prog && (prog.stageLabel || prog.stage) ? (
                                                    <div className="text-[12px] text-[hsl(var(--text-2))]">{prog.stageLabel || `Stage: ${prog.stage}`}{prog.elapsed ? <span className="text-muted-lab"> · elapsed {prog.elapsed}</span> : null}</div>
                                                ) : (
                                                    <div className="text-[12px] text-muted-lab">Working… (progress details not reported yet).</div>
                                                )}
                                                <div className="mt-2">
                                                    <NeonButton tone="ghost" icon={Ban} onClick={cancelRun} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel Run"}</NeonButton>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
                                            <div><span className="text-muted-lab">Run name</span><div className="text-[hsl(var(--text))] break-all">{runJob.display_name || runJob.name || "—"}</div></div>
                                            <div><span className="text-muted-lab">Run ID</span><div className="text-[hsl(var(--text-2))] break-all">{runJob.run_id || "—"}</div></div>
                                            <div><span className="text-muted-lab">Job ID</span><div className="text-[hsl(var(--text-2))] break-all">{runJob.job_id || "—"}</div></div>
                                            <div><span className="text-muted-lab">Started</span><div className="text-[hsl(var(--text-2))]">{runJob.startedAt ? new Date(runJob.startedAt).toLocaleTimeString() : (runJob.started_at ? new Date(runJob.started_at).toLocaleTimeString() : "—")}</div></div>
                                            {runJob.finished_at && <div><span className="text-muted-lab">Finished</span><div className="text-[hsl(var(--text-2))]">{new Date(runJob.finished_at).toLocaleTimeString()}</div></div>}
                                            {runJob.output_folder && <div className="col-span-2 sm:col-span-3"><span className="text-muted-lab">Output</span><div className="text-[hsl(var(--text-2))] break-all font-mono text-[11px]">{runJob.output_folder}</div></div>}
                                        </div>

                                        {/* failure */}
                                        {failed && (
                                            <div className="mt-3 border border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.07)] clip-bevel-sm px-3 py-2 text-[12px] text-[hsl(var(--danger))]" data-testid="run-failed">
                                                <span className="font-semibold">Run {status}. </span><span className="break-all">{errText}</span>
                                            </div>
                                        )}

                                        {/* RUN COMPLETE SUMMARY — metric chips (honest; omit/—when unavailable) */}
                                        {succeeded && (
                                            <div className="mt-3 border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.06)] clip-bevel-sm px-3.5 py-3" data-testid="run-complete-summary">
                                                <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[hsl(var(--success))] uppercase tracking-wide"><CheckCircle2 className="w-3.5 h-3.5" /> Run Complete</div>
                                                {!importStats && completionStats && <div className="text-[10.5px] text-muted-lab mt-0.5">From run summary (full import in progress / pending).</div>}
                                                <div className="mt-2 flex flex-wrap gap-2 text-[11.5px]">
                                                    {[
                                                        // Prefer imported counts; fall back to pre-import summary.json stats.
                                                        ["Trades", importStats?.trades != null ? importStats.trades.toLocaleString() : (completionStats?.trades != null ? completionStats.trades.toLocaleString() : null)],
                                                        ["Order Blocks", importStats?.orderBlocks != null ? importStats.orderBlocks.toLocaleString() : (completionStats?.orderBlocks != null ? completionStats.orderBlocks.toLocaleString() : null)],
                                                        ["Generated", importStats?.variants != null ? `${importStats.variants}${runSnapshot ? ` / ${countEntryVariants(runSnapshot.cfg)}` : ""} variants` : null],
                                                        ["Scenarios", completionStats?.scenarios != null ? completionStats.scenarios : (Number(runJob?.total_passes) || Number(runJob?.progress?.total_passes) || null)],
                                                        ["Fair Baseline", importStats ? (importStats.fairBaselineImported ? "Yes" : "No") : (completionStats ? (completionStats.fairBaseline ? "Yes" : "No") : null)],
                                                        ["Runtime", runtime],
                                                        ["Configuration", runSnapshot?.payload ? payloadHash(runSnapshot.payload) : null],
                                                    ].map(([k, v]) => (
                                                        <span key={k} className="px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.4)] tabular-nums">
                                                            <span className="text-muted-lab">{k}: </span>
                                                            <span className={v == null ? "text-muted-lab italic" : "text-[hsl(var(--text))] font-medium"}>{v == null ? "not reported" : v}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                                {emptyRun && (
                                                    <div className="mt-2.5 text-[11.5px] text-[hsl(var(--accent-secondary))] leading-relaxed" data-testid="run-empty">
                                                        Run completed but produced no {statsForEmpty.orderBlocks === 0 ? "order blocks" : "trades"}. Likely causes: the date range contains no candles (check Start/End), filters are too strict, or no matching order blocks were found.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* WHAT WAS RUN — uses the SUBMITTED snapshot, not live cfg */}
                                        {succeeded && runSnapshot && (
                                            <div className="mt-3 border border-[hsl(var(--border-soft)/0.6)] clip-bevel-sm" data-testid="what-was-run">
                                                <div className="flex items-center justify-between px-3.5 py-2.5">
                                                    <button type="button" onClick={() => setWhatRunOpen((o) => !o)} className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[hsl(var(--text))]">
                                                        {whatRunOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} What was run
                                                    </button>
                                                    <button type="button" data-testid="copy-run-config"
                                                        onClick={() => { try { navigator.clipboard?.writeText(copyRunConfigText(runSnapshot)); setRunMsg("Run configuration copied."); } catch { /* noop */ } }}
                                                        className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-mid))] text-muted-lab hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]">
                                                        <Copy className="w-3 h-3" /> Copy Run Configuration
                                                    </button>
                                                </div>
                                                {whatRunOpen && (
                                                    <div className="px-3.5 pb-3.5 flex flex-col gap-3 max-h-[280px] overflow-auto scrollbar-thin">
                                                        {/* A — Global Strategy / entry variants (execution tree) */}
                                                        <div>
                                                            <div className="text-[11px] uppercase tracking-wide text-[hsl(var(--accent-primary))] font-semibold mb-1.5">Global Strategy</div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-[11.5px]">
                                                                {globalStrategyLines(runSnapshot.cfg).map(([k, v]) => (
                                                                    <div key={k}><span className="text-muted-lab">{k}: </span><span className="text-[hsl(var(--text-2))]">{v}</span></div>
                                                                ))}
                                                            </div>
                                                            <div className="mt-1.5 text-[10.5px] uppercase tracking-wide text-muted-lab mb-0.5">Variants</div>
                                                            <div className="pl-2 border-l border-[hsl(var(--border-soft)/0.5)]"><VariantGroupView cfg={runSnapshot.cfg} /></div>
                                                        </div>

                                                        {/* B — Fair Baseline */}
                                                        <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-2.5">
                                                            <div className="text-[11px] uppercase tracking-wide text-[hsl(var(--accent-secondary))] font-semibold mb-1.5">Fair Baseline</div>
                                                            {fairBaselineOn ? (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-[11.5px] text-[hsl(var(--text-2))]">
                                                                    <div><span className="text-muted-lab">Entry: </span>Baseline</div>
                                                                    <div><span className="text-muted-lab">Target: </span>{runSnapshot.payload.baseline_comparison?.target?.rr != null ? `${runSnapshot.payload.baseline_comparison.target.rr}R` : "—"}</div>
                                                                    <div><span className="text-muted-lab">BE: </span>{runSnapshot.payload.baseline_comparison?.be ? `${runSnapshot.payload.baseline_comparison.be.trigger} ${runSnapshot.payload.baseline_comparison.be.arm_r}R` : "None"}</div>
                                                                    <div><span className="text-muted-lab">Universe: </span>same enabled session cohorts</div>
                                                                    <div><span className="text-muted-lab">Output: </span>{importStats ? (importStats.fairBaselineImported ? "imported" : "not present") : "—"}</div>
                                                                </div>
                                                            ) : (
                                                                <div className="text-[11.5px] text-muted-lab">Fair Baseline was not enabled for this run.</div>
                                                            )}
                                                        </div>

                                                        {/* C — Session Strategy / scenarios (override vs inherited) */}
                                                        <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-2.5">
                                                            <div className="text-[11px] uppercase tracking-wide text-amber-300 font-semibold mb-1.5">Session Strategy</div>
                                                            {plan.enabled.length === 0 ? (
                                                                <div className="text-[11.5px] text-muted-lab">No session overrides — every cohort ran with the global strategy.</div>
                                                            ) : (
                                                                <div className="flex flex-col gap-2">
                                                                    {plan.enabled.map((s) => (
                                                                        <div key={s.sessionKey}>
                                                                            <div className="text-[11.5px] font-semibold text-[hsl(var(--text))]">{s.sessionLabel}</div>
                                                                            <ul className="mt-0.5 flex flex-col gap-1 pl-2 border-l border-amber-500/30">
                                                                                {s.cohorts.map((c) => (
                                                                                    <li key={c.cohortKey} className="text-[11px] tabular-nums">
                                                                                        <div><span className="text-[hsl(var(--text))]">{c.label}</span>: <span className="text-[hsl(var(--text-2))]">{c.text}</span></div>
                                                                                        <div className="flex flex-wrap gap-x-4 mt-0.5">
                                                                                            <span><span className="text-[hsl(var(--success))]">Overrides:</span> <span className="text-[hsl(var(--text-2))]">{c.overrides.length ? c.overrides.join(", ") : "none"}</span></span>
                                                                                            <span><span className="text-muted-lab">Inherited:</span> <span className="text-muted-lab">{c.inherited.length ? c.inherited.join(", ") : "none"}</span></span>
                                                                                        </div>
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {plan.noOverride.length > 0 && (
                                                                <div className="mt-2 text-[11px] text-muted-lab leading-relaxed">
                                                                    No overrides: {plan.noOverride.map((n, i) => <span key={n.key}>{n.label}{n.off ? " (session off)" : ""}{i < plan.noOverride.length - 1 ? ", " : ""}</span>)} — these ran with no session override.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* import / navigation (success only) */}
                                        {succeeded && (
                                            <div className="mt-3" data-testid="run-import">
                                                {/* Hidden folder picker — reads files from disk (no HTTP bundle cap), shared parser. */}
                                                <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" accept=".json,.csv"
                                                    className="hidden" data-testid="v2-folder-input" onChange={(e) => importFromFiles(e.target.files)} />

                                                {importBusy && <span className="inline-flex items-center gap-1.5 text-[12px] text-[hsl(var(--accent-primary))]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing result files…</span>}

                                                {!importBusy && importedRunId && (
                                                    <div className="flex flex-wrap items-center gap-2.5">
                                                        <span className="inline-flex items-center gap-1.5 text-[12px] text-[hsl(var(--success))]"><CheckCircle2 className="w-3.5 h-3.5" /> Imported successfully</span>
                                                        <Link to={`/runs/${encodeURIComponent(importedRunId)}`}><NeonButton tone="primary" icon={ExternalLink}>Open Run Workspace</NeonButton></Link>
                                                        {runJob.output_folder && <NeonButton tone="ghost" icon={FolderOpen} onClick={revealFolder}>Show in Finder</NeonButton>}
                                                    </div>
                                                )}

                                                {/* Too-large fallback — direct sidecar import + Finder; manual folder as last resort. */}
                                                {!importBusy && !importedRunId && importTooLarge && (
                                                    <div className="border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm px-3 py-2.5" data-testid="import-too-large">
                                                        <div className="text-[12px] text-[hsl(var(--warning))] leading-relaxed">Run completed. The result bundle is too large for browser one-click import because of heavy files. Core results are still importable directly from the run folder.</div>
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <NeonButton tone="primary" icon={Download} onClick={() => importDirectFromSidecar(runJob)}>Import Directly from Sidecar</NeonButton>
                                                            {runJob.output_folder && <NeonButton tone="ghost" icon={FolderOpen} onClick={revealFolder}>Show in Finder</NeonButton>}
                                                            <NeonButton tone="ghost" icon={FolderInput} onClick={() => folderInputRef.current?.click()}>Choose Folder Manually</NeonButton>
                                                            {runJob.output_folder && <NeonButton tone="ghost" icon={ClipboardCopy} onClick={() => { try { navigator.clipboard?.writeText(runJob.output_folder); setRunMsg("Output path copied."); } catch { /* noop */ } }}>Copy Output Path</NeonButton>}
                                                            <Link to="/runs"><NeonButton tone="ghost">Go to Runs</NeonButton></Link>
                                                        </div>
                                                        {runJob.output_folder && <div className="mt-1.5 text-[10.5px] text-muted-lab break-all font-mono">{runJob.output_folder}</div>}
                                                    </div>
                                                )}

                                                {/* Other import failure (not size) — retry + direct sidecar + folder fallback. */}
                                                {!importBusy && !importedRunId && !importTooLarge && importError && (
                                                    <div className="flex flex-wrap items-center gap-2.5">
                                                        <span className="text-[12px] text-[hsl(var(--danger))] break-all">Import failed: {importError}</span>
                                                        <NeonButton tone="ghost" icon={RefreshCw} onClick={() => { importTriggeredRef.current = true; importCompletedRun(runJob); }}>Retry import</NeonButton>
                                                        <NeonButton tone="ghost" icon={Download} onClick={() => importDirectFromSidecar(runJob)}>Import Directly from Sidecar</NeonButton>
                                                        {runJob.output_folder && <NeonButton tone="ghost" icon={FolderOpen} onClick={revealFolder}>Show in Finder</NeonButton>}
                                                        <NeonButton tone="ghost" icon={FolderInput} onClick={() => folderInputRef.current?.click()}>Choose Folder Manually</NeonButton>
                                                        <Link to="/runs"><NeonButton tone="ghost">Go to Runs</NeonButton></Link>
                                                    </div>
                                                )}

                                                {/* Completed but not yet imported and no error (e.g. restored last run before auto-import). */}
                                                {!importBusy && !importedRunId && !importError && !importTooLarge && (
                                                    <div className="flex flex-wrap items-center gap-2.5">
                                                        <NeonButton tone="primary" icon={ExternalLink} onClick={() => { importTriggeredRef.current = true; importCompletedRun(runJob); }}>Import result</NeonButton>
                                                        <NeonButton tone="ghost" icon={FolderInput} onClick={() => folderInputRef.current?.click()}>Choose Run Folder to Import</NeonButton>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* non-terminal transport error (does not stop the run) */}
                                        {!failed && runError && (
                                            <div className="mt-2 text-[11.5px] text-[hsl(var(--danger))]">Status check error: {runError} <span className="text-muted-lab">(will retry)</span></div>
                                        )}

                                        <div className="mt-2.5"><Link to="/runs" className="text-[11.5px] text-[hsl(var(--accent-secondary))] underline">View all runs</Link></div>
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    {/* legacy */}
                    <div className="border-2 border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.05)] clip-bevel-sm">
                        <button type="button" onClick={() => setShowLegacy((v) => !v)} className="flex items-center justify-between w-full px-4 py-3">
                            <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[hsl(var(--danger))]"><AlertTriangle className="w-4 h-4" /> Legacy Strategy Builder (Deprecated)</span>
                            {showLegacy ? <ChevronUp className="w-4 h-4 text-[hsl(var(--danger))]" /> : <ChevronDown className="w-4 h-4 text-[hsl(var(--danger))]" />}
                        </button>
                        {showLegacy && (
                            <div className="px-4 pb-4 text-[12px] text-muted-lab">
                                The previous Strategy Builder is preserved at <Link to="/strategy" className="text-[hsl(var(--accent-secondary))] underline">/strategy</Link>. It no longer drives this page and will be removed once V2 is approved. Nothing above depends on it.
                            </div>
                        )}
                    </div>

                    {/* footer run */}
                    <div className="flex items-center justify-between px-2 py-4 border-t border-[hsl(var(--border-soft)/0.5)]">
                        <NeonButton tone="ghost" icon={RefreshCw} onClick={() => { setCfg({ ...DEFAULT_CFG }); setSessionStrategy({ ...DEFAULT_SESSION_STRATEGY }); setRunNameDirty(false); setRunName(""); setGridUi({ ...DEFAULT_GRID_UI }); setRunMsg("Builder reset — last run kept (use “Clear current run” to remove it)."); }}>Reset All</NeonButton>
                        <span className="text-[12px] text-muted-lab">{runMsg || "All changes are kept for this session."}</span>
                        <NeonButton tone="primary" icon={Play} onClick={onRun} disabled={running || runInProgress}>{runInProgress ? "Run in progress…" : "Run Backtest"}</NeonButton>
                    </div>
                </div>
            </div>
        </div>
        </CardFocusCtx.Provider>
    );
}
