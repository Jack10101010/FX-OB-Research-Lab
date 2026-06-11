/**
 * playbookTemplate — the Run Analysis Playbook decision tree (V2).
 * Pure data, no React, no imports.
 *
 * V2 reframes the checklist into a true research FUNNEL — verify → judge → find
 * the bleed → isolate → form the fix → stress-test → decide — with action-oriented
 * section names and "find the X" step wording (RUN-ANALYSIS-PLAYBOOK-WORKFLOW-AUDIT-1).
 *
 * Section IDs are STABLE across V1→V2 (collapse-state + Current-Stage logic keyed
 * by them survive). Step IDs are reused where the concept is unchanged (saved checks
 * survive); reworded steps keep their id, genuinely new steps get new ids, and a few
 * V1 duplicates were dropped (their stale saved ids are simply ignored on load).
 *
 * `shortcut` (optional): { label, to } where `to` is an in-app route.
 */

export const PLAYBOOK_SECTIONS = [
    {
        id: "context",
        title: "Verify the Setup",
        steps: [
            { id: "context.correct_run", label: "Confirm you're on the right run", shortcut: { label: "Run Workspace", to: "/runs/active" } },
            { id: "context.correct_result_view", label: "Confirm the Model" },
            { id: "context.correct_position_variant", label: "Confirm the Position Mode" },
            { id: "context.correct_date_range", label: "Confirm the date range" },
            { id: "context.enough_trades", label: "Enough trades to trust this?" },
        ],
    },
    {
        id: "performance",
        title: "Judge the Headline",
        steps: [
            { id: "performance.net_r_positive", label: "Is Net R clearly positive?" },
            { id: "performance.win_rate_healthy", label: "Is the win rate healthy?" },
            { id: "performance.profit_factor_ok", label: "Is profit factor acceptable?" },
            { id: "performance.max_dd_survivable", label: "Is max drawdown survivable?" },
            { id: "performance.expectancy_positive", label: "Is expectancy positive per trade?" },
            { id: "performance.enough_decided", label: "Enough decided trades behind it?" },
        ],
        // Non-blocking UI hint (rendered by the drawer, not enforced).
        branchHint: "Weak → Find Where It Bleeds · Strong → Stress-Test It · Mixed → Isolate the Pattern",
    },
    {
        id: "weakness",
        title: "Find Where It Bleeds",
        steps: [
            { id: "weakness.losses_by_session", label: "Find the session/hour causing the most damage", shortcut: { label: "Session Lab", to: "/session-lab" } },
            { id: "weakness.losses_by_structure", label: "Find which structure (BOS / CHoCH) underperforms", shortcut: { label: "Strategy Map", to: "/strategy-map" } },
            { id: "weakness.losses_by_direction", label: "Find the weaker direction (long vs short)" },
            // Protection DIAGNOSIS — before proposing a protection fix in "Form the Fix".
            { id: "weakness.protection_diagnosis", label: "Are losers recoverable or hard-invalidated?", shortcut: { label: "Protection Lab", to: "/protection-lab" } },
            { id: "weakness.fast_stopouts", label: "Gauge fast stop-outs & false losers", shortcut: { label: "Failures Lab", to: "/failures-lab" } },
            { id: "weakness.winner_quality", label: "Are winners leaving R on the table? (MFE / giveback)", shortcut: { label: "Failures Lab", to: "/failures-lab" } },
            { id: "weakness.concentration", label: "Is performance concentrated in a few trades or periods?" },
        ],
    },
    {
        id: "segmentation",
        title: "Isolate the Pattern",
        steps: [
            { id: "segmentation.session", label: "Isolate the strongest & weakest slice", shortcut: { label: "Session Lab", to: "/session-lab" } },
            { id: "segmentation.direction", label: "Cross-cut: direction × structure × model", shortcut: { label: "Strategy Map", to: "/strategy-map" } },
            { id: "segmentation.entry_model", label: "Compare entry models", shortcut: { label: "Entries Lab", to: "/entries-lab" } },
            { id: "segmentation.result_view", label: "Test Model / fill-mode sensitivity" },
            { id: "segmentation.ob_quality", label: "Use OB quality / lifecycle as a filter input", shortcut: { label: "Order Block Lab", to: "/order-block-lab" } },
            { id: "segmentation.segment_sample", label: "Enough trades in each slice to trust it?" },
        ],
    },
    {
        id: "improvement",
        title: "Form the Fix",
        steps: [
            { id: "improvement.filter_idea", label: "Define a filter to remove the bad trades", shortcut: { label: "Hypothesis Lab", to: "/hypothesis-lab" } },
            { id: "improvement.protection_idea", label: "Define a protection rule (arm level / BE)", shortcut: { label: "Protection Lab", to: "/protection-lab" } },
            { id: "improvement.entry_idea", label: "Define an entry / timing improvement" },
            { id: "improvement.exclude_segment", label: "Decide what to exclude (session / direction / model)" },
            { id: "improvement.needs_new_backtest", label: "Note what needs a new backtest" },
        ],
    },
    {
        id: "robustness",
        title: "Stress-Test It",
        steps: [
            { id: "robustness.holds_date_ranges", label: "Survives other date ranges / out-of-sample?" },
            { id: "robustness.holds_across_runs", label: "Holds across runs?", shortcut: { label: "Comparison Lab", to: "/comparison" } },
            { id: "robustness.holds_walk_forward", label: "Survives walk-forward (weakest fold)?", shortcut: { label: "Walk-Forward", to: "/walk-forward" } },
            { id: "robustness.monte_carlo_ruin", label: "Monte Carlo ruin risk acceptable?", shortcut: { label: "Monte Carlo", to: "/monte-carlo" } },
            { id: "robustness.regime_dependent", label: "Is it regime-dependent?" },
            { id: "robustness.sample_size", label: "Overall sample big enough to trust?" },
        ],
    },
    {
        id: "decision",
        title: "Decide & Log",
        // No checkable steps — single-select outcome only; excluded from progress.
        steps: [],
        isDecision: true,
    },
];

// §7 single-select outcomes (the decision section). Stable ids.
export const PLAYBOOK_DECISIONS = [
    { id: "promote", label: "Promote candidate" },
    { id: "needs_validation", label: "Needs more validation" },
    { id: "filter_hypothesis", label: "Create filter hypothesis" },
    { id: "protection_hypothesis", label: "Create protection hypothesis" },
    { id: "retest_config", label: "Retest with modified config" },
    { id: "reject_archive", label: "Reject / archive" },
];

// Flat list of every checkable step id (decision section contributes none).
// Used for progress math and for guarding writes to known steps.
export function allStepIds(sections = PLAYBOOK_SECTIONS) {
    const ids = [];
    for (const section of sections) {
        for (const step of section.steps || []) {
            if (step && step.id) ids.push(step.id);
        }
    }
    return ids;
}

// Membership helpers for defensive guards.
const STEP_ID_SET = new Set(allStepIds());
const DECISION_ID_SET = new Set(PLAYBOOK_DECISIONS.map((d) => d.id));
export function isKnownStepId(stepId) { return STEP_ID_SET.has(stepId); }
export function isKnownDecisionId(id) { return DECISION_ID_SET.has(id); }
