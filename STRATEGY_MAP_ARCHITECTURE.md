# Strategy Map — Scenario Selection Architecture Redesign

**Audit date:** May 2026  
**Scope:** `StrategyMap.jsx`, `CandleChart.jsx`, `store.js`, `importer.js`, `controls.jsx`, `ActiveRunContext.jsx`

---

## Audit Findings

### What the backtester actually produces

A "run" is a folder. Inside it, the importer reads file names to build the bundle:

```
trades_single_position.csv                          → variant=single_position, family=baseline
trades_one_per_direction.csv                        → variant=one_per_direction, family=baseline
trades_single_position__entry_triggered_edge_5.csv  → variant=single_position, family=triggered_edge, threshold=5
trades_single_position__entry_triggered_edge_10.csv → variant=single_position, family=triggered_edge, threshold=10
trades_one_per_direction__entry_penetration_10p0.csv → variant=one_per_direction, family=penetration, threshold=10
```

The real hierarchy is therefore:

```
Run (loaded bundle)
└── Entry Family: baseline | triggered_edge | penetration | …
    └── Position Variant: single_position | one_per_direction | allow_multi_position
        └── Threshold: 5 | 10 | 25 (penetration %)
            └── Fill Mode: same | next | both  [per-trade flag, not a separate file]
```

`same/next/both` is not a file-level split — it is the `filled_on_trigger_candle` boolean on each trade row. It is a filter dimension, not a separate scenario file.

---

### Current state problems

**1. Three atoms compose one implicit scenario.**  
`runId` (global store) + `selectedTradeVariant` (global store) + `selectedEntryModelByRun[runId]` (localStorage per-run map) must all be held in mind simultaneously to know what the chart is showing. Nothing enforces their coherence. Changing the run doesn't necessarily update the entry model selection sensibly.

**2. Entry model key encodes structure in a string.**  
`"entry_triggered_edge_5"` is parsed by regex in `formatEntryModelKey()` and `normalizeEntryModelKey()`. The family, threshold, and (partially) fill mode are all embedded in one opaque string. This is the root cause of every downstream fragility: the `buildEntryModelOptions()` has to re-parse all trade rows to reconstruct the hierarchy, the triggered-edge toggle group is gated by a string prefix check, and RR tools are derived from the same string rather than from a structured type.

**3. State explosion in StrategyMap.jsx.**  
There are ~20 individual `useState` calls for layer toggles. `resetViewSettings()` is a 30-line function that enumerates every atom by hand. Adding one new layer toggle requires touching: the `DEFAULT_LAYERS` constant, the `useState` call, the `saveStrategyMapUi` effect, the `resetViewSettings` function, the `CandleChart` prop, and the toggle chip render — six separate places.

**4. Raw run selector.**  
The run `<NeonSelect>` on line 549 iterates `importedRuns.slice(0, 20)` and exposes raw run IDs. There is no grouping by project, family, or symbol. The user has no way to understand which runs belong to the same research thread.

**5. Overlay derivation is a parallel forest, not a tree.**  
`baseVariantTrades → activeTrades → filteredTrades / chartObBoxes / chartTradeMarkers / rrTools / triggeredEdgeOverlays` are all independently derived from overlapping inputs via parallel `useMemo` chains. Each node re-reads `bundle`, `activeTrades`, `selectedVariant`, `selectedEntryModel` independently. There is no single derivation root.

**6. Baseline and triggered-edge cannot coexist.**  
The entry model dropdown is a mutually exclusive picker. You cannot simultaneously see baseline trade markers as ghost anchors while inspecting triggered-edge overlays on the same OBs.

**7. `same/next/both` has no global control.**  
`badgeState` ("same", "next") is computed per-overlay in `buildTriggeredEdgeOverlays()` but there is no way to filter the visible set by fill mode. The user must read individual badges rather than toggling between populations.

**8. Family-aware controls are conditional renders.**  
The triggered-edge toggle group (Trigger Levels / Lifecycle / OB Badges / Cancelled Setups) appears only when `selectedEntryModelHasTriggeredEdge()` returns true. This is a runtime predicate, not a declarative family contract. Adding a new family's controls requires editing StrategyMap.jsx directly.

---

## Proposed Architecture

### 1. Canonical State Model

Replace the three-atom implicit scenario with one structured object stored in the global store:

```js
// store.js — single source of truth
const DEFAULT_SCENARIO = {
  runId: null,              // string | null
  family: null,             // 'baseline' | 'triggered_edge' | 'penetration' | string | null
  positionVariant: null,    // 'single_position' | 'one_per_direction' | 'allow_multi_position' | null
  threshold: null,          // number | null  (e.g. 5, 10, 25)
  fillMode: null,           // 'same' | 'next' | 'both' | null  (triggered_edge only)
};
```

**Rules:**
- `family: null` means "auto-select best available family for this run."
- `threshold: null` means "auto-select lowest available threshold for this family."
- `fillMode: null` means "both" (no fill-mode filter applied).
- When `runId` changes, `family`, `positionVariant`, `threshold`, and `fillMode` cascade to their best-available defaults — they do not go stale.
- This single object replaces: `activeRunId`, `selectedTradeVariant`, and `selectedEntryModelByRun` in the store, plus the per-run localStorage map in StrategyMap.

```js
// store.js — exported actions
export function setScenario(patch) { ... }   // merges patch, cascades dependents
export function setScenarioRun(runId) { ... } // runId change → resets family/variant/threshold/fillMode to defaults
```

**Persistence:** The scenario is persisted as a single JSON blob under a single localStorage key (`fxob_scenario_v1`). The existing `selectedEntryModelByRun` map is abandoned — it leaks memory across runs and requires the per-run lookup that breaks coherence.

**What drives everything downstream:**

```
selectedScenario (runId + family + positionVariant + threshold + fillMode)
         │
         ▼
   resolvedScenario (hook: useResolvedScenario)
         │
   ┌─────┴──────┬────────────┬─────────────┬─────────────┐
   │            │            │             │             │
trades        OBs     triggeredEdge    rrTools      newsEvents
   │            │      overlays
   ├── filtered │
   ├── stats    │
   └── markers  │
```

Every downstream consumer reads from `resolvedScenario`, not from the raw bundle.

---

### 2. Selector Hierarchy

Replace the flat run picker and flat entry model dropdown with a four-level cascading `ScenarioSelector` component:

```
[ Run ▾ ]  →  [ Family ▾ ]  →  [ Threshold ▾ ]  →  [ Fill Mode ▾ ]
```

**Level 1 — Run selector**

Groups runs by project (or "Unassigned"). Shows symbol + date range as metadata. Becomes the only place `setScenarioRun()` is called.

```
◈  Project A
   ▸  EURUSD · 15m · 2023–2024  (active)
   ▸  EURUSD · 15m · 2022–2023
◈  Project B
   ▸  GBPUSD · 15m · 2024
◈  Unassigned
   ▸  run-abc123
```

**Level 2 — Entry Family selector**

Shows only families present in the current run's bundle. Auto-selects the most interesting family (triggered_edge > penetration > baseline). Labels are human, not raw keys.

```
[ Baseline ]  [ Triggered Edge ]  [ Penetration ]
```

Implemented as a `<Segment>` control (pill toggle group), not a dropdown. At most 3–4 options per run. Renders nothing if only baseline exists.

**Level 3 — Threshold selector**

Visible only when family is `triggered_edge` or `penetration`. Shows available thresholds derived from the bundle's `entryResults.tradesByMode` keys.

```
[ 5% ]  [ 10% ]  [ 25% ]
```

Also a `<Segment>`. Auto-selects the lowest threshold. When a threshold has no trades, it is disabled (not hidden) so the user understands the run was configured for it but produced no results.

**Level 4 — Fill Mode selector**

Visible only when family is `triggered_edge`. Controls the `fillMode` dimension:

```
[ Same ]  [ Next ]  [ Both ]
```

"Both" is the default (no filtering). "Same" = `filled_on_trigger_candle === true`. "Next" = `filled_on_trigger_candle === false` (and trade was not cancelled). Each option shows its trade count in the label: `Same (12)  Next (7)  Both (19)`.

**Placement:** The four levels live in a single `<ScenarioSelector>` component that sits in the chart panel header, replacing the current run `<NeonSelect>` and entry model `<NeonSelect>` + context pills. The context pills (`Run: …`, `Variant: …`, `Entry model: …`) are removed and replaced by the selector itself, which is always visible.

---

### 3. Overlay Derivation Flow

Introduce a single hook that produces all overlays from the canonical scenario. This replaces the parallel `useMemo` forest.

```js
// hooks/useResolvedScenario.js
export function useResolvedScenario(scenario, bundle) {
  // Step 1: resolve raw trades from the bundle
  const rawTrades = useMemo(
    () => resolveTrades(bundle, scenario),
    [bundle, scenario.family, scenario.positionVariant, scenario.threshold]
  );

  // Step 2: apply fill-mode filter
  const trades = useMemo(
    () => applyFillMode(rawTrades, scenario.fillMode),
    [rawTrades, scenario.fillMode]
  );

  // Step 3: enrich OBs with trade linkage
  const orderBlocks = useMemo(
    () => enrichObsWithTradeLabels(bundle?.orderBlocks ?? [], trades),
    [bundle?.orderBlocks, trades]
  );

  // Step 4: derive family-specific overlays
  const familyOverlays = useMemo(
    () => FAMILY_REGISTRY[scenario.family]?.buildOverlays(trades, orderBlocks) ?? [],
    [trades, orderBlocks, scenario.family]
  );

  // Step 5: derive RR tools
  const rrTools = useMemo(
    () => buildRrToolsFromObs(orderBlocks, trades),
    [orderBlocks, trades]
  );

  // Step 6: derive stats
  const stats = useMemo(
    () => buildRunStats(trades, bundle?.summary, bundle, scenario.positionVariant),
    [trades, bundle, scenario.positionVariant]
  );

  return { trades, orderBlocks, familyOverlays, rrTools, stats };
}
```

**Key change:** `familyOverlays` is the generalized name for what is currently called `triggeredEdgeOverlays`. The family registry (see §4) determines what shape those overlays take and how CandleChart renders them.

**`resolveTrades()` replaces** the current `entryTradesByMode()` + `tradesForEntryModel()` + `uniqueTrades()` tangle. It takes a structured scenario instead of a string key:

```js
function resolveTrades(bundle, { family, positionVariant, threshold }) {
  if (family === 'baseline') {
    const key = positionVariant ?? bundle.primaryVariant;
    return bundle.tradesByVariant?.[key] ?? bundle.trades ?? [];
  }
  const entryKey = buildEntryModelKey(family, threshold);  // structured → string
  const byMode = bundle.entryResults?.tradesByMode ?? {};
  if (byMode[entryKey]) return byMode[entryKey];
  // fallback: filter by entry_model_key field
  const base = bundle.tradesByVariant?.[positionVariant ?? bundle.primaryVariant] ?? bundle.trades ?? [];
  return base.filter(t => normalizeEntryModelKey(t.entry_model_key) === entryKey);
}
```

`buildEntryModelKey(family, threshold)` is the single place where structured state is serialized back to the raw string key the data uses. The reverse operation (parsing a raw key string into structured state) only happens during bundle indexing, not at render time.

---

### 4. Family-aware Controls

Replace the conditional render of the triggered-edge toggle group with a declarative family registry. Each family declares its own overlay layer definitions.

```js
// familyRegistry.js
export const FAMILY_REGISTRY = {

  baseline: {
    label: 'Baseline',
    color: 'muted',
    buildOverlays: () => [],
    layers: [],                    // no family-specific layers
  },

  triggered_edge: {
    label: 'Triggered Edge',
    color: 'success',
    buildOverlays: buildTriggeredEdgeOverlays,   // existing function, moved here
    layers: [
      { key: 'triggerLevels',    label: 'Trigger Levels',    dot: 'warning', default: false },
      { key: 'lifecycle',        label: 'Lifecycle',         dot: 'primary', default: false },
      { key: 'obBadges',         label: 'OB Badges',        dot: 'success', default: true  },
      { key: 'cancelledSetups',  label: 'Cancelled Setups', dot: 'secondary', default: true },
    ],
  },

  penetration: {
    label: 'Penetration',
    color: 'warning',
    buildOverlays: buildPenetrationOverlays,     // future
    layers: [
      { key: 'penetrationDepth', label: 'Penetration Depth', dot: 'warning', default: true },
    ],
  },
};
```

**Layer state is no longer 20 individual booleans.** It is one object:

```js
const [layers, setLayers] = useState(DEFAULT_LAYERS);

const toggleLayer = (key) =>
  setLayers(prev => ({ ...prev, [key]: !prev[key] }));
```

Where `DEFAULT_LAYERS` is built from the registry:

```js
const DEFAULT_LAYERS = {
  // universal layers (always present)
  obs: true,
  longs: true,
  shorts: true,
  wins: true,
  losses: true,
  bosChoch: true,
  sessions: true,
  markers: true,
  obOrigin: false,
  obDetection: false,
  obLabels: false,
  rrTools: false,
  news: false,
  newsLabels: false,
  // family-specific layers injected from registry defaults
  ...Object.values(FAMILY_REGISTRY).flatMap(f => f.layers).reduce((acc, l) => {
    acc[l.key] = l.default;
    return acc;
  }, {}),
};
```

**The filter bar renders in two zones:**

```
[ Universal toggles ] | [ Family toggles — from FAMILY_REGISTRY[scenario.family].layers ]
```

Family toggles are absent (not conditionally hidden) when the family has no layers array. Adding a new family requires only adding an entry to `FAMILY_REGISTRY` — zero changes to StrategyMap.jsx.

**`resetViewSettings()`** becomes:

```js
const resetViewSettings = () => {
  setLayers(DEFAULT_LAYERS);
  setDisplayTf('15m');
  setZoom('ALL');
  setChartHeight(DEFAULT_CHART_HEIGHT);
  setShowTradeList(true);
  setShowChartFilters(true);
  setShowSessionEditor(false);
  setSessionSettings(DEFAULT_SESSION_SETTINGS);
  // scenario is NOT reset — view settings are orthogonal to scenario selection
};
```

---

### 5. Baseline vs Triggered-Edge Coexistence

The chart should be able to show baseline trade markers as ghost anchors simultaneously with triggered-edge overlays. The user needs to see which OBs produced a triggered-edge entry vs which produced only a baseline fill, and where baseline fills diverge from triggered fills.

**Mechanism:** When `scenario.family === 'triggered_edge'`, a separate `showBaselineGhost` layer toggle appears in the universal group (off by default). When enabled:

```js
// In useResolvedScenario or StrategyMap
const baselineTrades = useMemo(() => {
  if (!layers.baselineGhost || scenario.family === 'baseline') return [];
  return resolveTrades(bundle, { ...scenario, family: 'baseline', threshold: null });
}, [bundle, scenario, layers.baselineGhost]);
```

`CandleChart` receives a separate `ghostTrades` prop. Ghost trades render as dimmed (40% opacity) markers with no outcome coloring — they are pure position anchors. They share the same OB boxes, so the OB box coloring reflects the active (triggered-edge) outcome, not the baseline outcome.

**The entry model context chips** are updated to show the active scenario and the ghost baseline status side by side:

```
[ Triggered Edge · 5% · Both ]  [ + Baseline ghost ○ ]
```

This coexistence does not require any change to the data model or store — it is purely a rendering concern resolved by the ghost trades prop.

---

### 6. How `same/next/both` Should Work

`fillMode` is a first-class filter dimension in `ScenarioSelection`, not a badge on individual overlays. Here is the full contract:

**`fillMode: 'both'` (default)**  
No filtering. All triggered-edge trades are shown. OB badges show the per-trade `badgeState` as today. Trade count in level 4 selector shows total.

**`fillMode: 'same'`**  
Filters `rawTrades` to `filled_on_trigger_candle === true`. Filters `familyOverlays` to `filledOnTriggerCandle === true`. The effect is that only same-candle fills are shown on the chart. The stats panel recalculates on the filtered set.

**`fillMode: 'next'`**  
Filters to `filled_on_trigger_candle === false` AND the trade was not cancelled before entry. Cancelled setups appear regardless of fillMode when the Cancelled Setups layer is on — cancellations are lifecycle events, not fills.

**`applyFillMode()` function:**

```js
function applyFillMode(trades, fillMode) {
  if (!fillMode || fillMode === 'both') return trades;
  return trades.filter(t => {
    const cancelled = t.cancelled_before_entry || t.cancelledBeforeEntry;
    if (cancelled) return true;  // always include cancelled setups
    if (fillMode === 'same') return t.filled_on_trigger_candle === true;
    if (fillMode === 'next')  return t.filled_on_trigger_candle === false;
    return true;
  });
}
```

**Stats panel:** When `fillMode !== 'both'`, the stats panel shows a pill: `Filtered: Same candle fills only (12 of 19)`. This prevents silent data elision — the user always knows the filter is active.

**The level 4 selector badges** show live counts as the run loads:

```
[ Same (12) ]  [ Next (7) ]  [ Both (19) ]
```

Counts are derived from the raw (pre-fillMode) trades so they are stable even when the filter changes.

---

### 7. How Future Families Scale Cleanly

Adding a new entry family (e.g., `retrace_entry`, `fvg_tap`, `confirmation_candle`) requires touching exactly two files:

**File 1 — `familyRegistry.js`**

Add the new family's entry:

```js
retrace_entry: {
  label: 'Retrace Entry',
  color: 'primary',
  buildOverlays: buildRetraceEntryOverlays,  // new file
  layers: [
    { key: 'retraceLevels', label: 'Retrace Levels', dot: 'primary', default: true },
  ],
},
```

**File 2 — `overlays/retraceEntryOverlays.js`**

Implement `buildRetraceEntryOverlays(trades, obs)`. The function receives the already-resolved, already-fillMode-filtered trades and the enriched OB array. It returns an array of overlay objects in the same shape as `triggeredEdgeOverlays`.

**What you do NOT touch:**
- `StrategyMap.jsx` — the selector hierarchy auto-discovers families from the bundle
- `store.js` — the scenario state model is family-agnostic
- `CandleChart.jsx` — it receives `familyOverlays` (generic) + `layers` (generic)
- `useResolvedScenario.js` — the registry call is already generic

**CandleChart's family overlay interface:**

```js
// CandleChart receives a generic overlay list:
<CandleChart
  familyOverlays={familyOverlays}        // [{type, ...}]
  activeFamilyKey={scenario.family}      // 'triggered_edge' | 'penetration' | ...
  layers={layers}
  // ...universal props unchanged...
/>
```

Inside CandleChart, overlays are dispatched by `overlay.type` to family-specific renderers that are also registered (a lightweight second registry, or just a switch on `activeFamilyKey`). This keeps CandleChart's internal draw calls clean without hard-coding triggered-edge specifics.

---

### 8. Implementation Phases

**Phase 1 — Structured scenario state** *(~1 day, no visible UI change)*

Replace the three-atom implicit scenario with `ScenarioSelection` in `store.js`. Update `setActiveRunId`, `setSelectedTradeVariant`, and the localStorage persistence layer. Add `setScenario()` and `setScenarioRun()` actions. All existing consumers continue to read the same derived values — this phase is internal only.

Deliverable: `store.js` exports `scenario` and `setScenario`. `getDataset()` still returns `ACTIVE_TRADE_VARIANT` etc. for backward compat.

**Phase 2 — `useResolvedScenario` hook** *(~1 day, internal refactor)*

Extract the `useMemo` forest from `StrategyMap.jsx` into `useResolvedScenario(scenario, bundle)`. Remove the parallel derivation chain. StrategyMap.jsx now destructures `{ trades, orderBlocks, familyOverlays, rrTools, stats }` from the hook. All existing props to CandleChart stay identical for now.

Deliverable: StrategyMap.jsx is ~200 lines shorter. No UI change.

**Phase 3 — Family registry** *(~0.5 days)*

Create `familyRegistry.js`. Move `buildTriggeredEdgeOverlays` into it. Convert the 20 boolean `useState` calls to a single `layers` object. `resetViewSettings()` shrinks to 8 lines. The triggered-edge toggle group is now driven by `FAMILY_REGISTRY[scenario.family].layers`.

Deliverable: Adding a new layer toggle requires only adding one object to a registry entry.

**Phase 4 — `ScenarioSelector` component** *(~1.5 days, first visible UI change)*

Build the four-level `<ScenarioSelector>` using existing `<Segment>` and `<NeonSelect>` primitives. Wire it to `setScenario()`. Remove the run `<NeonSelect>`, the entry model `<NeonSelect>`, and the three context pills. The run selector becomes a grouped dropdown (by project). The family/threshold/fillMode levels render only when meaningful options exist.

Deliverable: Users see Run → Family → Threshold → Fill Mode in the chart header.

**Phase 5 — Baseline ghost layer** *(~0.5 days)*

Add `baselineGhost` to universal layers. Add `ghostTrades` prop to CandleChart. Implement dimmed ghost trade marker rendering. Wire the `showBaselineGhost` toggle to the `useResolvedScenario` secondary call.

Deliverable: Users can toggle baseline ghost anchors while viewing any non-baseline family.

**Phase 6 — Fill-mode counts + stats pill** *(~0.5 days)*

Compute same/next/both counts from raw trades. Display live counts in the level 4 selector labels. Add the "Filtered: Same candle fills only (N of M)" pill to the stats panel when fillMode is active. Verify cancelled setups pass through all fillMode filters correctly.

Deliverable: full `same/next/both` UX is complete with counts and filter transparency.

---

## State Summary: Before vs After

| Concern | Before | After |
|---|---|---|
| What run is active | `activeRunId` (global) | `scenario.runId` (global) |
| Which position variant | `selectedTradeVariant` (global) | `scenario.positionVariant` (global) |
| Which entry model | `selectedEntryModelByRun[runId]` (localStorage map) | `scenario.family + threshold` (structured, single key) |
| Fill mode filter | No global control — per-badge only | `scenario.fillMode` ('same' / 'next' / 'both') |
| Layer toggles | ~20 individual `useState` booleans | one `layers` object |
| Reset | 30-line function enumerating every atom | 8 lines, view-only |
| Family-aware controls | Conditional renders in StrategyMap.jsx | `FAMILY_REGISTRY[family].layers` — declarative |
| Overlay derivation | Parallel `useMemo` forest | `useResolvedScenario` — single tree |
| New family support | Edit StrategyMap.jsx + CandleChart.jsx | Add one object to `FAMILY_REGISTRY` |
| Baseline + triggered-edge | Mutually exclusive | Ghost layer toggle |

---

## Files Affected

| File | Change |
|---|---|
| `data/store.js` | Replace 3-atom scenario with `ScenarioSelection`; add `setScenario`, `setScenarioRun` |
| `pages/StrategyMap.jsx` | Remove `useMemo` forest; remove 20 booleans; mount `ScenarioSelector`; use `useResolvedScenario` |
| `components/lab/CandleChart.jsx` | Replace `triggeredEdgeOverlays` prop with generic `familyOverlays`; add `ghostTrades` |
| `hooks/useResolvedScenario.js` | New file — the derivation tree |
| `components/lab/ScenarioSelector.jsx` | New file — four-level cascading selector |
| `lib/familyRegistry.js` | New file — family declarations, overlay builders, layer definitions |
| `overlays/triggeredEdgeOverlays.js` | Moved from inline StrategyMap.jsx function |

No changes to: `controls.jsx`, `NeonPanel.jsx`, `DataTable.jsx`, `store importer`, project/run management.
