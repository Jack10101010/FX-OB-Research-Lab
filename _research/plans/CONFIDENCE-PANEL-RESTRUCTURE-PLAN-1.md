# Confidence & Robustness — Restructure Plan

**Mode:** PLAN ONLY — no code, nothing implemented, no explainability cards.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Companion to:** `CONFIDENCE-PANEL-UX-AUDIT-1.md`
**Surfaces in scope:** `ConfidencePanel.jsx` and its container `RobustnessLab.jsx`
(design only — calculations in `robustnessAnalytics.js` are NOT changed here).

---

## 1. Current-state problems (carried from the audit)

1. **Caption ≠ formula.** The Robustness Score caption claims "sample confidence,
   half-split consistency, outlier independence, trade-off ratio." The real
   `calcRobustnessScore` is sample 30 + delta-vs-baseline 25 + drawdown 20 +
   trade-off 15 + fill 10. Two named inputs aren't in it; the three biggest are
   unnamed.
2. **Invisible metric.** Outlier dependency is computed (and scored) but never
   rendered — `RobustnessLab` calls `ConfidencePanel` without `outlierData`.
3. **No verdict.** Three co-equal columns; the user must assemble "can I trust
   this?" themselves. The composite (a summary) has the same weight as its inputs.
4. **Scope mixing.** The model selector drives only the rolling/monthly panels; the
   three confidence panels are all-models and ignore it — with no signal.
5. **Conceptual confusion in the score itself.** A panel called *Robustness /
   Confidence* mixes "is the edge *good*" (delta-vs-baseline, fill rate) with "is the
   edge *trustworthy*" (sample). The two real trust signals (half-split, outlier)
   aren't in the score at all. So the headline number is half performance, half
   evidence — which is why it never cleanly answers "can I trust this?"
6. **Trader-hostile labels** (N, H1/H2, Exp, Δ, "sample adequacy", "outlier
   dependency") and developer-facing empty states (CSV glob patterns).
7. **Minor data inconsistency:** sample bar reads `row.trades`; the score reads
   `row.fills`. Flag to reconcile.

---

## 2. The single most important question (Q1)

> **"Can I trust this model enough to act on it?"**

Everything else — *is the edge stable, is there enough data, is it overfit, is it
better than baseline* — are **sub-questions that feed that one answer.** "Act on it"
deliberately ties into the existing downstream workflow (the Promotion Desk): the
Robustness Lab is where a model earns the right to be promoted. So the panel's job is
to convert raw stats into a **trust verdict + recommended action**, per model.

This reframes the panel from "a wall of statistics" into "a recommendation engine
with its evidence attached."

---

## 3. Proposed verdict system (Q2)

The first thing the user sees is a **standing per model**, not a number. Proposed
five-state verdict (plain-language, color-coded):

| Verdict | Meaning (trader language) | Recommended action |
|---|---|---|
| **Trade-ready** | Enough data, edge holds over time, not luck-driven, beats baseline | Promote / size up |
| **Promising** | Real signs of an edge but not fully proven | Keep trading small, gather more |
| **Needs more data** | Too few trades to judge — verdict withheld | Run more / wait |
| **Fragile** | Looks good on the surface but driven by outliers or breaks across halves | Do not size up; investigate |
| **Reject** | Enough data, but no edge / worse than baseline | Drop it |

**Why a gated verdict, not just score-bucketing:** the current 0–100 score conflates
"too little data" with "bad edge" — a 3-trade model and a genuinely losing model can
both score ~20, but the correct *actions* are opposite (gather data vs reject). So the
verdict is a small decision tree over signals that **already exist** (no new math):

```
1. Sample below the "too few" threshold?            → Needs more data   (verdict withheld)
2. Outlier-dependent OR breaks across halves?       → Fragile
3. Strong trust score AND beats baseline?           → Trade-ready
4. Moderate trust / mixed evidence?                 → Promising
5. Enough data but no edge / below baseline?        → Reject
```

The numeric **trust score becomes supporting evidence** under the verdict, never the
headline. The verdict also surfaces the **single biggest reason** ("top 5 trades =
62% of Net R", "only 14 trades", "holds in both halves") so the user understands the
call at a glance.

---

## 4. Evidence hierarchy (Q3)

Group evidence as the **trust questions a trader actually asks**, in priority order
directly beneath the verdict:

**Primary evidence (gates the verdict — show directly under it):**
- **Enough data?** — trade count + a simple Too-few / Thin / OK / Strong standing.
- **Does it hold over time?** — half-split (first vs second half) consistency.
- **Real, or luck?** — outlier dependency (top-5 share of Net R). *(currently invisible — surface it here.)*
- **Better than doing nothing?** — edge vs baseline.

**Secondary evidence (supporting detail — below the primary, or in the focused view):**
- **Risk (worst drawdown).**
- **Fill rate.**
- **Rolling expectancy chart** and **monthly stability** (already exist; these are the
  selected-model deep-dive).

**Merge:**
- Sample adequacy is shown once, under "Enough data?", and explicitly *linked* to the
  trust score (it's the same signal — stop presenting it as two unrelated things).

**Remove / demote:**
- **"Trade-off quality" (ratio)** as a headline input — it's opaque and overlaps
  drawdown + edge-vs-baseline. Demote to a detail line or drop from the verdict logic.

---

## 5. Score structure resolution (Q4)

The conceptual fix is to recognise the panel answers **two different axes** and stop
blending them into one ambiguous number:

- **Trust / Robustness axis** — *can I believe this result?* → sample adequacy,
  half-split consistency, outlier independence, drawdown.
- **Edge-quality axis** — *is it worth trading?* → edge vs baseline, expectancy, fill rate.

Recommendation for each metric:

| Metric | Today | Recommended role |
|---|---|---|
| Sample Adequacy | in score (30) | **In trust score** — keep |
| Half-Split Consistency | NOT in score (but caption claims it) | **In trust score** — add (it *is* a stability signal) |
| Outlier Dependency | NOT in score (caption claims it) | **In trust score** — add + make visible |
| Drawdown Control | in score (20) | **In trust score** — keep (risk/believability) |
| Delta vs Baseline | in score (25) | **Evidence only** — move out (it's edge-quality, not trust) |
| Fill Rate | in score (10) | **Evidence only** — move out (operational, not trust) |
| Trade-off Quality (ratio) | in score (15) | **Remove / demote** — opaque, overlaps the above |

Net effect: a "Trust score" that actually measures trustworthiness (sample + stability
+ outlier + drawdown), with edge-quality shown beside it as separate evidence. The
verdict then = trust score **gated by** edge-vs-baseline (a high-trust model that
loses money is "Reject", not "Trade-ready").

**Important sequencing (respects "do not change calculations"):**
- This target composition **requires a calc change** to `calcRobustnessScore` →
  a **separate, explicitly-approved step**.
- **Zero-calc interim** that can ship with the restructure: make the caption *truthful
  to the current formula* (sample / edge-vs-baseline / drawdown / trade-off / fill) and
  render the already-computed Outlier metric as evidence. That removes the active
  misinformation without touching any math.

---

## 6. Scope separation strategy (Q5)

Split the surface into two clearly-labelled zones with one explicit link between them:

- **Zone A — All models, ranked by trust** (top, the comparison view). One row per
  model: verdict + trust score + top reason. This is "which model wins." It is NOT
  affected by the selector — and now it says so via its header.
- **Zone B — Inspecting: <model>** (below, the deep-dive). Header names the focused
  model. Holds the verdict banner, grouped evidence, rolling chart, monthly stability.
  This is the only thing the selector drives.

**The link:** clicking a model row in Zone A sets the focused model in Zone B (the
current "Rolling view:" buttons become this row-selection, or remain as a secondary
control inside Zone B). That makes the selector's effect obvious — it changes the
deep-dive, not the comparison — and resolves the "selector does nothing below"
confusion that exists today.

---

## 7. Label recommendations (Q6)

| Current | Trader-friendly |
|---|---|
| N / N THRESHOLDS | **Trades** / number of trades |
| INSUFFICIENT / LOW N / MODERATE N / ROBUST | **Too few / Thin / OK / Strong** (sample) |
| Sample Adequacy | **Enough data?** |
| Robustness Score / COMPOSITE 0–100 | **Trust score** (0–100) |
| ROBUST / MODERATE / WEAK / POOR | folds into the verdict (Trade-ready … Reject) |
| Half-Split Consistency | **Holds over time?** (first half vs second half) |
| H1 Exp / H2 Exp | **First-half Avg R / Second-half Avg R** |
| Δ | **Change** (first → second half) |
| consistent / divergent | **holds up / breaks down** |
| Outlier Dependency | **Luck or real?** (top trades' share of Net R) |
| fragile / robust (%) | **luck-driven / reliable** |
| Delta vs Baseline | **Edge vs baseline** |
| Trade-off Quality / ratio | **Reward for the trade-off** (if kept) |
| Drawdown Control | **Worst drawdown** |
| Fill Rate | **Fill rate** (% of setups that filled) |
| Empty: "Requires …trades_\*__entry_\*.csv" | **"Load this model's trade file to see its trust analysis."** |

Use "Avg R" / "Expectancy" consistently with the existing glossary terms rather than
"Exp".

---

## 8. Wireframe-level layout proposal (Q7)

```
┌ Confidence & Robustness ──────────────────────── 12 models · best 86/100 ┐
│ ZONE A — All models, ranked by how much you can trust them               │
│ (this comparison is across every model; the selector below does not       │
│  change it)                                                               │
│                                                                          │
│  MODEL          VERDICT           TRUST   WHY (top reason)                │
│  TE C3 · 50%  ● Trade-ready        86     426 trades · holds up           │
│  TE C2 · 50%  ● Promising          61     edge ok · thinner sample        │
│  TE C0       ◆ Fragile            38     top 5 = 62% of Net R            │
│  TE C1 · 25%  ◐ Needs more data    —      only 14 trades                  │
│  …                                           click a row to inspect ↓      │
└──────────────────────────────────────────────────────────────────────────┘

┌ Inspecting: TE C3 · 50%   (selected model) ──────────────────────────────┐
│                                                                          │
│  ┌ VERDICT BANNER ─────────────────────────────────────────────────┐    │
│  │  ✅  TRADE-READY            Trust score 86 / 100                  │    │
│  │  Large sample, edge holds in both halves, not outlier-driven.    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  WHY — the evidence behind the verdict                                    │
│   Enough data?       426 trades                 Strong                    │
│   Holds over time?   1st +0.34R → 2nd +0.29R    holds up                  │
│   Luck or real?      top 5 = 18% of Net R       reliable                  │
│   Edge vs baseline?  +6.2R                       yes                      │
│   ── secondary ──                                                         │
│   Worst drawdown     −4.1R          Fill rate    78%                      │
│                                                                          │
│  [ Rolling expectancy (20-trade window) ]   [ Monthly stability ]        │
└──────────────────────────────────────────────────────────────────────────┘
```

Reading order now matches the logic: **verdict → primary evidence → secondary
evidence → raw detail charts**, and **all-models comparison → focused drill-in**.
Legend for the verdict dots/shapes appears once at the top of Zone A.

---

## 9. Risks & tradeoffs (Q8)

- **Verdict is a new derived layer.** Risk of over-simplifying a model into one word.
  *Mitigation:* always show the trust score + the full evidence beneath, so advanced
  users can see exactly why; the verdict is a lens, not a replacement.
- **The ideal score composition requires a calc change** (move delta/fill out, add
  half-split/outlier in). That touches anything consuming `calcRobustnessScore` and
  the `BEST x/100` header. *Mitigation:* ship the structure with the **truthful-caption
  interim** first; treat the recomposition as a separate, approved, separately-tested
  step with before/after score comparison on real runs.
- **Reordering + selector-as-row-click** changes established interaction. *Mitigation:*
  keep the existing model buttons working during transition; add row-click as an
  additive way to focus.
- **Graceful degradation.** Many models lack trade-level files today (the empty
  states). The verdict must resolve to "Needs more data / Not enough info" rather than
  a misleading low score when inputs are missing.
- **Threshold tuning.** Verdict gates (what counts as "fragile", "trade-ready") need
  validation against real runs to avoid false "Trade-ready." *Mitigation:* start
  conservative; expose the thresholds; review with a few known-good/known-bad models.
- **Data field reconciliation.** `row.trades` vs `row.fills` must be unified so the
  sample shown matches the sample scored.
- **Scope of change.** This is a meaningful restructure of one tab; keep it contained
  to `RobustnessLab` + `ConfidencePanel` and do not touch unrelated entry surfaces.

---

## Recommendation

Adopt this verdict-first, two-zone structure. Implement in three approved steps:
**(1)** zero-calc integrity fix (truthful caption + render Outlier) →
**(2)** restructure to verdict-first + scope separation + trader labels →
**(3)** (separately) recompose the trust score onto the trust axis.
**Explainability cards come after step 2**, attached to a panel that is finally
structured to answer "Can I trust this model?"

*Plan only. No code, no implementation. This document is the deliverable.*
