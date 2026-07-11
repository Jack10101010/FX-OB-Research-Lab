// marketStateLens.js — Market-State lens over cohort rows (Phase 1, read-only).
//
// PURE, dependency-light. Groups a cohort's EXECUTED rows by canonical market state
// so the Management drilldown can re-run the EXISTING analysis helpers
// (cohortTargetEconomics / cohortExcursionSnapshot / cohortBESuitability / …) on a
// state-filtered subset. NO new target-analysis math lives here — this module only
// buckets rows and reports provenance/sample facts.
//
// HARD CONSTRAINTS:
//   • Never mutates rows. Never re-implements indicator or target math.
//   • "Whole cohort" is NOT a bucket here — callers pass the ORIGINAL rows array
//     through untouched for the whole-cohort view, so existing behaviour is
//     byte-identical when no state is selected.
//   • State resolution is ENGINE-PREFERRED (trade.regimeEmit, source:"engine") with
//     the client daily-panel fallback (source:"client") — the exact same
//     resolveTradeMarketState the TradeInspector uses. Rows that resolve to no
//     state land in an explicit UNLABELLED bucket; buckets always partition the
//     input (Σ bucket sizes === rows.length).
//
// SEMANTICS (do not blur): these buckets are LIVE MFE-RESCORE EVIDENCE surfaces.
// They are not state recommendations, not PM actions, and not validated findings.
// Recommendation status comes later from a versioned target-policy document; until
// then consumers must render "Not researched".

import { MARKET_STATES } from "./marketState";
import { resolveTradeMarketState } from "./marketStateSource";
import { classifyTrade } from "./tradeClassification";

// Canonical selector order: 6 engine states then the explicit Unlabelled bucket.
export const UNLABELLED_KEY = "unlabelled";
export const STATE_LENS_STATES = Object.freeze([...MARKET_STATES]);
export const STATE_LENS_KEYS = Object.freeze([...MARKET_STATES, UNLABELLED_KEY]);

// Display labels. Long for the selector, short for matrix columns / glyph strips.
export const STATE_LABELS = Object.freeze({
    "Bull/Expand": "Bull Expand",
    "Bull/Compress": "Bull Compress",
    "Bull/Chop": "Bull Chop",
    "Bear/Expand": "Bear Expand",
    "Bear/Compress": "Bear Compress",
    "Bear/Chop": "Bear Chop",
    [UNLABELLED_KEY]: "Unlabelled",
});
export const STATE_SHORT_LABELS = Object.freeze({
    "Bull/Expand": "B/Exp",
    "Bull/Compress": "B/Com",
    "Bull/Chop": "B/Chp",
    "Bear/Expand": "Be/Exp",
    "Bear/Compress": "Be/Com",
    "Bear/Chop": "Be/Chp",
    [UNLABELLED_KEY]: "Unlab",
});

// Mirror of cohortTargetEconomics' too_small gate (decided < 8 ⇒ guidance suppressed).
// Kept as a named constant so the matrix/glyphs and the economics card agree.
export const MIN_DECIDED_FOR_READ = 8;

const mfeOf = (t) => { const n = Number(t?.mfeR ?? t?.mfe_r); return Number.isFinite(n) ? n : null; };

/**
 * Resolve one row's lens bucket key + provenance.
 * Returns { key, source } where key ∈ STATE_LENS_KEYS and source ∈
 * "engine" | "client" | null (null ⇔ Unlabelled).
 * Unknown/non-canonical state strings also fall to Unlabelled (never silently dropped).
 */
export function rowStateKey(row, panel) {
    const snap = resolveTradeMarketState(row, panel);
    const ms = snap && snap.marketState ? String(snap.marketState) : null;
    if (ms && MARKET_STATES.includes(ms)) return { key: ms, source: snap.source || null };
    return { key: UNLABELLED_KEY, source: null };
}

/**
 * Group EXECUTED rows into the 6+1 lens buckets (partition — every row lands in
 * exactly one bucket). Also reports per-bucket executed / decided-with-MFE counts
 * and a provenance summary so the UI can render the state-source badge honestly.
 *
 * @param {object[]} rows   cohort executedTrades (already bucketed by sessionResults)
 * @param {object|null} panel  client daily regime panel (marketState.js) or null
 * @returns {{
 *   byState: Map<string, object[]>,        // key ∈ STATE_LENS_KEYS (always all keys)
 *   counts:  Object<string, {executed:number, decided:number}>,
 *   sources: { engine:number, client:number, unlabelled:number },
 *   total:   number,
 * }}
 */
export function groupRowsByMarketState(rows, panel = null) {
    const list = Array.isArray(rows) ? rows : [];
    const byState = new Map(STATE_LENS_KEYS.map((k) => [k, []]));
    const sources = { engine: 0, client: 0, unlabelled: 0 };
    for (const row of list) {
        const { key, source } = rowStateKey(row, panel);
        byState.get(key).push(row);
        if (source === "engine") sources.engine += 1;
        else if (source === "client") sources.client += 1;
        else sources.unlabelled += 1;
    }
    const counts = {};
    for (const k of STATE_LENS_KEYS) {
        const bucket = byState.get(k);
        counts[k] = { executed: bucket.length, decided: decidedWithMfeCount(bucket) };
    }
    return { byState, counts, sources, total: list.length };
}

/**
 * Decided (WIN/LOSS) rows carrying a valid MFE — the exact retargetable set
 * cohortTargetEconomics reconstructs over. Used for sample glyphs so the matrix
 * agrees with the economics card's too_small gate.
 */
export function decidedWithMfeCount(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let n = 0;
    for (const t of list) {
        const cat = classifyTrade(t);
        if ((cat === "WIN" || cat === "LOSS") && mfeOf(t) != null) n += 1;
    }
    return n;
}

/**
 * Phase-1 sample/status read for one cohort×state cell. There is NO persisted
 * target-policy document yet, so the RECOMMENDATION for every cell is
 * "not researched" — this helper only distinguishes how much LIVE EVIDENCE exists:
 *   kind "none"         — no executed trades in this state ("—")
 *   kind "insufficient" — decided < MIN_DECIDED_FOR_READ ("•", guidance suppressed)
 *   kind "evidence"     — enough decided trades for the rescore grid to gate reads
 * All three carry recommendation:"not_researched" until the policy doc exists.
 */
export function stateCellStatus(counts) {
    const executed = counts ? counts.executed : 0;
    const decided = counts ? counts.decided : 0;
    if (!executed) return { kind: "none", glyph: "—", recommendation: "not_researched", executed, decided };
    if (decided < MIN_DECIDED_FOR_READ) {
        return { kind: "insufficient", glyph: "•", recommendation: "not_researched", executed, decided };
    }
    return { kind: "evidence", glyph: String(decided), recommendation: "not_researched", executed, decided };
}

/**
 * Native cell statistics for a state's EXECUTED rows — actual backend outcomes only
 * (never rescore estimates): n, W/L/NF, WR, PF, Net R, sequential Max DD and the
 * longest losing streak (fill-time order). Pure; reuses classifyTrade semantics.
 */
export function nativeCellStats(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const rOf = (t) => { const n = Number(t?.netR ?? t?.net_r ?? t?.pnl_r); return Number.isFinite(n) ? n : 0; };
    let w = 0, l = 0, nf = 0, net = 0, gp = 0, gl = 0;
    const seq = [...list].sort((a, b) => String(a.entry || a.fillTime || "").localeCompare(String(b.entry || b.fillTime || "")));
    let eq = 0, peak = 0, dd = 0, streak = 0, worstStreak = 0;
    for (const t of seq) {
        const cat = classifyTrade(t);
        const r = rOf(t);
        if (cat === "WIN" || cat === "NEWS_FLATTEN_WIN") { w += 1; streak = 0; }
        else if (cat === "LOSS" || cat === "NEWS_FLATTEN_LOSS") { l += 1; streak += 1; worstStreak = Math.max(worstStreak, streak); }
        if (cat === "NEWS_FLATTEN_WIN" || cat === "NEWS_FLATTEN_LOSS" || cat === "NEWS_FLATTEN_FLAT") nf += 1;
        net += r; if (r > 0) gp += r; else if (r < 0) gl += -r;
        eq += r; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak);
    }
    const decided = w + l;
    return {
        n: list.length, w, l, nf,
        wr: decided ? Number(((100 * w) / decided).toFixed(1)) : null,
        pf: gl > 0 ? Number((gp / gl).toFixed(2)) : null,
        netR: Number(net.toFixed(2)),
        maxDD: Number(dd.toFixed(2)),
        worstLossStreak: worstStreak,
    };
}

/** Era split (2015–2019 / 2020–2022 / 2023–2024 / 2025+) of nativeCellStats. */
export const ERA_KEYS = Object.freeze(["2015-2019", "2020-2022", "2023-2024", "2025+"]);
export function eraOfRow(t) {
    const y = Number(String(t?.entry || t?.fillTime || t?.fill_time || "").slice(0, 4));
    if (!Number.isFinite(y)) return null;
    return y <= 2019 ? "2015-2019" : y <= 2022 ? "2020-2022" : y <= 2024 ? "2023-2024" : "2025+";
}
export function eraSplitStats(rows) {
    const buckets = { "2015-2019": [], "2020-2022": [], "2023-2024": [], "2025+": [] };
    for (const t of Array.isArray(rows) ? rows : []) {
        const e = eraOfRow(t);
        if (e) buckets[e].push(t);
    }
    const out = {};
    for (const k of ERA_KEYS) out[k] = nativeCellStats(buckets[k]);
    return out;
}

/**
 * Plateau score for a rescore ladder: how many CONTIGUOUS levels around the best
 * level hold ≥80% of its Est Net R (only meaningful when the best is positive).
 * ≥3 = broad plateau; 1 = isolated spike (the study's artifact gate).
 */
export function plateauScore(levels, bestLevel) {
    const list = Array.isArray(levels) ? levels : [];
    const idx = list.findIndex((x) => x && x.level === bestLevel);
    if (idx < 0) return 0;
    const best = list[idx];
    if (best.estNetR == null || best.estNetR <= 0) return 0;
    const thr = 0.8 * best.estNetR;
    let width = 1;
    for (let i = idx - 1; i >= 0 && list[i].estNetR != null && list[i].estNetR >= thr; i--) width += 1;
    for (let i = idx + 1; i < list.length && list[i].estNetR != null && list[i].estNetR >= thr; i++) width += 1;
    return width;
}

/**
 * The RUN's executed state policy for one cohort, read from its scenario rule
 * (session_strategy_scenario cohorts[].state_overrides). Returns per-state
 * { mode, rr } with "inherit" when unspecified; null when the run has no scenario.
 */
export function executedStatePolicy(scenarioConfig, sessionKey, structure, direction) {
    if (!scenarioConfig || scenarioConfig.enabled !== true || !Array.isArray(scenarioConfig.cohorts)) return null;
    const row = scenarioConfig.cohorts.find((c) => c && c.session === sessionKey
        && c.structure === structure && c.direction === direction);
    if (!row) return null;
    const so = row.state_overrides && typeof row.state_overrides === "object" ? row.state_overrides : {};
    const out = { baseRR: row.target && Number.isFinite(Number(row.target.rr)) ? Number(row.target.rr) : null, states: {} };
    for (const st of MARKET_STATES) {
        const ov = so[st];
        out.states[st] = ov && typeof ov === "object"
            ? { mode: String(ov.mode || "inherit"), rr: Number.isFinite(Number(ov.rr)) ? Number(ov.rr) : null }
            : { mode: "inherit", rr: null };
    }
    return out;
}

/**
 * Human summary of state provenance for the badge:
 *   all engine → "Engine"; all client → "Client reconstruction"; mixed → "Mixed";
 *   nothing resolved → "None".
 */
export function stateSourceSummary(sources) {
    const e = sources?.engine || 0, c = sources?.client || 0, u = sources?.unlabelled || 0;
    if (e > 0 && c === 0) return { key: "engine", label: "Engine", detail: u ? `${u} unlabelled` : "" };
    if (c > 0 && e === 0) return { key: "client", label: "Client reconstruction", detail: u ? `${u} unlabelled` : "" };
    if (e > 0 && c > 0) return { key: "mixed", label: "Mixed (engine + client)", detail: `${e} engine · ${c} client${u ? ` · ${u} unlabelled` : ""}` };
    return { key: "none", label: "None", detail: "No market-state labels resolved for this run." };
}

/**
 * Is this run's EXECUTED population state-complete for target research?
 * PM enforce mode and the regime filter both remove candidates BEFORE fill —
 * removed candidates have no MFE, so per-state target curves from such runs are
 * conditioned samples. PM label mode / regime label mode do not remove anything.
 * Returns { filtered, reasons:[…] } from the run config + observed blocked rows.
 *
 * MISSING-MODE DEFAULTS (audited against Lux, 2026-07-10): the "label" fallback
 * exactly mirrors the backend —
 *   • BacktestConfig defaults: portfolio_policy_mode="label", regime_gate_mode="label";
 *   • each mode field shipped in the SAME commit as its enable flag
 *     (regime: f6740c6 2026-07-01 · PM: 354b293 2026-07-02), so no run can have
 *     enabled=true with its mode field absent;
 *   • run config.json is a full dataclass asdict() dump — fields are never
 *     partially present; pre-feature runs carry NEITHER key, and their enable
 *     flags read falsy here (correct: those runs had no pre-fill state gate).
 * Belt-and-braces: `portfolioBlockedTotal` counts observed REGIME_BLOCKED rows,
 * which BOTH the regime filter and PM enforce emit — so even a hand-edited
 * config cannot present a blocked run as state-complete.
 */
export function statePopulationScope(cfg, { portfolioBlockedTotal = 0 } = {}) {
    const c = cfg || {};
    const truthy = (v) => v === true || String(v) === "true";
    const reasons = [];
    const pmEnabled = truthy(c.portfolio_policy_enabled);
    const pmMode = String(c.portfolio_policy_mode || "label").toLowerCase();
    if (pmEnabled && pmMode === "enforce") reasons.push("Portfolio Manager ran in ENFORCE mode");
    if (!reasons.length && portfolioBlockedTotal > 0) reasons.push("run contains PM-blocked (REGIME_BLOCKED) candidates");
    const gateOn = truthy(c.regime_gate_enabled);
    const gateMode = String(c.regime_gate_mode || "label").toLowerCase();
    if (gateOn && gateMode === "filter") reasons.push("regime gate ran in FILTER mode");
    return { filtered: reasons.length > 0, reasons };
}
