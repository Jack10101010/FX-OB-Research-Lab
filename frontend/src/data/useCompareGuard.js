/**
 * useCompareGuard — shared guard for whether two comparison sides are safe to
 * compare, and which deltas must be suppressed (Phase RB-8a).
 *
 * Encodes the rules from TABLE_COMPARE_BASIS_AUDIT.md so Table Compare Layer 1
 * (EntriesLab) and Layer 2 (ComparisonLab) share one implementation instead of
 * re-deriving suppression logic per page. No UI here.
 *
 * Each "side" = { basis, accountSettings, summary? } where `summary` is a
 * canonical summary row (carries profitFactor etc.) — optional.
 *
 * Returns:
 *   {
 *     canCompare,    // boolean — false only when bases mismatch
 *     warnings,      // [{ code, message }]
 *     suppressions,  // string[] of delta kinds to hide: "currency",
 *                    //   "currency_absolute", "profitFactor"
 *     basis,         // the shared basis (or null if mismatched)
 *     accountHash,   // shared account hash when comparable, else null
 *   }
 *
 * Suppression codes:
 *   MISMATCHED_BASIS        — sides measured on different bases (cannot compare)
 *   CONFIG_DIFFERS          — CE account configs differ → suppress currency deltas
 *   BALANCE_DIFFERS         — CE configs equal except starting balance → % only
 *   SEQUENCE_DEPENDENT      — CE contribution is path-dependent (informational)
 *   PF_UNDEFINED            — a side's PF is ∞/undefined → suppress Δ PF
 */

import { useMemo } from "react";
import { normalizeBasis, accountConfigHash, BASIS } from "./resultsBasis.js";
import { normalizeAccountSettings } from "../components/lab/account/accountEquity.js";

function pfDefined(summary) {
    if (!summary) return true; // unknown → don't suppress
    const pf = summary.profitFactor;
    return pf != null && Number.isFinite(pf);
}

/**
 * Pure evaluation. @param a,b comparison sides. @returns guard result.
 */
export function evaluateCompare(a = {}, b = {}) {
    const warnings = [];
    const suppressions = new Set();

    const basisA = normalizeBasis(a.basis);
    const basisB = normalizeBasis(b.basis);

    if (basisA !== basisB) {
        return {
            canCompare: false,
            warnings: [{ code: "MISMATCHED_BASIS", message: "Sides are measured on different bases; comparison is not meaningful." }],
            suppressions: ["currency", "currency_absolute", "profitFactor"],
            basis: null,
            accountHash: null,
        };
    }

    const basis = basisA;
    const cfgA = normalizeAccountSettings(a.accountSettings || {});
    const cfgB = normalizeAccountSettings(b.accountSettings || {});
    const hashA = accountConfigHash(cfgA);
    const hashB = accountConfigHash(cfgB);

    if (basis === BASIS.CURRENT_EQUITY) {
        warnings.push({ code: "SEQUENCE_DEPENDENT", message: "Current Equity values are sequence-dependent contribution, not isolated edge." });
        if (hashA !== hashB) {
            // Same mode but only balance differs → % deltas survive; else suppress all currency.
            const onlyBalanceDiffers =
                cfgA.mode === cfgB.mode &&
                cfgA.currency === cfgB.currency &&
                cfgA.riskPct === cfgB.riskPct &&
                cfgA.fixedRiskAmount === cfgB.fixedRiskAmount &&
                cfgA.startingBalance !== cfgB.startingBalance;
            if (onlyBalanceDiffers) {
                suppressions.add("currency_absolute");
                warnings.push({ code: "BALANCE_DIFFERS", message: "Starting balances differ — absolute currency deltas suppressed; percentage deltas shown." });
            } else {
                suppressions.add("currency");
                warnings.push({ code: "CONFIG_DIFFERS", message: "Account configs differ — currency deltas suppressed; R and count deltas shown." });
            }
        }
    }

    if (!pfDefined(a.summary) || !pfDefined(b.summary)) {
        suppressions.add("profitFactor");
        warnings.push({ code: "PF_UNDEFINED", message: "A side's profit factor is undefined (∞ or no losses); Δ PF is suppressed." });
    }

    return {
        canCompare: true,
        warnings,
        suppressions: [...suppressions],
        basis,
        accountHash: hashA === hashB ? hashA : null,
    };
}

/** React hook wrapper (memoized on the two sides). */
export function useCompareGuard(a, b) {
    return useMemo(() => evaluateCompare(a || {}, b || {}), [a, b]);
}

export default useCompareGuard;
