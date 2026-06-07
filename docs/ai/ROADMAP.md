# ROADMAP.md — checklist

Legend: `[x]` done · `[~]` in progress · `[ ]` todo. Render with `/roadmap`.

> **ROADMAP vs BACKLOG:** this file is the **sequenced plan of record** — phases we've committed
> to, in order. `BACKLOG.md` is the **unscheduled queue**. An item lives primarily in one place;
> `/promote` moves it backlog → roadmap when it's picked up.

*Last updated: 2026-06-07.*

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

## Phase 2 — Research Signals + Confidence  `[~]`

- [~] Research Signals engine (auto strongest +/- findings, dedup, suppression) — designed
- [~] Confidence layer (Very Low / Low / Medium / High) — designed
- [ ] `researchSignals.js` + validation
- [ ] `ConfidenceChip.jsx`
- [ ] Glossary keys: `research_signals`, `confidence`, `confidence_*`
- [ ] RunDetail: Research Signals section + confidence chips
- [ ] (2b) `sumR2` in accumulators → true effect-SE confidence

## Phase 3 — Distance  `[ ]`

- [ ] Importer mapping for `price_distance_from_ob_at_arm_pips`
- [ ] Distance breakdown section (0–2 / 2–5 / 5–10 / 10+ pips)
- [ ] Confirm/derive "Outside" session availability for danger surfacing

## Phase 4 — Comparison & library  `[ ]`

- [ ] TE variant naming cleanup
- [ ] Model family comparison (TE delays vs penetration vs baseline)
- [ ] Save findings / research library (persist + revisit named findings)

## Backlog candidates (not scheduled)

See `BACKLOG.md` and `IDEA_CAPTURE.md`.
