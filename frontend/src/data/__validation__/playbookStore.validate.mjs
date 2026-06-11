/**
 * Validation for the Run Analysis Playbook persistence core (RUN-ANALYSIS-PLAYBOOK
 * Phase 1). Exercises the PURE store transforms + the localStorage IO via a tiny
 * in-memory polyfill. No React in the import graph → runs under plain node.
 *
 * Run: node src/data/__validation__/playbookStore.validate.mjs
 */

// ── in-memory localStorage polyfill (must exist before importing the store) ──
let backing = {};
globalThis.localStorage = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
};

const {
    PLAYBOOK_LS_KEY,
    PLAYBOOK_VERSION,
    emptyState,
    emptyRunState,
    normalizeState,
    getRun,
    isStepChecked,
    computeProgress,
    withStep,
    withSectionCollapsed,
    withDecision,
    withResetRun,
    loadPlaybook,
    savePlaybook,
} = await import("../playbookStore.js");

const { allStepIds, isKnownStepId } = await import("../playbookTemplate.js");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass += 1; else { fail += 1; console.error(`  ✗ ${name}`); } }
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)} want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

const RUN_A = "run_A", RUN_B = "run_B";
const STEP1 = "context.correct_run", STEP2 = "performance.net_r_positive";

// ── per-run isolation + toggle persists in-memory ───────────────────────────
let s = emptyState();
s = withStep(s, RUN_A, STEP1, true);
ok("toggle persists (run A step1 checked)", isStepChecked(s, RUN_A, STEP1));
ok("run B unaffected by run A write", !isStepChecked(s, RUN_B, STEP1));
s = withStep(s, RUN_B, STEP2, true);
ok("run A still only has step1", isStepChecked(s, RUN_A, STEP1) && !isStepChecked(s, RUN_A, STEP2));
ok("run B has step2", isStepChecked(s, RUN_B, STEP2));

// ── uncheck removes the flag ─────────────────────────────────────────────────
s = withStep(s, RUN_A, STEP1, false);
ok("uncheck clears the step", !isStepChecked(s, RUN_A, STEP1));

// ── reset one run does not reset another ─────────────────────────────────────
s = withStep(s, RUN_A, STEP1, true);
s = withStep(s, RUN_A, STEP2, true);
s = withResetRun(s, RUN_A);
ok("reset clears run A", !isStepChecked(s, RUN_A, STEP1) && !isStepChecked(s, RUN_A, STEP2));
ok("reset of run A leaves run B intact", isStepChecked(s, RUN_B, STEP2));

// ── decision + section collapse persist per run ──────────────────────────────
s = withDecision(s, RUN_A, "promote");
eq("decision persists", getRun(s, RUN_A).decision, "promote");
eq("decision isolated to run A", getRun(s, RUN_B).decision, null);
s = withSectionCollapsed(s, RUN_A, "weakness", true);
ok("section collapse persists", getRun(s, RUN_A).sections.weakness === true);

// ── progress counts only template step ids; unknown stored ids ignored ───────
const ids = allStepIds();
ok("template has steps", ids.length > 0);
let p = emptyState();
p = withStep(p, RUN_A, ids[0], true);
p = withStep(p, RUN_A, ids[1], true);
p = withStep(p, RUN_A, "totally.unknown.id", true); // stale/unknown id
const prog = computeProgress(getRun(p, RUN_A), ids);
eq("progress counts only known checked steps", prog, { done: 2, total: ids.length });
ok("isKnownStepId rejects unknown", !isKnownStepId("totally.unknown.id") && isKnownStepId(ids[0]));

// ── no active run → safe empty ───────────────────────────────────────────────
eq("getRun(null) → empty run state", getRun(s, null), emptyRunState());
ok("withStep(null run) is a no-op-safe state", getRun(withStep(s, null, STEP1, true), RUN_B).steps[STEP2] === true);

// ── normalizeState: malformed inputs collapse to empty ───────────────────────
eq("normalize(null)", normalizeState(null), emptyState());
eq("normalize(garbage)", normalizeState({ nope: 1 }), emptyState());
eq("normalize wrong version", normalizeState({ version: 99, byRun: { x: {} } }), emptyState());
ok("normalize drops non-boolean step values", (() => {
    const n = normalizeState({ version: PLAYBOOK_VERSION, byRun: { r: { steps: { a: true, b: "yes", c: 0 }, decision: 5 } } });
    return n.byRun.r.steps.a === true && !("b" in n.byRun.r.steps) && !("c" in n.byRun.r.steps) && n.byRun.r.decision === null;
})());

// ── localStorage round-trip + malformed handling ─────────────────────────────
backing = {};
ok("load with empty storage → empty", JSON.stringify(loadPlaybook()) === JSON.stringify(emptyState()));
let live = withStep(emptyState(), RUN_A, STEP1, true);
live = withDecision(live, RUN_A, "needs_validation");
ok("save returns true", savePlaybook(live) === true);
const reloaded = loadPlaybook();
ok("round-trip: step survives", isStepChecked(reloaded, RUN_A, STEP1));
eq("round-trip: decision survives", getRun(reloaded, RUN_A).decision, "needs_validation");
ok("uses the documented LS key", typeof backing[PLAYBOOK_LS_KEY] === "string");
backing[PLAYBOOK_LS_KEY] = "{ not json ";
eq("malformed localStorage → empty (no throw)", loadPlaybook(), emptyState());

console.log(`\nplaybookStore validation: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
