/**
 * usePlaybook — React hook binding the Run Analysis Playbook template + per-run
 * persistence (RUN-ANALYSIS-PLAYBOOK Phase 1). UI-agnostic: the drawer (a later
 * phase) consumes this. Pure store logic lives in playbookStore.js; the template
 * lives in playbookTemplate.js.
 *
 * @param {string|null} runId  the run whose checklist we own (null → safe empty).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    PLAYBOOK_SECTIONS,
    PLAYBOOK_DECISIONS,
    allStepIds,
    isKnownStepId,
} from "./playbookTemplate";
import {
    loadPlaybook,
    savePlaybook,
    subscribePlaybook,
    getRun,
    withStep,
    withSectionCollapsed,
    withDecision,
    withResetRun,
    computeProgress,
} from "./playbookStore";

export function usePlaybook(runId) {
    const [state, setState] = useState(() => loadPlaybook());

    // Refresh from the cache when the durable backend hydrates new data in.
    useEffect(() => subscribePlaybook(() => setState(loadPlaybook())), []);

    // Apply a new whole-state object: update React + persist.
    const apply = useCallback((next) => {
        setState(next);
        savePlaybook(next);
    }, []);

    const run = useMemo(() => getRun(state, runId), [state, runId]);
    const stepIds = useMemo(() => allStepIds(), []);
    const progress = useMemo(() => computeProgress(run, stepIds), [run, stepIds]);

    const setStep = useCallback((stepId, value) => {
        if (!isKnownStepId(stepId)) return; // ignore writes to unknown ids
        apply(withStep(state, runId, stepId, !!value));
    }, [apply, state, runId]);

    const toggleStep = useCallback((stepId) => {
        if (!isKnownStepId(stepId)) return;
        apply(withStep(state, runId, stepId, !run.steps[stepId]));
    }, [apply, state, runId, run]);

    const setSectionCollapsed = useCallback((sectionId, value) => {
        apply(withSectionCollapsed(state, runId, sectionId, !!value));
    }, [apply, state, runId]);

    const setDecision = useCallback((decisionId) => {
        apply(withDecision(state, runId, decisionId));
    }, [apply, state, runId]);

    const resetRun = useCallback(() => {
        apply(withResetRun(state, runId));
    }, [apply, state, runId]);

    const isChecked = useCallback((stepId) => Boolean(run.steps[stepId]), [run]);
    const isCollapsed = useCallback((sectionId) => Boolean(run.sections[sectionId]), [run]);

    return {
        // template
        sections: PLAYBOOK_SECTIONS,
        decisions: PLAYBOOK_DECISIONS,
        // per-run state
        runState: run,
        decision: run.decision,
        progress,            // { done, total }
        // actions
        toggleStep,
        setStep,
        setSectionCollapsed,
        setDecision,
        resetRun,
        // helpers
        isChecked,
        isCollapsed,
    };
}

export default usePlaybook;
