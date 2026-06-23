# BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md

**Mode:** AUDIT / SPEC ONLY — no code implemented, no files changed.
**Date:** 2026-06-10 · **Branch:** `codex-dev`
**Prereqs read:**
- `frontend/src/data/importer.js` — all mapped trade fields, candle ingestion
- `frontend/src/components/lab/failures/shared/excursionAnalytics.js` — `buildBeOpportunity`, `buildBeExclusiveRanges`, `buildMfeDistribution`, upper-bound guardrail
- `frontend/src/pages/ProtectionLab.jsx` — exact protection rows, `buildExactProtectionRows`, `exactProtectionRow`, mode ingestion
- `frontend/src/components/lab/protection/protectionAnalytics.js` — `calcEfficiencyRatio`, `buildPenetrationSweep`, `buildPairedTrades`, equity curves
- `PROTECTION-LAB-INTEGRITY-AUDIT-1.md` — five integrity blockers (label/metric mismatch, estimate ranking, winner cost, drawdown sign, field optionality)
- `PROTECTION-LAB-RESTRUCTURE-PLAN-1.md` — verdict-first redesign with A1/A2/A3 tier separation
- `FAILURES-LAB-V2-MFE-MODULE-SPEC-1.md` — MFE data audit, confirmed mfeR scale, targetRR derivation
- `FAILURES-LAB-V4-ARCHITECTURE-AUDIT-1.md` — Distance To Stop / BE Opportunity design, upper-bound mandate

---

## Executive Position

The current Distance To Stop / BE Opportunity surface is an **honourable hypothesis generator**
with a clearly documented limitation: it uses **peak MFE only** and cannot answer whether price
returned to entry after BE armed. That upper-bound framing is correctly enforced in
`excursionAnalytics.js` and labelled in the UI.

True BE Replay requires a different system. The core question is not "which losers reached arm
level?" but "if I had moved my stop to entry after reaching arm level, what would my equity
curve, Net R, max drawdown, and winner count actually look like?"

This audit determines **exactly how to build that system**, where it lives, what data it needs,
and what the architecture is.

---

## PHASE A — Current Data Availability Audit

### A.1 Fields present in `importer.js` (per trade)

| Field | Import key | Available | Notes |
|---|---|---|---|
| `mfeR` | `mfe_r` | ✓ | Stop-anchored R; confirmed in FAILURES-LAB-V2-MFE-MODULE-SPEC-1 |
| `maeR` | `mae_r` | ✓ | Max adverse excursion in R |
| `maeRToOriginalExit` | `mae_r_to_original_exit` | ✓ (newer exports) | Bounded by original exit, not stop |
| `rIfNoTarget` | `rif_no_target` | ✓ | R if TP removed |
| `minutes_to_exit` | `minutes_to_exit` | ✓ | Total trade duration |
| `candlesToFailure` | `candles_to_failure` | ✓ | Candle count fill → exit |
| `fill_candle_index` | `fill_candle_index` | ✓ | Candle array index at fill |
| `exit_candle_index` | `exit_candle_index` | ✓ | Candle array index at exit |
| `arm_candle_index` | `arm_candle_index` | ✓ | Candle index when armed |
| `trigger_candle_index` | `trigger_candle_index` | ✓ | Candle index at trigger |
| `same_candle_exit` | `same_candle_exit` | ✓ | Boolean; exit = fill candle |
| `fill_candle_open/h/l/c` | `fill_candle_*` | ✓ | OHLC of the entry candle |
| `entry` (price, time) | `fill`, `fill_time` | ✓ | Entry price + timestamp |
| `sl` | `sl` | ✓ | Original stop-loss price |
| `tp` | `tp` | ✓ | Take-profit price |
| `rr_config` / run `rr` | per trade / summary | ✓ | RR multiple to derive arm in price |
| `direction` | `side` | ✓ | Long / short |
| `netR` | derived | ✓ | Realized R for the trade |
| Candle OHLC array | `candles.csv` | **OPTIONAL** | Present only if user includes it in bundle |

### A.2 Fields NOT present per trade

| Required for BE Replay | Status | Notes |
|---|---|---|
| Candle-by-candle path after entry | **ABSENT per trade** | Not stored on trade rows. Available ONLY via candles.csv slice (fill_candle_index → exit_candle_index). |
| Timestamp when price first reached arm level | **ABSENT** | Not exported by backend. |
| Whether price returned to entry after BE armed | **ABSENT** | Not exported. No retrace event. |
| BE trigger event (armed + stopped) | **ABSENT** | No such field. |
| Net R under a given BE scenario | **ABSENT** | Not computable without path. |
| Exit R for a BE-triggered trade | **ABSENT** | Not in trade row. |

### A.3 candles.csv — what it gives us

The importer ingests `candles.csv` as a global OHLC array (time · o · h · l · c · index).
`buildCandleIndex` creates a time→index lookup. `computeTradeMarkers` maps trades to candle
positions. This means for any trade with a `fill_candle_index` and `exit_candle_index`, we can
**slice the global candle array** to recover the intra-trade price path.

This is the pivotal finding for frontend replay.

### A.4 Answers to the seven Phase-A questions

1. **Do we have candle-by-candle path after entry?**
   YES — but only if `candles.csv` is present in the bundle, and the trade's `fill_candle_index`
   / `exit_candle_index` are both populated. This is *conditional* availability. Not guaranteed
   for all users or all exports.

2. **Do we know when price first reached BE arm level?**
   NO from the trade row directly. YES if we walk the candle slice. The arm level in price is
   derived: `armPrice = entry + (armLevelR × stopDistance)` for longs, subtracted for shorts,
   where `stopDistance = |entry − sl|`.

3. **Do we know whether price returned to entry after BE armed?**
   NO from the trade row. YES from the candle slice — but only at candle resolution (OHLC wicks),
   not tick-level. Same-candle ambiguity applies.

4. **Can we model winner cost accurately?**
   At candle resolution: YES with stated precision — a candle-walk can detect whether a winner's
   path dipped to (or below) entry before reaching TP. Precision caveat: if arm and retrace happen
   on the same candle, outcome is ambiguous (see Phase H).

5. **Can we model loser savings accurately?**
   At candle resolution: YES — a loser that armed BE and subsequently returned to entry would have
   exited at ~0R (or a small buffer) instead of its realized loss.

6. **Can we calculate changed exit R?**
   YES from candle walk:
   - If BE triggers: exit R ≈ 0 (or entry + buffer in R terms).
   - If BE does not trigger: original exit R unchanged.

7. **Can we calculate max drawdown change?**
   YES — rebuild the equity curve from per-trade adjusted R values. Standard cumsum, same logic
   as `computeEquityCurve` in importer.js.

### A.5 Summary verdict

**Frontend-only replay is POSSIBLE with candles.csv, with important caveats.** It operates at
candle resolution (not tick), cannot model spread mid-candle, and requires `candles.csv` to be
present and indexed. For production, backend exact replay is superior. The architecture
recommendation is a **two-phase approach**: frontend candle-walk for rapid research iteration,
backend for authoritative scenario results.

---

## PHASE B — Backend vs Frontend Responsibility

### B.1 Options evaluated

**Option A — Frontend estimate only (current state)**
`buildBeOpportunity` in `excursionAnalytics.js`. Uses `mfeR` only. Cannot model retrace,
winner cost, or changed equity. Correctly labelled as an upper bound. Value: hypothesis
generation only. **Already exists. Nothing to build here.**

**Option B — Frontend replay from candles.csv (candle-walk)**
Walk each trade's candle slice. Apply BE logic (arm → retrace check → exit). Compute per-trade
adjusted R. Rebuild equity curve. All in the browser.

Pros: no backend changes required; interactive (change arm level without re-export); the
candle data already ingested; works against existing bundles that include candles.csv.

Cons: requires candles.csv (optional, not always included); candle resolution only (OHLC,
not ticks); spread/slippage not modelled; for a 2,000-trade run with 20 candles avg, that is
40,000 OHLC comparisons — fast in JS but must be memoized across arm levels; same-candle
ambiguity requires explicit conservative handling.

**Option C — Backend exact replay using tick/candle data**
Backend walks trade price paths with full tick resolution, exact spread, exact slippage, news
flattening, and multi-position awareness. Produces scenario export files in the same format as
the existing protection export (`protection_trades_BE_0.5R.csv`, summary, etc.).

Pros: authoritative; handles spread exactly; can run multiple arm levels in one pass; compatible
with the existing `protectionTradesByMode` ingestion pipeline without frontend changes; fundable
account survival metrics can be added cleanly here.

Cons: requires backend change; user must re-export to change arm level; adds export file size.

**Option D — Backend/exporter generates BE scenario runs**
A variant of C where the backend generates BE scenario files automatically when a normal run
completes, at a predefined set of arm levels (e.g. +0.25R, +0.5R, +0.75R, +1R).

Pros: no user action required; results always current.
Cons: quadruples export size (4× the trade files); changes the export contract; may be
premature to auto-generate before the user has chosen a strategy.

### B.2 Recommendation

**Phase 1: Option B (frontend candle-walk)** for rapid research and the Protection Lab tab.
This lets us build and validate the full BE Replay experience against real data without waiting
for backend changes. It makes candles.csv a required condition for the feature and states the
precision level clearly.

**Phase 2: Option C (backend exact replay)** for production-grade results. The backend
generates scenario files per arm level on request. The frontend consumes them via the existing
protection ingestion pipeline, replacing candle-walk estimates with exact figures.

**Option D (auto-generate)** is deferred — the arm level is a user research choice, not a
default.

### B.3 Risks if frontend-only permanently

- Candle-resolution errors accumulate across hundreds of trades. A 0.05R rounding error per
  trade × 1,000 trades = ±50R of phantom accuracy.
- Spread not modelled: for a 1-pip spread instrument a "break-even" exit at entry is actually
  −1 pip (the spread). If a user acts on the frontend result without modelling spread, they may
  overestimate savings.
- Same-candle ambiguity: on a candle where both arm level AND entry retrace happen, the frontend
  walk must choose conservatively (see Phase H). This systematically slightly underestimates
  savings relative to the true figure.
- Multi-position mode: if the backend uses partial fills, the "entry price" is a volume-weighted
  average. The frontend replay uses the single `fill` price, which may misplace the BE stop.

---

## PHASE C — BE Replay Model

### C.1 Parameter space

```
arm_level_r:   0.25 | 0.5 | 0.75 | 1.0 | custom (float > 0)
be_stop_level: "entry"           → stop moved exactly to entry price
               "entry_spread"    → entry + 1× spread (long: minus; short: plus)
               "entry_buffer_r"  → entry ± (buffer_r × stop_distance)
               "entry_fees"      → entry adjusted for fees/commission (future)
trigger_basis: "wick"            → candle high/low touches arm level
               "close"           → candle close crosses arm level
               "next_candle"     → first candle AFTER a wick-touch candle opens; BE activates on open
delay_candles: 0 | 1 | 2 | N    → additional candles of delay after trigger basis met
direction:     derived from trade.side ("bull" = long; "bear" = short)
```

### C.2 Arm price derivation

```
stop_distance = |entry_price − sl_price|      // always positive
arm_price_long  = entry_price + (arm_level_r × stop_distance)
arm_price_short = entry_price − (arm_level_r × stop_distance)
be_stop_price_long  = entry_price − (be_buffer_r × stop_distance)   // 0 for "entry"
be_stop_price_short = entry_price + (be_buffer_r × stop_distance)
```

Both `entry_price` and `sl_price` are on the trade row; `stop_distance` is always derivable.

### C.3 Per-trade candle-walk algorithm (frontend Option B)

```
Given: trade T, candle_slice = candles[fill_candle_index .. exit_candle_index], arm_level_r, be_stop_level, trigger_basis, delay_candles

state = "watching"   // → "armed" → "exited"
arm_triggered_at = null
result = { triggered: false, exit_r: T.netR, outcome: "original" }  // default: unchanged

for each candle C in candle_slice (index i, starting AFTER fill candle):
  if state == "watching":
    armed = (T.direction == "long"  && C.h >= arm_price)
          ||(T.direction == "short" && C.l <= arm_price)
    if armed:
      if trigger_basis == "wick":        arm_triggered_at = i
      if trigger_basis == "close":
        armed = (T.direction == "long"  && C.c >= arm_price)
              ||(T.direction == "short" && C.c <= arm_price)
        if armed: arm_triggered_at = i
      if trigger_basis == "next_candle": arm_triggered_at = i + 1  // activate on next open
      if arm_triggered_at != null:
        if delay_candles > 0: arm_triggered_at += delay_candles
        state = "armed"

  else if state == "armed" && i >= arm_triggered_at:
    // Check if price returned to BE stop level
    stopped = (T.direction == "long"  && C.l <= be_stop_price)
            ||(T.direction == "short" && C.h >= be_stop_price)
    // Check if TP still reached (winner case)
    tp_hit  = (T.direction == "long"  && C.h >= T.tp)
            ||(T.direction == "short" && C.l <= T.tp)

    if tp_hit && stopped:
      // Same-candle ambiguity — conservative: use TP if arm level was armed on a PRIOR candle;
      // else conservative assumption = BE stop hit first (see Phase H).
      if (arm_triggered_at < i): result = { triggered: false, exit_r: T.netR, outcome: "original_winner" }
      else:                      result = { triggered: true,  exit_r: be_exit_r(T), outcome: "be_stopped" }

    else if tp_hit:
      result = { triggered: false, exit_r: T.netR, outcome: "original_winner" }
      break

    else if stopped:
      result = { triggered: true, exit_r: be_exit_r(T, be_stop_price), outcome: "be_stopped" }
      break

// If we exhaust candles without triggering, original exit stands.
return result
```

`be_exit_r(T, be_stop_price)`:
- For "entry" mode: `exit_r ≈ 0` (may be a small negative for spread if modelled).
- For buffer modes: `exit_r = (be_stop_price − entry_price) / stop_distance` (signed by direction).

### C.4 Per-trade outcome classification

Every trade under a given BE scenario gets one of:
- `original_winner` — trade won before BE armed, or BE armed but TP hit before stop (unchanged)
- `original_loser` — trade lost, BE never armed (never reached arm level) — unchanged
- `be_stopped_loss_saved` — was a loser, BE armed, price returned to entry → saved
- `be_stopped_winner_cut` — was a winner, BE armed, price returned to entry before TP → cut
- `be_armed_never_triggered` — BE armed, but trade exited via original stop/TP without retrace
  (rare edge: trade moved far in favour, retraced partially but not to entry, then ran to TP
  or stopped — outcome is the same as original)

### C.5 Handling original exit events

The trade row carries `same_candle_exit` and `exit_candle_index`. The candle walk must
terminate at `exit_candle_index` regardless of BE state. If BE is armed but the original exit
occurs before retrace, the original exit stands.

---

## PHASE D — Output Metrics

For each scenario (defined by arm level + BE stop level + trigger basis):

### D.1 Required metrics

| Metric | Definition | Source |
|---|---|---|
| `net_r` | Sum of all per-trade adjusted R | Candle-walk adjusted R |
| `delta_net_r` | `net_r − baseline_net_r` | Computed |
| `profit_factor` | Sum winners / |sum losers| | Computed from adjusted R |
| `delta_pf` | `profit_factor − baseline_pf` | Computed |
| `win_count` | Trades ending with positive R | Count |
| `loss_count` | Trades ending with negative/zero R | Count |
| `be_exits_count` | Trades exiting via BE stop (either saved or cut) | Count |
| `winners_cut` | `original_winner` → `be_stopped_winner_cut` transitions | Count |
| `losses_saved` | `original_loser` → `be_stopped_loss_saved` transitions | Count |
| `avg_winner_r_reduction` | Avg R lost vs original for winners that were cut | R |
| `avg_loser_r_improvement` | Avg R saved vs original for losers that were saved | R |
| `winner_r_cost` | Total R lost from cut winners | R |
| `loser_r_saved` | Total R gained from saved losers | R |
| `efficiency_ratio` | `loser_r_saved / winner_r_cost` (>1 = worthwhile) | Ratio |
| `max_drawdown` | Max equity drawdown under BE scenario | R, ≤ 0 |
| `delta_max_dd` | `max_drawdown − baseline_max_dd` | R (positive = improvement) |
| `worst_loss_streak` | Longest consecutive negative-R run | Integer |
| `delta_worst_streak` | vs baseline | Integer |
| `trade_count` | Unchanged by construction | = baseline |
| `fill_count` | Unchanged by construction | = baseline |
| `arm_rate` | `(losses_saved + winners_cut + be_armed_never_triggered) / trade_count` | % |
| `coverage_pct` | % of trades that have candle path data (replay quality gate) | % |

### D.2 Equity curve data

Per-trade sequence of cumulative R under the BE scenario. Enables overlay comparison against
the baseline equity curve. Same structure as existing `computeEquityCurve` output.

### D.3 Future funded-account metrics (design now, build later)

These are NOT implemented in Phase 1–2 but must be designed so the data contract supports them:

- `daily_dd_breach_rate` — % of trading days where intraday drawdown exceeds daily DD limit
- `total_dd_breach_rate` — % of runs where cumulative drawdown exceeds the total DD limit
- `challenge_survival_improvement` — delta in estimated challenge pass rate under BE vs baseline
- `consistency_score` — how evenly distributed daily P&L is under BE (funded prop requirements)

These require per-trade timestamps (already present as `fill_time`) and a parameterized DD limit
(from the funded account challenge config). The per-trade adjusted-R output from Phase 1 is the
correct input — no structural change needed, just additional aggregation over timestamped R values.

---

## PHASE E — UI Design: Protection Lab → Break-even Protection Tab

### E.1 Tab placement and mental model

Protection Lab currently has: Overview · Deep Dive · Research tabs (per
`PROTECTION-LAB-RESTRUCTURE-PLAN-1.md`'s design intent).

Break-even Protection is a fourth tab: `Overview | Deep Dive | Break-even | Research`.

Why a dedicated tab, not a panel within an existing tab:
- BE Replay produces a full scenario comparison with its own equity curve, comparison table,
  and breakdown panels — the same weight as the exact protection backtest analysis.
- Mixing it into "Research" would embed scenario output next to estimates, violating the
  A1/A2/A3 tier separation from `PROTECTION-LAB-RESTRUCTURE-PLAN-1.md`.
- Distance To Stop (in Failures Lab) is hypothesis generation. Protection Lab → Break-even is
  validation. Separating them structurally enforces the epistemic gap.

### E.2 Confidence tier for BE Replay results

BE Replay from candle-walk is NOT an upper-bound estimate (it models retrace), but it is also
NOT an exact backtest (candle resolution, no spread). It belongs in a new confidence tier:

```
Exact backtest (backend, tick-level)  →  EXACT
BE candle-walk (frontend, OHLC)       →  REPLAY (new tier)
MFE upper-bound estimate              →  ESTIMATE (existing, stays in Failures Lab)
```

The "REPLAY" chip is visually distinct from both EXACT and ESTIMATE, and its tooltip explains
the precision: "Candle-resolution replay. Assumes wick-touch trigger. Spread not modelled."

### E.3 Page layout

```
┌─────────────────────────────────────────────────────────────┐
│  BREAK-EVEN PROTECTION                                       │
│  ─────────────────────────────────────────────────────────  │
│  VERDICT HERO                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BE at +0.5R  →  Net R +18.4R  ·  12 winners cut   │   │
│  │  Losses saved: 23  ·  Winner cost: −4.2R            │   │
│  │  Efficiency: 1.9×  ·  Max DD improved −2.1R         │   │
│  │  [REPLAY]  Candle-walk · spread not modelled        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  SCENARIO CONTROLS                                           │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Arm level:    [0.25R] [0.5R] [0.75R] [1R] [...]  │    │
│  │  BE stop:      [Entry] [Entry+spread] [Entry+buf]  │    │
│  │  Trigger:      [Wick] [Close] [Next candle]        │    │
│  │  Delay:        [0] [1] [2] candles                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  SCENARIO COMPARISON TABLE                                   │
│  ┌──────────┬──────┬───────┬──────┬──────┬───────┬──────┐ │
│  │ Scenario │ NetR │ ΔNetR │ PF   │ MaxDD│ Saved │ Cut  │ │
│  ├──────────┼──────┼───────┼──────┼──────┼───────┼──────┤ │
│  │ Baseline │  —   │   —   │ 1.42 │ −8.2 │   —   │  —   │ │
│  │ BE +0.25R│+2.1R │  +2.1 │ 1.51 │ −7.9 │   8   │  3   │ │
│  │ BE +0.5R │+18.4R│ +18.4 │ 1.82 │ −6.1 │  23   │ 12   │ │
│  │ BE +0.75R│+14.2R│ +14.2 │ 1.74 │ −6.8 │  19   │ 14   │ │
│  │ BE +1.0R │ +8.8R│  +8.8 │ 1.63 │ −7.2 │  14   │ 15   │ │
│  └──────────┴──────┴───────┴──────┴──────┴───────┴──────┘ │
│  Full columns: NetR · ΔNetR · PF · ΔPF · MaxDD · ΔMaxDD · │
│                Saved · Cut · BE exits · Efficiency · Streak │
│                                                              │
│  EQUITY CURVE COMPARISON                                     │
│  [Baseline vs selected scenario overlay, same canvas as     │
│   existing ProtectionVisualAnalytics equity component]      │
│                                                              │
│  WINNER COST PANEL                            (right/below) │
│  "These N winners would have been cut"                      │
│  Avg R reduction · Distribution · Setup breakdown           │
│                                                              │
│  LOSSES SAVED PANEL                           (right/below) │
│  "These N losers would have been saved"                     │
│  Avg R saved · Distribution · BE arm rate                   │
│                                                              │
│  [Eventually: Session · Structure · Direction breakdown]    │
└─────────────────────────────────────────────────────────────┘
```

### E.4 Verdict language for Break-even tab

Unlike the exact protection verdict (Helping/Neutral/Hurting), BE Replay produces a research
verdict calibrated to its REPLAY confidence tier:

| Verdict | Condition | User message |
|---|---|---|
| **Likely Helpful** | Net R improves AND efficiency > 1.0 AND drawdown not worse | "Candle-walk suggests BE at +XR improves this strategy — validate with exact backtest." |
| **Mixed** | Net R improves but winners cut heavily (efficiency < 1.0) or DD worse | "Net R gains but at significant winner cost. Review breakdown before acting." |
| **Unlikely to Help** | Net R neutral or negative across all arm levels | "BE protection does not appear to benefit this strategy." |
| **Insufficient Data** | candles.csv absent or < 30% of trades have candle coverage | "Candle path data needed. Include candles.csv in your export bundle." |

The verdict can never say "Use this" — that language is reserved for EXACT confidence tier.

### E.5 Future breakdowns (Phase 3+)

- Session filter: "Does BE help in London but hurt in New York?"
- Structure filter: "Is BE more effective on CHoCH vs BOS?"
- Direction filter: "Long vs short BE performance"
- MFE bucket integration: "Which MFE bucket produces the most saves?"
- Setup (fill state): "Is BE more valuable on Vacant vs Occupied setups?"

These are pure filter/slice operations on the per-trade replay output — the data model supports
them from Phase 1 without structural change.

---

## PHASE F — Connection to Distance To Stop

### F.1 Current Distance To Stop → BE Opportunity flow

```
Distance To Stop (Failures Lab)
  ├─ buildMfeDistribution()      — bucket histogram (realized, upper bound)
  ├─ buildBeOpportunity()        — per arm level, losers that reached it + savable R (UPPER BOUND)
  └─ buildBeExclusiveRanges()    — exclusive MFE partition (where did losers peak?)
```

All three carry `upperBound: true`. The current design correctly limits the claim to "which
losers reached arm level" and "how much loss-R they carry." It never claims to know the actual
BE outcome.

### F.2 The bridge: "Promote BE Hypothesis"

Distance To Stop should gain a **Promote action** (conceptually, not necessarily a button in
Phase 1) that carries its BE Opportunity finding into Protection Lab → Break-even.

**Data flow:**

```
Distance To Stop finds:
  "27 losers (38%) reached +0.5R — potentially 14.2R savable (upper bound)"

Promotes to Protection Lab → Break-even:
  suggested_arm_level = 0.5R
  source_finding = "Distance to Stop: 27 losers reached this level"
  upper_bound_caveat = "14.2R is the maximum if all retrace to entry; winner cost not included"
  rationale = "Highest loss-R concentration in the 0.5–1R exclusive band"

Protection Lab → Break-even replays at +0.5R and shows:
  actual_net_r_change = +8.4R
  vs upper_bound = 14.2R  ← the gap (winner cost + non-retrace losers)
```

### F.3 Implementation of the bridge

In Phase 1, this is a **documentation/UX relationship**, not an automated data pipe:
- Distance To Stop's BE Opportunity table has a note: "Validate in Protection Lab → Break-even."
- Protection Lab → Break-even has a note: "Hypothesis from Distance To Stop."
- The arm level control in BE Replay defaults to the arm level with highest concentration in
  the Distance To Stop exclusive ranges.

In Phase 2+, a `promotedBeHypothesis` object can be passed from the Failures Lab context to
the Protection Lab context, pre-populating the arm level control.

### F.4 Preserving Distance To Stop's role

Distance To Stop is NOT deprecated by BE Replay. Its roles post-BE Replay:

1. **Fast initial screen** — before running a full candle-walk replay, the bucket histogram
   immediately shows whether BE is even worth testing ("80% of losers never moved in favour"
   → skip BE entirely).
2. **Hypothesis generator** — identifies which arm levels are worth testing in the replay.
3. **Setup-level insight** — MFE × structure / session breakdown tells you *which setups*
   deserve BE testing, independent of the replay's whole-portfolio verdict.
4. **Light-bundle fallback** — if the user does not have candles.csv, Distance To Stop is
   still available; BE Replay shows a "Needs data" state.

---

## PHASE G — Implementation Roadmap

### Phase 0 — Architecture + Exporter Audit (this document)
**Owner:** Claude (architecture) · Codex (exporter audit)
- Files: `BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md` (this file)
- Backend: identify which backend modules generate trade rows and whether `fill_candle_index` /
  `exit_candle_index` are currently populated for all runs
- Frontend: confirm candles.csv availability rate across typical user exports
- Validations: check `arm_candle_index`, `fill_candle_index`, `exit_candle_index` are non-null
  in a representative import; confirm `stop_distance` derivable from `fill` + `sl` on all trades
- Risks: if `fill_candle_index` / `exit_candle_index` are not populated in most exports,
  Phase 1 frontend replay is blocked and Phase 2 backend becomes Phase 1

### Phase 1 — Frontend BE Candle-Walk Prototype
**Owner:** Codex (engine) · Claude (UI)
- Files:
  - NEW `frontend/src/data/beReplay.js` — `replayBe(trades, candles, params)` pure function;
    per-trade outcome classification; scenario summary builder; equity curve builder
  - NEW `frontend/src/data/__validation__/beReplay.validate.mjs` — assertions against known
    input/output fixtures
  - MOD `frontend/src/pages/ProtectionLab.jsx` — add Break-even tab; wire candle availability
    gate; render verdict hero, scenario controls, comparison table, equity overlay
  - NEW `frontend/src/components/lab/protection/BeScenarioTable.jsx` — comparison table
    component
  - NEW `frontend/src/components/lab/protection/BeEquityOverlay.jsx` — baseline vs scenario
    equity overlay (may reuse ProtectionVisualAnalytics canvas)
- Backend requirements: none (uses existing candles.csv + trade fields)
- Validations: `beReplay.validate.mjs`; manual spot-check 5 known trades against candle-walk
  by hand; confirm `winners_cut + losses_saved + unchanged = total_trades`
- Risks: candles.csv absent for users → gate cleanly; same-candle ambiguity → document
  the conservative assumption used; performance → memoize by (trades hash, params hash)

### Phase 2 — Backend Exact BE Replay
**Owner:** Codex (backend; Lux-OB-Backtester)
- Files (backend):
  - NEW `be_replay.py` (or similar) — exact BE replay engine using tick/candle data at
    backtester resolution; outputs per-trade scenario CSVs + summary in protection export format
  - MOD existing protection export format to add `be_arm_level_r`, `be_stop_buffer_r`,
    `be_trigger_basis`, `be_exit_r` per trade
- Files (frontend):
  - MOD `frontend/src/data/importer.js` — map new BE scenario fields from protection import
  - MOD `frontend/src/pages/ProtectionLab.jsx` — detect backend-exact BE results; upgrade
    confidence tier from REPLAY → EXACT; render exact verdict
- Backend requirements: access to the same price series used in the original backtest run;
  ability to parameterize arm level + stop buffer + trigger basis
- Validations: run baseline + BE +0.5R scenario on a known dataset; compare per-trade outcomes
  between frontend candle-walk and backend exact; acceptable delta < 2R on total Net R for a
  clean dataset (spread-agnostic); document larger deltas
- Risks: tick data may not be stored post-run; re-running at different arm levels requires
  replaying from stored tick data; may need to store minimal trade path data per trade

### Phase 3 — Scenario Controls + Filters
**Owner:** Claude
- Files: MOD `ProtectionLab.jsx` (Break-even tab controls)
- Add: session filter · structure filter · direction filter · custom arm level input
- Validations: sub-filtered equity curves sum to population equity curve; sample floor gates

### Phase 4 — Winner Cost / Loss Saved Breakdowns
**Owner:** Claude
- Files: NEW `BeWinnerCostPanel.jsx`, `BeLossSavedPanel.jsx`
- Show: per-trade list of cut winners with their original R vs BE R; per-trade list of saved
  losers with their original R vs 0R; MFE bucket breakdown of saves
- Validations: sum of winner R reductions = `winner_r_cost`; sum of loser savings = `loser_r_saved`

### Phase 5 — Funded Account Survival Metrics
**Owner:** Claude (UI) · Codex (aggregation)
- Files: NEW `beFundedMetrics.js` — `computeDailyDdBreachRate`, `computeTotalDdBreachRate`
  (parameterized on funded challenge config: daily DD limit, total DD limit, account size)
- Prerequisites: per-trade adjusted R with timestamps (available from Phase 1 output);
  funded challenge config (new user input — account size, limits)
- Validations: known-manual daily R sequence → verify breach count; edge case: breach on
  first day; edge case: recovery after breach

---

## PHASE H — Risks and Integrity Guardrails

### H.1 Same-candle ambiguity — MUST document assumption

A wide-ranging candle can simultaneously have its high above arm level AND its low at (or
below) entry. On the same candle, it is impossible to know from OHLC alone whether arm was
reached before the retrace or after.

**Mandatory conservative assumption:**
- If arm candle == retrace candle: treat as BE stop triggered (conservative — assumes worst
  for the winner, best for the loser). This **slightly underestimates** benefits (we count
  some winners as cut when they may have reached TP first) but it is the safer direction.
  The alternative (assuming TP hit first) would overestimate savings.
- Every output must note: "Same-candle events treated conservatively (BE stop assumed to
  trigger before TP on identical arm-and-retrace candles)."

### H.2 Spread not modelled in frontend candle-walk

A BE exit at "entry" is actually at `entry − spread_pips` for a long (or + for a short).
For a 1.5-pip spread instrument and a trade with a 5-pip stop, the real BE exit R is
`−0.3R`, not `0R`.

**Guardrail:** In "entry" be_stop_level mode, the frontend MUST label savings as "~0R
(spread not modelled)." The "entry_spread" mode is the correct option for traders who want
to account for this. Do not silently assume 0R exit.

### H.3 Slippage

Even with exact stop placement, a stop order may fill beyond the stop level in a fast market.
This is a real-world risk that candle-walk replay cannot model.

**Guardrail:** Note in the UI: "Replay assumes stop fills at the specified level. Real slippage
on BE stop exits is not modelled."

### H.4 Fees / commission

A BE exit at ~0R with a round-trip commission of, say, 0.1R per trade is actually a −0.1R
trade. For strategies with tight stops and high trade frequency, this is material.

**Guardrail:** `be_stop_level = "entry_fees"` (Phase 3) lets the user specify a commission
in R. Until implemented, note: "Commission on BE exits not included."

### H.5 Partial exits / partial fills

If the backtester supports partial fills (e.g. two entries at different prices), the `fill`
price is a weighted average, not a single price. The BE stop placed "at entry" would be at
the average fill — which may not be a valid price level in the candle series.

**Guardrail:** Detect `fill_delay_candles > 0` or `filled_on_trigger_candle = false` as
proxies for potential partial fills. Flag those trades' BE results as approximate.

### H.6 News / forced flattening

Some trades in the backtester may be force-closed on news events. If a trade is force-closed
before the BE stop triggers, the BE replay must preserve the force-close outcome.

**Guardrail:** If `protection_exit_reason == "news_flatten"` or similar, the original exit
stands regardless of BE state. The candle-walk must check the original exit candle index as
a hard termination point.

### H.7 Multi-position mode

If multiple trades are open simultaneously, BE stop on one trade does not affect others.
The candle-walk correctly handles this (it replays each trade independently). However,
the equity curve reconstruction must preserve chronological order to produce a valid drawdown
figure.

**Guardrail:** Sort trades by `fill_time` before building the equity curve. This is the
same requirement as the existing `computeEquityCurve` in `importer.js`.

### H.8 Long vs short path handling

Arm level is above entry for longs, below for shorts. Retrace is back toward entry from the
arm side. The candle-walk algorithm uses direction-aware comparisons throughout. A bug where
long logic is applied to a short trade would produce silently wrong results.

**Guardrail:** The validation suite (`beReplay.validate.mjs`) MUST include both a long and a
short fixture with manually verified expected outcomes.

### H.9 Delayed BE trigger validity

When `delay_candles > 0`, the BE stop only activates N candles after the arm level is reached.
If the trade exits before the delay completes (e.g. rapid spike to arm level then immediate
reversal), BE never activates.

**Guardrail:** The candle-walk must check `i < arm_triggered_at` (not yet active) and keep
`state == "armed_pending"` until the delay lapses. If the original exit arrives during the
pending period, the original exit stands.

### H.10 Stale data / old export bundles

Users may run BE Replay against old exports that were generated before `fill_candle_index` /
`exit_candle_index` were added to the exporter. In this case, the candle-walk cannot proceed.

**Guardrail:** Compute `coverage_pct = trades_with_candle_indices / total_trades`. If
`coverage_pct < 0.8`, show a degraded-data warning. If `coverage_pct == 0`, show "Needs
data: re-export with candle path fields."

### H.11 MFE-only overestimation trap — the fundamental integrity rule

Distance To Stop's `buildBeOpportunity` produces an upper bound by design. **BE Replay must
never reference or display that upper-bound figure alongside its own results as if they are
comparable.** The confusion risk:

- Distance To Stop says: "14.2R potentially savable at +0.5R"
- BE Replay says: "Net R improves by +8.4R at +0.5R"
- A naive UI showing both might imply the remaining 5.8R was lost to "winner cost"

But the 14.2R upper bound already excludes winner cost, non-retrace losers, and spread. It
is not a budget to explain. The two numbers have different definitions and must never be
presented as reconciling figures.

**Guardrail:** Distance To Stop shows savable loss-R upper bound only (framed as loss-R
that would BE-arm, not as outcome). BE Replay shows net-R change. If both are shown on the
same screen, clear labelling: "Upper bound (MFE only)" vs "Replayed result."

### H.12 Do not mistake candle-walk for an exact backtest

The REPLAY confidence tier exists precisely to prevent this. All UI copy for the BE Replay
feature must include the qualifier "candle-resolution replay" or "candle-walk estimate"
in any summary or export. The EXACT tier is reserved for Phase 2 backend results only.

---

## Summary Deliverables

### 1. Current data availability verdict

**Conditional.** `mfeR`, entry price, stop price, direction, `fill_candle_index`,
`exit_candle_index` are present on trade rows. Candle-by-candle intra-trade path is
recoverable by slicing the global `candles.csv` array. candles.csv is **optional** in
current export bundles — its presence is the gating condition for frontend replay.

### 2. Whether frontend-only replay is possible

**Yes, with stated constraints.** Candle resolution (OHLC, not ticks). Spread not modelled
(unless user selects `entry_spread` stop mode). Same-candle ambiguity handled conservatively.
Results carry REPLAY (not EXACT) confidence tier. Suitable for research; not for production
trading decisions without backend exact validation.

### 3. Recommended architecture

**Two-phase.**
- Phase 1: `beReplay.js` frontend candle-walk engine, REPLAY confidence tier.
- Phase 2: Backend exact replay (Lux-OB-Backtester), EXACT confidence tier, consuming the
  existing protection export pipeline.

### 4. Required backend/export changes

Phase 1: None (uses existing fields).
Phase 2:
- `be_arm_level_r` per trade (parameterized scenario)
- `be_triggered` boolean per trade
- `be_exit_r` per trade
- `be_exit_candle_index` per trade (for consistency checking)
- BE summary row in protection_results with standard protection metric names
  (`baseline_winners_cut`, `loser_r_saved`, `net_r`, `max_drawdown`, etc.)

### 5. BE replay model

Candle-walk algorithm with direction-aware arm price derivation, configurable arm level,
configurable stop level, configurable trigger basis, configurable delay. Per-trade outcome
classification (5 states). Conservative same-candle handling.

### 6. Protection Lab tab design

New fourth tab "Break-even" in Protection Lab. Verdict hero → scenario controls → comparison
table (all arm levels) → equity curve overlay → winner cost panel → losses saved panel.
REPLAY confidence tier. Verdict language capped at "Likely Helpful → validate with exact
backtest."

### 7. Metrics list

Net R · ΔNet R · Profit Factor · ΔPF · Win count · Loss count · BE exits · Winners cut ·
Losses saved · Avg winner reduction · Avg loser improvement · Winner R cost · Loser R saved ·
Efficiency ratio · Max DD · ΔMax DD · Worst streak · ΔStreak · Arm rate · Coverage pct.
Future: daily DD breach rate · total DD breach rate · challenge survival improvement.

### 8. Distance To Stop bridge

Distance To Stop remains hypothesis generator (upper-bound, fast, no candles.csv needed).
Protection Lab → Break-even is the validation surface (candle-walk, REPLAY tier). The bridge
in Phase 1 is a UX relationship (cross-links, default arm level). In Phase 2+ it can become a
`promotedBeHypothesis` data pipe. The two layers' figures must never be conflated.

### 9. Implementation roadmap

Phase 0 (this doc) → Phase 1 (frontend engine + Break-even tab) → Phase 2 (backend exact
replay) → Phase 3 (scenario controls + filters) → Phase 4 (winner/loser breakdowns) →
Phase 5 (funded account metrics).

### 10. Risks and guardrails

Same-candle ambiguity (conservative assumption, documented) · spread not modelled (labelled) ·
slippage not modelled (noted) · fees optional (Phase 3) · partial fills approximate · news
flattening (original exit preserved) · multi-position (chronological equity curve) · long/short
validation fixtures required · delayed trigger pending state · stale export coverage gate ·
MFE upper-bound must never be reconciled against replay ΔNet R · REPLAY tier must never be
promoted to EXACT.

---

*Audit completed: 2026-06-10. No code written. No files changed other than this spec.*
*Next step: Phase 0 backend sub-audit — verify `fill_candle_index` / `exit_candle_index`
population rate in a real export bundle (Codex task).*
