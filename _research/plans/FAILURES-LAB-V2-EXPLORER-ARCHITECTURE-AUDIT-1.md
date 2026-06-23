# Failures Lab V2 — Failure Explorer Architecture Audit

**Mode:** AUDIT ONLY — nothing implemented. Architecture / research-design audit.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Evidence base:** `data/importer.js` (per-trade field mapping),
`components/lab/failures/shared/failuresDataQuality.js` (`FIELD_DEPS` tier map),
`failuresUtils.js` (`fieldPresent`), `failuresAnalytics.js`,
`components/masterControls/rrRescore.js` (stop-anchored excursion model), plus the
Failures Lab structure mapped in `FAILURES-LAB-UX-AUDIT-1.md`.

## Executive position (be critical, up front)

Two things are true at once:

1. **The platform already has the bones of a professional research engine.** There is a
   **tiered field-dependency system** (`FIELD_DEPS`, Tier 0–4) that classifies every
   dimension by data availability and gates modules on it; a global cohort filter; and —
   crucially — the **excursion fields the priority dimension needs already exist in the
   data** (`mfeR`, `maeR`, `rIfNoTarget`, `minutes_to_exit`, mapped by `importer.js`).
2. **The flashiest ideas in the brief are the weakest.** Deep N-way combination mining and
   the Failure Waterfall are, as specified, **statistical-noise generators** — they will
   reliably surface spurious "killer combinations" via the multiple-comparisons trap and
   path-dependent cherry-picking. The single most valuable feature (MFE distance-before-
   stop) is the *least* flashy and is currently **invisible due to a field-name bug**.

The right build is a **contribution-ranked, sample-gated, lift-aware** explorer that leads
with the MFE excursion dimension — not a combinatorial slicer.

---

## 0. Blocking data finding (fix before anything else)

**Field-name mismatch — MFE/MAE are present but reported absent.** `importer.js` maps the
excursion fields as **`mfeR`/`mfe_r`, `maeR`/`mae_r`, `rIfNoTarget`/`r_if_no_target`**
(lines 402–408). But `failuresDataQuality.FIELD_DEPS` checks the keys **`mfe`/`mae`**
(lines 21–22), and `fieldPresent(trades, "mfe")` reads `t.mfe` — which the importer never
populates. **Net effect: the Failures Lab currently believes MFE/MAE are absent even when
they're present**, so the entire "excursion / archetypes_full / replay" tier is dark on
runs that actually carry the data. This is the single highest-leverage fix on the page and
a prerequisite for the priority dimension.

---

## 1. Which ideas are strongest (and which to challenge)

**Strong — build these:**
- **MFE "Distance Before Stop" buckets** — *the* priority. Directly informs break-even,
  partial-taking, trade-management, and protection research. Data exists (`mfeR` +
  `rIfNoTarget`). No combinatorics risk. Highest research ROI on the page.
- **Single-dimension Failure Drivers, ranked by contribution % of loss-R** — cheap,
  Tier-0, statistically robust (few comparisons), immediately feeds the Command Center.
- **A guided Failure Explorer limited to 1–3 factors** with sample + lift gating — useful
  if disciplined.

**Weak / challenge — do NOT build as specified:**
- **Open N-way combination mining** ("Wednesday + NY + Short + CHOCH"): with ~10 candidate
  dimensions of cardinality 3–7, the unconstrained combination space is **tens of
  thousands of cells**. Testing all of them and surfacing the worst guarantees false
  discoveries (see §6, §8). Only *curated/pre-vetted* pairs should be auto-surfaced.
- **Failure Waterfall** (`Total → Short → Short CHOCH → … NY`): visually compelling but
  **methodologically fragile**. It cherry-picks *one* drill path and presents
  path-dependent subsetting as if it were decomposition; a different ordering yields a
  different "story," and each deeper bar is a smaller, noisier sample. Acceptable only as
  an *illustrative view of a user-chosen path* with sample sizes shown — never as an
  automatic "where the damage concentrates" claim.

## 2. What existing data already supports (verified in `importer.js` / `FIELD_DEPS`)

**Available now (Tier 0 — always derivable):** Session, Weekday, Hour (from `entry`/
`fill_time`), Direction, Structure (BOS/CHoCH), OB width/size bucket (`obWidthPips`),
Archetype + Severity (derived in the pipeline), R-magnitude.

**Available now (mapped per-trade, Tier 0/1 depending on run):** OB Penetration bucket
(`max_ob_penetration_pct`), Entry Model (`entry_model_key`), **FFT classification
(`first_failed_tag`)**, **Ghost classification (`ghost_outcome`, `ghost_mae`)**, rich
**News context** (`ob_origin_news_*`, windows, impact), `minutes_to_exit` (time-to-failure
/ stopout-time bucket), `close_confirmed_ob_breach`, `same_candle_exit`.

**Available now, but the priority dimension (Tier 1, present on Phase-11A+ runs):**
**`mfeR`** (peak favorable excursion in R, stop-anchored), **`maeR`** (max adverse
excursion), **`rIfNoTarget`** (realized R with the target removed) — these enable Distance-
Before-Stop, "reached X% of TP then failed," and "would a bigger TP have hit." *(Currently
mis-detected — see §0.)*

## 3. What requires new exports

- **HTF Bias Alignment** — **absent** (no `htf_context`/`htf_bias` field anywhere).
  `FIELD_DEPS` lists `htf_context` as Tier 2. Needs a backtester export.
- **Fill Quality / fill depth** (`fill_depth_pct`) — Tier 2, absent.
- **Sweep present** (`sweep_present`) — Tier 2, absent.
- **OB age in candles** (`ob_age_candles`) — Tier 2, absent.
- **Post-stop continuation R** (`post_stop_continuation_r`) — Tier 1, likely absent;
  needed for true false-loser detection ("would have recovered").
- **Distance-before-stop in pips** (vs in R) — only if pip-precise BE research is wanted;
  R-based `mfeR` covers most needs.

Recommendation: drive a small **exporter wishlist** off `FIELD_DEPS` rather than ad-hoc;
the tier system already encodes the gap.

## 4. Most valuable dimensions (ranked by research ROI)

1. **MFE distance-before-stop (`mfeR` as % of target RR)** — uniquely unlocks break-even /
   partials / protection. Data exists.
2. **Structure × Direction** (the brief's example) — Tier-0, cheap, historically signal-rich.
3. **Archetype** (already classified) and **OB Penetration bucket** — structural failure cause.
4. **Time-to-failure (`minutes_to_exit`)** — fast-stopout vs slow-bleed, pairs with MFE.
5. **`rIfNoTarget`** — "the trade that would've worked at a different RR" (ties into the
   Master-Controls RR lens already built on the same fields).
6. FFT / Ghost classification — protection-relevant, available.

## 5. Additional dimensions worth adding

- **MFE-bucket** (`never moved / <10% / 10–25% / 25–50% / 50–75% / 75–90% / 90%+` of target)
  — the break-even research surface; derive from `mfeR / targetRR`.
- **maeR bucket** ("heat taken before working/failing") — entry-timing quality.
- **R-magnitude bucket** (`<-2R / -2..-1 / -1..0`) — separates catastrophic from routine.
- **`rIfNoTarget` sign** — "would have been a winner with no/larger target."
- **Loss-R contribution rank** as a first-class derived field (Pareto position).

## 6. Risks (the critical section)

- **Combinatorial explosion.** k dimensions of cardinality cᵢ → ∏cᵢ cells. ~10 dims at
  c≈4 ⇒ ~10⁶ theoretical combinations. Even 2-way is hundreds of cells. Cap depth; never
  enumerate blindly.
- **Multiple-comparisons / false discovery (the big one).** Surfacing "the worst combo out
  of thousands" is selection on noise — you *will* find a 100%-loss 4-trade cell in random
  data. Any auto-ranked combination needs a false-discovery correction or a much higher
  effect bar, plus an explicit "many combinations tested" warning.
- **Small-sample cells.** "90% loss rate (n=5)" must never outrank "65% (n=40)". Requires
  sample gating + confidence intervals (the brief's §3 instinct is correct).
- **Loss-rate vs loss-R-contribution confusion.** A high *rate* on tiny trades contributes
  little *damage*. Rank by **share of total loss-R**, show rate as secondary.
- **Lift vs base rate.** A combo at 70% loss rate is meaningless if the *baseline* is 68%.
  Show **lift over baseline**, not raw rate.
- **Simpson's paradox.** Interaction cells can reverse aggregate signals; don't present a
  cell's number without its parent context.
- **Path-dependence (waterfall).** Drill order changes the story; each step shrinks n.
- **In-sample overfitting.** Everything here is in-sample; every "driver" is a hypothesis,
  not a finding — must carry the same in-sample caveat the Prevention engine already uses.
- **Data-tier silent degradation.** Without honest field gating, dimensions built on Tier-1/2
  fields will silently show empty/garbage on older runs (the §0 bug is a live example).

## 7. How to structure the Failure Explorer

Build on what exists; don't reinvent:

- **Dimension registry** keyed off `FIELD_DEPS` — each dimension declares its required
  field(s), tier, bucketing function, and "available?" via `fieldPresent`. Unavailable
  dimensions render disabled with "needs export X," not hidden.
- **Slicer, not miner.** User picks 1–3 active dimensions (hard cap). The grid computes,
  per cell: n, loss count, loss rate **with 95% CI**, net loss-R, **contribution % of total
  loss-R**, and **lift vs baseline loss rate**. Reuse the existing cohort filter as the
  scope.
- **Adequacy gate on every cell:** below a sample floor → greyed "insufficient (n=…)",
  excluded from any ranking. Mirrors the Robustness/Prevention confidence pattern.
- **Default view = single-dimension Failure Drivers** (contribution-ranked) — the robust,
  always-on surface. Two-factor is opt-in. Three-factor is opt-in + a "exploratory, high
  false-discovery risk" banner.
- **Live updating** is fine *computationally* (all client-side over the loaded losers), but
  gate the *ranking/recommendation* output, not the raw table.
- **Promotion bridge:** a vetted driver/combo promotes to HypothesisLab (reuse
  `failuresExporter`) — combinations become hypotheses to test out-of-sample, never
  auto-applied rules.

## 8. Preventing meaningless statistical noise (design rules)

1. **Sample floor** per cell (e.g. n ≥ 10–20) before it can rank or be recommended.
2. **Rank by contribution (loss-R share), not loss rate.**
3. **Show lift over baseline**, not absolute rate; require material lift to flag.
4. **Confidence interval on every rate**; a cell whose CI overlaps the baseline isn't a
   driver.
5. **Multiple-comparisons discipline:** the more combinations explored, the higher the bar
   (or a stated FDR control); always show "N combinations evaluated."
6. **Cap combination depth at 3**, default 1; 2–3 carry exploratory warnings.
7. **In-sample caveat + out-of-sample validation** framing on every surfaced driver
   (consistent with Prevention).
8. **Never auto-promote** a thin or speculative cell; promotion requires clearing the gates.

## 9. Recommended roadmap

- **Phase 0 (prerequisite, tiny):** fix the `mfe`/`mae` vs `mfeR`/`mae_r` field-name
  mismatch in `FIELD_DEPS`/coverage so excursion data is actually detected.
- **Phase 1:** single-dimension **Failure Drivers** table — contribution-ranked, sample-
  gated, lift-aware, Tier-0. Wire its #1 driver into the Command Center.
- **Phase 2:** **MFE Distance-Before-Stop** module (the priority) — bucket losers by
  `mfeR / targetRR`; gated on excursion-field presence; framed for break-even/partials.
- **Phase 3:** **guided 2-factor Explorer** (cap 3) with CI + lift + sample gating + cohort
  reuse + HypothesisLab promotion.
- **Phase 4 (optional):** *curated* combination drivers (a short, pre-vetted pair list,
  e.g. structure×direction), never open mining; Waterfall only as a labelled path view.
- **Parallel:** exporter wishlist for Tier-2 dims (HTF bias, fill quality, sweep, OB age,
  post-stop continuation) — unlocks the higher-value interaction research later.

## 10. What to build first for maximum research value

**The MFE Distance-Before-Stop module — immediately after fixing the field-name bug
(Phase 0).** Justification: the data already exists (`mfeR`/`rIfNoTarget`), it has **no
combinatorial-noise risk**, and it is the only dimension that directly feeds the platform's
stated near-future direction (break-even systems, partial-taking, protection). It also
composes with the Master-Controls RR lens, which already reads the same excursion fields —
so the research compounds.

**Co-first (cheap, robust):** the single-dimension contribution-ranked Failure Drivers
table — it's Tier-0, statistically safe, strengthens the Command Center, and establishes
the contribution/lift/sample-gate vocabulary the Explorer will reuse.

**Explicitly defer:** open N-way combination mining and the auto-Waterfall until the gating
discipline (sample floors, lift, CI, FDR awareness) is in place — otherwise the flagship
"forensic engine" will mostly manufacture convincing noise.

---

### Blind spots flagged
- The excursion data is **present but invisible** (field-name bug) — the team may believe
  break-even research is blocked on exports when it's actually blocked on one string.
- The brief equates "flashy combination explorer" with "professional research"; the
  opposite is true — rigor (gating, contribution, lift, FDR) is what makes it professional.
- Reuse the existing `FIELD_DEPS` tiering and cohort filter; building a parallel system
  would fragment the lab.

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
