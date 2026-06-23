# FX-OB Page Cleanup — Priority Audit

**Mode:** AUDIT ONLY — nothing implemented, no code, no analytics touched.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Goal:** decide which page to clean up next after Robustness Lab (verdict-first +
readability + decision-support is now the house pattern).

## Method

Signals gathered per page (presentation only): line count, `<NeonPanel>` count
(equal-weight-panel pressure), `text-muted-lab` count (dim 52% body text), tiny-text
count (≤9.5px), `TermTip` wiring (explainability), tab structure, and decision-support
posture (does a verdict/summary exist). Cross-referenced against `docs/ai/WORKSTREAMS.md`
to flag pages owned by **active parallel workstreams** (which we should avoid).

| Page | Lines | Panels | dim(muted) | tiny ≤9.5px | TermTip | Workstream-owned? |
|---|---|---|---|---|---|---|
| Run Detail | 5356 | 13 | 122 | 116 | 31 | partial (Classification = Claude; rest shared) |
| Protection Lab | 1903 | 15 | 30 | 11 | 0 | **no** |
| Order Block Lab | 2350 | 13 | 33 | 10 | 0 | partial (hosts Retest/Promotion tabs) |
| Failures Lab (17 files) | 3346 | many | heavy | heavy | 0 | **no** |
| Session Lab (workspace+drill+V1) | ~5300 | 13+ | heavy | heavy | 0 | **yes (active)** |
| Strategy Map | 2381 | 2 (canvas) | 0 | 7 | 0 | **yes (active)** |
| Entries Lab (36 files) | 7243 | many | — | — | 0 | **yes (active)** |
| Hypothesis Lab | 1051 | 0* | 23 | 8 | 0 | no |
| Comparison Lab | 1027 | 5 | 18 | 6 | 0 | no |
| Promotion Desk | 222 | 2 | 8 | 6 | 0 | **yes (entries)** |
| Sweep Lab | 273 | 7 | 9 | 0 | 0 | no |
| Walk-Forward Lab | 265 | 4 | 6 | 0 | 0 | no |

*Hypothesis Lab uses custom panels, not `NeonPanel`.

---

## Per-page assessment (ranked by cleanup priority)

### 1. Protection Lab — **recommended first target**
- **Current problem:** **15 equal-weight panels** ("Protection Decision Matrix",
  "Protection Hypothesis Workbench", "Drawdown Defense Comparison", "OB Penetration
  Defense Sensitivity", "Prevention Rule Analysis", "False Loser Detection", "Severity
  Distribution"…) with no verdict-first answer to the page's actual question: *does
  protection help or hurt, and should I turn it on?* Heavy jargon (FFT, Ghost,
  protection layers, "decision matrix") with zero `TermTip` wiring. Decision-support
  concepts exist but are scattered, not synthesised.
- **Severity:** **High**
- **Cleanup type:** IA restructure + decision-support pass + readability + explainability
- **Recommended next action:** apply the Robustness-Lab playbook — a verdict-first
  hero ("Protection is helping / hurting / neutral" + the net-R impact + recommended
  action), then group the 15 panels into ≤4 evidence clusters; brighten dim/tiny text;
  reuse the `fft`/`ghost` glossary keys via TermTip for the labels.
- **Files likely involved:** `pages/ProtectionLab.jsx`, `components/lab/protection/*`
  (`ProtectionVisualAnalytics`, `ProtectionPowerTools`, `ProtectionDataQualityPanel`,
  `ProtectionSectionDivider`). `protectionAnalytics.js` read-only.
- **Risk:** **Medium** — large file, and it *reads* FFT/ghost data owned by the Entry
  workstream, but a presentation-only pass writes none of that, so no cross-stream edits.

### 2. Failures Lab
- **Current problem:** the heaviest **explainability** debt in the app — "Archetype
  Fingerprints", "DNA & Archetypes", "Dominant Archetype per Session", "Entry Toxicity
  Map", "Severity Distribution", "Loss Burst Detection" — metaphor-dense labels a new
  user can't decode, spread across 17 files / 3346 lines. Asks a clear, valuable
  question ("why do trades fail?") but buries the answer.
- **Severity:** **Medium-High**
- **Cleanup type:** explainability pass + IA grouping + readability
- **Recommended next action:** define "Archetype"/"DNA"/"Toxicity" in plain language
  (glossary + a short "how to read this" on the heatmaps), lead with the
  `FailuresOverview`, and group the rest as supporting detail.
- **Files likely involved:** `pages/FailuresLab.jsx`, `components/lab/failures/*`
  (`FailuresWorkspace`, `FailuresOverview`, `FailureDNA`, `ArchetypeRadarPanel`,
  `HeatmapPanels`, `SessionFailures`).
- **Risk:** **Medium** — many files but self-contained and unclaimed.

### 3. Order Block Lab
- **Current problem:** the central OB research **hub** (high traffic), a 6-tab shell
  with 13 panels and moderate readability debt. No single "what am I looking at / what's
  the takeaway" anchor per tab.
- **Severity:** **Medium-High** (driven mostly by product value)
- **Cleanup type:** readability pass + light IA (tab-level intros / takeaways); the
  shared `CanonicalBucketTable` it uses already got tooltips in Phase 1.
- **Recommended next action:** scope to the **shell + OB-stats/overview tabs** only;
  add per-tab one-line "what this answers" headers; brighten dim text.
- **Files likely involved:** `pages/OrderBlockLab.jsx`, `components/lab/OBLabTabShell.jsx`.
- **Risk:** **Medium-High** — the shell hosts the **Retest** and **Promotion** tabs,
  which are owned by active workstreams; touch only the unclaimed tabs.

### 4. Run Detail — highest value, **defer or scope narrowly**
- **Current problem:** the main run workspace and the worst raw readability debt (122
  dim, 116 tiny-text occurrences) — but the Classification tab is already done (31
  TermTip). The non-Classification areas (results tables, OB stats, temporal panels) are
  dense and dim.
- **Severity:** **High** (value + debt)
- **Cleanup type:** readability pass (the KPI-modal decision-support pattern already
  exists and is good)
- **Recommended next action:** **do not** take the whole 5356-line file at once. If
  prioritised, carve a single contained sub-section (e.g., the results/ledger tables or
  the temporal panels) as a self-contained pass.
- **Files likely involved:** `pages/RunDetail.jsx`, `MetricChip`, `DataTable`.
- **Risk:** **High** — file is shared and **churns heavily** (it grew ~390 lines from
  parallel agents during this very session) and the Classification slice is Claude's own
  active workstream. High merge-conflict exposure.

### 5. Hypothesis Lab
- **Current problem:** decision-oriented ("Promote to Exact Backtest") but custom panels
  with dim/tiny text and no consistent hierarchy.
- **Severity:** Medium · **Cleanup:** readability + light decision-support
- **Action:** brighten text, make the promote step the clear endpoint.
- **Files:** `pages/HypothesisLab.jsx` · **Risk:** Low-Medium (unclaimed).

### 6. Comparison Lab
- **Current problem:** cross-run comparison, 5 panels, moderate dim text; the "which run
  wins" takeaway isn't surfaced.
- **Severity:** Medium · **Cleanup:** readability + light decision-support
- **Files:** `pages/ComparisonLab.jsx`, `TableCompareShell.jsx` · **Risk:** Low.

### 7. Sweep Lab / 8. Walk-Forward Lab
- **Current problem:** small (≤273 lines), niche; minor readability only. Low traffic.
- **Severity:** **Low** · **Cleanup:** visual polish only
- **Files:** `pages/SweepLab.jsx`, `pages/WalkForwardLab.jsx` · **Risk:** Low.

---

## Pages to avoid for now (active parallel workstreams)

Per `WORKSTREAMS.md`, these are owned by other in-flight streams — cleaning them risks
colliding with active work. Do **not** start here:

- **Strategy Map** — active; owns `pages/StrategyMap.jsx`, `pages/strategyMap/*`,
  `CandleChart.jsx`. Also canvas-heavy (different cleanup discipline).
- **Session Lab** — active; owns `pages/SessionLabV1/*`. (Also note the legacy
  `pages/SessionLab.jsx` stub vs V1 is an IA wrinkle, but it's their call.)
- **Entries Lab remaining tabs** & **Promotion Desk** — active Entry/FFT/Paired-Runs
  stream owns `components/lab/entries/*`.
- **OB Retest tab** (inside Order Block Lab) — active; owns `components/lab/retest/*`.
- **Master Controls** — active (Phase 7A); owns `components/masterControls/*`.
- **Run Detail** — not off-limits, but treat as high-churn/shared: scope narrowly and
  expect conflicts.

---

## Final recommendation

**Top 3 to clean up next:**
1. **Protection Lab** — worst IA (15 equal panels), high-value decision question, heavy
   jargon, and **unclaimed**. The Robustness-Lab verdict-first + readability pattern
   transfers almost 1:1.
2. **Failures Lab** — heaviest explainability debt, self-contained, unclaimed, real
   research value.
3. **Order Block Lab** — highest day-to-day traffic; clean the shell + unclaimed tabs
   (avoid the Retest/Promotion tabs).

**Why each matters:** Protection and OB Lab are *decision* surfaces a trader returns to
constantly; Failures Lab is where losing patterns get understood — all three currently
make the user hunt. Robustness Lab proved the pattern (verdict/answer first, evidence
second, readable throughout); Protection Lab is the closest analog and the safest
high-value move.

**Recommended first implementation target: Protection Lab.** It has the clearest single
question ("is protection helping — should I use it?"), the worst panel-sprawl, and no
parallel-workstream ownership, so a verdict-first + readability + explainability pass can
land cleanly and reuse the `fft`/`ghost` glossary keys already created.

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
