/**
 * obRetestResearch.js — OB Retest Research Layer (Phase C1, pure)
 * ===============================================================
 * Enriches retest events with OB-level + derived context dimensions, then groups
 * them so we can see WHICH retest conditions actually matter (survival, reaction).
 *
 * Source-agnostic: works identically on backend-verified events (imported
 * ob_retests.csv) and frontend-derived events (deriveRetests) — both share the
 * same camelCase event shape (guaranteed by Phase 2.4 parity).
 *
 * C1 uses ONLY already-imported data (event fields + a join to activeRun.orderBlocks)
 * with FIXED buckets. No backend, no importer changes. ATR/volume/displacement and
 * origin candle structure are deferred to C2/C3.
 */
import { sessionOf } from "@/data/obRetest";

export const DEFAULT_MIN_N = 20;

// ── join key (mirror obRetest internal obKey: numeric → canonical int string) ────
export function obJoinKey(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim().toLowerCase();
    const digits = text.match(/\d+/);
    return digits ? String(Number(digits[0])) : text;
}

// epoch-seconds coercion for OB time strings (event times already epoch numbers).
function toEpoch(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    let s = String(value).trim().replace("Z", "+00:00");
    if (s.length >= 11 && s[10] === " ") s = s.slice(0, 10) + "T" + s.slice(11);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00+00:00`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

const num = (v) => (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null);

// ── Fixed buckets (C1) ──────────────────────────────────────────────────────────
export function obSizeBucket(pips) {
    const p = num(pips);
    if (p == null) return "unknown";
    if (p < 10) return "small (<10p)";
    if (p <= 20) return "medium (10-20p)";
    return "large (>20p)";
}

export function penetrationBucket(pct) {
    const p = num(pct);
    if (p == null) return "unknown";
    if (p >= 100) return "full (100%)";
    if (p >= 66) return "deep (66-99%)";
    if (p >= 33) return "mid (33-66%)";
    return "clean (0-33%)";
}

export function retestNumberBucket(idx) {
    const i = num(idx);
    if (i == null) return "unknown";
    if (i <= 1) return "R1";
    if (i === 2) return "R2";
    return "R3+";
}

export function timeSinceDetectionBucket(minutes) {
    const m = num(minutes);
    if (m == null) return "unknown";
    if (m < 60) return "<1h";
    if (m < 360) return "1-6h";
    if (m < 1440) return "6-24h";
    if (m < 4320) return "1-3d";
    return "3d+";
}

export function timeSinceFirstTouchBucket(minutes) {
    const m = num(minutes);
    if (m == null) return "unknown";
    if (m < 30) return "<30m";
    if (m < 120) return "30m-2h";
    if (m < 480) return "2-8h";
    if (m < 1440) return "8-24h";
    return "24h+";
}

export function timeSincePrevRetestBucket(minutes) {
    if (minutes == null) return "first"; // R1 / no prior retest
    const m = num(minutes);
    if (m == null) return "first";
    if (m < 30) return "<30m";
    if (m < 120) return "30m-2h";
    if (m < 480) return "2-8h";
    return "8h+";
}

const DEEP_PENETRATION_PCT = 66;

function failureBehavior(outcome, maxPenPct) {
    if (outcome === "open") return "open";
    const deep = (num(maxPenPct) ?? 0) >= DEEP_PENETRATION_PCT;
    if (outcome === "survived") return deep ? "survived_deep" : "survived_shallow";
    if (outcome === "failed") return deep ? "failed_deep" : "failed_shallow";
    return "unknown";
}

function newsBucket(flag) {
    if (flag === true) return "news_window";
    if (flag === false) return "clear";
    return "unknown";
}

// ── Enrichment ───────────────────────────────────────────────────────────────────
/**
 * Join each retest event to its OB and attach derived dimensions.
 * @param {Array}  events       camelCase retest events (backend or derived)
 * @param {Array}  orderBlocks  activeRun.orderBlocks (id, obWidthPips, originTime, side, news flags)
 */
export function enrichRetestEvents(events = [], orderBlocks = []) {
    const obsByKey = new Map();
    for (const ob of orderBlocks) {
        const k = obJoinKey(ob?.id ?? ob?.obId);
        if (k != null && !obsByKey.has(k)) obsByKey.set(k, ob);
    }

    // Previous-retest time per OB (events are emitted in retest order; sort defensively).
    const prevTimeByOb = new Map();
    const ordered = [...events].sort((a, b) => {
        const ka = obJoinKey(a.obId), kb = obJoinKey(b.obId);
        if (ka !== kb) return String(ka).localeCompare(String(kb));
        return (num(a.retestIndex) ?? 0) - (num(b.retestIndex) ?? 0);
    });

    const enrichedByRef = new Map();
    for (const e of ordered) {
        const key = obJoinKey(e.obId);
        const ob = key != null ? obsByKey.get(key) : null;

        const retestEpoch = num(e.retestTime);
        const prevEpoch = prevTimeByOb.get(key);
        const minutesSincePrevRetest =
            prevEpoch != null && retestEpoch != null ? Math.round((retestEpoch - prevEpoch) / 60) : null;
        if (retestEpoch != null) prevTimeByOb.set(key, retestEpoch);

        const obWidthPips = ob ? num(ob.obWidthPips ?? ob.ob_width_pips ?? ob.width_pips) : null;
        const detectionEpoch = num(e.detectionTime);
        const firstTouchEpoch = num(e.firstTouchTime);
        const minutesSinceDetection =
            retestEpoch != null && detectionEpoch != null ? Math.round((retestEpoch - detectionEpoch) / 60) : null;

        const originSession = ob ? sessionOf(toEpoch(ob.originTime ?? ob.origin_time)) : "Unknown";
        const detectionSession = sessionOf(detectionEpoch);
        const firstTouchSession = sessionOf(firstTouchEpoch);
        const retestSession = e.session || sessionOf(retestEpoch);
        const structure = e.structure || "—";
        const direction = e.direction || "—";

        enrichedByRef.set(e, {
            ...e,
            obWidthPips,
            sizeBucket: obSizeBucket(obWidthPips),
            originSession,
            detectionSession,
            firstTouchSession,
            retestSession,
            sameSession: firstTouchSession === retestSession ? "same" : "cross",
            structure,
            direction,
            structureDirection: `${structure} ${direction}`,
            retestNumberBucket: retestNumberBucket(e.retestIndex),
            entryPenetrationBucket: penetrationBucket(e.entryPenetrationPct),
            maxPenetrationBucket: penetrationBucket(e.maxPenetrationPct),
            minutesSinceDetection,
            timeSinceDetectionBucket: timeSinceDetectionBucket(minutesSinceDetection),
            timeSinceFirstTouchBucket: timeSinceFirstTouchBucket(e.minutesSinceFirstTouch),
            minutesSincePrevRetest,
            timeSincePrevRetestBucket: timeSincePrevRetestBucket(minutesSincePrevRetest),
            reactionQuality: e.reactionMet ? "met" : "missed",
            failureBehavior: failureBehavior(e.outcome, e.maxPenetrationPct),
            originNewsBucket: ob ? newsBucket(ob.ob_origin_news_window ?? ob.obOriginNewsWindow) : "unknown",
            detectionNewsBucket: ob ? newsBucket(ob.ob_detection_news_window ?? ob.obDetectionNewsWindow) : "unknown",
        });
    }

    // Preserve the caller's original ordering.
    return events.map((e) => enrichedByRef.get(e));
}

// ── Grouping ─────────────────────────────────────────────────────────────────────
/**
 * Group enriched events by a dimension accessor (key string or fn) into rows with
 * outcome counts + rates. survived+failed+open === n holds per row (invariant).
 */
export function groupRetestsByDimension(events = [], dimension, { minN = DEFAULT_MIN_N } = {}) {
    const dimFn = typeof dimension === "function" ? dimension : (e) => e[dimension];
    const map = new Map();
    for (const e of events) {
        const key = dimFn(e);
        if (key == null || key === "") continue;
        if (!map.has(key)) {
            map.set(key, { key, n: 0, survived: 0, failed: 0, open: 0, reactionSum: 0, reactionN: 0, failCandleSum: 0, failN: 0 });
        }
        const r = map.get(key);
        r.n += 1;
        if (e.outcome === "survived") r.survived += 1;
        else if (e.outcome === "failed") r.failed += 1;
        else r.open += 1;
        if (e.outcome !== "open" && num(e.reactionMaxPips) != null) { r.reactionSum += Number(e.reactionMaxPips); r.reactionN += 1; }
        if (e.outcome === "failed" && num(e.candlesToFailure) != null) { r.failCandleSum += Number(e.candlesToFailure); r.failN += 1; }
    }
    return [...map.values()].map((r) => {
        const closed = r.survived + r.failed;
        return {
            key: r.key,
            n: r.n,
            survived: r.survived,
            failed: r.failed,
            open: r.open,
            survivalRate: closed ? r.survived / closed : null,
            failureRate: closed ? r.failed / closed : null,
            avgReactionPips: r.reactionN ? r.reactionSum / r.reactionN : null,
            avgCandlesToFailure: r.failN ? r.failCandleSum / r.failN : null,
            belowMinN: r.n < minN,
        };
    }).sort((a, b) => b.n - a.n);
}

// Dimension accessors for the standard Edge Discovery tables.
export const RETEST_DIMENSIONS = {
    byRetestNumber: { label: "Retest #", fn: (e) => e.retestNumberBucket },
    byObSize: { label: "OB Size", fn: (e) => e.sizeBucket },
    byOriginSession: { label: "Origin Session", fn: (e) => e.originSession },
    byRetestSession: { label: "Retest Session", fn: (e) => e.retestSession },
    byStructure: { label: "Structure (BOS/CHoCH)", fn: (e) => e.structure },
    byDirection: { label: "Direction", fn: (e) => (e.direction === "bull" ? "Bullish" : e.direction === "bear" ? "Bearish" : e.direction) },
    byPenetration: { label: "Max Penetration", fn: (e) => e.maxPenetrationBucket },
    byTimeSinceDetection: { label: "Time Since Detection", fn: (e) => e.timeSinceDetectionBucket },
    byTimeSinceFirstTouch: { label: "Time Since First Touch", fn: (e) => e.timeSinceFirstTouchBucket },
};

export function buildRetestEdgeBreakdowns(events = [], { minN = DEFAULT_MIN_N } = {}) {
    const out = {};
    for (const [key, dim] of Object.entries(RETEST_DIMENSIONS)) {
        out[key] = { label: dim.label, rows: groupRetestsByDimension(events, dim.fn, { minN }) };
    }
    return out;
}

/**
 * Best / Worst conditions: flatten standard dimensions into labeled slices, keep
 * only slices with n >= minN and at least one closed retest, rank by survival rate.
 */
export function buildBestWorstRetestConditions(events = [], { minN = DEFAULT_MIN_N, top = 3 } = {}) {
    const candidates = [];
    for (const dim of Object.values(RETEST_DIMENSIONS)) {
        for (const row of groupRetestsByDimension(events, dim.fn, { minN })) {
            if (row.n >= minN && row.survivalRate != null) {
                candidates.push({
                    dimension: dim.label,
                    condition: `${dim.label}: ${row.key}`,
                    n: row.n,
                    survivalRate: row.survivalRate,
                    avgReactionPips: row.avgReactionPips,
                });
            }
        }
    }
    const byRate = [...candidates].sort((a, b) => b.survivalRate - a.survivalRate || b.n - a.n);
    return {
        minN,
        eligible: candidates.length,
        best: byRate.slice(0, top),
        worst: byRate.slice(-top).reverse(),
    };
}
