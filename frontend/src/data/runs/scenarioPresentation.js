// scenarioPresentation.js — PURE presentation helpers for the Runs page "Cards" view.
//
// Corrected hierarchy (see outputs/research/run_page_ux_audit): one run folder is a scenario BATCH,
// not one scenario. This module turns a run object (normalized list fields + the in-memory bundle's
// `config` and `entryResults.summary`) into a Run Batch view-model containing per-scenario cards.
//
// Per-scenario metrics come from summary.json → entry_results.<exec_mode>.<scenario_key> (already loaded
// as run.entryResults.summary). Metrics NOT present (regime_blocked / portfolio_blocked per scenario) are
// returned as null — never fabricated. This module is pure: it does not mutate its input.

export const CONTEXT_MODES = {
    COLD: "COLD_WINDOW_START",
    WARMED: "FULL_HISTORY_WARMED",
    PRELOAD: "WINDOW_WITH_PRELOAD",
    UNKNOWN: "UNKNOWN_CONTEXT",
};

export const CONTEXT_WARNINGS = {
    cold: "Short-window runs may not match the same slice of a full-history run unless pre-window context is loaded.",
    warmup: "Market State warm-up can affect early trades.",
    obs: "Order blocks formed before the run start cannot exist in cold-window runs.",
};

const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const round = (v, d = 2) => (v === null ? null : Number(Number(v).toFixed(d)));

// ── date display: "YYYY-MM-DD" → "DD Mon YYYY" (raw dates keep their format elsewhere) ──
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(value) {
    if (!value || typeof value !== "string") return value || "";
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return value; // unknown/malformed → return as-is (safe fallback)
    const mi = Number(m[2]) - 1;
    if (mi < 0 || mi > 11) return value;
    return `${m[3]} ${MONTHS[mi]} ${m[1]}`;
}
export function formatDateRange(range) {
    if (!range || typeof range !== "string") return range || "";
    const parts = range.split("→").map((p) => p.trim());
    if (parts.length === 2) return `${formatDate(parts[0])} → ${formatDate(parts[1])}`;
    return range;
}

// ── scenario key parsing ────────────────────────────────────────────────────
// "baseline" / "entry_baseline" → baseline (immediate entry)
// "entry_triggered_edge_10p0_d3" → TE, trigger 10, arm C3
// "entry_triggered_edge_25p0_next" / "_same" → TE, trigger 25, arm same/next
export function parseScenarioKey(key) {
    const k = String(key || "");
    if (k === "baseline" || k === "entry_baseline") {
        return { scenarioKey: k, family: "baseline", entryModel: "baseline", triggerThreshold: null,
            armDelay: null, armLabel: null, label: "Baseline", sortTrigger: -1, sortArm: -1, known: true };
    }
    let m = k.match(/entry_triggered_edge_(\d+)p(\d+)_d(\d+)/);
    if (m) {
        const trig = Number(`${m[1]}.${m[2]}`);
        const arm = Number(m[3]);
        return { scenarioKey: k, family: "triggered_edge", entryModel: "triggered_edge",
            triggerThreshold: trig, armDelay: arm, armLabel: `C${arm}`,
            label: `${trig % 1 === 0 ? trig : trig}% · C${arm}`, sortTrigger: trig, sortArm: arm, known: true };
    }
    m = k.match(/entry_triggered_edge_(\d+)p(\d+)_(same|next)/);
    if (m) {
        const trig = Number(`${m[1]}.${m[2]}`);
        return { scenarioKey: k, family: "triggered_edge", entryModel: "triggered_edge",
            triggerThreshold: trig, armDelay: null, armLabel: m[3],
            label: `${trig}% · ${m[3]}`, sortTrigger: trig, sortArm: m[3] === "same" ? 0 : 1, known: true };
    }
    // Unknown scenario key: stable fallback label, sorted last.
    return { scenarioKey: k, family: "unknown", entryModel: "unknown", triggerThreshold: null,
        armDelay: null, armLabel: null, label: k || "unknown", sortTrigger: 1e9, sortArm: 1e9, known: false };
}

// ── scenario metrics from a raw entry_results block ─────────────────────────
function scenarioMetrics(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const netR = num(r.net_r);
    const maxDdRaw = num(r.max_drawdown_r);
    const maxDd = maxDdRaw === null ? null : Math.abs(maxDdRaw);
    const netDd = netR !== null && maxDd && maxDd > 0 ? round(netR / maxDd, 2) : null;
    // PF from gross: gross_net_r = gross_win - gross_loss ; gross_loss = |total_loss_r|
    const grossNet = num(r.gross_net_r);
    const totalLoss = num(r.total_loss_r);
    let profitFactor = null;
    if (grossNet !== null && totalLoss !== null && totalLoss < 0) {
        const grossLoss = Math.abs(totalLoss);
        const grossWin = grossNet + grossLoss;
        profitFactor = grossLoss > 0 ? round(grossWin / grossLoss, 2) : null;
    }
    const wr = num(r.win_rate);
    return {
        netR: round(netR, 2), maxDd: round(maxDd, 2), netDd, profitFactor,
        winRate: wr === null ? null : round(wr <= 1 ? wr * 100 : wr, 1),
        filledTrades: num(r.filled_trades), wins: num(r.wins), losses: num(r.losses),
        missed: num(r.missed_trades), totalRows: num(r.total_obs) ?? num(r.eligible_setups),
        // Not present per-scenario in summary.json — never fabricate.
        blockedRegime: null, portfolioBlocked: null,
        hasMetrics: netR !== null || num(r.filled_trades) !== null,
    };
}

// ── context / warm-up heuristic (no backend field yet) ──────────────────────
export function inferContextMode(config = {}) {
    const from = config.date_from || config.start_date;
    const to = config.date_to || config.end_date;
    const t0 = from ? Date.parse(from) : NaN;
    const t1 = to ? Date.parse(to) : NaN;
    if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) {
        return { mode: CONTEXT_MODES.UNKNOWN, confidence: "heuristic" };
    }
    const days = (t1 - t0) / 86400000;
    if (days < 365) return { mode: CONTEXT_MODES.COLD, confidence: "heuristic" };
    if (days >= 5 * 365) return { mode: CONTEXT_MODES.WARMED, confidence: "heuristic" };
    // Between 1 and 5 years: cannot assert warmed without a backend field. Never guess WARMED.
    return { mode: CONTEXT_MODES.UNKNOWN, confidence: "heuristic" };
}

function contextWarnings(mode) {
    if (mode === CONTEXT_MODES.COLD) return [CONTEXT_WARNINGS.cold, CONTEXT_WARNINGS.warmup, CONTEXT_WARNINGS.obs];
    if (mode === CONTEXT_MODES.UNKNOWN) return [CONTEXT_WARNINGS.warmup];
    return [];
}

// ── scenario-type classifier + base config chips (run-level) ────────────────
export function classifyScenarioType(config = {}) {
    const te = Array.isArray(config.entry_models) && config.entry_models.includes("triggered_edge");
    if (config.portfolio_policy_enabled) return "Portfolio Manager";
    if (config.session_strategy_scenario || config.session_filter_enabled) return "Session Scenario";
    if (config.regime_gate_enabled) return te ? "Market State Gate" : "Market State Gate";
    if (te) return "Triggered Edge";
    return "Raw Baseline";
}

function baseConfigChips(config = {}) {
    const chips = [];
    const rr = config.rr_multiple;
    if (rr !== undefined && rr !== null && rr !== "") chips.push(`RR${rr}`);
    if (config.regime_gate_enabled) {
        chips.push(config.regime_direction_policy === "direction_aware" ? "MS Gate · dir-aware" : "MS Gate");
    } else chips.push("MS Gate off");
    chips.push(config.portfolio_policy_enabled ? "Portfolio v1" : "PM off");
    if (config.session_strategy_scenario || config.session_filter_enabled) chips.push("Session scenario");
    else chips.push("All sessions");
    const sp = config.spread_pips, sl = config.slippage_pips;
    if (sp !== undefined || sl !== undefined) chips.push(`costs ${sp ?? "?"}/${sl ?? "?"}`);
    if (Array.isArray(config.news_blackout_impacts) && config.news_blackout_impacts.length) {
        chips.push(`news ${config.news_blackout_impacts.join("/")} ${config.news_blackout_minutes_before ?? "?"}/${config.news_blackout_minutes_after ?? "?"}m`);
    }
    if (config.stop_buffer_pips !== undefined) chips.push(`stop ${config.stop_buffer_pips}p`);
    if (config.trade_direction) chips.push(`${config.trade_direction} dirs`);
    return chips;
}

// ── canonical batch title (derived from config, NOT stale display_name) ─────
export function deriveBatchTitle(config = {}, run = {}) {
    const symbol = config.symbol || run.symbol || "?";
    const scenarioType = classifyScenarioType(config);
    const from = config.date_from || config.start_date || (run.dateRange ? String(run.dateRange).split("→")[0].trim() : "?");
    const to = config.date_to || config.end_date || (run.dateRange ? String(run.dateRange).split("→").pop().trim() : "?");
    const parts = [symbol, scenarioType];
    // entry/arm range
    const trigs = config.triggered_edge_trigger_thresholds;
    const delays = config.triggered_edge_candle_delays;
    if (Array.isArray(delays) && delays.length) {
        parts.push(`C${Math.min(...delays)}${delays.length > 1 ? `–C${Math.max(...delays)}` : ""}`);
    }
    if (Array.isArray(trigs) && trigs.length) parts.push(`${trigs.join("/")}%`);
    if (config.rr_multiple !== undefined) parts.push(`RR${config.rr_multiple}`);
    parts.push(`${formatDate(from)}→${formatDate(to)}`);
    return parts.join(" · ");
}

// ── build the whole Run Batch view-model ────────────────────────────────────
export function buildRunBatch(run = {}) {
    const config = run.config || {};
    const runId = run.id || run._bundleId || run.runId || "";
    const shortRunId = String(runId).slice(0, 8);
    const configHash = run.configHash || run.config_hash || config.config_hash || "";
    const status = run.status || "";
    const createdAt = run.createdAt || run.created_at || run.importedAt || "";
    const ctx = inferContextMode(config);

    // scenarios: entry_results.<exec_mode>.<scenario_key>. Prefer the primary exec mode.
    const erSummary = (run.entryResults && run.entryResults.summary) || run.entry_results || {};
    const execModes = erSummary && typeof erSummary === "object" ? Object.keys(erSummary) : [];
    const preferredMode = (run.executionMode && execModes.includes(run.executionMode) && run.executionMode)
        || (run.primaryVariant && execModes.includes(run.primaryVariant) && run.primaryVariant)
        || execModes[0] || null;
    const block = preferredMode ? erSummary[preferredMode] : null;

    let scenarios = [];
    if (block && typeof block === "object") {
        scenarios = Object.keys(block).map((key) => {
            const parsed = parseScenarioKey(key);
            const metrics = scenarioMetrics(block[key]);
            return {
                ...parsed, execMode: preferredMode, scenarioType: classifyScenarioType(config),
                entryModel: parsed.entryModel, rr: config.rr_multiple ?? run.rr ?? null,
                ...metrics, deltaVsBaseline: null, isBestNetR: false, isBestNetDd: false, warningFlags: [],
            };
        });
    }

    // deterministic ordering: baseline first, then trigger asc, then arm asc, unknown last
    scenarios.sort((a, b) => (a.sortTrigger - b.sortTrigger) || (a.sortArm - b.sortArm) || String(a.scenarioKey).localeCompare(String(b.scenarioKey)));

    // deltas vs baseline scenario (intra-batch, always fair)
    const baseline = scenarios.find((s) => s.family === "baseline");
    if (baseline && baseline.netR !== null) {
        scenarios.forEach((s) => {
            if (s !== baseline && s.netR !== null) {
                s.deltaVsBaseline = {
                    netR: round(s.netR - baseline.netR, 2),
                    maxDd: s.maxDd !== null && baseline.maxDd !== null ? round(s.maxDd - baseline.maxDd, 2) : null,
                };
            }
        });
    }

    // best-in-batch flags
    const withNet = scenarios.filter((s) => s.netR !== null);
    if (withNet.length) {
        const bestNet = withNet.reduce((a, b) => (b.netR > a.netR ? b : a));
        bestNet.isBestNetR = true;
    }
    const withNd = scenarios.filter((s) => s.netDd !== null);
    if (withNd.length) {
        const bestNd = withNd.reduce((a, b) => (b.netDd > a.netDd ? b : a));
        bestNd.isBestNetDd = true;
    }

    // ── compact default selection (reduce trigger×arm variant spam) ──────────
    // Best-of among TRIGGERED-EDGE variants only (baseline / PM / session / fair are shown separately).
    const te = scenarios.filter((s) => s.family === "triggered_edge");
    const teVariantCount = te.length;
    const teWithNet = te.filter((s) => s.netR !== null);
    const bestNetRTE = teWithNet.length ? teWithNet.reduce((a, b) => (b.netR > a.netR ? b : a)) : null;
    const teWithNd = te.filter((s) => s.netDd !== null);
    const bestNetDdTE = teWithNd.length ? teWithNd.reduce((a, b) => (b.netDd > a.netDd ? b : a)) : null;
    if (bestNetRTE) bestNetRTE.isBestNetRTE = true;
    if (bestNetDdTE) bestNetDdTE.isBestNetDdTE = true;

    // Show-all when few scenarios or ≤1 TE variant; otherwise compact to best(s) + all non-TE.
    const showAllByDefault = scenarios.length <= 3 || teVariantCount <= 1;
    let defaultScenarios;
    if (showAllByDefault) {
        defaultScenarios = scenarios;
    } else {
        const picks = new Set();
        if (bestNetRTE) picks.add(bestNetRTE.scenarioKey);
        if (bestNetDdTE && bestNetDdTE.scenarioKey !== (bestNetRTE && bestNetRTE.scenarioKey)) picks.add(bestNetDdTE.scenarioKey);
        // keep all non-TE scenarios (baseline / PM / session / fair / unknown) + the picked TE best(s)
        defaultScenarios = scenarios.filter((s) => s.family !== "triggered_edge" || picks.has(s.scenarioKey));
    }
    const shownKeys = new Set(defaultScenarios.map((s) => s.scenarioKey));
    const hiddenVariantLabels = te.filter((s) => !shownKeys.has(s.scenarioKey)).map((s) => s.label);
    const bestSummary = {
        teVariantCount,
        bestNetRLabel: bestNetRTE ? bestNetRTE.label : null,
        bestNetRNetR: bestNetRTE ? bestNetRTE.netR : null,
        bestNetDdLabel: bestNetDdTE && bestNetDdTE.scenarioKey !== (bestNetRTE && bestNetRTE.scenarioKey) ? bestNetDdTE.label : null,
        bestNetDdValue: bestNetDdTE && bestNetDdTE.scenarioKey !== (bestNetRTE && bestNetRTE.scenarioKey) ? bestNetDdTE.netDd : null,
    };

    const warnings = [];
    if (ctx.mode === CONTEXT_MODES.COLD) warnings.push("COLD WINDOW START — early trades may not match a full-history run.");
    if (ctx.mode === CONTEXT_MODES.UNKNOWN) warnings.push("Context unknown (heuristic) — warm-up state not confirmed.");
    if (!scenarios.length) warnings.push("No scenario metrics available for this run (entry_results missing).");

    const rawRange = run.dateRangeRaw || run.dateRange || `${config.date_from || config.start_date || "?"} → ${config.date_to || config.end_date || "?"}`;
    return {
        runId, shortRunId, configHashShort: String(configHash).slice(0, 8),
        title: deriveBatchTitle(config, run),
        userDisplayName: run.displayName || run.name || "",
        symbol: config.symbol || run.symbol || "",
        dateRange: formatDateRange(rawRange), dateRangeRaw: rawRange,
        scenarioType: classifyScenarioType(config),
        contextMode: ctx.mode, contextConfidence: ctx.confidence, contextWarning: contextWarnings(ctx.mode),
        baseConfigChips: baseConfigChips(config),
        status, createdAt, scenarioCount: scenarios.length,
        teVariantCount, defaultScenarios, hiddenVariantLabels, bestSummary,
        canCollapse: hiddenVariantLabels.length > 0, showAllByDefault,
        warnings, scenarios,
    };
}
