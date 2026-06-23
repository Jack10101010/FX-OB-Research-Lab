# Failures Lab V4 — Architecture Audit & Design Review

**Mode:** AUDIT ONLY — no code, no file changes.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Read:** `excursionAnalytics.js` (Distance to Stop / drivers / pairs / drilldown),
`PreventionEngine.jsx` + `computePreventionRules`, `useFailuresWorkspace.js` (cohort
filter / `applyFilter`), `failuresAnalytics.js` (Overview aggregators), `FailuresOverview`,
`failuresRegistry.js`, `failuresDataQuality.js`.

## Executive position

Failures Lab now has the *pieces* of a research engine but **four parallel aggregation
systems** doing the same shape of work, and a **methodological gap that affects every
"driver" surface already shipped**. Before adding the Explorer or evolving drilldowns, the
single highest-leverage move is to **unify on one aggregation engine + dimension registry**
(Phase F) and **fix the over-representation gap** (below). The flashiest proposals — the
5-level drilldown cascade and a standalone OB-Width module — are the weakest; I recommend
*not* building them.

### The headline critique: contribution % ≠ a driver
Every current surface (Top Failure Drivers, Pair Drivers, bucket contribution) ranks by
**loss-R contribution %**. That conflates *volume* with *disproportionate damage*. A group
that is 30% of trades and 30% of loss-R is **average, not a driver** — yet it ranks high.
A true driver loses **more than its share**. The engine must add **lift / over-
representation** (loss-R share ÷ trade share, or the group's loss rate vs the baseline loss
rate) and rank/flag on that, with raw loss-R shown alongside. Without lift, "New York 31%"
might just mean "New York is 31% of my trading." This is the most important fix and it
applies retroactively to what's already shipped.

---

## Phase A — Current capabilities

**Answerable today:** how far losers moved before stopping (raw-R MFE buckets); which
single factor / curated pair contributes the most *loss-R* (drivers/pairs); what's inside a
chosen MFE bucket (drilldown); which prevention rule removes the most net-R (Prevention,
with confidence + FP guardrails); cohort slicing by session/direction/archetype/severity.

**Not answerable today:** whether a factor loses *disproportionately* (no lift — see above);
arbitrary user-chosen A×B attribution (no Explorer); whether a setup *moves enough to
justify BE* per segment (no MFE×dimension); realized BE P&L (by design — upper bound only);
time-to-failure interactions; anything on Tier-2 fields (HTF/sweep/fill — not exported).

**Overlap / duplication (the core problem):**
1. **Overview** — bespoke per-dimension aggregators: `computeSessionFailureRates`,
   `computeDirectionalStats`, `buildWeekdayFailureStats`, `buildSeverityDistribution`,
   `computeArchetypeDistribution`.
2. **Cohort filter** — `applyFilter` re-implements session/direction/archetype/severity
   selection independently.
3. **Distance to Stop** — a private `aggregateByDim` + `DRILL_DIMENSIONS` powering drivers/
   pairs/drilldown.
4. **Prevention** — its own rule-match aggregation.

Four systems, one underlying operation ("group losers by dimension(s), sum loss-R, rank").
**These should be one engine** (Phase F). `DRILL_DIMENSIONS` + `aggregateByDim` are already
the prototype — they just need to be promoted to a shared module and generalised.

---

## Phase B — Failure Explorer design

A 2-dimension attribution surface (Dimension A required, Dimension B optional). Powered by
the shared engine, **not** a new analytics system.

- **Max dimensions: 2.** Hard cap. No 3+/N-way. (3-way is where false discovery explodes.)
- **Sample floor:** configurable, default ≥ ~15–20 for a cell to *rank or be flagged*;
  below floor → greyed "insufficient (n=…)", excluded from ranking.
- **Metric:** Loss-R (default) · Contribution % · **Lift** · Trade count · Loss rate · Avg
  loss · Avg severity. Default ranking = **lift, tie-broken by loss-R** (disproportionate
  *and* material), not contribution alone.
- **Statistical safeguards:** show n + 95% CI on loss rate per cell; show lift vs baseline;
  display "N cells evaluated" and raise the flag bar as more cells are shown (multiple-
  comparison awareness); in-sample caveat + promote-to-validate; never auto-promote a thin
  cell.
- **Answers:** "which session/structure loses the most (and disproportionately)?", "which
  session×structure or weekday×direction cell is over-represented in loss-R?" — but always
  gated so a 100%-loss 4-trade cell can't top the list.

Note: the Explorer's *filter* half already exists as the cohort filter; its *aggregate/rank*
half is drivers/pairs. The Explorer is really "expose the shared engine with a 2-dim picker"
— which is why Phase F must come first.

---

## Phase C — Distance to Stop evolution

1. **Should BE Opportunity return? Yes** — it's the "so what" of the bucket chart.
2. **Where:** stays in Distance to Stop (it's MFE-specific; don't fold into the general
   Explorer).
3. **Above or below the chart? Below.** Chart = evidence (how far losers moved); BE table =
   the derived, caveated hypothesis. Evidence first, inference second.
4. **Interaction with Explorer:** keep separate. Explorer = general damage attribution; BE =
   MFE-derived hypothesis with the upper-bound guardrail. Merging them would dilute the
   guardrail.
5. **MFE × drilldowns:** the bucket drilldown already answers "who is in this bucket." The
   higher-value evolution is **MFE × dimension** summaries:
   - **Structure × MFE — highest value.** Does CHoCH move further in favour before failing
     than BOS? Directly informs *structure-specific* BE viability.
   - **Session × MFE — high value.** Session-specific BE behaviour.
   - **Direction × MFE — low value** (usually little signal; skip unless asked).
   - **OB Width × MFE — interesting but overlaps Protection's penetration work** (wider OB ↔
     deeper penetration ↔ more favourable room). Include as a curated pair, not a headline.

   Recommendation: add **Structure×MFE and Session×MFE** ("avg MFE / % reaching ≥0.5R by
   segment") — these tell you *which setups deserve BE testing*, the actual research question.

---

## Phase D — OB Width

**Recommendation: (C) a default Explorer dimension + one curated MFE pair — not (A) a
standalone dimension silo, not (B) a first-class module.**

- A standalone OB-Width module would **duplicate** three things: Protection's penetration
  analysis (OB width ↔ penetration %), FFT/structural research, and the Failure Drivers
  table. Building it separately fragments the lab — the exact anti-pattern this audit exists
  to stop.
- As an **Explorer dimension** (bucketed: 0–3 / 3–6 / 6–10 / 10–15 / >15 pips) it answers
  "do wider/narrower OBs lose disproportionately?" for free, and **OB Width × MFE** answers
  "do wider OBs give more favourable room (BE viability)?" Those cover the real value without
  a new surface.

---

## Phase E — Drilldown evolution

**Challenge: do NOT build the 5-level cascade (Bucket→Session→Structure→Direction→Archetype).**

- It is the **combinatorial-noise / overfitting trap**: each level subsets the prior, so by
  level 4–5 you're describing 3–6 trades and presenting random structure as a finding.
- It is **path-dependent** (a different drill order tells a different story) and largely a
  worse version of Pair Drivers.
- **UI complexity** balloons (state, breadcrumbs, empty branches) for decreasing signal.

**Recommendation:** cap drilldown at **2 levels** — bucket → one dimension (current), and
let the **Explorer's A×B** be the disciplined 2-factor view (with sample floor + lift).
**Keep Pair Drivers** (curated, gated); do **not** replace them with a cascade. If any extra
depth is wanted, make level 2 a *user-chosen* dimension with a sample floor, never an
automatic 5-deep tree.

---

## Phase F — Shared aggregation engine (the most important part)

**Yes — Failure Drivers, Pair Drivers, the Explorer, Distance-to-Stop drilldowns, Overview
distributions, and any future pattern surface can (and should) be one engine.**

### `failuresDimensions.js` — single dimension registry
```
Dimension = {
  key, label,
  accessor(trade) -> value | null,        // null/"Unknown" = no signal
  bucketer?(trade) -> band,               // for numeric dims (OB width, severity)
  available(trades) -> bool,              // gate (e.g. FFT off when unexported)
  tier,                                   // data-tier from failuresDataQuality
}
```
Promote the existing `DRILL_DIMENSIONS` here; the cohort filter and Overview then consume the
*same* accessors (kills duplication systems #1 and #2).

### `failuresAggregation.js` — one engine
```
aggregate(trades, {
  dimA,                 // required Dimension
  dimB = null,          // optional second Dimension (cap at 2)
  metric = "lossR",     // lossR | contributionPct | lift | count | lossRate | avgLoss | severity
  sampleFloor = 15,
  baseline = trades,    // for lift / loss-rate-vs-baseline
  topN = Infinity,
  requireKnown = true,  // drop Unknown cells for pairs
}) -> {
  cells: [{ keyA, keyB?, count, lossR, contributionPct, lossRate, avgLoss,
            avgSeverity, lift, lowSample }],
  totals: { trades, lossR, baselineLossRate },
  meta: { dimA, dimB, metric, sampleFloor, cellsEvaluated },
}
```
- **Ranking:** by `metric`, with `lowSample` cells excluded from ranking but shown greyed.
- **Lift** = (cell loss-R share) ÷ (cell trade share), or cell loss-rate ÷ baseline loss-rate
  — the over-representation fix.
- **Outputs power every surface:**
  - Failure Drivers = iterate all dims, `dimB=null`, flatten cells, rank.
  - Pair Drivers = iterate curated pairs, `dimB` set, rank.
  - Explorer = user picks dimA[, dimB].
  - Distance-to-Stop drilldown = pre-filter to bucket, `dimA=each`.
  - Overview distributions = `dimA=session/direction/…`, single dim.
- **Net:** delete the bespoke Overview aggregators and the private `aggregateByDim`; the
  cohort filter shares the registry. One engine, validated once, reused everywhere.

This is the future-proofing: new research surfaces become *configurations of the engine*,
not new analytics modules.

---

## Phase G — Prioritized roadmap (with challenges)

1. **Highest-value next feature:** the **shared engine + dimension registry (Phase F)** —
   plus the **lift/over-representation fix**. Everything else gets cheaper, consistent, and
   methodologically sound. Ship as a refactor behind validation (no behaviour change first,
   then add lift).
2. **Lowest effort / highest insight:** **Structure×MFE + Session×MFE** in Distance to Stop,
   and **bring BE Opportunity back below the bucket chart** — small, reuses the engine, and
   directly answers "which setups deserve BE testing."
3. **Biggest research unlock:** the **2-dimension Failure Explorer** (capped, gated, lift-
   ranked) — but only *after* the engine and only *with* the safeguards; otherwise it's a
   noise machine.
4. **Biggest future-proofing:** the engine + registry (same as #1) — it stops the
   proliferation of one-off analytics that this audit was called to address.
5. **Recommended order:** (1) engine + registry + lift → (2) migrate Drivers/Pairs/drilldown
   onto it (proves reuse, no behaviour change) → (3) Distance-to-Stop MFE×dimension + BE
   return → (4) Failure Explorer (2-dim, gated) → (5) migrate Overview/Sessions/Direction/
   Temporal tabs onto the engine (consolidation) → **stop**. Do **not** build the 5-level
   cascade or a standalone OB-Width module.

### Weak ideas / dead ends (explicit)
- **5-level drilldown cascade** — noise/overfitting/path-dependence. Reject.
- **Standalone OB-Width module** — duplicative with Protection + Drivers. Make it a dimension.
- **Unrestricted / 3+-way combination mining** — false-discovery generator. Cap at 2.
- **Ranking by contribution % alone** — already shipped, already misleading; fix with lift.
- **More isolated widgets** — the named anti-pattern; everything new should be an engine
  configuration, not a new surface.

---

### Bottom line
The fastest path to a *professional* research platform isn't another chart — it's (a) one
aggregation engine + dimension registry every surface shares, and (b) replacing
"contribution %" with **lift** so the lab surfaces *disproportionate* damage, not just
*volume*. Build those, layer the 2-dim Explorer and MFE×dimension on top, and refuse the
cascade. That yields discovery with discipline instead of a dashboard of interesting charts.

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
