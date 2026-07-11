// statePolicyDrafts.validate.mjs — Draft research layer (corrected architecture).
//
// Proves:
//   [1] STRATEGY SIGNATURE scoping: drafts belong to one research universe and can
//       NEVER leak into another signature's listings, counts, or apply action
//   [2] lifecycle: Inspect → Candidate → Confirmed → Added to Run → Native Validated
//       → Approved → Deployed (+ Rejected from anywhere; Rejected → Inspect re-open);
//       illegal jumps are refused by the store
//   [3] apply is signature-scoped and advances Confirmed → "Added to Run" (honest:
//       copied into execution configuration, NOT validated)
//   [4] v1 → v2 migration semantics: legacy "Applied" maps to "Added to Run"; keys
//       gain the TE25-C3 signature; scoped drafts win dedupe (logic-level checks —
//       node has no localStorage, so the migration path itself is exercised as a
//       no-op fallback without throwing)
//   [5] invented state labels / missing signature are refused
//   [6] research metadata NEVER affects execution: only the explicit apply bridges,
//       and Session Results never calls it (source contract)
//   [7] UI wiring: signature shown in the editor; matrix drafts looked up by
//       signature; evidence summary keeps native/rescore/draft visually distinct
//
// Run from frontend/:  node src/data/__validation__/statePolicyDrafts.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const src = fs.readFileSync(resolved, "utf8");
    const { code } = babel.transformSync(src, {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => {
        if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec));
        if (spec.startsWith("@/")) return loadCjs(path.resolve("src", spec.slice(2)));
        throw new Error("bare import: " + spec);
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const D = loadCjs("src/data/statePolicyDrafts.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const SIG_A = D.buildStrategySignature({ instrument: "EURUSD", detectionTf: "15min", family: "triggered_edge", threshold: 25, delay: "d3", variant: "allow_multi_position" });
const SIG_B = D.buildStrategySignature({ instrument: "EURUSD", detectionTf: "15min", family: "penetration", threshold: 25, delay: null, variant: "allow_multi_position" });

console.log("\n[1] signature scoping — no cross-universe leaks");
ok(SIG_A === "EURUSD|15min|triggered_edge|25|d3|allow_multi_position", `canonical signature (${SIG_A})`);
ok(SIG_A !== SIG_B, "different entry family ⇒ different universe");
ok(D.buildStrategySignature({}) === "?|?|?|?|?|?", "unknown parts render as ? (stable, never silently merged)");
D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { target: 3.97, status: "Inspect", evidence: "native", notes: "native +16.83R" });
D.saveDraft(SIG_B, "newYork|bos_short", "Bull/Expand", { target: 1.0, status: "Inspect" });
ok(D.getDraft(SIG_A, "newYork|bos_short", "Bull/Expand").target === 4.0, "target snaps to ladder (3.97 → 4.0)");
ok(D.getDraft(SIG_B, "newYork|bos_short", "Bull/Expand").target === 1.0, "same cohort/state in ANOTHER universe is a separate draft");
ok(Object.keys(D.listDrafts(SIG_A)).length === 1 && Object.keys(D.listDrafts(SIG_B)).length === 1, "listDrafts is signature-scoped");
ok(D.draftCounts(SIG_A).Inspect === 1 && !D.draftCounts(SIG_A)["Added to Run"], "counts are signature-scoped");

console.log("\n[2] lifecycle transitions");
ok(D.DRAFT_STATUSES.join(" → ") === "Inspect → Candidate → Confirmed → Added to Run → Native Validated → Approved → Deployed", "canonical 7-stage chain");
ok(D.canTransition("Inspect", "Candidate") && D.canTransition("Candidate", "Confirmed")
   && D.canTransition("Confirmed", "Added to Run") && D.canTransition("Added to Run", "Native Validated")
   && D.canTransition("Native Validated", "Approved") && D.canTransition("Approved", "Deployed"), "forward one-step transitions allowed");
ok(!D.canTransition("Inspect", "Deployed") && !D.canTransition("Candidate", "Added to Run") && !D.canTransition("Confirmed", "Approved"),
   "jumps are refused (a draft cannot skip validation stages)");
ok(D.canTransition("Confirmed", "Candidate") && D.canTransition("Native Validated", "Added to Run"), "one-step back-correction allowed");
ok(D.canTransition("Candidate", "Rejected") && D.canTransition("Deployed", "Rejected") && D.canTransition("Rejected", "Inspect") && !D.canTransition("Rejected", "Deployed"),
   "Rejected reachable from anywhere; re-opens only to Inspect");
const before = D.getDraft(SIG_A, "newYork|bos_short", "Bull/Expand");
const refused = D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { status: "Deployed" });
ok(refused._rejectedTransition === "Deployed" && D.getDraft(SIG_A, "newYork|bos_short", "Bull/Expand").status === before.status,
   "store refuses an illegal jump (Inspect → Deployed) and leaves the draft unchanged");
D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { status: "Candidate" });
D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { status: "Confirmed" });
ok(D.getDraft(SIG_A, "newYork|bos_short", "Bull/Expand").status === "Confirmed", "legal chain walks forward");

console.log("\n[3] apply — signature-scoped, honest status");
D.saveDraft(SIG_A, "london|choch_long", "Bear/Expand", { block: true, status: "Inspect" });
D.saveDraft(SIG_A, "london|choch_long", "Bear/Expand", { status: "Candidate" });
D.saveDraft(SIG_A, "london|choch_long", "Bear/Expand", { status: "Confirmed" });
D.saveDraft(SIG_B, "london|choch_long", "Bear/Expand", { block: true, status: "Inspect" });
D.saveDraft(SIG_B, "london|choch_long", "Bear/Expand", { status: "Candidate" });
D.saveDraft(SIG_B, "london|choch_long", "Bear/Expand", { status: "Confirmed" });
const { overrides, appliedCount } = D.applyDraftsToOverrides(SIG_A, {});
ok(appliedCount === 2, "applies ONLY this signature's Confirmed drafts");
ok(overrides["newYork|bos_short"]["Bull/Expand"].mode === "custom" && overrides["newYork|bos_short"]["Bull/Expand"].rr === 4.0, "confirmed target → custom cell");
ok(overrides["london|choch_long"]["Bear/Expand"].mode === "block", "confirmed block → block cell");
ok(D.getDraft(SIG_A, "newYork|bos_short", "Bull/Expand").status === "Added to Run", 'applied drafts advance to "Added to Run" (copied into config — NOT validated)');
ok(D.getDraft(SIG_B, "london|choch_long", "Bear/Expand").status === "Confirmed", "the OTHER universe's Confirmed draft is untouched (no leak)");
ok(D.applyDraftsToOverrides(SIG_A, {}).appliedCount === 0, "idempotent");
D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { status: "Native Validated" });
D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { status: "Approved" });
D.saveDraft(SIG_A, "newYork|bos_short", "Bull/Expand", { status: "Deployed" });
ok(D.getDraft(SIG_A, "newYork|bos_short", "Bull/Expand").status === "Deployed", "full lifecycle Added to Run → Native Validated → Approved → Deployed");

console.log("\n[4] migration semantics");
ok(D.LEGACY_MIGRATION_SIGNATURE === "EURUSD|15min|triggered_edge|25|d3|allow_multi_position", "legacy drafts land in the TE25-C3 universe");
const SRC = fs.readFileSync("src/data/statePolicyDrafts.js", "utf8");
ok(/"Applied" \? "Added to Run"/.test(SRC), 'legacy "Applied" migrates to "Added to Run"');
ok(/if \(v2\[newKey\]\) continue; \/\/ scoped draft wins — no duplicates/.test(SRC), "dedupe: scoped drafts win, no duplicates");
ok(/localStorage\.removeItem\(LEGACY_DRAFT_KEY\)/.test(SRC), "legacy store cleared after migration (one-time)");

console.log("\n[5] refusals");
ok(D.saveDraft(SIG_A, "newYork|bos_short", "Sideways/Weird", { target: 2 }) === null, "invented state label refused");
ok(D.saveDraft(null, "newYork|bos_short", "Bull/Expand", { target: 2 }) === null, "missing signature refused (drafts are ALWAYS scoped)");

console.log("\n[6]/[7] research never affects execution + UI distinctness");
const SR = fs.readFileSync("src/components/lab/sessionProfiles/SessionResults.jsx", "utf8");
const PANEL = fs.readFileSync("src/components/lab/portfolio/MarketStateTargetOverrides.jsx", "utf8");
const OVR = fs.readFileSync("src/data/stateTargetOverrides.js", "utf8");
ok(!/applyDraftsToOverrides/.test(SR), "Session Results NEVER applies drafts (read-only research surface)");
ok(/applyDraftsToOverrides\(signature, cfg\?\.stateTargetOverrides\)/.test(PANEL), "Strategy Builder apply is signature-scoped");
ok(/research.*panel-local|panel-local visual bookmark/i.test(OVR) && !/mode: "research", \.\.\./.test(OVR), "research cells never serialize into execution config");
ok(/data-testid="draft-signature"/.test(SR) && /Universe<\/span>/.test(SR), "editor displays the research universe (signature)");
ok(/data-testid="state-evidence-summary"/.test(SR) && /Executed target/.test(SR) && /Native result/.test(SR)
   && /Draft recommendation/.test(SR) && /Rescore estimate/.test(SR) && /Native confirmation/.test(SR),
   "evidence summary shows Executed / Native / Draft / Rescore / Confirmation as separate labelled values");
ok(/draft · not deployed/.test(SR), "draft recommendations are explicitly marked NOT deployed");
ok(/EvidenceBadge kind="NATIVE"/.test(SR) && /EvidenceBadge kind="RESCORE"/.test(SR), "native and rescore each carry their own badge (never equivalent)");
ok(/Not yet tested/.test(SR), 'native confirmation reads "Available" / "Not yet tested"');
// STATE_BLOCKED rows must never appear as executed trades (regression from v1 validator).
const { buildSessionResults } = loadCjs("src/data/sessionResults.js");
const blockedRow = { fillSession: "New York", structure: "BOS", direction: "Short",
    outcome: "STATE_BLOCKED", outcomeRaw: "STATE_BLOCKED", missed_reason: "state_target_block",
    net_r: 0, netR: 0, entry: "" };
const built = buildSessionResults([blockedRow], null, null);
const nyCell = built.sessions.find((s) => s.key === "newYork").cohorts.find((c) => c.key === "bos_short");
ok(nyCell.executedCount === 0, "STATE_BLOCKED row is NOT executed");
ok(nyCell.cancelledMissedCount + built.unassigned.length === 1, "STATE_BLOCKED row lands in the missed/unassigned buckets");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
