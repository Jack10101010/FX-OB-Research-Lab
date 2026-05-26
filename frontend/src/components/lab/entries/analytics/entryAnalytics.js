// ── entryAnalytics.js ────────────────────────────────────────────────────────
// Pure analytics functions for the Entries Research Workspace.
// No React, no side-effects. Safe inside useMemo.
// BUG FIXES applied vs original EntriesLab.jsx:
//   1. Toxicity grid now uses only LOSING trades (was: all trades)
//   2. Session bucket fillPct no longer hardcoded to 100%

import { PLANNED_ENTRY_MODES } from "./entryRegistry";
import {
    isFiniteNumber, num, round1, normalizeMode, normalizePct,
    firstNumber, parseDate, sessionOf, dayIndex, SESSIONS,
} from "./entryFormatters";

// ── Primitive helpers ────────────────────────────────────────────────────────

export function rOf(trade) {
    return Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
}

export function maxDrawdown(trades) {
    let equity = 0, peak = 0, dd = 0;
    (trades || []).forEach(t => {
        equity += rOf(t);
        peak    = Math.max(peak, equity);
        dd      = Math.min(dd, equity - peak);
    });
    return round1(dd);
}

// ── Baseline row ──────────────────────────────────────────────────────────────

export function baselineEntryRow(trades) {
    const list  = Array.isArray(trades) ? trades : [];
    const wins   = list.filter(t => rOf(t) > 0).length;
    const losses = list.filter(t => rOf(t) < 0).length;
    const netR   = list.reduce((s, t) => s + rOf(t), 0);
    return {
        mode: "baseline", label: "Baseline · Edge Touch", threshold: "Edge",
        family: "Baseline",
        eligible: list.length, trades: list.length, fills: list.length,
        fillPct:    list.length ? 100 : 0,
        winRate:    list.length ? (wins / list.length) * 100 : 0,
        netR:       round1(netR),
        expectancy: list.length ? netR / list.length : 0,
        maxDD:      maxDrawdown(list),
        profitFactor: calcProfitFactor(list),
        wins, losses,
        avgMAE: null, avgMFE: null, avgTimeToTP: null, avgTimeToSL: null,
        deltaVsBaseline: 0,
        exact: true, isBaseline: true,
    };
}

// ── From-summary row ─────────────────────────────────────────────────────────

export function entryRowFromSummary(planned, src, baseline, trades) {
    const stats   = trades?.length ? entryStatsFromTrades(trades) : {};
    const netR    = firstNumber(src, "net_r", "netR", "net", "net_r_total") ?? stats.netR;
    const eligible = firstNumber(src, "eligible_setups", "eligible", "setups", "trades", "trade_count", "total_trades") ?? stats.eligible;
    const fills   = firstNumber(src, "fills", "filled", "filled_trades", "fill_count") ?? stats.fills;
    const threshold = firstNumber(src, "threshold", "threshold_pct", "entry_threshold_pct", "entry_threshold") ?? planned.threshold;
    const wins    = firstNumber(src, "wins", "winning_trades") ?? stats.wins;
    const losses  = firstNumber(src, "losses", "losing_trades") ?? stats.losses;
    const fillPct = normalizePct(firstNumber(src, "fill_pct", "fill_rate", "fill_percent"))
        ?? (isFiniteNumber(eligible) && Number(eligible) > 0 && isFiniteNumber(fills)
            ? (Number(fills) / Number(eligible)) * 100 : stats.fillPct);
    const winRate = normalizePct(firstNumber(src, "win_rate", "wr"))
        ?? (Number(wins || 0) + Number(losses || 0)
            ? (Number(wins || 0) / (Number(wins || 0) + Number(losses || 0))) * 100 : stats.winRate);
    const expectancy = firstNumber(src, "expectancy", "avg_r", "expectancy_r")
        ?? (isFiniteNumber(netR) && isFiniteNumber(fills) && Number(fills) > 0
            ? Number(netR) / Number(fills) : stats.expectancy);
    const rawMaxDD = firstNumber(src, "max_dd", "max_drawdown", "max_drawdown_r") ?? stats.maxDD;
    // Build profit factor from trades if available, else null
    const pf = trades?.length ? calcProfitFactor(trades) : null;
    return {
        ...planned,
        exact: true, isBaseline: false,
        threshold: isFiniteNumber(threshold)
            ? `${Number(threshold).toFixed(Number(threshold) % 1 ? 1 : 0)}%`
            : threshold,
        eligible, trades: eligible, fills, fillPct, wins, losses, winRate,
        netR, expectancy,
        maxDD: rawMaxDD,
        profitFactor: pf,
        avgMAE:      firstNumber(src, "avg_mae", "avg_mae_r"),
        avgMFE:      firstNumber(src, "avg_mfe", "avg_mfe_r"),
        avgTimeToTP: src.avg_time_to_tp || src.avgTimeToTP || null,
        avgTimeToSL: src.avg_time_to_sl || src.avgTimeToSL || null,
        deltaVsBaseline: isFiniteNumber(netR) ? round1(Number(netR) - baseline.netR) : null,
    };
}

export function entryStatsFromTrades(trades) {
    const list   = Array.isArray(trades) ? trades : [];
    const filled = list.filter(t => t.entry_model_filled === true || (t.missed_trade !== true && !!t.entry));
    const wins   = filled.filter(t => rOf(t) > 0).length;
    const losses = filled.filter(t => rOf(t) < 0).length;
    const netR   = filled.reduce((s, t) => s + rOf(t), 0);
    return {
        eligible: list.length,
        fills:    filled.length,
        fillPct:  list.length ? (filled.length / list.length) * 100 : 0,
        wins, losses,
        winRate:     wins + losses ? (wins / (wins + losses)) * 100 : 0,
        netR:        round1(netR),
        expectancy:  filled.length ? netR / filled.length : 0,
        maxDD:       maxDrawdown(list),
        profitFactor: calcProfitFactor(filled),
    };
}

function calcProfitFactor(trades) {
    const list  = Array.isArray(trades) ? trades : [];
    const gross = list.reduce((s, t) => { const r = rOf(t); return r > 0 ? s + r : s; }, 0);
    const loss  = list.reduce((s, t) => { const r = rOf(t); return r < 0 ? s + Math.abs(r) : s; }, 0);
    return loss > 0 ? round1(gross / loss) : null;
}

// ── Flatten / normalise summary from Python output ───────────────────────────

export function flattenEntrySummary(summary, activeVariant = "single_position") {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap(item => flattenEntrySummary(item, activeVariant));
    if (summary.mode || summary.entry_mode || summary.entry_model) {
        return [{ ...summary, mode: normalizeMode(summary.mode || summary.entry_mode || summary.entry_model) }];
    }
    const rows = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        if (["single_position", "allow_multi_position", "one_per_direction"].includes(key)) {
            if (key === activeVariant) rows.push(...flattenEntrySummary(value, activeVariant));
        } else {
            rows.push({ ...value, mode: normalizeMode(value.mode || value.entry_mode || value.entry_model || key) });
        }
    });
    return rows;
}

// ── Build the full ordered row set ───────────────────────────────────────────

export function buildEntryResultRows(run, trades, selectedVariant) {
    const activeVariant = selectedVariant || run?.primaryVariant || run?.summary?.executionMode || "single_position";
    const entryResults  = run?.entryResults || {};
    const exact         = flattenEntrySummary(entryResults.summary || run?.summary?.entry_results || {}, activeVariant);
    const exactByMode   = new Map(exact.map(r => [normalizeMode(r.mode), r]));
    const tradesByMode  = entryResults.tradesByMode || {};
    const baseline      = baselineEntryRow(trades);

    const rows = PLANNED_ENTRY_MODES.flatMap(planned => {
        const modeKey   = normalizeMode(planned.mode);
        const src       = exactByMode.get(modeKey);
        const modeTrades = tradesByMode[`${activeVariant}__${modeKey}`] || tradesByMode[modeKey];
        if (planned.mode === "baseline") return [{ ...planned, ...baseline }];
        if (src || modeTrades?.length)   return [entryRowFromSummary(planned, src || {}, baseline, modeTrades)];
        return [];
    });
    markHighlights(rows);
    return rows;
}

export function buildExactSummary(rows) {
    const tested     = rows.filter(r => r.exact && !r.isBaseline);
    const candidates = tested.length ? tested : rows.filter(r => r.exact);
    return {
        bestModel:  bestBy(candidates, "netR"),
        bestDelta:  bestBy(candidates, "deltaVsBaseline"),
        bestFill:   bestBy(candidates, "fillPct"),
        lowestDD:   bestByLowest(candidates, "maxDD"),
        bestPF:     bestBy(candidates, "profitFactor"),
    };
}

// ── Highlights ────────────────────────────────────────────────────────────────

export function markHighlights(rows) {
    const tested = rows.filter(r => r.exact && !r.isBaseline);
    const exact  = tested.length ? tested : rows.filter(r => r.exact);
    const bNet   = bestBy(exact, "netR");
    const bExp   = bestBy(exact, "expectancy");
    const loDD   = bestByLowest(exact, "maxDD");
    const bFill  = bestBy(exact, "fillPct");
    const bPF    = bestBy(exact, "profitFactor");
    if (bNet)  bNet.isBestNetR       = true;
    if (bExp)  bExp.isBestExpectancy = true;
    if (loDD)  loDD.isLowestDD       = true;
    if (bFill) bFill.isBestFillPct   = true;
    if (bPF)   bPF.isBestPF          = true;
}

export function bestBy(rows, key) {
    return rows.reduce((best, row) =>
        isFiniteNumber(row?.[key]) && (!best || Number(row[key]) > Number(best[key])) ? row : best
    , null);
}

export function bestByLowest(rows, key) {
    return rows.reduce((best, row) =>
        isFiniteNumber(row?.[key]) && (!best || Number(row[key]) > Number(best[key])) ? row : best
    , null);
}

// ── Bucket / session helpers ─────────────────────────────────────────────────

// BUG FIX: `fills` param added — session buckets no longer hardcode fillPct=100
export function bucket(label, rows, fills = rows) {
    const wins = rows.filter(t => rOf(t) > 0).length;
    const netR = rows.reduce((s, t) => s + rOf(t), 0);
    return {
        label,
        count:    rows.length,
        fills:    fills.length,
        fillPct:  rows.length ? (fills.length / rows.length) * 100 : 0,
        winRate:  rows.length ? (wins / rows.length) * 100 : 0,
        netR:     round1(netR),
        expectancy: rows.length ? netR / rows.length : 0,
        exact: true,
    };
}

export function sessionRows(trades) {
    return SESSIONS.map(label =>
        bucket(label, trades.filter(t => sessionOf(t.entry) === label))
    );
}

export function sessionRowsForModel(allTrades, modelTrades) {
    return SESSIONS.map(label => {
        const eligible = allTrades.filter(t => sessionOf(t.entry) === label);
        const filled   = (modelTrades || []).filter(t => sessionOf(t.entry) === label);
        return bucket(label, eligible, filled);
    });
}

// ── Heatmap grids ────────────────────────────────────────────────────────────

export function buildHourGrid(trades) {
    const cells = {};
    let total = 0;
    (trades || []).forEach(trade => {
        const d = parseDate(trade.entry);
        if (!d) return;
        const key = `${dayIndex(d.getUTCDay())}-${d.getUTCHours()}`;
        if (!cells[key]) cells[key] = { count: 0, netR: 0 };
        cells[key].count += 1;
        cells[key].netR  += rOf(trade);
        total += 1;
    });
    Object.values(cells).forEach(cell => { cell.netR = round1(cell.netR); });
    const maxAbs = Object.values(cells).reduce((m, c) => Math.max(m, Math.abs(c.netR)), 0) || 1;
    return { cells, total, maxAbs };
}

// BUG FIX: Toxicity grid takes only losing trades
export function buildToxicityGrid(trades) {
    return buildHourGrid((trades || []).filter(t => rOf(t) < 0));
}

// ── Trade-off analytics (missed winners / avoided losers) ────────────────────

export function buildTradeOffStats(baselineTrades, modelTrades) {
    const baselineList = Array.isArray(baselineTrades) ? baselineTrades : [];
    const modelList    = Array.isArray(modelTrades) ? modelTrades : [];

    if (!baselineList.length) return null;

    // Match by trade id or entry timestamp
    const modelIds = new Set(modelList.map(t => tradeKey(t)));

    const baselineWins   = baselineList.filter(t => rOf(t) > 0);
    const baselineLosses = baselineList.filter(t => rOf(t) < 0);

    const missedWinners   = baselineWins.filter(t => !modelIds.has(tradeKey(t)));
    const avoidedLosers   = baselineLosses.filter(t => !modelIds.has(tradeKey(t)));
    const capturedWinners = baselineWins.filter(t => modelIds.has(tradeKey(t)));
    const takenLosers     = baselineLosses.filter(t => modelIds.has(tradeKey(t)));

    const missedWinnerR   = missedWinners.reduce((s, t) => s + rOf(t), 0);
    const avoidedLoserR   = Math.abs(avoidedLosers.reduce((s, t) => s + rOf(t), 0));
    const capturedWinnerR = capturedWinners.reduce((s, t) => s + rOf(t), 0);
    const takenLoserR     = Math.abs(takenLosers.reduce((s, t) => s + rOf(t), 0));

    const missedWinnerPct  = baselineWins.length   ? (missedWinners.length / baselineWins.length) * 100   : 0;
    const avoidedLoserPct  = baselineLosses.length ? (avoidedLosers.length / baselineLosses.length) * 100 : 0;
    const tradeOffRatio    = missedWinnerPct > 0 ? round1(avoidedLoserPct / missedWinnerPct) : null;

    return {
        baselineWins: baselineWins.length,
        baselineLosses: baselineLosses.length,
        missedWinners: missedWinners.length,
        missedWinnerPct: round1(missedWinnerPct),
        missedWinnerR: round1(missedWinnerR),
        avoidedLosers: avoidedLosers.length,
        avoidedLoserPct: round1(avoidedLoserPct),
        avoidedLoserR: round1(avoidedLoserR),
        capturedWinners: capturedWinners.length,
        capturedWinnerR: round1(capturedWinnerR),
        takenLosers: takenLosers.length,
        takenLoserR: round1(takenLoserR),
        tradeOffRatio,
        netRImpact: round1(avoidedLoserR - missedWinnerR),
    };
}

function tradeKey(t) {
    const primary =
        t?.base_trade_id
        ?? t?.baseTradeId
        ?? t?.trade_id
        ?? t?.id
        ?? (t?.obId || t?.ob_id
            ? `${t.obId || t.ob_id}:${t.direction || t.bias || ""}`
            : "");
    return String(primary || t?.entry || "");
}

// ── Direction split ──────────────────────────────────────────────────────────

export function buildDirectionSplit(trades) {
    const list   = Array.isArray(trades) ? trades : [];
    const longs  = list.filter(t => (t.direction || t.bias || "").toLowerCase().includes("long")  || (t.direction || "").toLowerCase() === "buy");
    const shorts = list.filter(t => (t.direction || t.bias || "").toLowerCase().includes("short") || (t.direction || "").toLowerCase() === "sell");
    return { longs: bucketDir("Long", longs), shorts: bucketDir("Short", shorts), total: list.length };
}

function bucketDir(label, rows) {
    const wins   = rows.filter(t => rOf(t) > 0).length;
    const losses = rows.filter(t => rOf(t) < 0).length;
    const netR   = rows.reduce((s, t) => s + rOf(t), 0);
    return {
        label, count: rows.length, wins, losses,
        winRate:    rows.length ? (wins / rows.length) * 100 : 0,
        netR:       round1(netR),
        expectancy: rows.length ? round1(netR / rows.length) : 0,
        profitFactor: calcProfitFactor(rows),
    };
}

// ── Analytics bundle (used by Model Analysis tab) ───────────────────────────

export function buildEntryAnalytics(trades, exactRows) {
    const list          = Array.isArray(trades) ? trades : [];
    const wins          = list.filter(t => rOf(t) > 0).length;
    const losses        = list.filter(t => rOf(t) < 0).length;
    const exactEntryRows       = exactRows.filter(r => r.exact);
    const penetrationExactRows = exactRows.filter(r => r.exact && String(r.mode).startsWith("entry_penetration"));

    return {
        wins, losses,
        fillRateRows:     exactEntryRows,
        penetrationRows:  penetrationExactRows,
        sessionRows:      sessionRows(list),
        hourGrid:         buildHourGrid(list),
        toxicityGrid:     buildToxicityGrid(list),   // BUG FIX applied
        matrixRows:       buildMatrixRows(exactRows, wins, losses),
        directionSplit:   buildDirectionSplit(list),
    };
}

function buildMatrixRows(exactRows, wins, losses) {
    const baseline    = exactRows.find(r => r.isBaseline) || {};
    const penetration = exactRows.filter(r => r.exact && String(r.mode).startsWith("entry_penetration"));
    return [
        { label: "Baseline", fills: baseline.fills, wins, losses, winRate: baseline.winRate, netR: baseline.netR, status: "Exact", exact: true },
        ...penetration.map(r => ({ label: r.label, fills: r.fills, wins: r.wins, losses: r.losses, winRate: r.winRate, netR: r.netR, status: "Exact", exact: true })),
        { label: "Confirmation", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Awaiting exporter", exact: false },
        { label: "Lifecycle Cancel", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Architecture only", exact: false },
    ];
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function entryResultsToCsv(exactRows) {
    const fields = ["mode","label","family","threshold","eligible","fills","fillPct","wins","losses","winRate","netR","expectancy","maxDD","profitFactor","avgMAE","avgMFE","avgTimeToTP","avgTimeToSL","deltaVsBaseline"];
    const rows   = exactRows.map(r => fields.map(f => r[f] ?? "").join(","));
    return [fields.join(","), ...rows].join("\n");
}

export function downloadCsv(filename, csvString) {
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
