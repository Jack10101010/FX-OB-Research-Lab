# Strategy Map — selection UX + Lifecycle Detail cleanup (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — nothing edited/staged/committed/pushed.**

## Current behavior map
| Action | Handler | Result |
|---|---|---|
| Click an **OB box** | `OrderBlockOverlay.onClick` → `handleObClick` → `onSelectTrade(linkedTradeId)` (CandleChart.jsx:351, 1502) → `setSelectedTradeId` | **Intrabar Inspector** opens; OB gets the **3px blue selected border + glow** |
| Click a **lifecycle dot** (trig/tap/arm/fill/exit) | `TriggeredEdgeLifecycleMarker.onClick` → `onSelectOverlay(m.overlay)` (CandleChart.jsx:1519) → `setSelectedOverlay` | **Lifecycle Detail panel** opens |
| Trade-list row | `onSelect(id)` → `setSelectedTradeId` | Inspector |
| Panel under the map | `StrategyMapIntelligencePanel` (StrategyMap.jsx:1340) | Aggregate run/session/OB stats — **still present** |

So today the OB box opens the **Inspector**, and only the **dots** open Lifecycle Detail. That's the inversion you're seeing.

## A. Selected-OB blue border — found, safe to remove
`OrderBlockOverlay` (CandleChart.jsx): `showSelection = selected && !suppressSelectionStyle` drives a **3px blue
border** (`rgba(56,189,248,0.98)`), a glow (`boxShadow: selectionRing`), and `zIndex:30` (lines ~+12/+35/+37 inside
the component). `selected` is computed from `selectedKey = selectedTradeId ?? highlightObId`. A
`suppressSelectionStyle` prop already exists and is currently set to `beVerificationActive` (CandleChart.jsx:1501).
**Removing the border safely** = force `suppressSelectionStyle` on for the map (one line). Selection state
(`selectedTradeId`, `data-selected`) is untouched — only the chunky border/glow/z-raise are dropped. Risk: low; the
only behavioral effect is the OB no longer visually emphasized (selection is now conveyed by the opened panels).

## B. Clickable markers/dots inventory
| Element | Represents | Click handler | Needed? |
|---|---|---|---|
| **OB box** (`OrderBlockOverlay`) | the order block / its linked trade | `onSelectTrade` (Inspector) | **Keep** (primary selection) |
| **Lifecycle dots** (`TriggeredEdgeLifecycleMarker`) | trigger / tap / arm / fill / exit **event positions** | `onSelectOverlay` → opens Lifecycle Detail | **Keep the dots as visual markers; remove their click target** — their only click action is "open Lifecycle Detail," which should move to the OB click |
| OB origin/detection markers, ghost markers, news lines | provenance / ghost / news | none (visual) | Keep |
| Trade markers (`OrderBlockMarker`) | trade entry glyphs | none (visual) | Keep |

The dots are **meaningful markers** (they mark where each lifecycle event happened) — so keep them rendered; just
drop their `onClick` (CandleChart.jsx:1519 → pass `undefined`).

## C. LifecycleDetailPanel render path
- Opens when `lifecycleOverlay` is truthy: `lifecycleOverlay = selectedOverlay || (showBeVerification ?
  selectedTriggeredEdge : null)` (StrategyMap.jsx:1283). `selectedOverlay` is set only by the dots (and one FFT
  auto-path at :447). So **outside BE-debug, selecting a trade/OB does NOT open Lifecycle Detail** — only a dot does.
- **Why OB click doesn't open it:** OB click sets `selectedTradeId` (→ `selectedTriggeredEdge`), but the panel is
  gated on `selectedOverlay` (or BE-debug). The fix is to let `lifecycleOverlay` fall back to `selectedTriggeredEdge`
  whenever a trade is selected: `const lifecycleOverlay = selectedOverlay || selectedTriggeredEdge;` (drop the
  `showBeVerification ?` gate). Then **OB click opens both** the Inspector (trade) and Lifecycle Detail (overlay).
- **Trade click vs OB click:** on this chart they're the same element (OB box ↔ its trade). Recommended: OB click
  opens **both** (Inspector + Lifecycle Detail). Keep the Inspector behavior unchanged.
- **Close coupling:** `LifecycleDetailPanel.onClose={() => setSelectedOverlay(null)}` — once the panel is driven by
  `selectedTriggeredEdge`, Close must also clear the trade (`setSelectedTradeId(null)`), else it won't dismiss.

## D. Why "Fill C1" instead of "Arm C40 / Filled +N"
The current `LifecycleDetailPanel` (StrategyMap.jsx) uses the **legacy badge map**: `BADGE_STATUS.same = "Fill C0"`,
`.next = "Fill C1"`, `badgeInfo = BADGE_STATUS[ov.badgeState]` — it keys off `badgeState` (same/next) and **never
reads `ov.delayCandlesConfigured` / `ov.fillDelayCandles`**. The resolver fields are now present on the overlay (we
restored them), but **this panel's M4 changes were intentionally excluded** from the Option-D restore, so it still
renders the pre-deep-delay label. The Inspector looks correct because its M4/I5 code (which *does* read the delay
fields) was restored.

## E. Rolled-back M4 changes to restore (from stash@{0})
The `LifecycleDetailPanel` deep-delay block (stash patch lines ~1251–1335):
- `armN = ov.delayCandlesConfigured`, `fillN = ov.fillDelayCandles`; `armText` ("Arm C40"), `fillText` ("Filled +N").
- `armBadge` replacing the legacy same/next badge with "Arm C40 · Filled +N" (+ explanatory tooltip).
- Flag chips: **"Left OB before arm"** (`ov.retracedOutBeforeArm || ov.exitedObBeforeArm`) and **"Armed after OB
  exit"** (`ov.armedAfterObExit`).
- Corrected `same`/`next` **narrative** ("armed N candles after the trigger… filling N candles after the trigger",
  with the left-OB/armed-after-exit notes).
All read fields already present on the overlay — pure presentational restore, no data plumbing.

## F. Available fields for a Details grid (all present today)
From the **overlay `ov`** (useResolvedScenario): `direction`, `obTop`, `obBot`, `triggerPrice`, `entryPrice`,
`triggerPenetrationPct`, `delayCandlesConfigured`, `fillDelayCandles`, `armCandleIndex`, `fillCandleIndex`,
`exitCandleIndex`, `retracedOutBeforeArm`, `exitedObBeforeArm`, `armedAfterObExit`, plus the lifecycle times.
From the **linked trade row** (importer-emitted; resolved via the panel's `trades` prop): `stop`, `tp`, `rr`
(aliases rr_multiple/risk_reward), and sessions `obOriginSession`, `obDetectionSession`, `fillSession`, `session`,
`trade_session`/`entry_session`. From **runConfig**: `pip_size`, `rr_multiple`.

| Requested field | Source | Available? |
|---|---|---|
| OB direction | `ov.direction` | ✅ |
| OB top / bottom | `ov.obTop` / `ov.obBot` | ✅ |
| OB size (pips) | `(obTop−obBot)/pip_size` | ✅ (computed) |
| Entry price | `ov.entryPrice` | ✅ |
| Stop price | `trade.stop` | ✅ |
| Target price | `trade.tp` | ✅ |
| RR / target R | `trade.rr` / `runConfig.rr_multiple` | ✅ |
| Delay configured | `ov.delayCandlesConfigured` | ✅ |
| Actual fill delay | `ov.fillDelayCandles` | ✅ |
| Arm / fill / exit candle index | `ov.armCandleIndex` / `fillCandleIndex` / `exitCandleIndex` | ✅ |
| Flags (left-OB/armed-after-exit/retraced) | `ov.exitedObBeforeArm` / `armedAfterObExit` / `retracedOutBeforeArm` | ✅ |
| OB origin / created session | `trade.obOriginSession` / `obDetectionSession` | ✅ |
| Fill session | `trade.fillSession` (or `trade.session`) | ✅ |
| Trigger / tap session | not emitted directly | ⚠️ derive via session-of-time, or omit initially |
| Exit session | not emitted directly | ⚠️ derive, or omit initially |

So 14 of 16 requested fields are directly available; trigger/tap-session and exit-session would need a time→session
helper (none clean exists in StrategyMap today) — recommend showing the direct sessions now and deferring those two.

## 4. Was another debug panel lost?
**No.** The only per-trade panel is `LifecycleDetailPanel`. The other panel under the map is
`StrategyMapIntelligencePanel` (aggregate run/session/OB stats) — **still present**. The stash M4 only modified
`LifecycleDetailPanel`'s internals (labels/flags/narrative); it did not add or remove a panel. Nothing per-trade was
lost — the panel just shows stale labels and a thin field set.

## G. Recommended smallest safe implementation
All changes are presentational in **two files** — no candle loaders, store, lazy-run, RunDetail, Entries Lab, or
backend.

1. **Remove blue selected border** — `CandleChart.jsx:1501`: `suppressSelectionStyle={beVerificationActive}` →
   `suppressSelectionStyle={true}` (or thread a `noSelectionBorder` prop). One line.
2. **OB click opens Lifecycle Detail** — `StrategyMap.jsx:1283`:
   `const lifecycleOverlay = selectedOverlay || selectedTriggeredEdge;`. Update the panel `onClose` to also
   `setSelectedTradeId(null)`.
3. **Keep trade click → Inspector** — unchanged (`selectedTrade` still renders `IntrabarInspector`).
4. **Remove the dot click target** — `CandleChart.jsx:1519`: drop `onClick` on `TriggeredEdgeLifecycleMarker` (keep
   the dots as visual markers).
5. **Restore Arm C40 / Filled +N labels (M4)** — in `LifecycleDetailPanel` (StrategyMap.jsx): add `armN/fillN/armText/
   armBadge` + the two flag chips + corrected narrative (verbatim from stash M4; reads fields already on `ov`).
6. **Add a compact Details grid** — in `LifecycleDetailPanel`: a small 2-column grid of the §F fields (direction, OB
   top/bottom, OB pips, entry/stop/target, RR, delay configured/actual, arm/fill/exit idx, sessions, flags). Omit
   trigger/tap/exit-session for now (no clean helper).

**Files/functions:** `frontend/src/components/lab/CandleChart.jsx` (`OrderBlockOverlay` prop at the overlay map +
`TriggeredEdgeLifecycleMarker` onClick); `frontend/src/pages/StrategyMap.jsx` (`lifecycleOverlay` gate + panel
`onClose` + `LifecycleDetailPanel` badge/flags/narrative + Details grid).

**Risk:** Low. Items 1–4 are cosmetic/wiring one-liners; 5–6 are additive reads of fields already present on the
overlay/trade. No data-flow, store, or loader changes.

## Validation plan
1. esbuild bundle `StrategyMap.jsx` + `CandleChart.jsx` → EXIT 0.
2. Confirm no diff touches store.js / candle loaders / RunDetail / EntriesWorkspace / backend.
3. Click an OB → **no blue border**; **both** Inspector and Lifecycle Detail open; Lifecycle Detail badge reads
   "Arm C40 · Filled +N" (not "Fill C1") for a deep-delay trade; flag chips appear when the row flags are set.
4. Click a lifecycle dot → no panel toggle (dots are now non-interactive markers); dots still render.
5. Close Lifecycle Detail → panel dismisses (trade + overlay cleared); Inspector close still works.
6. Details grid shows OB/price/delay/index/session fields; "—" for any null; OB pips computed from `pip_size`.
7. Trade-list row select still opens Inspector + Lifecycle Detail; M15/Overview/inspector unaffected.

*Audit only. No code changes; nothing staged/committed/pushed.*
