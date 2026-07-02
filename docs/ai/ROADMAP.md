# ROADMAP.md — checklist

Legend: `[x]` done · `[~]` in progress · `[ ]` todo. Render with `/roadmap`.

> **ROADMAP vs BACKLOG:** this file is the **sequenced plan of record** — phases we've committed
> to, in order. `BACKLOG.md` is the **unscheduled queue**. An item lives primarily in one place;
> `/promote` moves it backlog → roadmap when it's picked up.

*Last updated: 2026-07-01 (Market State phases + Portfolio/Deployment framework added; research programmes closed).*

> **Where we are (2026-07-01):** per-trade research (Fill-state, Research Signals, Distance,
> Failures Lab, Market Story Engine) is **complete/exhausted**. The Market State engine is fully
> ported to the client and its backend port is in progress. The **plan of record is now the
> Portfolio / Deployment framework** (bottom of this file). Earlier per-trade phases are retained
> below as completed history.

## Phase 1 — Fill-state foundation  `[x]`

- [x] Fill-state taxonomy (`occupied_at_arm` / `vacant_at_arm` / `aae` / `vacant_no_aae` / `unknown_at_arm`)
- [x] `deriveFillState()` + `fill_state` / `fill_state_parent` / `fill_state_is_anomaly`
- [x] `researchGlossary.js` (canonical term meanings)
- [x] Tag rename + aliases (`ob_not_occupied → vacant_no_aae`, `clean → occupied_at_arm`)
- [x] `muteAsBadge` system + consumer migration (RunDetail / StrategyMap / TradeInspector)

## Phase 1.5 — Classification Tab V2  `[x]`

- [x] `fillStateBreakdown.js` pure helpers (+ validation)
- [x] `TermTip.jsx` glossary tooltips
- [x] Signal Cards
- [x] Fill-State Breakdown (parent/child tree)
- [x] Session Breakdown (conditional Outside)
- [x] Entry Model Breakdown (kept); Entry Context table removed

## Phase 2 — Research Signals + Confidence  `[~]` *(paused — core shipped; 2 polish items open)*

- [x] Research Signals engine (auto strongest +/- findings, dedup, suppression) — `researchSignals.js`
- [x] Confidence layer (Very Low / Low / Medium / High) — `computeConfidence`
- [x] `researchSignals.js` + validation (37 assertions pass)
- [x] Glossary keys: `research_signals`, `effect`, `confidence`, `confidence_*`
- [x] `ConfidenceChip.jsx`
- [x] RunDetail: Research Signals section (Strongest Edges / Key Risks)
- [ ] Optional: confidence chips on the existing Signal Cards
- [ ] (2b) `sumR2` in accumulators → true effect-SE confidence

## Phase 3 — Distance  `[x]` *(shipped `449dc58`, D-014)*

- [x] Importer mapping for `price_distance_from_ob_at_arm_pips`
- [x] Distance breakdown section (occupied=0 / edge / 2–5 / 5–10 / 10+ pips, TE-only gated)
- [ ] Confirm/derive "Outside" session availability for danger surfacing *(carried to BACKLOG)*

## Phase 4 — Comparison & library  `[~]`

- [x] TE variant naming cleanup — TE C0–C3 labels (registry + glossary)
- [x] Enabled Variant Comparison (in-tab) — all enabled entry-model variants + Max DD column;
      importer dual-key dedup + baseline-label fix
- [ ] Model Family Comparison (full: cross-run, per-variant equity/Sharpe, variant→signal) — deferred
- [ ] Save findings / research library (persist + revisit named findings)

## Failures Lab V4  `[x]` *(complete + committed; paused — research interpretation only)*

- [x] Overview command center · shared aggregation engine (`failuresAggregation.js`)
- [x] Failure Explorer (3 scopes, 2-dim cap, refine-by-dimension, persisted prefs)
- [x] Distance to Stop tab: raw-R buckets + drilldown · loser MFE reach · BE opportunity
      (cumulative + exclusive, upper-bound framing) · winner MAE stop pressure · MAE/MFE by
      dimension · penetration dimension · distance insights
- [x] Verdict action engine (`bucketRowAction`) + validation
- [x] Final integration cleanup — tab wiring · roadmap deps · MFE/MAE alias detection ·
      text-diffable separator · verdict chip UI
- [ ] Future (post-pause): BE replay backtest · winner-cost modelling (see `roadmapStore` seeds)

## Research programmes — CLOSED (exhausted)  `[x]`

- [x] **Failure Lab** — after leakage removal, no robust pre-trade winner/loser separator survives
      (F-006). Multiple apparent discoveries proven to be leakage and removed.
- [x] **Market Story Engine** — all five SMC families (Near-Miss/Spent-OB · HTF Alignment ·
      Premium/Discount · FVG/Displacement · Liquidity Grab) implemented as leakage-safe read-only
      builders and analysed; all flat (AUC ≈ 0.50) across EUR + GBP (F-007). Per-trade SMC context
      is exhausted; do not reopen without genuinely new engine information.
- [x] **Phase 1B risk management** — managed cohorts characterised (NY BOS Short RR3 BE@1R strongest;
      Asia BOS Short unmanaged RR2; London salvage/unmanaged). Partial closes reconstructed
      mathematically → no meaningful improvement; not worth implementing.
- [x] **Selection pivot** — edge is in cohort/market-state selection, allocation, and execution
      discipline; equal weighting beat dynamic weighting; balanced portfolio is preferred deployment.

## Market State / Regime Gate  `[~]` *(client complete; backend port in progress)*

- [x] **Phase 0** — client engine `data/marketState.js` (EMA200 / BBW / Wilder-ADX + 6-state
      classifier, leakage-safe `.shift(1)`), `regime` registry group, `buildRegimeConfig`
      (byte-identical when off). Golden parity vs `rich_features.pkl` exact (3566/3566). `9856023`.
- [x] **Phase 1** — UI exposure: Strategy Builder V2 Market State section + TradeInspector snapshot.
      `03c0bc9`, `fae2135`.
- [x] **Phase 2** — Strategy Map overlays: market-state ribbon + EMA-200 line + audit execution
      markers (all default-off) + frozen parity fixture. `e6e9fbb`. Validators 70/70 + 30/30.
- [x] **Lux Phase 3a** — backtester config accepts `regime_*` keys, no behaviour change. Lux `main`
      `f6740c6`.
- [x] **Lux Phase 3b** — canonical Python engine `src/regime.py` (mirrors JS exactly, reuses frozen
      fixture, JS↔Python byte parity, **compute only** — no filter, no execution change, no trade
      columns). Lux `main` `3de2b2a`; `tests/test_regime_parity.py` 4/4; fixture byte-identical to
      frontend (same SHA256); nothing imports it.
- [x] **Lux Phase 3c** — engine-side per-trade regime **label** columns on exported trades
      (still no filtering). Lux `main` `e935ce6`; `enrich_trades_with_market_state` appends the
      canonical `REGIME_TRADE_COLUMNS` only in enabled label mode (no-op/byte-identical off); panel
      built once/run, attached by `fill_time`. Emission+config+parity tests 20/20.
- [x] **Lux Phase 4** — backend regime **filter mode** (first real strategy change; opt-in, off by
      default). Lux `main` `c3c1f16`. Confirmed disallowed-state fills blocked (`REGIME_BLOCKED`, slot
      freed); disabled/label byte-identical; shared block helper both fill paths; strict
      `allowed_states` validation. Regime suite 32/32.
- [ ] **Phase 5** — scenario sweep over regime gates. Plus (parallel) P2 Master Controls filter lens.

## Portfolio / Deployment Framework  `[ ]` *(PLAN OF RECORD — active strategic direction)*

> Rationale: per-trade filtering is exhausted (above). The measured edge lives in **selection,
> allocation, and execution discipline**, so the product now builds the **deployment layer** on top
> of the completed research. See `DECISIONS.md` D-018. Extend existing seeds (Edge Attribution;
> session-first/portfolio compare) rather than building parallel systems.

- [ ] **Phase 1 — Portfolio Manager** — cohort selection + allocation (equal-weight baseline;
      balanced portfolio as preferred deployment). Seed: session-first / portfolio-compare layer.
- [ ] **Phase 2 — Cohort Intelligence** — per-cohort edge/worth-trading intelligence + stability.
      Seed: Edge Attribution / Run Intelligence (`edgeAttribution.js`).
- [ ] **Phase 3 — Edge Monitor** — track live/ongoing edge health vs research expectation; drift/decay.
- [ ] **Phase 4 — Decision Engine** — turn cohort + market-state + monitor signals into allocation /
      enable-disable decisions.
- [ ] **Phase 5 — Execution Layer** — deployment/execution discipline surface (orders remain
      user-executed; no autonomous trading).

## Backlog candidates (not scheduled)

See `BACKLOG.md` and `IDEA_CAPTURE.md`.
