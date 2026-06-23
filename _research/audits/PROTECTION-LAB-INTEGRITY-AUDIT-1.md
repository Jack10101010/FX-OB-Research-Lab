# Protection Lab — Integrity Audit

**Mode:** AUDIT ONLY — nothing implemented, no code, no analytics touched.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Question:** are Protection Lab's data, labels, signs, and confidence indicators
trustworthy enough to build a verdict-first experience on top of?

## Bottom line

**Conditionally yes — but not as-is.** A verdict can be built, but only on the **exact**
rows, with five guardrails. The single biggest risk is that **research-estimate "R
saved" is a systematically optimistic upper bound** and must never be ranked against
exact `netVsBaseline`, plus a **label/metric mismatch** ("Winner Cost" is a trade count,
not an R cost) and an **unverified drawdown sign convention**. None require an analytics
rewrite; they require gating, relabeling, and one verification.

## 1. Files read

`pages/ProtectionLab.jsx` (ConfidenceTag, `buildExactProtectionRows`,
`exactProtectionRow`, `DeltaVsBaseline`, `buildProtection`, penetration thresholds),
`components/lab/protection/protectionAnalytics.js` (`calcEfficiencyRatio`,
`calcRobustnessScore`, `buildPenetrationSweep`, `buildTradeLifecycleFlow`,
`buildEquityCurveOverlayData`, `buildPairedTrades`, `buildDataQuality`,
`buildDrawdownCurves`), `ProtectionVisualAnalytics.jsx`, `ProtectionPowerTools.jsx`
(`ProtectionModeMatrix`), `ProtectionDataQualityPanel.jsx`. Trade-mode ingestion in
`data/importer.js` (referenced).

## 2. Confidence-system findings

- **Confidence tags are mostly static, author-asserted — not data-derived.**
  `ConfidenceTag` (ProtectionLab.jsx:558) is a fixed map (`exact`→EXACT,
  `estimated`→RESEARCH ESTIMATE, `requires`→DATA REQUIRED). Levels are **hardcoded per
  panel** (`level="exact"`, `level="estimated"`…). Only two are dynamic: the Invalidation
  Session Breakdown (`level={bt.hasBaselineCloseFields ? "exact" : "estimated"}`) and the
  exact table, gated on `hasExactProtection`.
- **Defensible today, unsafe to inherit.** The static tags are reasonable (the baseline
  *is* exact; the A–D models *are* estimates by construction), so nothing is actively
  lying. **But** a verdict must derive confidence from **actual data presence**
  (`hasExactProtection`, per-field coverage), not from a panel's hardcoded label.
- **No single "is the evidence exact or estimate?" signal** feeds a conclusion — the user
  must read each panel's tag.

## 3. Metric-verification findings

**Correct (verified):**
- `DeltaVsBaseline` (ProtectionLab.jsx:727): `netVsBaseline ≥ 0` → green, `< 0` → red.
  Sign and color are right (positive = protected earned more R = good).
- `calcEfficiencyRatio` (protectionAnalytics.js:600): `loserRSaved / |winnerRCost|`, `>1`
  = saves more than it costs. Direction correct.
- Baseline `_maxDD` / `maxDrawdownR`: returns ≤ 0 (drawdown as a negative). Internally
  consistent.

**Problems:**
- **"Winner Cost" is a COUNT, not an R amount (label/metric mismatch).** The exact table
  (ProtectionLab.jsx:263) renders `winnersCut` via `fmtCount` under the label **"Winner
  Cost"**, and `winnersCut` is sourced from `baseline_winners_cut` / `winning_trades_cut`
  (line 1183) — i.e. *number of winning trades cut*. Meanwhile `calcEfficiencyRatio`
  computes a **different** winner cost in R (`netVsBaseline − loserRSaved`). So there are
  two "winner cost" concepts that can diverge, and the visible one is a count wearing an
  R-sounding label. A verdict claiming "controlled winner cost" must use the R figure,
  not this count. *(This is the Robustness-Lab caption-vs-formula problem, in a new form.)*
- **Drawdown sign convention is unverified across sources.** Exact-row `maxDD` comes from
  the exporter (`max_drawdown` / `max_dd`, line 1176) with **no sign normalization**;
  baseline `maxDD` comes from `maxDrawdownR` (negative). `calcRobustnessScore`
  (protectionAnalytics.js:625) does `improvement = row.maxDD − baselineMaxDD` and treats
  positive as better. **If the exporter reports drawdown as a positive magnitude**, this
  subtraction is nonsense (e.g. `3.5 − (−3.5) = +7` → always "better"). Must confirm the
  exporter's sign before any verdict uses drawdown improvement.
- **`winnersCut` / `loserRSaved` are optional with no fallback.** In `exactProtectionRow`
  (1183–1184) both are pure `firstNumber(summary, …)` lookups — if the exporter omits
  them they're `undefined` → render "—", and `calcEfficiencyRatio` returns `null`. By
  contrast `netVsBaseline` has a fallback (`netR − baselineNetR`, line 1142), so it's
  almost always present. **Net result:** a mode can show a confident "Net vs Unprotected"
  while its winner-cost / loss-saved breakdown is silently blank — the verdict's
  efficiency dimension is unavailable exactly when those fields are missing.
- **`netVsBaseline` vs `loserRSaved` source mixing.** `calcEfficiencyRatio` does
  `winnerRCost = netVsBaseline − loserRSaved`, an accounting identity only if both come
  from the *same* backtest basis. If `netVsBaseline` is the UI fallback (`netR −
  baselineNetR`) while `loserRSaved` is exporter-provided, the reconstructed winner cost
  can be inconsistent. Verify they share a source before trusting efficiency.

## 4. Ranking-integrity findings

- **Estimate "R saved" is an optimistic upper bound — not comparable to exact.** Panels
  B/C/D estimate savings by **capping losers at 0R** ("if all return to entry"), and
  `buildPenetrationSweep` (protectionAnalytics.js:478) credits saved loss R but **never
  subtracts winner R** for trades that also cross the threshold (`affectedWinners` is
  counted, never debited). So `projectedNet` / `deltaVsBaseline` from the sweep, and the
  A–D "R saved", are **systematically too good**. **If a verdict mixes these with exact
  `netVsBaseline`, estimate-only modes will appear superior to exact ones.** This is the
  primary ranking blocker.
- **`isBest` is naive (max netR only).** `buildExactProtectionRows` (1146–1149) flags the
  highest-`netR` mode as `isBest`, ignoring drawdown, winner cost, sample size, and
  confidence. A verdict must not equate "highest Net R" with "use it."
- **Two robustness scores exist.** `protectionAnalytics.calcRobustnessScore` (a protection
  composite: netΔ ±40, ddΔ ±20, efficiency −10..+15, sample −15..0) is **different** from
  the Robustness-Lab score of the same name. It's used by `ProtectionModeMatrix`. A
  verdict should pick one explicitly and not conflate them. Its ddΔ term inherits the
  sign-convention risk above; its efficiency term silently becomes neutral (0) when the
  breakdown fields are missing.

## 5. Data-quality findings

- **The coverage check is effectively a no-op for numeric fields.** In `buildDataQuality`
  (protectionAnalytics.js:166) the numeric branch tests `Number.isFinite(Number(v) || 0)
  !== false`, which is **always true** for any non-empty value (`Number("abc") || 0 = 0`,
  finite). So numeric fields count *any* non-empty value as "present," even non-numeric
  junk — coverage % can be **overstated**. This is the panel that's supposed to tell the
  user whether their data is trustworthy, so the overstatement is self-undermining.
- **Index-aligned pairing in visual panels can contradict the exact table.**
  `buildTradeLifecycleFlow` and `buildEquityCurveOverlayData` pair baseline↔protected by
  **array index** (`list[i]` / `protectedTrades[i]`), whereas `buildPairedTrades` uses
  **ID-based** pairing when ≥50% of IDs match. If the protected array isn't index-aligned
  with baseline, the lifecycle flow's `winnersCut` / `savedFromLoss` and the equity
  overlay are mis-attributed — and can **disagree** with the exporter-sourced `winnersCut`
  in the exact table.
- **Graceful-degradation gap:** much of the answer requires exporter fields
  (`ob_fully_breached`, `max_ob_penetration_pct`, `close_confirmed_ob_breach`, intratrade
  return-to-entry). The page discloses these per-panel, but there's no single rollup of
  "can we even answer the verdict at the required confidence?"

## 6. Contradictions discovered

1. **"Winner Cost" (count) vs efficiency-ratio winner cost (R)** — same name, two
   different quantities (§3).
2. **Exact-table `winnersCut` (exporter) vs lifecycle-flow `winnersCut` (index-paired)** —
   can produce different numbers for the same model (§5).
3. **Estimate "R saved" (optimistic, winner-cost-ignored) vs exact `netVsBaseline`
   (real net)** — not on the same scale, yet both read as "benefit" (§4).

## 7. Blockers before verdict-first implementation

Must resolve (or explicitly guard) before a verdict can be trusted:

1. **Quarantine estimates from the ranked verdict.** Rank **exact rows only**; show A–D /
   penetration sweep as *directional context* clearly marked "optimistic upper bound."
   (Highest priority.)
2. **Verify the exporter drawdown sign** (`max_drawdown`) against baseline `maxDrawdownR`;
   normalize before any drawdown-improvement claim.
3. **Relabel "Winner Cost"** to "Winners cut" (count) and, if the verdict needs a winner
   cost, use the R figure (`netVsBaseline − loserRSaved`) with a distinct label.
4. **Gate winner-cost / efficiency claims** on the presence of `baseline_winners_cut` /
   `loser_r_saved`; when absent, the verdict says "winner cost unknown," not "controlled."
5. **Derive verdict confidence from data** (`hasExactProtection` + field coverage), not
   from the static `ConfidenceTag` labels; never recommend "use it" off an estimate.

Should fix (lower severity, not strict blockers):
6. Fix the `buildDataQuality` numeric no-op so coverage isn't overstated.
7. Make the visual panels (lifecycle, equity overlay) use the same ID-based pairing as
   `buildPairedTrades`, or label them "index-aligned (approximate)."
8. Replace/augment naive `isBest` with the real verdict logic.

## Conclusion

Protection Lab is **trustworthy enough to support a verdict-first experience *with the
five guardrails above*** — chiefly: rank exact rows only, keep estimates as marked
directional context, verify the drawdown sign, fix the "Winner Cost" label, and derive
confidence from data. These are presentation/guardrail changes, not analytics rewrites.
Building a verdict on the *current* surface as-is (mixing estimates with exacts, trusting
static confidence tags, treating the "Winner Cost" count as an R cost) **would be
misleading** — the same class of foundation bug the Robustness-Lab integrity pass caught,
which is exactly why this step was sequenced first.

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
