# RESEARCH CLUSTER EXPLORER — DESIGN AUDIT + MVP PLAN 1

**MODE:** AUDIT ONLY — no implementation, no commits, no pushes, no code changes.
**DATE:** 2026-06-13
**FRAMING:** This is a *research-engine* design, not a dashboard. The deliverable is judged on **discovery power, statistical validity, and overfitting resistance** — UI is secondary. The single hardest problem here is **multiple comparisons / the garden of forking paths**, and most of this document is about defeating it.

---

## 0. The one finding that drives everything

The repo already contains the *aggregation* primitives. It does **not** contain the *search* and *validity* layers. So the Cluster Explorer is **~75% orchestration + statistics over existing helpers, ~25% genuinely new logic** — and the new 25% is almost entirely the anti-overfitting machinery, which is exactly what you said you care about most.

Two existing facts constrain the architecture hard:

1. **`aggregateFailures` is deliberately capped at 2 dimensions** ("cap at 2" in source) and is **loss-centric** (its "event" is `isLoss`; it reports `lossR`, `lossRate`, `breach`). A 6-way "London+Long+BOS+FFT+TE+1+Distance<2" cell cannot be produced by it, and it cannot natively target winners / false-losers / give-backs.
2. **Progressive refinement already exists** — `buildRefinedBucketRows` + `availableRefineDimensions` drill a selected 2-D cell by a 3rd dimension, sample-floored. The codebase *already chose* guided refinement over N-way mining, explicitly to avoid overfitting.

The right move is to **embrace that choice and industrialize it**, not fight it: a **guided greedy search** (beam search) that grows cohorts dimension-by-dimension and prunes on a statistical-validity gate — never a full N-way enumeration.

---

## 1. Architecture recommendation

### The options, with tradeoffs

| Option | What it is | Discovery power | Overfit risk | Compute | Verdict |
|---|---|---|---|---|---|
| **A — Pairwise explorer** (Session×Direction) | Exactly today's `buildExplorer` | Low — misses 3-way+ edges | **Low** | Trivial | Already exists; insufficient alone |
| **B — N-dimensional cluster engine** (enumerate all combos) | Full lattice of every dim combination | High *in theory* | **Catastrophic** — combinatorial cells guarantee false positives; this is literally the "Tuesday" failure mode | Explodes (12 dims → millions of sparse cells) | **Reject.** The user's own example is the anti-pattern. |
| **C — Progressive refinement** (Session → +Direction → +Structure) | User drills one dim at a time | Medium — depends on the human picking the right path; misses non-obvious starts | Low–medium (human is the regularizer) | Cheap | Good but human-bottlenecked; already half-built |
| **D — Hybrid: guided greedy search + progressive refinement** | Engine *grows* promising cohorts automatically (beam search) with a validity gate; human can also drill manually | **High** | **Low–medium IF gated** | Bounded (beam width × depth, not full lattice) | **RECOMMEND** |

### Recommended: D — a **gated greedy cohort-growth engine** over the existing 2-D primitive

The engine never enumerates the lattice. It does this instead:

1. **Seed** with all 1-D cells (every value of every available dimension) that clear the base sample floor.
2. **Score** each cell against the **global baseline** (effect size + confidence).
3. **Expand** only the top-`B` surviving cells (beam width, e.g. B=8) by adding one more dimension at a time, producing child cohorts.
4. **Gate each child on PARENT-CONDITIONAL lift**, not global lift: a child (e.g. `London+Long+BOS`) is kept **only if it beats its own parent** (`London+Long`) by a confidence-weighted margin. Adding a dimension must *earn its place* by carrying new information — this single rule is what kills "London+Long+BOS+FFT+TE+1+Distance<2+Tuesday."
5. **Stop** at a max depth (e.g. 4) and when the sample floor (which **scales with depth**) can no longer be met.
6. **Rank surviving cohorts** by a shrinkage-adjusted effect × confidence, after a multiple-comparison correction.

This is a **beam search with a marginal-information-gain prune**. It explores the interesting parts of the N-dim space at bounded cost, and its central pruning rule is also its central overfitting defense. It subsumes A (the seed layer) and C (the human can still drive a drill), so you lose nothing.

**Targets are pluggable.** The engine takes a per-trade **target label** so the same search serves every cohort type you listed (see §4): `isWinner`, `isLoss`, `give_back`, `false_loser`, `round_trip`, `isFullBreach`, `netR` (continuous), plus the existing sinkhole/high-performer framings. This is the one new aggregation primitive — `aggregateByTarget` — a generalization of `aggregateFailures` that swaps the hardcoded loss event for an injected target.

---

## 2. Anti-overfitting strategy (the core)

The threat is **multiple comparisons**: with ~12 dimensions, a 4-deep search evaluates thousands of candidate cohorts, so *some will look like edges by pure chance*. Six layered defenses, ordered by importance:

### (1) Parent-conditional lift — the marginal-gain gate *(most important)*
A cohort at depth *k* is surfaced **only if it improves on its best depth-(k−1) parent** by a margin that exceeds the parent's noise. Formally: keep `child` iff `effect(child) − effect(parent) ≥ z · SE(child−parent)`. Consequence: each added condition must *pay for itself*. "London+Long" being good does **not** license surfacing "London+Long+BOS+FFT+Tuesday" — the deep cell only appears if `FFT` and `Tuesday` each added real, measured lift over the shallower cohort. This directly defeats your stated failure mode.

### (2) Depth-scaled minimum sample
Sample floor **grows with depth** so deeper (rarer) cohorts need *more* evidence, not less. E.g. `minN(depth) = base · growth^depth` with `base = 15` (mirror of `TRIAGE_LOW_SAMPLE_N`), `growth ≈ 1.6` → 15 / 24 / 38 / 61 at depths 1–4. A 4-way cohort with 12 trades is never surfaced. Cells below floor are computed but rendered as **"insufficient sample,"** never ranked.

### (3) Effect-size gating, not just significance
Require a minimum **absolute** effect (e.g. `|Δ expectancy| ≥ 0.25R` or `|lift − 1| ≥ 0.5`) on top of confidence. A statistically "significant" +0.04R edge on n=400 is real but useless; gate it out so the surface shows *actionable* clusters only. Reuse the magnitude thresholds already in the codebase (`EXPLORER_LIFT_HIGHLIGHT = 1.5`).

### (4) Confidence via the existing engine, plus multiple-comparison correction
Reuse `researchSignals.computeConfidence` (Wilson win-rate interval + sample saturation + the `rStdErr` effect-SE hook) for per-cohort confidence — **do not invent a second confidence system** (this is already a project rule, D-007/D-008). Then add a **family-wise / FDR correction** over the number of cohorts the search actually evaluated: **Benjamini–Hochberg FDR** at q≈0.1 is the right default (controls the *expected false-discovery rate* among surfaced clusters without the brutal power loss of Bonferroni). Report the corrected confidence so a surfaced cluster's "High" already accounts for how many cells were tried.

### (5) Split-half stability (in-run validation, no backend)
For each surviving cohort, split the run's trades **temporally** (first half / second half) and check the effect holds in **both** halves with the same sign. Surface a **stability flag** (`stable` / `one-half-only` / `unstable`). A cohort that only works in the back half is a prime overfit suspect. This is cheap, pure, and needs no new data — just an index split on the existing trades. (Random k-fold is an alternative but temporal split better matches how the strategy is actually deployed forward.)

### (6) Shrinkage toward the parent (empirical-Bayes)
Report a **shrunk** effect estimate: pull each cohort's raw effect toward its parent cohort's effect by an amount inversely proportional to its sample size (James-Stein / empirical-Bayes style). A small cohort with an extreme raw number gets pulled hard toward its parent; a large one barely moves. Rank on the **shrunk** estimate so flukes can't top the list. This is the same philosophy `researchSignals` already uses (rank by `|effect| × confidence`), extended to a cohort hierarchy.

### Cross-run replication is the *real* validation — and it's deferred on purpose
None of the above *proves* an edge; they only stop you fooling yourself within one run. **True validation = the cluster replicates on an independent run.** That's why the engine must emit **machine-readable cohort definitions** that flow into Save Findings → Hypothesis Lab (§6), where cross-run confirmation already lives. The Cluster Explorer **proposes**; the Hypothesis Lab **disposes**. Surfacing a cluster is explicitly framed as "candidate hypothesis," never "validated edge."

> **Net:** the engine's honesty contract — every cluster shows shrunk effect, depth-scaled sample, FDR-corrected confidence, split-half stability, and the parent it beat. A user can see *why* it survived and how much to trust it.

---

## 3. Reuse analysis

| Need | Existing helper | Reuse |
|---|---|---|
| Cohort grouping + lift + sample-floor + baseline | `failuresAggregation.aggregateFailures` (2-D) | **High** — generalize event→target into `aggregateByTarget`; keep the math |
| Progressive 3rd-dim drill | `excursionAnalytics.buildRefinedBucketRows`, `availableRefineDimensions` | **High** — becomes the manual-drill path + a model for greedy expansion |
| Dimension catalogue + availability gating | `failuresDimensions.FAILURE_DIMENSIONS`, `availableDimensions` (session/direction/structure/weekday/hour/archetype/severity/obwidth/penetration/entryModel/ghost/fft) | **High** — add **distance-at-arm** as one new dimension (field already exported, TE-gated) |
| Confidence (Wilson + sample saturation + effect-SE) | `researchSignals.computeConfidence` | **High** — the per-cohort confidence engine; no new system |
| Effect×confidence ranking, dedup, low-sample suppression | `researchSignals.buildResearchSignals` pattern | **Medium** — reuse the ranking philosophy, not the function |
| Outcome classes (give-back / false-loser / round-trip / clean) | `lossTriage.buildLossTriage` cells | **High** — these ARE the loss-cluster targets |
| Catastrophic breach predicate + per-cohort breach rate | `protectionAnalytics._isFullBreach`, `buildObBreakdown.breachRate`, `penetration` dim | **High** — breach target = `ob_fully_breached || pen ≥ 100` |
| Per-loser severity (0–10) | `severityScorer.scoreSeverity` / `scoreAll` | **Medium** — severity as a target-weight or a dimension |
| Context sinkholes (session×direction negative pockets) | `lossTriage.buildContextSinkholes` | **High** — a pre-built 2-D negative target; cluster engine generalizes it |
| Winners-inclusive baseline (genuine lift) | `buildExplorer` already passes `baseline: list` | **High** — the lesson from the cockpit V2.0A lift fix (D-015) carries over |
| Cohort → finding payload | `projectWorkflow.buildResearchFindingPayload`, `store.addProjectFinding` | **High** — the Save-Findings bridge already exists |

**Genuinely new (the ~25%):**
- `aggregateByTarget` — event-agnostic cohort aggregation (generalizes `aggregateFailures`).
- The **greedy beam search + parent-conditional gate** orchestrator.
- The **validity layer** — depth-scaled floors, BH-FDR correction, split-half stability, empirical-Bayes shrinkage.
- A small **target registry** (winner / loss / give-back / false-loser / round-trip / breach / netR).

**Estimated reuse: ~70–80%** of the analytic surface area; the new code is concentrated in search + statistics, which is small in LOC but high in design value.

---

## 4. What the MVP should discover (ranked by value)

If V1 shipped tomorrow, surface these cohort classes, ranked by decision value:

1. **Strongest negative clusters (danger)** — cohorts with the worst shrunk expectancy / highest loss-rate lift over their parent. *Why #1:* avoidance is the cheapest, highest-confidence win — you don't need to be right about *why*, just stop trading the pocket. Generalizes Context Sinkholes to N-D.
2. **Strongest catastrophic-breach clusters** — cohorts with disproportionate `ob_fully_breached` / penetration ≥ 100%. *Why #2:* breach = the tail risk that blows accounts; even a modest-frequency breach cluster is worth a hard filter.
3. **Strongest positive clusters (edge)** — best shrunk expectancy over parent, stability-confirmed. *Why #3:* the upside, but it needs the most overfit-skepticism, so it's ranked below the avoidance plays.
4. **Strongest give-back clusters** — cohorts over-represented in `give_back` losers (were in profit, gave it back). *Why:* these point straight at a *management/BE* rule, not an entry filter — high actionability, distinct remedy.
5. **Strongest false-loser clusters** — cohorts over-represented in `false_loser` (recovered post-stop). *Why:* point at *stop/TP placement* research; upper-bound framed (peak, not path).
6. **Round-trip clusters** — `round_trip` (ran up *and* recovered) cohorts — the messiest; lowest MVP priority.

MVP shows **#1–#4** well; #5 (false-loser) reuses lossTriage directly so it's nearly free; #6 deferred. High-performer / TP-target clusters lean on excursion/MFE and are a Phase-2 extension.

---

## 5. UI / workflow (research efficiency first — NOT a matrix)

A giant matrix is the wrong instrument: it shows *all* cells (mostly noise) and hides the question "what's worth my attention." Instead, a **ranked discovery feed + drill**:

```
┌─ RESEARCH CLUSTER EXPLORER ─────────────────────────────────────────────┐
│ Target: [ Losers ▼ ]   Dimensions: [Session][Dir][Structure][FFT][+]    │  ← controls (target + which dims in play)
│ Min stability: [stable ▼]   Effect ≥ [0.25R]   FDR q ≤ [0.10]           │  ← validity knobs (default sane)
├──────────────────────────────────────────────────────────────────────────┤
│ TOP CLUSTERS (ranked by shrunk effect × confidence, FDR-corrected)       │
│                                                                          │
│  ▸ Outside · Short · CHoCH        −1.42R  ·  n=41  ·  High  ·  ✓stable   │  ← one row per surviving cohort
│      beats parent (Outside·Short −0.9R) by +0.52R ·  breach 18%          │     (effect, sample, confidence,
│      [explain] [drill +dim] [save finding] [→ Hypothesis]                │      stability, the parent it beat)
│                                                                          │
│  ▸ Asia · Long · Distance<2        +0.61R  ·  n=33  ·  Medium · ⚠ back½  │  ← stability warning shown inline
│      beats parent (Asia·Long +0.2R) by +0.41R                           │
│      [explain] [drill +dim] [save finding] [→ Hypothesis]               │
│  …                                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ EXPANSION TREE (when a row is selected) — what the search tried & pruned │
│   Outside ─ Short ─┬─ CHoCH      kept (+0.52R over parent)               │
│                    ├─ BOS        pruned (no marginal gain)               │
│                    └─ +FFT       pruned (sample < floor at depth 4)      │
└──────────────────────────────────────────────────────────────────────────┘
```

Workflow / hierarchy:
- **Pick a target** (Losers / Breaches / Winners / Give-backs / …) → the feed re-ranks. This is the primary axis — you research *one outcome at a time*.
- **The feed is the product.** Each row is a *survivor* of the gated search, annotated with everything needed to trust or reject it (effect, n, confidence, stability, the parent it beat, breach rate).
- **`[explain]`** opens the **expansion tree** for that cohort — the auditable trail of what the search expanded and *why each branch was kept or pruned*. This is the trust mechanism and the anti-black-box feature.
- **`[drill +dim]`** lets the human take over (manual progressive refinement, the existing `buildRefinedBucketRows` path).
- **`[save finding]` / `[→ Hypothesis]`** push the cohort definition downstream (§6).

Navigation priority: **rank → inspect → drill → save**. Never "stare at a grid." The grid view, if ever built, is a Phase-3 power-user toggle, not the default.

---

## 6. Integration without duplication

| Surface | Relationship — Cluster Explorer is the *producer*, they are *consumers* |
|---|---|
| **Research Signals** | Signals is 1-D (fill-state / session / entry-model) over the Classification tab. The Cluster Explorer is its **multi-dimensional successor**, reusing `computeConfidence`. Don't replace Signals; the Explorer **feeds candidate dimensions/cohorts** the 1-D engine can't see. Long-term, a surviving cluster could auto-register as a Signal candidate (zero engine change — Signals already takes arbitrary candidate rows). |
| **Research Cockpit** | The cockpit's Loss-Clusters section currently shows the single top `buildExplorer` lift cell. It becomes a **thin reader** of the Cluster Explorer's top survivor per target — one card that deep-links into the full Explorer. No logic duplication: the cockpit *summarizes*, the Explorer *discovers*. |
| **Save Findings** | A cluster row's `[save finding]` calls the **existing** `addProjectFinding` via `buildResearchFindingPayload`, with `source: "cluster_explorer"` and the machine-readable cohort definition in `meta`. No parallel save path. |
| **Hypothesis Lab** | `[→ Hypothesis]` promotes a cluster to a hypothesis with its cohort predicate attached, so the Lab can **test replication across runs** — which is the actual validation the in-run statistics can't provide. The Explorer is deliberately *upstream* of the Lab. |
| **Protection / TP / live-bot config** | These are **downstream of validation**, not the Explorer. The Explorer emits "breach cluster X" / "give-back cluster Y" as *candidates*; the protection-recommendation and TP-optimization layers consume *confirmed* findings later. The Explorer must not emit prescriptions. |

The cohort-definition object is the shared currency: `{ target, predicate: [{dim, value}…], stats: {effect, n, confidence, stability, parentEffect, breachRate} }`. Everything downstream consumes that; nothing re-derives it.

---

## 7. What is safe now vs what must wait

**Safe to build now (additive, single-run, restructure-independent):**
- The whole search + validity engine over `aggregateByTarget`, reusing existing dims + helpers.
- Targets: winner / loss / give-back / false-loser / round-trip / sinkhole (all from trades + `lossTriage`, already shipped).
- **Distance-at-arm as a new dimension** — field `price_distance_from_ob_at_arm_pips` is already exported and consumed (D-014); adding it to the dimension catalogue is additive and TE-gated.
- Save-Finding / Hypothesis hand-off (existing rails).

**Wait / gate (do not block the MVP on these):**
- **Catastrophic-breach clusters** — *computable now* from `ob_fully_breached` / `max_ob_penetration_pct` (export-present), but the **protection-recommendation** that consumes them waits on the protection-research thread. Build the breach *target*; don't build breach *prescriptions*.
- **BE-matrix / candle-data restructure** — the Explorer reads **post-normalization frontend trade fields only**; it must not depend on the BE cube shape or any swept output. **TP-optimization clusters and any "optimal target" output wait for the RR-sweep / backend work (V3, after restructure parity)** — single-run MFE can only give an upper-bound proxy (per D-015 / cockpit audit).
- **FFT clusters** require FFT-ON/OFF paired control to be a *real* counterfactual; gate the `fft` dimension on control availability (don't infer FFT value from a non-paired run).

**Never (out of scope by design):** full N-way enumeration; any prescription ("use BE here," "optimal TP = X") from the Explorer itself; persisting or auto-validating clusters as findings; touching `backend/`, exporters, the BE cube, the candle pipeline, lab internals, `/insights`, or the store.

---

## 8. Phased roadmap

**MVP (V1) — gated greedy discovery, one run, danger-first.**
- New pure module `data/clusterExplorer.js`: `aggregateByTarget`, the beam-search orchestrator, and the validity layer (depth-scaled floors, parent-conditional gate, BH-FDR, split-half stability, shrinkage). Pure, React-free, node-testable, with a `__validation__` harness (this is where the rigor is proven — test the gate, the FDR, the stability split, the shrinkage on synthetic data with known plants and known flukes).
- Targets: losers, breaches, give-backs, false-losers, winners (ranked per §4).
- Dimensions: the existing catalogue + distance-at-arm; FFT gated on control.
- UI: the ranked feed + `[explain]` expansion tree (§5); `[save finding]` via existing rails.
- Restructure-safe; additive; no backend.

**Phase 2 — depth, validation rails, cockpit/Signals wiring.**
- Manual progressive drill integrated (reuse `buildRefinedBucketRows`).
- `[→ Hypothesis]` promotion with cohort predicate; cross-run replication surfaced when a project has ≥2 runs.
- Cockpit Loss-Clusters card becomes a thin reader of the Explorer's top survivors; surviving clusters offered as Research Signals candidates.
- High-performer / TP-*profile* clusters (MFE-based, upper-bound framed — still not "optimal TP").
- Continuous-target support (`netR`) alongside binary targets.

**Phase 3 — power tools + backend-dependent validation.**
- Optional dense 2-D matrix view (power users) and a saved-search library.
- **After BE-matrix/candle parity:** true RR-sweep TP-optimization clusters; BE-cube-aware management clusters; cross-run *automated* stability scoring and an "edge half-life" view.
- Protection-recommendation and live-bot-config consumers (downstream of confirmed findings).

---

## 9. Final recommendation — the exact V1 to build first

**If the goal is maximizing discovery of profitable strategy improvements, build the gated greedy *danger-and-give-back* discovery engine first — a pure `data/clusterExplorer.js` plus a ranked-feed UI — and ship it before any winner-hunting polish.**

Concretely, V1 =
1. **`aggregateByTarget`** (generalize `aggregateFailures`; winners-inclusive baseline).
2. **Beam search** (width ≈ 8, max depth 4) seeded by 1-D cells, expanding on **parent-conditional marginal lift**.
3. **Validity layer**: depth-scaled sample floor (15·1.6^depth), effect-size gate (≥0.25R / lift≥1.5), `computeConfidence` + **BH-FDR (q=0.1)**, **temporal split-half stability flag**, **empirical-Bayes shrinkage** ranking.
4. **Targets in priority order**: losers → breaches → give-backs → false-losers → winners.
5. **Dimensions**: existing catalogue + distance-at-arm (TE-gated), FFT gated on control.
6. **UI**: ranked discovery feed with `[explain]` expansion tree + `[save finding]` (existing rails). No matrix.
7. **Validation harness** that plants a real edge and a pure fluke in synthetic data and proves the engine surfaces the former and prunes the latter — the engine's credibility rests on this test.

**Why danger-first:** avoidance edges are higher-confidence, need no causal story, and convert directly into filters/protection — the fastest path from "discovery" to "account-level improvement," and the least vulnerable to overfitting. Winner-hunting is more seductive and more dangerous; let the same engine do it in Phase 2 once the validity layer has earned trust on the safer targets.

The decisive design commitment: **the engine's job is to propose well-defended candidate cohorts, and its proof of value is that it can show you exactly why each survived and prune the "Tuesday" cells before you ever see them.** Cross-run replication (Hypothesis Lab) remains the real verdict; the Explorer's contract is to never overclaim and always show its work.

---

**STATUS: AUDIT COMPLETE — no code changed, no commits, no pushes.**
