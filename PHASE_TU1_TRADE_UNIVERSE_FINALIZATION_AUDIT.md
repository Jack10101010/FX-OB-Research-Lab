# Phase TU-1 — Trade Universe Finalization Audit

**Mode:** AUDIT / DESIGN ONLY. No files modified. No implementation. No backlog items created.
**Date:** 2026-05-29
**Inputs used:** `SCENARIO_AWARE_ANALYTICS_AUDIT.md`, `TRADE_UNIVERSE_CONSUMER_MIGRATION_MAP.md`, and targeted re-verification of current code (EntriesWorkspace, RunDetail, SweepLab, WalkForwardLab, store feeds, ComparisonLab/resolver). Prior audit conclusions were assumed correct and spot-checked, not re-derived from scratch.
**Purpose:** Decide whether the Trade Universe architecture is complete enough to close and move focus to Results Basis / Current Equity, Table Compare, and Layer 3 Edge Explorer.

---

## Executive Summary

**Is Trade Universe finished? — MOSTLY.**

The architecture is sound and the hard part is done: a single resolver (`getTradeUniverse(runId, scenarioOverride)`), a single hook (`useTradeUniverse`), and a single shared badge (`TradeUniverseBadge`) exist, and every *edge-research* surface already routes through them. The remaining items are small, bounded, and mostly *non-coding* (one missing badge, two dead feeds, one stale comment), plus exactly **one** genuine feature migration (ComparisonLab scenario support) that is **ready to build** and is **not** blocked by Results Basis or backend work.

One prior conclusion is **revised by this audit**: the consumer migration map said RunDetail "needs a scope badge added." In fact **RunDetail already ships a thorough bespoke scope chip** (`Universe: Baseline reference · Variant · Scenario-aware: No · Entry scenarios` + a Strategy Map pointer). RunDetail's scope communication is therefore already *sufficient* — better than the generic badge would be. That downgrades RunDetail's remaining work from "add badge" to "optional consolidation + one misleading-pill check."

Net: **close Trade Universe as an architecture**, complete a short finalization checklist (1 badge, 2 deletions, 1 comment fix, 1 misleading-pill check), and schedule ComparisonLab Phase 3C as the first item of the *next* focus block (it is a clean, unblocked piece of work that naturally bridges into Table Compare).

---

## Findings

### 1. EntriesWorkspace audit

- **Trade source(s):** Raw `TRADES` from `useDataset()` (L44–45) as the *base list* for global session/direction filters and the "exact rows"; separately compares entry **models** via `entryResults.tradesByMode` (L76). It does **not** import `useTradeUniverse` or `TradeUniverseBadge` (verified — both absent).
- **Is baseline-base-list still the correct product decision?** **Yes.** The page's purpose is cross-*model* comparison (the surface where Triggered Edge / Penetration entry models are born). A fixed baseline reference for the base list is the right product call — letting the base list drift with the active universe would make the comparison's reference move under the user.
- **Should it remain baseline-scoped?** Yes, for the base list. The model columns are their own multi-universe axis and are already correct.
- **Is a scope badge required?** **Yes — and it is the one genuine gap here.** The page renders numbers with no scope indicator, so a user arriving from Strategy Map (on universe X) cannot tell the base table is baseline. This is a low-risk, high-clarity addition.
- **Is any Trade Universe migration still needed?** **No.** No recompute change; the data sources are correct by design.
- **Hidden assumptions / risks:** The base list and the model columns answer *different* questions (baseline reference vs per-model edge). Without a label this is an invisible category mix — the badge must state both scopes, not just one.
- **Exact recommendation:** Add a `TradeUniverseBadge` (or a two-part scope chip) to the EntriesWorkspace header reading approximately: *"Base list: Baseline · Model columns: per-entry-model."* Do **not** re-point the base list onto `useTradeUniverse`. No other change.

### 2. RunDetail scope audit

- **Scopes currently shown:**
  - **Variant** — yes. `selectedRunVariant` resolves from `ACTIVE_TRADE_VARIANT` → `runData.tradesByVariant[...]` → `primaryVariant`; a variant selector is wired (`setSelectedTradeVariant`). Everything on the page (KPIs, equity, R-dist, monthly, ledger, session grids, account equity) reads `tradesForRun` = the selected variant.
  - **Scenario** — **no, by design.** The scope chip explicitly states `Scenario-aware: No` and `Scenario: Baseline (no entry-model overlay)`.
  - **Baseline** — yes; it is the "Baseline reference" universe shown in the chip.
  - **Fallback states** — yes. Index-only runs render a `Status: Index-only metadata` chip + a metadata-only warning banner; `TRADES` is only a fallback when `runData` is absent for the active run (L352).
- **Is the current scope communication sufficient?** **Yes — this is the strongest scope communication in the app.** The chip (L491–1062) labels Universe, Variant, Scenario-aware (No), and Entry scenarios (Available/None), and when entry scenarios exist it adds an inline note directing the user to Strategy Map. This **revises** the migration-map's "add badge" item.
- **Is a scope badge still required?** **No new badge required.** Optional only: consolidate the bespoke chip onto the shared `TradeUniverseBadge` for visual consistency *if* desired — but the bespoke chip conveys *more* (the "Scenario-aware: No" row) than the generic badge, so consolidation is cosmetic, not corrective.
- **Are any charts/tables potentially misleading?** One minor item: the Session Split panel's `STATIC · ALL TRADES` pill (L2483). It means "ignores the page's session filter," but the wording "ALL TRADES" could read as "all universes." Recommend re-wording to `STATIC · ALL VARIANT TRADES` or `UNFILTERED` to avoid universe-scope confusion. Everything else is correctly governed by the page-level scope chip.
- **Does any Trade Universe cleanup remain?** Only the two dead store feeds it does *not* use (it computes its own `MONTHLY` and `R_DIST_V2` locally from `tradesForRun`) — see §5. RunDetail itself needs no cleanup.
- **Exact recommendation:** Keep RunDetail variant-scoped. No migration. Optional: (a) re-word the `STATIC · ALL TRADES` pill; (b) optionally fold the bespoke chip into the shared badge later for consistency. Neither is blocking.

### 3. SweepLab audit

- **Why remain outside Trade Universe?** SweepLab varies a *strategy parameter* (RR, stop buffer, entry buffer, verify ticks, timeframe, pair, session) across re-runs; a Trade Universe varies the *fill rule within one run*. They are orthogonal axes. There is no per-universe trade list to recompute a sweep against — each sweep point is its own backtest. Store comment confirms: *"sweep data is not stored in bundles; SweepLab owns its own state."*
- **Accidental universe dependencies?** **None.** Verified: SweepLab imports neither `useTradeUniverse` nor the badge; the only `trades` references are a results **column label/count** (`{ key: "trades" }`) and a chart `dataKey`, not a trade-list consumption. It reads `SWEEP_*` exclusively.
- **What scope communication should exist?** A chip clarifying this surface is **not** governed by the active universe — e.g. *"Parameter sweep · baseline run."* This prevents a user from assuming the active universe selection changed the sweep.
- **Is a badge sufficient?** Yes — a scope/disclaimer chip is the entire ask. No data change.
- **Is any migration required?** **No.** Per-universe sweeps would be a *backend/exporter* feature (emit sweep grids per fill-mode), explicitly out of scope for Trade Universe finalization.

### 4. WalkForwardLab audit

- **Why remain outside Trade Universe?** It reads `RUNS` and treats imported runs as sequential out-of-sample folds. Its unit of analysis is the **run/fold**, not the trade — there is no trade-list input to re-resolve per universe.
- **Are folds fundamentally run-level?** **Yes.** Each fold is a whole run; the OOS verdict (profitable-fold %, mean OOS Net R, dispersion) is computed across runs. Folds use each run's primary variant.
- **Could users misinterpret results as universe-aware?** Mild risk: a user with a non-baseline universe selected elsewhere might assume the walk-forward reflects it. It does not.
- **What scope communication is required?** A run-level scope chip, e.g. *"Run-level · folds use each run's primary variant — not universe-aware."*
- **Is any migration required?** **No, not now.** A scenario-aware walk-forward (per-fold universe resolution) only becomes coherent after ComparisonLab's per-run scenario primitive exists (§6) and would reuse it. Defer; revisit after Phase 3C.

### 5. Dead feed cleanup verification

| Feed | Current external consumers | Truly dead? | Disposition | Deletion plan | Risk of removal |
|------|---------------------------|-------------|-------------|---------------|-----------------|
| `store.MONTHLY` (`computeMonthly`) | **0** (grep-verified; RunDetail computes its own local `MONTHLY` from `tradesForRun`) | **Yes** | **DELETE** | Remove the `MONTHLY:` key (store L950) + `computeMonthly` (L731) once confirmed no dynamic key access | Very low — function is referenced only at L950; an Overview *comment* mentions it but does not call it |
| `store.R_DIST` (`computeRDist`) | **0** (grep-verified; RunDetail computes `R_DIST_V2` locally) | **Yes** | **DELETE** | Remove `R_DIST:` key (L951) + `computeRDist` (L749) | Very low — same as above |
| `store.EQUITY_CURVE` | **1** (ComparisonLab L64/L83/L99 only) | **No — live** | **DEPRECATION CANDIDATE** (after ComparisonLab migrates off it in Phase 3C) | Do **not** delete now. Re-evaluate once ComparisonLab derives per-run curves; then it has 0 consumers | Removing now would break ComparisonLab's drawdown + equity skeleton |

Additional verified detail: `computeMonthly` / `computeRDist` are called **only** at store L950/L951. `failuresAnalytics.computeMonthlyStats` is a *separate* function (not the store one). Overview's L55/L63 mention of `computeMaxDrawdown(EQUITY_CURVE)` is a **stale comment** — Overview destructures `{ ACTIVE_RUN, RUNS, SWEEP_RR, hasImportedRuns }` and does not consume `EQUITY_CURVE`. Recommend correcting that comment during the cleanup so it doesn't imply a non-existent dependency.

### 6. ComparisonLab readiness check (Phase 3C)

| Readiness dimension | Status | Evidence |
|---|---|---|
| Resolver support for per-run scenario | ✅ Ready | `getTradeUniverse(runId, scenarioOverride)` already takes both; `useTradeUniverse(runId, scenarioOverride)` memoizes on both |
| Per-run universe resolution | ✅ Mechanism exists | ComparisonLab already calls `useTradeUniverse(null, BASELINE_SCENARIO_OVERRIDE)` for its badge — proves the pattern |
| Missing-scenario handling | ✅ Primitive exists | Resolver emits `NO_TRADES_FOR_SCENARIO` (tradeUniverse.js L580); UI must render it explicitly (never silent baseline) |
| Fallback strategy | ⚠️ Design-defined, not built | Spec'd in `SCENARIO_AWARE_ANALYTICS_AUDIT.md` §6.4: explicit "scenario unavailable for this run" state + opt-in baseline fallback |
| Badge strategy | ✅ Component exists | Per-run `TradeUniverseBadge` (non-compact) per run row |
| Option enumeration | ✅ Exists | `buildAvailableOptions(allKeys)` builds family→threshold→fillMode tree |
| Required data-model change | ⚠️ One slice needed | Comparison-scoped scenario state (`state.comparison = { universe, perRunUniverse }`), persisted — *not* global `state.scenario`. Equity overlay must derive a Raw-R cumulative curve from `universe.trades` |
| "Both" guard | ✅ Enforced at resolver | `BOTH_UNAVAILABLE_NO_COMBINED` must not be bypassed by curve derivation |

- **Blocked by Results Basis?** **No.** The equity overlay can be Raw-R (cumulative `r`) and labeled as such; Current-Equity overlays are a later Results-Basis enhancement, not a prerequisite.
- **Blocked by backend work?** **No.** The resolver reads scenario CSVs already present in bundles. No exporter change needed.
- **Verdict:** **READY FOR IMPLEMENTATION.** No further audit required. The only new build surface is (a) the comparison-scoped state slice and (b) the per-run resolve + fallback/badge UI. Recommend building Model 1 (one universe for the whole comparison) first, with the data model shaped to allow Model 2 (per-run-slot) later.

### 7. Trade Universe completion review

- **Fully complete:** the resolver, the hook, the shared badge, and all edge-research surfaces (OrderBlockLab structure/session/OB/news/penetration/CI-validation, NewsLab, FailuresLab, HypothesisLab, StrategyMap, TradeInspector). RunDetail's scope chip. ProtectionLab's baseline contract + badge.
- **Partially complete:** EntriesWorkspace (correct data sources, **missing badge**). Dead-feed cleanup (identified, not yet removed). ComparisonLab (baseline-only today, scenario design ready but unbuilt).
- **Intentionally deferred:** ComparisonLab Phase 3C scenario support; scenario-aware WalkForward (only after 3C).
- **Should never be migrated:** SweepLab (parameter axis), WalkForwardLab folds (run-level), ProtectionLab base trades (baseline-by-definition), EntriesWorkspace base list (fixed reference), RunDetail (variant-scoped execution view).

---

## Risks

- **R1 — Silent baseline substitution (highest).** The only place this can still occur is ComparisonLab's future missing-scenario path. Phase 3C must render an explicit "unavailable" state, never approximate with baseline.
- **R2 — EntriesWorkspace invisible scope.** Until the badge lands, the baseline base list is unlabeled and can be misread as the active universe. Low-severity but real; cheap to fix.
- **R3 — Misleading `STATIC · ALL TRADES` pill** on RunDetail's Session Split could read as "all universes." Cosmetic wording fix.
- **R4 — Stale Overview comment** implies an `EQUITY_CURVE` dependency that doesn't exist; could mislead a future cleanup. Fix during dead-feed removal.
- **R5 — Premature `EQUITY_CURVE` deletion.** It is still live (ComparisonLab). Do not delete until after Phase 3C.
- **R6 — Dead-feed removal regressions.** Low, but confirm no dynamic/string-keyed access before deleting `MONTHLY`/`R_DIST`.
- **R7 — Two scenario scopes coexisting.** The new comparison-scoped state must not bleed into global `state.scenario` (owned by Strategy Map). Keep isolated.

---

## Exact File List

Audit-relevant files and their finalization role (no edits performed):

| File | Role in finalization |
|------|----------------------|
| `frontend/src/data/store.js` | Delete `MONTHLY` (L950) + `computeMonthly` (L731); delete `R_DIST` (L951) + `computeRDist` (L749). Keep `EQUITY_CURVE` (L947) for now. |
| `frontend/src/data/tradeUniverse.js` | No change — resolver already complete (`NO_TRADES_FOR_SCENARIO`, `buildAvailableOptions`). |
| `frontend/src/data/useTradeUniverse.js` | No change — already supports `(runId, scenarioOverride)`. |
| `frontend/src/components/lab/TradeUniverseBadge.jsx` | Reuse for EntriesWorkspace badge + ComparisonLab per-run badges. No change to component itself. |
| `frontend/src/components/lab/entries/EntriesWorkspace.jsx` | Add scope badge (base list = baseline; columns = per-model). No data change. |
| `frontend/src/pages/RunDetail.jsx` | Optional: re-word `STATIC · ALL TRADES` pill (L2483). Scope chip already sufficient. |
| `frontend/src/pages/SweepLab.jsx` | Add "Parameter sweep · baseline run" scope chip. No data change. |
| `frontend/src/pages/WalkForwardLab.jsx` | Add "Run-level · not universe-aware" scope chip. No data change. |
| `frontend/src/pages/Overview.jsx` | Fix stale `EQUITY_CURVE`/`computeMonthly` comment (L55/L63). |
| `frontend/src/pages/ComparisonLab.jsx` | Phase 3C migration target (per-run universe + comparison-scoped state). Next focus block, not this checklist. |

---

## Recommended Implementation Order

1. **Badge/disclaimer pass (zero data risk):** EntriesWorkspace badge; SweepLab scope chip; WalkForwardLab scope chip; RunDetail pill re-word. Resolves R2/R3.
2. **Comment fix:** correct the stale Overview `EQUITY_CURVE` comment (R4).
3. **Dead-feed deletion:** remove `store.MONTHLY` + `store.R_DIST` (and their compute fns) after a dynamic-access check. Shrinks the consumer surface to its real members (R6).
4. **Close Trade Universe as an architecture** — finalization checklist done.
5. **Phase 3C — ComparisonLab scenario support** (first item of the next focus block): comparison-scoped state slice → per-run `useTradeUniverse(runId, slotScenario)` → Raw-R per-universe curve → explicit missing-scenario fallback + per-run badges. After it lands, re-evaluate `store.EQUITY_CURVE` for deprecation.

(Steps 1–3 are independent and parallelizable; step 5 depends only on the architecture being closed, not on the cleanup.)

---

## DONE

- Resolver, hook, and shared badge — built and adopted.
- All edge-research surfaces scenario-aware (Structural/BOS-CHoCH, Session, News, OB, statistical Validation, Failure, bucketed expectancy).
- StrategyMap, HypothesisLab, TradeInspector, FailuresLab, NewsLab, OrderBlockLab on `useTradeUniverse`.
- RunDetail scope chip (variant scope + "Scenario-aware: No" + Strategy Map pointer + index-only fallback).
- ProtectionLab baseline contract + badge.
- Resolver invariants: `NO_TRADES_FOR_SCENARIO`, `BOTH_UNAVAILABLE_NO_COMBINED`, `FILL_MODE_COERCED`.

## TODO

- EntriesWorkspace scope badge (base list vs model columns).
- SweepLab + WalkForwardLab scope/disclaimer chips.
- RunDetail `STATIC · ALL TRADES` pill re-word.
- Overview stale-comment fix.
- Delete `store.MONTHLY` + `store.R_DIST` (+ compute fns).
- (Next block) ComparisonLab Phase 3C scenario support.

## DEFERRED

- `store.EQUITY_CURVE` deprecation — after ComparisonLab migrates off it.
- Scenario-aware WalkForward — only after Phase 3C provides the per-run primitive.
- Current-Equity equity overlays in ComparisonLab — Results-Basis work, not Trade Universe.

## NEVER

- SweepLab → Trade Universe (different axis; per-universe sweeps are a backend feature, if ever).
- WalkForward folds → trade-level universe (folds are run-level by definition).
- ProtectionLab base trades (baseline is the analytical reference).
- EntriesWorkspace base list (fixed baseline reference for model comparison).
- RunDetail page scope (variant-scoped single-run execution view).

---

## Suggested Next Actions

1. Execute the badge/disclaimer pass + comment fix (steps 1–2) — small, safe, removes all "invisible scope" risk.
2. Delete the two dead feeds (step 3) with a pre-deletion dynamic-access grep.
3. Formally close Trade Universe; open Phase 3C (ComparisonLab) as the bridge into Table Compare.

## Suggested Future Improvements

- Converge the duplicated expectancy/winRate/netR/PF math (`summarizeTradeSanity`, `lib/metrics.js`, OrderBlockLab `bucketRows`, `BucketDrillModal`, per-bucket NewsLab/HypothesisLab) onto one calculator — shared root cause with Results Basis; do once for both axes.
- Surface a baseline-vs-active **n delta** wherever buckets thin under sparse universes (Penetration 75%), so significance changes read as sample-size effects, not regressions.
- Stamp the active universe onto any **exported** artifacts (FailuresLab prevention rules, CSV exports) so exports are never silently misattributed to baseline.
- Consider folding RunDetail's bespoke scope chip into the shared `TradeUniverseBadge` for visual consistency (cosmetic).

---

## Is Trade Universe Finished?

**MOSTLY.**

The **architecture is complete and correct** — resolver, hook, badge, and full edge-research adoption are in place, and the strategic shift from *"Is BOS good?"* to *"Under which Trade Universe is BOS good?"* is structurally real today. What remains is a short, low-risk finalization checklist (one missing badge, two scope chips, one pill re-word, one comment fix, two dead-feed deletions) and **one** unbuilt-but-ready feature, ComparisonLab Phase 3C, which is correctly *deferred* rather than incomplete and is blocked by neither Results Basis nor backend work.

It is **not** a clean "YES" only because (a) the EntriesWorkspace badge gap is a real (if tiny) scope-communication hole, (b) the dead feeds still exist, and (c) the canonical multi-run comparison story isn't scenario-aware yet. None of these block closing the architecture. **Recommendation: complete steps 1–3, declare Trade Universe closed, and carry ComparisonLab Phase 3C forward as the first task of the Results-Basis / Table-Compare focus block.**

---

### STOP — Phase TU-1 finalization audit complete. No implementation performed. No files modified.
