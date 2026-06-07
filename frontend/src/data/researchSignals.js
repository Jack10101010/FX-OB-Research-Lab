/**
 * researchSignals.js
 *
 * Pure engine for the Classification Tab V2 "Research Signals + Confidence" layer
 * (CLASSIFICATION-TAB-V2 Phase 2). No React, no imports, node-testable.
 *
 * Given the breakdowns already computed by the tab (fill-state, session, entry-model),
 * it auto-surfaces the strongest positive findings ("edges") and strongest negative
 * findings ("risks"), each with a confidence level, while:
 *   - suppressing low-sample findings,
 *   - deduplicating parent/child fill-state signals (Vacant vs AAE / Vacant-No-AAE),
 *   - ranking by effect size weighted by confidence so flukes can't top real edges.
 *
 * Metric convention (matches fillStateBreakdown / buildClassificationBreakdown):
 *   effect  = avgR (signed expectancy; + edge, - risk)
 *   decided = wins + losses (breakevens excluded)
 *
 * The engine returns structured data only; label/tooltip/headline composition is left to
 * the UI (which resolves labels via getTagMeta and tooltips via the glossary).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Config — all thresholds/weights live here for tunability + extensibility.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE_LEVELS = ["Very Low", "Low", "Medium", "High"];

export const DEFAULT_SIGNALS_CONFIG = {
    // Eligibility
    minDecidedForSignal:     10,   // a finding needs >= this many decided trades to be a signal
    minDecidedForConfidence: 5,    // below this, confidence is hard-floored to "Very Low"

    // Effect gating (avgR)
    posEffectThreshold:  0.15,     // effect >= → positive candidate (edge)
    negEffectThreshold: -0.15,     // effect <= → negative candidate (risk)

    // Output caps
    maxPositive: 3,
    maxNegative: 3,

    // Parent/child dedup (fill state)
    parentChildDivergence: 0.30,   // emit a Vacant child separately only if |child−parent| >= this

    // Confidence scoring
    sampleK: 40,                   // saturating constant for sampleScore = decided/(decided+K)
    z: 1.96,                       // z for the Wilson win-rate interval (precision proxy)
    hwRef: 0.25,                   // Wilson half-width that maps to stability 0
    zRef: 2,                       // |avgR|/rStdErr that maps to stability 1 (effect-SE path)
    weights: { sample: 0.6, stability: 0.4 },
    levelThresholds: { high: 0.75, medium: 0.5, low: 0.25 },
    levelWeight: { "Very Low": 0, "Low": 0.5, "Medium": 0.8, "High": 1.0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Deep-merge a partial config over the defaults. Only the known nested objects
 * (weights, levelThresholds, levelWeight) need merging — a plain spread would
 * replace them wholesale and silently drop unspecified sub-keys (e.g. a partial
 * `{ weights: { sample } }` would lose `weights.stability`, yielding NaN scores).
 */
function mergeConfig(config) {
    const c = config || {};
    return {
        ...DEFAULT_SIGNALS_CONFIG,
        ...c,
        weights:         { ...DEFAULT_SIGNALS_CONFIG.weights,         ...(c.weights || {}) },
        levelThresholds: { ...DEFAULT_SIGNALS_CONFIG.levelThresholds, ...(c.levelThresholds || {}) },
        levelWeight:     { ...DEFAULT_SIGNALS_CONFIG.levelWeight,     ...(c.levelWeight || {}) },
    };
}

/** Wilson score interval half-width for a proportion p over n trials. */
function wilsonHalfWidth(p, n, z) {
    if (n <= 0) return 1;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    return (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
}

function scoreToLevel(score, cfg) {
    if (score >= cfg.levelThresholds.high) return "High";
    if (score >= cfg.levelThresholds.medium) return "Medium";
    if (score >= cfg.levelThresholds.low) return "Low";
    return "Very Low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confidence for a single finding.
 *
 * Inputs (from any breakdown stats object):
 *   { count, wins, losses, avgR, rStdErr? }
 *
 *   - sampleScore  : saturating on decided = wins + losses.
 *   - stabilityScore: if rStdErr (SE of avgR) is provided → effect-significance
 *       (|avgR|/rStdErr normalized by zRef); else → precision of the win-rate estimate
 *       (Wilson interval half-width). rStdErr is a forward-compat hook for when the
 *       accumulators track sumR2.
 *
 * Hard floor: decided < minDecidedForConfidence → "Very Low" regardless of score.
 *
 * @returns {{ score:number, level:string, parts:{sampleScore:number, stabilityScore:number, decided:number, count:number} }}
 */
export function computeConfidence(stats, config = DEFAULT_SIGNALS_CONFIG) {
    const cfg = mergeConfig(config);
    const count = num(stats?.count);
    const wins = num(stats?.wins);
    const losses = num(stats?.losses);
    const decided = wins + losses;
    const avgR = Number.isFinite(stats?.avgR) ? Number(stats.avgR) : 0;

    const sampleScore = decided > 0 ? decided / (decided + cfg.sampleK) : 0;

    let stabilityScore;
    if (Number.isFinite(stats?.rStdErr) && stats.rStdErr > 0) {
        stabilityScore = clamp((Math.abs(avgR) / stats.rStdErr) / cfg.zRef, 0, 1);
    } else if (decided > 0) {
        const p = wins / decided;
        const hw = wilsonHalfWidth(p, decided, cfg.z);
        stabilityScore = clamp(1 - hw / cfg.hwRef, 0, 1);
    } else {
        stabilityScore = 0;
    }

    const score = clamp(
        cfg.weights.sample * sampleScore + cfg.weights.stability * stabilityScore,
        0, 1,
    );

    const level = decided < cfg.minDecidedForConfidence ? "Very Low" : scoreToLevel(score, cfg);

    return { score, level, parts: { sampleScore, stabilityScore, decided, count } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Research signals
// ─────────────────────────────────────────────────────────────────────────────

function makeCandidate(dimension, key, label, tooltipKey, stats) {
    return { dimension, key, label, tooltipKey, stats };
}

function toSignal(e, polarity, cfg) {
    return {
        id: `${e.dimension}:${e.key}`,
        polarity,
        dimension: e.dimension,
        key: e.key,
        label: e.label,           // null for fill_state/entry_model → UI resolves via getTagMeta
        tooltipKey: e.tooltipKey, // glossary key (may be null for non-canonical sessions)
        stats: e.stats,
        effect: e.effect,
        confidence: e.confidence,
        rankScore: Math.abs(e.effect) * (cfg.levelWeight[e.confidence.level] ?? 0),
    };
}

/**
 * Build the research-signal lists from the tab's breakdowns.
 *
 * @param {object}   fillStateBreakdown  { occupied_at_arm, vacant_at_arm, aae, vacant_no_aae, unknown_at_arm, ... }
 * @param {object[]} sessionBreakdown    rows { session, glossaryKey, count, wins, losses, winRate, netR, avgR }
 * @param {object[]} entryModelRows      rows { tag, count, wins, losses, winRate, netR, avgR }
 * @param {object}   config
 * @returns {{ positives: object[], negatives: object[], suppressed: number, evaluated: number }}
 */
export function buildResearchSignals(fillStateBreakdown, sessionBreakdown, entryModelRows, config = DEFAULT_SIGNALS_CONFIG) {
    const cfg = mergeConfig(config);

    // 1. Assemble candidates (uniform shape) -----------------------------------
    const candidates = [];
    const fb = fillStateBreakdown || {};

    // Fill state — exclude unknown_at_arm (uninstrumented, never a signal).
    for (const key of ["occupied_at_arm", "vacant_at_arm", "aae", "vacant_no_aae"]) {
        if (fb[key]) candidates.push(makeCandidate("fill_state", key, null, key, fb[key]));
    }

    // Sessions — exclude "Unknown".
    for (const row of Array.isArray(sessionBreakdown) ? sessionBreakdown : []) {
        if (!row || row.session === "Unknown") continue;
        const key = row.glossaryKey || `sess_${String(row.session).toLowerCase().replace(/\s+/g, "_")}`;
        candidates.push(makeCandidate("session", key, row.session, row.glossaryKey ?? null, row));
    }

    // Entry models.
    for (const row of Array.isArray(entryModelRows) ? entryModelRows : []) {
        if (!row || !row.tag) continue;
        candidates.push(makeCandidate("entry_model", row.tag, null, row.tag, row));
    }

    // 2. Enrich with effect + confidence + eligibility -------------------------
    const enriched = [];
    for (const c of candidates) {
        if (!c.stats) continue;
        const confidence = computeConfidence(c.stats, cfg);
        const effect = Number.isFinite(c.stats.avgR) ? Number(c.stats.avgR) : 0;
        const decided = num(c.stats.wins) + num(c.stats.losses);
        const eligible = decided >= cfg.minDecidedForSignal && confidence.level !== "Very Low";
        enriched.push({ ...c, effect, confidence, decided, eligible });
    }

    // 3. Parent/child dedup within fill state ----------------------------------
    // Drop a Vacant child only when the parent is eligible AND the child does not
    // materially diverge from it. Children are folded into the parent row.
    const fsByKey = {};
    for (const e of enriched) if (e.dimension === "fill_state") fsByKey[e.key] = e;
    const parent = fsByKey["vacant_at_arm"];
    const dropKeys = new Set();
    if (parent && parent.eligible) {
        for (const childKey of ["aae", "vacant_no_aae"]) {
            const child = fsByKey[childKey];
            if (!child) continue;
            if (Math.abs(child.effect - parent.effect) < cfg.parentChildDivergence) {
                dropKeys.add(childKey);
            }
        }
    }

    // 4. Partition + rank ------------------------------------------------------
    const positives = [];
    const negatives = [];
    let suppressed = 0;

    for (const e of enriched) {
        const isPos = e.effect >= cfg.posEffectThreshold;
        const isNeg = e.effect <= cfg.negEffectThreshold;
        if (!isPos && !isNeg) continue; // near-zero: not a signal (not "suppressed")

        if (!e.eligible) { suppressed += 1; continue; } // qualified by effect, failed sample/level

        if (e.dimension === "fill_state" && dropKeys.has(e.key)) continue; // deduped child

        if (isPos) positives.push(toSignal(e, "positive", cfg));
        else negatives.push(toSignal(e, "negative", cfg));
    }

    positives.sort((a, b) => b.rankScore - a.rankScore);
    negatives.sort((a, b) => b.rankScore - a.rankScore);

    return {
        positives: positives.slice(0, cfg.maxPositive),
        negatives: negatives.slice(0, cfg.maxNegative),
        suppressed,
        evaluated: enriched.length,
    };
}
