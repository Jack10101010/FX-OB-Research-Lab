# Master Controls — Phase 13 Minimum Implementation Plan

*Planning only. No files edited, no code produced. A surgical, hand-off-ready plan for the **minimum** Phase 13 refactor: collapse the five single-kind preview lenses into the one composer-driven path, preserving every drawer readout. Scope is two files; the composer (`composePreviewBundle`) and store slot (`previewLens`) already ship and are validated.*

> Line numbers are anchors from the audited state of `MasterControlsContext.jsx` / `MasterControlsDrawer.jsx`; treat them as approximate and re-locate by symbol name before editing.

---

## 1. Pre-flight checks

**Git state (must be clean for these paths before starting):**
```bash
git status --short                       # expect masterControls/* CLEAN (audit confirmed)
git status --short | grep masterControls # expect EMPTY — no in-flight MC work to clobber
git log -1 --format='%h %s' -- frontend/src/components/masterControls/   # baseline commit
git branch --show-current                # expect codex-dev
```
If `masterControls/*` shows as dirty, STOP and reconcile — the audit baseline assumes it is clean. The wider tree has unrelated dirty files (banners, roadmapStore, ProtectionLab); **do not stage them** (`AGENTS.md` rule #6 — scoped commits only).

**Files to inspect (read fully before touching):**
- `components/masterControls/MasterControlsContext.jsx` — the five state machines (primary edit).
- `components/masterControls/MasterControlsDrawer.jsx` — the five preview blocks (secondary edit).
- `components/masterControls/previewComposer.js` — the target build path + its `result`/`meta` shape (READ-ONLY; do not change transform math).
- `components/masterControls/previewMetrics.js` — `extractPreviewMetrics(bundle)` (the drawer's stat extractor; bundle-shaped, works on composer output).
- `components/masterControls/bundleWalk.js` — `summarizeBundlePrimary` returns `{ netR, avgR, maxDd, wins, losses, winRate, trades }` — the source of before/after counts (READ-ONLY).
- `components/masterControls/costRescore.js` / `tradeFilter.js` / `rrRescore.js` / `controlSwap.js` — to confirm which single-kind wrappers become dead (`buildRescoredBundle` / `buildFilteredBundle` / `buildRrPreviewBundle`; `buildFftPreviewBundle` STAYS — the composer calls it).

**Existing validation to run before editing (capture green baseline):**
- `node frontend/src/data/__validation__/filterSimulator.validate.mjs` (unrelated Failures script — run only to confirm node harness works).
- **There is NO existing validation script for the composer or the lenses.** Record this gap now: a one-time **composer-parity assertion** (Section 6) should be written as part of this work, since manual UI checks are otherwise the only safety net.
- Babel transpile sanity on both target files (Section 6) to capture a pre-edit "parses clean" baseline.

---

## 2. Current duplicated pieces to remove

All in `MasterControlsContext.jsx` unless noted. **Keep the COMPOSED column; delete the other four.**

**State variables (remove 4, keep 1):**
- `localRescoreBundle` / `setLocalRescoreBundle` (~L277)
- `localFilterBundle` / `setLocalFilterBundle` (~L286)
- `localFftBundle` / `setLocalFftBundle` (~L295) + `fftPreviewUnavailable` / `setFftPreviewUnavailable` (~L296)
- `localRrBundle` / `setLocalRrBundle` (~L304) + `rrPreviewUnavailable` / `setRrPreviewUnavailable` (~L305)
- **KEEP:** `composedPreviewResult` / `setComposedPreviewResult` (~L312) and the derived `localComposedBundle` (~L1071) + `composedLabel` (~L1078).

**Signatures (remove 4, keep 1):**
- `lensSignature` (~L36), `filterSignature` (~L48), `fftSignature` (~L67), `rrSignature` (~L76).
- **KEEP:** `composedSignature` (~L104) — already the union of cost+filter+fft+rr fields.

**Suppress refs (remove 4, keep 1):**
- `lensSuppressRef`, `filterSuppressRef`, `fftSuppressRef`, `rrSuppressRef` (set at ~L528/538/548/558).
- **KEEP:** `composedSuppressRef` (~L568).

**Build effects (remove 4, keep 1):**
- Cost build effect ~L740 (gate `costOnly = highestRerunTier === "frontend_rescore" && isCostOnlyDirty(...)` → `buildRescoredBundle`).
- Filter build effect ~L777 (`buildFilteredBundle`).
- FFT build effect ~L810 (`buildFftPreviewBundle` directly + `fftPreviewUnavailable`).
- RR build effect ~L847 (`buildRrPreviewBundle` + `rrPreviewUnavailable`).
- **KEEP + GENERALIZE:** composed build effect ~L892 — remove its `stageKinds < 2` gate so it fires for **any** instant dirty-set (1..4 kinds).

**Apply callbacks (remove 4, keep 1):**
- `applyLocalRescoreLens` (~L935), `applyLocalFilterLens` (~L972), `applyFftPreviewLens` (~L1005), `applyRrPreviewLens` (~L1038).
- **KEEP:** `applyComposedPreviewLens` (~L1088).

**Sync effects (remove 4, keep 1):**
- cost sync ~L953, filter sync ~L986, fft sync ~L1019, rr sync ~L1050.
- **KEEP:** composed sync ~L1098.

**Reset sites (simplify, do not remove):** the ~6 places that null all five —
run-change effect (~L334), `resetDraft` (~L463), `clearPreview` (~L527), per-bundle `clearLocal*` callbacks (~L543+), cancel/import neutralise (~L626) — each collapses from "null five states" to "null `composedPreviewResult`" (+ clear the store lens where they already do).

**Drawer blocks to remove (`MasterControlsDrawer.jsx`):**
- cost block (~L554), filter block (~L588), fft block (~L625), rr block (~L659), composed block (~L743), plus the two "unavailable" blocks: fft-unavailable (~L723), rr-unavailable (~L705).
- The context destructure (~L219–224) drops `localRescoreBundle/clearLocalRescoreBundle/applyLocalRescoreLens`, `localFilterBundle/clearLocalFilterBundle/applyLocalFilterLens`, `localFftBundle/fftPreviewUnavailable/clearFftPreview/applyFftPreviewLens`, `localRrBundle/rrPreviewUnavailable/clearRrPreview/applyRrPreviewLens` — keeping only `composedPreviewResult, localComposedBundle, clearComposedPreview, applyComposedPreviewLens, previewLens, exitPreviewLens`.
- The four mode-specific "lens active" booleans (~L255/276/286/296/308 checking `mode === "local_rescore"/"instant_filter"/"fft_swap"/"rr_rescore"`) collapse to one check on `mode === "composed"` (or, if mode is unified per Section 3, on `previewLens?.active && sourceRunId === activeRunId`).

---

## 3. Target architecture

**Single state model.** One preview state: `composedPreviewResult` (full `composePreviewBundle` output) → derived `localComposedBundle` (`result.ok ? result.bundle : null`) → derived `composedLabel`. One `composedSuppressRef`. No per-kind state survives.

**Single build flow.** One effect (generalized ~L892):
1. Compute `costDirty / filterDirty / fftDirty / rrDirty` and `instantOnly` (every dirty field ∈ `COMPOSED_INSTANT_KEYS`).
2. Gate: `if (!instantOnly || dirtyFieldList.length === 0 || !effectiveConfig || !activeRunId) → setComposedPreviewResult(null); return;` — **note the only change vs today: drop `stageKinds < 2`** so a single dirty kind is allowed.
3. Honor `composedSuppressRef` dismissal.
4. `sourceBundle = getRawRunData(activeRunId)` (lens-immune — unchanged).
5. Build `input` from whichever stages are dirty (existing L917–924 logic).
6. `setComposedPreviewResult(composePreviewBundle(sourceBundle, input))`.

**Single apply flow.** `applyComposedPreviewLens` only → `setPreviewLens({ sourceRunId: activeRunId, bundle: localComposedBundle, mode: "preview", label: composedLabel })`. (Mode string unified to `"preview"`; see Section 4 note — store overlays regardless of mode, so this is safe.)

**Single sync flow.** One effect (~L1098) that keeps the store lens matching `localComposedBundle`: clear when bundle/run gone or `sourceRunId !== activeRunId`; re-push when `lens.bundle !== localComposedBundle`. Guard on `lens.mode === "preview"` (or whatever single mode is chosen).

**Drawer rendering model.** One conditional block: `if (composedPreviewResult) render <PreviewCard result={composedPreviewResult} bundle={localComposedBundle} label={...} onApply={applyComposedPreviewLens} onDiscard={clearComposedPreview} active={lensActiveForThisRun} />`. The card derives every readout from `result` (Section 4). The existing composed `<PreviewCard>` (the L743 consumer) is the surviving renderer; the other four blocks delete.

---

## 4. Composer metadata parity plan

Goal: every figure the four single-kind blocks show today must be derivable from `composedPreviewResult`. The composer **already** returns `{ bundle, ok, appliedStages, skippedStages, unavailableStages, stages, warnings, before, after }`, and `bundle.meta` mirrors `stages/appliedStages/...`. Map each readout:

| Today's readout (drawer) | Source today | Source after (from `composedPreviewResult`) | Gap? |
|---|---|---|---|
| **Cost** net/avg/DD/win metrics | `extractPreviewMetrics(localRescoreBundle)` | `extractPreviewMetrics(localComposedBundle)` (bundle-shaped — works unchanged) | none |
| **Cost** scope (`rescoreScope === "all_trade_sets"`) | `localRescoreBundle.meta.rescoreScope` | `result.stages.cost.applied` (+ optionally stamp `meta.stages.cost.scope` in composer) | **minor meta add** |
| **Filter** before/after counts | `localFilterBundle.meta.beforeCount / afterCount` | `result.before.trades` / `result.after.trades` (from `summarizeBundlePrimary`) | none |
| **Filter** description (`describeFilters(meta.filters)`) | `localFilterBundle.meta.filters` | `result.stages.filter.{sessionActive,structDirActive,directionActive}` — re-point `describeFilters`, **or** stamp `stages.filter.filters` in composer | **minor: choose one** |
| **FFT** coverage (`describeFftCoverage(meta)`) | `localFftBundle.meta` (`swapScope/coveredScenarios/missingScenarios`) | `result.stages.fft.{swapScope,coveredScenarios,missingScenarios}` (composer already copies these from the swap, L stage A) | none |
| **FFT** unavailable | `fftPreviewUnavailable` flag | `result.unavailableStages.includes("fft")` + `result.stages.fft.reason` | none |
| **RR** warning / partial | `localRrBundle.meta.warning` / `rescoreScope === "partial"` | `result.stages.rr.warning` + `result.warnings` (RR_PREVIEW_WARNING already pushed) | none |
| **RR** unavailable (no excursion fields) | `rrPreviewUnavailable` flag | `result.unavailableStages.includes("rr")` + `result.stages.rr.reason` | none |
| **Composed** multi-stage label | `composedLabelFromResult` | unchanged — already handles single + multi, with `(… n/a)` for unavailable | none |

**Only two true gaps, both metadata-only (NOT transform math):**
1. Cost `scope` ("all_trade_sets" vs partial) — optionally stamp onto `meta.stages.cost` inside the composer's Stage D, or drop the distinction in UI if cost is always all-sets in composed mode (verify first).
2. Filter `filters` object for `describeFilters` — either re-point `describeFilters` to consume the three boolean flags already on `stages.filter`, or have the composer pass the resolved predicate's filter summary through to `stages.filter`. **Prefer re-pointing the UI helper** (no composer change).

These two are the entirety of the "new code" in this refactor.

---

## 5. Step-by-step implementation sequence (smallest safe order)

Each step leaves the tree parseable and the app functional; commit (on host) between phases for clean rollback points.

1. **Write the parity assertion first (safety net).** A new `__validation__/previewComposer.parity.mjs` that feeds a synthetic bundle through `composePreviewBundle` for each single-kind input and asserts the `result.before/after/stages/unavailableStages` fields the drawer will read exist and are correct. Run it green before changing any context wiring. *(Test infra only — not a feature.)*
2. **Generalize the composed build effect** (~L892): remove the `stageKinds < 2` gate. Now the composed path also produces single-kind previews — but the four single-kind state machines still exist in parallel (both run; store lens is last-writer). Verify in-app that single-kind previews still work (old path) and that `composedPreviewResult` now also populates for single-kind (new path). No deletions yet.
3. **Re-point the drawer's single preview card** to render from `composedPreviewResult` for ALL cases (Section 4 mapping), behind the existing composed block. Temporarily keep the four old blocks but render them only if the composed result is absent — confirm the composed card reproduces every readout for cost-only / filter-only / fft-only / rr-only / multi.
4. **Switch apply/sync to composed-only.** Point the drawer's Apply to `applyComposedPreviewLens` for every case; unify the store `mode` to `"preview"` and update the composed sync guard. Confirm Apply/Discard/exit all work for each dirty kind.
5. **Delete the four single-kind drawer blocks** (cost/filter/fft/rr + the two unavailable blocks) and trim the context destructure (~L219–224). One card remains.
6. **Delete the four single-kind state machines** in context: states, signatures, suppress refs, build effects, apply callbacks, sync effects. Collapse the ~6 reset sites to null only `composedPreviewResult`.
7. **Remove now-dead imports + wrappers.** Drop unused imports (`buildRescoredBundle`, `buildFilteredBundle`, `buildRrPreviewBundle`, `rescoreCostsForBundle`, `isCostOnlyDirty`, `isFilterOnlyDirty`, `rescoreRrForBundle`, etc. — verify each is unreferenced). Optionally delete the dead wrapper exports from `costRescore.js`/`tradeFilter.js`/`rrRescore.js` **only if** no other module imports them (grep first). `buildFftPreviewBundle` and all per-array transforms STAY.
8. **Final parity + regression pass** (Section 6), then hand scoped commit list to host.

**Explicitly out of scope this sequence:** no backend/sidecar changes, no transform-math edits, no `previewLens` store-slot changes, no Phase 14 renames (Run/View/Comparison/Project), no Protection/BE work, no touching non-MC pages.

---

## 6. Validation plan

**Parse / transpile:**
```bash
npx babel frontend/src/components/masterControls/MasterControlsContext.jsx -o /dev/null
npx babel frontend/src/components/masterControls/MasterControlsDrawer.jsx -o /dev/null
node frontend/src/data/__validation__/previewComposer.parity.mjs   # new, must pass
```

**Grep proofs that the old single-kind machines are gone (expect ZERO hits each):**
```bash
cd frontend/src/components/masterControls
grep -nE "localRescoreBundle|localFilterBundle|localFftBundle|localRrBundle" MasterControlsContext.jsx MasterControlsDrawer.jsx
grep -nE "lensSignature|filterSignature|fftSignature|rrSignature" MasterControlsContext.jsx
grep -nE "lensSuppressRef|filterSuppressRef|fftSuppressRef|rrSuppressRef" MasterControlsContext.jsx
grep -nE "applyLocalRescoreLens|applyLocalFilterLens|applyFftPreviewLens|applyRrPreviewLens" MasterControlsContext.jsx MasterControlsDrawer.jsx
grep -nE "fftPreviewUnavailable|rrPreviewUnavailable" MasterControlsContext.jsx MasterControlsDrawer.jsx
grep -nE "buildRescoredBundle|buildFilteredBundle|buildRrPreviewBundle" MasterControlsContext.jsx   # imports gone
```
Plus confirm the survivors still exist: `grep -nE "composedPreviewResult|applyComposedPreviewLens|composePreviewBundle" MasterControlsContext.jsx`.

**Typography guard (AGENTS.md §6):** `grep -RnE "font-mono|tracking-widest" MasterControlsDrawer.jsx` → expect 0.

**UI behaviour + regression matrix (manual, one active run with cost+filter+RR+FFT-capable data):**

| Scenario | Action | Expected |
|---|---|---|
| **Cost-only preview** | dirty only spread/slippage/commission | one preview card, cost metrics + scope correct, banner "Cost" |
| **Filter-only preview** | dirty only a session/struct/direction filter | before/after trade counts + filter description correct, banner "Filter" |
| **FFT-only preview** | toggle FFT ON→OFF | coverage readout correct, banner "FFT OFF" |
| **RR-only preview** | change RR target | RR warning shown, partial note if some trades lack excursion, banner "RR {n}" |
| **Multi-stage preview** | dirty filter + cost together | composed card, banner "Composed · Filter + Cost", metrics reflect both |
| **Unavailable FFT** | FFT toggle with no controls | "unavailable" state from `unavailableStages`, no Apply offered |
| **Unavailable RR** | RR change on run lacking excursion fields | "unavailable" reason shown, no Apply |
| **Apply preview** | Apply on any of the above | `previewLens` active app-wide; KPIs/equity/map reflect it on other pages |
| **Discard preview** | Discard/exit | lens cleared; pages revert to raw run |
| **Run switch clears preview** | change active run via RunSwitcher mid-preview | `composedPreviewResult` + store lens cleared; new run shows its own raw data |
| **Re-dismiss suppression** | dismiss a preview, leave dirty fields unchanged | composed signature suppresses rebuild until fields/run change |

---

## 7. Risk controls

**What NOT to touch:**
- Transform math: `rescoreTradeArray`, `tradeMatches`/`buildTradePredicate`, `rescoreRrTradeArray`, `buildFftPreviewBundle`, `mapBundleTradeCollections`, `summarizeBundlePrimary`. **Read-only.**
- Store: `previewLens` slot, `setPreviewLens`/`getPreviewLens`/`clearPreviewLens`/`bundleFor`, `getRunData`/`getRawRunData`. **No changes.**
- `composePreviewBundle` core logic — the only permitted edit is *additive metadata* (Section 4 gap #1) if chosen; the stage order and math stay.
- Anything outside `components/masterControls/` — no pages, no Protection, no Phase 14 renames, no backend.

**Rollback plan:**
- Commit (on host) after Step 2, Step 4/5, and Step 6 so each is an isolated revert point.
- Because the four single-kind machines run in parallel until Step 5–6, the app stays functional throughout; if the composed card shows wrong readouts at Step 3, revert just the drawer change — context still has both paths.
- Full bail-out: `git checkout -- components/masterControls/MasterControlsContext.jsx components/masterControls/MasterControlsDrawer.jsx` returns to baseline (no other files touched).

**Likely failure points (watch these):**
1. **Meta remap drift** — drawer reading a composer field that's `undefined` (e.g. `stages.cost.scope`, `stages.filter.filters`). Mitigated by the Step-1 parity assertion + Step-3 keep-both verification.
2. **Single-kind gate** — forgetting to drop `stageKinds < 2` leaves single-kind previews dead after the old machines are deleted (blank card). Verify Step 2 before any deletion.
3. **Mode-string mismatch** — unifying to `mode: "preview"` but leaving a sync/guard checking an old mode (`"local_rescore"` etc.) → lens won't re-push/clear. Grep all `mode ===` after Step 4.
4. **Reset-site omission** — missing one of the ~6 null sites leaves a stale preview after run switch/reset. The run-switch regression row catches it.
5. **Dead-import lint** — removing state but leaving its import (or vice-versa) → transpile/lint break. Step 7 grep + Babel pass.
6. **Suppression regression** — `composedSuppressRef` now governs single-kind dismissals too; confirm dismissing a cost-only preview doesn't suppress a later filter-only preview (different signature, so it shouldn't — verify).

---

*Net: two files, ~5 interlocking machines deleted down to one, every readout re-sourced from existing composer output, with only two small metadata touch-points. The composer + store target already ship and are validated, so this is bounded deletion-and-rewiring behind a parity assertion — handoff-ready for Codex/Claude.*
