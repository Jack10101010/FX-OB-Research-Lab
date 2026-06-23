# Timing & Regime Lab — Design Audit (AUDIT ONLY)

Merge the current **Monthly** tab and **Entry Timing** tab into one **Timing & Regime Lab** focused on discovering profitable time-based filters, interactions, and regime-dependent behaviour. **No code in this document. No files modified.**

The guiding constraint is the same one that governs the Management tab: **statistical honesty**. Timing analysis is the single most overfit-prone surface in the whole platform — calendar cells are tiny, the search space is enormous, and a 6-year backtest gives only ~6 independent observations per month-of-year. The lab's primary job is to surface the *few* time filters that are stable across years and route everything else to "noise — do not trade." A loosely-built version of this lab would be a false-discovery machine.

Files read: `pages/RunDetail.jsx` (tab registry, `MONTHLY`, `SessionMatrix`, `TimeOfDayHeatmap`), `components/lab/failures/shared/filterSimulator.js`, `components/lab/failures/shared/failuresDimensions.js`, `components/lab/failures/shared/failuresUtils.js` (accessors), `components/lab/failures/discovery/FilterDiscovery.jsx`, `data/sessionResults.js` (`cohortRegimeSnapshot`, `statsFor`), and the importer's direction/regime fields.

---

## PHASE 1 — CURRENT STATE

### 1. Monthly tab — capabilities
The Monthly tab is **one bar chart and nothing else**. `RunDetail.jsx` derives `MONTHLY` (memo) by bucketing `displayTrades` by `entry` timestamp into `YYYY-MM` keys and summing `numericTradeR`. It renders a Recharts `BarChart` of **Net R per calendar month** (green/red bars), with an empty state when no timestamped trades exist.

What it does **not** have: no PF, no win rate, no expectancy, no trade counts, no table, no sorting, no drilldown, no month-of-year aggregation (it's per *calendar* month `Jan '24`, not "all Januaries"), no interaction at all. It is a glance widget, not a research tool.

### 2. Entry Timing tab — capabilities
Two read-only Net-R heatmap panels rendered together:

- **`SessionMatrix`** — `originSessionForTrade` (row) × `fillSessionForTrade` (col) grid, each cell = summed Net R + trade count, colour-scaled by |Net R| / maxAbs. Summary chips: Best Pair, Worst Pair, Most Active (by count). Net R only.
- **`TimeOfDayHeatmap`** — weekday × hour grid (Mon→Sun rows, observed-hour columns), each cell = summed Net R + count, colour-scaled. Summary chips: Best/Worst Day, Best/Worst Hour, Most Active Day, **Profitable Slot %** (share of populated cells with Net R > 0). Net R only.

Both are **descriptive Net-R heatmaps**: no PF / WR / expectancy per cell, no drilldown, no sorting, no stability/sample weighting, no what-if, no regime overlay. "Best Hour by Net R" can be (and usually is) a single lucky trade.

### 3. Regime-related capabilities
**There is no market-regime concept exported.** What exists, and what "regime" currently can mean:

- **`cohortRegimeSnapshot(trades)`** in `sessionResults.js` is mis-named: it is a **calendar-seasonality** snapshot. It groups executed trades `byYear` and `byMonth` (month-of-year 1–12), runs `statsFor` per bucket (count/wins/losses/winRate/netR/avgR — and now `pf`), and returns `years`, `months`, `bestYear/worstYear/bestMonth/worstMonth`. The "Regimes" drill-tab in Session Results is really a **year × month-of-year seasonality** view. This is the single most valuable piece of *stability* infrastructure already present.
- **Direction (`bull`/`bear`)** — every trade carries `side`/`direction` normalised to `bull`/`bear`; order blocks carry `obDirection` (Bullish/Bearish). This is **trade/OB direction**, not market regime.

So today "Bullish / Bearish regime" can only honestly mean **trade direction**. A true regime (HTF trend vs range, MA-slope, volatility regime, session bias) is **not in the export** and would require a backend field. This is the most important honesty caveat in the whole design (see Phase 2-G and Phase 4).

### 4. Existing reusable *analysis* infrastructure
- **`metricsOf(trades)`** (`filterSimulator.js`) — the canonical population-metrics function: `trades`, `winners`, `losers`, `posR`, `negR`, `netR`, `winRate`, `profitFactor` (null = no losses → render ∞). Safe math, no zero-division. **This is the per-bucket KPI engine for the entire lab** — every cell, row, and chip should call it.
- **`statsFor(executed)`** (`sessionResults.js`) — parallel per-cohort stats (count/wins/losses/be/netR/avgR/winRate/pf) using `classifyTrade`. Already used by `cohortRegimeSnapshot`.
- **`cohortRegimeSnapshot`** — year/month seasonality + best/worst (stability seed).

### 5. Existing reusable *filter-discovery* infrastructure — **the crown jewel**
`components/lab/failures/shared/filterSimulator.js` is a complete, validated, pure discovery+what-if engine that is **directly reusable for timing**:

- **`simulateRemoval(trades, matchFn)`** — the **what-if truth layer**. Partitions trades into removed/kept, recomputes everything from the kept set, returns both sides of the trade-off (`lossRRemoved`, `winnerRRemoved`), `netRImpact`, `winRateChange`, `pfBefore/pfAfter`, `before/after`. No estimates — actual R values. **This is exactly the Phase 3 What-If engine, already built.**
- **`buildFilterDiscovery(trades, {dims, pairs, sampleFloor, topN})`** — enumerates every observed value of every *available* registry dimension + curated pairs, runs each through `simulateRemoval`, ranks by sample-adequacy then Net R improvement. **This is exactly the Phase 4 Discovery engine, already built** — it just needs timing dimensions registered.
- **`cohortMatcher` / `cohortLabel`** — dimension-driven match-fn builder (single dim or pair), string-compared via registry accessors.
- **`recommendFilter(sim)`** + thresholds (`REC_STRONG_NET_R=3`, `REC_TEST_NET_R=1.5`, `REC_WATCH_NET_R=0.5`, `REC_WINNER_COST_RATIO=0.5`, `REC_SAMPLE_FLOOR=8`) — Strong Disable / Test Disable / Watchlist / Neutral with a sample floor and a winner-cost guard.
- **`bestFiltersByDimension`** — best positive filter per slot (powers quick cards).
- **`FilterDiscovery.jsx`** — the UI pattern (quick cards + one sortable table + recommendation pills + low-n warnings), running on the valid universe (`isPerformanceTrade`).

### 6. Existing reusable *matrix / heatmap* infrastructure
- **`SessionMatrix`** and **`TimeOfDayHeatmap`** (in `RunDetail.jsx`) — two bespoke heatmap renderers, each hardcoded to its axes and to **Net R only**. Reusable as *visual patterns* (colour scaling by |value|/maxAbs, best/worst/active chips, empty states) but **not as a generic component** — they don't accept a metric selector, axis config, or click handler.
- **`MetricChip`**, **`NeonPanel`**, **`Pill`**, **`TermTip`**, **`DataTable`** — shared UI primitives, fully reusable.

### Reuse-vs-rebuild verdict

| Capability | Verdict | Notes |
|---|---|---|
| Per-bucket KPIs (trades/NetR/PF/WR/Exp) | **REUSE** | `metricsOf` / `statsFor` (add expectancy = netR/count) |
| What-If removal engine | **REUSE as-is** | `simulateRemoval` is the Phase-3 engine |
| Discovery engine + ranking + recommendation | **REUSE** | `buildFilterDiscovery`; register timing dims + pairs |
| Dimension registry (session/weekday/hour) | **REUSE + EXTEND** | add `month`, `regime` accessors |
| Time accessors | **REUSE** | `entryHour`, `entryWeekday`, **`entryMonth` all already exist** |
| Year/Month seasonality + stability seed | **REUSE + GENERALISE** | `cohortRegimeSnapshot` → generic "by-year stability" over any cohort |
| Heatmap visuals | **REBUILD as generic** | parametrise axes + metric + onClick; current ones are Net-R-only & hardcoded |
| Drilldowns / explorers / overlay / confidence | **NEW** | none exist today |
| Market regime data | **NEW (backend)** | not exported; direction is the only proxy today |

**Headline:** ~70% of the engine work is already done and validated. The genuinely new work is (a) registering `month`/`regime` dimensions, (b) a generic metric-aware matrix/drilldown component, (c) a stability/confidence layer, and (d) honest handling of the missing regime field.

---

## PHASE 2 — TIMING & REGIME LAB DESIGN

A single tab `timing-regime` replacing `monthly` + `entry-timing` in the `resultsTabs` registry. One shared, memoised **valid trade universe** (`isPerformanceTrade`, matching FilterDiscovery / Run-Detail KPIs) feeds every panel, and one shared **Regime Overlay** filter (G) wraps that universe before any view computes. All metrics come from `metricsOf` so PF/WR are consistent everywhere.

### A) Time Performance Overview (chip board)
A grid of `MetricChip`s, each computed by `metricsOf` over its bucket, showing **Trades · Net R · PF · WR · Expectancy** (Exp = netR/trades):

- Best / Worst **Month** (month-of-year, from `cohortRegimeSnapshot.months`)
- Best / Worst **Session**
- Best / Worst **Hour**
- Most **Consistent** Session / Hour — *not* highest Net R but highest **stability** (years-positive ratio from the Phase-5 layer; ties broken by PF). This is the chip that matters most and the one the current tab lacks entirely.
- Most **Active** Session / Hour — by trade count.

Every "Best by Net R" chip must carry an `n` and a confidence dot (Phase 5), because "Best Hour +14R / n=3" is the canonical timing trap.

### B) Monthly Breakdown Table
Month-of-year rows (Jan…Dec) — **sortable** columns Month · Trades · Net R · PF · WR · Exp · (Years Present · Years Positive from Phase 5). Each row **clickable** → C. Source: generalise `cohortRegimeSnapshot.months` to carry PF (already does) + expectancy + the stability fields. Offer a toggle between **month-of-year** (seasonality, default) and **calendar month** (the current `MONTHLY` chart's basis) — they answer different questions and conflating them is a common error.

### C) Month Drilldown
On month click, filter the universe to that month and render four `metricsOf`-backed sub-breakdowns: **Session**, **Hour**, **Weekday**, **Regime** (= direction today). Each is a mini sortable table with the standard KPI set + n + confidence. This is where month×session interactions become visible without yet committing to a full matrix.

### D) Month × Session Matrix
Rows = months, cols = `[Asia, London, NY, Outside, …]` (the existing `SESSION_COLUMNS`). A **generic matrix component** (the rebuild from Phase 1-6) where each cell shows a **selectable metric** (Net R default; switchable to PF / WR / Trades), colour-scaled, with a **sample-gate**: cells under the floor render muted/“·” with the count, never a colour-screaming +R off 1 trade. Cells clickable → the same drilldown surface as C, scoped to month×session. Column/row sort by the active metric.

> **Honesty note for D:** at ~300 trades over 6 years across ~48 month×session cells, the median cell is ~1–6 trades. The matrix is a **hypothesis map, not a result** — it must visually de-emphasise thin cells and is best read at the *row* (month) and *column* (session) margins, which carry real samples, rather than individual cells.

### E) Hour Explorer
Click an hour → `metricsOf` panel for that hour plus its composition: **Months**, **Sessions**, **Regimes** breakdowns (which months/sessions/regimes that hour's trades came from) + the standard KPIs and stability. Answers "is hour 13:00 good everywhere, or only in London, or only in 2023?".

### F) Weekday Explorer
Identical pattern to E, keyed on weekday (`entryWeekday`/`WEEKDAYS` already exist). Weekday × Hour is one of the higher-signal timing crosses (intraday session rhythms repeat weekly), so this explorer + the W×H discovery pair (Phase 4) are worth prioritising.

### G) Regime Overlay (global toggle)
A segmented control — **All · Bullish · Bearish · …** — that filters the shared universe *before* any panel computes, so A–F all recompute under the selected regime. 

**Critical honesty constraint:** with no exported market regime, Bullish/Bearish = **trade direction** (`bull`/`bear`). The control must be **labelled accurately** ("Regime (direction proxy)") and the lab must not imply it knows HTF trend/range. Design the overlay as a pluggable `regimeAccessor` so that *if/when* the backend exports a real regime field (trend/range, MA-slope, vol bucket, session bias), it drops in with zero UI change. Until then, "Regime × Session" is really "Direction × Session" — useful, but not what a trader usually means by regime. Flag this in the panel subtitle and the glossary.

---

## PHASE 3 — WHAT-IF ENGINE

**Existing infrastructure is reusable as-is — no new engine needed.** `simulateRemoval(trades, matchFn)` already returns exactly the requested outputs:

| Requested | Provided by `simulateRemoval` |
|---|---|
| Trade count removed | `tradesRemoved` (+ `losersRemoved` / `winnersRemoved`) |
| Net R change | `netRImpact` (= after.netR − before.netR, exact) |
| PF change | `pfBefore` → `pfAfter` |
| WR change | `winRateChange` (+ `before/after.winRate`) |
| Expectancy change | derive `after.netR/after.trades − before.netR/before.trades` (one line on top of `before`/`after`) |

The only new piece is the **match function for time cohorts**, and `cohortMatcher` already builds these from the dimension registry — so once `month`/`regime` dims exist, "Remove January", "Remove January NY", "Remove Wednesday 12:00", "Remove Friday Asia" are all expressed as `{dimA, keyA}` / `{dimA, keyA, dimB, keyB}` and run through the existing truth layer.

- **Reusable?** Yes — `simulateRemoval` + `cohortMatcher` + `metricsOf`. Expectancy is a trivial add.
- **New engine?** No. New work = a small "What-If basket" UI (pick one or several time cohorts, show combined removal) and an optional **multi-removal** mode (remove a *set* of cells at once — sequential composition of match-fns with OR), which `simulateRemoval` supports natively (pass a composed `matchFn`).
- **Computational cost:** trivial. Each what-if is O(n) over trades (~300–thousands). Even a 100-cohort basket is a few hundred O(n) passes — sub-millisecond. No memo concerns beyond the existing pattern.

---

## PHASE 4 — TIMING FILTER DISCOVERY

**`buildFilterDiscovery` is the engine.** It already enumerates every observed value of every *available* registry dimension + a curated pair list, simulates removal, and ranks. To make it a timing-discovery engine:

1. **Register two dimensions** in `failuresDimensions.js` (or a parallel `timingDimensions` registry to avoid coupling Failures Lab): `month` (accessor = `entryMonth` → `MONTH_NAMES`, **already exists in utils**) and `regime` (accessor = direction today; pluggable). `weekday`, `hour`, `session`, `direction` are **already registered**.
2. **Add curated timing pairs** to a timing-specific `DISCOVERY_PAIRS`: `month×session`, `month×hour`, `weekday×hour`, `regime×session`, `regime×month`. (`hour×structure` already exists; the engine forbids free-form N-way mining by design — keep that.)

Requested rankings map directly onto existing outputs: **Delta Net R** = `netRImpact`; **PF improvement** = `pfAfter − pfBefore`; **Expectancy improvement** = derived (Phase 3); **Trade-count impact** = `tradesRemoved`. Add PF-delta and expectancy-delta as sortable columns (the table is already sortable; `SORTABLE` set just needs the keys).

> **Note on framing:** Discovery here ranks *which time cohort to **remove*** (the Failures-Lab framing — disable the bad slice). For timing you often also want *which to **keep/concentrate in***. That is the same simulation read from the opposite side (`netRImpact` of removing the *complement*), so it needs only a UI toggle ("remove this" vs "keep only this"), not a new engine.

- **Reusable?** Engine yes; register dims + pairs + 2 sortable columns.
- **New engine required?** No.
- **Recommended architecture:** a `timingDiscovery.js` thin wrapper that calls `buildFilterDiscovery` with `dims = [month, weekday, hour, session, regime]` and the timing pairs, plus a **stability gate** (Phase 5) injected into `makeRow` so the ranking can demote single-year flukes. Keep the Failures registry untouched (additive timing registry) to respect workstream boundaries.

---

## PHASE 5 — STABILITY LAYER (the most important part)

Timing cells are tiny and the search space is huge, so **every timing candidate must carry stability, not just in-sample Net R.** For each candidate (cell, row, chip, discovery row) show: **Trades · Years Present · Years Positive · PF · WR · Confidence**.

**Building block already exists:** `cohortRegimeSnapshot` groups a trade set by year. Generalise it to a pure `stabilityOf(trades)` → `{ yearsPresent, yearsPositive, byYear:[{year, trades, netR, pf, wr}], positiveYearRatio }`. Run it on each candidate's matched trades.

**Confidence methodology (deterministic, honest, consistent with the Management-tab confidence tiers):**

- **Hard sample floor first.** If `trades < SAMPLE_FLOOR` (reuse `REC_SAMPLE_FLOOR = 8`, arguably higher for timing) → **Low**, full stop. A % or Net R off ≤7 trades is noise — never dress it up.
- **Cross-year persistence is the real test.** Define `confidence` from *both* sample and year-spread:
  - **High** — `trades ≥ ~30` AND `yearsPresent ≥ 4` AND `yearsPositive / yearsPresent ≥ 0.6`.
  - **Medium** — `trades ≥ ~15` AND `yearsPresent ≥ 3`.
  - **Low** — otherwise (or any sub-floor / single-year candidate).
- **Single-year veto.** A candidate concentrated in one calendar year (`yearsPresent == 1`) is forced **Low** regardless of Net R — this is the dominant timing-overfit failure mode (one good year masquerading as a "January edge").
- Optionally surface a **Wilson interval** on WR (the platform already uses Wilson in `researchSignals`) and an **out-of-period check** (does the edge hold if you drop the best single year?) as a "robustness" flag — the cheapest possible guard against a one-year artefact.

Display: a confidence dot + `n` on every chip; Years Present/Positive columns on every table; the matrix sample-gate (Phase 2-D) is just the floor applied visually. **This layer is what separates a research tool from a curve-fitting toy** — it should be built early, not bolted on.

---

## PHASE 6 — UX PRIORITISATION (edge-discovery value)

**1. Most likely to uncover *real* edge:**
- **Session-level** Net R / PF / Exp with stability — sessions have hundreds of trades, real liquidity-regime meaning, and survive cross-year tests. Highest signal-to-noise.
- **Hour-of-day at the session margin** (London open, NY open/overlap) — intraday structure is genuinely persistent; aggregate by hour *across* months/years for sample.
- **Weekday × Hour** — repeats 52×/year, so even fine cells accumulate sample; captures real intraday-weekly rhythm.
- **Direction × Session** ("regime"×session today) — directional edge by session is plausible and well-sampled.

**2. Likely noise:**
- **Individual Month × Session / Month × Hour cells** — ~1–6 trades each; almost pure noise at the cell level. Useful only at the margins (whole-month, whole-session).
- **"Best Hour/Month by Net R"** without stability — dominated by single large trades.
- **Calendar-month** (specific `Jan '23`) Net R — n≈ a handful; seasonality (month-of-year pooled across years) is the only honest monthly read, and even that is ~6 obs/month.
- **Regime × Month** with direction-as-regime — thin and conflates two weak dimensions.

**3. Highest-value combinations:**
- **Session × Hour** (well-sampled, mechanistic) and **Weekday × Hour** (repeats weekly).
- **Direction × Session** as the honest "regime" cross.
- Everything **month-based** is lower value until either more data or a real regime field exists — present it, gate it hard, label it exploratory.

**4. Build first:** the **stability layer + per-bucket PF/WR/Exp** (turns the existing Net-R heatmaps into honest research immediately), then the **Overview chip board** and **sortable Session/Hour/Weekday tables** (cheap, high-value, well-sampled), then **What-If** (engine already exists). Matrices and month drilldowns come after the guardrails exist, so they're born gated.

**5. Can reuse existing infra:** What-If (100%), Discovery engine + ranking + recommendation (≈90% — register dims/pairs), per-bucket metrics (100%), year-stability seed (`cohortRegimeSnapshot`), time accessors (`entryHour/Weekday/Month`), and all UI primitives + the FilterDiscovery card/table pattern.

---

## PHASE 7 — IMPLEMENTATION PLAN

### Phase A — Foundations & honest tables (highest value / lowest risk)
- **Scope:** new `timing-regime` tab replacing `monthly`+`entry-timing`; `timingMetrics`/`timingDimensions` helpers reusing `metricsOf`; generalise `cohortRegimeSnapshot` → `stabilityOf`; Overview chip board (A) + Monthly breakdown table (B) + Session/Hour/Weekday sortable tables with PF/WR/Exp + n + confidence (Phase 5 floor).
- **Files likely touched:** `pages/RunDetail.jsx` (tab registry + render swap — hotspot, stage carefully), new `data/timingAnalytics.js` (+ validator), reuse `filterSimulator.metricsOf` / `sessionResults` helpers, `failuresUtils` accessors.
- **Complexity:** Medium. **Risk:** Low (additive; `RunDetail.jsx` is the only shared hotspot). **User value:** **High** — immediately turns Net-R-only widgets into honest, sortable, stability-aware research.

### Phase B — What-If + Discovery
- **Scope:** register `month`/`regime` dims + timing pairs; `timingDiscovery.js` wrapper over `buildFilterDiscovery` with the stability gate; What-If basket UI (single + multi-removal); discovery table with NetR/PF/Exp-delta columns + recommendation pills (reuse `FilterDiscovery` pattern).
- **Files likely touched:** new `data/timingDiscovery.js` (+ validator), new timing dimension registry (additive — do **not** mutate `failuresDimensions` owned by Failures Lab), new UI panels under the timing tab. Reuse `simulateRemoval`/`buildFilterDiscovery`/`recommendFilter` unchanged.
- **Complexity:** Medium (mostly wiring). **Risk:** Low–Medium (respect Failures-Lab ownership — additive registry). **User value:** **High** — exact what-if + ranked candidate discovery.

### Phase C — Matrix & drilldowns
- **Scope:** generic metric-aware matrix component (Month×Session, selectable metric, sample-gated cells, clickable); Month drilldown (C); Hour Explorer (E); Weekday Explorer (F); cross-links from matrix/table cells into drilldowns.
- **Files likely touched:** new `components/lab/timing/*` (Matrix, Drilldown, HourExplorer, WeekdayExplorer), timing tab composition. Reuse `metricsOf`, stability, MetricChip/NeonPanel.
- **Complexity:** Medium–High (generic matrix + interaction state). **Risk:** Medium (more UI surface; keep cells gated so it ships honest). **User value:** Medium–High — exploratory pivoting; value capped by sample at the cell level.

### Phase D — Regime overlay & robustness polish
- **Scope:** Regime Overlay segmented control (All/Bullish/Bearish via direction proxy, pluggable `regimeAccessor`); robustness flags (drop-best-year check, Wilson WR); glossary entries; "needs real regime export" backlog item for the backend.
- **Files likely touched:** timing tab (overlay state), `data/timingAnalytics.js` (regime accessor + robustness), `researchGlossary.js`. **Backend (separate stream, not this lab):** export a true market-regime field to upgrade the proxy.
- **Complexity:** Low–Medium frontend (overlay is a pre-filter). **Risk:** Low, **but** high *interpretive* risk if the direction-proxy is presented as real regime — mitigated by labelling. **User value:** Medium now (direction cross), **High** once a real regime field is exported.

---

## Honesty spine (carry into the UI, mirrors the Management-tab grades)
- **EXACT** — per-bucket Trades / Net R / PF / WR / Exp, and every What-If removal (`netRImpact`, PF/WR change) are exact recomputations from real trade R. These are trustworthy *as descriptions of this run*.
- **EXACT-BUT-IN-SAMPLE** — discovery rankings are exact arithmetic but **in-sample, single-run optimization**; each candidate is a hypothesis to re-test, never a trading instruction (carry the existing `filterSimulator` OVERFIT warning verbatim).
- **THIN / NOISE** — individual month×{session,hour} cells, "best by Net R" without stability, single-year edges. Gate hard, mute visually, force Low confidence.
- **NOT AVAILABLE** — true market regime. The overlay is a **direction proxy**; label it and route the real thing to a backend export.

**Overarching caution:** this lab's value is inverted from its surface area. The big visual wins (month×session matrix, hour heatmaps) are the *least* trustworthy cells; the unglamorous parts (session/hour aggregates with cross-year stability, exact what-if) are where real edge lives. Build the guardrails (Phase 5) before the eye-candy (Phase C), and the lab accelerates research instead of manufacturing false timing edges.
