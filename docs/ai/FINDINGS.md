# Findings

Permanent storage for **validated research conclusions** — what the data says, not how we
build it. Append-only; deprecate (don't delete) when superseded. Add entries with `/finding`.

> **Boundary — FINDINGS vs DECISIONS:** a *finding* is a conclusion about the market/strategy
> drawn from data ("OB Vacant At Arm is the primary signal"). A *decision* (`DECISIONS.md`) is a
> build/design choice ("make Vacant the headline in the UI"). Findings justify decisions;
> decisions cite findings. Evidence/runs live in `EXPERIMENTS.md`.

Status values: **Validated** (multiple/strong evidence) · **Provisional** (single source or
partial pipeline) · **Investigating** · **Deprecated**.

---

## Active Findings

### F-001 — OB Vacant At Arm is the primary fill-state signal
- **Summary:** When price has already left the order block at the moment the order arms
  (`vacant_at_arm`), expectancy is far higher than the textbook still-in-block fill
  (`occupied_at_arm`). This — not AAE alone — is the headline edge.
- **Evidence:** Full-history run `20260605_163857_EURUSD_15min_RR4_SB0` (2021-01-01 → 2026-05-18):
  Vacant ≈ +0.89R avg vs Occupied ≈ +0.08R avg. See `EXPERIMENTS.md` E-001.
- **Status:** Validated
- **Date:** 2026-06-07

### F-002 — AAE is a child signal of Vacant At Arm
- **Summary:** "Armed After OB Exit" (price exits the OB then returns to fill) is a subtype of
  Vacant, not the primary signal. Vacant = AAE + Vacant-No-AAE.
- **Evidence:** Same run — AAE ≈ +0.59R avg; the broader Vacant cohort ≈ +0.89R. ~100% of AAE
  fills occur within ~4 min of OB exit.
- **Status:** Validated
- **Date:** 2026-06-07

### F-003 — Outside Session is a danger condition
- **Summary:** Trades filled outside defined session windows perform very poorly and should be
  filtered/flagged.
- **Evidence:** Same run — Outside ≈ −1.0R avg, ~0% WR. (Note: "Outside" availability in
  imported frontend data is runtime-dependent; confirm per run.)
- **Status:** Validated (backend analysis); frontend surfacing conditional.
- **Date:** 2026-06-07

### F-004 — Distance < 2 pips at arm is weak/negative
- **Summary:** When price is within ~2 pips of the OB at arm, edge is weak or negative — too
  close to count as a meaningful vacate.
- **Evidence:** Backend analysis. **In-app validation now ENABLED** (2026-06-12): `importer.js` maps
  `price_distance_from_ob_at_arm_pips` and RunDetail renders the distance breakdown (`449dc58`, D-014),
  so the frontend can now reproduce this — but it has not yet been confirmed on a live run.
- **Status:** Provisional (no longer blocked; awaiting in-app confirmation — do not treat as validated).
- **Date:** 2026-06-07 (in-app validation enabled 2026-06-12)

### F-005 — Timing/expiry is currently low priority
- **Summary:** Expiry/timing protections are not where the edge is. AAE fills cluster within
  ~4 min of OB exit, so expiry windows have little to add right now.
- **Evidence:** Timing distribution from the full-history run (AAE-DEEP-ANALYSIS-2).
- **Status:** Validated (deprioritized)
- **Date:** 2026-06-07

### F-006 — Per-trade winner/loser separation does not survive leakage removal (Failure Lab exhausted)
- **Summary:** Extensive per-trade feature mining in the Failure Lab found **no robust pre-trade
  signal that separates winners from losers** once look-ahead is removed. Features that looked
  predictive were either post-fill (excursion / run-up measured after entry) or cycle-specific.
  The conclusion: the marginal return on mining more per-trade entry features is **exhausted** —
  the leverage is not "which individual trade wins" but "which cohorts/regimes to deploy into."
- **Evidence:** Failure Lab V4/V5 programme (confirmed-false-losers, loser run-up, distance-at-arm,
  fill-state, MFE/MAE-by-dimension). Post-stop continuation is a *peak*, not a pre-trade predictor.
- **Status:** Validated (research programme closed — do not reopen without new instrumentation).
- **Date:** 2026-07-01

### F-007 — Market Story / SMC feature families are flat (AUC ≈ 0.50), EUR + GBP
- **Summary:** The Market Story Engine tested all five smart-money-concept feature families —
  Near-Miss / Spent-OB, HTF Alignment, Premium/Discount, FVG/Displacement, and Liquidity Grab —
  as pre-trade winner/loser discriminators. **All came in flat (AUC ≈ 0.50)** across both EURUSD
  and GBPUSD. No SMC narrative feature adds tradeable pre-trade edge on this OB strategy.
- **Evidence:** `outputs/research/market_story_engine/**` (story_builder, htf/fvg/liquidity builders,
  near_miss_analysis, phase3_analyze, validate_*_features).
- **Status:** Validated (research programme closed).
- **Date:** 2026-07-01

### F-008 — The durable edge is regime/cohort selection + allocation, not per-trade features
- **Summary:** The one filter that generalised (EURUSD → GBPUSD) and cut drawdown across 65/65
  triggered scenarios is the **Market State / Regime Gate** (daily 200-EMA direction + Bollinger-
  width volatility + ADX chop) — a *regime/allocation-level* signal, not a per-trade feature. In
  portfolio-selection research, **equal weighting beat dynamic weighting** and a balanced portfolio
  is the preferred deployment; Risk Management Phase 1B characterised the managed cohorts but found
  partial closes not worth implementing. Together these point the strategy from *edge discovery* to
  *edge deployment*: cohort selection, market-state gating, allocation, and execution discipline.
- **Evidence:** `eurusd_regime_gate`, `eurusd_extended_gate_validation`, `gbpusd_generalisation`,
  `eurusd_market_state_engine/market_state_engine_manual.md`; Portfolio Selection Research;
  Risk Management Phase 1B.
- **Status:** Validated — the basis for the 2026-07-01 Portfolio/Deployment pivot (see `ROADMAP.md`,
  `DECISIONS.md` D-018).
- **Date:** 2026-07-01

---

## Deprecated Findings

*(none yet — when a finding is superseded, move it here with a note on what replaced it and why.)*
