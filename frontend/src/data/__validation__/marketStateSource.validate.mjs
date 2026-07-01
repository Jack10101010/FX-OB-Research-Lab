// marketStateSource.validate.mjs — Phase 3d: engine-preferred Market State adapter.
// Run: node marketStateSource.validate.mjs
//
// Proves: legacy runs fall back to client reconstruction; new runs prefer engine
// columns; the client reconstruction is NOT invoked when engine columns are present;
// UI values are identical between engine and client for a parity dataset; and the
// Source label renders Engine / Client Reconstruction.
import {
    engineSnapshotFromRow, resolveTradeMarketState, tradeHasEngineMarketState,
    formatMarketStateSource,
} from "../marketStateSource.js";
import { daily_regime_panel, stateForTrade } from "../marketState.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, extra); } };
const approx = (a, b, e = 1e-9) => a != null && b != null && Math.abs(a - b) <= e;

// ── 1. engineSnapshotFromRow: detect + map engine columns ────────────────────
const engineRow = {
    market_state: "Bull/Expand", trend_state: "Bull", volatility_state: "Expand",
    chop_state: "Trend", ema_value: 1.0870, ema_relation: "above", px_vs_ema: 0.47,
    bbw_value: 2.61, bbw_threshold: 2.342, adx_value: 24.1, state_confirmed: "true",
    state_known_at: "2024-03-14T00:00:00Z", shifted_days: 1, source: "engine", version: "regime-1.0.0",
};
const es = engineSnapshotFromRow(engineRow);
ok("engine row → snapshot", es && es.marketState === "Bull/Expand");
ok("maps ema/bbw/adx", es.ema === 1.0870 && es.bbw === 2.61 && es.adx === 24.1);
ok("bool coercion state_confirmed", es.confirmed === true);
ok("source engine + version", es.source === "engine" && es.version === "regime-1.0.0");
ok("knownAt/shiftedDays", es.knownAt === "2024-03-14T00:00:00Z" && es.shiftedDays === 1);
ok("legacy row (no market_state) → null", engineSnapshotFromRow({ outcome: "WIN" }) === null);
ok("empty market_state → null", engineSnapshotFromRow({ market_state: "" }) === null);

// ── 2. resolveTradeMarketState — engine preferred, client not invoked ────────
let clientCalls = 0;
const spy = () => { clientCalls++; return { marketState: "Bear/Chop", source: "client" }; };

const engineTrade = { id: "T1", regimeEmit: es };
const r1 = resolveTradeMarketState(engineTrade, { any: "panel" }, spy);
ok("engine trade → engine snapshot", r1.source === "engine" && r1.marketState === "Bull/Expand");
ok("client reconstruction NOT invoked when engine present", clientCalls === 0);
ok("tradeHasEngineMarketState true", tradeHasEngineMarketState(engineTrade) === true);

const legacyTrade = { id: "T2" };
const r2 = resolveTradeMarketState(legacyTrade, { any: "panel" }, spy);
ok("legacy trade → client fallback", r2.source === "client" && clientCalls === 1);
ok("tradeHasEngineMarketState false", tradeHasEngineMarketState(legacyTrade) === false);
ok("no panel + legacy → null", resolveTradeMarketState({ id: "T3" }, null, spy) === null);

// ── 3. PARITY: engine columns reproduce the client snapshot exactly ──────────
// Build a client panel, take a real client snapshot, serialize it as engine columns,
// and assert the engine snapshot is field-identical → UI renders identically.
const N = 60;
const dayISO = (i) => new Date(Date.parse("2023-06-01T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);
const candles = Array.from({ length: N }, (_, i) => {
    const c = 1.10 + 0.03 * Math.sin(i / 9) + 0.0007 * i;
    return { t: dayISO(i), o: c, h: c + 0.004, l: c - 0.004, c };
});
const panel = daily_regime_panel(candles, {}, "EURUSD");
const day = panel.rows[45].date;
const trade = { fill_time: `${day}T12:00:00Z`, direction: "short" };
const client = stateForTrade(trade, panel);      // source:"client"
ok("client snapshot exists for parity", client && client.marketState);

// Serialize the client snapshot into an engine-style CSV row (what the backend emits).
const asEngineRow = {
    market_state: client.marketState, trend_state: client.trendState,
    volatility_state: client.volatilityState, chop_state: client.chopState,
    ema_value: client.ema, ema_relation: client.pxVsEma > 0 ? "above" : "below",
    px_vs_ema: client.pxVsEma, bbw_value: client.bbw, bbw_threshold: client.bbwThreshold,
    adx_value: client.adx, state_confirmed: client.confirmed,
    state_known_at: client.knownAt, shifted_days: client.shiftedDays,
    source: "engine", version: "regime-1.0.0",
};
const engine = engineSnapshotFromRow(asEngineRow);
const engineTradeParity = { regimeEmit: engine };
// engine-preferred resolution returns the engine snapshot (not client)
const resolved = resolveTradeMarketState(engineTradeParity, panel, () => { throw new Error("client must not run"); });
ok("parity: engine preferred (client never runs)", resolved.source === "engine");
ok("parity marketState identical", resolved.marketState === client.marketState);
ok("parity ema identical", approx(resolved.ema, client.ema));
ok("parity bbw identical", approx(resolved.bbw, client.bbw));
ok("parity adx identical", approx(resolved.adx, client.adx));
ok("parity knownAt identical", resolved.knownAt === client.knownAt);
ok("parity confirmed identical", resolved.confirmed === client.confirmed);
ok("parity trend/vol/chop identical",
    resolved.trendState === client.trendState &&
    resolved.volatilityState === client.volatilityState &&
    resolved.chopState === client.chopState);

// ── 4. Source label ──────────────────────────────────────────────────────────
ok("label engine → Engine", formatMarketStateSource("engine") === "Engine");
ok("label client → Client Reconstruction", formatMarketStateSource("client") === "Client Reconstruction");

console.log(`\nmarketStateSource.validate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
