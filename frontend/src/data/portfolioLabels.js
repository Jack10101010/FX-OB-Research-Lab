// portfolioLabels.js — Portfolio Manager UI presentation layer (single source of truth).
//
// PURE, dependency-light. Maps the CANONICAL policy enum values
// (LABEL / STATE_ONLY / DIRECTION_AWARE / DISABLE) — which stay unchanged in the
// schema, persisted data, and backend — onto user-facing FRIENDLY labels, tooltips,
// plain-English market-state rules, the PM lifecycle, the frozen research
// recommendation, and a defensible cohort ranking. NOTHING here re-implements policy
// logic or renames a canonical value; it is display metadata + read-only derivations
// over the normalized cohort rows produced by portfolioPolicy.js.
//
// Consumers (PortfolioManager page + any card) import from HERE so there is ONE
// mapping rather than duplicated dictionaries scattered across components.

// ── Canonical → friendly label (display only; canonical value is authoritative) ──
export const POLICY_LABELS = {
    LABEL: "ALWAYS ALLOW",
    STATE_ONLY: "BLOCK CHOP",
    DIRECTION_AWARE: "FOLLOW TREND",
    DISABLE: "NEVER TRADE",
};

export const POLICY_TOOLTIPS = {
    LABEL: "Allow this cohort in every market state.",
    STATE_ONLY: "Allow this cohort in trending states. Block it in Bull/Chop and Bear/Chop.",
    DIRECTION_AWARE:
        "Follow the market direction in trending states. Allow Longs in Bull states and Shorts in " +
        "Bear states. Both directions remain allowed in Chop.",
    DISABLE: "Block this cohort in every market state.",
};

// One-line behaviour summary (compact secondary text under the friendly label).
export const POLICY_SHORT = {
    LABEL: "Allow in every state",
    STATE_ONLY: "Block chop, allow trends",
    DIRECTION_AWARE: "Trade with the trend; both ways in chop",
    DISABLE: "Blocked in every state",
};

// Design-token tone per policy (theme-aware; used for chips/highlights).
export const POLICY_TONE = {
    LABEL: "text-2",
    STATE_ONLY: "accent-secondary",
    DIRECTION_AWARE: "accent-primary",
    DISABLE: "danger",
};

// Plain-English per-state rule rows for the cohort breakdown (Phase 7). Each entry is
// an ordered list of { when, action } lines describing exactly what the class does.
export const POLICY_STATE_RULES = {
    LABEL: [{ when: "All market states", action: "allow" }],
    STATE_ONLY: [
        { when: "Bull trend (Expand / Compress)", action: "allow" },
        { when: "Bear trend (Expand / Compress)", action: "allow" },
        { when: "Bull/Chop", action: "block" },
        { when: "Bear/Chop", action: "block" },
    ],
    DIRECTION_AWARE: [
        { when: "Bull trend + Long", action: "allow" },
        { when: "Bull trend + Short", action: "block" },
        { when: "Bear trend + Short", action: "allow" },
        { when: "Bear trend + Long", action: "block" },
        { when: "Chop (Bull/Chop or Bear/Chop)", action: "allow both directions" },
    ],
    DISABLE: [{ when: "All market states", action: "block" }],
};

export function policyFriendly(code) {
    return POLICY_LABELS[code] || code;
}
export function policyTooltip(code) {
    return POLICY_TOOLTIPS[code] || "";
}

// ── Effective Net R under the cohort's DEPLOYED action (read-only derivation) ────
// LABEL → the always-allow book; STATE_ONLY → the chop-gated book; DIRECTION_AWARE →
// the direction-gated book; DISABLE → 0 (cohort contributes nothing when blocked).
// This is the same "kept" figure the Lux replay validator reports as net_kept.
export function effectiveNetR(cohort) {
    switch (cohort.policy) {
        case "STATE_ONLY": return cohort.netRState;
        case "DIRECTION_AWARE": return cohort.netRDirection;
        case "DISABLE": return 0;
        default: return cohort.netRLabel; // LABEL / unknown → always-allow book
    }
}

// "Before PM" = the always-allow (label) book; "after PM" = effective under the action.
export function beforePMNetR(cohort) {
    return cohort.netRLabel;
}

// ── Defensible, sample-aware cohort ranking (Phase 6) ────────────────────────────
// Rules (deliberately conservative — never crown a tiny-sample row):
//   • Insufficient evidence  → "neutral"  (sampleSize < MIN_SAMPLE, or null).
//   • DISABLE cohorts        → "neutral"  (no active book; a deliberate block is not a
//                                          performer to rank).
//   • Among the remaining actively-traded, adequately-sampled cohorts, rank by
//     effective Net R: "strong" when it is clearly positive AND in the top third;
//     "weak" when it is clearly negative AND in the bottom third; else "neutral".
export const MIN_SAMPLE = 40;

export function rankCohorts(cohorts) {
    const eligible = cohorts.filter(
        (c) => c.policy !== "DISABLE" && typeof c.sampleSize === "number" && c.sampleSize >= MIN_SAMPLE
               && typeof effectiveNetR(c) === "number"
    );
    const sorted = [...eligible].sort((a, b) => effectiveNetR(a) - effectiveNetR(b));
    const n = sorted.length;
    const tier = new Map();
    if (n === 0) {
        for (const c of cohorts) tier.set(c.cohortKey, "neutral");
        return tier;
    }
    const lowCut = sorted[Math.floor((n - 1) * 0.30)];
    const highCut = sorted[Math.ceil((n - 1) * 0.70)];
    const lowThr = effectiveNetR(lowCut);
    const highThr = effectiveNetR(highCut);
    for (const c of cohorts) {
        let t = "neutral";
        if (eligible.includes(c)) {
            const r = effectiveNetR(c);
            if (r > 0 && r >= highThr) t = "strong";
            else if (r < 0 && r <= lowThr) t = "weak";
        }
        tier.set(c.cohortKey, t);
    }
    return tier;
}

export const RANK_TONE = { strong: "success", weak: "danger", neutral: "text-3" };
export const RANK_LABEL = {
    strong: "Strongest performers",
    weak: "Weakest performers",
    neutral: "Insufficient evidence / neutral",
};

// ── PM lifecycle strip — the ARCHITECTURAL ROLE of the PM (where it enters the ────
// strategy and what happens to a trade as it passes through it). `owner` tags each
// step to its layer so the strip can visually separate BASE STRATEGY → TRIGGERED
// ENTRY → PORTFOLIO MANAGER → (optional) MARKET STATE → KEEP/BLOCK → EXECUTION.
export const PM_LIFECYCLE_INTRO =
    "The Portfolio Manager does not find trades and does not predict the market. The base strategy finds " +
    "opportunities; Triggered Entry controls when they become eligible; the Portfolio Manager decides which " +
    "eligible trade populations are allowed into the final portfolio.";

export const PM_LIFECYCLE = [
    { n: 1, owner: "base", title: "Base strategy finds a setup", body: "An order block forms with its structure and session context." },
    { n: 2, owner: "te", title: "Triggered Entry controls eligibility", body: "Price penetrates the order block by the set threshold and the arm delay completes." },
    { n: 3, owner: "pm", title: "Portfolio Manager intercepts the trade", body: "Before the candidate can enter the portfolio, the PM evaluates whether this type of trade should participate." },
    { n: 4, owner: "pm", title: "Cohort + stored policy", body: "The trade belongs to a predefined Instrument × Session × Structure × Direction cohort. The PM retrieves that cohort’s stored action." },
    { n: 5, owner: "state", title: "Market State — only if needed", body: "ALWAYS ALLOW and NEVER TRADE need no state check. BLOCK CHOP and FOLLOW TREND consult the current Market State." },
    { n: 6, owner: "decision", title: "Portfolio decision", body: "The PM keeps the candidate, or removes it from the portfolio." },
    { n: 7, owner: "exec", title: "Normal execution continues", body: "Allowed trades return to the existing execution lifecycle. Blocked trades never enter." },
];

// Layer label + design-token tone per lifecycle owner (theme-aware).
export const LIFECYCLE_OWNERS = {
    base: { label: "Base strategy", tone: "text-3" },
    te: { label: "Triggered Entry", tone: "accent-secondary" },
    pm: { label: "Portfolio Manager", tone: "accent-primary" },
    state: { label: "Market State input", tone: "warning" },
    decision: { label: "Keep / block", tone: "accent-primary" },
    exec: { label: "Execution", tone: "text-3" },
};

export const PM_TIMING_NOTE =
    "Current backtest PM decisions use the entry-touch snapshot. Live resting-limit timing is a separate " +
    "implementation decision and is not changed here.";

export const PM_STATIC_NOTE =
    "These are predefined policy actions. The Portfolio Manager does not invent a class at runtime — each " +
    "cohort already has a stored action, and market state is only consulted when that action requires it.";

// ── Frozen research recommendation (Phase 5) ─────────────────────────────────────
// The single approved change from deployed PM v1 → PM v1.1.
export const PM_V1_1_CHANGE = {
    cohort: "EURUSD · New York · CHoCH · Short",
    from: "DISABLE",
    to: "DIRECTION_AWARE",
    fromLabel: "NEVER TRADE",
    toLabel: "FOLLOW TREND",
};

export const PM_RECOMMENDATION = {
    triggeredEntry: { threshold: "25%", armRegion: "C3–C4", primaryCompare: "C3 vs C4" },
    portfolioManager: { pm: "v1.1", state: "ON" },
    layers: [
        { name: "Global Market-State gate", state: "OFF" },
        { name: "Session-Scenario disable layer", state: "OFF" },
        { name: "Directional-Chop overlay", state: "OFF" },
    ],
    policyChange: PM_V1_1_CHANGE,
    researchStatus: "FROZEN",
    nextUse: "True backtesting and visual validation",
};
