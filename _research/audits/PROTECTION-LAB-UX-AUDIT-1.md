# Protection Lab — UX Audit

**Mode:** AUDIT ONLY — nothing implemented, no code, no tooltips, no analytics touched.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Files read:** `pages/ProtectionLab.jsx` (1903 lines), `components/lab/protection/`
(`ProtectionVisualAnalytics.jsx`, `ProtectionPowerTools.jsx`,
`ProtectionDataQualityPanel.jsx`, `ProtectionSectionDivider.jsx`).

## Verdict

Yes — Protection Lab needs the same verdict-first transformation Robustness Lab
received, and arguably more: the data to answer its question already exists but is
**scattered across three sections and ~20 panels, gated on data availability, and never
synthesised**. One extra dimension Robustness Lab didn't have: a genuine **exact-vs-
estimate confidence layer** that is a real strength and must be preserved (and fed into
the verdict so we never recommend acting on a directional estimate).

---

## 1. Current page purpose

A protection-research surface comparing the unprotected strategy against several
defensive variants. It already organises into three labelled sections via
`ProtectionSectionDivider`:
- **Protection Overview** — exact backtests, research estimates, defensive screening.
- **Visual Analytics** — equity impact, R distribution, drawdown, OB risk profile.
- **Protection Workbench** — paired-trade audit, mode matrix, research hypotheses.

It is honest about data quality via `ConfidenceTag` (**exact / estimated / requires**)
and a `ProtectionDataQualityPanel` — a strength worth keeping.

## 2. Core user question — verified (and refined)

The assumed question ("Is protection helping or hurting, and should I use it?") is
**correct but incomplete**. The page's own copy proves the intent: the Exact Backtest
table's note reads *"Higher Net R, lower drawdown, and controlled winner cost are
preferred,"* and the impact scatter legend is literally *"Improved by defense / Reduced
by defense."* Refined core question:

> **"Is protection helping — and if so, which protection mode should I use — and is that
> based on an exact backtest or only a directional estimate?"**

So it's a **per-mode** decision (like Robustness Lab's per-model verdict), with a
**confidence** qualifier.

## 3. User journey findings

1. **Decide:** which defensive mode (if any) beats trading unprotected.
2. **First thing noticed:** the top KPI MetricChips (hard-invalidation counts) and the
   "Research Confidence" legend — i.e., *caveats and counts*, not the answer.
3. **Appears most important:** the legend + the wide "Exact Protection Backtest Results"
   table (12 columns) — visually heavy, so it draws the eye, but it's a dense grid with
   no takeaway and it only renders when exact data exists.
4. **Should be most important:** a single verdict — *"Best protection: <mode>, +X.XR vs
   unprotected, −Y.Y drawdown (exact)"* or *"No mode beats unprotected — trade
   unprotected."* That doesn't exist anywhere.
5. **Does it answer its own question?** The pieces are present (the "Net vs Unprotected"
   column; the impact scatter; the drawdown comparison) but **the user must assemble the
   answer themselves** from data spread across three sections.
6. **Time to determine if protection helps:** far too long — you must scroll past the
   legend, read a 12-column table, cross-check the estimate panels (A–D), then the
   Visual Analytics scatter/drawdown, then the mode matrix. Easily 30s+ and error-prone.

## 4. Information-architecture findings

- **~20 panels across 3 sections, mostly equal-weight.** The genuine answer ("Net vs
  Unprotected", the impact scatter, drawdown comparison) carries no more visual weight
  than forensic detail (weekday×hour heatmaps, lifecycle flow, OB characteristic).
- **The answer is gated and conditional:** the Exact Backtest table only shows with
  `hasExactProtection`; otherwise the user is left with directional estimates (A–D) and
  no clear standing.
- **Estimates and exacts are interleaved**, so "is this number real or directional?"
  takes constant attention even though the ConfidenceTag is present.
- **Duplicate-ish framings of the same answer:** "Net vs Unprotected" (table),
  "Improved/Reduced by defense" (scatter), DrawdownComparison, and ProtectionModeMatrix
  all express *how each mode compares to baseline* in different forms — not wrong, but
  unranked and unsynthesised.
- **Meta-research buried in the decision flow:** "Protection Research Queue", "Protection
  Research Queue · Data Required", and the "Hypothesis Workbench" sit inside the decision
  sections; they're backlog/notes, not decisions.

**Per-panel classification:**

| Panel / element | Class |
|---|---|
| (none today) headline "is protection helping + which mode" | **Verdict — missing, must add** |
| Exact Protection Backtest Results (Net vs Unprotected, Max DD, Winner Cost, Loss R Saved) | **Primary evidence** |
| ProtectionImpactScatter (improved/reduced by defense) | **Primary evidence** |
| DrawdownComparison | **Primary evidence** |
| ProtectionModeMatrix | Primary/secondary (mode comparison) |
| A · Unprotected Baseline | Primary evidence (the reference) |
| B · Break-Even Escape / C · Immediate Exit / D · Penetration Defense (estimates) | **Secondary evidence** (directional) |
| EquityCurveOverlay, RDistributionHistogram, PenetrationSensitivity | Secondary evidence |
| Loss Analytics (Weekday×Hour, Close-Confirmed, Session Breakdown), Origin×Invalidation matrix | **Supporting detail** (forensics) |
| StreakVisualiser, TriggerTimeHistogram, ObCharacteristicBreakdown, TradeLifecycleFlow | Supporting detail |
| PairedTradeTable + TradeDrilldownDrawer | Supporting detail (deep dive) |
| Data Quality Coverage | Supporting detail (keep, collapsible) |
| Research Confidence legend | Supporting detail (fold into verdict's confidence) |
| Protection Research Queue / · Data Required / Hypothesis Workbench | **Candidate for relocation** (demote to a research/notes zone; do not delete) |

## 5. Decision-support findings — the ideal decision model

The page should produce, **per protection mode** plus one **headline**, a verdict with a
confidence qualifier:

- **Helping** — improves Net R and/or cuts drawdown without excessive winner cost.
- **Neutral** — negligible net change vs unprotected.
- **Hurting** — cuts more winners than losses saved; lower Net R.
- **Estimate only** — directional (research estimate, not exact) — *validate before
  acting*.
- **Needs data** — required exporter fields missing (e.g. `ob_fully_breached`,
  intratrade return-to-entry).

**Headline:** *"Best protection: <mode> — +X.XR vs unprotected, −Y.Y drawdown · exact"*,
or *"No protection mode beats unprotected — trade unprotected."* Each verdict carries a
**recommended action** (Use it / Validate with exact backtest / Keep unprotected / Gather
data) and inherits the **confidence** so a directional estimate never reads as "use it."
All of this is derivable from data already computed (`exactProtectionRows.netVsBaseline`,
`maxDD`, `winnersCut`, `loserRSaved`, and the estimate panels) — **no analytics change**.

## 6. Explainability findings (identify only — no tooltips yet)

- **FFT / Ghost** — Tier-3 cards; glossary keys already exist (`fft`, `ghost`).
- **Protection-layer terms (need definition):** hard invalidation, OB penetration /
  penetration threshold, break-even escape, immediate hard-invalidation exit, "defense
  exits", "winner cost / winners cut", "loss R saved", "Net vs Unprotected", "protection
  mode", intratrade return-to-entry, "close-confirmed invalidation".
- **Confidence terms:** what makes a result *exact* vs *research estimate* vs *requires
  data* — this is the page's backbone and is currently explained only in one dense
  warning paragraph.
- **Stats (Tier-2, keys mostly exist):** Net R, Max DD, Expectancy, WR.
- **Forensic terms:** "Origin Session × Invalidation Session", "OB risk characteristic".

## 7. Readability findings

- `ProtectionLab.jsx`: ~30 `text-muted-lab` (dim 52%) and ~11 ≤9.5px instances; the
  A–D metric grids use `text-[10px] uppercase text-muted-lab` labels — dim and small.
- The **Exact Backtest table has 12 columns** — dense, horizontal-scroll, no visual
  anchor on the decision column ("Net vs Unprotected").
- Section dividers are good and should stay; the problem is *within-panel* density.
- **Recommendations:** brighten dim labels to `--text-2`/`--text`; enlarge key numbers;
  make "Net vs Unprotected" the visually dominant column (or pull it into the verdict);
  ensure confidence tags read clearly at a glance.

## 8. Proposed verdict-first structure

```
Protection Lab — Is protection helping, and which mode should I use?

ZONE 0 · VERDICT (hero)
  "Best protection: Break-even escape  +3.4R vs unprotected · −2.1 drawdown"
  [confidence: EXACT]      Do next → Use it on this strategy
  (or: "No mode beats unprotected — trade unprotected")

ZONE A · PROTECTION MODES — ranked (all modes, click to inspect)
  MODE                  VERDICT     Δ NET R   Δ DRAWDOWN   WINNER COST   CONFIDENCE
  Break-even escape     Helping     +3.4R     −2.1         low           exact
  Immediate exit        Neutral     +0.3R     −0.4         low           estimate
  Penetration ≥75%      Hurting     −1.8R     −0.2         high          estimate
  Unprotected (ref)     —           —         —            —             exact

ZONE B · INSPECTING: <mode>   (the selected mode's detail)
  equity overlay · impact scatter · drawdown comparison · R distribution

ZONE C · FORENSICS  (collapsed/secondary)
  loss analytics (weekday×hour, close-confirmed, session) · OB risk · lifecycle · paired-trade audit

ZONE D · RESEARCH & WORKBENCH  (demoted)
  data-quality coverage · research queue/backlog · hypothesis workbench
```

This mirrors Robustness Lab (verdict → ranked comparison → selected-mode deep dive →
supporting detail) and folds the existing confidence system into the verdict.

## 9. Recommended implementation sequence

1. **Verify-and-clarify pass (low risk):** confirm the estimate caveats are accurate and
   the "Net vs Unprotected" sign/columns are right (the Robustness audit found a
   caption-vs-formula bug — check for the analog here before building on top). Read-only.
2. **Verdict hero + Zone A mode-ranking table** (decision support) from existing
   computed rows — the highest-impact change. No analytics edits.
3. **Scope separation** into Zones A–D (IA); demote research queue/hypothesis workbench.
4. **Readability pass** (local): brighten dim text, anchor the decision column, enlarge
   key numbers.
5. **Explainability (Tier-3 cards) last**, on the now-structured page, reusing
   `fft`/`ghost` keys and adding protection-layer + confidence terms.

## 10. Risks and ownership conflicts

- **Ownership:** `pages/ProtectionLab.jsx` and `components/lab/protection/*` are **not
  claimed** by any active workstream in `WORKSTREAMS.md` — safe to clean.
- **Data dependency:** it *consumes* FFT/Ghost/paired data owned by the **Entry/FFT/
  Paired-Runs** stream (`protectionTradesByMode`, `pairedTradesData`, `breachTimestamps`,
  `exactProtectionRows`). A presentation-only pass **writes none of that** → low cross-
  stream risk, but coordinate if those shapes change.
- **Graceful degradation:** much of the answer depends on exact exporter data
  (`hasExactProtection`) and on fields like `ob_fully_breached`. The verdict must degrade
  to "Estimate only" / "Needs data" rather than implying a confident recommendation —
  the existing ConfidenceTag system is the right backbone to lean on.
- **Size:** ~1900-line page + three sizable components (865 / 706 / 252) — a meaningful
  but contained effort; keep it presentation-only and scoped to the protection surface.

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
