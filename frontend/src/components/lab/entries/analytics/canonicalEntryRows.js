/**
 * canonicalEntryRows — Phase RB-8c adapter (EntriesLab Layer 1 foundation).
 *
 * EntriesLab is a multi-model comparison surface, NOT a single-universe bucket
 * page, so it does not use CanonicalBucketTable. Instead, each entry-model row
 * is normalized to the frozen canonical SUMMARY shape via
 * `resultsBasis.toCanonicalSummaryRow`, preserving every existing UI field.
 *
 * Honesty rules (per the phase brief):
 *   • Canonical WR = wins/(wins+losses) is computed at the entryAnalytics source
 *     (this adapter re-derives it through toCanonicalSummaryRow for consistency
 *     and tags `winRateSource`).
 *   • Current Equity is supported ONLY when the row has underlying trades
 *     (tradesByMode). Backend-summary-only rows have `ceSupported: false` and
 *     NO fabricated CE values.
 *
 * Pure / framework-free.
 */

import { toCanonicalSummaryRow } from "@/data/resultsBasis";

/**
 * Normalize one entry-model row.
 * @param {object} row     a row from buildEntryResultRows / entryRowFromSummary
 * @param {object} [opts]  { basis, account, trades }  trades = this model's tradesByMode list
 * @returns {object} the original row + { canonical, ce, ceSupported, winRateSource }
 */
export function toCanonicalEntryRow(row, opts = {}) {
    const basis = opts.basis === "current_equity" ? "current_equity" : "raw_r";
    const account = opts.account || null;
    const trades = Array.isArray(opts.trades) ? opts.trades : null;
    const hasTrades = Boolean(trades && trades.length);

    // Raw-R canonical view from the existing summary row (recomputes canonical
    // WR from wins/losses when present; preserves netR/expectancy/PF/counts).
    const canonical = toCanonicalSummaryRow(row, {
        basis: "raw_r",
        label: row.label ?? row.mode,
        key: row.mode,
    });

    // Current Equity is only meaningful with underlying trades.
    const ceSupported = hasTrades;
    const ce = (basis === "current_equity" && hasTrades)
        ? toCanonicalSummaryRow(trades, { basis: "current_equity", account, label: row.label ?? row.mode, key: row.mode })
        : null;

    return {
        ...row,
        canonical,
        ce,
        ceSupported,
        winRateSource: canonical.winRateSource,
    };
}

/**
 * Normalize a list of entry-model rows.
 * @param {object[]} rows
 * @param {object} [opts] { basis, account, tradesByMode, variant }
 *        tradesByMode: optional map keyed by mode (or `${variant}__${mode}`)
 */
export function buildCanonicalEntryRows(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const tbm = opts.tradesByMode || null;
    const variant = opts.variant || null;
    return list.map((row) => {
        let trades = opts.trades || null;
        if (!trades && tbm) {
            trades = (variant && tbm[`${variant}__${row.mode}`]) || tbm[row.mode] || null;
        }
        return toCanonicalEntryRow(row, { basis: opts.basis, account: opts.account, trades });
    });
}

export default { toCanonicalEntryRow, buildCanonicalEntryRows };
