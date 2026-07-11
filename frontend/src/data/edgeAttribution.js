// edgeAttribution.js — Run Intelligence / Edge Attribution.
//
// PURE, client-side. Given the active scenario's FILLED trades (the same
// displayTrades the other Run Detail tabs use), it computes where a run's edge
// comes from, where it leaks, how concentrated it is, what to research next —
// and, per cohort, whether it is actually WORTH TRADING (label + flags).
//
// HARD RULE: edge attribution uses ONLY pre-trade / settled-outcome facts —
// net R, gross win/loss R, direction, structure, session, fill timestamp,
// OB width, stop geometry, execution cost R. It NEVER uses outcome-leaky,
// measured-over-the-trade-life fields (max_ob_penetration, MFE/MAE,
// fill_penetration). See EDGE_LEAKY_FIELDS.

export const EDGE_LEAKY_FIELDS = [
    "max_ob_penetration_pct", "max_ob_penetration_pips", "mfe_r", "mae_r",
    "fill_penetration_pct", "r_if_no_target",
];

const LOW_SAMPLE_N = 20;     // below this, a cohort is "low sample"
const HIGH_VOLUME_N = 35;    // at/above this, a cohort is "high volume"
const LOW_EXP_R = 0.03;      // expectancy below this is "low edge"
const DEAD_NET_R = 2;        // |net R| at/under this (with volume) is dead weight
const SESSION_ORDER = ["Asia", "London", "London Lull", "New York", "NY PM", "Outside"];

export const DEAD_WEIGHT_LABELS = ["Dead weight", "High volume, low edge"];
export const COHORT_LABEL_TONE = {
    "Engine": "success", "Positive": "success",
    "Strong but low sample": "warning", "Fragile": "warning", "Cost-sensitive": "warning",
    "High volume, low edge": "muted", "Dead weight": "muted", "Low sample": "muted",
    "Mild drain": "danger", "Drain": "danger", "—": "muted",
};

// Decision axis (Trade / Conditional / Avoid / Insufficient Evidence) → chip colour
export const DECISION_TONE = {
    "Trade": "success", "Conditional": "warning", "Avoid": "danger", "Insufficient Evidence": "muted",
};
// flag code → human reason (the "why" behind a decision)
const REASON_LABELS = {
    low_sample: "Low sample", high_volume_low_net: "High turnover, low edge",
    cost_eaten: "Cost-sensitive", large_dd: "High drawdown",
    pf_marginal: "Thin PF", low_expectancy: "Thin edge",
};

// Decision + reasons, derived ONLY from already-computed, visible metrics (no hidden labels).
function decide(c) {
    const reasons = c.flags.map((f) => REASON_LABELS[f]).filter(Boolean);
    let decision;
    if (c.n < LOW_SAMPLE_N) decision = "Insufficient Evidence";            // hard gate: too few trades
    else if (c.netR < 0) { decision = "Avoid"; reasons.unshift("Drain"); } // bleeds R
    else if (Math.abs(c.netR) <= DEAD_NET_R) decision = "Avoid";           // positive but negligible edge
    else decision = c.flags.some((f) => f !== "low_sample") ? "Conditional" : "Trade";
    return { decision, reasons: [...new Set(reasons)] };
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function round(v, d = 1) { const p = 10 ** d; return Math.round(((v ?? 0) + Number.EPSILON) * p) / p; }
function dirOf(t) {
    const d = String(t.direction ?? t.dir ?? "").toLowerCase();
    if (d.startsWith("s") || d.startsWith("bear")) return "Short";
    if (d.startsWith("l") || d.startsWith("bull")) return "Long";
    return "—";
}
function rOf(t) { return num(t.r ?? t.netR ?? t.net_r ?? t.pnl_r); }
function costOf(t) { return num(t.totalCostR ?? t.total_cost_r); }
function dateOf(t) {
    const s = t.entry || t.fillTime || t.fill_time || "";
    if (!s) return null;
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function maxDrawdownR(group) {
    const ordered = [...group].sort((a, b) => ((dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0)));
    let eq = 0, peak = 0, maxDD = 0;
    for (const t of ordered) { eq += rOf(t) || 0; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - peak); }
    return round(maxDD);
}

// "Worth it?" classification — primary label + machine-readable flags.
function classifyCohort(c, ctx) {
    const absTot = Math.abs(ctx.total) || 1;
    const flags = [];
    const grossBeforeCost = c.costR != null ? c.netR + c.costR : null; // net is after cost
    if (c.n < LOW_SAMPLE_N) flags.push("low_sample");
    if (c.n >= HIGH_VOLUME_N && Math.abs(c.netR) < Math.max(DEAD_NET_R, 0.05 * absTot)) flags.push("high_volume_low_net");
    if (c.netR > 0 && c.exp < LOW_EXP_R) flags.push("low_expectancy");
    if (c.netR > 0 && Math.abs(c.maxDD) >= c.netR) flags.push("large_dd");
    if (c.pf !== Infinity && c.pf >= 1.0 && c.pf < 1.1) flags.push("pf_marginal");
    let costEaten = false;
    if (grossBeforeCost != null && grossBeforeCost > 0 && (c.netR < 0 || c.costR >= 0.5 * grossBeforeCost)) { costEaten = true; flags.push("cost_eaten"); }

    let label;
    if (c.n === 0) label = "—";
    else if (c.netR < 0) label = c.exp <= -0.05 ? "Drain" : "Mild drain";
    else if (costEaten) label = "Cost-sensitive";
    else if (Math.abs(c.netR) <= DEAD_NET_R && c.n >= LOW_SAMPLE_N) label = c.n >= HIGH_VOLUME_N ? "High volume, low edge" : "Dead weight";
    else if (c.n < LOW_SAMPLE_N) label = c.exp >= 0.08 ? "Strong but low sample" : "Low sample";
    else if (flags.includes("large_dd") || flags.includes("pf_marginal") || flags.includes("low_expectancy")) label = "Fragile";
    else if ((c.pf === Infinity || c.pf >= 1.2) && c.exp >= 0.05) label = "Engine";
    else label = "Positive";
    return { label, flags };
}

// one cohort cell — full decision-useful stats
function cell(group, ctx) {
    const total = ctx.total;
    const rs = group.map((t) => rOf(t) || 0);
    const n = group.length;
    const netR = sum(rs);
    const winsArr = rs.filter((v) => v > 0), lossArr = rs.filter((v) => v < 0);
    const grossWinR = sum(winsArr);
    const grossLossR = -sum(lossArr); // positive magnitude
    const winCount = winsArr.length, lossCount = lossArr.length;
    const costVals = group.map(costOf).filter((v) => v != null);
    const costR = costVals.length ? sum(costVals.map(Math.abs)) : null;
    const maxDD = maxDrawdownR(group);
    const c = {
        n, netR: round(netR),
        grossWinR: round(grossWinR), grossLossR: round(grossLossR),
        winCount, lossCount,
        wr: n ? round((100 * winCount) / n, 1) : 0,
        pf: grossLossR > 0 ? round(grossWinR / grossLossR) : (grossWinR > 0 ? Infinity : 0),
        exp: round(n ? netR / n : 0, 4),
        avgWinR: round(winCount ? grossWinR / winCount : 0),
        avgLossR: round(lossCount ? -(grossLossR / lossCount) : 0),
        costR: costR == null ? null : round(costR),
        maxDD,
        contrib: total ? round((100 * netR) / total, 1) : 0,
        lowSample: n < LOW_SAMPLE_N,
        // --- efficiency (independent axes, not PF transforms) ---
        turnover: round(grossWinR + grossLossR),                                   // gross R churned (scale)
        costPct: (costR != null && netR + costR > 0) ? round((100 * costR) / (netR + costR), 0) : null, // cost drag
        ddPerNet: netR > 0 ? round(Math.abs(maxDD) / netR, 2) : null,              // risk per unit net
    };
    const { label, flags } = classifyCohort(c, ctx);
    c.label = label; c.flags = flags;
    const { decision, reasons } = decide(c);
    c.decision = decision; c.reasons = reasons;
    return c;
}

function byDim(trades, keyFn, ctx) {
    const m = new Map();
    for (const t of trades) { const k = keyFn(t); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(t); }
    return [...m.entries()].map(([key, g]) => ({ key, ...cell(g, ctx) }));
}

function concentration(units) {
    const c = [...units].sort((a, b) => b.netR - a.netR);
    const tot = sum(c.map((u) => u.netR));
    const pos = sum(c.filter((u) => u.netR > 0).map((u) => u.netR));
    const neg = sum(c.filter((u) => u.netR < 0).map((u) => u.netR));
    const cumTo = (frac) => sum(c.slice(0, Math.max(1, Math.round(frac * c.length))).map((u) => u.netR));
    const pctOfNet = (v) => (tot ? round((100 * v) / tot, 0) : null);
    return {
        units: c.length, total: round(tot), posSum: round(pos), negSum: round(neg),
        top10R: round(cumTo(0.1)), top10Pct: pctOfNet(cumTo(0.1)),
        top20R: round(cumTo(0.2)), top20Pct: pctOfNet(cumTo(0.2)),
        best: c[0] ? { key: c[0].key, netR: round(c[0].netR), pct: pctOfNet(c[0].netR) } : null,
        worst: c.length ? { key: c[c.length - 1].key, netR: round(c[c.length - 1].netR) } : null,
        list: c.map((u) => ({ key: u.key, netR: round(u.netR) })),
    };
}

export function buildEdgeAttribution(rawTrades, opts = {}) {
    const pipSize = num(opts.pipSize) || 0.0001;
    const all = Array.isArray(rawTrades) ? rawTrades : [];
    const trades = all.filter((t) => Number.isFinite(rOf(t)) && (t.entry || t.fillTime || t.fill_time));
    if (trades.length === 0) {
        return { ok: false, filled: 0, totalRows: all.length, headline: { text: "No filled trades in this run — nothing to attribute.", tone: "muted" } };
    }

    const total = sum(trades.map((t) => rOf(t) || 0));
    const ctx = { total, totalN: trades.length };
    const overall = cell(trades, ctx);
    const summary = {
        filled: overall.n, netR: overall.netR,
        pf: overall.pf === Infinity ? Infinity : round(overall.pf, 3),
        winRate: overall.wr, expectancy: overall.exp, maxDD: overall.maxDD,
        grossWinR: overall.grossWinR, grossLossR: overall.grossLossR, costR: overall.costR,
        avgWinR: overall.avgWinR, avgLossR: overall.avgLossR,
    };

    const sizeBand = (t) => {
        const w = num(t.obWidthPips ?? t.ob_width_pips ?? t.width_pips);
        if (w == null) return null;
        return w < 4 ? "0–4p" : w < 7 ? "4–7p" : w < 10 ? "7–10p" : w < 15 ? "10–15p" : "15p+";
    };
    const stopBand = (t) => {
        const ep = num(t.entryPrice ?? t.entry_price), sp = num(t.stop);
        if (ep == null || sp == null) return null;
        const pips = Math.abs(ep - sp) / pipSize;
        return pips < 5 ? "<5p" : pips < 10 ? "5–10p" : pips < 15 ? "10–15p" : pips < 25 ? "15–25p" : "25p+";
    };
    const sessOf = (t) => t.session || t.fillSession || "—";

    const cohorts = {
        direction: byDim(trades, dirOf, ctx),
        structure: byDim(trades, (t) => String(t.structure || t.structure_tag || "").toUpperCase().includes("CHOCH") ? "CHoCH" : "BOS", ctx),
        session: byDim(trades, sessOf, ctx),
        weekday: byDim(trades, (t) => { const d = dateOf(t); return d ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] : null; }, ctx),
        year: byDim(trades, (t) => { const d = dateOf(t); return d ? String(d.getUTCFullYear()) : null; }, ctx),
        month: byDim(trades, (t) => { const d = dateOf(t); return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : null; }, ctx),
        obSize: byDim(trades, sizeBand, ctx),
        stopBand: byDim(trades, stopBand, ctx),
    };
    const wdOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    cohorts.weekday.sort((a, b) => wdOrder.indexOf(a.key) - wdOrder.indexOf(b.key));
    cohorts.year.sort((a, b) => Number(a.key) - Number(b.key));

    const sessions = [...new Set(trades.map(sessOf))].sort((a, b) => (SESSION_ORDER.indexOf(a) + 1 || 99) - (SESSION_ORDER.indexOf(b) + 1 || 99));
    const matrix = sessions.map((s) => {
        const row = { session: s };
        for (const d of ["Long", "Short"]) row[d] = cell(trades.filter((t) => sessOf(t) === s && dirOf(t) === d), ctx);
        return row;
    });
    const flatCells = [];
    for (const r of matrix) for (const d of ["Long", "Short"]) if (r[d].n > 0) flatCells.push({ key: `${r.session} · ${d}`, ...r[d] });
    const sortedCells = [...flatCells].sort((a, b) => b.netR - a.netR);

    const conc = {
        monthly: concentration(cohorts.month.map((c) => ({ key: c.key, netR: c.netR }))),
        yearly: concentration(cohorts.year.map((c) => ({ key: c.key, netR: c.netR }))),
        sessionDirection: concentration(flatCells.map((c) => ({ key: c.key, netR: c.netR }))),
    };
    const posMonths = cohorts.month.filter((c) => c.netR > 0).length;
    const negMonths = cohorts.month.filter((c) => c.netR < 0).length;

    const engines = {
        positives: sortedCells.filter((c) => c.netR > 0).slice(0, 5),
        negatives: [...sortedCells].reverse().filter((c) => c.netR < 0).slice(0, 5),
        bestSession: [...cohorts.session].sort((a, b) => b.netR - a.netR)[0] || null,
        worstSession: [...cohorts.session].sort((a, b) => a.netR - b.netR)[0] || null,
        bestWeekday: [...cohorts.weekday].sort((a, b) => b.netR - a.netR)[0] || null,
        worstWeekday: [...cohorts.weekday].sort((a, b) => a.netR - b.netR)[0] || null,
    };

    // High-volume dead weight: many trades, little net edge (across session×dir + weekday + session)
    const deadPool = [
        ...flatCells,
        ...cohorts.weekday.map((c) => ({ ...c, key: `Weekday · ${c.key}` })),
        ...cohorts.session.map((c) => ({ ...c, key: `Session · ${c.key}` })),
    ];
    const deadWeight = deadPool
        .filter((c) => c.flags.includes("high_volume_low_net") || DEAD_WEIGHT_LABELS.includes(c.label))
        .sort((a, b) => b.n - a.n).slice(0, 8);

    // ---- warnings ----
    const warnings = [];
    const dirL = cohorts.direction.find((c) => c.key === "Long") || { netR: 0, n: 0 };
    const dirS = cohorts.direction.find((c) => c.key === "Short") || { netR: 0, n: 0 };
    const oneSide = total > 0 && ((dirS.netR >= 0.9 * total && dirL.netR <= 0.1 * total) || (dirL.netR >= 0.9 * total && dirS.netR <= 0.1 * total));
    if (oneSide) {
        const winSide = dirS.netR >= dirL.netR ? "Short" : "Long";
        warnings.push({ code: "one_sided", severity: "high", message: `Almost the entire edge comes from ${winSide} trades (${winSide} ${Math.max(dirS.netR, dirL.netR)}R vs ${Math.min(dirS.netR, dirL.netR)}R).` });
    }
    if (total > 0 && conc.yearly.units >= 3) {
        const yc = [...cohorts.year].sort((a, b) => b.netR - a.netR);
        const top2 = (yc[0]?.netR || 0) + (yc[1]?.netR || 0);
        if (top2 >= 0.9 * total) warnings.push({ code: "few_years", severity: "high", message: `Two years (${yc[0]?.key}, ${yc[1]?.key}) generate ~${round((100 * top2) / total, 0)}% of net R — strong regime dependence.` });
    }
    for (const w of cohorts.weekday) if (w.n >= LOW_SAMPLE_N && total > 0 && w.netR <= -0.25 * Math.abs(total)) warnings.push({ code: "neg_weekday", severity: "medium", message: `${w.key} is strongly negative (${w.netR}R, PF ${fmtPF(w.pf)}).` });
    if (total > 0 && conc.sessionDirection.best?.pct >= 80) warnings.push({ code: "concentrated", severity: "medium", message: `Edge highly concentrated — top cell ${conc.sessionDirection.best.key} = ${conc.sessionDirection.best.pct}% of net R.` });
    if (deadWeight.length) warnings.push({ code: "dead_weight", severity: "medium", message: `${deadWeight.length} high-volume cohort(s) carry little net edge (e.g. ${deadWeight[0].key}: ${deadWeight[0].n} trades, ${deadWeight[0].netR}R).` });
    if (summary.costR != null && summary.netR > 0 && summary.costR >= 0.5 * (summary.netR + summary.costR)) warnings.push({ code: "cost_eaten", severity: "medium", message: `Costs eat ~${round((100 * summary.costR) / (summary.netR + summary.costR), 0)}% of the gross edge.` });
    if (summary.filled < 50) warnings.push({ code: "low_sample", severity: "medium", message: `Low sample (${summary.filled} filled trades) — attribution is indicative, not conclusive.` });
    warnings.push({ code: "leaky_excluded", severity: "info", message: `Outcome-leaky fields excluded from attribution (${EDGE_LEAKY_FIELDS.slice(0, 3).join(", ")}…).` });

    // ---- research suggestions ----
    const suggestions = [];
    if (oneSide) suggestions.push({ id: "dir_asym", title: "Investigate long-vs-short asymmetry", rationale: "One side carries nearly the whole edge — confirm it is a real directional edge vs a period drift." });
    if (engines.worstWeekday?.netR < 0) suggestions.push({ id: "weekday", title: `Investigate ${engines.worstWeekday.key} losses`, rationale: `${engines.worstWeekday.key} drains ${engines.worstWeekday.netR}R — event-driven or regime?` });
    if (engines.negatives[0]) suggestions.push({ id: "drain_cell", title: `Investigate ${engines.negatives[0].key} behaviour`, rationale: `Largest negative cell (${engines.negatives[0].netR}R).` });
    if (deadWeight.length) suggestions.push({ id: "dead_weight", title: "Investigate high-volume dead weight", rationale: `${deadWeight.length} cohorts trade a lot for ~0R — are they noise to be down-weighted, or latent edge?` });
    const sizeOrder = ["0–4p", "4–7p", "7–10p", "10–15p", "15p+"];
    const sized = cohorts.obSize.filter((c) => c.n >= 10).sort((a, b) => sizeOrder.indexOf(a.key) - sizeOrder.indexOf(b.key));
    if (sized.length >= 3 && sized[sized.length - 1].exp > sized[0].exp) suggestions.push({ id: "ob_size", title: "Investigate the larger-OB advantage", rationale: "Expectancy rises with OB width — volatility, structure quality, or selection?" });
    suggestions.push({ id: "yearly_stability", title: "Investigate yearly / out-of-period stability", rationale: "Split-half the run and re-check whether the top cohorts survive." });

    // ============================ STRATEGY DOCTOR ============================
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
    const regimeYears = [...cohorts.year].sort((a, b) => b.netR - a.netR);
    const regimeTop2 = (regimeYears[0]?.netR || 0) + (regimeYears[1]?.netR || 0);
    const regimePct = total > 0 ? round((100 * regimeTop2) / total, 0) : null;
    const concPct = total > 0 ? (conc.sessionDirection.best?.pct ?? null) : null; // %-of-net is undefined when net ≤ 0
    const costDragPct = (summary.costR != null && summary.netR + summary.costR > 0)
        ? round((100 * summary.costR) / (summary.netR + summary.costR), 0) : null;
    const ddRatio = summary.netR > 0 ? round(Math.abs(summary.maxDD) / summary.netR, 2) : null;

    // Overall health as TRANSPARENT axis sub-scores (0–100), each from a visible value.
    const healthAxes = [
        { axis: "Profitability", score: clamp(50 + summary.expectancy * 250), detail: `exp ${summary.expectancy >= 0 ? "+" : ""}${summary.expectancy}R · PF ${fmtPF(summary.pf)}` },
        { axis: "Breadth", score: clamp((100 * posMonths) / Math.max(1, posMonths + negMonths)), detail: `${posMonths}/${posMonths + negMonths} months net +` },
        { axis: "Concentration", score: concPct == null ? 50 : clamp(100 - concPct), detail: concPct == null ? "—" : `top cell ${concPct}% of net` },
        { axis: "Regime", score: regimePct == null ? 50 : clamp(100 - regimePct), detail: regimePct == null ? "—" : `top 2 yrs ${regimePct}% of net` },
        { axis: "Cost", score: costDragPct == null ? 50 : clamp(100 - costDragPct), detail: costDragPct == null ? "no cost data" : `costs ${costDragPct}% of gross` },
        { axis: "Risk", score: ddRatio == null ? 30 : clamp(100 - ddRatio * 40), detail: ddRatio == null ? `DD ${summary.maxDD}R` : `DD ${summary.maxDD}R = ${ddRatio}× net` },
    ];
    const meanScore = round(healthAxes.reduce((s, a) => s + a.score, 0) / healthAxes.length, 0);
    const grade = meanScore >= 85 ? "A" : meanScore >= 70 ? "B" : meanScore >= 55 ? "C" : meanScore >= 40 ? "D" : "F";

    let confidence = "High";
    if (summary.filled < 50 || (regimePct || 0) >= 90 || (concPct || 0) >= 80) confidence = "Low";
    else if (summary.filled < 150 || (regimePct || 0) >= 75 || (concPct || 0) >= 60) confidence = "Medium";

    // Lightweight, bounded "Profile of the Engine": describe (not mine) the trades that make ≥60% of
    // positive net, by modal value + coverage + lift per dimension. Linear, guarded, descriptive only.
    function buildProfile() {
        const posCells = sortedCells.filter((c) => c.netR > 0);
        const posTotal = sum(posCells.map((c) => c.netR));
        if (!posCells.length || posTotal <= 0) return { ok: false, reason: "no positive cohorts" };
        let cum = 0; const selected = [];
        for (const c of posCells) { selected.push(c); cum += c.netR; if (cum >= 0.6 * posTotal) break; }
        const sel = new Set(selected.map((c) => c.key));
        const engineTrades = trades.filter((t) => sel.has(`${sessOf(t)} · ${dirOf(t)}`));
        if (engineTrades.length < LOW_SAMPLE_N) return { ok: false, reason: "engine set too small", n: engineTrades.length };
        const dims = [
            ["Direction", dirOf], ["Session", sessOf],
            ["Weekday", (t) => { const d = dateOf(t); return d ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] : null; }],
            ["OB width", sizeBand],
            ["Structure", (t) => String(t.structure || t.structure_tag || "").toUpperCase().includes("CHOCH") ? "CHoCH" : "BOS"],
        ];
        const facets = [];
        for (const [name, fn] of dims) {
            const counts = {}; let known = 0;
            for (const t of engineTrades) { const v = fn(t); if (v == null || v === "—") continue; counts[v] = (counts[v] || 0) + 1; known++; }
            if (!known) continue;
            const [val, cnt] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            const coverage = round((100 * cnt) / known, 0);
            let baseKnown = 0, baseCnt = 0;
            for (const t of trades) { const v = fn(t); if (v == null || v === "—") continue; baseKnown++; if (v === val) baseCnt++; }
            const lift = baseKnown && baseCnt ? round((coverage / 100) / (baseCnt / baseKnown), 1) : null;
            // keep only distinctive facets: dominant AND over-represented vs base (lift ≥ 1.15) — a trait
            // shared by the whole book (lift ≈ 1) doesn't characterise the engine.
            if (coverage >= 60 && lift != null && lift >= 1.15) facets.push({ dim: name, value: val, coverage, lift });
        }
        facets.sort((a, b) => (b.lift || 0) - (a.lift || 0));
        return { ok: facets.length > 0, n: engineTrades.length, pctOfPosNet: round((100 * cum) / posTotal, 0), facets: facets.slice(0, 5) };
    }
    const profile = buildProfile();

    const diagnosis = {
        health: { grade, score: meanScore, axes: healthAxes },
        primaryEngine: engines.positives[0] || null,
        primaryWeakness: engines.negatives[0] || null,
        concentration: { pct: concPct, cell: conc.sessionDirection.best?.key || null },
        regime: { pct: regimePct, years: [regimeYears[0]?.key, regimeYears[1]?.key].filter(Boolean), nYears: cohorts.year.length },
        costDrag: costDragPct,
        drawdown: { maxDD: summary.maxDD, ratio: ddRatio },
        confidence,
        profile,
    };

    // ---- ranked research queue (transparent priority = stakes + uncertainty) ----
    const absTot = Math.abs(total) || 1;
    const q = [];
    if (engines.negatives[0]) { const w = engines.negatives[0]; q.push({ id: "drain", question: `Why does ${w.key} lose money?`, why: `Largest negative cohort — bleeds ${w.netR}R (turnover ${w.turnover}R).`, target: w.key, evidenceR: w.netR, stakes: Math.min(1, Math.abs(w.netR) / absTot), uncertainty: w.n < LOW_SAMPLE_N ? 0.8 : 0.5 }); }
    if (regimePct != null && regimePct >= 75) q.push({ id: "regime", question: "Does the edge survive out-of-sample?", why: `Top 2 years (${regimeYears[0]?.key}, ${regimeYears[1]?.key}) = ${regimePct}% of net R.`, target: `Years ${[regimeYears[0]?.key, regimeYears[1]?.key].filter(Boolean).join(", ")}`, evidenceR: regimeTop2, stakes: 0.9, uncertainty: 0.8 });
    if (concPct != null && concPct >= 70 && conc.sessionDirection.best) q.push({ id: "conc", question: `Does ${conc.sessionDirection.best.key} persist in a split-half?`, why: `One cell = ${concPct}% of net R.`, target: conc.sessionDirection.best.key, evidenceR: conc.sessionDirection.best.netR, stakes: Math.min(1, concPct / 100), uncertainty: 0.7 });
    if (deadWeight.length) { const d = deadWeight[0]; q.push({ id: "dead", question: `Is ${d.key} latent edge or pure churn?`, why: `${d.n} trades for ${d.netR}R (turnover ${d.turnover}R).`, target: d.key, evidenceR: d.turnover, stakes: Math.min(1, d.n / Math.max(1, summary.filled)), uncertainty: 0.5 }); }
    if (costDragPct != null && costDragPct >= 40) q.push({ id: "cost", question: "How much edge do costs remove?", why: `Costs = ${costDragPct}% of gross edge.`, target: "All filled trades", evidenceR: summary.costR, stakes: Math.min(1, costDragPct / 100), uncertainty: 0.4 });
    if (sized.length >= 3 && sized[sized.length - 1].exp > sized[0].exp) q.push({ id: "obsize", question: "Is the larger-OB advantage real?", why: "Expectancy rises with OB width across bands.", target: "OB width bands", evidenceR: null, stakes: 0.4, uncertainty: 0.6 });
    q.push({ id: "splithalf", question: "Do the top cohorts survive a split-half?", why: "Robustness check on the engine set.", target: "Engine cohorts", evidenceR: null, stakes: 0.5, uncertainty: 0.7 });
    for (const it of q) {
        it.priorityScore = clamp(100 * (0.6 * it.stakes + 0.4 * it.uncertainty));
        it.priority = it.priorityScore >= 70 ? "High" : it.priorityScore >= 45 ? "Medium" : "Low";
        it.confidence = it.uncertainty >= 0.7 ? "Low" : it.uncertainty >= 0.5 ? "Medium" : "High";
        it.action = "Filter Trades to cohort (coming soon)";
    }
    q.sort((a, b) => b.priorityScore - a.priorityScore);
    const researchQueue = q;

    // ---- headline ----
    let headline;
    if (summary.filled < 30) headline = { text: "Low sample — interpret this run with caution.", tone: "warning" };
    else if (total <= 0) headline = { text: "This run has no net edge (net R ≤ 0) — the breakdown shows where it leaks.", tone: "danger" };
    else if (oneSide) headline = { text: `The edge is almost entirely driven by ${dirS.netR >= dirL.netR ? "short" : "long"} trades.`, tone: "warning" };
    else if (warnings.some((w) => w.code === "few_years")) headline = { text: "The strategy is heavily regime-dependent — a couple of years carry it.", tone: "warning" };
    else if (conc.sessionDirection.best?.pct >= 70) headline = { text: "This edge is highly concentrated in a few cohorts.", tone: "warning" };
    else if (posMonths >= negMonths * 1.3) headline = { text: "The strategy is broad and reasonably consistent.", tone: "success" };
    else headline = { text: "Edge is modest and mixed — a thin net of large offsetting cohorts.", tone: "secondary" };

    return {
        ok: true, filled: trades.length, summary, headline, diagnosis,
        concentration: conc, posMonths, negMonths,
        cohorts, sessionDirection: { sessions, matrix, best: sortedCells.slice(0, 3), worst: sortedCells.slice(-3).reverse() },
        engines, deadWeight, warnings, suggestions, researchQueue,
    };
}

export function fmtPF(pf) { return pf === Infinity ? "∞" : (pf == null ? "—" : Number(pf).toFixed(2)); }
export function fmtR(v) { return v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}R`; }
