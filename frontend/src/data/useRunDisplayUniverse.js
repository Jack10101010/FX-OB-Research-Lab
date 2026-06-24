// useRunDisplayUniverse.js — shared active-run trade-universe hook (Research Lab /
// Cockpit). Phase 0 of TRADE-UNIVERSE-MATERIALIZATION-AUDIT-1.md: Research Lab and
// Cockpit now resolve trades through the SAME canonical path as Run Workspace /
// Failures Lab — `useRunVariant` → `useTradeUniverse` → `resolveTradeUniverse`
// (scenario-aware, run-scoped). There is no longer a separate trade-selection
// resolver for these surfaces, so they cannot disagree with Run Detail.
//
// Hydration:
//   • lazy entry-variant / base files load on demand via useRunVariant →
//     useLazyEntryVariant (the exact mechanism Run Detail uses) → `lazyStatus`.
//   • a non-lazy index-only run with a sidecar reload identifier is hydrated once
//     via ensureRunTradeUniverse (which itself delegates to getTradeUniverse for the
//     source file + reloadFullRunFromSidecar — it does NOT re-select trades).
//
// Returns the resolved (un-filtered) canonical trade array + provenance + hydration
// state. Callers still apply their own gate (e.g. buildResearchUniverse →
// isPerformanceTrade).

import { useEffect, useMemo, useRef, useState } from "react";
import { useDataset, getRunDisplayName, ensureRunTradeUniverse } from "@/data/store";
import { useRunVariant } from "@/data/useRunVariant";

export function useRunDisplayUniverse() {
    const { ACTIVE_RUN, getRunData } = useDataset();
    const runId = ACTIVE_RUN?.id || null;
    const runData = useMemo(() => (runId && getRunData ? getRunData(runId) : null), [runId, getRunData]);

    // CANONICAL universe — identical to Run Workspace (useRunVariant resolves the
    // run-scoped Result View and triggers lazy entry-variant hydration). `trades` is
    // bound to this universe; no bridge resolver participates in trade selection.
    const { universe, lazyStatus } = useRunVariant(runId);
    const trades = useMemo(() => (Array.isArray(universe?.trades) ? universe.trades : []), [universe]);

    // Provenance for the context banner, derived from the canonical universe. A
    // scenario / protected universe maps to a VARIANT source token; baseline maps to
    // the base token — preserving the banner's existing Baseline-vs-Variant branch.
    const isScenario = universe?.universeType === "scenario" || universe?.universeType === "protected_result";
    const source = isScenario ? "entry_mode_active" : "base_trades";

    // A non-lazy index-only run isn't covered by useLazyEntryVariant (which guards on
    // runData.lazy); hydrate it once from the sidecar. Lazy runs are already handled
    // by useRunVariant above, so we don't double-trigger them here.
    const needsReload = trades.length === 0 && !runData?.lazy && Boolean(runData?.reloadAvailable);
    // For the UI: rows are absent but the run can still be hydrated (either path).
    const needsHydration = trades.length === 0 && Boolean(runData?.lazy || runData?.reloadAvailable);

    const [reload, setReload] = useState({ loading: false, error: null });
    const attempted = useRef(new Set());

    useEffect(() => {
        if (!runId || !needsReload) return;
        if (attempted.current.has(runId)) return;     // once per run id (ensure* is idempotent anyway)
        attempted.current.add(runId);
        let cancelled = false;
        setReload({ loading: true, error: null });
        ensureRunTradeUniverse(runId)
            .then((res) => { if (!cancelled) setReload({ loading: false, error: res.hydrated ? null : (res.error || res.reason || "could_not_load") }); })
            .catch((e) => { if (!cancelled) setReload({ loading: false, error: String(e?.message || e) }); });
        return () => { cancelled = true; };
    }, [runId, needsReload]);

    return {
        runId,
        runData,
        runName: runId ? getRunDisplayName(runData, runId) : "—",
        trades,
        source,
        variantKey: universe?.sourceKey ?? null,
        universeLabel: universe?.label ?? null,
        universeType: universe?.universeType ?? null,
        needsHydration,
        loading: Boolean(lazyStatus?.loading) || reload.loading,
        error: lazyStatus?.error || reload.error || null,
    };
}

export default useRunDisplayUniverse;
