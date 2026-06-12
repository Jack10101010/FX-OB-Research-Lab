// sampleGuardrail.js — ONE source of truth for "is this sample big enough to
// trust a conclusion?" (PROTECTION-LAYER Phase 3).
//
// Cohort slicing + protection layers make it trivially easy to land on a tiny,
// overfit sample. Every surface that shows a verdict, ranking, recommendation,
// or confident delta (BreakevenTab, Failures Lab, Comparison Lab) should route
// its sample size through here so the suppression threshold and messaging are
// identical everywhere. Pure, no imports.
//
// Mirrors the LOW_SAMPLE_THRESHOLD already used inside selectiveBeUniverse (10),
// kept in sync intentionally — that module is import-free for its single-file
// validation harness, so the constant is duplicated rather than shared.

export const LOW_SAMPLE_THRESHOLD = 10;
// Below this, deltas/verdicts are essentially noise — suppress conclusions hard.
export const MIN_VERDICT_SAMPLE = 5;

/**
 * Evaluate a sample size against the guardrail thresholds.
 *
 * @param {{ sampleSize?: number }} input
 * @returns {{
 *   sampleSize: number,
 *   lowSample: boolean,        // below LOW_SAMPLE_THRESHOLD → show a caution
 *   suppressVerdict: boolean,  // below MIN_VERDICT_SAMPLE → hide strong conclusions
 *   message: string | null,    // user-facing caution (null when sample is adequate)
 * }}
 */
export function evaluateSampleGuardrail({ sampleSize } = {}) {
    const n = Number.isFinite(Number(sampleSize)) ? Math.max(0, Math.trunc(Number(sampleSize))) : 0;
    const lowSample = n < LOW_SAMPLE_THRESHOLD;
    const suppressVerdict = n < MIN_VERDICT_SAMPLE;
    let message = null;
    if (suppressVerdict) {
        message = `Sample too small (${n}) — conclusions suppressed. Treat as anecdotal.`;
    } else if (lowSample) {
        message = `Low sample (${n}) — treat any verdict as exploratory, not a rule.`;
    }
    return { sampleSize: n, lowSample, suppressVerdict, message };
}

/** Convenience: true when a strong recommendation/verdict should be hidden. */
export function shouldSuppressVerdict(sampleSize) {
    return evaluateSampleGuardrail({ sampleSize }).suppressVerdict;
}
