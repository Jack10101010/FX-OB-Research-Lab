# HANDOFF — Failures Lab V5 (2026-06-10)

**Repos:** `FX-OB-Research-Lab` (frontend, branch `codex-dev`) + `Lux-OB-Backtester` (backend, branch `main`). Both must be connected as folders. Multiple agents work these repos in parallel — never `git add .`; commits are made on the host (sandbox git can't unlink `.git/index.lock`).

**Read first:** `docs/ai/AGENTS.md`, `CURRENT_WORKSTREAM.md`, `PROJECT_STATUS.md`, `BACKLOG.md` (all synced 2026-06-10), then verify against `git status` / `git log` — docs go stale fast here.

## Workstream & current state

**Failures Lab V5 — turning diagnostics into decisions.** Sequence so far:

1. **V4 cleanup — committed** (`371a60d` + docs `542ad8c`): Excursion / Distance-to-Stop tab wired, roadmap deps tracked, MFE/MAE alias detection, verdict chips in Failure Explorer.
2. **V5 Phase 1 — Filter Discovery — committed** (`a980e8b`): `frontend/src/components/lab/failures/shared/filterSimulator.js` (truth layer: removes actual cohort trades, recomputes Net R/WR/PF; no lift/estimates) + `discovery/FilterDiscovery.jsx` tab + `filterSimulator.validate.mjs` (ALL PASS). Execution-path audit confirmed clean dataflow.
3. **Phase 2 naming alignment — committed** (`eae46f0`): canonical field is `post_stop_mfe_r` (not the old planning name `post_stop_continuation_r`); frontend `FIELD_DEPS` aliases pre-wired, copy updated.
4. **V5 Phase 2 backend — IMPLEMENTED, NOT COMMITTED** (Lux-OB-Backtester `src/execution.py`): 5-field post-stop continuation export (`post_stop_mfe_r`, `post_stop_reached_original_tp`, `post_stop_bars_to_1r`, `post_stop_lookahead_bars`, `post_stop_model`), LOSS rows only, fixed 50-bar horizon (`POST_STOP_LOOKAHEAD_BARS_DEFAULT`, param on `enrich_trades_with_stop_anchored_excursions`), zero live-sim changes. Tests: `tests/test_post_stop_continuation.py` 35/35 + all existing suites green. Proven on a real run: 32/32 LOSS rows populated, non-LOSS blank, 8/8 independent recomputes exact. Finding: ~34% of losers reached ≥+1R within 50 bars post-stop.

## Next action

1. **Commit the backend export (host).** `src/execution.py` also holds the BE-replay stream's uncommitted `be_*` work — either let that stream commit first, then `git add src/execution.py tests/test_post_stop_continuation.py`, or `git add -p` selecting only the five `post_stop` hunks. Message: `feat(export): add post-stop continuation fields for confirmed false losers`.
2. **Then run the frontend follow-up** (prompt stored in this handover's source chat and reflected in `BACKLOG.md` P1): importer dual-key map for the 5 fields → pure `buildConfirmedFalseLosers` → upgrade Views & Export "False Loser Detection" panel from "candidates only" + Distance-to-Stop strip. Gate on field presence; frame results as "reached", never "would have profited" (peak ≠ path).

## Files in flight (do not stage with your work)

- **Backtester:** `src/config.py`, `scripts/run_backtest.py` (BE-replay stream); `src/execution.py` (shared — BE stream + uncommitted post-stop work).
- **Frontend:** `ProtectionLab.jsx`, `RetestLabTab.jsx` (other streams); `SectionRoadmap.jsx` / `roadmapStore.js` currently dirty — check ownership before touching.
- `importer.js` is the shared collision point for the follow-up — check `git status` before editing.

## Gotchas

- Typography rules in root `AGENTS.md`: never `font-mono` / `tracking-widest` in JSX; run the validation greps before finishing UI work.
- The Write tool can smuggle literal control characters into files — after writing anything containing a unit-separator (`\u001F`), scan with `grep -cP '[\x00-\x08\x0B\x0C\x0E-\x1F]'` (expect 0). One NUL byte previously made git treat `failuresAggregation.js` as binary.
- Frontend validation scripts run from `frontend/` via node + Babel require-shim harness (see `filterSimulator.validate.mjs` for the pattern). Backtester tests: `python3 tests/<file>.py` from repo root.
- Untracked scratch in the backtester from the proof run: `generated_configs/post_stop_proof_config.json`, `outputs/runs/20260610_144537_*` — safe to delete (sandbox couldn't).
- Horizon choice is a research lever: 50 bars default; conclusions must always cite `post_stop_lookahead_bars`.

**Key commits:** frontend `371a60d` · `a980e8b` · `eae46f0`; backtester `3b9c4ae` (MAE-to-exit, the pattern the post-stop pass extends).
