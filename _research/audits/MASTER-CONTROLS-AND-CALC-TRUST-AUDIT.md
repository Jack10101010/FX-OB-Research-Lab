# MASTER CONTROLS + CALCULATION TRUST AUDIT

> Audit only — no edits, nothing staged/committed. Verdict up front: **the dollar
> PnL is correct compounding math, not a bug.** The Master Controls filter engine
> is sound and instant-capable; the only real issues are labeling/UX and a
> lazy-snapshot staleness caveat.

## Files read
`components/masterControls/MasterControlsContext.jsx`, `tradeFilter.js`, `bundleWalk.js`, `previewComposer.js`/`costRescore.js` (equity helper), `data/configRegistry.js` (rerun tiers), `components/lab/account/accountEquity.js` (PnL formulas), `pages/RunDetail.jsx` (accountSummary + equity curve), `data/tradeUniverse.js` (resolver), and the real cube CSVs (`trades_allow_multi_position__entry_triggered_edge_*`).

## Columns found in the real cube
`direction` (bullish/bearish), `structure_tag` (BOS/CHoCH), `fill_session` (Asia / London / London Lull / New York / Outside; **empty on non-filled rows**), `pnl_r`, `gross_r`, `net_r`, plus `close_breach_session`, `ghost_fill_session`. **No `origin_session` / `detection_session` columns** in this cube (only fill-time session).

---

# Part A — Master Controls / instant filters

## Current status: WORKING and instant-capable
- **State** lives in `MasterControlsContext` (draft config); changes are classified by `configRegistry` rerun **tiers** and, when all dirty fields are instant, fed to `previewComposer` → a temporary filtered/rescored bundle → `setPreviewLens`. `bundleFor()` overlays that lens for the active run, so `resolveTradeUniverse` (and therefore RunDetail KPIs, equity curve, and every Lab via `useTradeUniverse`) reflect the filter **with no backend rerun and no store/import change**.
- **`tradeFilter.js`** builds a predicate over session / structure-direction / direction and filters every trade collection, **recomputing** wins/losses/netR/equity from the surviving subset (rows actually drop). **`bundleWalk.js`** is the generic walker over the "canonical six" collections (`trades`, `tradesByVariant`, `entryResults.tradesByMode`, `protectionResults.tradesByMode`, `directionalResults`, `controlTradesByScenario`) — it does **not** walk `beTradesByMode`.
- **Lazy support:** filtering reads the bundle's loaded collections, so it filters **only the rows currently loaded** (the lazily-fetched selected variant in `entryResults.tradesByMode`). That's correct for instant filtering of the active variant.

## Instant frontend filters (data present, tier 1) — ✅ no rerun
- **Direction long/short** — from `direction` (bullish→long, bearish→short).
- **CHoCH / BOS** and **long/short × CHoCH/BOS** (BOS Long, BOS Short, CHoCH Long, CHoCH Short) — from `structure_tag` × `direction`.
- **Session subset** (London / Lull / New York / Asia / Outside, tier 1) — from `fill_session` (falls back to UTC band when untagged).

## Require backend rerun (tier 3) — ❌ not instant
- **`sessionFilter` master toggle** (tier 3) and genuine **session-gated execution** (cancel/pause pending orders outside session) — changes *which orders exist/fill*, so it changes trade generation.
- **`structure` type, `executionMode`, conflict/cancel-action, OB-generation params, entry rules / protection not already in the cube** — all tier 3.
- Rule of thumb the codebase already encodes: *anything that changes whether an order exists or how it fills = rerun; anything that only subsets/relabels existing trades = instant.*

## Recommended architecture (matches what's largely already built)
Cube = precomputed trade universe → lazy loader fetches the selected variant/scenario rows → **Master Controls = instant client-side lens** over loaded rows (session/direction/structure) → Session/Failure/Entry Labs are views over the lensed universe → **backend rerun only** for trade-generation changes (tier 3). This is essentially the current design; the gaps are the two caveats below.

## Master-Controls caveats
1. **Lazy-snapshot staleness:** the filtered preview bundle is a snapshot built when the filter is applied, and `composedSignature` keys on run id + filter fields **but not the lazy data token**. If a user lazy-loads a *different* variant while a filter lens is active, the lens can be stale until the filter/run changes. (Pairs with the Phase-1 perf signature work — same class of issue.)
- 2. **`sessionFilter` tier mismatch:** it's tier 3 in `configRegistry` yet present in `FILTER_KEYS`/`COMPOSED_INSTANT_KEYS` (instant). The individual session toggles are tier 1. Worth reconciling so "view trades in these sessions" (instant) is cleanly separated from "gate execution to these sessions" (rerun).
3. Master Controls does **not** lens `beTradesByMode`, so BE-scenario tables aren't session/direction filtered (likely fine, but a known scope limit).

---

# Part B — Calculation trust

## Active account/risk mode
`accountEquity.js` supports `r_only` (default), `fixed_dollar`, `initial_equity_pct`, `current_equity_pct`. The mode is **runtime user state** (`accountSettings` in localStorage), not in the run on disk — so it can't be read from the cube. **But the observed $918k pins it to `current_equity_pct` (compounding)** — see reconciliation.

## Exact formulas (account mode, `accountEquity.js`)
Starting from `equity = startingBalance`, per trade in chronological order:
```
riskAmount_i = current_equity_pct ? 0.01·riskPct·equity   (COMPOUNDS)
             : initial_equity_pct ? 0.01·riskPct·startingBalance  (flat)
             : fixed_dollar       ? fixedRiskAmount               (flat)
pnlAmount_i  = r_i · riskAmount_i          // r_i = net_r (after costs)
equity      += pnlAmount_i
```
- **Net R** = Σ `net_r` over valid trades; **Gross R** = Σ `gross_r`.
- **Net PnL KPI** = `endingBalance − startingBalance` (profit only).
- **Equity curve final point** = `equityAfter(last)` = `startingBalance + netPnl` (account equity).
- **valid trade count** = filled rows excluding INVALID/UNFILLED/SESSION_FILTERED/NEWS_*; **wins/losses** from `outcome`.

## Reconciliation — TE10 D6 (the 232W/468L scenario), $100k start, 1% risk
| Quantity | Value |
|---|---|
| valid trades | **700** |
| wins / losses | **232 / 468** |
| Σ net_r | **246.61** |
| Σ gross_r | **297.60** |
| Fixed ($1000 flat = 1% of $100k) Net PnL | $246,606 → equity $346,606 |
| **Compounding (1% of current equity) Net PnL** | **$918,360 → equity $1,018,360** |

**Why your manual math didn't match the UI:**
- Your **$297.6k** = `gross_r` (297.60) × **$1000 flat** = **fixed-dollar, gross**.
- The UI's **~$918k** = **`current_equity_pct` compounding on `net_r`** → I reproduce it **exactly: $918,360**. So the app is in compounding mode and using **net** R (after the cube's spread 0.2 + slippage 0.2), while your manual used **fixed-dollar gross**. Two different models — the UI value is arithmetically correct for its mode.

## Net PnL vs equity-curve "100k" — correct, once
- **Net PnL KPI** = profit only = **$918,360**.
- **Equity curve final** = account equity = **$1,018,360**.
- **Difference = $100,000 = the starting balance, added exactly ONCE** (equity = start + netPnl; netPnl = end − start). **Not** added twice; **no double count.** This is the same labeling issue flagged in the earlier EQUITY-CURVE-VS-NET-PNL audit: the chart is *account equity* but titled "Equity Curve" next to a "Net PnL" KPI. (Your "~818k" reading is approximate / possibly a different view; the exact TE10 D6 figures are 918,360 / 1,018,360.)

## Monotonic rise across delays — expected, not a bug
Higher delay filters to fewer but higher-expectancy trades (net R: D3 156 → D6 205). Under compounding the **dollar** gap amplifies further. Consistent with the data.

## Bug or correct?
**Correct math, not a bug.** No gross/net double-use, no double-count, no starting-balance-twice. The "feels off" is (a) **fixed-dollar-gross manual vs compounding-net app**, and (b) **account-equity-vs-Net-PnL labeling**.

## Lazy-mixing check — clean
The LAZY-CUBE-SMOKE-TEST already proved each variant loads its own file with distinct canonical key + exact disk metrics (TE10 D6 net_r 246.61 ties to disk). The account math runs on `validTradesForRun` (the resolved selected-variant universe), so **no** baseline/wrong-threshold/wrong-delay/BE/stale-cache mixing in the PnL.

---

## Recommended fixes (UX/labeling only — no math change)
1. **Label the curve "Account Equity"** in account mode (it already has a start-balance baseline line); keep "Net PnL" for the KPI. Add a **"Start: $100,000" chip** and a **risk-mode chip** ("1% compounding" vs "1% fixed" vs "$X fixed"). The single most valuable change — it dissolves the 100k confusion and the manual-vs-UI surprise.
2. **Surface the active risk mode prominently** (compounding is doing a lot of work in the dollar figure); optionally a **Net PnL ⇄ Equity toggle** for the curve (data already exists as `cumulativePnlAmount`).
3. **Reconcile `sessionFilter` tier** (instant subset vs rerun execution-gate) so the instant/rerun boundary is unambiguous.
4. **Refresh the filter lens on lazy load** (include the lazy data token in `composedSignature`) to remove the snapshot-staleness window.

## Implementation roadmap
- **P1 (UX, 1 file each):** equity-curve title + start/risk-mode chips (RunDetail); optional Net PnL/Equity toggle.
- **P2:** `sessionFilter` tier reconciliation + lens-vs-lazy signature fix (MasterControlsContext / configRegistry).
- **P3 (optional):** extend Master Controls lensing to BE tables if session/direction filtering of BE is wanted.

## Risks / caveats
- Active **risk mode is runtime state** — confirm Account Settings shows `% of current equity` + $100k + 1% to be 100% certain (the $918,360 match is near-conclusive).
- Compounding dollar figures are **path-dependent** (sensitive to trade ordering); they're a money illustration, not the strategy edge — judge edge on **R** (net R 246.61 / expectancy ~0.35R) not the compounded dollars.
- The instant filter is correct for the **loaded** variant; cross-variant filtering needs each variant loaded first.
- Only TE10 D6 was tied out numerically here; same code path as the smoke-tested D3–D6, but other thresholds weren't individually recomputed.
