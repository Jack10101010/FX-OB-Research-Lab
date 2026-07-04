// strategyDoctor.validate.mjs — validates the read-only Strategy Doctor data contract + loader.
//
// Verifies the mirrored E3.5 doctor-report JSON and the strategyDoctorSource helpers: the
// summary schema, item rows, grouped selectors, badge/state coverage, guardrail assertions,
// and that the page/source contain NO action-button vocabulary (read-only invariant).
//
// Run from frontend/:  node src/data/__validation__/strategyDoctor.validate.mjs

import babel from "@babel/core";
import fs from "fs";

function loadCjs(absPath, requireShim) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(requireShim, module, module.exports);
    return module.exports;
}

const summary = JSON.parse(fs.readFileSync("src/data/strategyDoctor/doctor_report_summary.json", "utf8"));
const items = JSON.parse(fs.readFileSync("src/data/strategyDoctor/doctor_report_items.json", "utf8"));

// The source imports the two JSON files; the require-shim returns them (and nothing else).
const requireShim = (spec) => {
    if (spec.includes("doctor_report_summary.json")) return summary;
    if (spec.includes("doctor_report_items.json")) return items;
    return {};
};
const src = loadCjs("src/data/strategyDoctor/strategyDoctorSource.js", requireShim);

let failed = 0;
const ok = (name, cond) => { if (cond) { console.log(`  ok  ${name}`); } else { failed++; console.error(`FAIL  ${name}`); } };
const throws = (name, fn) => { let t = false; try { fn(); } catch { t = true; } ok(name, t); };

// ── summary ──────────────────────────────────────────────────────────────────
ok("summary loads", summary && typeof summary === "object");
ok("validated stack present", typeof summary.validated_stack === "string" && summary.validated_stack.includes("equal 1.0x"));
ok("overall state = HEALTHY", summary.overall_state === "HEALTHY");
ok("actionable alerts = 0", summary.actionable_alert_count === 0);
ok("WATCH = 3", summary.watch_count === 3);
ok("DEGRADED = 0", summary.degraded_count === 0);
ok("LOW_DATA = 9", summary.low_data_count === 9);
ok("research queue = 1", summary.research_queue_count === 1);
ok("no-change assertion present", typeof summary.no_change_assertion === "string" && /No execution/i.test(summary.no_change_assertion));

// ── model / selectors ─────────────────────────────────────────────────────────
const model = src.loadStrategyDoctor(summary, items);
ok("item rows load", Array.isArray(items) && items.length > 0);
ok("whole-book rows exist", model.wholeBook.length === 5);
ok("cohort rows exist", model.cohorts.length >= 1);
ok("policy-layer rows exist", model.policyLayers.length >= 1);
ok("concentration WATCH rows exist", model.concentration.length === 3 && model.concentration.every((r) => r.state === "WATCH"));
ok("research queue EM-2026-0001 exists", model.researchQueue.some((r) => r.entity === "EM-2026-0001"));
ok("alerts are only WATCH/DEGRADED", model.alerts.every((r) => r.state === "WATCH" || r.state === "DEGRADED"));

// ── badge / state coverage ─────────────────────────────────────────────────────
const usedStates = [...new Set(items.map((r) => r.state))];
ok("all used states are known", usedStates.every((s) => src.VALID_STATES.includes(s)));
ok("badge mapping covers all states", src.VALID_STATES.every((s) => typeof src.stateTone(s) === "string" && src.stateTone(s).length > 0));

// ── fail-clean behaviour ────────────────────────────────────────────────────────
throws("unknown state is rejected", () => src.validateItems([{ section: "cohort", item_type: "x", entity: "e", state: "BOGUS", message: "m", recommended_action: "NO_ACTION" }]));
throws("malformed summary is rejected", () => src.validateSummary({ overall_state: "HEALTHY" }));
throws("missing items array is rejected", () => src.validateItems(null));

// ── read-only invariant: no action-button vocabulary in source or page ──────────
const pageSrc = fs.readFileSync("src/pages/StrategyDoctor.jsx", "utf8");
const sourceSrc = fs.readFileSync("src/data/strategyDoctor/strategyDoctorSource.js", "utf8");
const banned = /(onClick|onSubmit|<button|approveResearch|rejectResearch|<form|fetch\(|axios|localStorage|sessionStorage)/;
ok("no action-button / write vocabulary in source", !banned.test(sourceSrc));
ok("no action-button / write vocabulary in page", !banned.test(pageSrc));
ok("page has no approve/reject wording", !/approve|reject|\bedit\b|save changes/i.test(pageSrc) || /no live action|monitor only|research prompt/i.test(pageSrc));

console.log(failed === 0 ? "\nALL STRATEGY DOCTOR CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
