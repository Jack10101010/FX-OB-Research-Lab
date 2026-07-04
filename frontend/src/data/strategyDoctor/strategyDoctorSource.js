// strategyDoctorSource.js — READ-ONLY loader for the Edge Monitor / Strategy Doctor report.
//
// Renders the headless "doctor note" mirrored from the Lux backend research output
// (outputs/research/edge_monitor_phase_e/e3_5_strategy_doctor_report/{doctor_report_summary.json,
// doctor_report_items.json} → src/data/strategyDoctor/). No editing, no execution, no policy
// mutation, no research trigger — a window onto the current Edge Monitor diagnosis.
//
// To refresh the data: copy the two Lux JSON files over the mirror in this folder.

import summaryData from "./doctor_report_summary.json";
import itemsData from "./doctor_report_items.json";

// Canonical health states the monitor can emit (E1/E2 calibration).
export const VALID_STATES = [
    "HEALTHY", "WATCH", "DEGRADED", "LOW_DATA", "STALE", "RECOVERING",
    "NO_ACTION", "MONITOR_ONLY", "STRUCTURAL_BREAK",
];

// State → theme tone token (dark-theme HSL vars only; no hard-coded colours).
const STATE_TONE = {
    HEALTHY: "success",
    WATCH: "warning",
    DEGRADED: "danger",
    LOW_DATA: "border-mid",
    STALE: "border-mid",
    RECOVERING: "accent-secondary",
    NO_ACTION: "border-mid",
    MONITOR_ONLY: "warning",
    STRUCTURAL_BREAK: "danger",
};

export function stateTone(state) {
    return STATE_TONE[state] || "border-mid";
}

const REQUIRED_SUMMARY_FIELDS = [
    "generated_at", "as_of_date", "policy_version", "policy_sha256", "validated_stack",
    "overall_state", "actionable_alert_count", "watch_count", "degraded_count",
    "low_data_count", "research_queue_count", "recommended_next_action", "no_change_assertion",
];
const REQUIRED_ITEM_FIELDS = ["section", "item_type", "entity", "state", "message", "recommended_action"];

export function validateSummary(summary) {
    if (!summary || typeof summary !== "object") {
        throw new Error("StrategyDoctor: summary is missing or not an object.");
    }
    for (const k of REQUIRED_SUMMARY_FIELDS) {
        if (!(k in summary)) throw new Error(`StrategyDoctor: summary missing required field "${k}".`);
    }
    if (!VALID_STATES.includes(summary.overall_state)) {
        throw new Error(`StrategyDoctor: unknown overall_state "${summary.overall_state}".`);
    }
    for (const c of ["actionable_alert_count", "watch_count", "degraded_count", "low_data_count", "research_queue_count"]) {
        if (typeof summary[c] !== "number") throw new Error(`StrategyDoctor: summary.${c} must be a number.`);
    }
    if (typeof summary.validated_stack !== "string" || summary.validated_stack.length === 0) {
        throw new Error("StrategyDoctor: summary.validated_stack must be a non-empty string.");
    }
    return summary;
}

export function validateItems(items) {
    if (!Array.isArray(items)) throw new Error("StrategyDoctor: items must be an array.");
    items.forEach((row, i) => {
        if (!row || typeof row !== "object") throw new Error(`StrategyDoctor: item ${i} is not an object.`);
        for (const k of REQUIRED_ITEM_FIELDS) {
            if (!(k in row)) throw new Error(`StrategyDoctor: item ${i} missing required field "${k}".`);
        }
        if (!VALID_STATES.includes(row.state)) {
            throw new Error(`StrategyDoctor: item ${i} has unknown state "${row.state}".`);
        }
    });
    return items;
}

const bySection = (items, section) => items.filter((r) => r.section === section);

// Build the read-only view model. Pure: pass data in (for tests) or use the mirror (for the app).
export function loadStrategyDoctor(summary = summaryData, items = itemsData) {
    validateSummary(summary);
    validateItems(items);
    return {
        summary,
        overall: { state: summary.overall_state, tone: stateTone(summary.overall_state) },
        counts: {
            actionable: summary.actionable_alert_count,
            watch: summary.watch_count,
            degraded: summary.degraded_count,
            lowData: summary.low_data_count,
            researchQueue: summary.research_queue_count,
        },
        wholeBook: bySection(items, "whole_book"),
        cohorts: bySection(items, "cohort"),
        policyLayers: bySection(items, "policy_layer"),
        concentration: bySection(items, "concentration"),
        // "Alerts" = current non-healthy monitoring signals (WATCH/DEGRADED) across levels.
        alerts: items.filter((r) => r.section !== "research_queue" && (r.state === "WATCH" || r.state === "DEGRADED")),
        researchQueue: bySection(items, "research_queue"),
        validatedStack: summary.validated_stack,
        noChangeAssertion: summary.no_change_assertion,
        recommendedNextAction: summary.recommended_next_action,
        asOf: summary.as_of_date,
        policyVersion: summary.policy_version,
    };
}

// Eager model for the page (throws at import time if the mirror is malformed — fail cleanly).
export const strategyDoctorModel = loadStrategyDoctor();
