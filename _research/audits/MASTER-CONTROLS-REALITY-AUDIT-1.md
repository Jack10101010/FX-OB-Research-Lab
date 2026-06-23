# Master Controls — Reality Audit (PM / Architecture / Coordination)

*Audit only. No code written, no changes made. Repository reality overrides documentation.*
*Branch `codex-dev`, 6 commits ahead of origin. Audited 2026-06-10. Evidence is file/line/grep based.*

---

## 0. Verification baseline (what the repo actually shows)

- **Git:** branch `codex-dev`, ahead by 6 commits. HEAD = `59974db feat(lab): add truthful context banners to compare pages`.
- **Highest Master Controls phase marker found in code:** **Phase 12C-1** (`previewComposer.js`, `MasterControlsContext.jsx`). There is **no Phase 13, 14, or 15 anywhere in `components/masterControls/`**. Phases 13/14/15 are roadmap intent only (they live in the untracked `MASTER-CONTROLS-ARCHITECTURE.docx`, not in code).
- **Last commit touching `masterControls/`:** `1a4f85b` (2026-06-09). The Master Controls tree is **clean** — no uncommitted MC work. Master Controls is currently **dormant**, not active, despite docs calling it "active (parallel)."
- **Doc drift headline:** `docs/ai/WORKSTREAMS.md` and `PROJECT_STATUS.md` describe Master Controls as **"Phase 7A complete."** Code is at **12C-1** — roughly five phase-bands further than the docs claim.

---

## PART 1 — Master Controls phase status (vs original roadmap)

Evidence = file + phase tag in source comments and the wiring in `MasterControlsContext.jsx`.

| Phase band | Scope | Status | Evidence |
|---|---|---|---|
| **1–8: Draft vs Active arch** | `activeConfig` / `draftConfig` / `effectiveConfig` split | **Complete** | `MasterControlsContext.jsx` L189–191; `effectiveConfig = draftConfig ?? activeConfig`. |
| **1–8: Dirty field tracking** | `dirtyFields`, `dirtyCount`, per-field tiers | **Complete** | L193–199; `dirtyFields:Set`, `highestDirtyTier`, `highestRerunTier`. |
| **1–8: Rerun tier classification** | tier of dirtiest field → instant vs rerun | **Complete** | `highestRerunTier` (Phase 6, L198); `COMPOSED_INSTANT_KEYS` excludes `stopBuffer`/`entryBuffer`/backend-tier (L94–99). |
| **1–8: Preview foundations** | preview run + promotion + store lens | **Complete** | `startPreview`/`promotePreview` (Phase 4A/4C); `previewLens` store overlay (Phase 8A/8B), `store.js` `bundleFor()` L1031. |
| **9: Cost preview** | exact frontend cost rescore | **Complete** | `costRescore.js` (Phase 7A/9A): `rescoreTradeArray`, `buildRescoredBundle`. |
| **10A: Filter preview** | session/struct-dir/direction subset | **Complete** | `tradeFilter.js` (Phase 10A): `buildTradePredicate`, `buildFilterPreviewBundle`. |
| **10B: FFT preview** | FFT ON→OFF universe swap | **Complete (one-way)** | `controlSwap.js` (Phase 10B): `buildFftPreviewBundle`. ON→OFF only; OFF→ON cannot be synthesized (by design — controls are the OFF universe). |
| **11: RR preview** | stop-anchored re-target | **Complete** | `rrRescore.js` (Phase 11C): `canRescoreRr`, `rescoreRrForBundle`, `buildRrPreviewBundle`. Degrades when excursion fields absent. |
| **9–11: Preview lens architecture** | one store-level read overlay | **Complete (read side)** | `store.js` single `previewLens` slot; every page reads `getRunData()` → lens-aware (L1037). |
| **12A: Preview Composer** | canonical Swap→Filter→RR→Cost order | **Complete** | `previewComposer.js` header documents the Phase 12A ordering audit; `composePreviewBundle` implements it. |
| **12B: Composed Preview Lens** | wire composer into context for mixed dirty | **Complete** | `MasterControlsContext.jsx` L892–927 (12B-2 effect); fires only when ≥2 stage kinds dirty + all instant. |
| **12C: Reliability cleanup** | unified banner labels, n/a stages | **Partial** | `composedLabelFromResult` (12C-1, L151) done. But "reliability cleanup" did **not** consolidate the four single-kind lenses into the composer — they still run as separate pipelines (see Part 2). Label hygiene shipped; pipeline unification did not. |

**Bottom line Part 1:** Phases 1–12B are genuinely **Complete** in code. 12C is **Partial** — the cosmetic half shipped, the architectural-consolidation half did not. This is the seam where Phase 13 was supposed to begin.

---

## PART 2 — Phase 13 audit (one preview architecture) — GAP ANALYSIS

**Preview systems that currently exist (five build pipelines):**

1. **Cost lens** — `buildRescoredBundle` → `localRescoreBundle` → store lens mode `local_rescore`.
2. **Filter lens** — `buildFilterPreviewBundle` → `localFilterBundle` → mode `instant_filter`.
3. **FFT lens** — `buildFftPreviewBundle` → `localFftBundle` → mode `fft`.
4. **RR lens** — `buildRrPreviewBundle` → `localRrBundle` → mode `rr`.
5. **Composed lens** — `composePreviewBundle` → `localComposedBundle` → mode `composed`.

**Which route through `composePreviewBundle()`?**
Only the **composed lens** (#5), and only when **two or more** instant stage kinds are dirty at once (`stageKinds < 2 → setComposedPreviewResult(null)`, `MasterControlsContext.jsx` L897–905).

**Which bypass it?**
All four single-kind lenses (#1–#4). A single dirty axis (only cost, or only filter, etc.) is served by its **dedicated** builder, never by the composer.

**Are there duplicate state machines?** **Yes.** Five parallel sets of: a `localXxxBundle` state, an `xxxSignature()` memo-guard (`filterSignature`/`fftSignature`/`rrSignature`/`composedSignature` + the cost equivalent), an `applyXxxLens` callback, and a "keep-our-lens-in-sync" `useEffect`. That is five copies of the same lifecycle (build → push to store lens → re-push on change → clear on run switch / un-dirty).

**Are there duplicate preview pipelines?** **Partially.** The *math* is **not** duplicated — `composePreviewBundle` imports and re-uses the same four transforms (`controlSwap`, `tradeFilter`, `rrRescore`, `costRescore`). What is duplicated is the **orchestration/state layer** wrapped around them. So: one set of transforms, two ways to invoke them (single-kind direct vs composed), five state machines feeding one store lens.

**What's already unified:** the **read side** is clean — a single `state.previewLens` slot, and `bundleFor()` overlays it for exactly one run. Pages don't know which of the five produced the bundle.

**What remains to reach a single preview engine (Phase 13 gap):**
- Route the single-kind cases through `composePreviewBundle` too (it already no-ops absent stages), then **delete the four dedicated lens builders + their four bundle states + four sync effects.** Net: 5 state machines → 1.
- Collapse the five `*Signature()` guards into the existing `composedSignature` (it is already the union of all instant fields).
- Decide the composer's relationship to **rerun-tier** transforms (BE replay — see Part 5). Today the composer covers only the four *instant* axes; "one preview architecture" is not achieved while a second, parallel what-if engine (Protection BE replay) renders outside it.

---

## PART 3 — Phase 14 audit (baseline vs active run confusion)

**What currently acts as source of truth?** There is no single one. The read truth is `store.activeRunId` → `getRunData(runId)` (lens-aware) vs `getRawRunData(runId)` (lens-immune raw). The *variant* truth is `store.scenario`.

**How many competing run concepts exist? — at least seven:**
1. `store.activeRunId` — the loaded run.
2. `getRawRunData()` (raw/baseline bundle) **vs** `getRunData()` (preview-lens-overlaid bundle) — same run, two faces.
3. `previewLens` overlay — a temporary stand-in bundle (5 modes).
4. `scenario.family` — **Result View**: `baseline | triggered_edge | penetration | directional` (`store.js` L128; `runVariantResolve.js` `BASELINE_VIEW`).
5. `scenario.positionVariant` — **Position Variant**: `single_position | one_per_direction | allow_multi_position` (orthogonal "axis-1").
6. `project.{baselineRunId, candidateRunId, finalRunId, activeRunId}` — four project-level run roles (`projectWorkflow.js` L19–43, `store.js` L897).
7. Master Controls **preview run** (`startPreview` → `promotePreview`) — a real backtest rerun, distinct from all overlays.

**Is Active Run already partially implemented?** **Yes.** `store.activeRunId` + `activeConfig` (derived from the active run bundle) + the lens overlay already deliver "active run with an ephemeral projected view on top." The TradingView-style spine exists; what's missing is a *single naming/ownership* over these seven concepts.

**Does variant switching move us closer or farther?** **Closer in mechanism, farther in vocabulary.** `useRunVariant`/`runVariantResolve` did the right architectural thing — it killed RunDetail's local `resultView` fork and made the store `scenario` the single source of truth that persists and propagates. That is exactly the Phase 14 consolidation pattern. But it **added two more named axes** ("Result View", "Position Variant") on top of "Active Run", "Baseline", "Raw vs Lens", and the project roles — so the *terminology* surface grew even as the *plumbing* improved.

**Terminology that causes confusion:**
- **"Baseline"** is overloaded 3 ways: `BASELINE_VIEW` (a Result View family), `project.baselineRunId` (a project role), and `getRawRunData` ("the baseline, lens-immune" bundle).
- **"Active"** is overloaded: `activeRunId` (store), `activeConfig` (MC), `project.activeRunId`, and predicate `.active` flags.
- **"Variant"** spans `scenario.family` (Result View), `positionVariant`, `selectedTradeVariant`, and entry-model variants.

**Recommendations:** (1) Publish a one-page run-concept glossary mapping the seven concepts to canonical names and freeze it in `GLOSSARY.md`. (2) Pick **one** word for the raw/promoted truth ("Active Run") and **one** for the ephemeral projection ("Preview") and ban "Baseline" from meaning the raw bundle. (3) Treat Result View + Position Variant as *selectors into* the Active Run, not as competing runs — they already are, but the UI banners present them as peer "runs."

---

## PART 4 — Phase 15 audit (TradingView-style research mode feasibility)

Question: change a setting → instant downstream updates, no backtest rerun.

| Target surface | Status | Why |
|---|---|---|
| **Instant KPI update** | **Supported** | For the four instant axes (cost/filter/RR/FFT). Composer rebuilds the summary from final primary trades in one walk (`summarizeBundlePrimary`); lens overlay makes every page read it. |
| **Instant Equity update** | **Supported** | `mapBundleTradeCollections` recomputes every equity curve exactly once from final rows (`previewComposer.js` per-array walk). |
| **Instant Strategy Map update** | **Supported (instant axes)** | Strategy Map reads `useRunVariant`/`getRunData` → lens-aware, so it re-renders on lens change without a rerun. |
| **Instant Failure stats update** | **Partial** | Failures workspace consumes `useRunVariant`, so it sees the overlaid universe — but several failures analytics read excursion/`post_stop_*` fields that the *instant* transforms don't recompute (RR rescore touches R, not MFE/MAE excursions). Verdicts derived from excursions can go stale under a lens. |
| **Instant Protection stats update** | **Unsupported** | Protection's headline (break-even outcomes) comes from `beReplay.js`, a **candle-walk REPLAY-tier** engine, not an arithmetic rescore. It needs `candles.csv` and a path walk — fundamentally not instant, and it does not flow through the lens at all. |
| **Backend-tier settings (`stopBuffer`, `entryBuffer`, etc.)** | **Unsupported (by design)** | Deliberately excluded from `COMPOSED_INSTANT_KEYS`; they require a real rerun. |

**Verdict:** The instant spine for KPI / Equity / Strategy Map is **already real** for the four monetised axes. "TradingView mode" is ~60% there. The two gaps are (a) excursion-dependent stats not being re-derived inside the instant transforms, and (b) Protection being a separate rerun-tier engine. Phase 15 is blocked less by the spine and more by **two transform families living outside the spine** (Part 5).

---

## PART 5 — Workstream collision check

**Parallel "counterfactual run / paired / verdict" engines that exist independently:**

| Engine | Location | What it does |
|---|---|---|
| FFT control swap | `masterControls/controlSwap.js` | pairs run with FFT-OFF controls, swaps universe |
| Master Controls filter | `masterControls/tradeFilter.js` | removes trades by predicate, recomputes Net R/WR/PF |
| **Failures filter simulator** | `failures/shared/filterSimulator.js` | **removes trades, recomputes Net R/WR/PF** |
| Protection paired/verdict | `protection/protectionAnalytics.js` | `buildPairedTrades`, `deriveExactVerdict`, `estimateVerdict` |
| **Protection BE replay** | `data/beReplay.js` | candle-walk replay → counterfactual R + equity |
| Failures verdict engine | `failures/shared` (`bucketRowAction`) | per-bucket verdict chips |
| Entries paired-run | `entries/shared/PairedRunSelector.jsx` | paired control comparison |

**Duplicated effort:**
- `filterSimulator.js` (Failures) and `tradeFilter.js` (Master Controls) are **the same operation** — remove a subset of trades, recompute Net R / WR / PF — built twice, by two streams, with no shared core.
- Three+ separate "pair a run with its counterfactual and score the delta" implementations (controlSwap / protectionAnalytics / PairedRunSelector).

**Overlapping architectures:** every lab has reinvented "derive a what-if view of a run and summarise it." Master Controls formalised this as *bundle transforms feeding one store lens*; the other labs do it as *in-tab local recompute* that never touches the lens.

**Conflicting mental models:** Master Controls = "ephemeral overlay on the Active Run, applied app-wide." Failures/Protection = "compute a private derived table inside my tab." Same concept, opposite plumbing — which is why instant updates don't propagate across labs.

**Future integration risk:** the **currently-uncommitted** Research Banner / roadmap stream (7 modified files: `ResearchContextBanner.jsx`, `ResearchResultViewBanner.jsx`, `SectionRoadmap.jsx`, `roadmapStore.js`, `ProtectionLab.jsx`, `EntriesWorkspace.jsx`, `RetestLabTab.jsx`) cuts across four workstreams' files at once. It is exactly the kind of cross-stream edit `AGENTS.md` rule #2/#6 warns against, and it is sitting un-staged.

**Is Protection Lab creating logic that should become Preview Bundle transformations? — YES, explicitly.**
`beReplay.js` is a run → counterfactual-run transformation (break-even applied, R and equity recomputed) producing outcome states (`be_stopped_loss_saved`, `be_stopped_winner_cut`, …). That is *structurally identical* to a Preview Bundle stage — it just lives outside the composer because it is **REPLAY tier** (needs candles, not instant arithmetic). The right end-state: a fifth composer stage **"BE"** in the rerun/replay tier, so `composePreviewBundle` becomes the single home for both instant and replay transforms, and Protection stats flow through the same lens as everything else. Building BE replay as a bespoke in-tab engine is the single biggest divergence from the Master Controls vision currently in flight.

---

## PART 6 — Final PM report

**1. Current project status.** Active branch `codex-dev`, 6 commits ahead, with a substantial uncommitted Research-Banner/roadmap stream (7 files) plus a large pile of untracked audit `.md`s and stray debug `.mjs`/`.py`/`package*.json` files. Live focus per HEAD commits = research banners + Protection BE consumption, **not** the "Failures Lab V5" the docs name as current focus.

**2. Current Master Controls status.** Far healthier than documented. Phases **1–12B complete**, **12C partial** (labels done, consolidation not). The instant-preview spine (draft/active, dirty+tier tracking, cost/filter/RR/FFT lenses, composer, single store lens) is **shipped and clean on disk**. It is **dormant** (last touched 2026-06-09) while attention moved to Failures/Protection/Banners. **Master Controls did not get "completed indirectly" — but its vision is being *re-implemented piecemeal* inside other labs** (filter sim, BE replay), which is the real risk.

**3. Documentation drift (verified):**
- WORKSTREAMS/PROJECT_STATUS say MC = "Phase 7A." Code = **12C-1**. Understated by ~5 phase bands.
- ROADMAP.md tracks **only** Failures/Classification phases; the Master Controls 1–15 roadmap is **not in any tracked doc** — it lives in the untracked `MASTER-CONTROLS-ARCHITECTURE.docx`. There is no committed source of truth for the MC roadmap.
- CURRENT_WORKSTREAM names Failures V5 as focus; HEAD commits are Banners/Protection. Partial drift.
- "Master Controls is active (parallel)" — code says **dormant/clean**.

**4. Workstream collisions.** Filter-and-rescore built twice (Failures vs MC). 3+ paired-run/verdict engines. Protection BE replay = an off-spine preview transform. An uncommitted banner stream edits four workstreams' files simultaneously.

**5. Top 5 architectural risks.**
1. **Preview-engine fragmentation** — five state machines + an off-spine BE engine; "one preview architecture" (Phase 13) regresses further with every new in-tab recompute.
2. **Run-concept sprawl** — seven overlapping run notions, "Baseline"/"Active"/"Variant" each overloaded 3×; high cognitive-load and bug surface (Phase 14).
3. **Roadmap has no committed home** — MC plan only in an untracked `.docx`; docs understate reality by 5 phases → agents keep "re-deriving" instead of extending.
4. **Cross-stream uncommitted edits** — the 7-file banner/roadmap change violates scoped-commit rules and risks clobbering Failures/Protection/Entries work.
5. **Excursion-staleness under lens** — instant RR/cost transforms don't recompute MFE/MAE, so failure/verdict stats can silently desync in TradingView mode (Phase 15 correctness hole).

**6. Recommended next task (single, highest-leverage):**
**Phase 13 consolidation — route all single-kind lenses through `composePreviewBundle` and delete the four duplicate state machines.** It is low-risk (the composer already no-ops absent stages and reuses the same transforms), it is the prerequisite for Phases 14 and 15, and it directly stops the piecemeal re-implementation. Pair it with a committed **run-concept glossary** (Phase 14 down-payment). Do **not** start new BE/Protection feature work until BE replay's relationship to the composer (instant vs replay tier) is decided.

**7. Recommended ownership boundaries.**
- **Master Controls owner** (single): everything in `components/masterControls/**`, `previewComposer`, `configRegistry/Translator`, and **the preview-transform contract** — any new "what-if on a run" math must land as a composer stage, not an in-tab engine.
- **Failures / Protection / Entries owners:** *consume* the composer/lens; they may define a transform's *parameters* but not a parallel recompute pipeline. `filterSimulator.js` and `beReplay.js` should be migrated to (or re-expressed as) composer stages under MC ownership.
- **PM/docs owner:** move the MC 1–15 roadmap out of the `.docx` into a tracked `ROADMAP-MASTERCONTROLS.md`; correct the "Phase 7A" claim to 12C-1; reconcile "current focus."
- **Shared-file discipline:** the research-banner files (`ResearchContextBanner`, `ResearchResultViewBanner`, `SectionRoadmap`, `roadmapStore`) need a named owner — they are currently edited by whoever passes through, which is the root of the uncommitted cross-stream diff.

---

*Evidence > assumptions. Every status above is anchored to a file/line or grep result, not to the prior roadmap claims. No files were modified; this audit is read-only.*
