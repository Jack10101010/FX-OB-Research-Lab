# Post-Rollback — Protection Lab no-BE & Entries Lab variant discovery (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — no edits.** Both issues are independent of the stashed
lazy/hydration code and of large/lazy-run logic.

---

## A) Protection Lab replays when BE was never run

**File:** `src/components/lab/protection/BreakevenTab.jsx` (committed; survived the rollback).

**Root cause.** The EXACT-vs-REPLAY decision treats *"no EXACT BE"* as *"fall back to client-side candle
replay"* — it only checks candle availability and the large/lazy guard, never whether the run has **any BE
scenario at all**:
```
946  const avail = beReplayAvailability(trades, candles);       // checks candles + filled trades only
949  const canReplay = avail.available && !replayBlocked;        // NOT gated on "BE exists"
951  if (!canReplay && !hasExact) { setScenarios([]); return; }  // else → REPLAY across ARM_LEVELS
```
`beReplayAvailability` (`beReplay.js`) returns `available:true` for **any** run with candles + filled trades —
it knows nothing about BE. So a run with **BE disabled / no BE CSVs** has `hasExact=false` but, being a normal
small run (candles resident, `replayBlocked=false`), gets `canReplay=true` → it runs `replayBeScenario` across
all 9 arm levels → the "replay fallback / candle resolution / spread not modelled / same-candle conservative"
banners, plus the synchronous candle-walk (→ possible freeze). The `replayBlocked` (large/lazy) guard does
**not** cover this: a small no-BE run is not blocked.

**The signal that BE exists is already present** but unused for this gate:
- `beDataPresentAnywhere = hasAnyExactBe(beResultsMap, beTradesByModeMap)` (`:715`) — resident EXACT BE.
- `activeRun.beScenarioIndex` (`:771`) — the generated BE-scenario index (covers lazy/large runs whose BE
  rows are deferred).

**Exact guard needed (independent of large/lazy):**
`const hasAnyBeScenario = beDataPresentAnywhere || (Array.isArray(activeRun?.beScenarioIndex) && activeRun.beScenarioIndex.length > 0);`
When `!hasAnyBeScenario`, short-circuit **before** the candle-load effect (`:845-881`) and the replay effect
(`:945-1004`):
- candle-load effect: add `if (!hasAnyBeScenario) return;` (no candle load).
- replay effect: `if (!hasAnyBeScenario) { setScenarios([]); return; }` (no replay).
- render: an early return above the existing candle/availability gates (`:1193`, `:1226`) showing
  **"No BE scenarios were run for this run."**

Behaviour after fix: BE-disabled run → message, no candle load, no replay, no freeze. EXACT-BE run →
unchanged. BE-but-lazy run (`beScenarioIndex` present, rows deferred) → **not** short-circuited (still loads
EXACT on demand). Correct and orthogonal to `replayBlocked`.

---

## B) Entries Lab says "baseline only" though RunDetail lists variants

**File:** `src/components/lab/entries/EntriesWorkspace.jsx` (reverted to HEAD by the rollback).

**Root cause — different discovery source than RunDetail.**
- **Entries Lab** derives the variant list from **resident rows**: `availableModelKeys` ← `exactRows` ←
  `buildEntryResultRows(runWithEntryResults, filteredTrades, …)` (`:86-89`). When the active variant's rows
  aren't resident, `exactRows` collapse to baseline → "Baseline only — no entry-model variants in this run".
- **RunDetail** derives variants from the **canonical metadata** discovery:
  `collectAllEntryKeys(runData, runData.trades)` (`RunDetail.jsx:287`), which unions
  `entryTradesByMode(bundle)` keys **and `entrySummaryKeys(bundle)`** — and `entrySummaryKeys`
  (`tradeUniverse.js`) reads **`entryResults.summary`** keys (`entry_*`). So RunDetail sees TE 25%/C40 from the
  summary even with no resident rows; Entries Lab does not.

**Minimal safe fix.** In `EntriesWorkspace`, discover the variant **list** with the same canonical helper
RunDetail uses — `collectAllEntryKeys(activeRun, trades)` (already exported from `tradeUniverse.js`, pure, no
dependency on the stashed lazy/hydration helpers) — and drive the "are there variants?" decision + banner +
selectable list from that, **not** from `exactRows`. Keep **KPIs/tables sourced from resident rows**
(`exactRows`/`tradesByMode`): a variant that is *discovered but unloaded* is listed and shown as
**"rows not loaded"**, never with fabricated/zero KPIs. Concretely:
- compute `discoveredModelKeys = collectAllEntryKeys(activeRun, trades).filter(k => k && k !== "baseline")`;
- the "baseline only" message keys off `discoveredModelKeys.length === 0` (matches RunDetail);
- per-variant rows/KPIs continue to read resident `tradesByMode[key]`; missing → "rows not loaded" state.

This makes Entries Lab consistent with RunDetail **without** implying rows are loaded or computing KPIs from
missing rows. It also does not depend on `isUnhydratedLazyShell`/the stashed store helpers (unlike the earlier
reverted attempt).

---

## C) Deliverable summary

| Issue | File / function | Root cause | Smallest safe fix |
|---|---|---|---|
| **A** no-BE replay/freeze | `BreakevenTab.jsx` — replay effect (`:945`), candle-load effect (`:845`), render gates (`:1193/:1226`) | "no EXACT" ⇒ candle-walk REPLAY, gated only on candles + large/lazy, never on **BE existence** | add `hasAnyBeScenario = beDataPresentAnywhere \|\| beScenarioIndex.length>0`; short-circuit load+replay+render with **"No BE scenarios were run for this run."** |
| **B** baseline-only mismatch | `EntriesWorkspace.jsx` `availableModelKeys` (`:86`) vs `RunDetail.jsx:287` `collectAllEntryKeys` | Entries Lab discovers from **resident rows** (`exactRows`); RunDetail from **`collectAllEntryKeys` → `entrySummaryKeys` → `entryResults.summary`** | discover list via `collectAllEntryKeys(activeRun, trades)`; keep KPIs from resident rows; unloaded variants show "rows not loaded" |

### Validation plan (no code yet)
**A — Protection Lab:**
1. Run with BE disabled / no BE CSVs → BE tab shows "No BE scenarios were run for this run."; **no candle
   load** (network), **no replay**, **no freeze**.
2. Run with EXACT BE → unchanged (EXACT cards/table).
3. Run with BE but lazy (`beScenarioIndex` present, rows deferred) → not short-circuited; EXACT loads on demand.
4. Large/lazy no-BE run → short-circuits on no-BE (before `replayBlocked` is even relevant).

**B — Entries Lab:**
1. Run where RunDetail lists TE variants → Entries Lab lists the **same** variants (from summary), not
   "baseline only".
2. Variant with resident rows → KPIs/tables populate as before (no change).
3. Variant discovered but rows not resident → listed + "rows not loaded"; **no zero/fabricated KPIs**.
4. Genuinely baseline-only run → still shows "baseline only" (collectAllEntryKeys returns only `baseline`).

**Build/independence:** both fixes touch only `BreakevenTab.jsx` and `EntriesWorkspace.jsx`, use helpers that
exist at HEAD (`hasAnyExactBe`, `beScenarioIndex`, `collectAllEntryKeys`, `entrySummaryKeys`), and have **no
dependency** on the stashed lazy/hydration/StrategyMap code.

*Audit only. No code changed, nothing staged/committed/pushed.*
