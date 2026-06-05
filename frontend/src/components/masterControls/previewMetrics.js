// ─── Master Controls — preview metric extraction (Phase 4B / 5) ──────────────
//
// Lightweight, defensive metric extraction for run bundles produced by
// ingestRunBundle (data/importer.js). Used by the Master Controls drawer to read
// out a preview bundle (MasterControlsContext.preview.bundle) AND — in Phase 5 —
// the active run bundle (getRunData(activeRunId)) for an Active-vs-Preview compare.
//
// This utility is intentionally LOCAL to Master Controls. Do NOT route this
// through frontend/src/lib/metrics.js — that module is deprecated (RB-8a) and
// explicitly marked "do NOT add new consumers". Keeping a small, self-contained
// extractor here also guarantees the Active and Preview columns are computed the
// exact same way (apples-to-apples) and stay consistent with the 4B preview panel.
//
// Pure / read-only: never mutates the bundle and never touches the store.

/** Return the first finite number from the given candidates, else null. */
function firstFiniteNumber(...values) {
    for (const v of values) {
        if (v === null || v === undefined || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Count wins/losses from a trade array, preferring the parsed `outcome`. */
function countWinsLosses(trades) {
    let wins = 0;
    let losses = 0;
    for (const t of trades) {
        const outcome = String(t?.outcome ?? "").toLowerCase();
        if (outcome === "win") {
            wins++;
        } else if (outcome === "loss") {
            losses++;
        } else if (!outcome) {
            // No outcome label — fall back to the sign of R.
            const r = Number(t?.r);
            if (Number.isFinite(r)) {
                if (r > 0) wins++;
                else if (r < 0) losses++;
            }
        }
    }
    return { wins, losses };
}

/**
 * Max drawdown (positive R magnitude) from a cumulative equity curve, or from a
 * trade array as a fallback. Returns null when neither source is usable.
 */
function computeMaxDrawdown(equityCurve, trades) {
    let series = [];
    if (Array.isArray(equityCurve) && equityCurve.length) {
        series = equityCurve.map((p) => Number(p?.netR)).filter(Number.isFinite);
    } else if (Array.isArray(trades) && trades.length) {
        let cum = 0;
        series = trades.map((t) => { cum += Number(t?.r) || 0; return cum; });
    }
    if (!series.length) return null;
    let peak = series[0];
    let maxDd = 0;
    for (const v of series) {
        if (v > peak) peak = v;
        const dd = peak - v;
        if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
}

/**
 * Extract lightweight metrics from a run bundle (the object produced by
 * ingestRunBundle — used both for preview.bundle and for the active run bundle
 * returned by getRunData).
 *
 * Strategy: prefer bundle.summary (already canonical from the importer), then
 * fall back to the primary variant in bundle.tradesByVariant / bundle.trades.
 * Fully defensive — any malformed input returns { ok: false } rather than throwing.
 *
 * @returns {{ ok:boolean, label?, variant?, trades?, wins?, losses?, winRate?,
 *             netR?, maxDd?, avgR?, noTrades?, usedFallback? }}
 *   maxDd is a positive R magnitude (drawdown depth); display it as negative.
 *   avgR is netR / trades (expectancy per trade), or null when trades === 0.
 */
export function extractPreviewMetrics(bundle) {
    if (!bundle || typeof bundle !== "object") return { ok: false };
    try {
        const summary = bundle.summary && typeof bundle.summary === "object" ? bundle.summary : {};
        const tbv = bundle.tradesByVariant && typeof bundle.tradesByVariant === "object" ? bundle.tradesByVariant : {};

        // Run label / id — summary fields first, then bundle, then ids.
        const label =
            summary.displayName || summary.name ||
            bundle.displayName || bundle.name ||
            bundle.id || summary.id || null;

        // Selected / primary variant.
        const variant =
            bundle.primaryVariant ||
            summary.primaryVariant || summary.primary_variant ||
            summary.executionMode || summary.execution_mode ||
            null;

        // Best-effort fallback trade list: named variant → primary trades →
        // largest variant array → empty.
        const variantArrays = Object.values(tbv).filter(Array.isArray);
        const fallbackTrades =
            (variant && Array.isArray(tbv[variant]) ? tbv[variant] : null) ||
            (Array.isArray(bundle.trades) ? bundle.trades : null) ||
            variantArrays.slice().sort((a, b) => b.length - a.length)[0] ||
            [];

        let usedFallback = false;

        // Trades.
        let trades = firstFiniteNumber(summary.trades, summary.trade_count, summary.tradeCount, summary.total_trades, summary.n_trades);
        if (trades == null) { trades = fallbackTrades.length; usedFallback = true; }

        // Wins / losses.
        let wins = firstFiniteNumber(summary.wins, summary.win_count, summary.winCount);
        let losses = firstFiniteNumber(summary.losses, summary.loss_count, summary.lossCount);
        if (wins == null || losses == null) {
            const counted = countWinsLosses(fallbackTrades);
            if (wins == null) { wins = counted.wins; usedFallback = true; }
            if (losses == null) { losses = counted.losses; usedFallback = true; }
        }

        // Win rate (percentage).
        let winRate = firstFiniteNumber(summary.winRate, summary.win_rate, summary.winRatePct);
        if (winRate == null) {
            const denom = (Number(wins) || 0) + (Number(losses) || 0);
            winRate = denom > 0 ? (Number(wins) / denom) * 100 : null;
            if (winRate != null) usedFallback = true;
        }

        // Net R / total R.
        let netR = firstFiniteNumber(summary.netR, summary.net_r, summary.pnl_r, summary.totalR, summary.total_r);
        if (netR == null) {
            netR = fallbackTrades.reduce((s, t) => s + (Number(t?.r) || 0), 0);
            usedFallback = true;
        }

        // Max drawdown.
        let maxDd = firstFiniteNumber(summary.maxDd, summary.maxDD, summary.max_drawdown, summary.maxDrawdown, summary.max_dd);
        if (maxDd == null) {
            maxDd = computeMaxDrawdown(bundle.equityCurve, fallbackTrades);
            if (maxDd != null) usedFallback = true;
        }

        const totalTrades = Number.isFinite(trades) ? trades : 0;

        // Avg R (expectancy per trade) — derived, never fabricated.
        const avgR = totalTrades > 0 && Number.isFinite(netR) ? netR / totalTrades : null;

        return {
            ok: true,
            label: label != null ? String(label) : null,
            variant: variant != null ? String(variant) : null,
            trades: totalTrades,
            wins: Number.isFinite(wins) ? wins : null,
            losses: Number.isFinite(losses) ? losses : null,
            winRate: Number.isFinite(winRate) ? winRate : null,
            netR: Number.isFinite(netR) ? netR : null,
            maxDd: Number.isFinite(maxDd) ? maxDd : null,
            avgR: Number.isFinite(avgR) ? avgR : null,
            noTrades: totalTrades === 0,
            usedFallback,
        };
    } catch {
        return { ok: false };
    }
}

export function fmtPreviewInt(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return String(Math.round(Number(v)));
}

export function fmtPreviewPct(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return `${Number(v).toFixed(1)}%`;
}

export function fmtPreviewR(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    const n = Number(v);
    const sign = n >= 0 ? "+" : "−";
    return `${sign}${Math.abs(n).toFixed(1)}R`;
}

export function fmtPreviewDd(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    const m = Math.abs(Number(v));
    return m === 0 ? "0.0R" : `−${m.toFixed(1)}R`;
}
