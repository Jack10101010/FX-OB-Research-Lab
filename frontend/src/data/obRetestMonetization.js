/**
 * obRetestMonetization.js — OB Retest Monetization layer (Phase C, pure)
 * ======================================================================
 * Pure, framework-free views over the v2.1 per-OB rows (engine-derived or a
 * v2.1 backend summary artifact): how much opportunity a zone offered BEFORE it
 * died, how long zones live, and whether successive retests consume the payout.
 *
 * SOURCE OF TRUTH: OB-RETEST-V2.1-MONETIZATION-PLAN-1.md §2.2/§2.4 and
 * OB-LIFECYCLE-MONETIZATION-AUDIT-1.md (metric definitions + evidence values).
 *
 * R UNIT (idealized — see researchGlossary `retest_idealized_r`):
 *   1R = the OB's own width in pips (entry proximal edge, stop distal edge,
 *   perfect fills, no spread). mfeBeforeDeathR = mfeBeforeDeathPips / obWidthPips.
 *   This measures OPPORTUNITY, not realized PnL — every capture share is an
 *   upper bound.
 *
 * NULL-GATING: when the rows carry no v2.1 fields (v1/v2 artifacts), every
 * builder returns `{ available: false, ... }` — never fake zeros. OBs without a
 * resolvable width are EXCLUDED from R-based stats and counted in
 * `excludedNoWidth` (widths come from orderBlocks joined by ob id; no pip-size
 * guessing — deriving width from raw prices with an assumed pip would be wrong
 * for JPY-style pairs).
 */
import { medianOf } from "@/data/obRetest";
import { obJoinKey } from "@/data/obRetestResearch";

export const RR_THRESHOLDS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

// Time-to-invalidation buckets (minutes, lower bound inclusive).
export const TTI_BUCKETS = [
    { key: "lt15m", label: "<15m", min: 0, max: 15 },
    { key: "m15to60", label: "15-60m", min: 15, max: 60 },
    { key: "h1to4", label: "1-4h", min: 60, max: 240 },
    { key: "h4to24", label: "4-24h", min: 240, max: 1440 },
    { key: "d1to7", label: "1-7d", min: 1440, max: 10080 },
    { key: "gt7d", label: ">7d", min: 10080, max: Infinity },
];

const num = (v) => (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null);
const round2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

// v2.1 capability: an explicit artifact tag OR any non-null v2.1 value. v2
// artifacts carry terminal fields but all v2.1 fields null → unavailable.
export function hasV21Fields(perOB = []) {
    return (perOB || []).some(
        (p) =>
            p &&
            (p.retestArtifactVersion === 2.1 ||
                p.killMarginPips != null ||
                p.killConfirmedTf != null ||
                p.reheldAfterKill != null ||
                p.mfeBeforeDeathPips != null),
    );
}

// Width lookup (pips) joined from orderBlocks by canonical ob key.
function buildWidthByKey(orderBlocks = []) {
    const map = new Map();
    for (const ob of orderBlocks || []) {
        const k = obJoinKey(ob?.id ?? ob?.obId ?? ob?.ob_id);
        if (k == null || map.has(k)) continue;
        const w = num(ob?.obWidthPips ?? ob?.ob_width_pips ?? ob?.width_pips);
        if (w != null && w > 0) map.set(k, w);
    }
    return map;
}

const isInvalidated = (p) => typeof p?.finalOutcome === "string" && p.finalOutcome.startsWith("invalidated");
const isCensored = (p) => p?.finalOutcome === "alive_at_data_end" || p?.finalOutcome === "capped";

// Join perOB rows to widths → R-rows { row, widthPips, mfeR }. Rows with a
// measured MFE but no resolvable width are counted, not silently dropped.
function joinR(perOB = [], orderBlocks = []) {
    const widths = buildWidthByKey(orderBlocks);
    const rRows = [];
    let excludedNoWidth = 0;
    for (const p of perOB || []) {
        if (!p || num(p.mfeBeforeDeathPips) == null) continue; // untouched/unevaluated
        const w = widths.get(obJoinKey(p.obId));
        if (w == null) { excludedNoWidth += 1; continue; }
        rRows.push({ row: p, widthPips: w, mfeR: Number(p.mfeBeforeDeathPips) / w });
    }
    return { rRows, excludedNoWidth };
}

/**
 * RR capture curve — of eligible touched OBs, the share whose MFE before death
 * reached ≥ each threshold (monotone non-increasing by construction).
 */
export function buildRrCaptureCurve(perOB = [], orderBlocks = [], { thresholds = RR_THRESHOLDS } = {}) {
    if (!hasV21Fields(perOB)) return { available: false, eligibleN: 0, excludedNoWidth: 0, points: [], medianMfeR: null };
    const { rRows, excludedNoWidth } = joinR(perOB, orderBlocks);
    const n = rRows.length;
    const points = thresholds.map((r) => {
        const captured = rRows.filter((x) => x.mfeR >= r).length;
        return { r, captured, share: n ? captured / n : null };
    });
    return {
        available: true,
        eligibleN: n,
        excludedNoWidth,
        points,
        medianMfeR: round2(medianOf(rRows.map((x) => x.mfeR))),
    };
}

/**
 * Time-to-invalidation distribution. Killed OBs bucket by minutes from first
 * touch to death; alive/capped OBs are CENSORED (their own bucket — never mixed
 * into a time bucket); never-touched/unevaluated OBs are excluded entirely.
 */
export function buildTtiBuckets(perOB = []) {
    if (!hasV21Fields(perOB)) return { available: false, killed: 0, censored: 0, total: 0, buckets: [] };
    let killed = 0, censored = 0;
    const counts = new Map(TTI_BUCKETS.map((b) => [b.key, 0]));
    for (const p of perOB || []) {
        if (!p) continue;
        if (isCensored(p)) { censored += 1; continue; }
        if (!isInvalidated(p)) continue; // never_touched / degenerate
        const tti = num(p.timeToInvalidationMinutes);
        if (tti == null) continue;
        killed += 1;
        const b = TTI_BUCKETS.find((x) => tti >= x.min && tti < x.max) || TTI_BUCKETS[TTI_BUCKETS.length - 1];
        counts.set(b.key, counts.get(b.key) + 1);
    }
    const total = killed + censored;
    const buckets = TTI_BUCKETS.map((b) => ({
        key: b.key, label: b.label, n: counts.get(b.key), share: total ? counts.get(b.key) / total : null,
    }));
    buckets.push({ key: "censored", label: "censored", n: censored, share: total ? censored / total : null });
    return { available: true, killed, censored, total, buckets };
}

/**
 * Edge decay by retest number — MFE measured from each retest entry to death
 * (or data end). Rows with a missing anchor (the retest never happened) simply
 * don't contribute to that anchor's cohort.
 */
export function buildDecayByRetest(perOB = [], orderBlocks = []) {
    if (!hasV21Fields(perOB)) return { available: false, excludedNoWidth: 0, rows: [] };
    const widths = buildWidthByKey(orderBlocks);
    const anchors = [
        { key: "R1", field: "mfeAfterR1Pips" },
        { key: "R2", field: "mfeAfterR2Pips" },
        { key: "R3", field: "mfeAfterR3Pips" },
    ];
    let excludedNoWidth = 0;
    const seenExcluded = new Set();
    const rows = anchors.map(({ key, field }) => {
        const rValues = [];
        for (const p of perOB || []) {
            if (!p || num(p[field]) == null) continue;
            const w = widths.get(obJoinKey(p.obId));
            if (w == null) {
                // count each width-less OB once across the whole table
                const id = obJoinKey(p.obId);
                if (!seenExcluded.has(id)) { seenExcluded.add(id); excludedNoWidth += 1; }
                continue;
            }
            rValues.push(Number(p[field]) / w);
        }
        const n = rValues.length;
        return {
            key,
            n,
            medianR: round2(medianOf(rValues)),
            capture1R: n ? rValues.filter((r) => r >= 1).length / n : null,
            capture2R: n ? rValues.filter((r) => r >= 2).length / n : null,
        };
    });
    return { available: true, excludedNoWidth, rows };
}

/**
 * Umbrella summary for the (future, Phase D) Monetization UI section. Pure
 * composition of the three builders + the headline median.
 */
export function buildMonetizationSummary(perOB = [], orderBlocks = []) {
    if (!hasV21Fields(perOB)) {
        return {
            available: false,
            reason: "v2.1 fields unavailable (v1/v2 artifact or no per-OB data) — re-export the run with the v2.1 tracker",
            eligibleN: 0,
            excludedNoWidth: 0,
            medianMfeBeforeDeathR: null,
            rrCapture: buildRrCaptureCurve(perOB, orderBlocks),
            ttiBuckets: buildTtiBuckets(perOB),
            decayByRetest: buildDecayByRetest(perOB, orderBlocks),
        };
    }
    const rrCapture = buildRrCaptureCurve(perOB, orderBlocks);
    return {
        available: true,
        eligibleN: rrCapture.eligibleN,
        excludedNoWidth: rrCapture.excludedNoWidth,
        medianMfeBeforeDeathR: rrCapture.medianMfeR,
        rrCapture,
        ttiBuckets: buildTtiBuckets(perOB),
        decayByRetest: buildDecayByRetest(perOB, orderBlocks),
    };
}
