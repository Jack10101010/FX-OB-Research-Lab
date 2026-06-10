# ROADMAP.md — checklist

Legend: `[x]` done · `[~]` in progress · `[ ]` todo. Render with `/roadmap`.

> **ROADMAP vs BACKLOG:** this file is the **sequenced plan of record** — phases we've committed
> to, in order. `BACKLOG.md` is the **unscheduled queue**. An item lives primarily in one place;
> `/promote` moves it backlog → roadmap when it's picked up.

*Last updated: 2026-06-10.*

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

## Phase 3 — Distance  `[ ]`

- [ ] Importer mapping for `price_distance_from_ob_at_arm_pips`
- [ ] Distance breakdown section (0–2 / 2–5 / 5–10 / 10+ pips)
- [ ] Confirm/derive "Outside" session availability for danger surfacing

## Phase 4 — Comparison & library  `[~]`

- [x] TE variant naming cleanup — TE C0–C3 labels (registry + glossary)
- [x] Enabled Variant Comparison (in-tab) — all enabled entry-model variants + Max DD column;
      importer dual-key dedup + baseline-label fix
- [ ] Model Family Comparison (full: cross-run, per-variant equity/Sharpe, variant→signal) — deferred
- [ ] Save findings / research library (persist + revisit named findings)

## Failures Lab V4  `[~]` *(current focus — final cleanup, then pause)*

- [x] Overview command center · shared aggregation engine (`failuresAggregation.js`)
- [x] Failure Explorer (3 scopes, 2-dim cap, refine-by-dimension, persisted prefs)
- [x] Distance to Stop tab: raw-R buckets + drilldown · loser MFE reach · BE opportunity
      (cumulative + exclusive, upper-bound framing) · winner MAE stop pressure · MAE/MFE by
      dimension · penetration dimension · distance insights
- [x] Verdict action engine (`bucketRowAction`) + validation
- [~] Final integration cleanup — tab wiring · roadmap deps · MFE/MAE alias detection ·
      text-diffable separator · verdict chip UI *(implemented; commit pending)*
- [ ] Future (post-pause): BE replay backtest · winner-cost modelling (see `roadmapStore` seeds)

## Backlog candidates (not scheduled)

See `BACKLOG.md` and `IDEA_CAPTURE.md`.
