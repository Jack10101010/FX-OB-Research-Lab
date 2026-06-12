# CURRENT_WORKSTREAM.md

> The single active focus. Update this first when focus changes. Source for `/status`.

*Last updated: 2026-06-11.*

## Focus

**Focus needs confirmation.** The previously-assumed blocker (Failures Lab V5 false losers waiting on
the backtester export) is **resolved** — that surface is live (below). Several parallel streams have
landed on `codex-dev`. Confirm the next active focus before starting new work; the cheapest open
research win is the **Distance-at-arm importer map** (exported-but-unmapped — see `BACKLOG.md` P1).

**Recently landed (committed):**
- **Phase 14 Wave 1 — research run terminology** (`e9d03aa`; D-010). Wave 2 residual sweep is mostly
  done — see `BACKLOG.md`.
- **Storage — durable backend mirror** (`ccb240e`; D-012).
- **Protection Lab — selective BE + BE Trade Explorer** (`a6b1c09`; D-011).
- **Master Controls Phase 13** — single composer-driven preview (D-009), committed.

**Failures Lab V5 — confirmed false losers: LIVE end-to-end (verified 2026-06-12).** Phase 1 shipped;
Phase 2 + 2B built/validated. The backend post-stop export (`post_stop_mfe_r`,
`post_stop_reached_original_tp`, `post_stop_bars_to_1r`, `post_stop_lookahead_bars`, `post_stop_model`)
is shipped, the importer maps it, and the panel renders the confirmed/candidate/genuine breakdown on
real data (Failures Lab Overview: "6 confirmed of 32 losses · model `fixed_horizon` · horizon 50").
**Not blocked.** Remaining work is research interpretation, not export/import.

## Where we are

- **V4 final integration cleanup — committed** (`371a60d` code, `542ad8c` docs). Excursion
  tab wired, roadmap deps tracked, MFE/MAE alias detection, text-diffable separator,
  verdict chips surfaced.
- **V5 Phase 1 — Filter Discovery simulator — committed** (`a980e8b`).
  `shared/filterSimulator.js` (truth layer: actual trade removal → recompute Net R/WR/PF;
  no lift/share estimates) + `discovery/FilterDiscovery.jsx` tab (quick cards + sortable
  table ranked by Net R improvement, Strong Disable / Test Disable / Watchlist / Neutral)
  + `filterSimulator.validate.mjs` (all 8 spec cases + thresholds + discovery, ALL PASS).
  Execution-path audit confirmed pure trade-removal simulation end to end.
- **V5 Phase 2 — confirmed false losers — BACKTESTER AUDIT COMPLETE** (run in the
  Lux-OB-Backtester chat, 2026-06-10). Conclusions adopted here:
  - No existing export answers post-stop continuation (`mfe_r`/`mae_r`/`r_if_no_target`/
    `mae_r_to_original_exit` all bounded by first stop touch; `ghost_*` = cancelled OBs).
  - **Agreed schema (5 core fields, loser-only):** `post_stop_mfe_r` (headline — max
    favorable R after the stop candle, from ORIGINAL entry),
    `post_stop_reached_original_tp`, `post_stop_bars_to_1r`,
    `post_stop_lookahead_bars`, `post_stop_model`.
  - **Horizon:** finite, single, configurable — default **50 bars**; end-of-data lookahead
    rejected (overstates false losers). Multi-horizon `_NN` suffixes are a Tier-2 extension.
  - **Implementation:** additive post-pass inside `enrich_trades_with_stop_anchored_excursions`
    (reuses candle arrays + `exit_candle_index`); no live-sim changes; LOSS rows only.
  - **Caveat:** `post_stop_mfe_r` is a peak ("reached"), not a path — it cannot prove a
    BE/trail would have held. One export serves false-loser confirmation, exact BE-replay
    validation, and trailing-stop research.

## V5 Phase 2 — confirmed false losers (frontend) — BUILT + VALIDATED

- Canonical `post_stop_mfe_r` adopted; `failuresDataQuality.js` FIELD_DEPS aliases
  `postStopMfeR` / `post_stop_mfe_r` / legacy `post_stop_continuation_r`.
- `importer.js` maps the 5 fields dual-keyed (`numOrNull`/`boolOrNull`; absent → null/"").
- `failuresAnalytics.buildConfirmedFalseLosers` classifies losers
  **confirmed / candidate / genuine** (reached ≥1R or hit original TP / ≥0.5R / never),
  with cohort breakdowns (session, direction, structure, archetype), horizon + model.
  `failuresFalseLosers.validate.mjs` 30/30 PASS. Analytics + validate committed on host;
  `importer.js` change rides in the shared dirty file.

## V5 Phase 2B — Overview IA — BUILT + VALIDATED, COMMIT PENDING

Move false-loser research onto the Overview decision surface. Five UI files:

- `overview/ConfirmedFalseLosersPanel.jsx` (new) — confirmed/candidate/genuine tiles +
  cohort breakdowns + candidates fallback, extracted out of `ViewManager`.
- `overview/FailuresOverview.jsx` — renders that panel after the Command Center, plus a
  bucket-less **Global Failure Explorer** (whole-run, valid-universe gated via
  `isPerformanceTrade`).
- `excursion/FailureExplorer.jsx` — parametrised `title`/`prefsKey`/`roadmapKey`/`intro`
  so one component serves both explorers without sharing persisted UI state.
- `excursion/ExcursionAnalysis.jsx` — Distance-to-Stop instance relabelled **MFE Bucket
  Explorer** (bucket-scoped logic unchanged).
- `workspace/ViewManager.jsx` — Views & Export trimmed to CSV export + saved views + a
  lightweight pointer to Overview.

No Protection Lab / OB-Retest / Master Controls / `roadmapStore.js` / `SectionRoadmap.jsx`
changes (Overview explorer passes `roadmapKey={null}`). Scoped commit = these 5 files only.

## Blockers / open questions

- **Phase 2 false losers — NOT blocked (correction).** Earlier docs said this waited on the
  Lux-OB-Backtester export; the export shipped, the importer maps it, and the surface is live
  (verified 2026-06-12). No backend/import dependency remains.
- Parallel streams: OB-Retest (active, own stream); Hypothesis Lab fixes landing from host.
  Master Controls Phase 13, Protection-BE (selective BE / BE Explorer), Storage mirror, and Phase 14
  Wave 1 are now **committed** (see Focus — recently landed) — no longer in-flight dirty work.

## Remaining

Frontend (Phase 2 + 2B) is built, validated, and **live** — the active imported run carries the
`post_stop_*` fields and the panel renders the real confirmed/candidate/genuine breakdown (the
candidates-only fallback is the *no-data* path, not the current state). The field-gating still
correctly degrades to the fallback for older runs imported before the export existed. Remaining
work is **research interpretation** (what the false-loser cohorts mean), not export/import/build.
