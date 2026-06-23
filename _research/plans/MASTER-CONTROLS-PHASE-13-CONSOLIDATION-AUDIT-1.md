# Master Controls — Phase 13 Consolidation Audit

*Repository reality only. No product redesign, no new features. Question answered: **is Phase 13 actually required before the (already-designed) Phase 14 model — Run / View / Preview / Comparison / Project — can become reality, and if so, what is the minimum?***

Evidence anchored to `MasterControlsContext.jsx` (~1.3k LOC), `MasterControlsDrawer.jsx` (~90 KB), the five transform files, and `store.js`.

---

## PART 1 — Current preview architecture (map + diagram)

**Four layers. Two are already single; two are five-wide.**

```
                                  ┌─────────────────────────────────────────────┐
  ① TRANSFORM LAYER (UNIFIED)     │  bundleWalk.js                               │
  one implementation per          │   mapBundleTradeCollections / summarizeBundlePrimary / pickPrimaryTrades
  transform; shared by all paths  │  costRescore.rescoreTradeArray   (per-array) │
                                  │  tradeFilter.buildTradePredicate + tradeMatches
                                  │  rrRescore.rescoreRrTradeArray   (per-array) │
                                  │  controlSwap.buildFftPreviewBundle (structural swap)
                                  └───────────────┬─────────────────────────────┘
                                                  │  (the SAME functions are imported by both rows below)
            ┌─────────────────────────────────────┴───────────────────────────────────┐
            │                                                                           │
  ② BUNDLE BUILDERS                                                          ┌──────────▼─────────┐
     (single-kind wrappers — redundant)                                     │  previewComposer    │
     costRescore.buildRescoredBundle                                        │  composePreviewBundle│
     tradeFilter.buildFilteredBundle                                        │  (Swap→Filter→RR→Cost)│
     rrRescore.buildRrPreviewBundle                                         │  reuses ① directly   │
     controlSwap.buildFftPreviewBundle                                      └──────────┬──────────┘
            │                                                                           │
  ③ STATE MACHINES — MasterControlsContext.jsx  (FIVE PARALLEL COPIES)                 │
  ┌─────────────┬─────────────┬─────────────┬─────────────┐              ┌─────────────▼──────────┐
  │   COST      │   FILTER    │    FFT      │     RR      │              │       COMPOSED          │
  │ localRescore│ localFilter │ localFft    │ localRr     │              │ composedPreviewResult   │
  │  Bundle     │  Bundle     │  Bundle     │  Bundle     │              │  → localComposedBundle  │
  │ lensSig()   │ filterSig() │ fftSig()    │ rrSig()     │              │ composedSig() (= union) │
  │ lensSuppress│ filterSupp. │ fftSuppress │ rrSuppress  │              │ composedSuppress        │
  │ build eff.  │ build eff.  │ build eff.  │ build eff.  │              │ build eff. (L892)       │
  │ apply cb    │ apply cb    │ apply cb    │ apply cb    │              │ apply cb (L1088)        │
  │ sync eff.   │ sync eff.   │ sync eff.   │ sync eff.   │              │ sync eff. (L1098)       │
  └──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┘              └───────────┬────────────┘
         │ gate: cost-only    filter-only   fft-only    rr-only                gate: ≥2 stage kinds dirty
         └─────────────┴─────────────┴─────────────┴───────────────┬────────────────┘
                                                                    │  ALL five write the SAME slot
  ④ STORE INTEGRATION — store.js  (UNIFIED — ONE slot)             ▼
                          setPreviewLens({ bundle, mode, label })  →  state.previewLens   (single)
                          getRunData(runId) → bundleFor() overlays previewLens  →  every page reads one view
                                                                    ▲
  UI — MasterControlsDrawer.jsx  (FIVE preview blocks + 2 "unavailable" blocks)
     L554 cost · L588 filter · L625 fft · L659 rr · L743 composed   (each gated on its own localXxxBundle,
     each wired to its own apply cb; shared <PreviewCard onApply> primitive, duplicated wiring)
```

- **All preview pipelines:** 5 (cost, filter, FFT, RR single-kind + composed). Single-kind fires only when its dirty-set is pure (`isCostOnlyDirty`/`isFilterOnlyDirty`/`fftOnly`/`rrOnly`); composed fires only when ≥2 stage kinds are dirty (`stageKinds < 2 → null`, L897).
- **All state machines:** 5 sets of {state + signature + suppressRef + build-effect + apply-callback + sync-effect} in `MasterControlsContext.jsx`, plus ~6 reset sites that each null all five.
- **All bundle builders:** `buildRescoredBundle`, `buildFilteredBundle`, `buildRrPreviewBundle`, `buildFftPreviewBundle` (single-kind) **+** `composePreviewBundle` (which re-derives the same result from the layer-① transforms).
- **All orchestration layers:** the five build effects + five apply/sync effect-pairs (context), and the five gated UI blocks (drawer).
- **All store integrations:** exactly **one** — `previewLens` (`setPreviewLens`/`getPreviewLens`/`clearPreviewLens`/`bundleFor`). Every apply callback writes this single slot with a different `mode` string.

---

## PART 2 — Phase 13 gap

**What remains unconsolidated:** the **state-machine layer (③)** and the **drawer UI layer**. Five parallel lifecycles still exist where one (the composer) would do.

| Dimension | Status | Owner file(s) | Evidence |
|---|---|---|---|
| **Transform duplication** | **Already unified** (one redundant sub-layer) | `costRescore` / `tradeFilter` / `rrRescore` / `controlSwap` / `bundleWalk` | Each transform has a single implementation; `composePreviewBundle` imports and reuses them. The *only* redundancy is the four single-kind **bundle wrappers** (`buildRescoredBundle` etc.), which re-wrap what the composer already produces. No duplicate math. |
| **State duplication** | **Duplicated ×5 — the core gap** | `MasterControlsContext.jsx` | 5 `useState` bundles (+2 unavailable flags), 5 `*Signature()`, 5 `*SuppressRef`, 5 build `useEffect`, 5 `apply*Lens`, 5 sync `useEffect`, ~6 reset sites nulling all five. `composedSignature` is already the **union** of the other four. |
| **UI duplication** | **Duplicated ×5 (wiring)** | `MasterControlsDrawer.jsx` | L554/588/625/659/743 — five preview-card blocks each gated on a distinct `localXxxBundle` and wired to a distinct `apply*` cb; +2 "unavailable" blocks (L705/723). Shared `<PreviewCard>` primitive, so it is *wiring* duplication, not pixel duplication. |
| **Store duplication** | **None — already unified** | `store.js` | Single `previewLens` slot; one read path (`getRunData → bundleFor`). Five writers, one slot. |

**Already unified:** transform math (①) and the store read/write slot (④). **Duplicate:** the state lifecycles (③) and their drawer wiring. **Owner of the duplication:** overwhelmingly `MasterControlsContext.jsx`, secondarily `MasterControlsDrawer.jsx`.

---

## PART 3 — Phase 14 dependency check

*Could each Phase 14 concept roll out today, without Phase 13?*

| Concept | Verdict | Why (repository reality) |
|---|---|---|
| **Run** | **Ready** | `store.activeRunId` + `getRawRunData` are already the single run truth. Phase 13 doesn't touch them. Renaming "Active Run → Run" is vocabulary only. |
| **View** (Model + Position Mode) | **Ready** | Lives entirely in `scenario` / `useRunVariant` / `runVariantResolve` — a *separate* axis from the preview pipeline. Renaming Result View→Model and Position Variant→Position Mode has **zero** coupling to the five lenses. |
| **Preview** | **Partially blocked** | The *read semantics* are already singular (one `previewLens`, one overlay). But the *implementation* exposes **five** apply callbacks / five `mode` strings / five bundle states to the drawer. To present "Preview" as **one** thing — one banner, one Apply, one Discard, regardless of which dials moved — the five build/apply paths must collapse to the composer-only path. This is the **one** concept that genuinely needs Phase 13. |
| **Comparison** | **Ready** | A distinct pairing surface (`projectWorkflow.comparedRunId` / Comparison Lab). Does not consume the preview lens machinery. |
| **Project** | **Ready** | `projectWorkflow` baseline/candidate/final run roles already exist. Renaming to stage *labels* is vocabulary only. |

**Conclusion:** **4 of 5 concepts are Ready today.** Only **Preview** is blocked, and only on its *internal presentation*, not its read model. Phase 13 is required **specifically and only** to make the Preview concept honest.

---

## PART 4 — Minimum Phase 13 (no perfect architecture)

**The minimum that supports Run → View → Preview → Comparison → Project without future rework:**

**Required (do this):**
1. **Single build path.** Route single-kind dirty-sets through `composePreviewBundle` too — it already no-ops absent stages, so a cost-only change yields a cost-only composed bundle. Remove the gate that diverts pure dirty-sets to dedicated builders.
2. **Collapse state ×5 → ×1.** One bundle state (`composedPreviewResult` / `localComposedBundle`), one signature (`composedSignature`, already the union), one suppressRef, one build effect, one apply callback, one sync effect. Delete the cost/filter/fft/rr quartet and the ~6 reset sites shrink to nulling one thing.
3. **Collapse drawer UI ×5 → ×1.** One preview card driven by `composedPreviewResult` (the unified label logic `composedLabelFromResult` already exists). Surface per-stage applied/unavailable from `result.stages` instead of five separate blocks.
4. **Remap drawer readouts to composer meta.** The single-kind blocks read builder-specific fields (`localFilterBundle.meta.beforeCount/afterCount`, `describeFftCoverage`, RR warning, `rescoreScope`). These must be read from the composer's `meta.stages` / `appliedStages` equivalents. **This is the real work** — see Part 5.

**Nice-to-have (later, non-blocking):**
- Collapse the five `mode` strings into a single `"preview"` mode. The store overlays regardless of `mode`, so this is cosmetic — but it's exactly what makes the *code* match the Phase 14 word "Preview".
- Delete the now-dead single-kind wrappers (`buildRescoredBundle`, `buildFilteredBundle`, `buildRrPreviewBundle`) once nothing imports them. Pure cleanup.

**Unnecessary (do NOT do now):**
- Touch the transform math (① is already unified and validated).
- Touch the `previewLens` store slot (④ already unified).
- Touch View / Comparison / Project / Run surfaces (Part 3: independent).
- Any backend, analytics, or importer change.
- Redesign the composer's stage order, or add BE/replay-tier stages (Protection) — that is Phase 15+ scope, explicitly out of bounds here.

---

## PART 5 — Implementation risk

| Factor | Assessment |
|---|---|
| **Complexity** | **Medium.** Concentrated in **two files** (`MasterControlsContext.jsx`, `MasterControlsDrawer.jsx`) plus optional wrapper deletions. The unifying engine (`composePreviewBundle`) and the single store slot **already exist and are validated**, so this is *deletion + rewiring*, not new logic. |
| **Risk** | **Medium.** The behaviour-change surface is the **drawer's per-stage readouts**: single-kind builders emit bespoke meta (`beforeCount`/`afterCount`, FFT coverage, RR partial warning, `rescoreScope`) that the composer represents differently (`stages`, `appliedStages`, `unavailableStages`). Mis-mapping these silently degrades the preview UI without breaking the lens. |
| **Files affected** | **~2 core + up to 4 cleanup.** `MasterControlsContext.jsx`, `MasterControlsDrawer.jsx` (required); `costRescore.js` / `tradeFilter.js` / `rrRescore.js` (wrapper deletion, optional); relevant `__validation__` scripts. |
| **Potential regressions** | (a) Drawer stat readouts (before/after counts, FFT coverage, RR warning) if composer meta lacks an equivalent; (b) the single-kind **"unavailable"** UX (FFT-OFF absent, RR no-excursion) must be re-sourced from `unavailableStages`; (c) per-combination **dismissal/suppression** behaviour; (d) banner label for single-kind now flows through `composedLabelFromResult` (it already handles bare single-stage names, so low risk). |
| **Classification** | **Medium refactor.** Not *small cleanup* — five interlocking state machines + drawer rewiring + meta remap. Not a *major architectural project* — no new architecture, no store change, no transform change, no cross-file API redesign; the target already exists and is tested. |

**Evidence for "medium, not major":** the only genuinely new code is meta-field mapping in the drawer; everything else is removing parallel copies of a lifecycle whose canonical version (`composePreviewBundle` + `previewLens`) is already in production and validated. The blast radius is two files behind one drawer, not the whole app — pages read through the unchanged `getRunData`/`previewLens` path, so non-MC surfaces are untouched.

---

## FINAL OUTPUT

**1. Phase 13 status.** **Partially complete (~60%).** Transform layer and store-read layer are unified; the five-way **state-machine** duplication and its **drawer UI** wiring remain. The composer that makes consolidation possible already ships and is wired for the mixed case.

**2. Exact remaining scope.** In `MasterControlsContext.jsx`: collapse the cost/filter/fft/rr state+signature+suppress+build+apply+sync quintet into the existing composed path (single build, single apply, single sync). In `MasterControlsDrawer.jsx`: collapse five preview blocks (+2 unavailable) into one composer-driven card, remapping per-stage readouts to `result.stages`. Optionally delete the dead single-kind bundle wrappers. **No** store, transform, backend, analytics, or non-MC changes.

**3. Should it be done before further Phase 14 rollout?** **Partially — and that's the key finding.** Four of the five Phase 14 concepts (Run, View, Comparison, Project) are **Ready now** and should not be blocked on Phase 13 — they are vocabulary changes over already-separate surfaces. **Only the Preview concept requires Phase 13 first**, because today "Preview" is five implementations wearing one read-slot. So: do the *minimum* Phase 13 **specifically to land Preview**, and let the other four concepts roll out in parallel.

**4. Recommended next task.** **Execute Minimum Phase 13 (Part 4 "Required" items only), scoped to `MasterControlsContext.jsx` + `MasterControlsDrawer.jsx`, gated by a drawer-meta-parity check** so the per-stage readouts survive the switch from builder meta to composer meta. Sequence it as: (a) route single-kind through the composer behind the existing composed path, (b) delete the four redundant state machines, (c) unify the drawer card, (d) verify meta parity, (e) optional wrapper/mode cleanup. Run the Run/View/Project/Comparison vocabulary rename as an **independent, parallel** track — it has no dependency on this work.

*Bottom line: Phase 13 is a **medium refactor**, not a rebuild, and it is required **only** for the Preview concept. The minimum is "make the composer the sole build path and collapse the drawer to match" — two files, bounded blast radius, target engine already in production.*
