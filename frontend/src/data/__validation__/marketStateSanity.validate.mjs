// marketStateSanity.validate.mjs — Phase 5: OB-adjacent sanity-card helpers.
// Run: node marketStateSanity.validate.mjs
//
// Proves the verdict precedence (backend-blocked > unknown > allowed/mismatch >
// disallowed) and the compact card model (side→placement, engine source, blocked ctx).
import { marketStateVerdict, obCardModel, REGIME_VERDICT } from "../marketStateSource.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, extra); } };

const ALL = ["Bull/Expand", "Bull/Compress", "Bull/Chop", "Bear/Expand", "Bear/Compress", "Bear/Chop"];
const snap = (o = {}) => ({ marketState: "Bull/Expand", trendState: "Bull", volatilityState: "Expand",
    chopState: "Trend", ema: 1.087, emaRelation: "above", pxVsEma: 0.47, bbw: 2.61, bbwThreshold: 2.342,
    adx: 24.1, confirmed: true, knownAt: "2024-03-14T00:00:00Z", shiftedDays: 1, source: "engine", version: "regime-1.0.0", ...o });

// ── verdict precedence ───────────────────────────────────────────────────────
ok("backend REGIME_BLOCKED wins", marketStateVerdict({ snapshot: snap(), allowedStates: ALL, obSide: "bullish", tradeOutcome: "REGIME_BLOCKED" }).verdict === REGIME_VERDICT.BLOCKED);
ok("no snapshot → Unknown/Allowed", marketStateVerdict({ snapshot: null, allowedStates: ALL, obSide: "bullish" }).verdict === REGIME_VERDICT.UNKNOWN);
ok("unconfirmed → Unknown/Allowed", marketStateVerdict({ snapshot: snap({ confirmed: false }), allowedStates: ALL, obSide: "bullish" }).verdict === REGIME_VERDICT.UNKNOWN);
ok("state in allowed → Allowed", marketStateVerdict({ snapshot: snap(), allowedStates: ALL, obSide: "bullish" }).verdict === REGIME_VERDICT.ALLOWED);
ok("state NOT in allowed → Blocked", marketStateVerdict({ snapshot: snap(), allowedStates: ["Bear/Chop"], obSide: "bullish" }).verdict === REGIME_VERDICT.BLOCKED);
// side vs trend conflict → warning (not block), only when otherwise allowed
ok("bearish OB in Bull trend → mismatch warning", (() => {
    const v = marketStateVerdict({ snapshot: snap({ trendState: "Bull" }), allowedStates: ALL, obSide: "bearish" });
    return v.verdict === REGIME_VERDICT.MISMATCH && v.tone === "warning";
})());
ok("bullish OB in Bear trend → mismatch warning", marketStateVerdict({ snapshot: snap({ marketState: "Bear/Expand", trendState: "Bear" }), allowedStates: ALL, obSide: "bullish" }).verdict === REGIME_VERDICT.MISMATCH);
ok("aligned side (bullish+Bull) → Allowed", marketStateVerdict({ snapshot: snap(), allowedStates: ALL, obSide: "bullish" }).verdict === REGIME_VERDICT.ALLOWED);
ok("disallowed beats mismatch (block first)", marketStateVerdict({ snapshot: snap({ trendState: "Bull" }), allowedStates: ["Bear/Chop"], obSide: "bearish" }).verdict === REGIME_VERDICT.BLOCKED);
ok("tones", (() => {
    const a = marketStateVerdict({ snapshot: snap(), allowedStates: ALL, obSide: "bullish" }).tone === "success";
    const b = marketStateVerdict({ snapshot: snap(), allowedStates: ["Bear/Chop"], obSide: "bullish" }).tone === "danger";
    const c = marketStateVerdict({ snapshot: null, allowedStates: ALL }).tone === "neutral";
    return a && b && c;
})());

// ── card model ───────────────────────────────────────────────────────────────
const bearOb = { id: "OB-1", side: "bearish" };
const bullOb = { id: "OB-2", side: "bullish" };
const trade = { obId: "OB-1", session: "New York", direction: "short", outcome: "WIN" };

const mBear = obCardModel({ ob: bearOb, trade, snapshot: snap({ marketState: "Bear/Chop", trendState: "Bear" }), allowedStates: ALL });
ok("bearish → placement above", mBear.placement === "above" && mBear.side === "bearish");
ok("model rows populated", mBear.rows.session === "New York" && mBear.rows.obSide === "Bearish OB" && mBear.rows.source === "Engine" && mBear.rows.version === "regime-1.0.0");
ok("model knownAt + confirmation", mBear.rows.knownAt === "2024-03-14T00:00:00Z" && mBear.rows.confirmed === true);

const mBull = obCardModel({ ob: bullOb, trade: { obId: "OB-2", direction: "long", outcome: "LOSS" }, snapshot: snap(), allowedStates: ALL });
ok("bullish → placement below", mBull.placement === "below" && mBull.side === "bullish");

// blocked row model
const blockedTrade = { obId: "OB-3", session: "Asia", direction: "long", outcome: "REGIME_BLOCKED", cancel_reason: "regime_blocked", missed_reason: "regime_blocked" };
const mBlocked = obCardModel({ ob: { id: "OB-3", side: "bullish" }, trade: blockedTrade, snapshot: snap({ marketState: "Bear/Chop", trendState: "Bear" }), allowedStates: ["Bull/Expand"] });
ok("blocked model verdict Blocked", mBlocked.verdict === REGIME_VERDICT.BLOCKED);
ok("blocked ctx present", mBlocked.blocked && mBlocked.blocked.cancelReason === "regime_blocked" && mBlocked.blocked.missedReason === "regime_blocked");

// no snapshot + not blocked → null (nothing to show)
ok("no snapshot & not blocked → null", obCardModel({ ob: bullOb, trade: { obId: "OB-2", outcome: "WIN" }, snapshot: null, allowedStates: ALL }) === null);
// blocked with no snapshot still renders (backend context)
ok("blocked with no snapshot still renders", obCardModel({ ob: { id: "x", side: "bearish" }, trade: { outcome: "REGIME_BLOCKED", cancel_reason: "regime_blocked" }, snapshot: null, allowedStates: ALL }) !== null);

console.log(`\nmarketStateSanity.validate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
