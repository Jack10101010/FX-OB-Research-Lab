# Frontend Regression Stabilization — Audit (rollback plan)

**Repo:** FX-OB-Research-Lab. **Audit only — no edits.** Priority: restore trust, not preserve today's patches.
Do **not** enable `ENABLE_LAZY_IMPORT`. Do **not** touch backend or committed engine fixes.

## Where the instability lives
Today's **committed** frontend work is harmless to run-state: `3c58714` (SessionScenarioBuilder), `15d7642`
+ `e9fe1c6` (BreakevenTab Protection-Lab freeze fix). The instability is the **914-line UNCOMMITTED working
tree** layered on `HEAD = e9fe1c6` — a tangle of three half-finished efforts touching shared run state:
(1) the **store.js lazy/hydration refactor** (storm-fix + my rehydration patch), (2) the **Strategy Map
M15/intrabar window** work, (3) the **Entries Lab fallback**. They have not converged.

**Last known-stable point = `HEAD` (`e9fe1c6`)** — i.e. the tree with **all uncommitted changes reverted**.
HEAD already contains the *committed* guarded-lazy import (`845b365`, which the user confirmed "was working
recently") and the committed Protection-Lab fix. Its only known wart is the auto-reload "storm" (a perf
annoyance, not data corruption) that the uncommitted store.js was trying to fix.

## Files changed today (uncommitted) — classification

| File | Lines | Class | Verdict |
|---|---|---|---|
| **`data/store.js`** | 258 | **C — high-risk shared state** | **REVERT.** lazy/`indexOnly`/`largeRun` stamping (`reloadLazyRunFromManifest`), `runHasPopulatedData`, `autoReloadIndexedRunsFromSidecar`, `loadCandlesForRun` display path + helpers. Drives run classification + on-demand rows for **every page**. Prime suspect. |
| **`pages/RunDetail.jsx`** | 11 | **C — shared run-state** | **REVERT.** `shouldAutoReloadRun` + `isUnhydratedLazyShell` import; depends on store helpers. |
| **`entries/EntriesWorkspace.jsx`** | 27 | **C — shared run-state** | **REVERT.** rehydrating fallback; depends on store helper; the "baseline only" symptom is here-adjacent. |
| **`pages/StrategyMap.jsx`** | 294 | **B — coupled feature** | **REVERT (as a unit with store display-candle hunks).** M15 window + display candles. |
| **`lab/IntrabarInspector.jsx`** | 351 | **B — coupled feature** | **REVERT** with StrategyMap (inspector window cache). Not run-state, but coupled to store window loaders. |
| **`strategyMap/useResolvedScenario.js`** | 11 | **B — coupled** | **REVERT** with StrategyMap. |
| **`data/sidecarClient.js`** | 5 | **A — safe/additive** | Keep or revert; inert (only candle query params, used by StrategyMap which reverts). |
| **`pages/Runs.jsx`** | 30 | **A — safe UI** | **KEEP** — "copy run path" button only; no run-state. |
| **`lab/sessionProfiles/PortfolioBar.jsx`** | 20 | **A — safe UI** | **KEEP** — session-profiles UI; unrelated. |
| **`__validation__/*.mjs`** (2) | 45 | **A — tests** | **KEEP** — validation scripts; not shipped. |
| `lab/protection/BreakevenTab.jsx` | (committed) | — | **KEEP** — committed Protection-Lab fix, protection-only. |

## Why each symptom (root = run mis-classification + half-wired lazy rows in store.js)
- **"Baseline only" for all runs (Entries Lab):** `availableModelKeys` is derived from `exactRows`, built from
  **resident** `tradesByMode`/`trades`. When the store refactor mis-classifies runs (lazy/shell churn) or
  defers their rows, `exactRows` collapse to baseline for every run. My EntriesWorkspace fallback only papers
  over shells; it cannot fix mis-flagged non-lazy runs.
- **Small run shows "Lazy: Large run":** `LazyImportStatus`/`isLazyRun` read `lazy || largeRun`.
  `reloadLazyRunFromManifest` (dirty) **stamps `lazy:true` + `largeRun:true`**, and `buildRunIndexEntry`
  persists `lazy`. Any run routed through that path (or persisted from a mid-refactor state) wears the chip.
- **RunDetail "Available" but KPIs empty:** the metadata-vs-rows divergence (summary present, `displayTrades`
  empty). My `runHasPopulatedData` change was meant to fix the "Available" half but the broader mis-flagging
  leaves rows unresolved.
- **Baseline count flips 0 → 300 on tab switch:** unstable universe resolution — rows aren't resident on first
  render (0), an on-demand/async merge lands, and the tab-switch re-render (new signature) now reads 300. A
  classic half-wired lazy-row + memo-timing race introduced by the refactor.

All four reduce to: **the uncommitted `store.js` run-state/lazy refactor destabilized classification and
on-demand row hydration; the layered patches (StrategyMap window, my rehydration) did not converge.**

---

## Recommendation: **OPTION A** (full uncommitted revert, then reapply one-at-a-time)

Cleanest path to trust. Revert the entire uncommitted working tree to `HEAD`, verify stability, then reapply
each fix individually with validation. HEAD keeps the committed Protection fix and guarded-lazy import.

### Rollback (exact)
```
cd FX-OB-Research-Lab
git stash push -u -m "today-frontend-wip-20260621"   # parks ALL uncommitted changes; tree == e9fe1c6
git status                                            # expect clean tree
# (optional) keep the two safe UI bits by re-applying them from the stash afterwards)
```
If you prefer to **keep the safe UI** (Runs copy-button, PortfolioBar, validation, sidecarClient params) and
only revert the risky surface (**Option B**):
```
git restore frontend/src/data/store.js \
            frontend/src/pages/RunDetail.jsx \
            frontend/src/components/lab/entries/EntriesWorkspace.jsx \
            frontend/src/pages/StrategyMap.jsx \
            frontend/src/components/lab/IntrabarInspector.jsx \
            frontend/src/pages/strategyMap/useResolvedScenario.js
# leaves Runs.jsx, PortfolioBar.jsx, sidecarClient.js, *.mjs in place
```
Do **not** use Option C (surgical single-cause patch): the symptoms are broad and the files are entangled —
another in-place patch is what compounded the instability.

### Validation after rollback (before reapplying anything)
1. **Build/parse:** `cd frontend && npx vite build` (or your dev server boots clean).
2. **Small/eager run:** Entries Lab lists its real entry variants (not "baseline only"); RunDetail KPIs +
   equity populate; no "Lazy: Large run" chip.
3. **Known variant run (TE 25% C40):** RunDetail and Entries Lab agree; baseline count is stable across tab
   switches (no 0 → 300 flip).
4. **Large run:** opens via the guarded 413 → manifest path (lazy chip expected, legitimately); KPIs populate
   after reload. (Storm may reappear — acceptable; it is the known HEAD behavior, not data corruption.)
5. **Protection Lab:** still does not freeze (committed BreakevenTab fix is retained at HEAD).

### Reapply order (one at a time, validate after each)
1. **Protection Lab candle-load guard** — already committed; nothing to do.
2. **Storm-fix only** (autoReload skip *hydrated* lazy runs) — minimal store.js change, re-derived cleanly, not
   bundled with the rehydration/markers rewrite.
3. **Lazy-shell rehydration** (the helpers + `isUnhydratedLazyShell` include-once) — only after #2 is verified.
4. **Strategy Map M15/intrabar window** (StrategyMap + Inspector + store display-candle hunks + sidecar params)
   — as one isolated feature branch, validated on its own.
Each step gets the same 5-point validation above so a single change can be bisected if it regresses.

---

## Deliverable summary
- **Suspected breaking change:** the **uncommitted `frontend/src/data/store.js` lazy/hydration refactor**
  (`reloadLazyRunFromManifest` marker rewrite, `runHasPopulatedData`, `autoReloadIndexedRunsFromSidecar`,
  display-candle path) plus its dependents `RunDetail.jsx` / `EntriesWorkspace.jsx`, compounded by the
  Strategy Map window work — all uncommitted, layered on `e9fe1c6`.
- **Revert:** store.js, RunDetail.jsx, EntriesWorkspace.jsx, StrategyMap.jsx, IntrabarInspector.jsx,
  useResolvedScenario.js (Option A reverts everything uncommitted, which is cleanest).
- **Keep:** committed work (BreakevenTab fix, guarded-lazy import) + safe UI (Runs copy-button, PortfolioBar,
  validation, sidecarClient params).
- **Plan:** `git stash -u` to last-stable `e9fe1c6` → validate the 5 points → reapply storm-fix, then
  rehydration, then Strategy Map window, one at a time.

*Audit only. No code changed, nothing staged/committed/pushed. The uncommitted changes remain in the working
tree until you choose to stash/restore.*
