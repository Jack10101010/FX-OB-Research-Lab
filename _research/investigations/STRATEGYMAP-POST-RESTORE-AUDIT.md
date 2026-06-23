# Strategy Map broken after partial restore — audit

**Repo:** FX-OB-Research-Lab. **Audit only — nothing edited/staged/committed/pushed.**

## Root cause (one sentence)
Strategy Map still runs the **old row-strided candle path** (`loadCandlesForRun(runId, { limit: 12000 })` →
`sourceCandles = CANDLES || bundle.candles`); the **OHLC display-aggregation + 1m inspector-window pipeline was
lost in the rollback and was NOT part of this restore**, so on a multi-million-row run the server returns ~12 000
candles *strided across the whole history* (~200-minute gaps) → disconnected specks, `candlesAreCoarse = true`,
and the inspector correctly reports "1m unavailable / candles ~200m." **The IntrabarInspector restore did not cause
any of this.**

## 1. Current StrategyMap candle source
- Passes to chart: `displayCandles` (line 1030) = a client-side resample of **`sourceCandles`**, where
  `sourceCandles = CANDLES?.length ? CANDLES : (bundle?.candles || [])` (line 258). **Not** a `displayCandles`
  store cache (that slot doesn't exist anymore).
- Fetch call: `loadCandlesForRun(runId, { limit: STRATEGY_MAP_CANDLE_LIMIT /*12000*/ })` (line 664) — **row-strided**,
  not `aggregate=ohlc`. The server returns every Nth row, so the bars don't connect.
- ~200m gap origin: striding ~12 000 rows across a multi-year 1-minute history yields a **median candle gap of
  hundreds of minutes**. `medianCandleGapSec` (line 308) computes that; `candlesAreCoarse = gap >= 900` (line 309)
  → true → coarse. The lost stash work replaced striding with **epoch-aligned OHLC buckets** (continuous bars) and a
  separate `displayCandles` cache.

## 2. Backend / sidecar state — **present but orphaned (uncommitted)**
- **Backend** `sidecar/server.py` (Lux repo) **DOES** support aggregation: `choose_display_interval`,
  `_bucket_candles_to`, `aggregate_candles_ohlc`, with `aggregate`/`bucket`/`max_points`/`start`/`end`. But it is
  **working-tree only** (HEAD: 0 `aggregate`; WT: 19). Uncommitted.
- **`sidecarClient.js`** **DOES** forward `start`/`end`/`max_points`/`aggregate`/`bucket` (lines 88–95). Also
  **working-tree only** (HEAD: 0; WT: present). **Orphaned** — nothing in the current frontend calls it with those
  params (the only caller, StrategyMap, passes `{ limit }`).
- Net: the **transport + backend halves already exist**; only the **store consumer + StrategyMap request** are
  missing. The pipeline is broken in the middle.

## 3. Store state — **the display/window loaders are LOST**
Confirmed absent in current `store.js` (grep = 0 each): `displayCandles`, `displayCandlesMeta`,
`loadInspectorWindowCandles`, `loadM15WindowCandles`, and the `purpose:"display"`/`aggregate` branch of
`loadCandlesForRun`. These are stash clusters **S6a/S6b/S6c** — **additive cache-slot loaders**, *not* the
lazy-shell cluster (S1–S5). They were rolled back together with the lazy cluster but are independent of it.

## 4. IntrabarInspector state — **safe; correctly reporting coarse input**
- It now accepts window props (`windowStartSec`, `windowLoading`, `pastPadMin`, …) but **StrategyMap passes none**
  (it still passes only `sourceCandles` / `sourceIsFine={!candlesAreCoarse}` / `medianCandleGapSec`, lines 1083-1088).
- So the new props default (`null`/`false`) → `isFetchState = false` → `isUnavailable = !isFetchState &&
  !sourceIsFine = !sourceIsFine`. With coarse candles `sourceIsFine = false` → **"unavailable."** This is **byte-for-
  byte the same condition the OLD inspector used** (`isUnavailable = !sourceIsFine`). **No regression.**
- It falls back to `sourceCandles` (the coarse set) for its window — hence it "sees ~200m" gaps. That's the input,
  not a bug in the inspector.
- **Keep it, don't revert.** Reverting would not fix the specks or the M1 message (both come from the candle
  source) and would only discard the diagnostics that light up the moment fine candles flow.

## 5. Selected OB/trade details / debug table
- Rendered by `LifecycleDetailPanel` (def line 2101), gated by
  `lifecycleOverlay = selectedOverlay || (showBeVerification ? selectedTriggeredEdge : null)` (line 1102, shown 1115).
- `selectedOverlay` is set by **clicking an OB box** (`onSelectOverlay`, line 1059). Selecting a **trade** sets
  `selectedTradeId` → renders the **IntrabarInspector** (line 1082), *not* the LifecycleDetailPanel (which needs
  `selectedOverlay`, except during BE-debug). So "details don't show when selecting a trade" is **existing behaviour**
  — a trade shows the inspector; the lifecycle panel needs an OB-box click.
- This panel is the **pre-image** (M4 was *not* restored), so it reads the same fields as before — the resolver/inspector
  restore **cannot** have broken it. If OB-box selection isn't registering, the likely culprit is the broken speck
  chart (hard/again-mis-positioned OB overlays), which is fixed by restoring the candle pipeline — **not a missing
  component**. No code path was deleted by this restore; the panel exists and renders on `selectedOverlay`.

## Current missing pieces (the link to reconnect)
| Layer | State | Cluster |
|---|---|---|
| Backend OHLC aggregation (`sidecar/server.py`) | Present (WT, uncommitted) | — |
| `sidecarClient` param forwarding | Present (WT, uncommitted, orphaned) | — |
| **store `loadCandlesForRun` display branch + `displayCandles` cache** | **LOST** | S6a |
| **store `loadInspectorWindowCandles` (1m window)** | **LOST** | S6b |
| store `loadM15WindowCandles` (M15) | LOST (optional) | S6c |
| **StrategyMap: request `aggregate:"ohlc"`, render `displayCandles`, bucket pill/TF** | **LOST** | M1 |
| **StrategyMap: inspector 1m-window fetch effect + pass window props** | **LOST** | M2 |
| StrategyMap M15 window UI | LOST (optional) | M3 |
| StrategyMap deep-delay lifecycle labels | LOST (separate; Option-C item) | M4 |

## 6–7. Options

| Option | Files touched | Touches store.js? | Lazy/auto-reload/run-state? | Risk | User-visible fix |
|---|---|---|---|---|---|
| **A — revert inspector now** | IntrabarInspector.jsx (keep resolver) | No | No | Low | **None** — specks + M1-unavailable persist (they're the candle source). Just drops correct diagnostics. |
| **B — keep inspector + minimal display-agg + 1m window** | store.js (**S6a+S6b additive only**), StrategyMap.jsx (M1+M2); sidecarClient.js + sidecar/server.py already present | **Yes — additive loaders only** | **No** | Medium | **Full** — continuous aggregated bars (no specks), correct bucket label, inspector fetches a real 1m window → ARM ACTIVE C50 + count strip work |
| **C — full window set incl. M15** | store.js (S6a/b/c), StrategyMap.jsx (M1+M2+M3+M4), sidecarClient, server.py | Yes (additive) | No | Med-High | B + M15 detection-TF mode + deep-delay panel labels |
| **D — guard: hide inspector when coarse/aggregated** | StrategyMap.jsx (gate inspector on `!candlesAreCoarse`) | No | No | Very low | **Partial** — stops the "M1 unavailable" inspector from appearing, but the **chart specks remain**. Cosmetic stopgap. |

**Coupling notes:** B's store changes are **S6a/S6b only** — a new `purpose:"display"` branch inside the existing
`loadCandlesForRun` plus a standalone `loadInspectorWindowCandles`, each writing its **own cache slot**
(`displayCandles` / `intrabarCandlesByWindow`). They do **not** touch `runHasPopulatedData`, `isUnhydratedLazyShell`,
`autoReloadIndexedRunsFromSidecar`, `reloadLazyRunFromManifest`, `indexOnly`, or any run-state classifier — i.e.
none of the forbidden lazy/auto-reload cluster. The backend + sidecarClient halves already exist (validated per the
earlier candle-aggregation work), so B mainly **reconnects** an existing, tested transport.

## 8. Recommendation — **Option B**
It fixes the actual root cause (candle source), keeps the already-restored inspector (which is correct and will
immediately become useful), and reuses the backend + sidecarClient layers that are already in the working tree. It
stays entirely within **additive store candle-loaders (S6a/S6b)** and the StrategyMap consumption (M1/M2) — no
lazy-shell rehydration, no auto-reload, no run-state classification, no risky lazy cluster.

Suggested implementation order for B (each independently buildable):
1. **store.js** — add S6a (`loadCandlesForRun` `purpose:"display"`/`aggregate` branch → `displayCandles` +
   `displayCandlesMeta`) and S6b (`loadInspectorWindowCandles`). Additive only.
2. **StrategyMap.jsx M1** — request `{ maxPoints, aggregate:"ohlc", purpose:"display" }`, render `bundle.displayCandles`
   as `sourceCandles`, bucket-aware TF/pill. (Fixes the specks.)
3. **StrategyMap.jsx M2** — inspector 1m-window fetch effect (primitive-keyed, hard-capped) → pass
   `windowStartSec/End`, `windowLoading/Error`, padding props to the inspector. (Fixes M1-unavailable.)
4. Keep `sidecarClient.js` + `sidecar/server.py` (already present); ensure both are part of the same commit so the
   transport isn't orphaned.
5. Defer M3 (M15) and M4 (lifecycle labels) — not needed to fix the breakage.

**Keep the current IntrabarInspector restore.** Do not revert.

*Audit only. No edits, nothing staged/committed/pushed. Stash intact.*
