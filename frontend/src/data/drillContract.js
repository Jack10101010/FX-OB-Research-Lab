/**
 * drillContract.js — the shared drill payload (Phase RB-8a).
 *
 * Every surface that can drill into the underlying trades (CanonicalBucketTable
 * rows, EntriesLab model rows, ComparisonLab run rows, RunDetail ledger) emits
 * this single shape, and the future Edge Explorer (Layer 3) consumes it without
 * per-surface adapters. Pure / framework-free. No Edge Explorer wiring here.
 *
 * Shape:
 *   {
 *     runId,        // string | null   which run
 *     universeKey,  // string | null   which trade universe (scenario sourceKey)
 *     basis,        // "raw_r" | "current_equity"
 *     account,      // normalized account config | null
 *     bucketKey,    // string | null   which bucket/model/cell
 *     label,        // string | null   human label
 *     tradeRefs,    // Trade[]         the underlying trades (always an array)
 *   }
 */

import { normalizeBasis, accountConfigHash } from "./resultsBasis.js";
import { normalizeAccountSettings } from "../components/lab/account/accountEquity.js";

export const EMPTY_DRILL_PAYLOAD = Object.freeze({
    runId: null,
    universeKey: null,
    basis: "raw_r",
    account: null,
    bucketKey: null,
    label: null,
    tradeRefs: [],
});

/**
 * Build a drill payload from explicit inputs (validated + normalized).
 * @param {object} input
 * @returns {object} drill payload
 */
export function createDrillPayload(input = {}) {
    const basis = normalizeBasis(input.basis);
    const account = input.account ? normalizeAccountSettings(input.account) : null;
    const tradeRefs = Array.isArray(input.tradeRefs)
        ? input.tradeRefs
        : (Array.isArray(input.trades) ? input.trades : []);
    return {
        runId: input.runId ?? null,
        universeKey: input.universeKey ?? input.sourceKey ?? null,
        basis,
        account,
        bucketKey: input.bucketKey ?? input.key ?? null,
        label: input.label ?? input.bucketKey ?? null,
        tradeRefs,
    };
}

/**
 * Coerce an arbitrary object (e.g. a canonical bucket/summary row) into a drill
 * payload. Tolerant of missing fields; always returns a valid payload.
 */
export function normalizeDrillPayload(input) {
    if (!input || typeof input !== "object") return { ...EMPTY_DRILL_PAYLOAD };
    return createDrillPayload(input);
}

/** Is this payload actually drillable (has trades)? */
export function isDrillable(payload) {
    return Boolean(payload && Array.isArray(payload.tradeRefs) && payload.tradeRefs.length > 0);
}

/** Stable identity for a drill payload (memo / dedupe). */
export function drillPayloadKey(payload) {
    const p = normalizeDrillPayload(payload);
    return [p.runId ?? "—", p.universeKey ?? "baseline", p.basis, accountConfigHash(p.account), p.bucketKey ?? "—"].join("::");
}

export default {
    EMPTY_DRILL_PAYLOAD,
    createDrillPayload,
    normalizeDrillPayload,
    isDrillable,
    drillPayloadKey,
};
