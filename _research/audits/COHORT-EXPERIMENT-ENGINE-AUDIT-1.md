# Cohort Experiment Engine — Architecture Audit (AUDIT ONLY)

Design a unified **Cohort Experiment Engine**: select any cohort and test **TP variants · BE variants · Risk-Reduction variants · month/session/day exclusions** — recomputed from the existing run, **no fresh backend backtest**. **No code changed. No commits.**

The thesis (again): every piece already exists as a pure, cohort-keyed function. The Session Results **Management tab** is a hardcoded experiment panel for *one* cohort source (a session/structure/direction cell); **Research Lab Phase 1** added the universal cohort selector + one experiment (exclusion, via Discovery). The Experiment Engine is the **composition layer** that runs all four experiment types on *any* Research-Lab cohort and reports each result with its honesty grade. It invents no analytics.

Files read: `data/sessionResults.js` (`cohortTargetEconomics`, `cohortBESuitability`, `cohortRiskReduction`), `components/lab/sessionProfiles/SessionResults.jsx` (where they render), `data/cohortFilterSimulator.js` (`metricsOf`, `simulateRemoval`), `data/researchLab.js` (`resolveResearchCohort`, `cohortSummary`), `data/timingAnalytics.js` (stability/confidence).

---

## 1. Existing reusable compute

Every experiment type maps to a function that already exists, is pure, and takes a cohort's trade array:

| Experiment / need | Function | File | Inputs it reads per trade |
|---|---|---|---|
| **Cohort resolve** (any dim / pair) | `resolveResearchCohort` | `researchLab.js` | dimension accessors |
| **Baseline metrics** (W/L/NetR/PF/WR/Exp) | `metricsOf` / `statsFor` | `cohortFilterSimulator.js` / `sessionResults.js` | `r` |
| **Exclusion / removal** (month/session/day/any) | `simulateRemoval(trades, predicate)` | `cohortFilterSimulator.js` | dimension accessors + `r` |
| **TP variant** (re-target) | `cohortTargetEconomics(trades, currentTarget)` | `sessionResults.js` | `mfe_r` + `total_cost_r` (or gross−net) |
| **BE variant** | `cohortBESuitability(trades, levels)` | `sessionResults.js` | `mfe_r` + `mae_r_to_original_exit` |
| **Risk-Reduction variant** | `cohortRiskReduction(trades, rules)` | `sessionResults.js` | `mfe_r` + `mae_r_to_original_exit` + `r` |
| **Stability / confidence** | `stabilityOf` / `confidenceForTimingBucket` | `timingAnalytics.js` | timestamp + `r` |
| **Candidate discovery / ranking** | `buildFilterDiscovery` + `recommendFilter` | `cohortFilterSimulator.js` | dims + `r` |

All are **pure, no-mutation, no-store, no-backend**, and already validated. The TP/BE/RR three are *currently* only reachable through the Session Results Management tab (scoped to a session cell); the engine's job is to feed them an arbitrary `cohort.trades` instead. **No new compute is required** for the four requested experiment types.

**Data availability (no new export needed):** `mfe_r`, `total_cost_r`/`gross_r`/`net_r`, `mae_r_to_original_exit`, and the dimension accessors are all already imported. BE/RR's bounded R figures degrade gracefully to "unavailable" when `mae_r_to_original_exit` is absent (old runs).

---

## 2. EXACT vs APPROXIMATE (the honesty spine)

This is the load-bearing distinction — the engine must label every result by **how exactly it reconstructs**.

### EXACT — reconstructable to the cent, no backend
- **Exclusion / removal.** Removing real trades and recomputing from the survivors is exact — actual R, both sides counted (`simulateRemoval`). "Exclude January", "Exclude Friday Asia", "Exclude 12:00 Wednesday" are all exact.
- **TP re-target.** Changing the take-profit does **not** change the fill set, entry, or stop — only where profit is taken — so the stop-anchored `mfe_r` path fully determines the outcome at any target T: `netR(T) = Σ_decided[(T if mfe_r≥T else −1) − cost]` (news-flatten rows held at actual). Exact for the existing fills (validated 85/85 earlier).
- **Composition of EXACT experiments is EXACT and commutative.** Exclude-then-retarget = retarget-then-exclude, because exclusion is a membership test and re-targeting is a per-trade function of that trade's own `mfe_r` (independent of which other trades remain). So "Exclude May, then test 1.5R target on the rest" yields a single, exact recomputed Net R.

### APPROXIMATE / BOUND — path-order dependent, a range not a number
- **BE variant.** Whether break-even helps depends on whether the arming milestone was reached *before* the adverse move — which per-trade peak (`mfe_r`) and trough (`mae_r_to_original_exit`) **cannot order**. So Saved R (upper bound), Lost R (worst-case), Net Impact (a range) are **bounds**, never simulated P&L. (The *reach counts* underneath are exact; only the R impact is bounded.)
- **Risk-Reduction variant.** Same path-order limitation (trail-to-`newStop` after a trigger).
- **Composition with BOUND poisons the grade.** Any stack containing a BE or RR experiment is **BOUND overall** — `combined.grade = min(grades)`. BE/RR also don't compose *exactly* with TP (BE changes the exit, which changes both the realized R and the `mfe_r`↔outcome relationship), so the engine should treat BE/RR as **standalone bounded experiments**, not silently stack them onto an exact TP/exclusion result.

### SPECULATIVE — cannot reconstruct, needs a backend run (explicitly out of scope)
- **Entry-threshold variants.** A different entry changes the fill set, entry price, stop distance, and the R denominator of every metric — `mfe_r`/`mae_r` don't transform. This is **not** an experiment the engine can do from one run; it must route to real entry-variant runs / the backend sweep. The engine should offer it only as a "Stage backend test" hand-off, never as a reconstructed number.

**Rule the engine enforces:** `combined.grade = min(EXACT, BOUND over active experiments)`; entry-threshold is never combined — it's a CTA. Every result panel shows its grade chip (EXACT / ESTIMATE-BOUND / NEEDS-BACKEND) and a "validate OOS / confirm in backend" line.

---

## 3. Minimal architecture

One new pure module + one Research-Lab module; everything else is reuse.

**`data/cohortExperiment.js`** (new, pure) — the composition layer:

```
Experiment = { type, params, grade }           // type ∈ exclude | tp | be | riskReduction
runExperimentStack(cohortTrades, experiments, ctx) → {
  baseline,                                     // metricsOf(cohortTrades)  (EXACT)
  steps: [ { type, params, grade, result, delta } ],
  combined: { grade, before, after, exact }     // after = recomputed metrics for the EXACT stack;
}                                               // BOUND steps return ranges, not a single 'after'
```

- **exclude** → `simulateRemoval(trades, predicateFromDims)` (EXACT). Reuses Research Lab's dimension predicates.
- **tp** → pick one target T; `cohortTargetEconomics(trades, currentTarget)` gives `netR(T)` + Δ vs current (EXACT). For an exact stack, exclusions are applied first, then TP re-target on the survivors → one recomputed Net R.
- **be** → `cohortBESuitability(trades)` at the chosen level (BOUND range).
- **riskReduction** → `cohortRiskReduction(trades)` at the chosen rule (BOUND range).
- `combined.grade` = weakest grade present; `combined.exact = steps.every(s => s.grade === "EXACT")`. Only when `exact` is true does the engine show a single recomputed "after" Net R/PF/WR; otherwise it shows the bounded ranges per step.

**Research Lab UI** — add an **"Experiments" module** beside Discovery: experiment chips (Exclude · TP · BE · Risk-Reduction), a small param control per chip, and a before → after panel driven by `runExperimentStack(cohort.trades, …)` with the combined-grade header. Entry-threshold appears as a disabled "Stage backend test" CTA.

**Convergence (no duplication):** extract the Management-tab TP/BE/RR **panel components** into shared `components/lab/research/modules/*`. Then:
- the **Session Results Management tab** renders them scoped to a session cell (its current behavior, unchanged for the user),
- the **Research Lab Experiment module** renders the same panels scoped to any cohort.

No new backend data, no store coupling, no simulator change. Compute stays in `sessionResults.js` / `cohortFilterSimulator.js`; the engine is a thin orchestrator.

**Data flow:** `activeRun → validUniverse → resolveResearchCohort(selection) → cohort.trades → runExperimentStack(cohort.trades, experiments) → graded result panels`.

---

## 4. Recommended Phase 2

Build the **Cohort Experiment Engine module** in Research Lab (not Calendar Research):

- **Phase 2a — EXACT experiments (highest value, fully reconstructable):** `cohortExperiment.js` + the **Exclude** and **TP** experiments, composable into one recomputed result with an EXACT grade. (Exclude reuses the Phase-1 Discovery `simulateRemoval`; TP reuses `cohortTargetEconomics`.) This alone delivers "exclude a month/session/day and re-test a target" with zero backend runs.
- **Phase 2b — BOUND experiments:** add **BE** and **Risk-Reduction** as standalone bounded panels (reuse `cohortBESuitability` / `cohortRiskReduction`), each with the BOUND grade, a range readout, and an "Open in Protection Lab" hand-off for the exact BE replay.
- **Phase 2c — Convergence:** extract the Management-tab TP/BE/RR panels into shared `research/modules/*` so the Management tab and the Experiment module render identical components (kills the duplication risk before it grows).
- **Guardrails (carried from Phase 1):** mandatory grade chips, sample-floor / stability / confidence on every panel, `combined.grade = min(...)`, and entry-threshold as a backend CTA only.
- **Validation:** a `cohortExperiment.validate.mjs` covering exact compose (exclude⊕TP commutativity + recomputed Net R), BOUND range outputs, combined-grade = weakest, and no-mutation — plus re-running the existing cohort/failures/timing/sessionResults suites.

**Out of scope (per instruction):** Calendar Research, and any entry-threshold reconstruction (SPECULATIVE — backend only).

---

## Output summary
- **Reusable compute:** `resolveResearchCohort`, `metricsOf`, `simulateRemoval`, `cohortTargetEconomics`, `cohortBESuitability`, `cohortRiskReduction`, `stabilityOf`/confidence — all pure, all already validated; no new analytics needed.
- **EXACT:** exclusion + TP re-target (and their composition). **BOUND:** BE + Risk-Reduction (path-order). **SPECULATIVE (excluded):** entry-threshold → backend CTA.
- **Architecture:** one pure `cohortExperiment.js` orchestrator (`runExperimentStack`, `combined.grade = min`) + one Research-Lab "Experiments" module reusing the existing panels; Management tab becomes a scoped instance of the same modules.
- **Phase 2:** 2a EXACT (Exclude + TP), 2b BOUND (BE + RR), 2c extract shared module panels — all additive, frontend-only, validator-backed, no backend.
