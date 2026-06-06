// ─── Master Controls — exact frontend cost rescore (Phase 7A) ────────────────
//
// Pure utility (NO React, NO store, NO sidecar). Recomputes spread / slippage /
// commission EXACTLY for an already-imported run bundle, without a backend run.
//
// Model (confirmed by the importer's separate columns gross_r / *_cost_r / net_r):
//   net_r = gross_r − spread_cost_r − slippage_cost_r − commission_r
//   spread_cost_r = spread_pips / risk_pips      (risk_pips fixed per trade)
//   slippage_cost_r = slippage_pips / risk_pips
//   commission_r = commission_r_per_trade        (flat R per trade)
// Costs are post-hoc R deductions on already-determined trades, so changing them
// rescales linearly and NEVER changes which trades won/lost. Therefore this util
// PRESERVES the original `outcome` and does NOT re-derive wins/losses from the new
// R sign. Only net R / avg R / max DD / equity move.
//
// Exactness is conservative: if a run lacks separable gross/cost data (and no pip
// geometry fallback is possible) we return { ok:false, exact:false } rather than
// guessing. Never mutates the input bundle.

export const COST_KEYS = ["spread", "slippage", "commission"];

const EPS = 1e-9;

/** Coerce to a finite number, else null. */
function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Pick a finite numeric field from an object across alias keys, else null. */
function pickNum(obj, ...keys) {
    if (!obj) return null;
    for (const k of keys) {
        const n = num(obj[k]);
        if (n !== null) return n;
    }
    return null;
}

/**
 * True iff every dirty field is a cost field (and at least one is dirty).
 * Accepts an array or a Set.
 */
export function isCostOnlyDirty(dirtyFieldList) {
    const list = Array.isArray(dirtyFieldList)
        ? dirtyFieldList
        : [...(dirtyFieldList || [])];
    if (!list.length) return false;
    return list.every((k) => COST_KEYS.includes(k));
}

/** Pick the trade list to rescore: primary variant → bundle.trades → largest variant. */
function pickTrades(bundle) {
    if (!bundle || typeof bundle !== "object") return [];
    const tbv = bundle.tradesByVariant && typeof bundle.tradesByVariant === "object" ? bundle.tradesByVariant : {};
    const primary = bundle.primaryVariant;
    if (primary && Array.isArray(tbv[primary])) return tbv[primary];
    if (Array.isArray(bundle.trades) && bundle.trades.length) return bundle.trades;
    const arrays = Object.values(tbv).filter(Array.isArray);
    return arrays.slice().sort((a, b) => b.length - a.length)[0] || [];
}

/** Old config cost settings from the bundle's raw config.json. */
function readOldCosts(bundle) {
    const cfg = bundle?.config && typeof bundle.config === "object" ? bundle.config : {};
    return {
        spread:     pickNum(cfg, "spread_pips", "spreadPips", "spread"),
        slippage:   pickNum(cfg, "slippage_pips", "slippagePips", "slippage"),
        commission: pickNum(cfg, "commission_r_per_trade", "commissionRPerTrade", "commission"),
    };
}

/** Pip size from config/summary, or null (no silent default). */
function readPipSize(bundle) {
    const cfg = bundle?.config && typeof bundle.config === "object" ? bundle.config : {};
    const sm = bundle?.summary && typeof bundle.summary === "object" ? bundle.summary : {};
    const fromCfg = pickNum(cfg, "pip_size", "pipSize", "pip", "pip_value", "pipValue");
    if (fromCfg !== null && fromCfg > 0) return fromCfg;
    const fromSm = pickNum(sm, "pip_size", "pipSize", "pip", "pip_value", "pipValue");
    if (fromSm !== null && fromSm > 0) return fromSm;
    return null;
}

/** Risk distance in pips for a trade, or null when not derivable. */
function riskPipsFor(trade, pipSize) {
    if (pipSize === null || !(pipSize > 0)) return null;
    const entry = num(trade.entryPrice ?? trade.entry_price);
    const stop = num(trade.stop ?? trade.stop_loss);
    if (entry === null || stop === null) return null;
    const rp = Math.abs(entry - stop) / pipSize;
    return rp > 0 ? rp : null;
}

/**
 * Compute the NEW cost-in-R for a pip-based cost (spread / slippage).
 *   Path 1 (preferred, no pip size): linear scale from the existing component.
 *   Path 2: both old & new pips are 0 → cost is 0.
 *   Path 3 (geometry): newPips / riskPips, needs pip size.
 * Returns { value, exact:true } or { exact:false }.
 */
function newPipCostR(oldPips, newPips, oldComponentR, riskPips) {
    const oldP = num(oldPips);
    const newP = num(newPips);
    if (newP === null) return { exact: false };
    if (oldComponentR !== null && oldP !== null && oldP !== 0) {
        return { value: oldComponentR * (newP / oldP), exact: true };
    }
    if (newP === 0) {
        return { value: 0, exact: true };
    }
    if (riskPips !== null && riskPips > 0) {
        return { value: newP / riskPips, exact: true };
    }
    return { exact: false };
}

/** Max drawdown as a positive R magnitude (compatible with fmtPreviewDd). */
function maxDrawdownFromSeries(cumSeries) {
    if (!cumSeries.length) return null;
    let peak = cumSeries[0];
    let maxDd = 0;
    for (const v of cumSeries) {
        if (v > peak) peak = v;
        const dd = peak - v;
        if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
}

/** Wins/losses from ORIGINAL outcomes (never from the new R sign). */
function countOriginalOutcomes(trades) {
    let wins = 0;
    let losses = 0;
    for (const t of trades) {
        const o = String(t?.outcome ?? "").toLowerCase();
        if (o === "win") { wins++; continue; }
        if (o === "loss") { losses++; continue; }
        // No outcome label — fall back to the ORIGINAL R sign (pre-rescore), not the new one.
        const r = num(t?.r ?? t?.netR ?? t?.net_r);
        if (r !== null) { if (r > 0) wins++; else if (r < 0) losses++; }
    }
    return { wins, losses };
}

/**
 * Structural precheck: can this bundle be cost-rescored exactly at all?
 * Requires trades plus evidence that gross is separable from net (a real gross_r
 * column, or any exported per-component cost), so we never treat a net-only R as gross.
 */
export function canRescoreCosts(bundle) {
    const trades = pickTrades(bundle);
    if (!trades.length) return false;
    for (const t of trades) {
        const g = num(t.grossR ?? t.gross_r);
        const n = num(t.netR ?? t.net_r ?? t.r);
        if (g !== null && n !== null && Math.abs(g - n) > EPS) return true;
        if (num(t.spreadCostR ?? t.spread_cost_r) !== null) return true;
        if (num(t.slippageCostR ?? t.slippage_cost_r) !== null) return true;
        if (num(t.commissionR ?? t.commission_r) !== null) return true;
    }
    return false;
}

const FAIL = (reason) => ({ ok: false, exact: false, reason });

/**
 * Recompute spread/slippage/commission exactly for an imported bundle.
 *
 * @param {object} bundle  ingestRunBundle-shaped bundle (preview.bundle or active).
 * @param {{spread:number, slippage:number, commission:number}} costs  NEW cost config.
 * @returns {{ ok, exact, reason, trades?, netR?, avgR?, maxDd?, equityCurve?, wins?, losses?, winRate? }}
 */
export function rescoreCostsForBundle(bundle, costs) {
    const trades = pickTrades(bundle);
    if (!trades.length) return FAIL("No trades available to rescore.");
    if (!canRescoreCosts(bundle)) return FAIL("Exact cost rescore unavailable for this run.");

    const old = readOldCosts(bundle);
    const pipSize = readPipSize(bundle);
    const newSpread = num(costs?.spread);
    const newSlippage = num(costs?.slippage);
    const newCommission = num(costs?.commission) ?? 0; // flat R per trade; default 0

    const rescored = [];
    let cum = 0;
    const cumSeries = [];

    for (const t of trades) {
        const grossR = num(t.grossR ?? t.gross_r);
        const oldNetR = num(t.netR ?? t.net_r ?? t.r);
        if (grossR === null) return FAIL("Exact cost rescore unavailable for this run.");

        // Per-trade separability guard: never treat a net-only R as gross.
        const sc = num(t.spreadCostR ?? t.spread_cost_r);
        const slc = num(t.slippageCostR ?? t.slippage_cost_r);
        const cc = num(t.commissionR ?? t.commission_r);
        const separable =
            (oldNetR !== null && Math.abs(grossR - oldNetR) > EPS) ||
            sc !== null || slc !== null || cc !== null;
        if (!separable) return FAIL("Exact cost rescore unavailable for this run.");

        const riskPips = riskPipsFor(t, pipSize);
        const newSc = newPipCostR(old.spread, newSpread, sc, riskPips);
        const newSlc = newPipCostR(old.slippage, newSlippage, slc, riskPips);
        if (!newSc.exact || !newSlc.exact) {
            return FAIL("Exact cost rescore unavailable for this run.");
        }

        const totalCostR = newSc.value + newSlc.value + newCommission;
        const newNetR = grossR - totalCostR;

        rescored.push({
            ...t,
            // R fields all carry the recomputed NET R (the value equity/summary read).
            r: newNetR,
            netR: newNetR,
            net_r: newNetR,
            // Updated cost components.
            spreadCostR: newSc.value,
            spread_cost_r: newSc.value,
            slippageCostR: newSlc.value,
            slippage_cost_r: newSlc.value,
            commissionR: newCommission,
            commission_r: newCommission,
            totalCostR,
            total_cost_r: totalCostR,
            // outcome / direction / prices left untouched.
        });

        cum += newNetR;
        cumSeries.push(cum);
    }

    const netR = rescored.reduce((s, t) => s + (Number(t.r) || 0), 0);
    const tradesN = rescored.length;
    const avgR = tradesN > 0 ? netR / tradesN : null;
    const maxDd = maxDrawdownFromSeries(cumSeries);
    const equityCurve = cumSeries.map((v, i) => ({ i, netR: Number(v.toFixed(4)) }));

    // wins/losses/winRate preserved from ORIGINAL outcomes — cost does not change them.
    const { wins, losses } = countOriginalOutcomes(trades);
    const denom = wins + losses;
    const winRate = denom > 0 ? (wins / denom) * 100 : null;

    return {
        ok: true,
        exact: true,
        reason: "",
        trades: rescored,
        netR,
        avgR,
        maxDd,
        equityCurve,
        wins,
        losses,
        winRate,
    };
}
