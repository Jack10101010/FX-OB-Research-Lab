// Fill-state taxonomy validation (FILL-STATE-TAXONOMY-2A + 2B).
//
// Confirms, without a test framework, that:
//   1. deriveFillState() matches the canonical truth table (incl. anomalies).
//   2. buildTradeClassification() exposes fill_state / parent / anomaly and now
//      emits canonical leaf entry_context tags (occupied_at_arm | aae |
//      vacant_no_aae | unknown_at_arm) — never the deprecated "clean".
//   3. classificationRegistry aliases resolve legacy keys:
//      ob_not_occupied → Vacant — No AAE, clean → Occupied At Arm (muted).
//   4. muteAsBadge suppression: occupied_at_arm / unknown_at_arm / clean hide;
//      aae / vacant_no_aae / vacant_at_arm render.
//   5. researchGlossary.getGlossary() resolves the five fill-state keys.
//
// Run from the frontend/ directory (Node ≥ 22 auto-detects ESM in .js sources):
//   node src/data/__validation__/fillState.validate.mjs
//
// Exits non-zero if any assertion fails.

import { buildTradeClassification, deriveFillState } from "../tradeClassificationDims.js";
import { getTagMeta, normalizeContextTag } from "../classificationRegistry.js";
import { getGlossary } from "../researchGlossary.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Mirror of ClassificationBadge's suppression predicate (component is JSX, so we
// test the underlying logic here rather than render it).
const visibleBadges = (tags) => tags.filter((t) => t && !getTagMeta(t).muteAsBadge);

console.log("deriveFillState — truth table");
const cases = [
    ["vacant + armed → AAE",
        { obOccupiedAtArm: false, armedAfterObExit: true },
        { state: "aae", parent: "vacant_at_arm", isAnomaly: false }],
    ["vacant + not-armed → Vacant-No-AAE",
        { obOccupiedAtArm: false, armedAfterObExit: false },
        { state: "vacant_no_aae", parent: "vacant_at_arm", isAnomaly: false }],
    ["vacant + null-armed → Vacant-No-AAE",
        { obOccupiedAtArm: false, armedAfterObExit: null },
        { state: "vacant_no_aae", parent: "vacant_at_arm", isAnomaly: false }],
    ["occupied + not-armed → Occupied",
        { obOccupiedAtArm: true, armedAfterObExit: false },
        { state: "occupied_at_arm", parent: "occupied_at_arm", isAnomaly: false }],
    ["occupied + armed → Occupied (anomaly)",
        { obOccupiedAtArm: true, armedAfterObExit: true },
        { state: "occupied_at_arm", parent: "occupied_at_arm", isAnomaly: true }],
    ["null + null → Unknown",
        { obOccupiedAtArm: null, armedAfterObExit: null },
        { state: "unknown_at_arm", parent: "unknown_at_arm", isAnomaly: false }],
    ["null + armed → Unknown (anomaly)",
        { obOccupiedAtArm: null, armedAfterObExit: true },
        { state: "unknown_at_arm", parent: "unknown_at_arm", isAnomaly: true }],
    ["undefined fields → Unknown",
        {},
        { state: "unknown_at_arm", parent: "unknown_at_arm", isAnomaly: false }],
];
for (const [label, trade, expected] of cases) {
    ok(eq(deriveFillState(trade), expected), label);
}
ok(eq(deriveFillState({ ob_occupied_at_arm: false, armed_after_ob_exit: true }),
      { state: "aae", parent: "vacant_at_arm", isAnomaly: false }),
   "snake_case AAE matches camelCase");

console.log("buildTradeClassification — canonical leaf entry_context + fill_state");
const expectCtx = (label, trade, ctx, fs) => {
    const c = buildTradeClassification(trade);
    ok(eq(c.entry_context, [ctx]), `${label}: entry_context = [${ctx}]`);
    ok(c.fill_state === fs, `${label}: fill_state = ${fs}`);
};
expectCtx("occupied", { outcome: "Win", obOccupiedAtArm: true,  armedAfterObExit: false }, "occupied_at_arm", "occupied_at_arm");
expectCtx("aae",      { outcome: "Win", obOccupiedAtArm: false, armedAfterObExit: true  }, "aae",             "aae");
expectCtx("vacant",   { outcome: "Win", obOccupiedAtArm: false, armedAfterObExit: false }, "vacant_no_aae",   "vacant_no_aae");
expectCtx("unknown",  { outcome: "Win" },                                                  "unknown_at_arm",  "unknown_at_arm");

const aaeCls = buildTradeClassification({ outcome: "Win", obOccupiedAtArm: false, armedAfterObExit: true });
ok(aaeCls.entry_model === "baseline", "existing field entry_model unchanged (baseline)");
ok(aaeCls.exit_type === "tp_hit", "existing field exit_type unchanged (tp_hit)");
ok(aaeCls.key === "baseline|aae|tp_hit|baseline", "key format intact for aae trade");
const nullCls = buildTradeClassification(null);
ok(eq(nullCls.entry_context, ["unknown_at_arm"]), "null-trade fallback entry_context = [unknown_at_arm]");
ok(nullCls.fill_state === "unknown_at_arm", "null-trade fallback fill_state = unknown_at_arm");

console.log("deriveEntryModel — baseline normalization + TE/EP unchanged");
const em = (key) => buildTradeClassification({ entry_model_key: key }).entry_model;
// Baseline normalization (the fix): all baseline spellings → "baseline".
ok(em("baseline") === "baseline", '"baseline" → baseline');
ok(em("entry_baseline") === "baseline", '"entry_baseline" → baseline (was unknown_model)');
ok(em("single_position__entry_baseline") === "baseline", "single_position__entry_baseline → baseline");
ok(em("allow_multi_position__entry_baseline") === "baseline", "allow_multi_position__entry_baseline → baseline");
ok(em("one_per_direction__entry_baseline") === "baseline", "one_per_direction__entry_baseline → baseline");
ok(em("") === "baseline", "empty entry_model_key → baseline");
ok(buildTradeClassification({}).entry_model === "baseline", "missing entry_model_key → baseline");
// TE / EP mapping unchanged.
ok(em("entry_triggered_edge_25p0_same") === "te_same", "te_same unchanged");
ok(em("entry_triggered_edge_25p0_next") === "te_next", "te_next unchanged");
ok(em("entry_triggered_edge_25p0_d2") === "te_d2", "entry_triggered_edge_25p0_d2 → te_d2 (unchanged)");
ok(em("entry_triggered_edge_25p0_d3") === "te_d3", "te_d3 unchanged");
ok(em("single_position__entry_triggered_edge_25p0_d2") === "te_d2", "prefixed te_d2 unchanged");
ok(em("entry_penetration_50p0") === "ep_50", "entry_penetration_50p0 → ep_50 (unchanged)");
// A genuinely unrecognized key must still be unknown_model (fix is not over-broad).
ok(em("some_unrecognized_key") === "unknown_model", "unrecognized key still → unknown_model");

console.log("deriveEntryModel — deep arms (C4–C50) + explicit configured arm");
// Deep arms must bucket into te_d3 (the ≥3 / deep bucket), NOT silently fall to
// te_same as the old substring check did (_d40 does not contain "_d3").
ok(em("entry_triggered_edge_3p0_d40") === "te_d3", "C40 key → te_d3 (was te_same bug)");
ok(em("entry_triggered_edge_1p0_d50") === "te_d3", "C50 key → te_d3");
ok(em("entry_triggered_edge_0p5_d20") === "te_d3", "C20 key → te_d3");
ok(em("single_position__entry_triggered_edge_3p0_d40") === "te_d3", "prefixed C40 key → te_d3");
ok(em("entry_triggered_edge_3p0_d4") === "te_d3", "C4 key → te_d3 (boundary; old check missed _d4)");
// Explicit delay_candles_configured is preferred over the key suffix when present.
const emCfg = (key, cfg) => buildTradeClassification({ entry_model_key: key, delay_candles_configured: cfg }).entry_model;
ok(emCfg("entry_triggered_edge_25p0", 40) === "te_d3", "configured=40 (no suffix) → te_d3");
ok(emCfg("entry_triggered_edge_25p0", 2) === "te_d2", "configured=2 → te_d2");
ok(emCfg("entry_triggered_edge_25p0", 1) === "te_next", "configured=1 → te_next");
ok(emCfg("entry_triggered_edge_25p0", 0) === "te_same", "configured=0 → te_same");
ok(buildTradeClassification({ entry_model_key: "entry_triggered_edge_25p0_same", delayCandlesConfigured: 40 }).entry_model === "te_d3",
   "explicit configured arm overrides suffix (camelCase delayCandlesConfigured)");

console.log("classificationRegistry — alias resolution");
ok(getTagMeta("ob_not_occupied").label === "Vacant — No AAE", 'getTagMeta("ob_not_occupied") → "Vacant — No AAE"');
ok(getTagMeta("clean").label === "Occupied At Arm", 'getTagMeta("clean") → "Occupied At Arm"');
ok(getTagMeta("clean").muteAsBadge === true, 'getTagMeta("clean").muteAsBadge === true');
ok(normalizeContextTag("ob_not_occupied") === "vacant_no_aae", 'normalize ob_not_occupied → vacant_no_aae');
ok(normalizeContextTag("clean") === "occupied_at_arm", 'normalize clean → occupied_at_arm');
ok(normalizeContextTag("aae") === "aae", "normalize passes canonical keys through");
ok(getTagMeta("vacant_no_aae").label === "Vacant — No AAE", 'getTagMeta("vacant_no_aae") label correct');
ok(getTagMeta("does_not_exist").label === "does_not_exist", "unknown tag falls back to raw key");

console.log("muteAsBadge — badge suppression");
ok(getTagMeta("occupied_at_arm").muteAsBadge === true, "occupied_at_arm muteAsBadge=true");
ok(getTagMeta("unknown_at_arm").muteAsBadge === true, "unknown_at_arm muteAsBadge=true");
ok(!getTagMeta("aae").muteAsBadge, "aae renders (not muted)");
ok(!getTagMeta("vacant_no_aae").muteAsBadge, "vacant_no_aae renders (not muted)");
ok(!getTagMeta("vacant_at_arm").muteAsBadge, "vacant_at_arm renders (not muted)");
ok(eq(visibleBadges(["occupied_at_arm"]), []), "occupied_at_arm → no badge");
ok(eq(visibleBadges(["unknown_at_arm"]), []), "unknown_at_arm → no badge");
ok(eq(visibleBadges(["clean"]), []), "legacy clean → no badge");
ok(eq(visibleBadges(["aae"]), ["aae"]), "aae → badge");
ok(eq(visibleBadges(["vacant_no_aae"]), ["vacant_no_aae"]), "vacant_no_aae → badge");

console.log("researchGlossary — fill-state keys resolve");
for (const k of ["occupied_at_arm", "vacant_at_arm", "aae", "vacant_no_aae", "unknown_at_arm"]) {
    const g = getGlossary(k);
    ok(g && g.friendlyName && g.definition && g.whyItMatters, `getGlossary("${k}") complete`);
}
ok(getGlossary("clean") === null, '"clean" is intentionally NOT a glossary key');

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
