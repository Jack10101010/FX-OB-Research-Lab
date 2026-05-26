// ── equityCurveAnalytics.js ──────────────────────────────────────────────────
// Build per-model equity curves from tradesByMode data.
// No React. Safe inside useMemo.

import { rOf } from "./entryAnalytics";
import { round2, parseDate } from "./entryFormatters";

export function buildModelEquityCurve(trades, label, color) {
    const list = Array.isArray(trades) ? trades : [];
    let cum = 0;
    return list.map((t, i) => {
        cum += rOf(t);
        const d = parseDate(t.entry);
        return {
            i,
            date:  d ? d.toISOString().slice(0, 10) : "",
            netR:  round2(cum),
            label,
            color,
        };
    });
}

export function buildAllModelCurves(exactRows, tradesByMode, activeVariant) {
    const curves = [];
    exactRows.forEach(row => {
        if (!row.exact) return;
        const modeKey   = String(row.mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        const modeTrades = tradesByMode?.[`${activeVariant}__${modeKey}`] || tradesByMode?.[modeKey] || [];
        if (modeTrades.length) {
            curves.push({
                mode:   row.mode,
                label:  row.label,
                isBaseline: !!row.isBaseline,
                trades: modeTrades,
                points: buildModelEquityCurve(modeTrades, row.label, null),
            });
        }
    });
    return curves;
}

// Merge all curves into a single dataset for recharts multi-line rendering
// Each point: { i, date, [modelKey]: netR, ... }
export function mergeEquityCurves(curves) {
    if (!curves.length) return [];
    const maxLen = Math.max(...curves.map(c => c.points.length));
    return Array.from({ length: maxLen }, (_, i) => {
        const point = { i };
        curves.forEach(curve => {
            const pt = curve.points[i];
            if (pt) {
                point.date = pt.date;
                point[curve.mode] = pt.netR;
            }
        });
        return point;
    });
}

// Compute drawdown series for a single curve
export function buildDrawdownSeries(points) {
    let peak = 0;
    return points.map(pt => {
        peak = Math.max(peak, pt.netR);
        return { ...pt, drawdown: round2(pt.netR - peak) };
    });
}
