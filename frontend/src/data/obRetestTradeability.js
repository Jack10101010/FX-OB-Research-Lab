/**
 * obRetestTradeability.js — Tradeability Explorer pure data layer (Phase 2 Step 2).
 *
 * Answers, per cohort, "when this cohort works, how should it be traded?" by FUSING
 * the two existing grains of the OB-retest lab:
 *
 *   • event grain  — reaction / window-hold / failure rates, from the research layer
 *                    (groupRetestsByDimension). One row per retest *event*.
 *   • OB grain      — RR capture curve + median MFE-before-death, from the
 *                    monetization layer (buildRrCaptureCurve). One MFE per *order
 *                    block*.
 *
 * This module introduces NO new reaction/hold/failure math and NO new capture math —
 * it composes the existing builders and adds only two derivations: a suggested
 * target R and a suggested break-even trigger R, both pure functions of an existing
 * capture curve.
 *
 * Grain rules (see RETEST_DIMENSIONS[*].grain):
 *   grain "ob"    → group the OB list by the (OB-stable) dimension value and run the
 *                   real RR-capture curve per cohort. Full monetization is valid.
 *   grain "event" → an OB's single MFE-before-death cannot be attributed to one
 *                   event cohort, so monetization is withheld (null) with a reason.
 *                   Exception: byRetestNumber (mfeAnchor "retest") uses the existing
 *                   per-retest mfeAfterR1/R2/R3 anchors via buildDecayByRetest.
 *
 * Availability mirrors the monetization layer: when the per-OB rows are not v2.1
 * (buildRrCaptureCurve returns available:false), every monetization field is null —
 * we never fabricate captures for v1/v2 artifacts.
 */
import { DEFAULT_MIN_N, RETEST_DIMENSIONS, groupRetestsByDimension, obJoinKey } from "@/data/obRetestResearch";
import { buildRrCaptureCurve, buildDecayByRetest, hasV21Fields } from "@/data/obRetestMonetization";

// Capture-share floors for the two suggestions. Deliberately simple/transparent —
// future expectancy-based optimization can replace deriveSuggestedTargetAndBE
// wholesale without touching the cohort plumbing.
export const DEFAULT_TARGET_CAPTURE_FLOOR = 0.5;
export const DEFAULT_BE_CAPTURE_FLOOR = 0.7;

// R multiples surfaced as explicit capture columns (subset of RR_THRESHOLDS).
export const TRADEABILITY_CAPTURE_RS = [1, 2, 3, 5];

const num = (v) => (typeof v === "number" && isFinite(v) ? v : v == null || v === "" ? null : isFinite(Number(v)) ? Number(v) : null);

function nearestThreshold(value, thresholds) {
    if (value == null || !thresholds || !thresholds.length) return null;
    let best = thresholds[0];
    let bestD = Math.abs(thresholds[0] - value);
    for (const t of thresholds) {
        const d = Math.abs(t - value);
        if (d < bestD) { best = t; bestD = d; }
    }
    return best;
}

// Pull the capture share at a specific R from a curve's points (null if absent).
function shareAtR(points, r) {
    const p = (points || []).find((x) => x.r === r);
    return p ? p.share : null;
}

/**
 * deriveSuggestedTargetAndBE — the only new math in the module.
 *
 * @param curve  output shape of buildRrCaptureCurve ({ available, points:[{r,share}],
 *               medianMfeR }) — or any compatible {points, medianMfeR, available}.
 * @param reactionRow  the matching event-grain row (reserved for future expectancy
 *               weighting; unused in this transparent first implementation).
 * @param options { targetFloor, beFloor }
 * @returns { suggestedTargetR, suggestedBETriggerR, targetFromFallback, targetFloor, beFloor }
 *
 * Suggested target  = the LARGEST R whose capture share ≥ targetFloor (the furthest
 *                     target a majority of the cohort's zones actually reached). If
 *                     nothing clears the floor, fall back to medianMfeR snapped to
 *                     the nearest available R threshold (targetFromFallback=true), or
 *                     null when there is no median either.
 * Suggested BE trig = the SMALLEST R whose capture share ≥ beFloor (move to break
 *                     even once a strong majority has reached that level); null when
 *                     none clears the floor.
 */
export function deriveSuggestedTargetAndBE(curve, reactionRow, options = {}) {
    const targetFloor = options.targetFloor != null ? options.targetFloor : DEFAULT_TARGET_CAPTURE_FLOOR;
    const beFloor = options.beFloor != null ? options.beFloor : DEFAULT_BE_CAPTURE_FLOOR;
    void reactionRow; // reserved (future expectancy weighting); kept in the signature.

    const base = { suggestedTargetR: null, suggestedBETriggerR: null, targetFromFallback: false, targetFloor, beFloor };
    if (!curve || curve.available === false || !Array.isArray(curve.points) || curve.points.length === 0) return base;

    const pts = curve.points.filter((p) => p && p.share != null);

    // Target: largest R clearing the target floor.
    const clearing = pts.filter((p) => p.share >= targetFloor);
    let suggestedTargetR = clearing.length ? Math.max(...clearing.map((p) => p.r)) : null;
    let targetFromFallback = false;
    if (suggestedTargetR == null && curve.medianMfeR != null) {
        suggestedTargetR = nearestThreshold(curve.medianMfeR, curve.points.map((p) => p.r));
        targetFromFallback = suggestedTargetR != null;
    }

    // BE trigger: smallest R clearing the BE floor.
    const beClearing = pts.filter((p) => p.share >= beFloor).sort((a, b) => a.r - b.r);
    const suggestedBETriggerR = beClearing.length ? beClearing[0].r : null;

    return { suggestedTargetR, suggestedBETriggerR, targetFromFallback, targetFloor, beFloor };
}

// Empty monetization block (event-grain dimensions, or no-cohort / v1-v2 rows).
function blankMonetization(reason) {
    return {
        monetizationAvailable: false,
        mfeAnchor: null,
        eligibleN: null,
        excludedNoWidth: null,
        medianMfeR: null,
        capture1R: null,
        capture2R: null,
        capture3R: null,
        capture5R: null,
        suggestedTargetR: null,
        suggestedBETriggerR: null,
        targetFromFallback: false,
        reason: reason || null,
    };
}

// Map an event-grain row (from groupRetestsByDimension) to a tradeability row that
// keeps the reaction stats and carries an explicitly-empty monetization block.
function reactionOnlyRow(row, reason) {
    return {
        key: row.key,
        n: row.n,
        belowMinN: row.belowMinN,
        reactionSuccessRate: row.reactionSuccessRate,
        windowHoldRate: row.windowHoldRate,
        failureRate: row.failureRate,
        ...blankMonetization(reason),
    };
}

const EVENT_GRAIN_REASON = "event-grain dimension; OB-level MFE cannot be attributed safely";

/**
 * buildTradeabilityRows — per-cohort fusion for one dimension.
 *
 * @param enrichedEvents  output of enrichRetestEvents (event grain).
 * @param perOB           per-OB summary rows (OB grain; v2.1 carries MFE fields).
 * @param orderBlocks     OB metadata (widths) for R conversion.
 * @param dimKey          a key of RETEST_DIMENSIONS.
 * @param options { minN, targetFloor, beFloor }
 *
 * @returns {
 *   available, dimKey, label, grain, mfeAnchor, monetizationAvailable, reason,
 *   minN, excludedNoWidth, rows: [...]
 * }
 *   rows carry, per cohort value: n, belowMinN, reactionSuccessRate, windowHoldRate,
 *   failureRate, and the monetization block (null-filled when unavailable).
 */
export function buildTradeabilityRows(enrichedEvents = [], perOB = [], orderBlocks = [], dimKey, options = {}) {
    const minN = options.minN != null ? options.minN : DEFAULT_MIN_N;
    const dim = RETEST_DIMENSIONS[dimKey];
    if (!dim) {
        return {
            available: false,
            dimKey,
            label: null,
            grain: null,
            mfeAnchor: null,
            monetizationAvailable: false,
            reason: `unknown dimension '${dimKey}'`,
            minN,
            excludedNoWidth: 0,
            rows: [],
        };
    }

    // Reaction / hold / failure — always from the existing research grouping.
    const reactionRows = groupRetestsByDimension(enrichedEvents, dim.fn, { minN });
    const v21 = hasV21Fields(perOB);

    // ── event-grain (generic): reaction only, monetization explicitly withheld ──
    if (dim.grain === "event" && dim.mfeAnchor !== "retest") {
        return {
            available: true,
            dimKey,
            label: dim.label,
            grain: dim.grain,
            mfeAnchor: null,
            monetizationAvailable: false,
            reason: EVENT_GRAIN_REASON,
            minN,
            excludedNoWidth: 0,
            rows: reactionRows.map((r) => reactionOnlyRow(r, EVENT_GRAIN_REASON)),
        };
    }

    // ── byRetestNumber special case: per-retest MFE anchors (mfeAnchor "retest") ──
    if (dim.mfeAnchor === "retest") {
        const v21Reason = "v2.1 per-OB MFE fields unavailable (v1/v2 artifact)";
        const decay = buildDecayByRetest(perOB, orderBlocks); // rows keyed R1/R2/R3
        const anchorByKey = new Map((decay.rows || []).map((r) => [r.key, r]));
        // retestNumberBucket emits R1 / R2 / R3+ ; the R3+ bucket maps onto the R3 anchor.
        const anchorFor = (key) => anchorByKey.get(key) || (key === "R3+" ? anchorByKey.get("R3") : null);
        const rows = reactionRows.map((r) => {
            const anchor = anchorFor(r.key);
            if (!v21 || !decay.available || !anchor) {
                return reactionOnlyRow(r, v21 ? "no per-retest MFE anchor for this cohort" : v21Reason);
            }
            // Synthesize a minimal curve from the anchor's 1R/2R captures so the
            // suggestion derivation is shared with the OB-grain path (no new math).
            const synthCurve = {
                available: true,
                medianMfeR: anchor.medianR,
                points: [
                    { r: 1, share: anchor.capture1R },
                    { r: 2, share: anchor.capture2R },
                ],
            };
            const sug = deriveSuggestedTargetAndBE(synthCurve, r, options);
            return {
                key: r.key,
                n: r.n,
                belowMinN: r.belowMinN,
                reactionSuccessRate: r.reactionSuccessRate,
                windowHoldRate: r.windowHoldRate,
                failureRate: r.failureRate,
                monetizationAvailable: true,
                mfeAnchor: "retest",
                eligibleN: anchor.n,
                excludedNoWidth: null, // reported once at the table level (decay.excludedNoWidth)
                medianMfeR: anchor.medianR,
                capture1R: anchor.capture1R,
                capture2R: anchor.capture2R,
                capture3R: null, // decay anchors only expose 1R/2R captures
                capture5R: null,
                suggestedTargetR: sug.suggestedTargetR,
                suggestedBETriggerR: sug.suggestedBETriggerR,
                targetFromFallback: sug.targetFromFallback,
                reason: null,
            };
        });
        return {
            available: true,
            dimKey,
            label: dim.label,
            grain: dim.grain,
            mfeAnchor: "retest",
            monetizationAvailable: v21 && decay.available,
            reason: v21 ? null : v21Reason,
            minN,
            excludedNoWidth: decay.excludedNoWidth || 0,
            rows,
        };
    }

    // ── OB-grain: group the OB list by the (OB-stable) dimension value ──
    // The dimension fn reads an enriched EVENT; for an OB-stable dimension every
    // event of an OB yields the same value, so we read it off any one event and
    // map obKey → value, then bucket the perOB rows through that map.
    const valueByObKey = new Map();
    for (const e of enrichedEvents || []) {
        const k = obJoinKey(e && e.obId);
        if (k == null || valueByObKey.has(k)) continue;
        const val = dim.fn(e);
        if (val == null || val === "") continue;
        valueByObKey.set(k, val);
    }

    const cohortOB = new Map(); // dimensionValue → perOB rows
    for (const p of perOB || []) {
        const k = obJoinKey(p && p.obId);
        const val = k != null ? valueByObKey.get(k) : null;
        if (val == null) continue;
        if (!cohortOB.has(val)) cohortOB.set(val, []);
        cohortOB.get(val).push(p);
    }

    const v21Reason = "v2.1 per-OB MFE fields unavailable (v1/v2 artifact)";
    let totalExcludedNoWidth = 0;
    const rows = reactionRows.map((r) => {
        if (!v21) return reactionOnlyRow(r, v21Reason);
        const cohort = cohortOB.get(r.key) || [];
        const curve = buildRrCaptureCurve(cohort, orderBlocks, { thresholds: options.thresholds });
        totalExcludedNoWidth += curve.excludedNoWidth || 0;
        const sug = deriveSuggestedTargetAndBE(curve, r, options);
        return {
            key: r.key,
            n: r.n,
            belowMinN: r.belowMinN,
            reactionSuccessRate: r.reactionSuccessRate,
            windowHoldRate: r.windowHoldRate,
            failureRate: r.failureRate,
            monetizationAvailable: true,
            mfeAnchor: "ob",
            eligibleN: curve.eligibleN,
            excludedNoWidth: curve.excludedNoWidth,
            medianMfeR: curve.medianMfeR,
            capture1R: shareAtR(curve.points, 1),
            capture2R: shareAtR(curve.points, 2),
            capture3R: shareAtR(curve.points, 3),
            capture5R: shareAtR(curve.points, 5),
            suggestedTargetR: sug.suggestedTargetR,
            suggestedBETriggerR: sug.suggestedBETriggerR,
            targetFromFallback: sug.targetFromFallback,
            reason: null,
        };
    });

    return {
        available: true,
        dimKey,
        label: dim.label,
        grain: dim.grain,
        mfeAnchor: "ob",
        monetizationAvailable: v21,
        reason: v21 ? null : v21Reason,
        minN,
        excludedNoWidth: totalExcludedNoWidth,
        rows,
    };
}

// Silence unused-import lints in environments that tree-shake aggressively; `num`
// is retained for parity with sibling modules' numeric coercion helper.
void num;
