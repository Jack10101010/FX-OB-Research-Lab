# BE-SELECTIVE-APPLICATION-TRADE-UNIVERSE — AUDIT (1)

> Mode: **AUDIT ONLY**. No implementation. Goal: support **selective BE
> application** — a mixed universe where trades matching enabled cohorts (Long,
> Short, CHoCH, BOS, session, combinations) use the BE scenario result and all
> others keep their original no-BE result.

---

## 1. Files read
- `data/tradeUniverse.js` — universe resolution (`resolveTradeUniverse`, `selectTrades`, `resolveBaselineUniverse`), universe shape (`universeType`, `sourceKey`, `variant`, `scenario`, `trades`, `baselineTrades`, `stats`).
- `data/useTradeUniverse.js` — React hook wrapper around `resolveTradeUniverse(runId, scenario)`.
- `data/beResolve.js` — `resolveBeScenarioSource` / `findBeScenario` (nested `[mode][entryVariantKey][beKey]`), `entryVariantHasExact`, `buildExactBeSummary`.
- `data/protectionTimeline.js` — `pairBaselineTrade`, `buildBreakEvenTimeline`, `buildBeAffectedTrades` (classification loss_saved/winner_cut/be_exit, ΔR).
- `data/tradeClassification.js` — KPI engine: `classifyTrade`, `summarizeTradeClassifications`, `summarizeTradeSanity` (Net R, win rate, PF, expectancy, max DD).
- `data/importer.js` — trade-row fields + nested `beTradesByMode`.
- `components/lab/protection/BreakevenTab.jsx`, `pages/ProtectionLab.jsx`, `pages/StrategyMap.jsx` — consumers.

## 2. Current data flow (verified)
1. **Result view selection.** Global `SCENARIO` (family / threshold / fillMode / variant) drives `useTradeUniverse(runId, SCENARIO)` → `resolveTradeUniverse` → `selectTrades(canonicalKey, …)` returns the selected entry-variant or baseline trades as `universe.trades`. `universe.sourceKey` = canonical entry key (`baseline` / `entry_triggered_edge_25p0_d2`); `universe.variant` = execution mode; `universe.baselineTrades` = the variant's no-BE set.
2. **Universe → consumers.** ProtectionLab, BreakevenTab, StrategyMap, RunDetail all read `universe.trades`; KPIs flow through `summarizeTradeSanity`/`classifyTrade`.
3. **BE scenario trades live separately** at `bundle.beTradesByMode[executionMode][entryVariantKey][beScenarioKey]` (importer, nested). They carry per-row `be_*` fields (`be_armed`, `be_triggered`, `be_exit_reason`, `be_exit_r`, `be_exit_price`, `be_arm_time`, `be_exit_time`, `be_arm_level_r`, `be_trigger_basis`) plus the standard trade fields. `resolveBeScenarioSource({armLevelR, triggerBasis, executionMode, entryVariantKey})` returns the matching `.trades`.
4. **Pairing is reliable.** `pairBaselineTrade` already pairs a BE trade to its no-BE trade by `base_trade_id → trade_id → id → fill-time+entry`. Both sets come from the **same entry variant** (the BE pass simulates that variant), so trade ids line up 1:1. (`buildBeAffectedTrades` already relies on this.)
5. **A mixed BE universe can be built safely** as a pure derivation: for each `originalTrade` (from `universe.trades`), if it matches the enabled cohort filter AND a paired BE trade exists, swap in the BE row; else keep the original. Pure, no mutation, no new fetch.

**Cohort fields present on every trade row:** `direction` ("Long"/"Short"), `structure` ("BOS"/"CHoCH"), `session`/`fillSession`, plus `entry`/`fill_time` (weekday/hour derivable), `obId`, `id`/`rawTradeId`/`displayTradeId`. Everything Phase C needs already exists.

## 3. Recommended architecture
**Phased: start as a derived overlay in Protection Lab → Break-even (Option A), with the pure builder designed so it can later become a first-class result view (Option B).**

- The mixed universe is a **pure transform** `buildSelectiveBeUniverse({ originalTrades, beTrades, filters, scenario })` returning a universe-shaped object (`{ trades, stats, meta }`) so any consumer that already accepts `universe.trades` works unchanged.
- **V1 surfacing:** inside the Break-even tab (a comparison panel) — lowest risk, keeps the research framing ("what if BE only on CHoCH?") next to the global BE result. Does **not** touch the global `SCENARIO` machinery.
- **V2 (later):** register it as a synthetic result view (`sourceKey` like `be_selective:0p50_wick:long+choch`) so it flows into KPI cards, trade tables, Strategy Map, Failures Lab, Comparison Lab via the existing universe contract. The pure builder makes this a wiring change, not a rewrite.
- Avoid Option C (ephemeral-only) as the primary home — the value is repeatable cohort research, which wants a nameable, comparable universe.

## 4. Pure function design
```
buildSelectiveBeUniverse({ originalTrades, beTrades, filters, scenario }) → {
  trades:   Trade[],            // mixed: BE row where matched+available, else original
  applied:  number,             // count of trades using the BE result
  summary:  { lossesSaved, winnersCut, beExits, originalNetR, protectedNetR, deltaNetR },
  warnings: string[],           // e.g. low_sample, unmatched_be
}
```
Per output trade carries metadata (non-destructive, added fields):
`{ ...row, protectionApplied: bool, protectionType: "break_even"|null, protectionScenarioKey, originalR, protectedR, deltaR }`.

Rules (all already feasible with existing helpers):
- Build a `Map` of BE trades keyed by stable id (reuse `pairBaselineTrade`'s key order: `base_trade_id → trade_id → id`).
- Iterate `originalTrades` **in order** (preserve ordering). For each:
  - `matches = matchesCohort(trade, filters)`.
  - `beTrade = beMap.get(stableId(trade))`.
  - If `matches && beTrade` → push BE row with `protectionApplied:true`, `originalR = R(original)`, `protectedR = R(beTrade)`, `deltaR = protectedR - originalR`.
  - Else → push original with `protectionApplied:false`, `deltaR:0`.
- **Never duplicate** (iterate originals once; BE rows only ever replace, never append).
- `originalNetR = Σ R(original)`, `protectedNetR = Σ R(output)`, `deltaNetR = protectedNetR − originalNetR`.
- `lossesSaved`/`winnersCut` computed only over `protectionApplied` rows (reuse `buildBeAffectedTrades` classification or `classifyTrade`).
- Missing BE → keep original (safe fallback) + `warnings.push("unmatched_be")` if a matched trade had no BE row.

`matchesCohort(trade, filters)` — AND across dimensions, OR within a dimension:
direction ∈ filters.directions (empty = all), structure ∈ filters.structures, session ∈ filters.sessions, etc. Empty filter object = apply to all (= global BE).

## 5. UI design (V1, Break-even tab)
A "Apply BE to cohorts" panel:
- **Direction chips:** Long / Short.
- **Structure chips:** BOS / CHoCH.
- **Session chips:** Asia / London / London Lull / New York / Outside.
- (Phase 2 chips: weekday, hour bucket, entry model.)
- Empty selection in a dimension = "all" for that dimension; a quick "Apply to all" reset.

Output strip (three columns + deltas):
| Original | Global BE | Selective BE |
|---|---|---|
| Net R, WR, PF, Max DD | same | same |
with **Δ vs original**, **trades affected**, **winners cut**, **losses saved**, and a low-sample warning when the matched cohort is small.

## 6. Risks
1. **p-hacking (HIGH).** Cohort × arm × trigger is a huge search space; "best" selective combos will overfit. Mitigations: always show **sample size** and **trades affected**; show selective **vs global BE** (not just vs original) so the marginal benefit of slicing is explicit; label as research/exploratory; never present as a tradeable rule; consider requiring a minimum sample before showing a verdict; ultimately validate on a second run (Comparison Lab).
2. **Variant integrity (MED).** The BE trades must be from the **same entry variant** as `universe.trades`. Resolve BE via `resolveBeScenarioSource({entryVariantKey: universe.sourceKey, executionMode: universe.variant})` — never substitute baseline BE for a variant view (the resolver already enforces this).
3. **Tiny samples (MED).** Filters can yield 0–3 trades → meaningless deltas. Show counts + a "low sample" warning; suppress verdict language under a threshold.
4. **Missing BE rows (LOW).** A matched trade with no paired BE row keeps its original result (safe) and is flagged in `warnings`.
5. **Totals clarity (MED).** Always display original vs protected side by side with the count of trades actually swapped, so a Net-R change can't be mistaken for a full-universe effect.
6. **Session/field provenance (LOW).** `session` vs `fillSession` naming — pick one canonical accessor (mirror existing classification code) so cohort matching is consistent.

## 7. Implementation plan (proposed; not yet built)
- **P1 — Pure builder.** `data/selectiveBeUniverse.js`: `buildSelectiveBeUniverse` + `matchesCohort` + `stableTradeId`. Pure, no React. Reuse `pairBaselineTrade` / `classifyTrade`.
- **P2 — Validation.** `selectiveBeUniverse.validate.mjs`: all-replaced, CHoCH-only, Long-only, Long+CHoCH, unmatched preserved, no duplicates, ordering preserved, missing-BE fallback, delta math.
- **P3 — Break-even tab panel.** Cohort chips + the 3-column Original / Global BE / Selective BE output, driven by the builder against the current view's BE scenario (`resolveBeScenarioSource`). Off by default; gated on EXACT availability for the current variant.
- **P4 — KPI reuse.** Feed `summarizeTradeSanity(universe.trades)` for all three columns so numbers match the rest of the app.
- **P5 (later) — Result view.** Register the selective universe as a synthetic `sourceKey` so Strategy Map / Failures Lab / Comparison Lab consume it via the existing universe contract.

### Verdict
The data and helpers already exist — pairing (`pairBaselineTrade`), per-row `be_*` fields, the variant-correct resolver, and the KPI engine. Selective BE is a **pure derivation** layered on top, surfaced first as a Break-even comparison panel and later promotable to a full result view with no rewrite. The dominant risk is **p-hacking**, so the UI must foreground sample size and the selective-vs-global delta, and keep it explicitly exploratory. Recommend proceeding to a P1 implement on confirmation.
