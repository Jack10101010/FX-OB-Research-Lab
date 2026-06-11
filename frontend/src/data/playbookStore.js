/**
 * playbookStore — per-run persistence for the Run Analysis Playbook
 * (RUN-ANALYSIS-PLAYBOOK Phase 1).
 *
 * Pure state transforms (no React) + a thin, defensive localStorage IO layer.
 * State is keyed by runId so every run has its own checklist. Storing only
 * `true` flags keeps the blob small and makes "new template steps default
 * unchecked" + "unknown saved ids ignored" fall out naturally (absent = false;
 * progress is computed only over template step ids passed by the caller).
 *
 * localStorage is accessed through try/catch and a presence check, so this
 * module imports and runs safely under node (validator) where it is absent.
 */

export const PLAYBOOK_LS_KEY = "fxob_playbook_v1";
export const PLAYBOOK_VERSION = 1;

function nowISO() {
    return new Date().toISOString();
}

// Keep only keys whose value is strictly boolean true.
function sanitizeBoolMap(map) {
    const out = {};
    if (map && typeof map === "object") {
        for (const [k, v] of Object.entries(map)) {
            if (k && v === true) out[k] = true;
        }
    }
    return out;
}

export function emptyRunState() {
    return { steps: {}, sections: {}, decision: null, updatedAt: null };
}

export function emptyState() {
    return { version: PLAYBOOK_VERSION, byRun: {} };
}

/**
 * Validate + sanitize a raw (parsed) blob into a safe state. Anything malformed,
 * wrong-version, or non-object collapses to an empty state.
 */
export function normalizeState(raw) {
    if (!raw || typeof raw !== "object" || raw.version !== PLAYBOOK_VERSION
        || !raw.byRun || typeof raw.byRun !== "object") {
        return emptyState();
    }
    const byRun = {};
    for (const [runId, rs] of Object.entries(raw.byRun)) {
        if (!runId || !rs || typeof rs !== "object") continue;
        byRun[runId] = {
            steps: sanitizeBoolMap(rs.steps),
            sections: sanitizeBoolMap(rs.sections),
            decision: typeof rs.decision === "string" ? rs.decision : null,
            updatedAt: typeof rs.updatedAt === "string" ? rs.updatedAt : null,
        };
    }
    return { version: PLAYBOOK_VERSION, byRun };
}

// ── Pure reads ───────────────────────────────────────────────────────────────

export function getRun(state, runId) {
    if (!runId || !state || !state.byRun || !state.byRun[runId]) return emptyRunState();
    return state.byRun[runId];
}

export function isStepChecked(state, runId, stepId) {
    return Boolean(getRun(state, runId).steps[stepId]);
}

export function isSectionCollapsed(state, runId, sectionId) {
    return Boolean(getRun(state, runId).sections[sectionId]);
}

export function getDecision(state, runId) {
    return getRun(state, runId).decision;
}

/**
 * Progress over the supplied template step ids only — unknown/stale stored ids
 * never inflate the count.
 */
export function computeProgress(runState, stepIds) {
    const rs = runState || emptyRunState();
    const ids = Array.isArray(stepIds) ? stepIds : [];
    const total = ids.length;
    let done = 0;
    for (const id of ids) if (rs.steps[id]) done += 1;
    return { done, total };
}

// ── Pure writes (return a new state; no IO) ───────────────────────────────────

function setRun(state, runId, runState) {
    const base = state && state.byRun ? state : emptyState();
    return {
        version: PLAYBOOK_VERSION,
        byRun: { ...base.byRun, [runId]: { ...runState, updatedAt: nowISO() } },
    };
}

export function withStep(state, runId, stepId, value) {
    if (!runId || !stepId) return state || emptyState();
    const run = getRun(state, runId);
    const steps = { ...run.steps };
    if (value) steps[stepId] = true; else delete steps[stepId];
    return setRun(state, runId, { ...run, steps });
}

export function withSectionCollapsed(state, runId, sectionId, value) {
    if (!runId || !sectionId) return state || emptyState();
    const run = getRun(state, runId);
    const sections = { ...run.sections };
    if (value) sections[sectionId] = true; else delete sections[sectionId];
    return setRun(state, runId, { ...run, sections });
}

export function withDecision(state, runId, decisionId) {
    if (!runId) return state || emptyState();
    const run = getRun(state, runId);
    return setRun(state, runId, { ...run, decision: decisionId || null });
}

/** Reset ONLY this run's checklist; other runs are untouched. */
export function withResetRun(state, runId) {
    if (!runId) return state || emptyState();
    return setRun(state, runId, emptyRunState());
}

// ── localStorage IO (defensive; safe under node) ──────────────────────────────

function getLS() {
    try {
        if (typeof localStorage !== "undefined" && localStorage) return localStorage;
    } catch { /* access can throw in some sandboxes */ }
    return null;
}

export function loadPlaybook() {
    const ls = getLS();
    if (!ls) return emptyState();
    try {
        const raw = ls.getItem(PLAYBOOK_LS_KEY);
        if (!raw) return emptyState();
        return normalizeState(JSON.parse(raw));
    } catch {
        return emptyState();
    }
}

export function savePlaybook(state) {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.setItem(PLAYBOOK_LS_KEY, JSON.stringify(normalizeState(state)));
        return true;
    } catch {
        return false;
    }
}
