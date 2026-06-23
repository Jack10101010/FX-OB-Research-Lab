# TE-DELAY-1 — Audit: Extending Triggered Edge Candle Delay Model

**Mode:** AUDIT ONLY — no files modified  
**Date:** 2026-06-03  
**Files read:** `tradeUniverse.js`, `StrategyBuilder.jsx`, `importer.js`, `SameNextCandlePanel.jsx`, `backend/server.py`

---

## 1. Current Behavior Summary

The triggered-edge entry model today supports two fill-timing modes: **same candle** (the order fills on the same candle as the trigger) and **next candle** (the order fills on the following candle). When a user configures a triggered-edge run:

- Strategy Builder holds a single string state field `triggeredEdgeSameCandleMode: "same" | "next" | "both"` (default `"both"`).
- On export, this maps to the backend config field `triggered_edge_same_candle_modes: string[]`, where the strings are `"same_candle"`, `"next_candle"`, or both.
- The backtester interprets each string as a separate pass, generating one CSV file per threshold per mode.
- CSV filenames follow the pattern `trades_single_position__entry_triggered_edge_25p0_same.csv` / `..._next.csv`. When both modes are run and combined into one file (or when the run pre-dates this feature), the file has no fill-mode suffix: `..._25p0.csv`.
- The frontend importer parses the filename suffix, normalizes it to a canonical key, and stores `fillMode: "same" | "next" | null` on the trade universe option.

---

## 2. Semantics of Same/Next Today

### Layer 1 — Strategy Builder (frontend state)
| UI label | `triggeredEdgeSameCandleMode` | Emitted config |
|---|---|---|
| Same candle only | `"same"` | `["same_candle"]` |
| Next candle only | `"next"` | `["next_candle"]` |
| Both | `"both"` | `["same_candle", "next_candle"]` |

`triggeredEdgeSameCandleModes()` (line 1369) converts the string to the array. The "both" default emits both strings, generating two separate CSV passes per trigger threshold.

### Layer 2 — Backtester config field
`triggered_edge_same_candle_modes` is a `string[]`. The backtester treats each element as an independent scenario, multiplying by thresholds for pass count:
```
totalEntryPasses = triggeredThresholds.length × triggeredModes.length
```
(line 1500: `const triggeredEntry = triggeredThresholds.length * triggeredModes.length`)

### Layer 3 — CSV export key
The backtester appends a suffix to the base key:
- `"same_candle"` → `_same` suffix → `entry_triggered_edge_25p0_same`
- `"next_candle"` → `_next` suffix → `entry_triggered_edge_25p0_next`
- Combined/bare (legacy) → no suffix → `entry_triggered_edge_25p0`

### Layer 4 — Importer normalization (`normalizeEntryModeKey`, line 685–701)
```js
.replace(/^entry_triggered_edge_(\d+)(_same|_next)?$/, "entry_triggered_edge_$1p0$2");
```
Converts integer thresholds to p-form while **preserving** `_same`/`_next` suffix. Keys that are already p-form (e.g. `25p0`) pass through unchanged.

### Layer 5 — tradeUniverse.js (`fillModeFromKey`)
```js
if (/_same$/i.test(key)) return "same";
if (/_next$/i.test(key)) return "next";
return null;  // bare/combined
```
`fillMode` on each universe option is `"same" | "next" | null`.

### Layer 6 — Run Workspace (result view)
`resultViewOptions` groups options as `{ fillMode: "same" }`, `{ fillMode: "next" }`, `{ fillMode: null }`. `breakdownViewLabel` renders:
- `"same"` → `"· Same Candle"`
- `"next"` → `"· Next Candle"`
- `null` → `"· Both"`

### Layer 7 — SameNextCandlePanel.jsx
Reads `row.sameCandleCount` / `row.nextCandleCount` from a single row's funnel data, and does a sibling lookup by swapping `_same`↔`_next` suffix. Renders a binary two-box comparison. Explicitly returns `null` sibling when the mode key has no recognizable suffix.

---

## 3. Recommended Delay Model

### The data model

Replace the binary `same_candle` / `next_candle` string enum with a **numeric delay array** representing candles-after-trigger. The new backend config field should be:

```json
"triggered_edge_candle_delays": [0, 1, 2, 3]
```

Semantics:
- `0` = fill on the same candle as the trigger (equivalent to current `"same_candle"`)
- `1` = fill on the next candle (equivalent to current `"next_candle"`)
- `2` = fill on the 3rd candle after trigger
- `3` = fill on the 4th candle after trigger

Each value in the array is an independent backtester pass, multiplied by the threshold array — the same expansion pattern as thresholds. Three delays × two thresholds = 6 total entry passes.

### CSV key convention

To maximise backward compatibility (see §4), preserve the existing suffixes for delays 0 and 1:

| Delay | CSV suffix | Example key |
|---|---|---|
| 0 | `_same` | `entry_triggered_edge_25p0_same` |
| 1 | `_next` | `entry_triggered_edge_25p0_next` |
| 2 | `_d2` | `entry_triggered_edge_25p0_d2` |
| 3 | `_d3` | `entry_triggered_edge_25p0_d3` |

This means delay=0 and delay=1 produce files identical in naming to the current `same_candle`/`next_candle` outputs — no reimport required for existing runs.

### Why not extend the string enum?

The alternative — adding `"delay_2"`, `"delay_3"` to `triggered_edge_same_candle_modes` — works but is semantically awkward ("same_candle_modes" housing delay=2 and delay=3), grows fragile as delays increase, and requires changing UI labels from the ground up anyway. The numeric array is cleaner and consistent with the `triggered_edge_trigger_thresholds` pattern.

### Why not a single integer "max delay"?

A max-delay approach (run all delays 0..N) removes researcher control over which delays to compare. The array model lets users run `[0, 2]` to skip delay=1, for example.

---

## 4. Backward Compatibility Plan

### Import side — fully backward compatible under the recommended naming

All existing `_same` / `_next` CSV files are unchanged. The importer's `normalizeEntryModeKey()` regex already handles `_same` and `_next`. No re-import needed for any existing run.

For `_d2` / `_d3` files (new), the regex needs a one-line extension:
```js
// Before:
.replace(/^entry_triggered_edge_(\d+)(_same|_next)?$/, "entry_triggered_edge_$1p0$2");

// After:
.replace(/^entry_triggered_edge_(\d+)(_same|_next|_d\d+)?$/, "entry_triggered_edge_$1p0$2");
```

### Config side — additive, no migration

Add `triggered_edge_candle_delays` as a new field alongside `triggered_edge_same_candle_modes`. Strategy Builder maps the UI delay array to both fields for a transition period:
- `triggered_edge_candle_delays: [0, 1]` (new field — authoritative going forward)
- `triggered_edge_same_candle_modes: ["same_candle", "next_candle"]` (legacy field — kept for any backtester version that hasn't adopted the new field)

Old config.json files that only have `triggered_edge_same_candle_modes` are loaded via `mapConfigTriggeredEdgeSameCandleMode` (line 1790) which already reads the legacy field. Loading such a config in Strategy Builder would populate `triggeredEdgeSameCandleMode` (the old single-string state), and a new migration shim converts it to a delay array with `[0]` or `[1]` or `[0, 1]` before displaying. No existing config.json becomes unloadable.

### Run Workspace side

Old runs loaded from store only have `fillMode: "same" | "next" | null`. The result view falls through unchanged. `breakdownViewLabel` needs two new cases (`"d2"`, `"d3"`) but old data never triggers those paths.

---

## 5. Strategy Builder UX Recommendation

### Replace the dropdown with a multi-select chip row

The current `NeonSelect` with three options (Same candle only / Next candle only / Both) cannot express arbitrary delay combinations. Replace it with a checkable chip group — the same pattern used for nothing currently but analogous to how thresholds are selected.

**Proposed control:**
```
Fill Delay (candles after trigger)
[✓ 0 · Same]  [✓ 1 · Next]  [□ 2]  [□ 3]
```

- Default: only `[0]` and `[1]` checked (equivalent to current "Both" default).
- Any subset is valid; at least one must be checked (validation guard).
- Label change: "Same-Candle Behavior" → "Fill Delay (candles after trigger)".
- Hint text: "Each selected delay generates a separate backtester pass."

### Pass count display

`countExpectedPasses()` currently uses `triggeredModes.length`. Replace with `triggeredDelays.length` (length of the new delay array). Display is unchanged in the UI — it already shows a computed pass count; users will simply see it grow as they check more delays.

### State shape change

Old state: `triggeredEdgeSameCandleMode: "same" | "next" | "both"` (string)  
New state: `triggeredEdgeDelays: number[]` (array, default `[0, 1]`)

The `buildBacktesterConfig()` mapper replaces:
```js
teSameCandleModes = triggeredEdgeSameCandleModes(cfg.triggeredEdgeSameCandleMode);
```
with:
```js
teDelays = cfg.triggeredEdgeDelays ?? [0, 1];
```
And emits both `triggered_edge_candle_delays: teDelays` and the legacy `triggered_edge_same_candle_modes` array (mapping `0→"same_candle"`, `1→"next_candle"`, dropping delays>1 from the legacy field so old backtester versions still work correctly without crashing on unknown values).

### Config load (import existing config.json)

`mapConfigTriggeredEdgeSameCandleMode` (line 1790) currently reads the legacy modes array and resolves to `"same"`, `"next"`, or `"both"`. Replace with a shim that reads the new `triggered_edge_candle_delays` field first, then falls back to converting the legacy `triggered_edge_same_candle_modes`:

```js
function mapConfigToDelays(source) {
    if (Array.isArray(source.triggered_edge_candle_delays)) {
        return source.triggered_edge_candle_delays;
    }
    // Legacy fallback
    const modes = ensureArray(source.triggered_edge_same_candle_modes);
    const delays = [];
    if (modes.includes("same_candle")) delays.push(0);
    if (modes.includes("next_candle")) delays.push(1);
    return delays.length ? delays : [0, 1];
}
```

---

## 6. Run Workspace UX Recommendation

### Result view selector

No structural change required. New delays produce new result view options with `fillMode: "d2"` / `"d3"`. The existing grouping logic in `resultViewOptions` will surface them as additional options under the triggered-edge family, following the same `FILL_ORDER` pattern (extended to `["both", "same", "next", "d2", "d3"]`).

`breakdownViewLabel` needs two new cases:
```js
const mode = fm === "same" ? " · Same Candle"
           : fm === "next" ? " · Next Candle"
           : fm === "d2"   ? " · Delay +2"
           : fm === "d3"   ? " · Delay +3"
           : " · Both";
```

### SameNextCandlePanel

The current panel is designed for a binary pair (`_same` ↔ `_next`). For the delay model it has two options:

**Option A (minimal change):** Rename to "Fill Delay" panel. Keep the two-box layout but generalise `findSiblingMode()` to accept any `_d{n}` → `_d{m}` swap, with an arbitrary "reference" delay chosen by the user. The panel would show the currently selected delay vs. one other.

**Option B (preferred for delay ≥ 2):** Replace the binary panel with an N-row comparison table — one row per delay present in `exactRows`. The existing `StatRow` component already supports left/right value comparison; wrapping it into a multi-column grid (selected delay highlighted) is a natural extension.

For Phase 1 (delays 0 and 1 only), Option A is sufficient with no panel changes. Option B is required if delays 2 and 3 are added.

### KPI modal / trade breakdown

No changes needed. Delay is a property of the result view selection, not of the trade rows themselves. The active result view's `breakdownViewLabel` correctly communicates which delay is selected.

---

## 7. Backend/Export Changes Needed

The backend server (`backend/server.py`) is a thin FastAPI wrapper (status-check routes only). All backtester logic lives in a separate Python process invoked by the Strategy Builder's local sidecar runner. The audit could not read that process's source, but based on the config field contract:

### New config field the backtester must read
```json
"triggered_edge_candle_delays": [0, 1, 2, 3]
```

### Pass generation logic change
Current (pseudocode):
```
for threshold in triggered_edge_trigger_thresholds:
    for mode in triggered_edge_same_candle_modes:
        run_pass(threshold, mode)
        write_csv(f"entry_triggered_edge_{threshold}_{mode_suffix}.csv")
```

New:
```
for threshold in triggered_edge_trigger_thresholds:
    for delay in triggered_edge_candle_delays:
        run_pass(threshold, delay)
        suffix = "_same" if delay==0 else "_next" if delay==1 else f"_d{delay}"
        write_csv(f"entry_triggered_edge_{threshold}p0{suffix}.csv")
```

### Per-trade fields

The backtester already exports `armed_on_trigger_candle`, `filled_on_trigger_candle`, `trigger_to_entry_minutes`, `bars_to_fill`. For delays ≥ 2, `bars_to_fill` continues to express the candle count (delay value ≈ bars_to_fill for fills that hit exactly on schedule). No new per-trade fields are strictly required for delay=2/3 — the existing timing fields provide the data.

Optionally, a `fill_delay_candles` field (integer, the actual delay achieved) would enable post-hoc analysis of whether fills hit on the configured candle or earlier/later.

### Summary/candle metadata

The `funnel.sameCandle` / `funnel.nextCandle` counts used by `SameNextCandlePanel` (via `row.sameCandleCount` / `row.nextCandleCount`) are per-mode row stats from the backtester's aggregation. For delay ≥ 2, analogous counters (`d2Count`, `d3Count`) would need to be exported in the summary rows that feed into `exactRows`.

---

## 8. Import / tradeUniverse Changes Needed

### `importer.js` — `normalizeEntryModeKey` (line 698–701)

**Change:** Extend the regex to accept `_d{n}` suffix.
```js
// Current:
.replace(/^entry_triggered_edge_(\d+)(_same|_next)?$/, "entry_triggered_edge_$1p0$2");

// New:
.replace(/^entry_triggered_edge_(\d+)(_same|_next|_d\d+)?$/, "entry_triggered_edge_$1p0$2");
```
This is the only change needed in importer.js for Phase 2. All other parsing (field mapping, enrichment) is delay-agnostic.

### `tradeUniverse.js` — `fillModeFromKey`

**Change:** Add recognition for `_d{n}` suffix.
```js
function fillModeFromKey(key) {
    if (/_same$/i.test(key)) return "same";
    if (/_next$/i.test(key)) return "next";
    const m = key.match(/_d(\d+)$/i);
    if (m) return `d${m[1]}`;  // "d2", "d3", etc.
    return null;
}
```

### `tradeUniverse.js` — `buildCanonicalKey`

**Change:** Handle `"d{n}"` fill modes.
```js
function buildCanonicalKey(family, threshold, fillMode) {
    const base = threshold != null
        ? `entry_${family}_${String(threshold).replace(".", "p")}`
        : `entry_${family}`;
    if (fillMode === "same") return `${base}_same`;
    if (fillMode === "next") return `${base}_next`;
    if (fillMode?.startsWith("d")) return `${base}_${fillMode}`;  // "d2" → "_d2"
    return base;
}
```

### `tradeUniverse.js` — `FILL_ORDER`

**Change:** Extend the fill order array.
```js
// Current:
const FILL_ORDER = ["both", "same", "next"];

// New:
const FILL_ORDER = ["both", "same", "next", "d2", "d3", "d4"];  // extend as needed
```

### `tradeUniverse.js` — `buildAvailableOptions`

The existing logic that builds `fillModesByFamilyThreshold` is fill-mode-agnostic — it uses whatever suffixes are present in the imported keys. No structural change needed; the three changes above are sufficient for `buildAvailableOptions` to correctly enumerate delay options.

---

## 9. Risks / Open Questions

### R1 — Backtester source not audited
The backtester sidecar Python process was not available for review (`backend/server.py` is a thin wrapper only). All "backend changes needed" in §7 are inferred from the config contract and file-naming conventions. The actual implementation complexity of delay=2/3 in the backtester (e.g., handling order expiry across multiple candles, interaction with retrace-cancel, arming behaviour) is unknown.

### R2 — "Same-candle arming" semantics are ambiguous at delay ≥ 2
The existing `armed_on_trigger_candle` field indicates whether the order was armed (set up) on the same candle as the trigger. For delay=2, arming still happens on the trigger candle but the fill is deferred 2 candles. The concept of "armed same candle" vs "filled delayed N candles" may need clearer separation in both the backtester logic and the SameNextCandlePanel display.

### R3 — Retrace-cancel interaction
`triggered_edge_cancel_on_retrace` and `triggered_edge_cancel_retrace_pips` currently cancel unfilled orders that retrace. With delays ≥ 2, an order waiting for its fill candle is more exposed to retrace cancellation. The existing retrace-cancel fields in the backtester config are already present, but their interaction with multi-candle delays needs explicit testing.

### R4 — SameNextCandlePanel binary assumption
`findSiblingMode()` is hardcoded to swap `_same` ↔ `_next`. For `_d2`, the sibling lookup returns `null` (no case matches), rendering "NO SIBLING" even when `_d3` exists. For Phase 2, the panel needs a generalised sibling strategy (see §6 Option A/B).

### R5 — Pass count explosion
At 4 delays × 4 thresholds = 16 entry passes, multiplied by execution modes and protection modes, total pass counts can grow large quickly. The `countExpectedPasses()` display in Strategy Builder correctly reflects this — users should be warned if they select a combination that produces an unreasonable number of passes.

### R6 — UI label conflict
Two separate `<Field label="Same-Candle Behavior">` controls exist in StrategyBuilder.jsx (lines 805 and 946 — the single-model and research-export sections). Both must be updated in sync to the new delay chip group to avoid the UI showing different controls for the same config field.

### R7 — Config round-trip for delay > 1
When a config.json containing `triggered_edge_candle_delays: [0, 2]` is loaded into an older Strategy Builder build (that only knows `triggered_edge_same_candle_modes`), the delays `[0, 2]` will be silently lost during the legacy fallback conversion (only `same_candle` maps from delay=0). Users who load old configs in new builds and vice versa should be warned if the delay field is present but not understood.

---

## 10. Implementation Phases

### Phase 1 — UI Prep (frontend only, no backtester changes required)

**Scope:** Change Strategy Builder to use the delay array model internally. Delays 0 and 1 only. Emits both the new `triggered_edge_candle_delays` field and the legacy `triggered_edge_same_candle_modes` field so existing backtester builds continue to work.

**Files:** `StrategyBuilder.jsx` only.

**Changes:**
1. Replace `triggeredEdgeSameCandleMode: "both"` default state with `triggeredEdgeDelays: [0, 1]`.
2. Replace both `<NeonSelect>` "Same-Candle Behavior" fields with a chip multi-select group (0=Same, 1=Next). Values `[0]`, `[1]`, `[0, 1]`.
3. Update `buildBacktesterConfig()` to emit both `triggered_edge_candle_delays` and the legacy `triggered_edge_same_candle_modes` (delays 0 and 1 only in the legacy field).
4. Update `countExpectedPasses()` to use `triggeredDelays.length`.
5. Update config load mapper to convert legacy `triggered_edge_same_candle_modes` to a delay array.
6. Update `formatTriggeredEdgeModes()` display label to "Delay: Same + Next" etc.

**Risk:** Low. Functionally equivalent to current behaviour for all existing runs.

---

### Phase 2 — Full Delay Support (requires backtester changes)

**Prerequisite:** Backtester generates `_d2`, `_d3` CSV files.

**Scope:** Extend importer, tradeUniverse, and Run Workspace to handle delay ≥ 2.

**Files:** `importer.js`, `tradeUniverse.js`, `RunDetail.jsx` (`breakdownViewLabel`), `SameNextCandlePanel.jsx`.

**Changes:**
1. `importer.js`: Extend `normalizeEntryModeKey` regex (one line).
2. `tradeUniverse.js`: Extend `fillModeFromKey`, `buildCanonicalKey`, `FILL_ORDER`.
3. `RunDetail.jsx`: Add `"d2"` / `"d3"` cases to `breakdownViewLabel`.
4. `SameNextCandlePanel.jsx`: Generalise sibling lookup and comparison display (Option A or B from §6).
5. `StrategyBuilder.jsx`: Add `[2]` and `[3]` chips to the delay selector (extend Phase 1 control).

**Risk:** Medium. Backtester changes are the critical path; frontend changes are straightforward once the CSV naming convention is confirmed.

---

### Phase 3 — Analytical Enhancements (optional)

- Add `fill_delay_candles` per-trade field to enable slippage/delay analysis in the Run Workspace.
- Extend `SameNextCandlePanel` to full multi-delay comparison table (Option B from §6).
- Add a "Delay Distribution" chart showing the actual vs. configured delay across trades.

---

*End of TE-DELAY-1 audit.*
