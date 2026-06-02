# RB-8 — Convergence Architecture (DESIGN ONLY)

**Mode:** Design / architecture audit. No implementation, no file modifications.
**Date:** 2026-06-01
**Predecessors:** RB-1…RB-7, `RESULTS_BASIS_RB3.2_CANONICAL_BUCKET_SPEC.md`, `TABLE_COMPARE_BASIS_AUDIT.md`

---

## 0. Where We Are

Two orthogonal axes are now first-class and store-backed:

```
   Trade Universe  — "which trades?"   → state.scenario → useTradeUniverse() → universe.trades
   Results Basis   — "how measured?"   → state.resultsBasis + state.accountSettings → useResultsLens()
```

Single calculator: `data/resultsBasis.js` (`summarizeTrades`, `summarizeBuckets`, `buildCurve`, `toCanonicalBucketRow`, `formatBasisValue`, `bucketDisplaySchema`). Shared UI: `CanonicalBucketTable`.

Migration status:

| Surface | RB phase | Outcome |
|---|---|---|
| OrderBlockLab | RB-4 | All 10 bucket tables → canonical (WR shift live) |
| NewsLab | RB-5 | 3 overlap breakdowns → canonical (bare mode) |
| ProtectionLab | RB-6B | OB Characteristic Breakdown → canonical (baseline-pinned) |
| FailuresLab | RB-6A | No migration — loss-centric, no WR bucket |
| HypothesisLab | RB-7 | No migration — hypothesis comparison, no bucket |

Remaining: **EntriesLab, ComparisonLab, RunDetail** — and the future systems (Table Compare L1/L2, Edge Explorer L3, ComparisonLab Phase 3C, Current Equity, Global Lens). Crucially, the three remaining surfaces are **comparison / deep-view surfaces**, not simple single-universe bucket pages. This is the convergence point.

Confirmed current state of the three:
- **EntriesLab** — multi-scenario by design. Reads `entryResults.tradesByMode` + per-model summaries; shows every entry model (baseline, triggered_edge·, penetration·) side by side. Does **not** follow the active scenario. Has per-model equity curves + `EntryDeltaTable` (cross-run delta). Summary WR mixes `wins/list` and `wins/(wins+losses)`.
- **ComparisonLab** — cross-**run**. Baseline-pinned (`BASELINE_SCENARIO_OVERRIDE`); per-run primary-variant; metrics via `lib/metrics` (`computeProfitFactor(TRADES)`); delta columns `v − base`. "Scenario-aware comparison is a future feature."
- **RunDetail** — single-run deep view + the **Current Equity engine home** (`summarizeAccountEquity`, funding challenge). Account config local (`localStorage fxob_account_view_settings_v1`), **not** the global store slice; consumes variant trades, not `universe.trades`.

---

## 1. What should EntriesLab become?

**The Scenario-Comparison surface** — the canonical home of comparison along the **entry-model / scenario** axis within one run.

- Stays **multi-universe**: it shows all entry models at once and therefore **ignores the global Universe selector** (it *is* the universe picker, exploded). It honors the **Basis** axis only.
- Becomes the reference implementation of **Table Compare — Layer 1** (compare scenarios/models within a run), governed by the delta-suppression rules in `TABLE_COMPARE_BASIS_AUDIT.md`.
- Each model row is a **canonical summary** (`summarizeTrades` over that model's `tradesByMode` list), not a `summarizeBuckets` table.
- Per-model equity curves come from `buildCurve(basis)` (Raw-R cumulative vs Current-Equity).
- Becomes a primary **Edge Explorer** entry point (drill a model → its trades).

## 2. What should ComparisonLab become?

**The Run-Comparison surface** — the canonical home of comparison along the **run** axis.

- Becomes **Table Compare — Layer 2** (cross-run delta matrix), same suppression rules.
- Retires `lib/metrics` and routes every cell through `resultsBasis.summarizeTrades` (so cross-run numbers agree with every other surface).
- Phase 3C: becomes **scenario-aware** — compare *run A · scenario X* vs *run B · scenario X* (a comparison cell = `(runId, universeKey, basis)`), instead of baseline-only.
- Honors **Basis**, with **Current Equity gated on equal account config** (per the audit); currency deltas suppressed when configs differ.
- Feeds **Edge Explorer** (drill a run/cell → trades).

## 3. What should RunDetail become?

**The single-run canonical deep view + the Current Equity home.**

- Owns the rich **Current Equity** experience (equity curve, drawdown, funding challenge) — keep, but **re-point its account config to the global store slice** (`ACCOUNT_SETTINGS`) and read `RESULTS_BASIS` via `useResultsLens`, retiring the local `localStorage` copy.
- KPI strip + any per-attribute breakdowns route through `resultsBasis` (canonical roll-up / `CanonicalBucketTable`).
- Decision needed: **scenario scope**. Recommended — make RunDetail **scenario-aware** (consume `universe.trades`) with a visible scope badge, so the deep view reflects the active scenario like every other page; keep a variant override for power users.
- Becomes the deepest **Edge Explorer** host (it already has the trade ledger / inspector).

---

## 4–10. Surface Capability Matrix

| Surface | (4) Results Basis direct | (5) Canonical summary only | (6) Baseline-only | (7) Scenario-aware | (8) Current Equity | (9) Table Compare | (10) Edge-Explorer drill target |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| OrderBlockLab | ✅ done | — | — | ✅ | ✅ | later (per-bucket Δ) | ✅ (bucket rows) |
| NewsLab | ✅ done | — | — | ✅ | ✅ | — | ✅ (overlap buckets) |
| ProtectionLab | ✅ done | — | ✅ (intentional) | — (pinned) | ✅ (OB breakdown) | — | ✅ (OB buckets) |
| FailuresLab | — | partial (loss-rate) | — | ✅ (cohort) | ❌ (meaningless) | — | ✅ (drilldown ledger) |
| HypothesisLab | — | ✅ (baseline/sim) | — | ✅ | ❌ | ✅ (hypothesis rows) | ✅ (sim trades) |
| **Overview** | ✅ (KPI) | ✅ | — | ✅ | ✅ | — | — |
| **EntriesLab** | ✅ (curves) | ✅ (per-model rows) | — | **multi** (all models) | ✅ | ✅ **L1** | ✅ (model rows) |
| **ComparisonLab** | ✅ | ✅ (per-run rows) | ✅→3C | ✅ (3C) | ✅ (equal-config gate) | ✅ **L2** | ✅ (run rows) |
| **RunDetail** | ✅ | ✅ (KPI) | — | ✅ (recommended) | ✅ **(home)** | — | ✅ **(host)** |
| StrategyMap | ✅ (stats) | ✅ | — | ✅ | ✅ | — | ✅ |

Reading the columns:
- **(4) Results Basis direct** = uses `useResultsLens` + a `resultsBasis` calculator.
- **(5) Canonical summary only** = needs a single roll-up (`summarizeTrades`/`toCanonicalBucketRow`), not the full `summarizeBuckets`/`CanonicalBucketTable` machinery.
- **(6) Baseline-only** = ProtectionLab permanently; ComparisonLab until Phase 3C.
- **(7) Scenario-aware** = consumes `universe.trades`. EntriesLab is *multi-scenario* (shows all), distinct from *single-active-scenario*.
- **(8) Current Equity** = everything except FailuresLab (loss-frequency) and HypothesisLab (comparison rows). Multi-scenario/multi-run CE requires the suppression rules.
- **(9) Table Compare** = EntriesLab (L1, scenario axis), ComparisonLab (L2, run axis), HypothesisLab (hypothesis axis — already a compare table).
- **(10) Edge Explorer drill** = any surface whose rows carry `tradeRefs`.

---

## 11. Architecture Decisions to Make NOW (to avoid future rewrites)

1. **One roll-up calculator — retire `lib/metrics`.** ComparisonLab's `computeProfitFactor(TRADES)` is the last copy of the third calculator. Route it through `resultsBasis.summarizeTrades` before building L2, or cross-run numbers will disagree with every migrated page.
2. **Account config = one source (store).** Migrate RunDetail's `fxob_account_view_settings_v1` → `state.accountSettings` **now**. CE comparability across EntriesLab/ComparisonLab/RunDetail depends on a single config; doing it later means re-plumbing three surfaces.
3. **Standardize the drill contract now.** Define one payload every surface emits and Edge Explorer consumes:
   `{ runId, universeKey, basis, account, bucketKey, label, tradeRefs }`. `CanonicalBucketTable` already carries `tradeRefs`/`onDrill`; formalize the shape so Edge Explorer needs no per-surface adapter.
4. **Compare invariant = one basis + one config.** Make "same basis, same account config" a **shared guard** (a `useCompareGuard`), not per-page logic. Both L1 and L2 consume it; this is where the `TABLE_COMPARE_BASIS_AUDIT` suppression rules live.
5. **Canonical Summary WR decision.** EntriesLab/HypothesisLab summary rows use `wins/count`; bucket pages use `wins/(wins+losses)`. Decide (RB-3.1-style, with documented deltas) that **all summary surfaces adopt `wins/(wins+losses)`** before EntriesLab migration — otherwise EntriesLab/Comparison/Hypothesis will visibly disagree with OBL/NewsLab for the same run.
6. **Comparison-cell identity.** Define the canonical cell = `(runId, universeKey, basis)`. EntriesLab varies `universeKey` (fixed run), ComparisonLab varies `runId` (fixed universe), Phase 3C varies both. One identity → one delta engine.
7. **`canonicalSummaryRow` adapter.** Add a thin adapter (sibling to `toCanonicalBucketRow`) that normalizes a *summary-derived* row (entryResults / per-run) into the frozen shape, so EntriesLab/ComparisonLab reuse the same contract instead of hand-rolling fields (the bug RB-6B found in ProtectionLab).
8. **Memoization key.** Establish `(runId, universeKey, basis, accountConfigHash)` as the cache key for all roll-ups/curves now, so CE recompute on large multi-scenario/multi-run views stays cheap.

---

## 12. Architecture Diagrams

### 12.1 Layered target architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ STORE (data/store.js)                                                      │
│   state.scenario        state.resultsBasis     state.accountSettings       │
│   (Trade Universe)      (Results Basis)        (one account config)        │
└───────┬───────────────────────┬───────────────────────┬───────────────────┘
        │ useTradeUniverse()     │ useResultsLens()       │ (same slice)
        ▼                        ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ CALCULATORS (data/resultsBasis.js)  — the ONLY roll-up math                │
│   summarizeTrades · summarizeBuckets · buildCurve · toCanonicalBucketRow   │
│   formatBasisValue · bucketDisplaySchema · [NEW] canonicalSummaryRow       │
│   (lib/metrics + inline per-page math RETIRED)                             │
└───────┬───────────────────┬───────────────────┬───────────────────────────┘
        ▼                   ▼                   ▼
┌───────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐
│ CanonicalBucket│ │ CanonicalSummary │  │ CompareEngine + useCompare    │
│ Table          │ │ (KPI/roll-up)    │  │ Guard (one basis+config)      │
└──────┬─────────┘  └────────┬─────────┘  └──────────────┬───────────────┘
       │                     │                            │
  single-universe       KPI strips               Table Compare L1/L2
  bucket pages          + summary rows           (delta + suppression)
       │                     │                            │
       └─────────────────────┴───────────┬────────────────┘
                                          ▼
                          ┌──────────────────────────────┐
                          │  EDGE EXPLORER (Layer 3)       │
                          │  drill contract:               │
                          │  {runId,universeKey,basis,     │
                          │   account,bucketKey,tradeRefs} │
                          └──────────────────────────────┘
```

### 12.2 The two axes × the surfaces

```
                    Single active universe         Multi-universe / multi-run
                    (follows global Universe)      (own axis — ignores global Universe)
   ┌──────────────────────────────────────────┬──────────────────────────────────────┐
 R │ OrderBlockLab · NewsLab · Overview        │ EntriesLab (scenario axis, L1)         │
 a │ RunDetail · StrategyMap · HypothesisLab   │ ComparisonLab (run axis, L2)           │
 w │ FailuresLab(cohort) · ProtectionLab(base) │                                        │
   ├──────────────────────────────────────────┼──────────────────────────────────────┤
 C │ same, measured in Current Equity          │ EntriesLab CE curves · ComparisonLab   │
 E │ (RunDetail = CE home)                     │ CE (equal-config gate)                 │
   │ FailuresLab: NO CE · Hypothesis: NO CE    │ suppression rules apply (Table Compare)│
   └──────────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 13. Migration Map

| # | Surface / system | Type | Action | Depends on |
|---|---|---|---|---|
| RB-8a | **Foundations** | infra | Retire `lib/metrics`; migrate RunDetail account config → store; add `canonicalSummaryRow`; define drill contract + `useCompareGuard`; **Canonical Summary WR decision** | RB-1..6 |
| RB-8b | **RunDetail** | deep view + CE home | Read store `ACCOUNT_SETTINGS`/`RESULTS_BASIS` via lens; scenario-aware (universe.trades) + scope badge; KPI via `summarizeTrades`; keep CE engine | RB-8a |
| RB-8c | **EntriesLab** | scenario compare (L1) | Per-model rows via `canonicalSummaryRow`; curves via `buildCurve(basis)`; `EntryDeltaTable` → `CompareEngine` + suppression; canonical WR | RB-8a |
| RB-8d | **ComparisonLab** | run compare (L2) | Replace `lib/metrics` with `summarizeTrades`; delta via `CompareEngine` + `useCompareGuard`; CE equal-config gate | RB-8a, RB-8c |
| RB-8e | **ComparisonLab Phase 3C** | scenario-aware compare | comparison cell `(runId, universeKey, basis)`; compare same scenario across runs | RB-8d |
| RB-8f | **Edge Explorer (L3)** | drill system | consume drill contract from any surface; trade-level edge view | RB-8b/c/d |
| — | FailuresLab / HypothesisLab | — | No bucket migration (decided); optional Canonical Summary WR alignment only | RB-8a (item 5) |

---

## 14. Ownership Map

| Concern | Owner | Notes |
|---|---|---|
| Trade Universe (which trades) | `state.scenario` + `useTradeUniverse` | ProtectionLab/ComparisonLab override to baseline; EntriesLab ignores (multi) |
| Results Basis + account config | `state.resultsBasis` + `state.accountSettings` + `useResultsLens` | **single** account config (after RB-8a) |
| Roll-up math | `resultsBasis.js` | only calculator; `lib/metrics` + inline math retired |
| Bucket display | `CanonicalBucketTable` | single-universe attribute buckets |
| Summary/KPI display | `CanonicalSummary` (KPI) + `canonicalSummaryRow` | EntriesLab/Comparison/Overview/RunDetail/Hypothesis rows |
| Delta + suppression | `CompareEngine` + `useCompareGuard` | governed by `TABLE_COMPARE_BASIS_AUDIT.md` |
| Comparison-cell identity | `(runId, universeKey, basis)` | shared by EntriesLab (L1), ComparisonLab (L2/3C) |
| Drill / Edge Explorer | drill contract `{runId,universeKey,basis,account,bucketKey,tradeRefs}` | every surface emits; Edge Explorer consumes |
| Current Equity engine | `accountEquity.js` (via `resultsBasis.buildCurve`) | RunDetail is the rich host |

---

## 15. Recommended Implementation Order

```
RB-8a Foundations ─► RB-8b RunDetail ─► RB-8c EntriesLab (L1) ─► RB-8d ComparisonLab (L2)
                          │                                              │
                          └──────────────► RB-8f Edge Explorer (L3) ◄────┘
                                                   │
                                          RB-8e ComparisonLab 3C (scenario-aware)
```

Rationale: foundations first (they remove the three-calculator hazard and the dual account-config hazard that would otherwise force rewrites of all three surfaces). RunDetail next — it's single-run, proves the store-account migration + scenario-awareness with low blast radius, and is the CE home. EntriesLab before ComparisonLab — Layer 1 (one run, many scenarios) is simpler than Layer 2 (many runs) and yields the `CompareEngine` that L2 reuses. Edge Explorer after at least one compare surface exists. Phase 3C last (it needs the comparison-cell identity proven by L1/L2).

---

STATUS:
- COMPLETE (design only; no files modified, no implementation)

NEXT:
- RB-8a — Foundations: retire `lib/metrics`, migrate RunDetail account config into the store, add `canonicalSummaryRow` + the drill contract + `useCompareGuard`, and land the Canonical Summary WR decision. (Inert/low-risk groundwork that unblocks RunDetail, EntriesLab, ComparisonLab, and Edge Explorer without rework.)

RISKS:
- **Three-calculator drift** until `lib/metrics` is retired — ComparisonLab can show numbers that disagree with migrated pages.
- **Dual account config** (RunDetail local vs store) makes CE incomparable across surfaces until unified; the longer it persists, the more rewiring later.
- **Summary WR inconsistency** (`wins/count` vs `wins/(wins+losses)`) will surface as EntriesLab/Comparison disagreeing with OBL for the same run unless decided before RB-8c.
- **Multi-scenario/multi-run CE is sequence-dependent and config-sensitive** — without the shared `useCompareGuard`, L1/L2 risk showing misleading currency deltas (the core `TABLE_COMPARE_BASIS_AUDIT` warning).
- **Scope creep**: EntriesLab/ComparisonLab are comparison surfaces; forcing them into `CanonicalBucketTable` (a single-universe component) would be wrong — they need `CompareEngine`, not `CanonicalBucketTable`.

RECOMMENDED RB-8 PLAN:
1. **RB-8a Foundations** — retire `lib/metrics`; RunDetail account config → store `ACCOUNT_SETTINGS`; add `canonicalSummaryRow`, drill contract, `useCompareGuard`; Canonical Summary WR decision (documented deltas).
2. **RB-8b RunDetail** — lens-driven basis + store account config; scenario-aware with scope badge; canonical KPI; CE engine retained as the rich host.
3. **RB-8c EntriesLab** — Layer 1 scenario compare via `canonicalSummaryRow` + `CompareEngine` + suppression; per-model `buildCurve(basis)`.
4. **RB-8d ComparisonLab** — Layer 2 run compare; replace `lib/metrics`; CE equal-config gate.
5. **RB-8f Edge Explorer** — Layer 3 drill, consuming the standard contract from RunDetail/EntriesLab/ComparisonLab and the already-migrated bucket pages.
6. **RB-8e ComparisonLab Phase 3C** — scenario-aware cross-run compare on the `(runId, universeKey, basis)` cell.

END OF TASK
