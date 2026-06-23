# DIRECTIONAL-ENTRY-1 — Audit: Long/Short-Specific Entry Model Support

**Mode:** Read-only audit. No implementation, no file changes.
**Date:** 2026-06-04
**Repos audited:** FX-OB-Research-Lab (frontend) · Lux-OB-Backtester (backend)

---

## 1. Current Architecture Summary

### How direction works today

Direction is a **global pre-simulation OB filter**, not a per-trade or per-entry-model concept.

In `StrategyBuilder.jsx`, the user picks one of `"Both"` / `"Long"` / `"Short"`. `buildBacktesterConfig()` maps this to a single string `trade_direction: "both" | "long" | "short"` in the JSON payload.

In `Lux-OB-Backtester/src/execution.py`, `simulate_trades()` receives `trade_direction` as a single string. At OB enqueue time, `_direction_allowed(ob_direction, trade_direction)` decides whether each order block is eligible. Bullish OBs are excluded when `trade_direction == "short"`, bearish OBs are excluded when `trade_direction == "long"`. This runs before any entry model logic — it is purely a universe filter.

### How entry models work today

`run_backtest.py::entry_scenarios(config)` generates one scenario dict per `entry_model × threshold × delay` combination. Each scenario becomes a separate `simulate_trades()` call. Output: `trades_{execution_mode}__{entry_model_key}.csv`. There is no mechanism to vary entry model within a single scenario based on trade direction.

### Gap

There is no concept of "longs use model A, shorts use model B" anywhere in either repo. `trade_direction` and `entry_model` are entirely orthogonal fields with no intersection point.

---

## 2. Frontend Data / Config Findings

### StrategyBuilder.jsx state shape (relevant fields)
```
entryMode:                  "single" | "research"
selectedEntryModel:         "baseline" | "entry_penetration" | "triggered_edge"
direction:                  "Both" | "Long" | "Short"
triggeredEdgeDelays:        int[]
singlePenetrationPct:       number
singleTriggeredEdgeThreshold: number
```

`buildBacktesterConfig(cfg)` serializes these as:
- `trade_direction: mapBuilderTradeDirection(cfg.direction)` → one string
- `entry_models: [...]` → array (direction-blind)
- No `directional_entry_models` or per-direction entry field

### entryAnalytics.js — key discovery

**`buildMixedDirectionSimulation({ longModelKey, shortModelKey, tradesByMode, activeVariant })`** already exists and is fully implemented. It:
1. Looks up longs from `tradesByMode[\`${activeVariant}__${longModelKey}\`]` and filters for `direction === "bullish"`
2. Looks up shorts from `tradesByMode[\`${activeVariant}__${shortModelKey}\`]` and filters for `direction === "bearish"`
3. Merges the two arrays chronologically by `detection_time`
4. Computes combined stats (`longNetR`, `shortNetR`, combined `stats`, `lowN` flag)
5. Returns `{ longNetR, shortNetR, stats, longN, shortN, lowN }`

This is the core of Option D and it is already built. It just needs a UI surface.

**`bestModelByDirection(exactRows, tradesByMode, activeVariant)`** also exists — iterates all PLANNED_ENTRY_MODES and finds best model per direction by expectancy. Returns `{ bestLongModel, bestShortModel, bestBalancedModel }`.

### importer.js — filename routing

`entryTradeFileInfo(name)` uses regex:
```
/^trades_(single_position|allow_multi_position|one_per_direction)__(entry_.+)\.csv$/
```

This regex requires the entry key to start with `entry_`. Any new directional scenario key format (e.g. `long__entry_triggered_edge_25p0_d2`) would fail to parse unless the regex is updated. The `{baseVariant}__{mode}` key stored in `entryTradesByMode` would also need a new lookup branch.

### tradeUniverse.js — no impact for Option D

`resolveTradeUniverse()` resolves trades from `entryTradesByMode` by canonical key. As long as the importer correctly populates `entryTradesByMode`, the resolver is direction-agnostic. For Option D (frontend merge), no changes to tradeUniverse.js are needed because `buildMixedDirectionSimulation` bypasses it.

### sessionAnalytics.js — relevant infrastructure

`applySessionRules(trades, sessionRules)` already supports per-session direction filtering:
```js
if (dir === "long" && !rule.direction.long) { excluded.push(trade); continue; }
if (dir === "short" && !rule.direction.short) { excluded.push(trade); continue; }
```

It also supports per-session entry model filtering via `rule.entryModels`. The infrastructure exists to combine session-level with direction-level filters, but no entry-model-per-direction assignment exists yet.

### SessionLabWorkspace.jsx — current props

`SessionLabWorkspace` receives `{ trades, bundle }`. It uses the global direction toggle and session rules. It has no awareness of multiple entry models or mixed-direction simulation. The `buildMixedDirectionSimulation` function is never called from any UI component currently.

---

## 3. Backtester Findings

### config.py

`BacktestConfig` is a frozen dataclass. The `trade_direction` field is a single `str = "both"`. No per-direction entry model fields exist. Adding new fields is clean — the dataclass accepts defaults, and the validation pipeline in `run_backtest.py::main()` can accommodate new validators.

### execution.py

`simulate_trades()` signature: single `entry_model: str` and `trade_direction: str`. There is no path inside `simulate_trades` to branch on entry model based on the direction of the OB being processed. `_direction_allowed()` runs before any entry model logic, so even if direction were checked inside the entry model path, OBs filtered out upstream never reach it.

`simulate_entry_penetration_batch()` has the same constraint — one `trade_direction` for all thresholds.

`TRADE_COLUMNS` includes both `direction` and `entry_model_key` as per-row columns, meaning each trade row already carries its direction. This is the key that makes Option D's frontend merge possible.

### run_backtest.py

`entry_scenarios(config)` generates scenario dicts from config fields. For TE: iterates `triggered_edge_trigger_thresholds × triggered_edge_candle_delays`. Each scenario has one `mode`, one `threshold_pct`, one `triggered_edge_delay_candles`. There is no branching on direction — all scenarios inherit `config.trade_direction`.

`execute_scenario_job()` / sequential pass both call `simulate_trades(..., trade_direction=config.trade_direction, ...)`. A directional scenario would require the job to carry both a `long_entry_model` and `short_entry_model`, run two separate `simulate_trades` calls, concat the DataFrames (filtering longs/shorts respectively), then write the merged CSV. This is new but not complex code.

**Key constraint:** For conflict-resolution execution modes (`single_position`, `allow_multi_position`), a true "mixed direction" simulation requires that both the long and short OBs go through the same simulation pass so position conflicts are applied across both directions. Splitting into two sequential passes and merging the CSVs post-hoc skips this conflict resolution entirely. This produces **approximate, not true** results for those execution modes.

For `one_per_direction`, long and short positions never conflict by design, so a split-pass merge is **exact**.

---

## 4. Option Comparison Table

| | **Option A: Backend native (`directional_entry_models` field)** | **Option B: Two flat fields (`long_entry_model` + `short_entry_model`)** | **Option C: Two separate backend runs + frontend merge** | **Option D: Pure frontend merge (existing CSVs)** |
|---|---|---|---|---|
| **Backend changes** | New config field + split-pass execution in run_backtest.py | Same as A, just flatter key shape | None — run twice manually with `trade_direction=long/short` | None |
| **Config changes** | `BacktestConfig` + `buildBacktesterConfig()` + `LOAD_FIELD_LABELS` | Same | None | None |
| **Importer changes** | New filename pattern + new `entryTradesByMode` key format | Same | New key prefix for merged files, or no new files at all | None |
| **UX changes** | Full Strategy Builder directional entry panel | Full Strategy Builder directional entry panel | User runs backtest twice, then manually selects in Session Lab | Add "Asymmetric Entry Preview" panel in Session Lab |
| **Simulation correctness** | ✅ True (single pass, conflict rules apply) | ✅ True (same) | ⚠️ Approximate (conflict rules not applied cross-direction) | ⚠️ Approximate (same as C) |
| **Exact for `one_per_direction`?** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Implementation effort** | High — all three layers change | High — same | Medium — frontend only, but requires two manual run steps | Low — frontend only, zero new files |
| **Can be shipped incrementally?** | No — all-or-nothing | No — same | Yes | ✅ Yes — ship now |
| **Risk of stats confusion** | Low — clearly a single run | Low | Medium — users may compare runs with different OB universes | Medium — users must understand it's a post-hoc merge |

---

## 5. Recommended Config Shape

### Strategy Builder JSON payload (new fields, backward-compatible)

Add these fields to `buildBacktesterConfig()` and `BacktestConfig`. All are optional with defaults that preserve current behavior:

```json
{
  "trade_direction": "both",

  // NEW: per-direction entry model override
  // null = use the global entry_models list (current behavior)
  "long_entry_models": null,
  "short_entry_models": null,

  // NEW: per-direction TE delays (null = use global triggered_edge_candle_delays)
  "long_triggered_edge_delays": null,
  "short_triggered_edge_delays": null,

  // NEW: per-direction penetration thresholds (null = use global)
  "long_entry_penetration_thresholds": null,
  "short_entry_penetration_thresholds": null
}
```

When `long_entry_models` is non-null and `trade_direction == "both"`, `run_backtest.py` runs two passes per scenario slot: one with `trade_direction="long"` using `long_entry_models`, and one with `trade_direction="short"` using `short_entry_models`. Results are concatenated and written as a new keyed CSV.

### BacktestConfig additions (Python)
```python
long_entry_models: list[str] | None = None
short_entry_models: list[str] | None = None
long_triggered_edge_delays: list[int] | None = None
short_triggered_edge_delays: list[int] | None = None
long_entry_penetration_thresholds: list[float] | None = None
short_entry_penetration_thresholds: list[float] | None = None
```

Frozen dataclass allows `None` as defaults. Validation: add `validate_directional_entry_config()` to `main()`.

---

## 6. Recommended Strategy Builder UX

### Mode selector

Extend the existing entry model panel with a direction scope toggle:

```
[ Symmetric ▼ ]   ← current default (one model for both directions)
[ Long Only   ]   ← separate model for longs; shorts use baseline
[ Short Only  ]   ← separate model for shorts; longs use baseline
[ Asymmetric  ]   ← fully separate models for each direction
```

### Asymmetric layout

When "Asymmetric" is selected, expand to two side-by-side panels:

```
┌─────────────────────────┐   ┌─────────────────────────┐
│  LONG ENTRY             │   │  SHORT ENTRY             │
│  ○ Baseline             │   │  ○ Baseline              │
│  ○ Penetration  [25%]   │   │  ● Triggered Edge        │
│  ● Triggered Edge       │   │    Delays: [Next]        │
│    Delays: [+2]         │   │                          │
└─────────────────────────┘   └─────────────────────────┘
```

"Long Only" and "Short Only" modes show one panel; the other direction is implicitly baseline with no config surface.

### State shape additions to StrategyBuilder

```js
// New fields
directionalEntryMode: "symmetric" | "long_only" | "short_only" | "asymmetric"
longEntryModel:       "baseline" | "entry_penetration" | "triggered_edge"
longTriggeredEdgeDelays: int[]
longPenetrationPct:   number
shortEntryModel:      "baseline" | "entry_penetration" | "triggered_edge"
shortTriggeredEdgeDelays: int[]
shortPenetrationPct:  number
```

### LOAD_FIELD_LABELS additions required

All six new fields must be added to `LOAD_FIELD_LABELS` in StrategyBuilder.jsx for run-config recall to work. This is a mandatory step — without it, recalled configs silently drop the directional entry config.

### estimateScenarioPlan updates required

`estimateScenarioPlan(config)` must account for directional scenarios when `directionalEntryMode !== "symmetric"` — pass count roughly doubles for each directional scenario.

---

## 7. Recommended Backend Export Naming

### New CSV key format for directional scenarios

When longs and shorts use different entry models, the scenario key must encode both. Proposed format:

```
trades_{execution_mode}__dir_{long_key}__vs__{short_key}.csv
```

Examples:
```
trades_single_position__dir_entry_triggered_edge_25p0_d2__vs__entry_baseline.csv
trades_allow_multi_position__dir_entry_penetration_25p0__vs__entry_triggered_edge_25p0_next.csv
trades_one_per_direction__dir_entry_baseline__vs__entry_triggered_edge_25p0_d2.csv
```

The `dir_` prefix signals to the importer that this is a directional scenario. The `__vs__` separator is unambiguous because canonical entry keys never contain `__`.

### Importer regex update required

`entryTradeFileInfo()` in importer.js must add a new branch:
```js
// Existing pattern (unchanged):
/^trades_(single_position|allow_multi_position|one_per_direction)__(entry_.+)\.csv$/

// New directional pattern:
/^trades_(single_position|allow_multi_position|one_per_direction)__dir_(entry_.+)__vs__(entry_.+)\.csv$/
```

The new pattern populates a new `entryTradesByMode` key format: `{variant}__dir_{longKey}__vs__{shortKey}`.

`normalizeEntryModeKey()` in importer.js must handle `dir_` prefixed keys without stripping them.

---

## 8. Session Lab Preview Strategy

### Phase 1 (ship now — zero backend cost)

`buildMixedDirectionSimulation()` is already fully implemented in `entryAnalytics.js`. It just needs a UI surface.

**What to add to SessionLabWorkspace:**

1. Pass `bundle` → expose `tradesByMode` (bundle already has it via `entryResults.tradesByMode`)
2. Add `buildMixedDirectionSimulation` import
3. Add a collapsible "Asymmetric Entry Preview" panel below the direction toggle

The panel UI:
```
┌─ Asymmetric Entry Preview ──────────────────────────────────┐
│  Longs: [ Triggered Edge 25% · D+2  ▼ ]                    │
│  Shorts: [ Triggered Edge 25% · Next ▼ ]                   │
│                                                             │
│  ⚠ Approximate — this merges two scenario CSVs post-hoc.   │
│    For true mixed simulation, run the backtester with       │
│    directional entry config (coming in Phase 2).            │
│                                                             │
│  Combined Net R: +4.12R   Longs: +2.80R   Shorts: +1.32R   │
│  Trades: 47   Long N: 24   Short N: 23                      │
└─────────────────────────────────────────────────────────────┘
```

Session rules from `applySessionRules` are applied on top of the merged trade set — the preview respects session filters.

### Key correctness note to surface in UI

The `lowN` flag from `buildMixedDirectionSimulation` must be surfaced. When either side has < `MIN_DIRECTION_N` (15) trades, the stats are unreliable and the panel should show a warning.

The "approximate" caveat applies specifically to `single_position` and `allow_multi_position` because conflict resolution is not applied across the two sets. For `one_per_direction`, the merge is exact. The panel should indicate which execution mode is active.

### Phase 4 (future — per-session directional entry)

`applySessionRules` already supports both `rule.direction` and `rule.entryModels` per session. A future extension could allow per-session asymmetric entry by storing `rule.longEntryModel` and `rule.shortEntryModel` in session rules, then filtering from the relevant per-direction tradesByMode slice. This is a natural extension of the existing rule shape — no architectural surgery required.

---

## 9. Phased Implementation Plan

### Phase 1 — Frontend Preview (no backend, ship immediately)
**Goal:** Surface `buildMixedDirectionSimulation()` in Session Lab as a research tool.

Files to touch:
- `SessionLabWorkspace.jsx` — add `tradesByMode` prop wiring and Asymmetric Entry Preview panel
- `sessionAnalytics.js` or a new `mixedEntryPreview.js` — thin wrapper if needed (but the core function is already in entryAnalytics.js)
- No backtester changes. No importer changes. No config changes.

**Caveat in UI:** Label clearly as "Approximate — not a true backtest". Show execution mode. Show `lowN` warning.

---

### Phase 2 — Config Layer (no simulation changes)
**Goal:** Add directional entry fields to config everywhere except the simulator.

Files to touch:
- `StrategyBuilder.jsx` — new state fields (`directionalEntryMode`, `longEntryModel`, etc.), new UI panel (asymmetric layout), `buildBacktesterConfig()` additions, `LOAD_FIELD_LABELS` additions, `estimateScenarioPlan()` update
- `Lux-OB-Backtester/src/config.py` — add six new optional fields to `BacktestConfig`
- `Lux-OB-Backtester/scripts/run_backtest.py` — add `validate_directional_entry_config()`, stub out directional scenario generation (can no-op when fields are null)

This phase makes the config round-trip correctly without yet implementing the simulation split.

---

### Phase 3 — Backend Split-Pass Execution
**Goal:** True directional simulation — one merged CSV per directional scenario.

Files to touch:
- `Lux-OB-Backtester/scripts/run_backtest.py` — add `directional_entry_scenarios(config)` generator that yields scenario dicts with `long_model` and `short_model`; add execution branch that runs two `simulate_trades()` calls and concats results
- `Lux-OB-Backtester/src/config.py` — no changes beyond Phase 2
- `frontend/src/data/importer.js` — add `dir_` filename pattern regex, new `entryTradesByMode` key format
- `frontend/src/components/lab/entries/analytics/entryRegistry.js` — add directional scenario keys to `PLANNED_ENTRY_MODES` if needed for the entry lab display

**Conflict resolution caveat:** For `single_position` / `allow_multi_position`, document in the manifest that directional scenarios are split-pass (approximate). True single-pass directional simulation would require refactoring `simulate_trades()` internals — defer to a later phase.

---

### Phase 4 — Session Lab Deep Integration
**Goal:** Per-session directional entry model assignment.

Files to touch:
- `sessionAnalytics.js` — extend `SessionRuleShape` with `longEntryModel?: string` and `shortEntryModel?: string`; extend `applySessionRules()` to pull longs from the relevant model's trade pool and shorts from another
- `SessionLabWorkspace.jsx` — add per-session entry model dropdowns inside the session rule UI
- `SessionCard.jsx` / `SessionDrilldown.jsx` — surface per-session entry model badges

This phase leverages the existing `rule.direction` + `rule.entryModels` infrastructure and is a natural extension.

---

## 10. Exact First Implementation Prompt

```
MODE: IMPLEMENT
TASK: DIRECTIONAL-ENTRY-1-PHASE-1 — Asymmetric Entry Preview Panel in Session Lab

GOAL: Surface the existing buildMixedDirectionSimulation() function from
entryAnalytics.js as a UI panel inside SessionLabWorkspace.jsx.
This is a research/preview feature only — it uses post-hoc CSV merging and
must be clearly labeled as approximate.

FILES TO MODIFY:
  frontend/src/components/lab/session/SessionLabWorkspace.jsx
  (No other files need to change for this phase)

EXACT CHANGES:

1. Update SessionLabWorkspace props to accept activeVariant (string) in
   addition to trades and bundle. The activeVariant is the execution mode
   key (e.g. "allow_multi_position") used as the prefix in tradesByMode.

2. Import buildMixedDirectionSimulation and bestModelByDirection from
   "../../entries/analytics/entryAnalytics".

3. Import entryTradesByMode from "../../../data/tradeUniverse" (already
   exported from that module — it reads from bundle.entryResults.tradesByMode).

4. Add state:
     const [showMixedPreview, setShowMixedPreview] = useState(false);
     const [mixedLongKey, setMixedLongKey] = useState("baseline");
     const [mixedShortKey, setMixedShortKey] = useState("baseline");

5. Derive available entry model keys from the bundle:
     const tradesByMode = useMemo(() => entryTradesByMode(bundle), [bundle]);
     const availableKeys = useMemo(
       () => Object.keys(tradesByMode)
               .filter(k => k.startsWith(`${activeVariant}__`))
               .map(k => k.replace(`${activeVariant}__`, "")),
       [tradesByMode, activeVariant]
     );

6. Compute the mixed preview:
     const mixedPreview = useMemo(() => {
       if (!showMixedPreview) return null;
       return buildMixedDirectionSimulation({
         longModelKey: mixedLongKey,
         shortModelKey: mixedShortKey,
         tradesByMode,
         activeVariant,
       });
     }, [showMixedPreview, mixedLongKey, mixedShortKey, tradesByMode, activeVariant]);

7. Render a collapsible "Asymmetric Entry Preview" panel between the
   PreviewPanel and the session card grid. The panel contains:
   - Toggle button: "Asymmetric Entry Preview" with Power icon
   - When open:
     - Warning badge: "Approximate — post-hoc merge, not a true backtest"
     - Two model selectors (long / short) using <select> over availableKeys
     - Stats row: Combined Net R, Longs Net R, Shorts Net R, Long N, Short N
     - If mixedPreview.lowN is true, show a second warning:
       "Low sample size (< 15 trades per side) — stats unreliable"

CONSTRAINTS:
- Do not change sessionAnalytics.js, entryAnalytics.js, or importer.js
- Do not add any new files
- Do not change the SessionLabWorkspace prop contract for existing callers
  (trades and bundle remain required; activeVariant can default to
   bundle?.primaryVariant || "single_position")
- Label must clearly say "Approximate" — do not omit this
```

---

*End of DIRECTIONAL-ENTRY-1 audit.*
