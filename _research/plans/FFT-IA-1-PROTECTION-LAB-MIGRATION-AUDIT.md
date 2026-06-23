# FFT-IA-1 — Move FFT research into a Protection Lab tab (audit)

**Goal:** Make RunDetail show only a compact "did FFT help or hurt?" overview, and move the full FFT research ("why?") into a dedicated **FFT Protection** tab in Protection Lab.

**Status:** Audit / IA only. No code changed. No analytics, formulas, backend, importer, or pairing touched. This documents structure + a phased migration plan.

**Headline:** This is very doable and largely a *componentization* job, not new analytics. Two of the heaviest "deep" panels (classification + per-cancel drilldown) **already exist as reusable, prop-driven components** and are already mounted in a second place (Entries Lab). The real work is (a) extracting RunDetail's inline FFT pieces into shared components, (b) giving the Protection Lab tab the *scenario + control* inputs it needs (Protection Lab is currently baseline-pinned), and (c) a single shared analysis hook so the compact card and the tab never recompute differently.

---

## 1. Files inspected

- `frontend/src/pages/ProtectionLab.jsx` (2,234 lines) — tabbed page, `useDataset`, baseline-pinned.
- `frontend/src/pages/RunDetail.jsx` (5,798 lines) — current FFT block + inline FFT components.
- `frontend/src/components/lab/protection/` — `ProtectionDataQualityPanel`, `ProtectionSectionDivider`, `ProtectionVisualAnalytics`, `ProtectionPowerTools`, `protectionAnalytics.js`, `ProtectionWhatIfStorage.js`.
- `frontend/src/components/lab/entries/model/FftClassificationPanel.jsx`, `FftProtectionPanel.jsx`, `ModelAnalysis.jsx` — existing reusable FFT panels + their mount point.
- `frontend/src/data/fftPairingResolver.js`, `fftPairingAnalytics.js`, `fftAnalytics.js` — pure analytics modules (already importable anywhere).
- `frontend/src/data/useResultsLens.js`, `useTradeUniverse.js`, `store.js` — data/scenario resolution.
- `frontend/src/App.js` — routing (`/protection-lab`, `/runs/:runId`).

---

## 2. Protection Lab architecture & how to add a tab

ProtectionLab is **already tabbed**:

- `PROT_TABS = [overview, deepdive, research]` (line 650) drives `ProtTabBar` (655).
- State: `const [protTab, setProtTab] = useState("overview")` (98).
- Render gates: `{protTab === "overview" && (…)}` (226), `deepdive` (263), `research` (597).

Adding an **FFT Protection** tab is a clean, additive change: append `{ key: "fft", label: "FFT Protection", hint: "Cancel impact" }` to `PROT_TABS` and add a `{protTab === "fft" && (<FftProtectionTab … />)}` block. No restructuring of existing tabs.

Data the page already has (line 86): `ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs` via `useDataset()`, plus `activeRun = runs[activeRunId]`. So the **run bundle is in hand** — which means `controlTradesByScenario`, `extractOffTrades`, `getAutoControlInfo`, and `computePairedFftAnalytics` are all reachable from here today.

---

## 3. RunDetail FFT block — move vs. remain

The block is one large IIFE (~lines 2800–3090) gated on `fft.fftCancels > 0`, plus module-scope helpers/components above it.

| Piece (RunDetail) | Approx. location | Migrate? |
|---|---|---|
| Section header "FFT Effect Analysis" + subtitle + auto-paired badge | ~2850 | Remains (shrinks to compact card title) |
| Verdict card (strategy delta, helped/hurt) | ~2860 | **Stays (compact) + full copy in tab** |
| OFF/ON dual mini-strip (`ControlStrip` ×2) | ~2900 | **Move to tab** |
| `FftWidthBreakdown` (canonical + fine) | ~2908 | **Move to tab** |
| "FFT activity · what FFT did" (cancels, move-away) | ~2932 | **Move to tab** |
| "FFT-OFF counterfactual" (winners removed / losses avoided / high-conf impact / known / not-counted) | ~2964 | **Move to tab** (compact card keeps cancels + impact + known/not-counted counts only) |
| Ghost KPI row (unverified) | ~3036 | **Move to tab** |
| `FftDrilldown` modal | ~3086 | **Move to tab** |

**RunDetail keeps:** a single `FftOverviewCard` answering "did FFT help/hurt?": verdict + strategy delta (ON−OFF) + FFT cancels + high-confidence attributed impact + known/not-counted counts + an **Active FFT criteria** line (enabled; `min OB width ≥Xp` if set; move-away pips / OB multiple if set; placeholders for future criteria) + a button **"Open FFT Protection analysis"**.

---

## 4. Reusable components / helpers

**Already extracted & reusable (no work — just mount them):**
- `FftClassificationPanel({ trades, offTrades })` — structure/direction/session classification + bucket coverage.
- `FftProtectionPanel({ trades, offTrades })` — FFT-OFF counterfactual tiles + collapsible/sortable **per-cancel `PairedOffTable`** + self-invalidated / timing-divergent breakdown.
- Both are pure prop-driven and **already mounted together in `ModelAnalysis.jsx` (Entries Lab)** with `trades={fftSource}` + `offTrades`. They map 1:1 onto the tab's "Classification", "per-cancel drilldown", and "self-invalidated / timing-divergent" requirements.

**Inline in RunDetail (NOT exported → must be extracted to shared modules):**
- Components: `ControlStrip` (322) → rename `FftControlStrip`; `FftKpi` (376); `FftWidthRow`/`FftWidthTable`/`FftWidthBreakdown` (480/503/528); `FftDrilldown` (593).
- Display helpers/data: `computeStripMetrics` (282), `dirStructSanityRows`, `aggregateFftWidth` + `FFT_WIDTH_CANON`/`FFT_WIDTH_FINE` + `fftWidthCanonKey`/`fftWidthFineKey` + `fftWidthVerdict`, `FFT_TIPS` (258), `FFT_LOSS_OUTCOMES` (390), `fftRowContribution` (394), `FFT_DRILL` (419).

These are all **display-only** (they consume `computePairedFftAnalytics().pairs` + ON/control trades). Extraction is a cut/paste + export, not a rewrite — and per the constraints, no formula inside them changes.

---

## 5. Data availability in Protection Lab

| Need | Available today? | Notes |
|---|---|---|
| Selected **run** bundle | ✅ | `activeRun = runs[activeRunId]` (line 99) |
| Auto-control **offTrades** | ✅ (derivable) | `extractOffTrades(activeRun, null, variant, canonicalKey)` + `getAutoControlInfo` — modules already exist |
| Paired analytics | ✅ | `computePairedFftAnalytics`, `summarizeFftPairBuckets` are pure imports |
| Account settings (for $ display) | ✅ | `useResultsLens()` is global (basis + accountSettings) |
| **Selected scenario ON trades (with FFT cancels)** | ⚠️ **Not today** | ProtectionLab is **baseline-pinned** by design (`BASELINE_SCENARIO_OVERRIDE`, line 37/95). Its `trades` = baseline universe, which has **no FFT cancels**. FFT is inherently scenario-specific (e.g. Triggered Edge 25% · Next). |
| **Which scenario** the user means | ⚠️ **Not shared** | RunDetail's `resultView` is **local component state** (built via `derivePrimaryResultView` + the entry-model selector). `useResultsLens` does **not** carry scenario. A global Strategy-Map scenario exists (`fxob_scenario_v1`) but RunDetail doesn't bind to it. |

**So the one real new wiring is scenario context.** Options for the FFT tab:
- **(A) Own selector (recommended):** give the FFT tab its own small result-view selector (reuse `useTradeUniverse(runId, resultView)` + `extractOffTrades` exactly as RunDetail does). Self-contained, unambiguous, and it sidesteps Protection Lab's baseline-only contract by scoping the override to this tab only.
- **(B) Shared scenario:** read the global Strategy-Map scenario. Less UI, but couples the tab to a selection made elsewhere and risks surprising the user.

Either way the tab must **visibly label its scenario** ("Triggered Edge 25% · Next vs FFT-OFF control") so it never reads as a baseline-wide protection statement.

---

## 6. Recommended component structure

```
data/
  useFftAnalysis.js        NEW hook — single source of truth.
                           Input: (runId, resultView). Returns:
                           { pairs, offTrades, paired, buckets (canon+fine),
                             strategyDeltaR, verdict, criteria, fftCancels,
                             highConfImpact, known, notCounted, hasPaired }.
                           Wraps the existing pure modules; performs NO new math.

components/lab/fft/         NEW shared dir (extracted from RunDetail, display-only)
  FftVerdictCard.jsx        verdict + strategy delta (used by both surfaces)
  FftControlStrip.jsx       was RunDetail ControlStrip
  FftWidthBreakdown.jsx     was RunDetail FftWidthBreakdown (+Row/Table)
  FftActivityCards.jsx      FFT activity + FFT-OFF counterfactual + ghost KPIs (FftKpi)
  FftDrilldown.jsx          per-cancel modal
  FftCriteriaPanel.jsx      NEW — reads runData.config (enabled, min OB width,
                            move-away pips/OB multiple) via LOAD_FIELD_LABELS
  fftDisplay.js             FFT_TIPS, FFT_LOSS_OUTCOMES, FFT_DRILL, computeStripMetrics,
                            dirStructSanityRows, aggregateFftWidth, buckets, verdict helpers
  (reuse) FftClassificationPanel, FftProtectionPanel  ← from entries/model (or move here)

pages/RunDetail.jsx        renders <FftOverviewCard> (compact) + "Open FFT Protection"
pages/ProtectionLab.jsx    new "fft" tab → <FftProtectionTab> composing all of the above
```

`useFftAnalysis` is the linchpin: RunDetail's compact card and the Protection Lab tab both consume it, so the headline numbers can never diverge between the two surfaces.

---

## 7. Risks

1. **Duplicated calculations** → mitigated by the single `useFftAnalysis(runId, resultView)` hook; both surfaces read the same object. (Today RunDetail computes inline; copying that into Protection Lab without a shared hook is the main trap.)
2. **Stale / mismatched result view** → RunDetail's scenario is local state; the tab must resolve its own (Option A) and label it. Risk if the two surfaces silently show different scenarios. The compact card and the tab should display the same scenario string.
3. **Baseline-vs-scenario confusion** → Protection Lab is contractually baseline-only; an FFT tab that is scenario-specific is an exception. Must be clearly labelled and ideally carry its own scenario selector so it doesn't appear to contradict the baseline pages beside it.
4. **Routing / deep-link** → `/protection-lab` takes no params and `protTab` is local `useState("overview")`. A "Open FFT Protection analysis" link needs a deep-link mechanism: e.g. `/protection-lab?tab=fft` with `protTab` initialised from the query param (and ideally the scenario passed too). Small `react-router` `useSearchParams` addition.
5. **Two homes for FFT deep panels** → `FftClassificationPanel`/`FftProtectionPanel` already render in Entries Lab. That's fine (shared components), but decide whether Entries Lab keeps them or defers to Protection Lab to avoid three FFT surfaces drifting.
6. **Empty-state parity** → the tab must handle "no FFT cancels" / "no auto-control" gracefully (RunDetail already gates on `fft.fftCancels > 0` and `hasPaired`). Reuse those guards.

---

## 8. Recommended phases

- **Phase 1 — Extract + create the tab (no RunDetail removal yet).**
  Extract the inline pieces into `components/lab/fft/` + `useFftAnalysis`. Add the FFT Protection tab to Protection Lab composing them + the existing classification/protection panels. RunDetail unchanged. Verify the tab reconciles to RunDetail's numbers on Run 17 (103 cancels / 42 HIGH / −18.58R / −21.2R). Lowest risk: nothing is removed, both render in parallel for comparison.
- **Phase 2 — Shrink RunDetail to the overview card.**
  Replace the big IIFE with `<FftOverviewCard>` (verdict + delta + cancels + impact + known/not-counted + criteria + link). Delete the now-unused inline components from RunDetail (they live in the shared dir). Confirm KPI strip + verdict unchanged.
- **Phase 3 — Deep-link.**
  Wire "Open FFT Protection analysis" → `/protection-lab?tab=fft` (+ scenario), initialise `protTab`/scenario from query params.

---

## 9 & 10. Should this happen before more FFT research?

**Yes — do Phase 1 (and ideally Phase 2) before further FFT research.** Reasons:

- RunDetail's FFT block is already the largest single section on a 5,800-line page and every new research idea (more buckets, structure×width, criteria) currently lands there, compounding the bloat the task is trying to fix.
- The shared `useFftAnalysis` hook + `components/lab/fft/` make *subsequent* research cheaper: a new panel is added once, in the tab, instead of being wedged into RunDetail and risking divergence.
- The cost is low and mostly mechanical because the deep panels already exist and are prop-driven, and the analytics modules are already pure/portable. The only genuinely new wiring is scenario resolution in Protection Lab (Section 5) and a deep-link (Phase 3).

Net: this is primarily an information-architecture/refactor that *unblocks* cleaner FFT research rather than competing with it. Recommend scheduling Phase 1 next, then resuming research inside the new tab.
