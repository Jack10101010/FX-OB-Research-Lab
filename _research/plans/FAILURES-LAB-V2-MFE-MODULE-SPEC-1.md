# Failures Lab V2 — Distance Before Stop (MFE) Module · Spec

**Mode:** SPEC ONLY — nothing implemented.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Prereq done:** excursion field-detection fix (V2 Phase 0) — `mfeR`/`maeR`/`rIfNoTarget`
are now correctly detected.

## Core question
> "Before these losing trades stopped out, how far did they move in my favor?"
> — i.e. which losers *almost worked* (break-even / partials candidates) vs which
> *failed instantly* (BE would not have helped).

---

## Phase A — Data audit (verified, not assumed)

| Field | Source (importer) | Scale / meaning | Notes |
|---|---|---|---|
| **`mfeR`** (`mfe_r`) | `importer.js:402` | **R units, stop-anchored** (1.0R = the full risk/stop distance reached in favor) | Confirmed via `rrRescore.js` (`mfe >= newRR`, compared to an RR multiple). For a loser, `0 ≤ mfeR < targetRR` (if it had reached the target it would have won). |
| **`maeR`** (`mae_r`) | `importer.js:404` | R units, max adverse excursion (heat taken) | Secondary — "how much heat before failing." |
| **`rIfNoTarget`** | `importer.js:406` | R with the target removed (bounded by stop/end-of-data) | This is the **RR-lens** field (powers Master-Controls RR preview). Secondary for BE — answers "would a bigger TP have worked," not "did it move enough for BE." |
| **`minutes_to_exit`** | `importer.js:420` | minutes (time-to-failure) | Pairs with MFE: fast-fail vs slow-bleed. |
| **target RR** | per-trade **`rr_config`** → run **`rr`** fallback (`rr_multiple`/`risk_reward`, `importer.js:1347`) | RR multiple (e.g. 2 = TP at 2R) | `tp` is a **price**, not an R multiple — don't use it directly. |

**Answers to the four Phase-A questions:**
1. **Scale:** `mfeR`/`maeR`/`rIfNoTarget` are all in **R units**.
2. **Is mfeR in R?** Yes — stop-anchored R.
3. **Can target distance be inferred?** Yes — `targetRR = rr_config ?? run.rr` (when > 0).
4. **Raw R or % of target RR?** **Primary = % of target RR** (`mfeR / targetRR`) — the
   normalized "reached X% of TP" the brief wants, comparable across RR settings. **Fallback
   = raw R buckets** when `targetRR` is missing/0 — and raw R is itself directly BE-actionable
   ("arm BE at +0.5R"). The module must gate on `mfeR` present **and** choose the metric per
   data availability, showing which it used.

---

## Phase B — Research design

Operates on **losers that carry `mfeR`** (gated via the now-fixed `isModuleAvailable("excursion", trades)`).

**Computed answers:**
1. **Never moved in favor** — share of losers with `mfeR ≈ 0` (≤ a small epsilon, e.g. 0.02R).
2. **% reached buckets** — distribution across the % bands below.
3. **BE opportunity** — per candidate arm level L, the losers with `mfeR ≥ L` (they would
   have *armed* a break-even) and the loss-R they represent. **See the guardrail in Phase E
   — this is an optimistic UPPER BOUND.**
4. **Which setups justify BE** — breakdown of "% of losers reaching ≥ a meaningful level"
   (e.g. ≥50% of TP) by setup.
5. **Which setups fail immediately** — high never-moved / <10% share by setup → BE-hostile.

**Buckets (primary, % of target RR):** `Never (≈0) · <10% · 10–25% · 25–50% · 50–75% ·
75–90% · 90%+`. These match the brief. *Data-driven adjustment:* if a run shows almost all
losers in `Never`/`<10%` (common for clean-stop systems), collapse the upper bands into
`50%+` to avoid empty bins; if losers cluster near the target, split `90%+` into `90–99%` vs
`reached-then-reversed`. Keep band edges configurable, default to the brief's.

**Raw-R secondary view:** `Never · <0.25R · 0.25–0.5R · 0.5–1R · ≥1R` — the literal BE arm
levels a trader sets.

---

## Phase C — Dimensions to break down by

**Recommended first set (highest BE-research value, all Tier-0 / available, low sparsity):**
**Structure (BOS/CHoCH) · Direction (Long/Short) · Session.** BE behaviour diverges most
along structure×direction, and these are dense enough to survive sample gating.

**Defer to v2+ (in priority order):** Archetype · OB Penetration bucket · Stopout time
(`minutes_to_exit`) · Entry Model · OB size · Hour/Weekday · FFT/Ghost. Reason: each extra
split multiplies cells and thins samples — add them one at a time behind the gate, not all
at once.

---

## Phase D — Output design (best first version)

**v1 (minimal, highest value):**
1. **MFE bucket distribution** — the % reached histogram across all losers, with each bar
   labelled count + **% of total loss-R** (damage, not just count). The `Never`/`<10%` bars
   are visually flagged "instant failures" and the `75–90%`/`90%+` bars "almost worked."
2. **BE opportunity table** — rows = candidate arm levels (e.g. 25% / 50% / 75% of TP, or
   0.25R/0.5R/1R), columns = losers that reached it (n, % of losers), **loss-R potentially
   saved (upper bound)**, and a confidence/sample chip. Topped by the **winner-cost caveat
   banner** (Phase E).

That single screen answers all five research questions. **Defer** the per-setup breakdown
(v2), the maeR heat overlay (v3), and any auto BE-rule suggestion. The only "action" in v1
is **Promote to HypothesisLab** (reuse `failuresExporter`) — a BE level becomes a hypothesis
to validate with an exact backtest, never an applied rule.

"Almost worked" and "instant failure" are presented as **highlighted bins**, not separate
tables, to keep v1 a single scannable surface.

---

## Phase E — Statistical guardrails (the integrity core)

- **THE headline caveat — BE opportunity is an OPTIMISTIC UPPER BOUND.** We have `mfeR`
  (the *peak* favorable excursion), **not the post-peak path.** So we can say a loser
  *reached* level L and *could* have armed BE — but we **cannot** model: (a) whether price
  then retraced to entry to actually trigger the BE exit, nor (b) the **winner cost** (BE
  arming would also cut winners that retraced after arming). A losers-only "saved R" figure
  therefore **overstates** BE benefit. This is the exact estimate-vs-exact trap the
  Protection audit caught — frame it identically: *"upper bound; winner cost and post-arm
  path not modeled — validate with an exact BE backtest."* Never present it as realized R.
- **Minimum sample** (n ≥ ~10–20 losers) before any bucket/level is "actionable"; thinner →
  greyed "insufficient (n=…)".
- **Rank/headline by contribution** (% of total loss-R), not bucket count.
- **Coverage gate:** show "MFE present on X% of losers"; if coverage < threshold, the module
  degrades to a "needs MFE export / partial data" state rather than implying completeness.
- **Clamp % to [0,100]**; handle the rare `mfeR ≥ targetRR` loser (non-stop exit, e.g.
  news-flatten) as a flagged edge, not silently.
- **targetRR transparency:** display whether % is computed from per-trade `rr_config` or the
  run-level `rr` fallback (and fall back to raw-R buckets when neither is usable).
- **In-sample framing** on every surfaced level; promotion required to act.

---

## Phase F — Implementation plan

1. **Minimal first build:** pure analytics + one gated UI surface.
   - Pure: `getTargetRR(trade, config)`, `mfePctOfTarget(trade, targetRR)`, `bucketMfePct(pct)`,
     `buildMfeDistribution(losers, {config})`, `buildBeOpportunity(losers, levels, {config})`.
   - UI: a new gated component rendering the bucket histogram + BE table + caveat.
2. **Files likely involved:**
   - New `components/lab/failures/shared/excursionAnalytics.js` (pure; keeps `failuresAnalytics.js`
     from growing past 1,200 lines).
   - New `components/lab/failures/excursion/ExcursionAnalysis.jsx` (the surface).
   - `shared/useFailuresWorkspace.js` — add a `FAILURES_TABS` entry ("Distance to Stop").
   - `FailuresWorkspace.jsx` — render it in the tab switch (it already passes `config`).
   - Reuse `failuresExporter` (promote), `failuresDataQuality.isModuleAvailable("excursion")`
     (gate), `failuresFormatters`. **No analytics-formula changes** to existing modules.
3. **New helper functions:** the five pure fns above — all data-only, no React.
4. **Validation plan:** a `__validation__/excursionAnalytics.validate.mjs` (using the
   Babel-load harness from Phase 0) asserting: bucket-edge assignment; `% = mfeR/targetRR`
   with clamp; never-moved detection at epsilon; per-level loser counts; sample-floor
   exclusion; targetRR per-trade vs run fallback; and that "saved R" is computed as an
   explicit upper bound (winner cost excluded). Plus a coverage-degradation case.
5. **UI placement:** a **dedicated "Distance to Stop" tab** in the failures rail (between
   Streaks and Prevention) — it's a major research surface, and a tab cleanly carries the
   "needs MFE export" empty state when excursion data is absent. (When the Patterns-tab
   consolidation from the UX audit happens, it can live there instead.) Optionally, a one-
   line Command-Center hook later: "X% of loss-R reached ≥50% of TP — BE candidate."
6. **Follow-up phases:** v2 per-setup breakdown (structure/session/direction); v3 maeR heat
   overlay + `minutes_to_exit` fast-fail split; v4 **winner-cost modeling** (requires a
   post-arm path / BE-replay export → an *exact* BE backtest, the only way to remove the
   upper-bound caveat); v5 Command-Center integration.

---

### Bottom line
The data genuinely supports this module now (Phase 0 unblocked detection; `mfeR` + targetRR
are present). The build is small and pure-function-first. The **one thing that must not be
fudged** is the BE-savings framing: with only peak `mfeR` we can compute an honest *upper
bound* on which losers could have armed BE — not realized BE P&L. Ship it as a hypothesis
generator (promote → exact backtest), exactly as Protection's estimates are framed.

*Spec only. No files changed, nothing implemented.*
