# Confidence Panel — UX Audit

**Mode:** AUDIT ONLY — nothing implemented, no code, no tooltips added.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Files read:** `components/lab/entries/robustness/ConfidencePanel.jsx`,
`components/lab/entries/robustness/RobustnessLab.jsx` (the only consumer),
`components/lab/entries/analytics/robustnessAnalytics.js`,
`components/lab/entries/analytics/entryRegistry.js`.

## Headline verdict

The Confidence Panel's primary problem is **not** missing explanations. It is
**information architecture + a factual mismatch between what the panel claims and
what the code computes**, compounded by weak hierarchy and decision support.
Adding explainability cards now would document — and amplify — content that is
currently inaccurate and mis-structured. **Restructure first, then explain.**

Two findings drive that conclusion (both verified in code, not opinion):

1. **The Robustness Score describes itself incorrectly.** The panel's caption
   (`ConfidencePanel.jsx:120–122`) says the composite is built from *"sample
   confidence, half-split consistency, outlier independence, trade-off ratio."*
   The actual formula (`calcRobustnessScore`, `robustnessAnalytics.js`) is:
   sample adequacy **30** + delta-vs-baseline **25** + drawdown control **20** +
   trade-off quality **15** + fill rate **10**. So the caption names two inputs
   that aren't in the score (half-split, outlier independence) and omits the three
   largest ones (delta-vs-baseline, drawdown, fill rate). A tooltip over this today
   would teach the wrong model.

2. **A whole metric is computed but never shown.** `OutlierRow` is defined in
   `ConfidencePanel.jsx:65–91` and the panel destructures an `outlierData` prop —
   but `RobustnessLab.jsx:164–168` renders `ConfidencePanel` **without** that prop,
   and the panel body never references it. Outlier dependency (`buildOutlierDependency`)
   is calculated and even feeds the score, yet the user can never see it. Dead UI.

---

## 1. Findings — the current user journey

The "Confidence Panel" is the bottom third of the **Robustness Lab** tab. A user
arriving there sees, top to bottom:

- **Header "Robustness Lab"** with a one-line intro and two pills: `N MODELS` and
  `BEST 87/100`. A row of model-name buttons labelled "Rolling view:".
- **Rolling Metrics chart + Monthly Stability table** — these react to the selected
  model button.
- **ConfidencePanel** — three equal-width columns: **Sample Adequacy** (bars),
  **Robustness Scores** (bars, 0–100), **Half-Split Consistency** (table).

What draws attention first: the **rolling chart** (largest, most colourful element)
and the `BEST 87/100` pill. What *appears* most important is therefore the chart —
but the chart is a single-model detail view, not the verdict.

What appears secondary: the three confidence panels, which are visually uniform and
sit lowest on the page — yet they hold the actual trust signals (is the sample big
enough, does it hold out-of-sample, what's the composite).

What the panel encourages: **scanning**, not deciding. There is no lead number, no
ranking, and no "do this next." The closest thing to a recommendation — `BEST
87/100` — is a 10px pill in the header, disconnected from the per-model scores below.

**Scope confusion (key):** the model-selector buttons only drive the *rolling* and
*monthly* panels (single model). The three confidence panels are **all-models** and
ignore the selector entirely. So selecting a model changes the top half and does
nothing to the bottom half — with no signal that the scopes differ.

## 2. UX problems

- **No focal point / no verdict-first layout.** Three co-equal columns with
  identical styling. The user must read all three and synthesise the answer
  themselves. The one synthesised number (composite score) has the same weight as
  its own sub-inputs.
- **Scope ambiguity** between the selected-model panels (rolling, monthly) and the
  all-models panels (the three confidence cards). Same page, two different scopes,
  no separator or label.
- **Reading order fights the logic.** Left→right is Sample Adequacy → Robustness
  Score → Half-Split, i.e. an *input*, then the *summary that depends on it*, then
  another input. Summary-in-the-middle inverts the natural "verdict → evidence" flow.
- **Empty states are developer-facing.** Two of three panels, when data is missing,
  show *"Requires per-model entry trade exports (trades_\*__entry_\*.csv)…"*. A
  trader has no idea what that means or how to fix it.
- **Dense, tiny type** (8.5–10px labels, low-contrast `muted-lab`) on decision-grade
  numbers — the same readability issue we just fixed on tooltips, still present in
  the panel body.

## 3. Information-architecture problems

- **Claimed-vs-actual mismatch** in the Robustness Score composition (Finding 1).
  This is the single most important IA fix — the explanation must match the math.
- **Invisible metric** — Outlier dependency is computed and scored but not rendered
  (Finding 2). Either surface it or stop implying it.
- **Redundancy:** Sample adequacy is shown as its own panel **and** is 30/100 of the
  composite. The user sees the same signal twice without being told it's the same.
- **Inconsistency:** Half-Split is shown as its own panel and the caption says it
  feeds the composite — but it does not. So one input is double-counted in the user's
  mind (sample) and another is phantom-counted (half-split).
- **Buried summary:** the per-model composite (the thing that should anchor the
  panel) is the middle column, not a header or lead.
- **No relationship shown** between the composite and its parts. The score is a
  black box; the sub-panels that *could* explain it aren't visually linked to it.

## 4. Terminology problems (trader-unfamiliarity)

Stats/quant vocabulary used without translation:

- **"Sample Adequacy", "N THRESHOLDS", "N", "INSUFFICIENT / LOW N / MODERATE N /
  ROBUST"** — "N" and "sample adequacy" are statistician's terms; a trader thinks
  "number of trades."
- **"Half-Split Consistency", "H1 Exp / H2 Exp / Δ", "in-sample halves", "overfit
  risk", "consistent / divergent."** H1/H2, Exp and Δ are unexplained glyphs.
- **"Robustness Score", "COMPOSITE 0–100", "ROBUST / MODERATE / WEAK / POOR."**
- **"Outlier Dependency", "fragile / robust (%)", "trade-off ratio",
  "delta vs baseline"** (the last two are score inputs the user never sees defined).

None of these tell the trader, in their language, *"can I trust this model and
should I trade it?"*

## 5. Decision-support problems

For each major metric — what decision it should support, and whether the UI delivers:

- **Sample Adequacy →** "Do I have enough trades to believe these stats?" The bar +
  label *mostly* communicates this, but the action ("get more data / don't trust
  yet") is implicit. Decent, the strongest of the three.
- **Robustness Score →** "Which model is most trustworthy overall?" Undermined: the
  score is opaque, its stated recipe is wrong, and there's no "what changes if I…"
  or "WEAK because of X." A number with no levers.
- **Half-Split →** "Does the edge survive out-of-sample (is it overfit)?" The
  consistent/divergent verdict is the right idea, but the threshold (Δ < 15% of H1)
  is hidden and the framing ("H1/H2 Exp") obscures the point.
- **Overall →** the panel never answers the actual user question: *"Should I promote
  this model, watch it, or reject it?"* The data to answer it exists (composite +
  sample + half-split), but no synthesis or recommendation is presented. This is the
  biggest decision-support gap.

## 6. Recommended structure

**Current**

```
Robustness Lab (header + model selector → drives rolling/monthly only)
  Rolling Metrics chart        | Monthly Stability        (selected model)
  ── ConfidencePanel (all models) ───────────────────────────────────────
  Sample Adequacy   |   Robustness Scores   |   Half-Split Consistency
     (input)              (the summary)            (input, not in score)
                          + Outlier (computed, never rendered)
```

**Proposed** (structure only — no implementation here)

```
Confidence & Robustness (all models)
  1. VERDICT ROW (lead)  — per model: one composite "Trust score" + a plain-language
     standing (Trade-ready / Promising / Needs data / Fragile) + the single biggest
     reason. This is the focal point; everything below is its evidence.
  2. EVIDENCE (grouped under the verdict, clearly secondary):
       • Enough data?      (sample adequacy)
       • Holds over time?  (half-split  + the now-visible outlier dependency)
       • vs baseline / drawdown / fill   (the inputs the score ACTUALLY uses)
  3. Per-model drill (rolling + monthly) stays, but label its scope as "selected
     model" so it's clearly distinct from the all-models verdict above.
```

Reasons for each change:

- **Lead with the verdict** so the panel answers "can I trust this?" in under two
  seconds instead of asking the user to assemble it.
- **Make the score's evidence match the score.** Group the sub-metrics that *actually*
  drive the composite (delta-vs-baseline, drawdown, fill) beside it, and fix the
  caption. This removes the phantom/double-counted inputs.
- **Surface or cut Outlier.** It's computed and it's in the score — show it under
  "holds over time," or remove it from both code and caption. Don't keep dead UI.
- **Separate the two scopes** (all-models verdict vs selected-model drill) with clear
  labels so the model selector's effect is unambiguous.
- **Translate labels** to trader language at the same time (trades, not N; "first
  half vs second half," not H1/H2 Exp Δ) — but only after the structure is right.
- **Rewrite empty states** in user terms ("Load per-model trade files to see this"),
  not CSV glob patterns.

## 7. Should Phase 2 explainability proceed as planned?

**No — adjust first.** The original plan was: build Tier-3 explainability cards for
the ConfidencePanel statistical metrics. That plan assumes the panel is structurally
sound and only under-explained. This audit shows it is **mis-structured and
self-inconsistent** (wrong composite caption, invisible outlier metric, double/phantom
counted inputs, no verdict hierarchy, scope mixing).

Recommended sequencing:

1. **Fix the integrity issue first** (separately approved): make the Robustness Score
   caption match `calcRobustnessScore`, and either render or remove Outlier. This is
   a correctness bug, not UX polish — explainability over a wrong description is worse
   than no tooltip.
2. **Restructure** to verdict-first with grouped evidence and labelled scope.
3. **Then** add the Tier-3 explainability cards — at that point each card describes a
   metric that is correctly computed, correctly placed, and decision-relevant, and the
   cards reinforce a sound structure instead of decorating a confusing one.

The Tier-3 card *format* we built is still the right vehicle — the change is **order
of operations**, not direction. Explainability should land last, on a panel that is
already structured to make a decision.

---

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
