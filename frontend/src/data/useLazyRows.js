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
 * Resolve the entry-variant CSV file name for a canonical key (mirrors the
 * tradeUniverse deriveSourceFile naming: trades_<variant>__<key>.csv, preferring
 * an exact match in the run's exported sourceFiles list).
 */
function entryVariantFileForKey(runData, variant, key) {
    if (!key) return null;
    const er = runData?.entryResults || {};
    const sources = er.sourceFiles || er.source_files || [];
    const matched = sources.find((name) => {
        const lower = String(name).toLowerCase();
        return lower.endsWith(`__${key}.csv`) || lower.endsWith(`${key}.csv`);
    });
    return matched || (variant ? `trades_${variant}__${key}.csv` : `${key}.csv`);
}

/**
 * PHASE 2 — Ensure EACH pinned entry-variant's rows are loaded for a lazy run.
 * Loads one CSV per pinned key that isn't already resident — never the full set.
 * `ensureVariantTrades` is idempotent + in-flight de-duped, so repeated calls are
 * safe; the effect re-runs only when the set of not-yet-resident keys changes
 * (keyed on a stable signature), so it can't loop. No-op for small/eager runs.
 * @param runId       the run id
 * @param runData     the run record (carries `lazy`, entryResults.tradesByMode/sourceFiles)
 * @param variantKeys canonical pinned keys (already filtered to this run's discovered set)
 * @param variant     the active trade variant (e.g. "single_position")
 */
export function useLazyEntryVariants(runId, runData, variantKeys, variant) {
    const lazy = Boolean(runData?.lazy);
    const tbm  = runData?.entryResults?.tradesByMode || {};
    const keys = Array.isArray(variantKeys) ? variantKeys : [];
    // Pinned keys whose rows are NOT resident yet.
    const needKeys = keys.filter((k) => {
        const resident = tbm[`${variant}__${k}`] || tbm[k];
        return k && !(Array.isArray(resident) && resident.length);
    });
    const signature = needKeys.join("|");

    useEffect(() => {
        if (!lazy || !needKeys.length) return undefined;
        let cancelled = false;
        needKeys.forEach((k) => {
            const file = entryVariantFileForKey(runData, variant, k);
            if (!file) return;
            ensureVariantTrades(runId, file).catch(() => { /* surfaced elsewhere */ });
        });
        return () => { cancelled = true; };
        // `signature` captures the meaningful change; runData identity churns on every
        // store notify and must not be a dep (would re-fire every render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runId, variant, lazy, signature]);
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
