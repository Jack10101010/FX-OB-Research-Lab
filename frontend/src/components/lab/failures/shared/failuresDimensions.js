// ── failuresDimensions.js ────────────────────────────────────────────────────
// BACK-COMPAT SHIM (Research Lab Phase 0). The dimension registry moved to the
// neutral data layer at data/cohortDimensions.js. This module preserves the exact
// legacy Failures-Lab surface — FAILURE_DIMENSIONS / DIMENSION_BY_KEY /
// resolveDimension / dimensionAvailable / availableDimensions — scoped to the
// ORIGINAL 12 dimensions (CORE_DIMENSIONS), so the new month/year dims never leak
// into Failures discovery or its dimension pickers. Behavior is unchanged.
//
// Convention: an accessor returns a display string, or `null` when the trade
// carries no real signal for that dimension. See data/cohortDimensions.js.

import {
    CORE_DIMENSIONS, byKey, resolveDimension, dimensionAvailable,
} from "@/data/cohortDimensions";

export { resolveDimension, dimensionAvailable };

// Legacy alias — the original 12-dimension registry (no month/year).
export const FAILURE_DIMENSIONS = CORE_DIMENSIONS;
export const DIMENSION_BY_KEY = byKey(CORE_DIMENSIONS);

// Scoped to the legacy registry so the Failures UI dimension set is unchanged.
export function availableDimensions(trades) {
    return CORE_DIMENSIONS.filter((d) => dimensionAvailable(d, trades));
}
