# CURRENT_WORKSTREAM.md

> The single active focus. Update this first when focus changes. Source for `/status`.

*Last updated: 2026-06-10 (PM).*

## Focus

**Failures Lab V5 — decision layer.** Phase 1 shipped; Phase 2 (confirmed false losers)
is audited and waiting on a backend export.

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

## Frontend alignment (done this session, commit pending)

Canonical name **`post_stop_mfe_r`** adopted (was planned as `post_stop_continuation_r`):
`failuresDataQuality.js` FIELD_DEPS now aliases `postStopMfeR` / `post_stop_mfe_r` /
legacy `post_stop_continuation_r` (entry key unchanged — banner impact map keys on it);
user-facing copy updated in `ViewManager.jsx` + `failuresAnalytics.js` candidate note.

## Blockers / open questions

- **Phase 2 implementation is blocked on the Lux-OB-Backtester export** (separate repo,
  not connected to this session). After it ships: importer dual-key map → confirmed
  false-loser builder + surface (prompt drafted, see BACKLOG).
- Parallel streams active on this branch: OB-Retest (v2.1 committed), Protection/BE-Replay
  (`ProtectionLab.jsx` dirty — do not stage), Hypothesis Lab fixes landing from host.

## Definition of done (Phase 2, frontend half)

Importer maps the 5 fields (dual-keyed, `numOrNull`); `buildConfirmedFalseLosers` classifies
losers (confirmed via post-stop reach vs genuine) with horizon shown; surfaced in Distance
to Stop + the Views & Export False Loser panel upgraded from "candidates only"; gated on
field presence (old bundles unchanged); validation script; docs synced.
