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
// Whole-month span between two YYYY-MM-DD dates (calendar months, +1 day rounding). Null when undeterminable.
export function monthSpan(from, to) {
    const a = from ? String(from).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
    const b = to ? String(to).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
    if (!a || !b) return null;
    let months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
    if (Number(b[3]) >= Number(a[3])) months += 1; // include the trailing partial month
    return months > 0 ? months : null;
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

// Structured, relevance-gated warnings. The Market-State warm-up warning appears ONLY when the Market State
// gate is actually active — never on Raw Baseline / no-gate runs. UNKNOWN context is conveyed by the header
// badge alone: it only emits a warning LINE when a context-sensitive layer (Market State warm-up) makes the
// early window genuinely uncertain. For plain / no-gate runs a heuristic UNKNOWN produces NO scary line.
function buildContextWarnings(mode, hasMsGate, usesOb = true) {
    const out = [];
    if (mode === CONTEXT_MODES.COLD) {
        // COLD is a specific, genuine condition (short window, no prior context) — keep its warnings.
        out.push({ type: "cold_short", show: true, tone: "warning", text: CONTEXT_WARNINGS.cold });
        if (usesOb) out.push({ type: "ob_before_start", show: true, tone: "warning", text: CONTEXT_WARNINGS.obs });
        if (hasMsGate) out.push({ type: "market_state_warmup", show: true, tone: "warning", text: CONTEXT_WARNINGS.warmup });
    } else if (mode === CONTEXT_MODES.UNKNOWN) {
        // Only surface a line when Market State warm-up makes it matter. Otherwise the muted UNKNOWN
        // badge in the header says enough — no generic "early-window behaviour may vary" scare.
        out.push({
            type: "unknown_note",
            show: hasMsGate,
            tone: "border-mid",
            text: hasMsGate
                ? "Context source unknown with Market State active — warm-up can affect early trades; compare short windows carefully."
                : "Context source unknown — compare short windows carefully.",
        });
    }
    return out;
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

// Config chips: a CONSISTENT slot set so every card is comparable. Each chip is {text, absent}; `absent`
// means the field was not recorded in this run's saved config (rendered muted as "n/a") rather than dropped,
// so cards no longer look like they have "missing" chips. Values are never fabricated — absent stays "n/a".
function baseConfigChips(config = {}) {
    const chips = [];
    const push = (text, absent = false) => chips.push({ text, absent });

    const rr = config.rr_multiple;
    const hasRr = rr !== undefined && rr !== null && rr !== "";
    push(hasRr ? `RR${rr}` : "RR n/a", !hasRr);

    if (config.regime_gate_enabled) push(config.regime_direction_policy === "direction_aware" ? "MS Gate · dir-aware" : "MS Gate");
    else push("MS Gate off");

    push(config.portfolio_policy_enabled ? "Portfolio v1" : "PM off");
    push(config.session_strategy_scenario || config.session_filter_enabled ? "Session scenario" : "All sessions");

    const sp = config.spread_pips, sl = config.slippage_pips;
    const hasCosts = sp !== undefined || sl !== undefined;
    push(hasCosts ? `costs ${sp ?? "?"}/${sl ?? "?"}` : "costs n/a", !hasCosts);

    // Empty/absent news list is a genuine, meaningful state ("news off"), not an unrecorded field.
    const hasNews = Array.isArray(config.news_blackout_impacts) && config.news_blackout_impacts.length;
    push(hasNews
        ? `news ${config.news_blackout_impacts.join("/")} ${config.news_blackout_minutes_before ?? "?"}/${config.news_blackout_minutes_after ?? "?"}m`
        : "news off");

    const hasStop = config.stop_buffer_pips !== undefined && config.stop_buffer_pips !== null;
    push(hasStop ? `stop ${config.stop_buffer_pips}p` : "stop n/a", !hasStop);

    const hasDir = !!config.trade_direction;
    push(hasDir ? `${config.trade_direction} dirs` : "dir n/a", !hasDir);

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

// ── scenario families ACTUALLY present + run-level layers ───────────────────
// Prefer explicit Lux metadata (run.runMetadata.scenario_families_present); else derive from the actual
// produced outputs (entry_results keys, session cohorts, scenarioBaselineResults). Never fabricate.
function entryKeysOf(run) {
    const er = (run.entryResults && run.entryResults.summary) || run.entry_results || {};
    const keys = [];
    if (er && typeof er === "object") Object.values(er).forEach((b) => { if (b && typeof b === "object") keys.push(...Object.keys(b)); });
    return keys;
}
export function deriveScenarioFamilies(config = {}, run = {}) {
    const meta = run.runMetadata || run.run_metadata;
    if (meta && Array.isArray(meta.scenario_families_present)) {
        return meta.scenario_families_present.map((f) => ({ family: f.family, label: f.label || f.family, count: f.count ?? null }));
    }
    const fams = [];
    const keys = entryKeysOf(run);
    if (keys.some((k) => k === "baseline" || k === "entry_baseline") || (Array.isArray(config.entry_models) && config.entry_models.includes("baseline"))) {
        fams.push({ family: "baseline", label: "Baseline", count: null });
    }
    const te = keys.filter((k) => String(k).startsWith("entry_triggered_edge"));
    if (te.length) fams.push({ family: "triggered_entry", label: "Triggered Entry", count: te.length });
    const sess = config.session_strategy_scenario;
    if (sess && typeof sess === "object" && sess.enabled) {
        const enabled = (sess.cohorts || []).filter((c) => c && c.enabled).length;
        if (enabled) fams.push({ family: "session_scenarios", label: "Session Scenarios", count: enabled });
    }
    const sbr = run.scenarioBaselineResults;
    const fairFromBundle = !!sbr && ((Array.isArray(sbr.sourceFiles) && sbr.sourceFiles.length > 0)
        || (sbr.tradesByMode && Object.values(sbr.tradesByMode).some((t) => Array.isArray(t) && t.length > 0)));
    const sb = run.scenario_baseline || (run.summary && run.summary.scenario_baseline);
    const fairFromSummary = !!sb && sb.enabled && !(Array.isArray(sb.warnings) && sb.warnings.length > 0) && Number(sb.eligible_cohort_count || 0) > 0;
    if (fairFromBundle || fairFromSummary) fams.push({ family: "fair_baseline", label: "Fair Baseline", count: sb ? (sb.eligible_cohort_count ?? null) : null });
    return fams;
}
export function deriveLayers(config = {}, run = {}) {
    const meta = run.runMetadata || run.run_metadata;
    if (meta && Array.isArray(meta.layers)) {
        return meta.layers.map((l) => ({ layer: l.layer, label: l.label || l.layer, directionAware: !!l.direction_aware }));
    }
    const layers = [];
    if (config.regime_gate_enabled) layers.push({ layer: "market_state_gate", label: "Market State Gate", directionAware: config.regime_direction_policy === "direction_aware" });
    if (config.portfolio_policy_enabled) layers.push({ layer: "portfolio_manager", label: "Portfolio Manager", directionAware: false });
    const sess = config.session_strategy_scenario;
    if (sess && typeof sess === "object" && sess.enabled) layers.push({ layer: "session_policy", label: "Session Policy", directionAware: false });
    return layers;
}
// Group triggered-entry variants by trigger threshold → [{ trigger:"10%", arms:["C2","C3","C4","C5"] }]
export function deriveTriggerVariantGroups(run = {}) {
    const keys = entryKeysOf(run).filter((k) => String(k).startsWith("entry_triggered_edge"));
    const map = new Map();
    keys.forEach((k) => {
        const p = parseScenarioKey(k);
        if (p.triggerThreshold === null || p.triggerThreshold === undefined) return;
        const t = `${p.triggerThreshold}%`;
        if (!map.has(t)) map.set(t, { trigger: t, triggerNum: p.triggerThreshold, arms: [] });
        map.get(t).arms.push({ label: p.armLabel || "?", sort: p.armDelay ?? p.sortArm ?? 1e9 });
    });
    const groups = [...map.values()].sort((a, b) => a.triggerNum - b.triggerNum);
    return groups.map((g) => ({ trigger: g.trigger, arms: g.arms.sort((a, b) => a.sort - b.sort).map((a) => a.label) }));
}

// Major run-content items with explicit status: 'ran' | 'active' | 'not_run' | 'no_output'.
// Keeps ACTIVE (ran/active) strictly separate from ABSENT (not_run/no_output) — never mixed.
export function deriveMajorStatus(config = {}, run = {}, ranFamilies = [], activeLayers = []) {
    const ranSet = new Set(ranFamilies.map((f) => f.family));
    const layerSet = new Set(activeLayers.map((l) => l.layer));
    const teCount = (ranFamilies.find((f) => f.family === "triggered_entry") || {}).count || null;
    const sessCount = (ranFamilies.find((f) => f.family === "session_scenarios") || {}).count || null;
    const msLayer = activeLayers.find((l) => l.layer === "market_state_gate");
    const sb = run.scenario_baseline || (run.summary && run.summary.scenario_baseline);
    let fairStatus;
    if (ranSet.has("fair_baseline")) fairStatus = "ran";
    else if (sb && sb.enabled) fairStatus = "no_output"; // requested/configured but produced nothing
    else fairStatus = "not_run";
    return [
        { key: "market_state_gate", label: "Market State Gate", status: layerSet.has("market_state_gate") ? "active" : "not_run", directionAware: !!(msLayer && msLayer.directionAware) },
        { key: "portfolio_manager", label: "Portfolio Manager", status: layerSet.has("portfolio_manager") ? "active" : "not_run" },
        { key: "session_scenarios", label: "Session Scenarios", status: ranSet.has("session_scenarios") ? "ran" : "not_run", count: sessCount },
        { key: "triggered_entry", label: "Triggered Entry", status: ranSet.has("triggered_entry") ? "ran" : "not_run", count: teCount },
        { key: "fair_baseline", label: "Fair Baseline", status: fairStatus },
    ];
}

function resolveContext(config = {}, run = {}) {
    const meta = run.runMetadata || run.run_metadata;
    const modeMap = { cold_window_start: CONTEXT_MODES.COLD, window_with_preload: CONTEXT_MODES.PRELOAD, full_history_warmed: CONTEXT_MODES.WARMED, unknown: CONTEXT_MODES.UNKNOWN };
    if (meta && meta.context && meta.context.context_mode && meta.context.context_mode !== "unknown") {
        return { mode: modeMap[meta.context.context_mode] || CONTEXT_MODES.UNKNOWN, confidence: "explicit",
            requestedStart: meta.context.requested_start || null, requestedEnd: meta.context.requested_end || null,
            warmupStart: meta.context.warmup_start || null };
    }
    const h = inferContextMode(config);
    return { mode: h.mode, confidence: h.confidence,
        requestedStart: config.date_from || config.start_date || null, requestedEnd: config.date_to || config.end_date || null, warmupStart: null };
}

// ── build the whole Run Batch view-model ────────────────────────────────────
export function buildRunBatch(run = {}) {
    const config = run.config || {};
    const runId = run.id || run._bundleId || run.runId || "";
    const shortRunId = String(runId).slice(0, 8);
    const configHash = run.configHash || run.config_hash || config.config_hash || "";
    const status = run.status || "";
    const createdAt = run.createdAt || run.created_at || run.importedAt || "";
    const ctx = resolveContext(config, run);
    const scenarioFamilies = deriveScenarioFamilies(config, run);
    const activeLayers = deriveLayers(config, run);
    const majorStatus = deriveMajorStatus(config, run, scenarioFamilies, activeLayers);
    const notRunMajor = majorStatus.filter((m) => m.status === "not_run" || m.status === "no_output");
    const triggerVariantGroups = deriveTriggerVariantGroups(run);
    const hasMsGate = activeLayers.some((l) => l.layer === "market_state_gate");
    // OB-based strategy: baseline / triggered-edge / penetration entries all rely on order blocks that may
    // form before a cold window starts. Defaults true (the strategy is order-block based) when unspecified.
    const usesOb = Array.isArray(config.entry_models)
        ? config.entry_models.some((m) => /baseline|triggered|edge|penetration|order/i.test(String(m)))
        : true;
    const structuredWarnings = buildContextWarnings(ctx.mode, hasMsGate, usesOb);

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
    const spanMonths = monthSpan(
        config.date_from || config.start_date || ctx.requestedStart,
        config.date_to || config.end_date || ctx.requestedEnd,
    );
    return {
        runId, shortRunId, configHashShort: String(configHash).slice(0, 8),
        title: deriveBatchTitle(config, run),
        userDisplayName: run.displayName || run.name || "",
        symbol: config.symbol || run.symbol || "",
        dateRange: formatDateRange(rawRange), dateRangeRaw: rawRange, spanMonths,
        scenarioType: classifyScenarioType(config),
        contextMode: ctx.mode, contextConfidence: ctx.confidence,
        contextWarnings: structuredWarnings,
        contextWarning: structuredWarnings.filter((w) => w.show).map((w) => w.text), // back-compat (strings)
        requestedStart: ctx.requestedStart, requestedEnd: ctx.requestedEnd, warmupStart: ctx.warmupStart,
        activeLayers, scenarioFamilies, ranFamilies: scenarioFamilies,
        majorStatus, notRunMajor, triggerVariantGroups,
        baseConfigChips: baseConfigChips(config),
        status, createdAt, scenarioCount: scenarios.length,
        teVariantCount, defaultScenarios, hiddenVariantLabels, bestSummary,
        canCollapse: hiddenVariantLabels.length > 0, showAllByDefault,
        warnings, scenarios,
    };
}
