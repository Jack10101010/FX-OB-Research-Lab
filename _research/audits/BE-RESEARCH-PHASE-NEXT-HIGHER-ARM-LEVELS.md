# BE-RESEARCH-PHASE-NEXT-HIGHER-ARM-LEVELS

> Research expansion only: adds 2.5R / 3R / 3.5R to the supported BE arm levels,
> consistently across the app. No protection/universe architecture, BE calc,
> replay, selective, or layer logic changed. No new protection modes.

## Phase A — audit (every arm-level source)
Frontend BE arm-level arrays (before):
- `data/configTranslator.js` `BE_ARM_LEVEL_CHOICES` = `[0.25, 0.5, 0.75, 1, 1.5, 2]` — **generation source of truth** (Strategy Builder → `be_arm_levels` config).
- `pages/StrategyBuilder.jsx` `BE_ARM_CHOICES` (chips) + default `beArmLevels` — duplicated `[0.25..2]`.
- `components/lab/protection/BreakevenTab.jsx` `ARM_LEVELS` (BE scenario table) + the selective Arm-Level radio — duplicated `[0.25..2]`.
- `data/selectiveBeUniverse.js` `DEFAULT_ARM_LEVELS` — already `[0.25..3.5]` (Max-Arm ladder, added earlier).
- Importer maps `be_arm_level_r` per-row (no list); `beResolve` formats/parses keys with `:.2f→p` (no list).

Backend (`Lux-OB-Backtester`): `config.py` `be_arm_levels: list[float]` (no whitelist); `run_backtest.py:536-537` builds keys `be_{basis}_{arm:.2f→p}R`; no validation/clamp against a fixed set. **Backend accepts any positive arm level as-is — no backend code change required.**

## Phase B/C — files changed
- `data/configTranslator.js` — `BE_ARM_LEVEL_CHOICES` extended to `[0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5]` (the **single source of truth**).
- `pages/StrategyBuilder.jsx` — chips and default `beArmLevels` now reference `BE_ARM_LEVEL_CHOICES` (removed both hardcoded arrays).
- `components/lab/protection/BreakevenTab.jsx` — `ARM_LEVELS` (scenario rows) and the selective Arm-Level radio now use `BE_ARM_LEVEL_CHOICES` (removed both hardcoded arrays).
- `data/selectiveBeUniverse.js` `DEFAULT_ARM_LEVELS` — unchanged (already the full ladder; mirrors the canonical list because that module is import-free for its harness).
- Validation: `selectiveBeUniverse` §24, `beIntegration` §3, `beConfigSerialization`.

Single-select arm logic, explorer semantics, and all UX behaviour are unchanged — only the level set is larger.

## Phase D — explorer support
`deriveMaxArmReached` + the "Max Arm" column already existed (added in the Explorer phase). It now covers the new levels via the extended `DEFAULT_ARM_LEVELS`. Verified: `mfe 2.73 → 2.5R`, `3.22 → 3R`, `0.84 → 0.75R`, `4.0 → 3.5R` (top of ladder). Sortable/filterable as before; derived research metadata only — trade results untouched.

## New arm levels available
`0.25R, 0.5R, 0.75R, 1R, 1.5R, 2R, 2.5R, 3R, 3.5R` — offered in the Strategy Builder, the Break-even scenario table, the selective Arm-Level filter, the explorer Max-Arm bucket, and serialized to `be_arm_levels`.

## Validation results
- `selectiveBeUniverse` §24 ✅ — DEFAULT_ARM_LEVELS includes 2.5/3/3.5; existing levels unchanged; no duplicates/sorted; Max-Arm spec examples; selective arm filter at 2.5/3/3.5 (`armLevel 3 → mfe≥3 only`); labels "2.5R"/"3.5R".
- `beIntegration` §3 ✅ — `formatArmToken`/`beScenarioKey`/`parseBeScenarioKey` round-trip 2.5/3/3.5 (`2p50`/`3p00`/`3p50`).
- `beConfigSerialization` ✅ — `BE_ARM_LEVEL_CHOICES` includes the new levels; `buildBeConfig` serializes `[0.5, 2.5, 3, 3.5]` with no whitelist drop.
- Regression ✅: `protectionTimeline`, `protectionLayers`, `protectionPhase3`, `beReplay`. Four changed files transpile clean; 0 new typography violations.

## Phase F — research readiness
1. **Files changed:** the four above + three validation harnesses. No backend files changed.
2. **New levels available:** 2.5R, 3R, 3.5R (plus the existing six).
3. **Existing BE runs incompatible?** No. The new levels are additive. Existing runs simply have no EXACT files for 2.5/3/3.5 — those arm rows resolve to REPLAY (candle-walk) or "unavailable" in the panel, exactly as any non-generated arm does today. Nothing breaks; older runs render unchanged.
4. **New BE generation run required?** Yes, to get **EXACT** results for 2.5/3/3.5. Until a run is generated with the expanded `be_arm_levels`, those levels are REPLAY-tier only (or empty if the run has no candles). The 0.25–2R EXACT data already present is reused unchanged.
5. **Recommended full-generation settings** (long-term BE research dataset):
   - `be_enabled: true`
   - `be_arm_levels: [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5]` (the new default once you open a fresh strategy)
   - `be_trigger_bases: ["wick", "close"]` (both, for trigger-basis research)
   - `be_variants: "all"` if you want BE on every entry variant, else `"baseline"`
   - `be_stop_buffer_r: 0`, `be_delay_candles: 0` (defaults; change only for buffer research)
   - Cost note: 9 arms × 2 triggers = **18 BE passes per variant** (vs 12 before). The Strategy Builder now defaults `beArmLevels` to all 9 — deselect higher arms if you want a lighter run.

## Intentional compromises
- The Strategy Builder **default** selection now includes all 9 arms (one source of truth + research-complete dataset); this raises default generation cost — deselect to reduce. Choices and default intentionally reference the same canonical list.
- `selectiveBeUniverse.DEFAULT_ARM_LEVELS` is a deliberate mirror of `BE_ARM_LEVEL_CHOICES` (kept import-free for its single-file validation harness); a §24 test asserts the new levels are present so the two can't silently drift on the levels that matter.

> Untracked scratch files (`frontend/_tp*.mjs`, `_attrSmoke.mjs`, `_cohortAudit.mjs`) need `rm` on the host.
