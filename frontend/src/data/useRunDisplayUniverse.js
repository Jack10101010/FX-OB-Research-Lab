// useRunDisplayUniverse.js — shared active-run trade-universe hook (Research Lab /
// Cockpit bridge). One hook so both surfaces resolve the SAME visible universe as
// Run Detail (entryResults.tradesByMode included) and trigger lazy hydration on
// demand — no divergence, no duplicated RunDetail logic. See RUN-DATA-PATH-AUDIT-1.md.
//
// Returns the resolved (un-filtered) trade array + provenance + hydration state.
// Callers still apply their own gate (e.g. buildResearchUniverse → isPerformanceTrade).

import { useEffect, useMemo, useRef, useState } from "react";
import { useDataset, getRunDisplayName, ensureRunTradeUniverse } from "@/data/store";
import { resolveRunDisplayUniverse } from "@/data/resolveDisplayTrades";

export function useRunDisplayUniverse() {
    const { ACTIVE_RUN, ACTIVE_TRADE_VARIANT, getRunData } = useDataset();
    const runId = ACTIVE_RUN?.id || null;
    const runData = useMemo(() => (runId && getRunData ? getRunData(runId) : null), [runId, getRunData]);

    const resolved = useMemo(
        () => resolveRunDisplayUniverse(runData, ACTIVE_TRADE_VARIANT),
        [runData, ACTIVE_TRADE_VARIANT],
    );

    const [hydration, setHydration] = useState({ loading: false, error: null });
    const attempted = useRef(new Set());

    useEffect(() => {
        if (!runId || !resolved.needsHydration) return;
        if (attempted.current.has(runId)) return;     // once per run id (ensure* is idempotent anyway)
        attempted.current.add(runId);
        let cancelled = false;
        setHydration({ loading: true, error: null });
        ensureRunTradeUniverse(runId)
            .then((res) => { if (!cancelled) setHydration({ loading: false, error: res.hydrated ? null : (res.error || res.reason || "could_not_load") }); })
            .catch((e) => { if (!cancelled) setHydration({ loading: false, error: String(e?.message || e) }); });
        return () => { cancelled = true; };
    }, [runId, resolved.needsHydration]);

    return {
        runId,
        runData,
        runName: runId ? getRunDisplayName(runData, runId) : "—",
        trades: resolved.trades,
        source: resolved.source,
        variantKey: resolved.variantKey,
        needsHydration: resolved.needsHydration,
        loading: hydration.loading,
        error: hydration.error,
    };
}

export default useRunDisplayUniverse;
