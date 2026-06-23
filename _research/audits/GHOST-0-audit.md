# GHOST-0 Audit Report
**Phase 0 — Ghost Tracking (Observational Only)**
**Date:** 2026-06-03
**Status:** Audit complete — no files modified

---

## 1. Files Read

9 files inspected (7 originally listed in spec + 2 discovered in `git status`):

| # | File | Status | In Spec? |
|---|------|--------|----------|
| 1 | `frontend/src/data/importer.js` | Modified (unstaged) | ✅ |
| 2 | `frontend/src/data/obLifecycle.js` | Modified (unstaged) | ✅ |
| 3 | `frontend/src/pages/StrategyMap.jsx` | Modified (unstaged) | ✅ |
| 4 | `frontend/src/pages/strategyMap/useResolvedScenario.js` | Modified (unstaged) | ✅ |
| 5 | `frontend/src/components/lab/entries/model/ModelAnalysis.jsx` | Modified (unstaged) | ✅ |
| 6 | `frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx` | New (untracked) | ✅ |
| 7 | `frontend/src/components/lab/OBLabTabShell.jsx` | New (untracked) | ✅ |
| 8 | `frontend/src/components/lab/CandleChart.jsx` | Modified (unstaged) | ❌ discovered |
| 9 | `frontend/src/components/lab/CanonicalBucketTable.jsx` | Modified (unstaged) | ❌ discovered |

All 9 files parsed clean (Babel).

---

## 2. Change Inventory

### `importer.js`
Ghost fields added in three parse functions:

| Function | Fields Added | Method |
|----------|-------------|--------|
| `parseOrderBlocksCSV` | 12 ghost fields (`ghost_candidate`, `ghost_outcome`, `ghost_r`, `ghost_entry`, `ghost_sl`, `ghost_tp`, `ghost_fill_session`, `ghost_fill_delay_candles`, `ghost_fill_price`, `ghost_tp_price`, `ghost_sl_price`, `ghost_net_pips`) | `boolOrNull` / `numOrNull` / `String(…\|\|"")` |
| `parseTradesCSV` | 16 ghost fields (same + extended trade-level fields) | same |
| `ingestRunBundle` summary aggregates | 9 ghost aggregate fields | `?? null` defaults |

All additions are append-only within their respective objects. No existing field touched.

---

### `obLifecycle.js`
22 lines appended to the `deriveOBLifecycle` return object, after existing `time1` field:

- Trade-level fields take precedence over OB-level via `??`
- All default to `null` or `""`
- Existing `...ob` spread already passes OB-level ghost fields; these explicit assignments add trade-level detail without conflict

---

### `StrategyMap.jsx`
- 4 new `DEFAULT_LAYERS` entries — all `false`
- 4 new `useState` hooks — all default `false`
- `hasGhostData` computed: `triggeredEdgeOverlays.some(ov => ov.ghost_candidate === true)`
- Ghost toggle UI gated: `{hasGhostData && <> ... </>}` — invisible when no ghost data
- 4 ghost props wired into: reset handler, `saveStrategyMapUi` dependency array, `CandleChart` prop call
- Toggle labels: `"👁 Candidates"`, `"👁 Ghost Fill"`, `"👁 Ghost Win"`, `"👁 Ghost Loss"`

---

### `useResolvedScenario.js`
5 fields appended to `buildTriggeredEdgeOverlays` output object:

```js
ghost_candidate:           truthyFlag(trade.ghost_candidate) || truthyFlag(trade.ghostCandidate) || false,
ghost_outcome:             String(trade.ghost_outcome || trade.ghostOutcome || ""),
ghost_r:                   numericOrNull(trade.ghost_r ?? trade.ghostR),
ghost_fill_session:        String(trade.ghost_fill_session || trade.ghostFillSession || ""),
ghost_fill_delay_candles:  numericOrNull(trade.ghost_fill_delay_candles ?? trade.ghostFillDelayCandles),
```

Both camelCase and snake_case variants handled — forward-compatible with bundle format variation.

---

### `ModelAnalysis.jsx`
- `import { GhostOutcomePanel }` added
- `hasGhostData` useMemo: `(trades || []).some(t => t?.ghost_candidate === true)`
- "Trigger Behavior" tier double-gated: renders only when `lifecycleRow && hasGhostData`
- `GhostOutcomePanel` receives `trades` prop

---

### `GhostOutcomePanel.jsx` *(new file)*
Fully self-contained read-out component:
- Returns `null` when no `ghost_candidate === true` trades — zero render impact on non-ghost data
- Recharts `BarChart` for outcome distribution with per-outcome colors
- Summary chips: filled count, avg fill delay (candles), top fill session
- Net R in header (colored by sign)
- No ghost analytics, no write paths — pure read-out of backtester-emitted fields

---

### `CandleChart.jsx` *(discovered — not in original spec)*
- 4 new default-`false` props: `showGhostCandidateMarkers`, `showGhostFillMarkers`, `showGhostWinMarkers`, `showGhostLossMarkers`
- `ghostBadgeShapes` IIFE: gated on `anyGhost && triggeredEdgeOverlays?.length && overlays?.length`
- Badge chips: absolute-positioned divs, dashed border, `zIndex: 14`, `pointer-events-none`
- Filter logic: `showGhostCandidateMarkers` shows all candidates; others filter by outcome category
- All new props default `false` → existing renders unchanged

---

### `CanonicalBucketTable.jsx` *(discovered — not in original spec, unrelated to ghost)*
**Single line change only:**
```jsx
className={popOpen ? "z-50" : undefined}
```
Z-index fix for NeonPanel popover stacking. **No connection to ghost tracking.**

---

### `OBLabTabShell.jsx` *(new file — not ghost-related)*
Tab navigation shell for Order Block Lab:
- 5 workflow tabs: Model Analysis, Edge Discovery, Failure Lab, Robustness, Promotion Desk
- All tabs kept mounted, visibility via `display:none/block`
- `localStorage` persistence under `oblab-active-tab-v1`
- Already consumed by `OrderBlockLab.jsx` (committed at `e9a6672`)
- **No connection to ghost tracking**

---

## 3. Backward Compatibility Assessment

| Concern | Result |
|---------|--------|
| Old bundles (no ghost fields) | ✅ Safe — all new fields use `?? null`, `\|\| ""`, `?? false` defaults |
| Existing analytics | ✅ Untouched — no modification to any calculation, aggregation, or filter |
| Existing renders | ✅ All ghost UI gated on `hasGhostData` — invisible unless ghost data present |
| `deriveOBLifecycle` return shape | ✅ Pure append — existing consumers unaffected |
| `buildTriggeredEdgeOverlays` output | ✅ Pure append — existing overlay consumers unaffected |
| `CandleChart` props | ✅ All new props default `false` — existing call sites unchanged |
| `CanonicalBucketTable` z-index | ✅ Conditional class, no logic change |
| `OBLabTabShell` wiring | ✅ Already committed in `OrderBlockLab.jsx` — component was missing, now present |

**Assessment: fully backward compatible. No regressions possible from these changes on existing non-ghost data.**

---

## 4. Risks / Blockers

**None blocking. Minor notes:**

1. **`OBLabTabShell` is orphaned in the committed tree.** `OrderBlockLab.jsx` imports it but the file was never committed. The app would fail to compile on any fresh checkout until this file is committed. This is the highest-priority item in the batch.

2. **`CanonicalBucketTable.jsx` is semantically unrelated to ghost.** It's a one-line z-index fix. Including it in a "ghost tracking" commit is technically harmless but muddies the commit history. Worth splitting if commit hygiene matters.

3. **`CandleChart.jsx` was not in the original spec list** but is a required dependency of `StrategyMap.jsx`'s ghost toggle wiring. The two files must be committed together or neither works.

4. **Emoji labels** (`"👁 Candidates"` etc.) in `StrategyMap.jsx` — cosmetic only, no risk.

5. **`ghost_fill_delay_candles` in `GhostOutcomePanel`** is displayed as a raw candle count (e.g. `"1.0"`). If the backtester ever emits fractional delays this rounds fine; if it emits `null` consistently it shows `"—"`. No issue.

6. **`ingestRunBundle` ghost aggregates** — these aggregate over the run but the downstream consumers (if any) were not audited in this pass. If nothing reads these keys yet, they're inert; if something does read them, they'd need their own audit. Low risk given all default `null`.

---

## 5. Recommended Next Step

**Split into two commits:**

### Commit A — `GHOST-0: Phase 0 ghost tracking (observational read-out)`

Include:
- `frontend/src/data/importer.js`
- `frontend/src/data/obLifecycle.js`
- `frontend/src/pages/StrategyMap.jsx`
- `frontend/src/pages/strategyMap/useResolvedScenario.js`
- `frontend/src/components/lab/entries/model/ModelAnalysis.jsx`
- `frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx`
- `frontend/src/components/lab/CandleChart.jsx`

**Rationale:** Coherent unit — parse → lifecycle → overlays → chart markers → analysis panel. All 7 files are functionally coupled; splitting further adds no value.

### Commit B — `PATCH: OBLabTabShell + CanonicalBucketTable z-index fix`

Include:
- `frontend/src/components/lab/OBLabTabShell.jsx`
- `frontend/src/components/lab/CanonicalBucketTable.jsx`

**Rationale:** Neither file is ghost-related. `OBLabTabShell` resolves the missing-import compile error from the already-committed `OrderBlockLab.jsx`. `CanonicalBucketTable` is a standalone UI fix. Grouping them keeps ghost commit history clean.

**Order:** Commit B first (resolves the orphaned import), then Commit A.

> **No fixes required before committing. Both commits are safe to land as-is.**

---

*End of GHOST-0 audit.*
