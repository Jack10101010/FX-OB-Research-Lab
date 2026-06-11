/**
 * playbookTemplate — static decision-tree checklist for the Run Analysis Playbook
 * (RUN-ANALYSIS-PLAYBOOK Phase 1). Pure data, no React, no imports.
 *
 * Section + step IDs are STABLE strings: persisted completion state is keyed by
 * these ids, so editing labels/order here never orphans a user's saved progress
 * (unknown saved ids are ignored; new ids default unchecked).
 *
 * `shortcut` (optional) on a step: { label, to } where `to` is an in-app route.
 */

export const PLAYBOOK_SECTIONS = [
    {
        id: "context",
        title: "Confirm Data Context",
        steps: [
            { id: "context.correct_run", label: "Am I looking at the correct run?", shortcut: { label: "Run Workspace", to: "/runs/active" } },
            { id: "context.correct_result_view", label: "Correct Result View?" },
            { id: "context.correct_position_variant", label: "Correct Position Variant?" },
            { id: "context.correct_date_range", label: "Correct date range?" },
            { id: "context.enough_trades", label: "Enough trades to trust this result?" },
        ],
    },
    {
        id: "performance",
        title: "High-Level Performance Check",
        steps: [
            { id: "performance.net_r_positive", label: "Is Net R positive?" },
            { id: "performance.win_rate_healthy", label: "Is win rate healthy?" },
            { id: "performance.profit_factor_ok", label: "Is profit factor acceptable?" },
            { id: "performance.max_dd_survivable", label: "Is max drawdown survivable?" },
            { id: "performance.expectancy_positive", label: "Is expectancy positive?" },
            { id: "performance.enough_decided", label: "Based on enough decided trades?" },
        ],
        // Non-blocking UI hint after this section (rendered by the drawer, not enforced).
        branchHint: "Bad stats → Weakness Discovery · Good → Robustness · Mixed → Segmentation",
    },
    {
        id: "weakness",
        title: "Trade Quality / Weakness Discovery",
        steps: [
            { id: "weakness.losses_by_session", label: "Losses concentrated in a session?", shortcut: { label: "Session Lab", to: "/session-lab" } },
            { id: "weakness.losses_by_structure", label: "Losses concentrated in CHoCH or BOS?", shortcut: { label: "Strategy Map", to: "/strategy-map" } },
            { id: "weakness.losses_by_direction", label: "Losses concentrated by direction?" },
            { id: "weakness.losses_by_fillmode", label: "Losses concentrated by fill mode / Result View?" },
            { id: "weakness.fast_stopouts", label: "Are fast stop-outs common?", shortcut: { label: "Failures Lab", to: "/failures-lab" } },
            { id: "weakness.false_losers", label: "Are false losers present?", shortcut: { label: "Failures Lab", to: "/failures-lab" } },
            { id: "weakness.distance_clues", label: "Distance-to-stop / MFE / MAE clues?", shortcut: { label: "Failures Lab", to: "/failures-lab" } },
        ],
    },
    {
        id: "segmentation",
        title: "Segmentation / Pattern Discovery",
        steps: [
            { id: "segmentation.session", label: "Check session performance", shortcut: { label: "Session Lab", to: "/session-lab" } },
            { id: "segmentation.direction", label: "Check direction performance", shortcut: { label: "Strategy Map", to: "/strategy-map" } },
            { id: "segmentation.structure", label: "Check structure type (BOS / CHoCH)" },
            { id: "segmentation.entry_model", label: "Check entry model", shortcut: { label: "Entries Lab", to: "/entries-lab" } },
            { id: "segmentation.result_view", label: "Check Result View / variant" },
            { id: "segmentation.regime", label: "Check time period / regime (if available)" },
            { id: "segmentation.ob_quality", label: "Check OB quality / lifecycle context", shortcut: { label: "Order Block Lab", to: "/order-block-lab" } },
        ],
    },
    {
        id: "improvement",
        title: "Improvement Hypothesis",
        steps: [
            { id: "improvement.filter_idea", label: "What filter might remove bad trades?", shortcut: { label: "Hypothesis Lab", to: "/hypothesis-lab" } },
            { id: "improvement.protection_idea", label: "What protection rule might reduce damage?", shortcut: { label: "Protection Lab", to: "/protection-lab" } },
            { id: "improvement.entry_idea", label: "What entry rule might improve timing?" },
            { id: "improvement.exclude_segment", label: "What session / direction / model to exclude?" },
            { id: "improvement.needs_new_backtest", label: "What requires a new backtest?" },
        ],
    },
    {
        id: "robustness",
        title: "Robustness / Validation",
        steps: [
            { id: "robustness.holds_date_ranges", label: "Does the edge hold across date ranges?" },
            { id: "robustness.holds_across_runs", label: "Does it hold across runs?", shortcut: { label: "Comparison Lab", to: "/comparison" } },
            { id: "robustness.holds_walk_forward", label: "Does it hold in walk-forward?", shortcut: { label: "Walk-Forward", to: "/walk-forward" } },
            { id: "robustness.monte_carlo_ruin", label: "Does Monte Carlo expose ruin risk?", shortcut: { label: "Monte Carlo", to: "/monte-carlo" } },
            { id: "robustness.regime_dependent", label: "Is performance regime-dependent?" },
            { id: "robustness.sample_size", label: "Is the sample size enough?" },
        ],
    },
    {
        id: "decision",
        title: "Decision Outcome",
        // The decision section has no checkable steps — it is a single-select outcome
        // plus the "Add insight" action (built in the UI phase). Steps stays empty so
        // progress math is unaffected by the decision.
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
