// distanceBreakdown.js
//
// Pure aggregation of trades by VACANCY DISTANCE AT ARM
// (`price_distance_from_ob_at_arm_pips`). No React, no side effects; self-contained
// so the validation harness can run it directly.
//
// Field semantics (from the Lux-OB-Backtester export — DO NOT misread):
//   • MAGNITUDE only (≥ 0). It is NOT a signed occupation-depth scale.
//   • 0  = price was still INSIDE the order block at arm (occupied at arm).
//   • > 0 = price had vacated the OB by that many pips at arm.
//   • null / blank / non-numeric = triggered-edge field absent (non-TE entry model,
//     never-triggered, or no arm data) → the "unknown / unavailable" bucket.
//   • There is no `_pct` companion field.
//
// Metrics match the Classification breakdown convention (fillStateBreakdown / toStats):
//   Trades = count · WR = wins / (wins + losses)  [breakevens excluded from denom]
//   Net R  = Σ r   · Avg R = Σ r / count           [breakevens included in denom]
// Win/loss here is by realized-R sign (r > 0 win, r < 0 loss, r == 0 breakeven). This
// is a research breakdown — see report note; it may differ slightly from the
// performance-aware isWinTrade/isLossTrade used by the fill-state tables.

const LOW_SAMPLE_THRESHOLD = 10;

// Bucket order + labels. Keep the explicit `occupied` (= 0) bucket separate from
// `edge` — collapsing them would hide the occupied↔vacant boundary (F-004).
const BUCKET_DEFS = [
    { key: "occupied",    label: "Occupied / inside OB", test: (d) => d === 0 },
    { key: "edge",        label: "Edge zone 0–2 pips",   test: (d) => d > 0 && d < 2 },
    { key: "two_to_five", label: "2–5 pips",             test: (d) => d >= 2 && d < 5 },
    { key: "five_plus",   label: "5+ pips",              test: (d) => d >= 5 },
];
const UNKNOWN_LABEL = "Unknown / unavailable";
export const DISTANCE_BUCKET_ORDER = ["occupied", "edge", "two_to_five", "five_plus", "unknown"];
export const DISTANCE_BUCKET_LABELS = {
    occupied: "Occupied / inside OB",
    edge: "Edge zone 0–2 pips",
    two_to_five: "2–5 pips",
    five_plus: "5+ pips",
    unknown: UNKNOWN_LABEL,
};

/** Read the at-arm vacancy distance (camelCase or snake_case). null when absent/non-numeric. */
export function distanceAtArmOf(trade) {
    const raw = trade?.priceDistanceFromObAtArmPips ?? trade?.price_distance_from_ob_at_arm_pips;
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/** Realized R via the shared field conventions (r → net_r → pnl_r → result_r). 0 if none. */
function readR(trade) {
    for (const k of ["r", "net_r", "pnl_r", "result_r"]) {
        const v = trade?.[k];
        if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v);
    }
    return 0;
}

/** Which bucket key a (possibly-null) distance falls into. */
export function distanceBucketKey(d) {
    if (d == null || d === "" || !Number.isFinite(Number(d))) return "unknown";
    const n = Number(d);
    for (const b of BUCKET_DEFS) if (b.test(n)) return b.key;
    return "unknown"; // negative / unexpected → unknown (field is magnitude ≥ 0)
}

function emptyAcc() { return { count: 0, wins: 0, losses: 0, sumR: 0 }; }
function addTrade(acc, r) {
    acc.count += 1;
    if (r > 0) acc.wins += 1; else if (r < 0) acc.losses += 1; // r === 0 = breakeven, excluded from W/L
    acc.sumR += r;
}
function toStats(acc, threshold) {
    const decided = acc.wins + acc.losses;
    return {
        count:     acc.count,
        wins:      acc.wins,
        losses:    acc.losses,
        winRate:   decided > 0 ? acc.wins / decided : null,
        netR:      acc.sumR,                                  // raw; display rounds (matches fillStateBreakdown)
        avgR:      acc.count > 0 ? acc.sumR / acc.count : 0,  // raw; display rounds
        lowSample: decided > 0 && decided < threshold,
    };
}

/**
 * Build the distance-at-arm breakdown.
 *
 * @param {object[]} trades
 * @param {{ lowSampleThreshold?: number }} [options]
 * @returns {{
 *   available: boolean,        // any NON-unknown bucket has trades (run carries usable distance data)
 *   total: number,             // all trades
 *   usable: number,            // trades with a numeric distance (occupied + edge + 2-5 + 5+)
 *   unknownCount: number,
 *   lowSampleThreshold: number,
 *   order: string[],
 *   labels: object,
 *   buckets: { [key]: { count, wins, losses, winRate, netR, avgR, lowSample } },
 * }}
 */
export function buildDistanceAtArmBreakdown(trades, options = {}) {
    const threshold = Number.isFinite(Number(options.lowSampleThreshold))
        ? Number(options.lowSampleThreshold) : LOW_SAMPLE_THRESHOLD;
    const list = Array.isArray(trades) ? trades : [];

    const accs = {
        occupied: emptyAcc(), edge: emptyAcc(), two_to_five: emptyAcc(),
        five_plus: emptyAcc(), unknown: emptyAcc(),
    };
    for (const t of list) {
        addTrade(accs[distanceBucketKey(distanceAtArmOf(t))], readR(t));
    }

    const buckets = {};
    for (const k of DISTANCE_BUCKET_ORDER) buckets[k] = toStats(accs[k], threshold);

    const usable = BUCKET_DEFS.reduce((s, b) => s + accs[b.key].count, 0);
    return {
        available: usable > 0,
        total: list.length,
        usable,
        unknownCount: accs.unknown.count,
        lowSampleThreshold: threshold,
        order: DISTANCE_BUCKET_ORDER,
        labels: DISTANCE_BUCKET_LABELS,
        buckets,
    };
}

export default buildDistanceAtArmBreakdown;
