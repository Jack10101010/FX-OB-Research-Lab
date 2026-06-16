/**
 * useLazyRows — LARGE-RUN-IMPORT Phase 2 React hooks that trigger on-demand row
 * loading for lazy/large cube runs and expose {loading, error} so consumers can
 * render a loading/error state instead of "unavailable".
 *
 * Why hooks (not side effects in the resolver): the trade-universe resolver is a
 * pure memo and must stay side-effect free. These hooks own the fetch lifecycle;
 * when rows land in the store the resulting notify() re-renders consumers, which
 * then resolve the now-present rows. Both hooks are no-ops for small/eager runs
 * (guarded on runData.lazy) and for already-loaded selections.
 */
import { useEffect, useState } from "react";
import { ensureVariantTrades, ensureBaselineTrades, ensureBeScenarioTrades, findBeFileForRun } from "./store";

const IDLE = { loading: false, error: null };
const BASE_FILE_RE = /^trades_(single_position|allow_multi_position|one_per_direction)\.csv$/i;

/**
 * Ensure the selected variant's rows are loaded for a lazy run — covers BOTH the
 * baseline base file (trades_<mode>.csv) and entry-variant files
 * (trades_<mode>__entry_*.csv). No-op for small/eager runs and once rows resolve.
 * @param runId    the run id
 * @param universe the resolved trade universe (carries universeType/trades/sourceFile)
 * @param runData  the run record (carries the `lazy` flag)
 */
export function useLazyEntryVariant(runId, universe, runData) {
    const [status, setStatus] = useState(IDLE);
    const lazy = Boolean(runData?.lazy);
    const file = universe?.sourceFile || "";
    const empty = (universe?.trades?.length ?? 0) === 0;
    const isEntry = /__entry_/i.test(file);
    const isBase = BASE_FILE_RE.test(file);
    // Baseline (base file) OR an entry-variant file with no resident rows.
    const need = lazy && empty && file && (isEntry || isBase);

    useEffect(() => {
        if (!need) { setStatus(IDLE); return undefined; }
        let cancelled = false;
        setStatus({ loading: true, error: null });
        const loader = isEntry ? ensureVariantTrades(runId, file) : ensureBaselineTrades(runId, file);
        loader
            .then(() => { if (!cancelled) setStatus(IDLE); })
            .catch((e) => { if (!cancelled) setStatus({ loading: false, error: String(e?.message || e) }); });
        return () => { cancelled = true; };
    }, [runId, file, need, isEntry]);

    return status;
}

/**
 * Ensure ONE selected BE scenario's rows are loaded for a lazy run.
 * @param runId     the run id
 * @param runData   the run record (carries `lazy` + `beScenarioIndex`)
 * @param selection { executionMode, entryVariantKey, triggerBasis, armLevelR }
 */
export function useLazyBeScenario(runId, runData, selection) {
    const [status, setStatus] = useState(IDLE);
    const lazy = Boolean(runData?.lazy);
    const file = lazy ? findBeFileForRun(runData, selection || {}) : null;
    const { executionMode, entryVariantKey, triggerBasis, armLevelR } = selection || {};

    useEffect(() => {
        if (!lazy || !file) { setStatus(IDLE); return undefined; }
        let cancelled = false;
        setStatus({ loading: true, error: null });
        ensureBeScenarioTrades(runId, file)
            .then(() => { if (!cancelled) setStatus(IDLE); })
            .catch((e) => { if (!cancelled) setStatus({ loading: false, error: String(e?.message || e) }); });
        return () => { cancelled = true; };
        // Re-run when the SELECTION changes (file encodes mode/variant/trigger/arm).
    }, [runId, lazy, file, executionMode, entryVariantKey, triggerBasis, armLevelR]);

    return status;
}
