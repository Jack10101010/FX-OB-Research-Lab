# TRIGGERED-EDGE-ENTRY-UNIVERSE-EXPANSION — IMPLEMENT

> Expanded TE entry universes: threshold presets (10/25/50/75) + delays Arm
> C0–C6. No 100% threshold, no default BE-all, no matrix generator, no BE-calc /
> protection-layer changes.

## 1. Precheck (no drift)
Backend: cap was a single constant `VALID_TRIGGERED_EDGE_CANDLE_DELAYS = {0,1,2,3}` used in 3 places (l.39/379/633); validation message renders `sorted(VALID_…)` so it auto-updates; TE key generation is generic `d{n}`; thresholds already an array validated `0<t<100`. Frontend: StrategyBuilder hard-coded C0–C3 chips (×2 blocks) + single-number threshold; `configTranslator` serializes TE thresholds as a 1-element array; `tradeUniverse` key parsing generic; `FILL_ORDER` capped at `d4` (cosmetic). All as audited.

## 2. Backend files changed
- `scripts/run_backtest.py` — `VALID_TRIGGERED_EDGE_CANDLE_DELAYS = {0,1,2,3,4,5,6}` (+ comment). No key-format or `simulate_trades` change; the validation message and `normalize_triggered_edge_delays` pick up the new set automatically.

## 3. Frontend files changed
- `data/configTranslator.js` — TE single-model now serializes a **threshold SET** (`singleTriggeredEdgeThresholds` array; falls back to the legacy single value), cleaned to numeric / >0 / <100 / deduped / sorted; round-trip mapper restores the set from `triggered_edge_trigger_thresholds`.
- `data/tradeUniverse.js` — `FILL_ORDER` extended with `d5`,`d6` (cosmetic ordering).
- `pages/StrategyBuilder.jsx` — threshold preset chips (10/25/50/75) + removable current-set chips + custom "Add"; delay chips extended to C0–C6 (both single + directional blocks); help text C0–C6; default `singleTriggeredEdgeThresholds:[25]`; strengthened BE "all variants" warning copy.
- `data/__validation__/beConfigSerialization.validate.mjs` — new tests.

No importer / beResolve / tradeUniverse-resolver / BreakevenTab changes — already generic over thresholds/delays (confirmed in precheck).

## 4. New threshold preset behavior
Presets 10/25/50/75 toggle membership in a threshold **set**; the custom number input + "Add" inserts any value; the active set renders as removable chips. The set serializes to `triggered_edge_trigger_thresholds` (sorted, deduped, `>0 && <100`; ≥100 dropped; never empty → defaults to the legacy single value or [25]). Single-value configs still round-trip (backward compatible).

## 5. New delay behavior
Delay chips C0–C6 serialize to `triggered_edge_candle_delays: [0..6]` as selected. Backend accepts 0–6 and filters anything higher (e.g. C7) exactly as before.

## 6. Example generated entry keys (verified in backend plan smoke)
`entry_triggered_edge_10p0_same`, `entry_triggered_edge_25p0_d4`, `entry_triggered_edge_50p0_d6`, `entry_triggered_edge_75p0_d6` — all present; no `_d7` produced.

## 7. Matrix-size warning
4 thresholds × 7 delays = **28 TE entry universes**. With 9 BE arms × wick/close = 18 BE cells each → **504 BE cells** without the single-walk optimization (one path-walk per variant×trigger would collapse the 9 arms → ~56 walks). The Strategy Builder BE control still defaults to **baseline-only**; "All entry variants" stays opt-in with explicit "expensive — prefer selected variants or matrix generation" copy.

## 8. Validation results
- **Backend plan smoke**: `VALID` delays `{0..6}`; `normalize_triggered_edge_delays([0..7]) → [0..6]` (7 filtered); 28 TE scenarios for [10,25,50,75]×[0..6]; all four target keys present; no `_d7`. (Threshold ≥100 rejected by the existing `0<t<100` config validation, l.227-230.)
- **Frontend** ✅: `beConfigSerialization` (preset set [10,25,50,75] sorted/deduped; single→[25] back-compat; ≥100 dropped; delays 0–6; old C0–C3 unchanged; BE not forced to "all"); `useRunVariant` 19/0; `beIntegration`; `selectiveBeUniverse`. `configTranslator.js` / `tradeUniverse.js` / `StrategyBuilder.jsx` transpile clean; 0 new typography violations.

## 9. Safe to generate a targeted TE+2 BE pack now?
**Yes — a *targeted* pack is safe today.** BE generation is still baseline-only by default and `be_variants:"all"` is opt-in, so nothing exploded. To get exact BE for a specific universe (e.g. TE 25% C2), run that run's config with `be_enabled:true` + the desired arm ladder/triggers and `be_variants` scoped to that variant (or run the single TE variant). **Do NOT run `be_variants:"all"` across the full 28-universe preset set** — that's the 504-cell brute force the matrix generator (single-walk optimization) is meant to handle. Recommendation: generate targeted packs now; build the single-walk matrix generator before any full-matrix run.

> Untracked scratch files (`frontend/_tp*.mjs`, `_attrSmoke.mjs`, `_cohortAudit.mjs`) need `rm` on the host. Backend change is in `scripts/run_backtest.py` — commit both repos.
