# GLOSSARY.md — project glossary

Human-readable companion to `frontend/src/data/researchGlossary.js` (the in-app source of
truth for tooltips). Keep the two consistent; the code file wins for exact UI copy.

*Last updated: 2026-06-11.*

## Phase 14 run vocabulary (Wave 1)

> UI display terms. Internal identifiers (`resultView`, `positionVariant`, `scenario`) are unchanged.
> See `DECISIONS.md` D-010.

- **Run** — the one completed backtest currently in focus (TopBar; empty state = "No Run").
- **View** — umbrella for how the Run is sliced: **Model + Position Mode**. The banner header.
- **Current View** — the view a page is presently showing (the dominant right-hand panel).
- **Model** — which entry-model family/threshold/fill-mode the view uses (was "Result View" as a
  dimension label). Distinct from "Entry Model" (the selector toggle).
- **Position Mode** — how concurrent positions are counted (single / one-per-direction / allow-multi;
  was "Position Variant").
- **Preview** — the single composer-driven, reversible projection of a Run (Phase 13; see D-009).
- *Deprecated (display):* **Active Run** → Run · **Result View** → Model/View · **Position Variant**
  → Position Mode · bare **Variant** → qualify as Model or Position Mode.

## Fill state (at arm)

- **OB / Order Block** — the supply/demand zone the strategy places its limit against.
- **Arm** — the candle on which a delayed limit becomes live and eligible to fill. Occupancy
  and distance are measured *at arm*.
- **Occupied At Arm** (`occupied_at_arm`) — price still inside the OB when the order armed. The
  textbook ("clean") fill. Weak baseline (~+0.08R).
- **OB Vacant At Arm** (`vacant_at_arm`) — price had left the OB when the order armed. **Parent
  state and the PRIMARY signal** (~+0.89R). Superset of AAE + Vacant-No-AAE.
- **AAE — Armed After OB Exit** (`aae`) — price exited the OB during the delay window, then
  returned and filled. A high-conviction **child** of Vacant (~+0.59R). ~100% of AAE fills land
  within ~4 min of OB exit.
- **Vacant — No AAE** (`vacant_no_aae`) — Vacant at arm but not flagged AAE (vacant from origin,
  or no clean exit-and-return). The other Vacant child.
- **Unknown At Arm** (`unknown_at_arm`) — occupancy couldn't be determined (baseline/non-TE, or
  runs predating AAE instrumentation). **Not "clean"** — excluded from edge analysis.

## Entry models

- **TE — Triggered Edge** — entry family where the limit arms only after price triggers the OB
  edge, optionally after a delay. AAE/vacant research only exists for TE.
- **TE C0 / C1 / C2 / C3** — delay = 0 / 1 / 2 / 3 candles between trigger and arm (C0 = same
  candle, C1 = next candle, C2 = +2, C3 = +3). Longer delay → more chance to vacate → more AAE.
  (Tag keys remain `te_same` / `te_next` / `te_d2` / `te_d3`.)
- **Baseline** — standard OB limit, no TE/penetration, no arm step.
- **EP — Entry Penetration (25/50/75/100%)** — limit placed N% into the OB.

## Sessions

- **New York / London / London Lull / Asia** — fill-session windows.
- **Outside** — filled outside all defined sessions. **Danger** (~−1.0R, ~0% WR). Availability in
  imported data is runtime-dependent; surfaced conditionally.

## Statistics

- **Trades (n)** — performance-trade count in the group.
- **WR — Win Rate** — wins / (wins + losses); breakevens excluded from the denominator.
- **Net R** — Σ of R-multiples.
- **Avg R (expectancy)** — Σr / count; breakevens included. The headline metric.
- **R** — result in multiples of initial risk (1R = stop distance).

## Phase 2 terms

- **Research Signals** — auto-surfaced strongest positive (edges) and negative (risks) findings
  from the tab's live data, deduped and confidence-scored.
- **Confidence** — how trustworthy a finding is: Very Low / Low / Medium / High, from sample size
  + statistical stability (win-rate interval now; effect-SE later).
- **Effect** — a finding's signed expectancy (avgR); positive = edge, negative = danger.
- **Anomaly** (`fill_state_is_anomaly`) — armed-after-exit asserted where occupancy doesn't
  confirm vacancy; surfaced, never merged into AAE.
