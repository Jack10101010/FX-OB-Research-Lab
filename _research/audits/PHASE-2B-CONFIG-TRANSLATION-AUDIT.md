# MASTER-CONTROLS-PHASE-2B — Config Translation Audit

**Date:** 2026-06-05
**Branch:** codex-dev
**Mode:** AUDIT ONLY — no files modified
**Scope:** Config translation pipeline, round-trip integrity, ownership model, draft architecture, registry gaps, session matrix compatibility, Phase 3 recommendation

---

## 1. Current Config Translation Pipeline

There are **four distinct config-handling paths** in the codebase. Understanding which path does what is prerequisite to Phase 3.

### Path A — Forward translation (StrategyBuilder → sidecar)

```
cfg (useState, ~78 fields, camelCase)
    │
    ▼  buildBacktesterConfig(cfg)          [StrategyBuilder.jsx lines 1464–1650]
    │
    │  Simple scalar mappings:
    │    symbol, dateFrom/dateTo, swing, minObSizePips, maxObSizePips,
    │    rr, obEntryDepthPct, entryBuffer, stopBuffer, verifyTicks,
    │    spread, slippage, commission, newsBlackout*, newsFile*, news*
    │
    │  Transform mappings:
    │    detectionTf     M15        → detection_timeframe  "15min"
    │    executionTf     "1m"       → execution_timeframe  "1min"
    │    dataFile        "data/candles/X.csv"  → candle_file  "X.csv"
    │    obFilter        "ATR"      → ob_filter            "Atr"
    │    executionMode   "multi_position" → execution_modes ["allow_multi_position"]
    │    direction       "Both"     → trade_direction      "both"
    │
    │  Composite array builders:
    │    bosLong/Short + chochLong/Short → allowed_structure_directions ["bos_long", ...]
    │    allowed_structure_directions    → structure_filter "bos"|"choch"|"both" (legacy)
    │    london/lull/newYork/asia/outside (when sessionFilter=true)
    │                                   → allowed_sessions ["london", "new_york", ...]
    │
    │  Entry model matrix (state-machine over entryMode + selectedEntryModel):
    │    single+baseline         → entry_models ["baseline"]
    │    single+entry_penetration → entry_models ["entry_penetration"],
    │                               entry_penetration_thresholds [singlePenetrationPct]
    │    single+triggered_edge   → entry_models ["triggered_edge"],
    │                               triggered_edge_trigger_thresholds [singleTriggeredEdgeThreshold]
    │    research (multi-model)  → entry_models ["baseline", +"entry_penetration", +"triggered_edge"],
    │                               entry_penetration_thresholds [...],
    │                               batch_entry_penetration bool,
    │                               triggered_edge_trigger_thresholds [...], ...
    │
    │  Asymmetric directional block (when directionalEntryMode="asymmetric"):
    │    longEntry*/shortEntry*   → directional_entry_config.long/short.*
    │                             + flat keys: long_entry_models, short_entry_models,
    │                               long/short_triggered_edge_delays, etc.
    │
    │  Conditional news block (ONLY when cfg.newsBlackout === true):
    │    newsBlackoutBefore/After, newsBlackoutImpacts, newsBlackoutCurrencies,
    │    newsPausePending, newsBlockFills, newsCancelIfTouched,
    │    newsFlattenActiveTrades, newsFlattenMinutesBefore
    │    + newsDebugObIds (ONLY when non-empty)
    │
    ▼
sidecarConfig JSON  →  POST /runs  →  FX-OB-Backtester Python sidecar (http://127.0.0.1:8787)
```

### Path B — Bundle ingestion (sidecar output → store)

```
run bundle folder: config.json + summary.json + order_blocks.csv + trades_*.csv (+ candles.csv)
    │
    ▼  ingestRunBundle()                   [importer.js]
    │
    │    config.json    → run.config        (verbatim JSON object)
    │    summary.json   → run.summary       (verbatim JSON object)
    │    order_blocks.csv → run.obBoxes     (per-OB rows; includes ob_origin_session,
    │                                         ob_detection_session as OUTPUT metadata)
    │    trades_*.csv   → run.tradesByVariant   (per-variant trade arrays)
    │    candles.csv    → IndexedDB             (stored separately, large)
    │
    ▼  addRunBundle(bundle)                [store.js]
    │
    │    headlineSummary(run)  → configSummary (11 fields only):
    │        symbol, detection_timeframe, execution_timeframe,
    │        start_date, end_date, rr_multiple, stop_buffer_pips,
    │        entry_buffer_pips, verify_limit_ticks, ob_entry_depth_pct,
    │        structure_filter
    │    → persisted to localStorage index (lite copy)
    │    full bundle lives in memory (+ IndexedDB for candles)
    │
    ▼
store state: run object accessible via useDataset() → getRunData(id)
```

### Path C — Reverse translation (run bundle → StrategyBuilder cfg)

```
run object (from store)
    │
    ▼  buildRunConfigLoadReport(current, run)  [StrategyBuilder.jsx lines 2079–2228]
    │
    │    source = { ...run.summary, ...run.config }   (config values take precedence)
    │
    │    applyFirstPresent() calls for each cfg key:
    │      tries multiple candidate backend keys in priority order
    │      applies inverse mapper if present
    │      writes to patch{} only if a non-null value is found
    │
    │    Special case — allowed_structure_directions → chip booleans:
    │      if source.allowed_structure_directions is array:
    │        patch.bosLong  = array.includes("bos_long")
    │        patch.bosShort = array.includes("bos_short")  etc.
    │      else: derive from coarse structure + direction values
    │
    │    Directional entry: reads nested directional_entry_config.long/short.*
    │      THEN flat overrides (long_entry_enabled, etc. — newer format takes precedence)
    │
    │    entryMode inference: explicit "entryMode"/"entry_mode" first;
    │      else defaults to "research" when entry_models array is non-empty
    │
    │    returns: { config: {...current, ...patch}, loadedFields, missingFields }
    │
    ▼
cfg patch merged into StrategyBuilder useState
```

### Path D — Display helper (run bundle → display-only config summary)

```
run object (from store)
    │
    ▼  extractRunConfig(run)               [runConfigHelpers.js]
    │
    │    Reads config → summary → configSummary → run (4-layer fallback)
    │    Returns a REDUCED set of ~20 display fields (no entry model matrix)
    │    Used by: RunConfigStrip, ComparisonLab, compareRunConfigs()
    │    NOT a translation layer — display only, does not produce cfg patch
    │
    ▼
display config object (symbol, detectionTf, rr, sessions, allowedStructureDirections, news fields, etc.)
```

### Critical architectural note

Paths A and C are **private functions inside StrategyBuilder.jsx** alongside all their helper mappers. Path D is a separate module. There is currently **no shared translation module** — if Master Controls needs to read or write a sidecarConfig, it must either re-implement translation logic or import from the page component, which is architecturally wrong.

---

## 2. Round-Trip Integrity

A "round-trip" is: user sets cfg field → buildBacktesterConfig emits it → sidecar returns it in run.config → buildRunConfigLoadReport reconstructs it.

### Fully round-trippable (23 fields)

These survive without information loss:

| cfg key | Backend key | Notes |
|---------|-------------|-------|
| `symbol` | `symbol` | Direct string |
| `detectionTf` | `detection_timeframe` | Bijective: M15↔"15min" |
| `executionTf` | `execution_timeframe` | Bijective: "1m"↔"1min" |
| `dateFrom` | `start_date` | ISO date string |
| `dateTo` | `end_date` | ISO date string |
| `dataFile` | `candle_file` | Prefix stripped on emit, re-added on load |
| `swing` | `swing_length` | Number |
| `obFilter` | `ob_filter` | "ATR"↔"Atr" (loader forces uppercase) |
| `minObSizePips` | `min_ob_size_pips` | Number |
| `maxObSizePips` | `max_ob_size_pips` | Number |
| `rr` | `rr_multiple` | Number |
| `obEntryDepthPct` | `ob_entry_depth_pct` | Number |
| `entryBuffer` | `entry_buffer_pips` | Number |
| `stopBuffer` | `stop_buffer_pips` | Number |
| `verifyTicks` | `verify_limit_ticks` | Number |
| `spread` | `spread_pips` | Number |
| `slippage` | `slippage_pips` | Number |
| `commission` | `commission_r_per_trade` | Number |
| `newsBlackout` | `news_blackout_enabled` | Bool |
| `newsBlackoutBefore/After` | `news_blackout_minutes_*` | Number; emitted only when newsBlackout=true |
| `newsBlackoutImpacts` | `news_blackout_impacts` | Array |
| `newsBlackoutCurrencies` | `news_blackout_currencies` | Array |
| `newsPausePending`, `newsBlockFills`, `newsCancelIfTouched`, `newsFlattenActiveTrades`, `newsFlattenMinutesBefore` | news_* | Bool/Number |
| `newsFile` | `news_file` | String |
| `entryResearchExports` | `entry_models` (membership) | mapConfigEntryResearchExports checks "entry_penetration" in array |
| `triggeredEdgeEntries` | `entry_models` (membership) | mapConfigTriggeredEdgeEntries checks "triggered_edge" in array |
| `entryPenetrationThresholds` | `entry_penetration_thresholds` | Array↔comma string; lossless |
| `useBatchedEntryPenetration` | `batch_entry_penetration` | Bool |
| `triggeredEdgeThresholds` | `triggered_edge_trigger_thresholds` | Array↔comma string |
| `triggeredEdgeEntryLevelPct`, `triggeredEdgeSameCandleMode`, `triggeredEdgeDelays` | triggered_edge_* | Number/string/array |
| All `triggeredEdgeCancel*` fields | triggered_edge_cancel_* | Bool/Number |
| `triggeredEdgeFftMoveAway*` | triggered_edge_fft_* | Number |
| `directionalEntryMode` | `directional_entry_mode` | "symmetric"\|"asymmetric" |
| `longEntry*` / `shortEntry*` (10 fields) | flat + nested in directional_entry_config | Loader reads both paths; flat wins |
| `sessionFilter` | `session_filter_enabled` | Bool |
| `bosLong/Short`, `chochLong/Short` | `allowed_structure_directions` (array) | Reconstructed from array in loader |
| `structure` | `structure_filter` | Derived from chips; mapConfigStructure handles "bos"\|"choch"\|"both" |
| `direction` | `trade_direction` | mapBuilderTradeDirection / mapConfigDirection |
| `executionMode` | `execution_modes[0]` | Fuzzy matching on known values; brittle on unknowns |

### BROKEN round-trips (6 confirmed bugs)

**BUG 1 — Session chips not reconstructed from `allowed_sessions` array**

`buildBacktesterConfig` emits `allowed_sessions: ["london", "new_york"]` (array). `buildRunConfigLoadReport` tries `applyFirstPresent(patch, source, "london", ["london", "session_london", "include_london"])`. None of these keys exist in config.json — only `allowed_sessions` does. Result: `london`, `lull`, `newYork`, `asia`, `outside` chips **never get patched**; they retain their pre-load values (all default true).

**Impact:** A run that excluded Asia session loads back as Asia-included. Any diff against the active config shows sessions as clean when they are not.

**Fix required before Phase 3:** Add array-to-chip reconstruction in `buildRunConfigLoadReport`:
```javascript
// After existing sessionFilter applyFirstPresent:
if (Array.isArray(source.allowed_sessions)) {
    const s = source.allowed_sessions;
    patch.london  = s.includes("london");
    patch.lull    = s.includes("lull") || s.includes("london_lull");
    patch.newYork = s.includes("new_york") || s.includes("new york");
    patch.asia    = s.includes("asia");
    patch.outside = s.includes("outside");
}
```

**BUG 2 — `entryMode` always loads as "research"**

`buildBacktesterConfig` does not emit `entry_mode`. `buildRunConfigLoadReport` tries to read `["entryMode", "entry_mode"]` — not found. Falls back: if `entry_models` array is present (it always is), sets `patch.entryMode = "research"`. Result: single-mode configurations are **indistinguishable from research-mode** after loading.

**Impact:** A user who configured single+triggered_edge and runs a backtest cannot reload that config in StrategyBuilder without it switching to research-mode UI.

**Fix:** Emit `_entry_mode: cfg.entryMode` in buildBacktesterConfig (prefixed to avoid backend confusion), and read it back on load.

**BUG 3 — `selectedEntryModel` is lost**

Not emitted by `buildBacktesterConfig`. Not in `buildRunConfigLoadReport`. Resets to default `"baseline"` on every load.

**Fix:** Emit `_selected_entry_model: cfg.selectedEntryModel` alongside `_entry_mode`.

**BUG 4 — `singlePenetrationPct` round-trips to wrong field**

In single+entry_penetration mode, `singlePenetrationPct` → `entry_penetration_thresholds: [value]`. On load, `buildRunConfigLoadReport` reads `entry_penetration_thresholds` → `entryPenetrationThresholds` (the research-mode multi-threshold field). `singlePenetrationPct` is never populated. Combined with BUG 2 (entryMode → research), the user's single-mode threshold is scattered into the wrong field and the wrong mode.

**BUG 5 — `singleTriggeredEdgeThreshold` same pattern**

Same as BUG 4. Single-mode triggered-edge threshold → `triggered_edge_trigger_thresholds` → loaded into `triggeredEdgeThresholds` (research mode), not `singleTriggeredEdgeThreshold`.

**BUG 6 — `newsDebugObIds` not in `buildRunConfigLoadReport`**

Explicitly noted in Phase 1 audit. `newsDebugObIds` is absent from `LOAD_FIELD_LABELS` and from `buildRunConfigLoadReport`. Value is lost on round-trip. Not user-facing in normal use, but tracked here for completeness.

### Not emitted — trivially cannot round-trip (8 fields)

| cfg key | Reason |
|---------|--------|
| `conflict` | Backend unconfirmed — see Phase 1B audit |
| `cancelAction` | Backend unconfirmed |
| `originSession` | Backend unconfirmed |
| `detectionSession` | Backend unconfirmed |
| `monteCarlo` | Explicitly not implemented |
| `entryMode` | UI-only control (BUG 2) |
| `selectedEntryModel` | UI-only control (BUG 3) |
| `entryResearchExportMode` | UI-only; inferred on load from threshold values (partially recoverable) |

### Partial round-trips (3 fields)

| cfg key | Status |
|---------|--------|
| `entryResearchExportMode` | Inferred by `mapConfigEntryResearchExportMode` — correct for "light" (25,50) and "full" (10,25,50,75); reads as "custom" for any other threshold combination |
| `structure` | Derived from `allowed_structure_directions`; correct when array is present. Degrades gracefully via coarse structure/direction fallback for old bundles |
| `executionMode` | `mapConfigExecutionMode` uses fuzzy `.includes()` matching — lossless for the three known modes ("multi", "direction", everything else → "single") but would silently misclassify any future mode that doesn't fit the pattern |

---

## 3. Translation Ownership

### Current state

`buildBacktesterConfig()` and `buildRunConfigLoadReport()` are private functions declared inside `StrategyBuilder.jsx`. All ~20 mapper helper functions (`mapDetectionTf`, `mapConfigDetectionTf`, `mapConfigObFilter`, etc.) are also private to StrategyBuilder.

`runConfigHelpers.js` is a separate module but is a **display helper only** — it reads config from run bundles for comparison UI. It has its own key aliases and normalization. It is NOT a shared translation layer.

This creates three problems:
1. Master Controls cannot call `buildBacktesterConfig` without importing from the page component (wrong dependency direction).
2. Any new field requires edits in four places: cfg state, buildBacktesterConfig, buildRunConfigLoadReport, and potentially extractRunConfig — all scattered.
3. The display layer (runConfigHelpers) can silently diverge from the translation layer (StrategyBuilder) because they share no code.

### Option A — StrategyBuilder owns translation (current)

**Keep everything in StrategyBuilder.jsx.**

- Advantage: no refactor now.
- Disadvantage: MasterControls must either duplicate translation logic or `import buildBacktesterConfig from "../pages/StrategyBuilder"` — importing from a page component into a layout component is a circular dependency violation.
- Verdict: **Not viable for Phase 3.**

### Option B — New shared `configTranslator.js`

**Extract both functions + all helpers into `frontend/src/data/configTranslator.js`.**

- StrategyBuilder imports from configTranslator.js (no functional change to StrategyBuilder's behaviour)
- MasterControls imports from configTranslator.js
- configRegistry.js remains metadata-only
- runConfigHelpers.js can optionally be aligned or merged later

Exports:
```javascript
export function buildSidecarConfig(cfg)           // was buildBacktesterConfig
export function loadRunConfig(run, currentCfg)    // was buildRunConfigLoadReport
// All mapper functions also exported for external use and testing
export { mapDetectionTf, mapConfigDetectionTf, ... }
```

- Advantage: single source of truth, testable, no circular deps.
- Disadvantage: moderate extraction refactor (~300 lines moved, function signatures unchanged).
- **This is the correct move for Phase 3.**

### Option C — configRegistry + translator layer (registry-driven)

**Use configRegistry metadata to automate simple 1:1 mappings; hand-code complex cases.**

For the 40+ simple scalar fields (number/bool/string with a direct backendKey and no transformation), translation could be auto-generated from the registry. For composite fields (allowed_structure_directions, allowed_sessions, entry_models, directional_entry_config), hand-coded handlers remain.

- Advantage: adding a new simple field only requires a registry entry; translation is automatic.
- Disadvantage: the entry model matrix, session chip reconstruction, and conditional news block are too stateful and complex for a generic registry-driven approach.
- Best as a **long-term improvement after Option B is in place.**

### Recommendation

**Phase 3: implement Option B immediately.**
Create `frontend/src/data/configTranslator.js` as a pre-condition for any editable-controls work. StrategyBuilder becomes a consumer of configTranslator, not its owner. MasterControls uses the same module.

After Phase 3 stabilizes: selectively move simple-field translation toward Option C (auto-derive from backendKey + defaultValue) while keeping complex handlers explicit.

---

## 4. Draft Config Architecture

### State design

MasterControlsContext should manage:

```
{
    // Drawer UI
    isOpen: boolean

    // Active run config — READ-ONLY, derived from store
    // Populated via loadRunConfig(run) when activeRunId changes
    // Null when no run is active
    activeConfig: cfg | null

    // Draft — editable copy of activeConfig
    // Null until user makes first edit (lazy init)
    draftConfig: cfg | null

    // Keys that differ between draftConfig and activeConfig
    // Computed on every setDraftField call
    dirtyFields: Set<string>

    // Per-field validation errors (key → message)
    // Computed on every setDraftField call against registry metadata
    validationErrors: Map<string, string>

    // Phase 3 actions
    setDraftField(key: string, value: any): void
    resetDraft(): void         // revert draftConfig to activeConfig
    commitDraft(): void        // dispatch draftConfig as new run

    // Phase 2 (current) — drawer only
    openMasterControls(): void
    closeMasterControls(): void
    toggleMasterControls(): void
}
```

### Key architecture principles

**Principle 1 — activeConfig is derived, not owned.**
When `activeRunId` changes, `loadRunConfig(run, defaultCfg)` is called from within `MasterControlsContext` using the run from the store. The result is stored as `activeConfig`. This requires configTranslator.js to exist (see Q3). MasterControls does NOT subscribe to StrategyBuilder's `useState`.

**Principle 2 — draftConfig is independent of StrategyBuilder.**
StrategyBuilder has its own `useState(cfg)` for building new runs from scratch. MasterControls has `draftConfig` for proposing deltas against a live run. These are two separate workspaces that can diverge. If the user edits RR in StrategyBuilder AND edits RR in MC's draft, those are two different proposals. Phase 5 comparison tooling will surface this.

**Principle 3 — lazy draft init.**
`draftConfig` starts null. On first `setDraftField` call, it is initialized as a copy of `activeConfig` (or as a full-defaults cfg if no active run), then the field is applied. This avoids holding a duplicate copy of cfg state when the user hasn't made any edits.

**Principle 4 — dirtyFields is re-computed, not maintained.**
After each `setDraftField`, `dirtyFields` is rebuilt by diffing every key in CONFIG_REGISTRY between `draftConfig` and `activeConfig`. For 78 fields this is O(78) — negligible. No need for incremental tracking.

**Principle 5 — composites require multi-field awareness.**
Fields that contribute to composite arrays (bosLong/bosShort/chochLong/chochShort → allowed_structure_directions; london/lull/etc → allowed_sessions; entry model flags → entry_models) must be patched as a group when building the sidecar config from the draft. `buildSidecarConfig(draftConfig)` already handles this correctly — the draft just needs to be a valid cfg object, which it is.

**Principle 6 — no localStorage persistence for draft.**
The draft is ephemeral — it's a scratchpad for the current session. It disappears on page refresh. If the user wants to persist a config proposal, they use the existing preset system.

### Tier-aware rerun behavior

When the user commits a draft:
- Tier 1 changes (direction/session chips/structure chips) — these SHOULD be proposable as frontend-only filters. However, since the current backend produces session-tagged trade output, tier-1 semantics require a rerun to be truly accurate. Phase 3 should still dispatch a full rerun for all changes but label tier 1 fields with "fast rerun" in the UI.
- Tier 2 changes (rr, buffers, obEntryDepthPct) — full rerun but engine re-scores existing OBs, typically fast.
- Tier 3 changes — full rerun, potentially long.

Phase 3 should display the highest tier among `dirtyFields` as the "rerun cost" indicator before the user commits.

---

## 5. Registry Gaps

### Fields that must NOT be user-editable in Master Controls

| Field | Reason |
|-------|--------|
| `dataFile` | Server filesystem path. User cannot browse the sidecar's filesystem. Show read-only. |
| `newsFile` | Same. Show read-only. |
| `newsDebugObIds` | Development/debug flag. Never show in MC. Advanced-mode only if exposed at all. |

### Fields to hide behind advanced mode (not shown in basic MC panel)

**Entry model complexity (12 fields):**
- `entryMode`, `selectedEntryModel`, `entryResearchExportMode` — UI-control fields, only meaningful as a unit
- `triggeredEdgeCancelOnRetrace`, `triggeredEdgeCancelRetracePips`, `triggeredEdgeCancelRetraceObPct` — TE sub-settings
- `triggeredEdgeCancelOnFirstFailedTag`, `triggeredEdgeFftMoveAwayPips`, `triggeredEdgeFftMoveAwayObMultiple` — TE FFT sub-settings

**Directional entry (10 fields):**
- All `longEntry*`, `shortEntry*` fields — only relevant when `directionalEntryMode = "asymmetric"`; should be conditionally hidden

**Unimplemented backend features (5 fields):**
- `conflict`, `cancelAction`, `originSession`, `detectionSession`, `monteCarlo` — must be hidden in MC until backend is implemented. Showing controls for features that have no effect is actively misleading.

### Registry metadata additions needed for Phase 3

The current registry schema `{ key, label, group, tier, emitted, backendKey, defaultValue }` is insufficient for rendering editable controls. Required additions:

```javascript
// Required for Phase 3 form rendering:
editable: boolean,           // false for dataFile, newsFile, newsDebugObIds, dropped fields
masterControlsVisible: boolean, // false for advanced/hidden fields
advancedMode: boolean,       // true for fields only shown in advanced panel
inputType: "number" | "boolean" | "select" | "multiselect" | "comma_array" | "date" | "text",
options: string[] | null,    // for select/multiselect; null for free-form

// Required for Phase 3 validation:
validation: {
    min?: number,
    max?: number,
    step?: number,
    required?: boolean,
}
```

Example additions:
```javascript
{ key: "rr", ..., editable: true, masterControlsVisible: true, advancedMode: false,
  inputType: "number", validation: { min: 0.5, max: 20, step: 0.1 } }

{ key: "detectionTf", ..., editable: true, masterControlsVisible: true, advancedMode: false,
  inputType: "select", options: ["M5", "M15", "M30", "H1", "H4"] }

{ key: "dataFile", ..., editable: false, masterControlsVisible: true, advancedMode: false }
```

### Entry group is too large (24 fields)

The `entry` group has 24 fields, which is too many for a flat panel. Introduce sub-groups within the group:

| Sub-group label | Fields |
|----------------|--------|
| Entry basics | entryMode, selectedEntryModel, obEntryDepthPct, entryBuffer, singlePenetrationPct, singleTriggeredEdgeThreshold |
| Research export | entryResearchExportMode, entryResearchExports, entryPenetrationThresholds, useBatchedEntryPenetration |
| Triggered edge | triggeredEdgeEntries, triggeredEdgeThresholds, triggeredEdgeEntryLevelPct, triggeredEdgeSameCandleMode, triggeredEdgeDelays |
| TE protection | triggeredEdgeCancel* fields (5), triggeredEdgeFft* fields (2) |
| Directional | directionalEntryMode, longEntry* fields (5), shortEntry* fields (5) |

Add `subgroup: string | null` to the registry schema to support this. For Phase 3, the MC panel can use `subgroup` to render collapsible entry sub-sections.

---

## 6. Future Session Matrix Compatibility

### The two meanings of "session matrix"

The term "session matrix" refers to two distinct things in this codebase that must not be conflated:

**Meaning A — Config input filter:** Which trading sessions are ALLOWED in a backtest run. These are the `london`, `lull`, `newYork`, `asia`, `outside` boolean fields that feed into `allowed_sessions`. These determine which trades the backend produces.

**Meaning B — Post-hoc analysis filter:** The session × structure × direction × entry model cross-product analysis done in SessionLab on already-imported trade data. This reads `fill_session`, `ob_origin_session`, `ob_detection_session` from per-trade and per-OB output columns. It's an analysis lens, not a config input.

Master Controls is a **config input** system. It is concerned with Meaning A only.

### Current registry compatibility with session-filtered rerun (Meaning A)

The registry already supports this correctly. The 5 session chip fields (`london`, `lull`, `newYork`, `asia`, `outside`) are:
- `tier: 1` (frontend filter — no rerun required per original tier definition, though in practice a rerun IS required to get correct session-tagged output)
- `group: "session"` with `backendKey: "allowed_sessions"` (composite)
- `emitted: true`

A Phase 3 "session filter" section in MC can display these 5 chips + `sessionFilter` toggle directly from the registry with no structural changes needed. **Compatible without redesign.**

### Regarding per-session structure/direction/entry config

A deeper session matrix — where each session has its own structure type, direction, and entry model — would look like:

```
{ london: { structure: "BOS", direction: "Long", entry: "triggered_edge" }, ... }
```

This does NOT exist as a backend feature. The backend accepts a single global config (not per-session variants). Supporting this would require new backend capability AND a new config schema that the current registry cannot represent. This is a future architecture concern, not a Phase 3 concern.

**Verdict:** Current registry structure is fully compatible with session-filtered reruns. No changes needed to support Phase 3 session controls. Per-session structure/entry config is out of scope and would require a new registry schema extension when the time comes.

### Specific concern: `originSession` / `detectionSession`

These remain unimplemented (Phase 1B audit confirmed). When the backend eventually supports them, they are config INPUTS that filter OBs by the session they were formed/detected in. They would slot into the existing `session` group without requiring structural changes. The registry already has placeholder entries with `emitted: false`.

---

## 7. Recommended Architecture for Phase 3

### Pre-conditions (must complete before editable controls)

**Pre-condition 1 — Create `frontend/src/data/configTranslator.js`**

Extract from StrategyBuilder.jsx:
- `buildBacktesterConfig` → `buildSidecarConfig(cfg): object`
- `buildRunConfigLoadReport` → `loadRunConfig(run, currentCfg): { config, loadedFields, missingFields }`
- All private mapper helpers (mapDetectionTf, mapConfigDetectionTf, normalizeEntryThresholds, etc.)
- `applyFirstPresent`, `removeEmptyPatchValues`, `toNumber`, `toBool`, `ensureArray`, `normalizeDateValue`

StrategyBuilder.jsx imports from configTranslator.js. No functional changes — just the source of truth moves.

**Pre-condition 2 — Fix session chip round-trip bug (BUG 1)**

In `loadRunConfig` (the extracted function), add `allowed_sessions` → chip reconstruction before merging the patch. This is a data integrity fix that affects Phase 3's `activeConfig` derivation.

**Pre-condition 3 — Add `_entry_mode` emission (BUG 2/3)**

In `buildSidecarConfig`, add `_entry_mode` and `_selected_entry_model` to the config object so they survive the round-trip. The Python backend ignores unknown keys (or they can be stripped before submission). This unblocks reliable activeConfig derivation for single-mode runs.

### Phase 3 implementation plan

**Step 1 — Expand `MasterControlsContext`**

```
MasterControlsContext owns:
  isOpen, open/close/toggle (existing)
  activeConfig: cfg | null     ← derived from store.activeRunId via loadRunConfig
  draftConfig: cfg | null      ← lazy-init copy of activeConfig
  dirtyFields: Set<string>     ← re-computed from CONFIG_REGISTRY keys
  validationErrors: Map<string, string>

  setDraftField(key, value)
  resetDraft()
  commitDraft()  → calls buildSidecarConfig(draftConfig), then startSidecarRun
```

**Step 2 — Expand `configRegistry.js`**

Add `editable`, `masterControlsVisible`, `advancedMode`, `inputType`, `options`, `validation`, `subgroup` to each entry. This is additive — no existing consumers break. Phase 3 MC reads these; Phase 2 drawer continues to work using existing fields.

**Step 3 — Implement `MasterControlsDrawer` Phase 3 content**

Replace phase placeholder sections with:
- Active Config Panel (read-only, from activeConfig, rendered field-by-field using registry metadata)
- Draft Panel (editable, shown when draftConfig is non-null, fields rendered by inputType)
- Dirty Fields indicator (badge showing count + highest tier among dirty fields)
- Commit button (disabled when dirtyFields is empty or validationErrors is non-empty)

Render field groups from registry, hiding `masterControlsVisible: false` and `advancedMode: true` fields unless advanced toggle is on.

**Step 4 — Wire up commitDraft**

`commitDraft` in context:
1. Calls `buildSidecarConfig(draftConfig)` → sidecarConfig
2. Calls `startSidecarRun(sidecarConfig)` from sidecarClient
3. Polls for result and calls `ingestRunBundle` + `addRunBundle` (same pattern as StrategyBuilder)
4. Sets new run as active

This is the only step that requires access to sidecarClient — it can call the same functions StrategyBuilder already uses.

### What NOT to do in Phase 3

- Do not duplicate `cfg` state. MC has one draftConfig; StrategyBuilder has its own useState. They are independent.
- Do not make MC a "lite StrategyBuilder." MC operates on LOADED run configs, not fresh configs. The full from-scratch builder stays in StrategyBuilder.
- Do not add editable fields before configTranslator.js exists. Without the shared translator, Phase 3 inevitably creates parallel translation logic.
- Do not expose `conflict`, `cancelAction`, `originSession`, `detectionSession`, or `monteCarlo` as editable fields until backend support is confirmed.
- Do not add store.js dependencies beyond `activeRunId` → `getRunData`. MC context must not subscribe to StrategyBuilder's internal state.

---

## Summary Table

| Question | Finding | Action required |
|----------|---------|-----------------|
| Config pipeline | 4 paths: buildBacktesterConfig, ingestRunBundle/store, buildRunConfigLoadReport, runConfigHelpers (display) | Document established |
| Round-trip | 6 confirmed broken round-trips; 3 partial; 8 fields not emitted | Fix BUG 1 (sessions) before Phase 3; BUG 2/3 (entryMode) also pre-condition |
| Translation ownership | Currently private to StrategyBuilder.jsx; cannot share without circular dep | Create configTranslator.js before Phase 3 editable controls |
| Draft config | activeConfig + draftConfig + dirtyFields + validationErrors in MasterControlsContext | Lazy init, derived from store, independent of StrategyBuilder state |
| Registry gaps | dataFile/newsFile non-editable; 27 fields need advancedMode; 8 unimplemented fields must be hidden; 6 new metadata fields needed for Phase 3 rendering | Add editable/inputType/options/validation/advancedMode/subgroup to registry |
| Session matrix | Current registry supports session-filtered rerun without changes; per-session structure/entry requires new backend feature | No registry changes needed for Phase 3 |
| Recommendation | (1) configTranslator.js extraction, (2) BUG 1 + BUG 2/3 fixes, (3) registry metadata expansion, (4) MasterControlsContext expansion, (5) Phase 3 drawer content | Strict ordering: translator first, then context, then UI |

---

## Audit Limitation

All findings are based on frontend code only. The FX-OB-Backtester Python sidecar is not mounted. One untested assumption: that the backend echoes the input config.json verbatim in the run bundle output. If the backend transforms or restructures config keys before writing config.json, some "fully round-trippable" fields above may actually be broken. The session chip bug (BUG 1) is confirmed regardless of backend behaviour, since buildBacktesterConfig provably never emits individual session keys.
