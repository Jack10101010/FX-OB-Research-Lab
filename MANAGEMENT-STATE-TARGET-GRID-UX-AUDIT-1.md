# Management × Market-State Target-Grid — UI Audit & UX Proposal (Audit 1)

**Audit only. No implementation, no file edits to code, no commits.** Scope: extend the
Run Workspace so every cohort's full RR0.5–RR5.0 target analysis can be viewed **per
market state**, with the recommended target as a *conclusion on top of* the evidence,
never a replacement for it.

Desired hierarchy: `RUN → COHORT → MARKET STATE → FULL TARGET BREAKDOWN → RECOMMENDATION`.

---

## 1. What currently exists

### 1.1 Run Workspace / Session Results
- Run Workspace = `frontend/src/pages/RunDetail.jsx` (~5,100 lines). Results tabs include
  **Session Results** (`components/lab/sessionProfiles/SessionResults.jsx`, 1,213 lines)
  and **PM · This Run** (`RunPortfolioAttribution.jsx`).
- Session Results renders **6 session tabs × 4 cohort cards = 24 cohorts**
  (`data/cohortKeys.js`: sessions london/lull/newYork/ny_pm/asia/outside × cells
  bos_long/bos_short/choch_long/choch_short). Cohort cards are **already expandable**
  into `CohortDrilldown`, which has local tabs: **Overview · Management · Failures ·
  Trades · Regimes** (`DRILL_TABS`, SessionResults.jsx:784).
- The **Management** tab (per-cohort) renders, in order: `ManagementCallouts` →
  `ExcursionSnapshot` → **`TargetSuitability` (the full target grid + recommendation
  card)** → `BESuitability` → `RiskReduction` → `EntryThresholdResearch` → collapsed
  trade tables (`IncludedTradesSection`, `PmBlockedSection`).

### 1.2 How the whole-cohort target grid is computed (the thing to extend)
`data/sessionResults.js`:

- `TARGET_SUITABILITY_LEVELS` = `[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, …, 5.0]`
  (0.1 steps to 1R, then 0.25 steps to 5R). *Note: not the pure 0.25-increment ladder
  described in the request — trivial to change, it's one array.*
- `cohortTargetSuitability(executedTrades, levels)` — reach-rate columns (Reach % /
  Winners / Losers) from exported **MFE** with valid-MFE denominators.
- `cohortTargetEconomics(executedTrades, currentTargetLabel, levels)` — **exact MFE
  rescore**: a decided trade wins at target T iff `mfe_r ≥ T`;
  `netR(T) = Σ decided[(T if mfe≥T else −1) − cost] + Σ heldNewsFlatten[actual netR]`.
  Per level: `estW/estL/estWR/estPF/estNetR/deltaCurrent/n/confidence` + normalized
  strength bars + candidate tags (Best/Conservative/Balanced/Aggressive/Current) + a
  deterministic `recommendation` payload: `too_small` (decided < 8) / `none` /
  `current_best` / `recommend`. Confidence gates: reach count < 5 ⇒ Low; decided ≥ 40
  ⇒ High; ≥ 15 ⇒ Medium.
- **Both functions are pure functions over an array of trade rows.** Nothing about them
  is cohort-specific. This is the single most important architectural fact of the audit:
  *the entire whole-cohort target grid can be computed for any subset of rows —
  including a market-state subset — with zero changes to the math.*
- The UI (`TargetSuitability` in SessionResults.jsx) renders the grid + the
  `TargetRecommendationCard` and already carries the correct honesty framing ("Exact for
  this fill set using exported MFE paths … Confirm with backend scenario runs before
  adopting") and a disabled **Stage Backend Test** button ("Scenario staging not wired
  yet").

### 1.3 The cohort "base target" today
- The current per-cohort target comes from the run's `session_strategy_scenario` rule →
  `tpLabel` (`tpLabelFromRule`, e.g. `"1.0R"` or `"Run Default"`), parsed by
  `parseTargetLabel` to anchor Δ-vs-current. So "BASE TARGET" already has a concrete
  home: the scenario rule's `target.rr`. There is **no separate concept yet** of a
  *locked/validated* base target vs. the run's configured target.

### 1.4 Market-state data already available
- **Canonical states are SIX, not five**: `Bull/Expand, Bull/Compress, Bull/Chop,
  Bear/Expand, Bear/Compress, Bear/Chop` (`data/marketState.js MARKET_STATES`). The
  request's 5-state list merges Bull/Chop + Bear/Chop into "Chop" — the PM's STATE_ONLY
  action treats them jointly, but the label engine keeps them separate. The UI must
  decide (see §6).
- **Engine-preferred per-trade state**: importer stamps `regimeEmit`
  (`engineSnapshotFromRow`, importer.js:728) from engine columns `market_state`,
  `trend_state`, `state_known_at`, `source:"engine"`, etc. (regime_spec.md §9).
- **Client fallback**: `data/marketState.js` (leakage-safe daily EMA200/BBW/ADX panel,
  shifted 1 day, `source:"client"`, version-stamped) + `resolveTradeMarketState`
  (`marketStateSource.js`) + hooks in `useMarketState.js`. Candles may live in
  IndexedDB; `TradeInspector.jsx` already implements the load-on-demand pattern.
- **Current consumers of per-trade state: only `TradeInspector` and `StrategyMap`.**
  Session Results / Management make **zero** use of market state today. The
  Timing & Regime tab explicitly disclaims: "Regime data is not currently exported…
  direction proxy, not real regime."

### 1.5 Portfolio Manager data
- Canonical PM actions `LABEL / STATE_ONLY / DIRECTION_AWARE / DISABLE` with friendly
  labels (ALWAYS ALLOW / BLOCK CHOP / FOLLOW TREND / NEVER TRADE), tooltips, and
  per-state allow/block rule rows (`portfolioLabels.js POLICY_STATE_RULES`).
- Deployed policy mirror `deployedPolicy.v1.json` (48 cohorts = 2 instruments × 24):
  per cohort `decision_policy.regime`, `confidence`, `sample_size`, and **book-level**
  `net_r_label / net_r_state / net_r_direction` + rationale. **No per-state target data
  of any kind.**
- Per-trade PM decision columns are imported (portfolio_status, block reasons…);
  Session Results already separates scenario-disabled / PM-blocked / executed /
  cancelled-missed buckets. **PM-blocked rows are setup records only — no fill, no MFE
  — so they can never contribute to a target curve.**

### 1.6 Evidence surfaces that already exist per cohort
Trade count, Net R, WR, PF (cohort summary + `statsFor`); target curve + plateau cue
(strength bars); losing streak — *not currently computed* in sessionResults.js; Max DD —
*not per cohort* (equity view is run-level); era durability = `cohortRegimeSnapshot`
(yearly/monthly + deterministic notes, in the Regimes drill tab); 2025+ recent evidence —
*computable from dated rows but not surfaced as a dedicated split*; walk-forward =
separate `WalkForwardLab` page, keyed to fold artifacts, **not** linked per cohort×state;
rescore-vs-backend distinction exists as prose caveats + the disabled Stage Backend Test
button.

---

## 2. What data already supports COHORT × STATE × TARGET

| Need | Status |
|---|---|
| Full RR ladder per arbitrary row subset | ✅ `cohortTargetEconomics` is pure — pass state-filtered `executedTrades` |
| Per-trade market state | ✅ engine (`regimeEmit`) on new runs; ✅ client fallback (needs candles; IndexedDB load pattern exists) |
| Per-trade MFE + costs | ✅ `mfe_r`, `total_cost_r` (or gross−net) — same fields the whole-cohort grid uses |
| Insufficient-sample gating | ✅ existing `too_small` (<8 decided) + Low/Med/High confidence rules apply unchanged per state |
| Base target anchor | ✅ scenario `tpLabel` → `parseTargetLabel` |
| PM action per cohort | ✅ row-stamped or policy-mirror fallback |
| Era durability / 2025+ split per state | ◑ computable (filter dated rows), not built |
| C3/C4 separation | ✅ entry-variant fields (`enabledVariantBreakdown`, arm region C3/C4) are on rows; cohort drilldowns already reflect the run's variant — keep runs/variants as the separating axis, don't blend |

## 3. What is missing

1. **Any state-aware grouping in Session Results / Management** — the only gap between
   today and "same grid per state" is a filter + a selector UI + panel wiring.
2. **A per-state recommendation store.** Nothing persists `cohort × state →
   {BASE / SHORTER / HIGHER / BLOCK, target, status}`. The PM policy doc is
   action-level, not target-level. Needs a new versioned research artifact (mirror
   pattern already proven by `deployedPolicy.v1.json` + checksum loader).
3. **Validation-status taxonomy.** Today "provisional vs backend-confirmed" lives in
   prose caveats. No structured `rescore_estimate | backend_confirmed | walk_forward_passed`
   status exists anywhere.
4. **State source badge in analytics.** Engine-vs-client provenance is respected in
   TradeInspector but Management has no place to say "states below are client-approx".
5. **Per-cohort losing streak / max DD**, and a **2025+ recent-regime split**, if those
   are wanted in the evidence drawer.
6. **Backend staging** (Stage Backend Test is a disabled stub) — per-state targets make
   this more valuable, since MFE rescore per state is exactly the kind of finding that
   must be confirmed by a true scenario run.
7. **Ladder alignment**: `TARGET_SUITABILITY_LEVELS` uses 0.1 steps below 1R, not the
   requested uniform 0.25 steps (decide which is canonical; one-array change).

---

## 4. Recommended information architecture

**Answering Q1 (Management vs Session Results vs shared):** keep ONE evidence surface —
the existing per-cohort **Management drill tab inside Session Results** — and extend it
with a market-state lens. Do not fork a parallel state-analysis page: the cohort context
(tpLabel, PM status, buckets, caveats) already lives there, and duplicating the grid
elsewhere guarantees drift. Add a *run-level summary matrix* as a secondary navigation
layer (below), also inside Session Results.

Four layers, strictly progressive disclosure:

```
L0  Session Results tab
    └─ NEW (optional, collapsed): "Target policy matrix" — 24 cohorts × 6 states,
       glyph chips only. Navigation + status, never numbers. Click cell → L2 with
       that cohort expanded and that state selected.
L1  Cohort card header (existing)
    └─ ADD: base-target chip ("Base 1.0R", from tpLabel) + a compact 6-slot state
       strip (tiny glyphs: ＝ base · ↓ shorter · ↑ higher · ⛔ block · • n<8 · — not
       researched). Hover = target + n + status. No numbers in the header.
L2  Cohort drilldown → Management tab (existing)
    └─ ADD: Market-State selector row (segmented control) above the panels:
       [ Whole cohort (base) n=54 | Bull/Expand n=12 | Bull/Compress n=9 |
         Bull/Chop n=4 | Bear/Expand n=8 | Bear/Compress n=15 | Bear/Chop n=6 |
         Unlabeled n=2 ]  +  state-source badge (engine / client-approx).
       The selector is a LENS over the whole Management tab: TargetSuitability,
       Excursion, BE, RiskReduction all recompute on the filtered rows. Same
       components, same columns, zero new math.
L3  Evidence detail (existing collapsibles + Regimes/Failures drill tabs) —
       era durability, 2025+ split, trade tables, losing streak, walk-forward link.
```

**Q2 (expand cohort cards)?** Yes — they already expand; reuse that. The new element is
the state selector *inside* Management, not a second expansion mechanism.

**Q3 (matrix)?** As a *summary/navigation* layer only (L0). A 24×6 matrix cannot carry
19-level curves; making it the primary surface would collapse the feature back into "a
recommendation matrix", which the requirement explicitly forbids. Matrix cells show
status glyphs; the evidence lives in L2.

**Q5 (compare state vs base):**
- Keep the existing **Δ Current** column (vs the cohort's current/base target level).
- Add a **base-curve overlay**: a paired mini bar/sparkline strip above the grid —
  base curve vs selected-state curve across all levels, using **Avg R per decided
  trade** at each level (Net R is n-dependent; comparing raw Net R of a 15-trade state
  against a 54-trade cohort is misleading).
- Optional **Δ Base @level** column: `avgR_state(T) − avgR_base(T)`.
- The recommendation card gains one line: "Base target 1.0R → state read: HIGHER
  (2.5R candidate)" using the four-value STATE RECOMMENDATION enum.

**Q6 (avoid overwhelm with 24 × 6):**
- Only the selected state's grid is mounted (selector, not stacked sections — 7 stacked
  19-row tables per cohort would be unusable).
- Matrix + header strips are glyphs only.
- Default state = "Whole cohort (base)" — the current view is unchanged until the user
  opts into a state.
- Expect most cells to be `n<8`: with typical cohort n of 20–120 split six ways,
  *insufficient sample is the normal case and must look normal* (quiet grey, not
  alarming red).
- A matrix filter "hide cohorts with no researched states" once the policy doc exists.

### 4.1 Keep the four semantics visually distinct (CRITICAL SEMANTICS)

| Concept | Source of truth | Visual |
|---|---|---|
| BASE TARGET | scenario rule `tpLabel` (later: locked target doc) | neutral chip `Base 1.0R` on card header + anchor row in grid ("● Current") |
| STATE-SPECIFIC TARGET | future `targetPolicy` research doc | state chip with ↑/↓ + level, only in state strip/matrix/state recommendation card |
| PM ACTION | `deployedPolicy.v1.json` / row stamps | existing labeled chip (ALWAYS ALLOW / BLOCK CHOP / FOLLOW TREND / NEVER TRADE) — untouched, never restyled to look like a target |
| STATE RECOMMENDATION | derived conclusion (BASE/SHORTER/HIGHER/BLOCK) | glyph ＝/↓/↑/⛔ + status border (see 4.2) |

BLOCK (a researched target conclusion) must not share color/wording with PM DISABLE or
scenario-disabled. Proposal: BLOCK = danger-outline glyph chip `⛔ BLOCK` with status
border; PM stays warning-orange with its existing labels; scenario-disabled stays red
"Blocked by scenario".

### 4.2 Validation-status encoding (Q4)

One orthogonal *status* dimension rendered as border/badge, never as color-of-the-number:

- `— not researched` — grey dash; no target shown.
- `n<8 insufficient` — grey dot `•`, tooltip "n=4 decided — no read" (reuses `too_small`).
- `provisional (MFE rescore)` — **dashed border** + badge `RESCORE`; live-computed from
  this run's curve.
- `backend-confirmed` — **solid border** + badge `✓ BACKEND`; requires a true scenario
  run artifact.
- optional `WF ✓` walk-forward chip when fold evidence exists.
- Full-history vs 2025+ evidence: a scope toggle inside the evidence drawer
  (`All history | 2025+`), recomputing the same grid on date-filtered rows — never a
  silently mixed number.

### 4.3 New research artifact (needed before any state recommendation is displayed)

`targetPolicy.v1.json` mirror (same checksum/loader pattern as the PM policy doc):

```json
{ "cohort_key": "EURUSD|london|bos_long",
  "base_target": { "rr": 1.0, "status": "backend_confirmed", "source_run": "…" },
  "states": {
    "Bull/Expand":   { "recommendation": "HIGHER",  "rr": 3.0,  "status": "provisional", "n": 12, "evidence": "…" },
    "Bear/Expand":   { "recommendation": "BLOCK",             "status": "provisional", "n": 8 },
    "Bull/Chop":     { "recommendation": "INSUFFICIENT",      "n": 4 } } }
```

Until this exists the UI shows: base target chip (from scenario), live per-state curves
(evidence), and `— not researched` in every status slot. **No invented recommendations —
the design renders "unresearched" as a first-class state.**

---

## 5. Concrete visual proposal (Management drill tab)

```
┌ COHORT CARD — London BOS Long ────────────────────────────────────────────────┐
│ ▸ London BOS Long   Base 1.0R   [ALWAYS ALLOW]      54T · +12.4R · PF 1.8     │
│   states: ↑ ＝ • ⛔ ＝ •        ← 6-glyph strip (hover: state, target, status) │
├─ expanded → drill tabs: Overview | Management | Failures | Trades | Regimes ──┤
│ MANAGEMENT                                                                    │
│ Market state:  [Whole cohort n=54] [Bull/Exp n=12] [Bull/Comp n=9]            │
│                [Bull/Chop n=4] [Bear/Exp n=8] [Bear/Comp n=15] [Bear/Chop n=6]│
│                state source: ENGINE                                           │
│ ┌ State read — Bull/Expand (n=12 decided) ── RESCORE (provisional) ────────┐  │
│ │ Base target 1.0R → state read: ↑ HIGHER — 2.5R candidate (+4.1R vs base   │  │
│ │ target on this subset, Medium confidence). Backend validation required.   │  │
│ └───────────────────────────────────────────────────────────────────────────┘  │
│ base curve ▁▂▃▅▆▅▄▃▂   state curve ▁▂▄▅▇▇▆▅▄   (Avg R / decided trade)        │
│ ┌ Target suitability — Bull/Expand ──────────────────────────────────────────┐ │
│ │ Target Reach% Winners Losers EstW EstL EstWR EstPF EstNetR ▮▮ ΔCur ΔBase n │ │
│ │ 0.5R   100%   …                                    +3.1   ▮▮  −2.4 −0.3 12 │ │
│ │ 1.0R ● Current …                                   +5.5   ▮▮▮  0.0 +0.4 12 │ │
│ │ 2.5R ★ Best  …                                     +9.6   ▮▮▮▮ +4.1 +1.2 12│ │
│ │ …every level 0.5→5.0, identical columns to today…                          │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│ Excursion / BE / Risk-reduction panels — same state lens applied              │
│ Evidence scope: [All history] [2025+]      WF: — not run for this state       │
└────────────────────────────────────────────────────────────────────────────────┘
```

Selecting `Bull/Chop n=4` swaps the card for the quiet insufficient-sample card
("n = 4 decided. Target guidance suppressed.") above an *optional, collapsed* raw grid
(numbers visible on demand, conclusions suppressed — evidence without a verdict).

Run-level matrix (L0, collapsed by default at top of Session Results):

```
Target policy matrix (glyphs only; click a cell to open the evidence)
             B/Exp B/Comp B/Chop Be/Exp Be/Comp Be/Chop   Base
London  BOS L   ↑     ＝     •      ⛔      ＝      •      1.0R
London  BOS S   —     —      —      —       —      —      1.0R
London  CHoCH L …                                          0.75R
… (24 rows, grouped by session; dashed cell border = provisional, solid = confirmed)
```

---

## 6. Concerns & better ideas

1. **Six states, not five.** Display the six canonical states; offer a "merge chop"
   toggle only as a *view* option (aligned with STATE_ONLY semantics), never as the
   stored granularity. Silently merging would misalign UI with `MARKET_STATES` and the
   engine columns.
2. **PM-gated runs bias per-state curves.** If PM was ON, `executedTrades` is already
   state/direction-filtered (e.g. FOLLOW TREND removed Bear-state longs), so per-state
   curves from a PM-on run are conditioned samples — and PM-blocked rows carry no MFE to
   recover them. The Management tab must show a scope warning on PM-on runs and state
   research should run on label-mode (ALWAYS ALLOW) runs. This is the single biggest
   correctness trap in the feature.
3. **Multiple-comparisons risk.** 24 cohorts × 6 states × 19 levels ≈ 2,700 cells per
   instrument; scanning them *will* surface fake RR3 spikes. Mitigations already in the
   codebase (confidence gates, reach-count < 5 ⇒ Low, plateau bars) carry over per state;
   additionally the matrix should visually de-emphasize Low-confidence "wins" and the
   state recommendation card should require Medium+ confidence, mirroring the existing
   whole-cohort recommendation logic. A plateau-width heuristic ("3 adjacent levels
   within X% of peak") would answer "is RR3 an isolated spike?" cheaply and is worth
   adding to `cohortTargetEconomics` for both cohort and state views.
4. **Unlabeled rows.** Warmup/unknown-day trades (null state) must appear as an
   explicit `Unlabeled` selector entry so state subsets always sum to the whole cohort —
   never silently dropped.
5. **Client-fallback trust.** When states come from the client port (`source:"client"`),
   badge it and consider suppressing *recommendations* (curves OK, conclusions need
   engine labels — matches the existing engine-preferred doctrine).
6. **Performance.** 19-level rescore over ≤ a few hundred rows is trivial; computing
   only the selected state's panels (lazy, as today's drilldown already mounts on open)
   keeps the 24-cohort page cheap. The L0 matrix needs one pass over all trades
   (group by cohort×state, count + cached rescore peak) — memoize like
   `buildSessionResults`.
7. **C3/C4.** Keep the run/variant as the axis that separates C3 from C4 (as today —
   drilldowns reflect the viewed run's variant). Do not create a combined C3+C4 state
   grid; cross-variant comparison stays in Variant Overlap / Comparison Lab.
8. **Ladder.** Decide canonical increments (current mixed 0.1/0.25 ladder vs uniform
   0.25) before per-state adoption so base and state curves are always level-aligned —
   Δ Base @level requires identical ladders.
9. **Better idea worth considering:** since the same "lens" concept applies to
   Failures/Regimes drill tabs, implement the state selector as a small
   `useStateLens(cohort)` hook returning filtered row sets + provenance, so any drill
   tab can opt in later without new plumbing.

---

## 7. Implementation surface (for sizing only — not started)

- `data/sessionResults.js`: add `groupRowsByMarketState(rows)` (uses
  `resolveTradeMarketState`; buckets 6 states + Unlabeled) — everything downstream
  reuses existing pure functions.
- `SessionResults.jsx`: state selector row + state-aware titles/cards in the Management
  drill tab; glyph strip on cohort header; optional L0 matrix section.
- New `data/targetPolicy.js` + `targetPolicy.v1.json` mirror (loader clone of
  `portfolioPolicy.js`) — only when research produces conclusions.
- Optional: plateau-width metric in `cohortTargetEconomics`; 2025+ scope filter;
  per-cohort losing-streak helper.
