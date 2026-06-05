# MASTER-CONTROLS-PHASE-1 — Audit Summary

**Date:** 2026-06-05
**Branch:** codex-dev
**Mode:** IMPLEMENT / AUDIT ONLY for StrategyBuilder.jsx

---

## Files Changed

| File | Action |
|------|--------|
| `frontend/src/data/configRegistry.js` | **CREATED** — new file, 78 entries |
| `frontend/src/pages/StrategyBuilder.jsx` | **NO CHANGE** — see Dropped Fields section |

---

## Fields Audited

78 cfg keys from `StrategyBuilder.jsx` `useState` initializer were audited against:
- `buildBacktesterConfig()` (lines 1464–1650) — the authoritative sidecarConfig emitter
- `LOAD_FIELD_LABELS` (lines 1999–2077) — 75 keys with human labels
- `buildRunConfigLoadReport()` + `applyFirstPresent()` (lines 2079–2228) — reverse-mapper from backend config bundle to frontend cfg

Sources cross-checked. `newsDebugObIds` is the only cfg key absent from `LOAD_FIELD_LABELS` — noted in registry with label `"news debug OB IDs"`.

---

## Emission Status

| Status | Count | Keys |
|--------|-------|------|
| Emitted | 70 | All fields that appear in the `config` object returned by `buildBacktesterConfig()` |
| Dropped — backend unconfirmed | 5 | `conflict`, `cancelAction`, `originSession`, `detectionSession`, `monteCarlo` |
| UI-control only (no backend key) | 3 | `entryMode`, `selectedEntryModel`, `entryResearchExportMode` |

---

## Confirmed Dropped Fields

These fields exist in the frontend cfg state and are handled by `buildRunConfigLoadReport()` (the importer expects them), but `buildBacktesterConfig()` never emits them. The sidecar backend (FX-OB-Backtester) is not mounted on this branch, so backend support cannot be verified.

### `conflict` — Position Conflict Mode
- **Frontend values:** `"Allow Auto Reversal"` | `"Block Opposite"`
- **Intended backend key:** `position_conflict`
- **Importer source keys (applyFirstPresent):** `position_conflict`, `conflict`, `conflict_mode`, `allow_auto_reversal`
- **Reverse-mapper:** `mapConfigConflict()` — handles boolean `true/false` → "Allow Auto Reversal" / "Block Opposite"
- **Status:** NOT emitted. Backend support unconfirmed. Do not emit without backend verification.

### `cancelAction` — Cancelled-by-Conflict Action
- **Frontend values:** `"Kill OB"` | `"Kill If Touched"` | `"Allow Resume"`
- **Intended backend key:** `cancel_action`
- **Importer source keys:** `cancel_action`, `cancelled_by_conflict`, `canceled_by_conflict`, `conflict_cancel_action`
- **Reverse-mapper:** `mapConfigCancelAction()` — normalizes string values
- **Status:** NOT emitted. Backend support unconfirmed.

### `originSession` — OB Origin Session Filter
- **Frontend values:** `"Any"` | `"London"` | `"London Lull"` | `"New York"` | `"Asia"`
- **Intended backend key:** `origin_session`
- **Importer source keys:** `origin_session`, `ob_origin_session`, `originSession`
- **Reverse-mapper:** `mapConfigSession()`
- **Status:** NOT emitted. Backend support unconfirmed.

### `detectionSession` — OB Detection Session Filter
- **Frontend values:** Same as `originSession`
- **Intended backend key:** `detection_session`
- **Importer source keys:** `detection_session`, `ob_detection_session`, `detectionSession`
- **Reverse-mapper:** `mapConfigSession()`
- **Status:** NOT emitted. Backend support unconfirmed.

### `monteCarlo` — Monte Carlo Mode Toggle
- **Frontend values:** `true` / `false`
- **Intended backend key:** `monte_carlo`
- **Importer source keys:** `monte_carlo`, `monteCarlo`, `monte_carlo_enabled`
- **Reverse-mapper:** `toBool()`
- **Status:** NOT emitted. Backend support unconfirmed.

---

## Confirmed Backend Key Mappings (emitted fields)

All 70 emitted fields have confirmed backend keys sourced directly from the `config` object in `buildBacktesterConfig()`. Selected non-obvious mappings:

| cfg key | Backend key | Notes |
|---------|-------------|-------|
| `detectionTf` | `detection_timeframe` | mapped via `mapDetectionTf()`: M15 → "15min" |
| `executionTf` | `execution_timeframe` | mapped via `mapExecutionTf()`: "1m" → "1min" |
| `dataFile` | `candle_file` | normalized via `normalizeCandleFile()` |
| `obFilter` | `ob_filter` | "ATR" → "Atr", "CMR" → "Cmr" |
| `rr` | `rr_multiple` | — |
| `executionMode` | `execution_modes` | wrapped in array; "multi_position" → "allow_multi_position" |
| `direction` | `trade_direction` | + contributes to `allowed_structure_directions` |
| `bosLong/Short` | `allowed_structure_directions` | array element "bos_long" / "bos_short" |
| `chochLong/Short` | `allowed_structure_directions` | array element "choch_long" / "choch_short" |
| `sessionFilter` | `session_filter_enabled` | — |
| `london/lull/newYork/asia/outside` | `allowed_sessions` | array via `selectedAllowedSessions()` |
| `newsBlackoutBefore` | `news_blackout_minutes_before` | — |
| `newsBlackoutAfter` | `news_blackout_minutes_after` | — |
| `newsCancelIfTouched` | `news_cancel_if_touched_during_blackout` | — |
| `newsFlattenMinutesBefore` | `news_flatten_minutes_before_blackout` | — |
| `spread` | `spread_pips` | — |
| `slippage` | `slippage_pips` | — |
| `commission` | `commission_r_per_trade` | — |
| `entryResearchExports` | `entry_models` | contributes `"entry_penetration"` element |
| `triggeredEdgeEntries` | `entry_models` | contributes `"triggered_edge"` element |
| `longTriggeredEdgeThreshold` | `directional_entry_config` | nested under `.long.triggered_edge_threshold` |
| `shortTriggeredEdgeThreshold` | `directional_entry_config` | nested under `.short.triggered_edge_threshold` |
| `newsDebugObIds` | `news_debug_ob_ids` | conditionally emitted only when non-empty |
| `newsBlackout`, all `news*` | conditional block | news fields only emitted when `cfg.newsBlackout === true` |

---

## Composite Array Contributors

These fields are `emitted: true` but contribute elements to a shared array rather than occupying a standalone key. Master Controls must reconstruct the full array on change:

| Array key | Contributing cfg keys |
|-----------|-----------------------|
| `allowed_structure_directions` | `bosLong`, `bosShort`, `chochLong`, `chochShort` (+ gated by `direction`) |
| `allowed_sessions` | `london`, `lull`, `newYork`, `asia`, `outside` (only when `sessionFilter=true`) |
| `entry_models` | `entryResearchExports` (→ "entry_penetration"), `triggeredEdgeEntries` (→ "triggered_edge"), always "baseline" |

---

## Unresolved Mappings

| cfg key | Issue |
|---------|-------|
| `conflict` | Backend key `position_conflict` inferred from applyFirstPresent — cannot verify sidecar accepts it |
| `cancelAction` | Backend key `cancel_action` inferred — cannot verify |
| `originSession` | Backend key `origin_session` inferred — cannot verify |
| `detectionSession` | Backend key `detection_session` inferred — cannot verify |
| `monteCarlo` | Backend key `monte_carlo` inferred — cannot verify |

**Resolution path:** Mount the FX-OB-Backtester repo, search `run_backtest.py` / `config_schema.py` / `backtest_engine.py` for these key names. If present, add them to `buildBacktesterConfig()` in the same pattern as existing fields (e.g. `position_conflict: mapConflictToBackend(cfg.conflict)`). Update `emitted` and `backendKey` in registry accordingly.

---

## Registry Summary

```
frontend/src/data/configRegistry.js
  78 entries
  Groups: core(14) structure(6) execution(5) entry(24) protection(6) session(8) news(12) cost(3)
  Tiers:  tier1(10) tier2(8) tier3(60)
  Emitted: 70   Not emitted: 8
  Exports: CONFIG_REGISTRY, REGISTRY_BY_KEY, getRegistryEntry, getRegistryByGroup, getRegistryByTier
  Self-validation: runs at module load, console.warn only
```

---

## Notes for Phase 2

- `entryMode`, `selectedEntryModel`, `entryResearchExportMode` have no backend keys — they are UI-only controls. The Master Controls drawer must understand these and drive the correct entry model fields when building a draft config.
- The conditional news block in `buildBacktesterConfig()` means news params are only included when `newsBlackout === true`. The drawer must respect this — editing `newsBlackoutBefore` while `newsBlackout=false` has no effect on the sidecar run.
- The asymmetric directional entry fields (`longEntry*`, `shortEntry*`) are only emitted when `directionalEntryMode === "asymmetric"`. Symmetric mode ignores them.
- `newsDebugObIds` is absent from `LOAD_FIELD_LABELS` and from `buildRunConfigLoadReport` — it will not survive a load-from-run round trip. Not a regression introduced here; pre-existing gap.
