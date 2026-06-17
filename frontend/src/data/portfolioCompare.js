// portfolioCompare.js — PORTFOLIO-COMPARISON (MVP).
//
// PURE diff of two EFFECTIVE portfolio maps (the output of
// buildEffectivePortfolioMap(profiles, bundle, variant)). Comparison is
// run/bundle dependent BY DESIGN — both sides must be resolved against the SAME
// bundle + variant before calling this. We never compare raw profile JSON.
//
// Read-only: inputs are never mutated.
//
// Difference model (no double-counting):
//   • If EITHER side is disabled for a cohort → only a "disabled" difference is
//     considered (a disabled cohort has no meaningful entry/BE/target). Both
//     disabled ⇒ no difference.
//   • Otherwise (both enabled) → entry / BE / target differences are by resolved
//     ref identity, and an availability difference is any per-dimension status
//     mismatch (available vs unavailable vs na).
//
// A cohort "differs" when any tracked difference is present.

const NULL_RESULT = () => ({
    counts: { cohortsDiffer: 0, entry: 0, be: 0, target: 0, disabled: 0, availability: 0 },
    groups: [],
});

function diffCell(a, b) {
    // a, b are `effective` objects. Returns { changed, dims } where dims flags
    // which tracked dimensions differ. Never mutates a/b.
    const dims = { entry: false, be: false, target: false, disabled: false, availability: false };
    if (!a || !b) return { changed: false, dims };

    const aDis = !!a.disabled, bDis = !!b.disabled;
    if (aDis || bDis) {
        dims.disabled = aDis !== bDis; // both disabled ⇒ no difference
        return { changed: dims.disabled, dims };
    }
    // Both enabled — compare resolved config by ref identity (null = inherit/base).
    dims.entry = (a.entryRef ?? null) !== (b.entryRef ?? null);
    dims.be = (a.beRef ?? null) !== (b.beRef ?? null);
    dims.target = (a.targetRef ?? null) !== (b.targetRef ?? null);
    dims.availability =
        a.entryStatus !== b.entryStatus
        || a.beStatus !== b.beStatus
        || a.targetStatus !== b.targetStatus;
    const changed = dims.entry || dims.be || dims.target || dims.availability;
    return { changed, dims };
}

/**
 * Compare two effective portfolio maps.
 * @param {object} aMap  buildEffectivePortfolioMap output (side A)
 * @param {object} bMap  buildEffectivePortfolioMap output (side B)
 * @returns {{ counts, groups }} — groups contains only changed cohorts, grouped
 *   by session in map order; each row carries the two `effective` snapshots
 *   (by reference, read-only) + the per-dimension `dims` flags.
 */
export function compareEffectivePortfolioMaps(aMap, bMap) {
    if (!aMap?.cells || !bMap?.cells) return NULL_RESULT();
    const order = aMap.order || bMap.order || { sessions: [], cells: [] };
    const sessions = order.sessions || [];
    const cellsOrder = order.cells || [];

    const counts = { cohortsDiffer: 0, entry: 0, be: 0, target: 0, disabled: 0, availability: 0 };
    const groups = [];

    for (const s of sessions) {
        const rows = [];
        for (const c of cellsOrder) {
            const key = `${s}|${c}`;
            const aCell = aMap.cells[key];
            const bCell = bMap.cells[key];
            const { changed, dims } = diffCell(aCell?.effective, bCell?.effective);
            if (!changed) continue;
            counts.cohortsDiffer += 1;
            if (dims.entry) counts.entry += 1;
            if (dims.be) counts.be += 1;
            if (dims.target) counts.target += 1;
            if (dims.disabled) counts.disabled += 1;
            if (dims.availability) counts.availability += 1;
            rows.push({ cell: c, dims, a: aCell?.effective || null, b: bCell?.effective || null });
        }
        if (rows.length) groups.push({ session: s, rows });
    }

    return { counts, groups };
}
