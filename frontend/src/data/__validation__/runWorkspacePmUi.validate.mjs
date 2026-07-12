// runWorkspacePmUi.validate.mjs — source-level guards for the Run Workspace PM UX fixes.
//
// These assert the WIRING that unit tests can't (JSX rendering), following the repo's
// existing *Wiring.validate.mjs pattern (regex over source). Covers:
//   • the run-specific tab is clearly named "PM · This Run" (distinct from the global page);
//   • the panel's first card states it is run-specific, not the frozen policy page;
//   • PM OFF does NOT auto-dump policy-reference data (it's behind an "Open policy reference"
//     button, collapsed by default) — run stats are primary;
//   • PM ON shows the scope banner + summary cards BEFORE any policy reference;
//   • Session Results Management separates Included vs PM-blocked candidates (population toggle);
//   • PM-blocked rows never print a fabricated Net R and state the outcome is unavailable;
//   • the global PM page links out to per-run attribution.
//
// Run from frontend/:  node src/data/__validation__/runWorkspacePmUi.validate.mjs

import fs from "fs";
import path from "path";

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");
const RUNDETAIL = read("src/pages/RunDetail.jsx");
const ATTR = read("src/components/lab/portfolio/RunPortfolioAttribution.jsx");
const SR = read("src/components/lab/sessionProfiles/SessionResults.jsx");
const PMPAGE = read("src/pages/PortfolioManager.jsx");

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

console.log("[1] run-specific tab clearly named (not identical to the global page)");
ok(/\{ id: "portfolio-run", label: "PM · This Run" \}/.test(RUNDETAIL), "RunDetail tab label = 'PM · This Run'");
ok(/showResultsSection\("portfolio-run"\) && <RunPortfolioAttribution/.test(RUNDETAIL), "PM tab renders RunPortfolioAttribution");
ok(/title="PM · This Run"/.test(ATTR), "panel NeonPanel title = 'PM · This Run'");

console.log("\n[2] first card states run-specific, not the frozen policy page");
ok(/function ScopeBanner/.test(ATTR) && /run-specific attribution/.test(ATTR) && /not<\/span> the frozen research policy page/.test(ATTR), "ScopeBanner disclaimer present");
ok(/data-testid="pm-run-scope-banner"/.test(ATTR), "scope banner testid present");
ok(/<ScopeBanner pmOn=\{false\} \/>/.test(ATTR) && /<ScopeBanner pmOn=\{true\} \/>/.test(ATTR), "banner shown in BOTH PM OFF and PM ON");

console.log("\n[3] PM OFF does not auto-dump policy reference (collapsed, secondary)");
ok(/data-testid="pm-run-off"/.test(ATTR), "PM OFF message present");
ok(/const \[open, setOpen\] = useState\(false\)/.test(ATTR), "PolicyReference collapsed by default (useState(false))");
ok(/Open policy reference/.test(ATTR), "reference is an explicit 'Open policy reference' affordance");
ok(/data-testid="pm-run-policy-page-link"/.test(ATTR) && /to="\/portfolio-manager"/.test(ATTR), "links to the global policy page");
// In the PM OFF branch, the message comes BEFORE the PolicyReference (run-first ordering).
{
    const off = ATTR.slice(ATTR.indexOf('data-testid="pm-run-off"'));
    ok(off.indexOf("<PolicyReference") > 0, "PM OFF: message precedes PolicyReference");
}

console.log("\n[4] PM ON prioritises current-run attribution (cards before reference)");
{
    const on = ATTR.slice(ATTR.indexOf('<ScopeBanner pmOn={true}'));
    const cardsAt = on.indexOf('label="PM kept"');
    const refAt = on.indexOf("<PolicyReference");
    ok(cardsAt > 0 && refAt > cardsAt, "summary cards render before the (secondary) PolicyReference");
    ok(/label="PM blocked"/.test(ATTR) && /label="Block reasons"/.test(ATTR) && /label="Kept Net R"/.test(ATTR), "kept/blocked/reasons/net cards present");
}

console.log("\n[5] Management: Included vs PM-blocked are SEPARATE collapsible sections");
ok(/function CollapsibleSection/.test(SR) && /const \[open, setOpen\] = useState\(false\)/.test(SR), "collapsible helper, collapsed by default");
// Phase-1 Market-State lens: the section keeps its "Included portfolio trades" default
// title (whole-cohort view) and now takes the lens' state-filtered rows at the call site.
ok(/function IncludedTradesSection/.test(SR) && /title = "Included portfolio trades"/.test(SR) && /testid="included-trades"/.test(SR), "Included portfolio trades section (with count)");
ok(/function PmBlockedSection/.test(SR) && /title="PM-blocked candidates"/.test(SR) && /testid="pm-blocked-candidates"/.test(SR), "PM-blocked candidates section (orange, with count)");
ok(/<IncludedTradesSection c=\{c\} rows=\{stateRows\}/.test(SR) && /<PmBlockedSection c=\{c\} \/>/.test(SR), "both sections wired into the Management tab");
// PM-blocked section only when blocked rows exist
ok(/if \(!c\.pmEnabled \|\| \(c\.portfolioBlockedCount \|\| 0\) === 0\) return null/.test(SR), "PM-blocked section renders only when blocked rows exist");
// no mixed-population toggle anymore
ok(!/function TradePopulation/.test(SR) && !/data-testid="trade-population"/.test(SR), "old mixed-population toggle removed");

console.log("\n[6] Suitability panels stay ABOVE trade-detail sections; included-only note");
{
    const mgmt = SR.slice(SR.indexOf("Suitability panels FIRST"));
    const callouts = mgmt.indexOf("<ManagementCallouts");
    const incl = mgmt.indexOf("<IncludedTradesSection");
    const blk = mgmt.indexOf("<PmBlockedSection");
    ok(callouts > 0 && incl > callouts && blk > incl, "Callouts/Target/BE/RR render before the collapsible trade sections");
    ok(/data-testid="suitability-scope-note"/.test(SR) && /Computed from included portfolio trades only\./.test(SR), "muted 'included trades only' note present");
    ok(/c\.pmEnabled && \(c\.portfolioBlockedCount \|\| 0\) > 0 && \(\s*<p[\s\S]*?suitability-scope-note/.test(SR), "scope note only shown when PM-blocked rows exist");
}

console.log("\n[7] PM-blocked rows never show a fake Net R; caution badge + reason + exact note");
ok(/Blocked by PM<\/span>/.test(SR), "caution 'Blocked by PM' badge on blocked rows");
ok(/no outcome recorded/.test(SR), "hypothetical column states no outcome (not 0R)");
ok(/function pmBlockReason/.test(SR) && /NEVER TRADE/.test(SR) && /direction mismatch/.test(SR), "friendly block reason mapping");
ok(/t\.trigger_time \?\? t\.triggerTime/.test(SR) && /t\.armed_at \?\? t\.armedAt/.test(SR), "shows trigger + arm timing");
ok(/data-testid="blocked-rr-note"/.test(SR) && /PM-blocked candidates are setup records only\. They were blocked before fill and were not simulated after the block, so alternative RR \/ target \/ BE results are unavailable for them in this run\./.test(SR), "exact-wording Alt-RR note, inside the blocked table");

console.log("\n[8] global page links to runs");
ok(/data-testid="pm-page-open-run-link"/.test(PMPAGE) && /to="\/runs"/.test(PMPAGE), "global PM page links to open a run for attribution");

console.log(`\n${fail === 0 ? "ALL PASSED" : fail + " FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
