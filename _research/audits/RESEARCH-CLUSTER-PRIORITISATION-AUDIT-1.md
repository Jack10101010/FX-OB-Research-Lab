# RESEARCH CLUSTER PRIORITISATION (CLUSTER-2B) — DESIGN AUDIT 1

**MODE:** AUDIT FIRST — no implementation until the scope is approved. No engine/stat/threshold change. Frontend-only, additive, backward-compatible.
**DATE:** 2026-06-13
**HEAD:** `d590699` (CLUSTER-2A live, pushed). `ClusterExplorer.jsx` carries 11 uncommitted **banner-stream** lines — any edit here must be patch-staged to exclude them.

This layer answers one question: **"what should I look at next?"** — a *researcher triage* over the rejected cohorts. It is explicitly **not** a findings engine, not a recommendation engine, and never implies validation. Cross-run replication (Hypothesis Lab) remains the only arbiter of truth.

---

## 1. Audit findings — what data already exists

The statistical engine (`clusterExplorer.js`) is untouched and stays untouched. What it emits today:

| Output | Carries | Enough for triage? |
|---|---|---|
| `result.clusters` | full stats (effect, shrunkEffect, confidence, stability, lift, n, avgR, …) | yes (survivors) |
| `result.pruned[]` | **only** `{ predicate, parentPredicate, depth, reason, detail(string) }` | **no numeric stats** |
| `result.baseline` | `{ n, rate, targetN }` | yes |
| `result.evaluatedCount`, `result.fdr` | counts | yes (funnel) |

CLUSTER-2A already proved the gap is closeable **UI-side**: its `nearMisses` memo re-derives `n / rate / lift` for each pruned predicate from `trades` + `dimensions` accessors + `CLUSTER_TARGETS[target].universe/hit`. The prioritisation layer extends exactly that reconstruction.

**Reusable, no engine change:**
- `computeConfidence` — **exported** (from `researchSignals.js`); the page can call it on each cohort's `{count, wins, losses, avgR}` to recover confidence, identically to the engine.
- `LIFT_MIN` (1.5), `SPLIT_MIN_PER_HALF` (6), `BASE_SAMPLE_N` (15) — **exported** constants → no magic numbers needed.
- Stability — `stabilityFlag` is **not exported**, but it's a ~10-line temporal split-half that can be replicated as a small pure UI helper (using the exported `SPLIT_MIN_PER_HALF` + the target predicates). This duplicates a little logic but keeps the engine sealed.
- Recurrence / themes — pure aggregation over the predicates already in `nearMisses`. **No new data at all.**

**Conclusion:** every input the score needs (sample, lift, confidence, stability, recurrence) is obtainable **frontend-only, additive, engine-safe**. No threshold, gate, FDR, shrinkage, or survivor logic is read-written.

---

## 2. Recommended architecture

A new **pure** module + a thin UI consumer — mirroring how the cockpit/cluster engine work is layered:

```
data/clusterPrioritisation.js   (NEW, pure, node-testable)
   scoreNearMisses(nearMisses, { liftMin }) → { scored[], themes[] }
   - in:  nearMisses already carrying { predicate, label, parent, n, rate, lift, confidence, stability, reason }
   - out: each near-miss enriched with { opportunityScore, interest:'high'|'investigate'|'weak', factors }
          + themes[] = recurrence rollup
   - NO trade access, NO statistics — it's a presentation ranker over passed-in stats.

data/__validation__/clusterPrioritisation.validate.mjs   (NEW)

pages/ClusterExplorer.jsx   (EDIT, patch-staged around banner hunks)
   - extend the existing `nearMisses` memo to also attach confidence (computeConfidence)
     and stability (replicated split-half) per cohort
   - call scoreNearMisses(...) → render "Recurring Themes" panel + an Interest column
```

Why a separate pure module (not inline): the scoring/recurrence logic is the part with real design risk (overfitting) and deserves its **own validator** with synthetic fixtures (planted recurrence, planted fluke). Keeping it pure and node-testable is the repo's established pattern (`runInsights.js`, `clusterExplorer.js`). The page stays a thin renderer.

The engine file is **not opened**. The prioritisation layer sits entirely downstream of `result.pruned`.

---

## 3. Proposed scoring formula

All sub-scores normalised to `[0,1]`; the score is a **heuristic**, never a probability.

| Sub-score | Definition | Rationale |
|---|---|---|
| `liftCloseness` | `clamp((lift − 1) / (LIFT_MIN − 1), 0, 1)` → lift 1.0→0, 1.5→1 | how close the cohort came to clearing the effect gate — the core "near-miss heat" |
| `sampleScore` | `n / (n + 40)` (saturating; K mirrors `researchSignals.sampleK`) | evidence mass; rewards bigger cohorts, saturates |
| `confScore` | `{Very Low:0, Low:0.4, Medium:0.7, High:1.0}[confidence]` | reuses the existing confidence engine's level |
| `stabScore` | `{stable:1, stable_under:1, one_half_only:0.5, unstable:0}[stability]` | held in both run-halves = less likely a fluke |
| `recurrenceScore` | `clamp(maxFactorFreq / topN, 0, 1)` (highest theme-frequency among the cohort's factors) | "this keeps appearing" — **down-weighted, see §5** |

```
opportunityScore = 0.30·liftCloseness + 0.25·sampleScore + 0.20·confScore
                 + 0.15·recurrenceScore + 0.10·stabScore
```

**Interest labels** (presentation buckets on `opportunityScore` — NOT gates):

- `opportunityScore ≥ 0.62` → 🔥 **High Interest**
- `opportunityScore ≥ 0.40` → 👀 **Worth Investigating**
- else → 📌 **Weak Signal**

Mandatory framing on every label: *"research triage — something keeps appearing and may deserve investigation; this is not evidence. Confirm across runs in the Hypothesis Lab."* No label may use "likely / probable / significant / validated / proven."

Weights chosen so lift-closeness (the genuine near-miss signal) leads, recurrence is deliberately modest (artifact-prone), stability lowest (noisy at small n). These are tunable presentation constants, isolated in the pure module.

---

## 4. Proposed UI layout

Inside the existing **"Why no clusters?"** block (CLUSTER-2A), in this order:

```
┌ Recurring Themes ───────────────────────────────────────────────┐
│  CHoCH        appears in 6/10 rejected · avg lift 1.17× · avg n 38  👀  │
│  Outside      appears in 4/10 rejected · avg lift 1.15× · avg n 24  📌  │
│  Short        appears in 3/10 rejected · avg lift 1.21× · avg n 19  📌  │
│  ⚠ Related cohorts share trades (nested in the search) — these are   │
│    recurrences, not independent confirmations.                      │
└─────────────────────────────────────────────────────────────────┘

┌ Gate funnel (unchanged) ────────────────────────────────────────┐ …

┌ Closest candidates (Near Misses) ───────────────────────────────┐
│  cluster        n   rate  base  lift   interest         reason     │
│  CHoCH·Short    19   71%   64%  1.11×   👀 Investigating  effect…   │
│  CHoCH          72   75%   64%  1.17×   🔥 High Interest  effect…   │
│  Outside        24   74%   64%  1.15×   📌 Weak Signal    effect…   │
│  …                                                                 │
│  Triage only — below the evidence bar, not findings.               │
└─────────────────────────────────────────────────────────────────┘
```

- "Recurring Themes" sits **above** Near Misses (answers "what keeps showing up?").
- Near Misses gains an **Interest** column (the chip) and is **sorted by `opportunityScore`** (replacing the reason-closeness sort; reason stays a column).
- Surviving-cluster feed is **unchanged**; the empty-state still says "No surviving clusters."

---

## 5. Risks / overfitting concerns (the part that matters)

1. **Recurrence ≠ corroboration (biggest risk).** The beam search *expands promising parents*, so `CHoCH → CHoCH+Short → CHoCH+Long → CHoCH+<2pips` are **nested, trade-sharing cohorts**, not 4 independent sightings. A naïve "CHoCH in 6/10" overstates importance. Mitigations: (a) cap recurrence weight at 0.15; (b) the theme line **must** carry the "related cohorts — not independent confirmations" caveat; (c) optionally count a theme's *distinct co-dimensions* rather than raw cohort count. We surface recurrence as a *curiosity prompt*, never as evidence.
2. **The score must never read as a probability or confidence.** Labels are triage words; copy repeats "not evidence."
3. **Garden of forking paths.** Making near-misses look actionable can lure the user into chasing the top score on one run. Mitigation: every interest chip routes to *"test across runs (Hypothesis Lab)"*; the Explorer still reports "No surviving clusters"; single-run caveat everywhere.
4. **Single-run only.** All inputs are one run/variant. The whole panel inherits the existing "this-run-only" framing.
5. **Damage ranking (Phase 4) has the inverse bias** — large cohorts dominate Σ-loss-R by sheer size, burying small high-rate pockets. It complements disproportion; it must not silently replace it.
6. **No rigor reduction.** The statistical gates still decide survivors. This layer only re-orders and annotates *already-rejected* cohorts. If a near-miss were real, it would still need to clear the gates on a future run to become a finding.

---

## 6. Recommended implementation scope

| Phase | Recommendation |
|---|---|
| **Phase 1 — Opportunity Score + labels** | **Implement.** New pure `clusterPrioritisation.js` + validator; extend `nearMisses` with confidence/stability; add Interest column. Additive, UI-only, engine-safe. |
| **Phase 2 — Recurring Themes** | **Implement** (same change set). Pure aggregation over near-miss predicates + the nesting caveat. Highest value / lowest risk. |
| **Phase 3 — Discovery Categories** | **Audit only — do not build.** See recommendation below. |
| **Phase 4 — Loss-driver / financial damage ranking** | **Audit only — do not build.** See recommendation below. |

### Phase 3 recommendation (audit) — where do "categories" belong?
Most proposed categories **already exist as engine targets**: Danger = `losses`, Catastrophic Breaches = `breaches`, Protection Opportunities = `give_backs`/`false_losers` (+ future BE/FFT), Positive Outliers = `winners`. "Loss Drivers" is a *ranking mode* (Phase 4), not a new category. So this is **not a new engine and not separate pages** — it's **grouping the existing target selector under labelled headings** (Danger · Breach · Protection · Positive) inside **Cluster Explorer**, plus the **Research Cockpit** surfacing the single top opportunity per category as a thin reader that deep-links into the Explorer (consistent with how the cockpit already summarises labs). Nothing belongs "elsewhere." Recommend: keep one Explorer, group targets visually; Cockpit highlights; defer until Phase 1/2 prove the triage UX.

### Phase 4 recommendation (audit) — disproportion vs financial damage
Current ranking = **statistical disproportion** (lift on rate). Proposed = **financial damage** (Σ negative Net-R / loss-R contribution). The example (Cluster B 58%/−18R operationally beats A 76%/−4R) shows the two are **orthogonal** and both legitimate. Recommendation: add a future **ranking-mode toggle** ("Disproportion" ⇄ "Damage (Σ loss-R)") over the *same* cohorts — **not a new target, not a new engine**. Damage is reconstructable UI-side (Σ r over the cohort, or n·avgR). Gate it behind its own overfit caveat (size bias, §5.5). Defer; it pairs naturally with Phase 1's scored near-misses (add a `damage` field, expose a sort toggle later).

---

## 7. If approved — implementation plan (Phase 1 + 2 only)

1. `data/clusterPrioritisation.js` — pure `scoreNearMisses(nearMisses, { liftMin, topN })` → `{ scored, themes }`; the formula in §3; no trade/stat access.
2. `data/__validation__/clusterPrioritisation.validate.mjs` — synthetic fixtures: planted recurring factor surfaces as a top theme; a one-off high-lift fluke does **not** dominate; label thresholds; no-overclaim wording; empty-safety; recurrence caveat present.
3. `pages/ClusterExplorer.jsx` (patch-staged around banner hunks) — extend `nearMisses` to attach `confidence` (`computeConfidence`) + `stability` (replicated split-half); render "Recurring Themes" panel + Interest column; sort by `opportunityScore`. Survivor feed and empty/needs-data states unchanged.
4. Validate: new validator green; `clusterExplorer`/`runInsights`/`resolveDisplayTrades` validators **unchanged & green** (engine untouched); Babel parse; `craco build`; SSR — themes + interest chips render on a high-base-rate run, normal feed unchanged.

**Engine files (`clusterExplorer.js`, `runInsights.js`, `resolveDisplayTrades.js`) are not opened.** No backend / exporters / BE-matrix / candle-data / Save-Findings / Hypothesis-Lab / Failure-Lab touch.

---

**STATUS: AUDIT COMPLETE.** Awaiting approval of scope before any code is written. Recommended approved scope = **Phase 1 + Phase 2** (additive, UI-only, engine-safe); Phase 3 + 4 remain audit-only recommendations above.
