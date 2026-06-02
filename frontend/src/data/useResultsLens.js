/**
 * useResultsLens — canonical React hook for the Results Basis axis (Phase RB-2).
 *
 *   Trade Universe  → useTradeUniverse()   ("which trades?")
 *   Results Basis   → useResultsLens()      ("how are they measured?")
 *
 * This hook ONLY exposes the current basis + account config and the setters to
 * change them. It deliberately performs NO analytics computation — calculation
 * belongs in `data/resultsBasis.js`, and no page consumes that yet. Phase RB-2
 * ships the control surface only; analytics pages keep calculating exactly as
 * before until a later phase opts each one in.
 *
 * @param {object|null} [pageOverride]   { basis?, accountSettings? }
 *        Optional per-page override (precedence over the global store value).
 *        Mirrors useTradeUniverse(runId, scenarioOverride). No page passes this
 *        yet; it exists so a future page can run a local experiment without
 *        touching the global Lens.
 *
 * @returns {{
 *   basis: "raw_r"|"current_equity",
 *   accountSettings: object,
 *   setBasis: (basis:string) => void,
 *   setAccountSettings: (patch:object) => void,
 *   isCurrentEquity: boolean,
 *   isRawR: boolean,
 *   basisLabel: string,
 *   basisDescription: string,
 *   isSequenceDependent: boolean,
 *   isOverridden: boolean,
 * }}
 */

import { useCallback } from "react";
import {
    useDataset,
    setResultsBasis as storeSetResultsBasis,
    setAccountSettings as storeSetAccountSettings,
} from "./store";
import {
    BASIS,
    normalizeBasis,
    describeBasis,
    isSequenceDependent as basisIsSequenceDependent,
} from "./resultsBasis";

export function useResultsLens(pageOverride = null) {
    // Subscribes to the store so the hook re-renders when basis / account
    // settings change (or any other notify fires).
    const { RESULTS_BASIS, ACCOUNT_SETTINGS } = useDataset();

    const globalBasis = normalizeBasis(RESULTS_BASIS);
    const basis = pageOverride && pageOverride.basis
        ? normalizeBasis(pageOverride.basis)
        : globalBasis;
    const accountSettings = (pageOverride && pageOverride.accountSettings)
        || ACCOUNT_SETTINGS;

    const setBasis = useCallback((next) => storeSetResultsBasis(next), []);
    const setAccountSettings = useCallback((patch) => storeSetAccountSettings(patch), []);

    return {
        basis,
        accountSettings,
        setBasis,
        setAccountSettings,
        isCurrentEquity: basis === BASIS.CURRENT_EQUITY,
        isRawR: basis === BASIS.RAW_R,
        basisLabel: basis === BASIS.CURRENT_EQUITY ? "Current Equity" : "Raw R",
        basisDescription: describeBasis(basis, accountSettings),
        isSequenceDependent: basisIsSequenceDependent(basis),
        isOverridden: Boolean(pageOverride && pageOverride.basis),
    };
}

export default useResultsLens;
