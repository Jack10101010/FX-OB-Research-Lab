# Results Basis + Scenario-Aware Analytics — Audit & Design

**Mode:** AUDIT + DESIGN ONLY. No files modified, no implementation performed.
**Date:** 2026-05-29
**Scope:** How analytical results are calculated across the app, and a forward design for (1) Raw R vs Current-Equity basis and (2) scenario-aware analytics.

---

## 1. Files Read

Core calculation / data layer:

- `frontend/src/lib/metrics.js` — `computeProfitFactor`, `computeMaxDrawdown`, `computeExpectancy`, `computeAvgWinLoss`, `computeRunHealth`.
- `frontend/src/data/tradeUniverse.js` — scenario resolver (`resolveTradeUniverse`, `selectTrades`, `buildCanonicalKey`, fill-mode coercion, warnings).
- `frontend/src/data/useTradeUniverse.js` — React hook wrapping `getTradeUniverse`.
- `frontend/src/data/store.js` — `getTradeUniverse`, `state.scenario`, `selectedTradeVariant`, persistence (`fxob_scenario_v1`).
- `frontend/src/data/tradeClassification.js` — `summarizeTradeSanity` (canonical raw-R roll-up: PF, expectancy, winRate, netR, netRPerformance).
- `frontend/src/components/lab/account/accountEquity.js` — the compounding / current-equity engine.
- `frontend/src/components/lab/account/fundingChallenge.js` — funding-challenge simulation built on the equity engine.
- `frontend/src/components/lab/entries/analytics/equityCurveAnalytics.js` — per-model equity curves.
- `frontend/src/components/lab/failures/shared/failuresAnalytics.js` — failures roll-ups.

Surfaces inspected for metric basis:

- `pages/OrderBlockLab.jsx`, `pages/NewsLab.jsx`, `pages/HypothesisLab.jsx`, `pages/ComparisonLab.jsx`, `pages/Overview.jsx`, `pages/RunDetail.jsx`, `pages/Settings.jsx`.

(Directory inventory of `pages/`, `lib/`, `hooks/`, `context/`, `data/`, and `components/lab/**` was also taken to scope the surface area.)

---

## 2. Current State Map

There are **two parallel, non-interoperating calculation worlds** in the app today:

### World A — Raw-R analytics (everything except RunDetail's Account panel)

A trade list is resolved (mostly scenario-aware, via `useTradeUniverse()`), then metrics are computed by **equal-weight raw-R aggregation**:

- `netR = Σ trade.r`
- `expectancy = netR / count`
- `winRate = wins / count` (or `/ (wins+losses)`)
- `profitFactor = ΣwinR / |ΣlossR|`
- `maxDrawdown` = trough of the **cumulative raw-R** curve.

Two implementations of this exist:

1. **Canonical** — `summarizeTradeSanity()` in `tradeClassification.js`, surfaced as `universe.stats`. Handles win-rate denominator modes and a `netRPerformance` variant. Used by Overview, Strategy Map, and KPI strips.
2. **Inline, hand-rolled** — most bucket/breakdown tables re-derive the same formulas locally, e.g. `OrderBlockLab.jsx`:
   - L1097–1100: `wins = rows.filter(r>0)`, `netR = Σr`, `exp = netR/len`, `wr = wins/len`.
   - L660–706 matrix builder: `netR = cells.reduce(+c.netR)`, `expectancy = count ? netR/count : 0`.
   - L1559–1563: per-cell `netR += r; winRate = wins/count`.
   - `failuresAnalytics.js` L39–46, L150, L277: own `grossWin/grossLoss`, `avgR`, expectancy.
   - `NewsLab.jsx` / `HypothesisLab.jsx`: bucket rows carry their own `wins/winRate/netR/expectancy`.

`lib/metrics.js` is a *third* copy of PF / DD / expectancy, used directly by ComparisonLab.

> **Net finding:** the same five formulas are implemented in at least three places (`metrics.js`, `tradeClassification.js`, and inline per-page). There is no single pure calculator that every surface routes through. This is the main structural obstacle to adding a basis toggle cleanly.

### World B — Current-equity / compounding (RunDetail only)

`accountEquity.js` is a fully-formed compounding engine:

- `normalizeAccountSettings` — `mode ∈ {r_only, fixed_dollar, initial_equity_pct, current_equity_pct}`, `startingBalance`, `fixedRiskAmount`, `riskPct`, `currency`.
- `buildAccountEquityCurve(trades, settings)` — sorts trades chronologically (non-`r_only`), walks the sequence, sizes each trade's risk off `equityBefore` when `current_equity_pct`, returns per-trade `equityBefore/After`, `pnlAmount`, account-DD in currency and %.
- `summarizeAccountEquity` — net P&L, ending balance, expectancy in currency, max DD amount/%.
- `riskForTrade` — the compounding rule: `current_equity_pct → max(0, equityBefore) * riskPct/100`.

This engine is **only imported by `RunDetail.jsx`** (and by `fundingChallenge.js`, which is itself only consumed by RunDetail). Its settings live in **localStorage** (`fxob_account_view_settings_v1`), **not** in the global store, and are **not** exposed on the Settings page. It consumes `validTradesForRun` (the run's variant trades) — **not** the scenario-aware `universe.trades`.

So today: compounding exists, is reusable in principle, but is siloed in one page, sequence-aware, and not connected to the scenario system or to any lab table.

---

## 3. Where Raw R Is Used (per-surface basis audit)

| Surface | Basis | Scenario-aware? | Source of trades | Calc location | Notes |
|---|---|---|---|---|---|
| **Overview** KPIs | Raw R | Yes (`useTradeUniverse`) + baseline override | `universe.stats` + inline over `universe.trades` | `tradeClassification` + inline | DD = cumulative raw-R |
| **OrderBlockLab** structure quality / session / OB-quality / news / matrix tables | Raw R | Yes (`universe.trades`) | universe | **inline** (L660–706, L1097, L1559) | bucket netR = Σr, exp = netR/n |
| **NewsLab** tables | Raw R | Yes | universe | inline bucket rows | wins/winRate/netR per bucket |
| **HypothesisLab** baseline + sim rows | Raw R | Yes | universe | inline + exact entry rows | netR/winRate/expectancy raw |
| **FailuresLab** (`failuresAnalytics`) | Raw R | Yes (consumes universe upstream) | universe | own roll-ups | grossWin/Loss, avgR, CVaR all raw R |
| **EntriesLab** equity curves + model KPIs | Raw R (cumulative) | Multi-scenario *by design* | `tradesByMode` | `buildModelEquityCurve` (`cum += r`) | compares scenarios side-by-side |
| **ComparisonLab** | Raw R | **No — baseline only** | raw `TRADES` / `bundle.trades` | `lib/metrics.js` | `computeProfitFactor(TRADES)` ignores active scenario |
| **RunDetail** headline KPIs + equity chart + funding | **Current-equity (if account mode ≠ r_only), else Raw R** | No (variant trades, not universe) | `validTradesForRun` | `accountEquity.js` | the only current-equity surface |
| **StrategyMap** | Raw R | Yes (`SCENARIO` state) | universe | `tradeClassification` | |

Caching: there is no precomputed metric cache keyed by basis. Roll-ups are recomputed in `useMemo`s per page. `universe.stats` is the closest thing to a cached summary; it is raw-R only.

---

## 4. Where Current-Equity Exists Today

- **Single location:** `frontend/src/components/lab/account/accountEquity.js`, surfaced exclusively in `RunDetail.jsx` (account summary L437, equity curve L575–579, funding L441).
- **Reusable?** Yes — it is already a pure, dependency-light module (no React, no store coupling). It takes `(trades, settings)` and returns curve + summary. It is the natural foundation for a system-wide basis.
- **Inputs it needs:**
  - `startingBalance` (has default 10,000)
  - `mode` / risk model (`r_only | fixed_dollar | initial_equity_pct | current_equity_pct`)
  - `riskPct` (for the two %-modes) or `fixedRiskAmount`
  - **a correctly ordered trade sequence** — it sorts chronologically internally using `fill_time/entry_time/exit_time`; quality of the basis depends entirely on those timestamps being present and correct.
  - `currency` (display only)
  - Fees/slippage: **not modeled** today (no field consumed).
- **Gaps blocking reuse:**
  1. Settings are page-local (localStorage), not in the store, so no other surface can read the same account config.
  2. It is fed variant trades, not `universe.trades`, so it is currently scenario-blind.
  3. It produces a *curve + summary*, but not bucket-level current-equity contributions (no per-bucket aggregation exists).

---

## 5. Recommended Results Basis Architecture

Introduce **Results Basis** as a first-class, app-wide concept with two values:

### Raw R
- Every trade weighted equally; metrics are pure sums/means of `r`.
- Sequence-independent and reorder-safe.
- The correct basis for **edge research** ("is BOS better than CHoCH?").
- This is today's default everywhere; keep it as the default so nothing changes until opted in.

### Current Equity
- Each trade's contribution depends on account size at its point in the sequence (compounding via `current_equity_pct`, or fixed-fraction via the other modes).
- Sequence-**dependent**; requires chronological ordering and an account config.
- The correct basis for **execution / account-growth** analysis ("what would this actually have done to my account?").

### Architecture: one pure calculator, two bases

The blocking problem is the three copies of the formulas. The recommended foundation (Phase 1) is a single pure module — call it `analytics/resultsBasis.js` — that becomes the *only* path to a metric roll-up:

```
summarizeTrades(trades, { basis, account }) -> {
  basis,                       // "raw_r" | "current_equity"
  count, wins, losses,
  netR, expectancy, winRate, profitFactor, maxDrawdownR,   // always present (raw-R view)
  // present only when basis === "current_equity":
  netAmount, expectancyAmount, maxDrawdownAmount, maxDrawdownPct,
  endingBalance, currency, contribution,                    // see §6
}
```

- For `raw_r`, this is a thin wrapper over the existing `summarizeTradeSanity` logic (don't fork it — route it).
- For `current_equity`, it delegates to `accountEquity.js` (`summarizeAccountEquity`) and additionally derives per-bucket **contribution** (the currency or %-of-account delta attributable to a subset, see §6).
- `account` config moves into the **store** (and onto the Settings page), with the localStorage key migrated from RunDetail's `fxob_account_view_settings_v1`.

Every surface — including the inline bucket builders in OrderBlockLab/NewsLab/etc. — is gradually re-pointed at this one function. That is the actual unit of work behind a "basis toggle"; the toggle itself is trivial once all roads lead through one calculator.

---

## 6. Recommended Scenario-Aware Analytics Architecture

The scenario system already exists and is good: `state.scenario {family, threshold, fillMode}` → `getTradeUniverse()` → `universe.trades`. Most labs already consume it. The design work is **conceptual clarity**, not new plumbing.

### Should BOS vs CHoCH be computed separately per trade universe?

**Yes.** BOS-vs-CHoCH (and every bucket breakdown) is a property of *a specific trade set*. Baseline edge, Penetration 25%, Triggered Edge Same, and Triggered Edge Next are **different trade sets** (different fills, sometimes different counts), so their bucket breakdowns are genuinely different numbers and must be computed against `universe.trades` for the *currently selected* universe — never silently against baseline.

This is mostly already true (labs read `universe.trades`). The two correctness gaps are:
1. **ComparisonLab** still reads raw `TRADES` → should read the universe.
2. **RunDetail / Account** reads variant trades, not the universe → should read the universe when a scenario is active.

### The two axes are orthogonal

```
                 Raw R                Current Equity
Baseline      edge of baseline     account growth on baseline sequence
Pen 25%       edge of pen-25       account growth on pen-25 sequence
TE Same       edge of TE-same      account growth on TE-same sequence
TE Next       edge of TE-next      account growth on TE-next sequence
```

A metric is only fully specified by **(Trade Universe, Results Basis)**. Every table should know — and display — which cell of this grid it is showing.

### "Both" must never silently merge Same + Next

The resolver already enforces this (`BOTH_UNAVAILABLE_NO_COMBINED` warning, no-fake-Both invariant in `selectTrades`). The analytics layer must respect it: a current-equity sequence built from a merged Same+Next list would double-count each OB and produce a meaningless equity curve. Keep "Both" as a *baseline-CSV-only* option; otherwise force a Same/Next choice.

### Bucket "contribution" under Current Equity

Under Current Equity, a bucket's value is **not** an isolated edge — it's that bucket's contribution to the *full-sequence* account result. Two valid framings, both should be offered explicitly and labelled:
- **Contribution** — sum of the currency P&L of trades in the bucket, in sequence (depends on what happened before them).
- **Isolated** — re-run the equity engine on only that bucket's trades from `startingBalance` (an "if I only traded CHoCH" hypothetical).

These differ and conflating them is the single biggest interpretation risk (see §9). Default to **Contribution**, label it, and offer Isolated as a toggle.

---

## 7. UX Proposal

### Global Analytics Lens (recommended, with page-level override)

A single, persistent lens control (header bar or a sticky strip), driving two independent selects:

```
┌──────────────────────────────────────────────────────────────┐
│  LENS   Trade Universe: [ Baseline ▾ ]   Results Basis: [ Raw R ▾ ] │
└──────────────────────────────────────────────────────────────┘
```

- **Trade Universe** reuses the existing scenario selector values: Baseline / Triggered Edge {threshold} {Same|Next} / Penetration {threshold} / …, sourced from `buildAvailableOptions`.
- **Results Basis**: Raw R / Current Equity. When Current Equity is selected, reveal a compact account chip (`$10,000 · current-equity 1%`) that opens the account config (the existing RunDetail account form, lifted to a shared component).

Global is the better UX because the whole point is to stop the user holding multiple scenarios in their head. To keep it from being *risky*, pages may **override** the global lens locally; multi-scenario pages (EntriesLab, ComparisonLab) **ignore** the global Universe (they show many at once) but still honor the Basis.

### In every table / panel

- **Scope badge** — always-visible chip stating the active cell of the grid, e.g. `Baseline · Raw R` or `Triggered Edge 25% · Next · Current Equity`. Reuse the existing `TradeUniverseBadge`; add a basis segment.
- **Active universe label** — already partly present; make it mandatory on every analytics card header.
- **Raw / Current-Equity toggle** — a small segmented control on each major panel that defaults to the global basis but can be flipped locally.
- **Baseline-only warning** — when a table cannot honor the active universe (no scenario data, or a known baseline-only surface), show an amber inline note: *"Baseline data only — this table does not reflect the {scenario} universe."* Drive it off `universe.warnings` (`NO_TRADES_FOR_SCENARIO`, `BOTH_UNAVAILABLE_NO_COMBINED`).
- **Current-Equity caveat** — when basis = Current Equity on a *bucket* table, show a one-line note: *"Values are sequence-dependent account contributions, not isolated edge."* with a toggle to Isolated.

---

## 8. Implementation Phases (as specified, refined)

**Phase 1 — Audit + shared pure helpers only.**
Land `analytics/resultsBasis.js` as the single calculator. Route the existing `summarizeTradeSanity` and `accountEquity` logic through it without changing any caller. Move account settings into the store + Settings page. No UI/behavior change. Add unit tests asserting raw-R parity with current numbers.

**Phase 2 — Add the Results Basis toggle, opt-in.**
Introduce the global lens (Basis defaults to Raw R = current behavior). Wire the store. No table changes basis unless the user flips it; with everything still on Raw R, output is byte-identical to today.

**Phase 3 — First applied page: OrderBlockLab structure quality.**
Re-point that one panel's inline aggregation at `resultsBasis.summarizeTrades`, add the scope badge + Current-Equity contribution view + caveat. Validate against RunDetail's account numbers for the same trade set.

**Phase 4 — Extend to NewsLab / HypothesisLab / FailuresLab.**
Replace inline bucket math with the shared calculator; add badges + warnings. These are single-universe pages so they map cleanly onto the global lens.

**Phase 5 — EntriesLab & ComparisonLab, handled separately.**
These are multi-scenario by design. They should keep showing multiple universes at once but adopt the **Basis** axis (raw-R curves vs current-equity curves) and fix ComparisonLab's baseline-only `TRADES` read. Treat their universe handling as a distinct design pass.

---

## 9. Risks & Warnings

1. **Bucket analytics under Current Equity are sequence-dependent.** Reordering trades, filtering a bucket, or changing the universe changes every downstream number. Bucket tables must be computed from the *full ordered sequence* (contribution), not by re-summing isolated subsets, unless Isolated mode is explicitly chosen.
2. **Contribution ≠ isolated edge.** A bucket can look great in Current Equity simply because it happened to fire when the account was large. This is the most likely source of user misinterpretation — must be labelled, defaulted to Contribution, and toggle-able.
3. **BOS vs CHoCH under compounding can mislead.** Comparing two buckets by currency contribution mixes edge with position in the sequence. For *comparison* questions, steer users toward Raw R (or Isolated); reserve Current Equity for *account-growth* questions. Consider showing both columns side-by-side in comparison contexts.
4. **"Both" must not silently merge Same + Next.** Already enforced at the resolver; the basis/analytics layer must not bypass it. A merged sequence double-counts OBs and corrupts the equity curve.
5. **Scenario availability differs across runs.** Not every run has every scenario CSV. The lens must gracefully fall back (the resolver already coerces and warns); surface `NO_TRADES_FOR_SCENARIO` rather than rendering an empty/zero table that looks like a real result.
6. **Timestamp dependence.** Current-equity ordering relies on `fill_time/entry_time/exit_time`. Runs with missing/ambiguous timestamps will produce an arbitrary order and therefore an arbitrary equity path — detect and warn.
7. **Fees/slippage not modeled.** Current-equity P&L is gross. If the user reads it as realistic account growth, it overstates results. Either model fees or label the output "gross."
8. **Performance cost.** Current Equity requires a chronological sort + sequential walk per universe; doing it per bucket per table on large runs (and EntriesLab's many scenarios) can be expensive. Compute the ordered curve once per (universe, account-config) and derive bucket contributions from it; memoize keyed on `(runId, universeKey, basis, accountConfigHash)`.
9. **Three existing formula copies.** Until `metrics.js`, `tradeClassification.js`, and the inline builders are unified, a basis toggle risks inconsistent numbers between surfaces. Phase 1 unification is a prerequisite, not optional.

---

## 10. Recommended First Implementation Target

**OrderBlockLab → structure quality table (BOS vs CHoCH), as Phase 3.**

Rationale: it is the canonical example in the brief, it already consumes `universe.trades` (so scenario-awareness is free), its inline aggregation (L1097-style) is small and self-contained, and it is the most compelling place to demonstrate the Raw-R-vs-Current-Equity distinction (BOS vs CHoCH is exactly the comparison where Contribution vs Isolated edge diverges). It is low-blast-radius (one panel) yet high-signal, and validating its current-equity output against RunDetail's account summary for the same trade set is a clean correctness check.

**Prerequisite:** Phase 1 (`resultsBasis.js` unification + account config in store) must land first.

---

### STOP — audit complete. No implementation performed.
