# WORKSTREAMS.md — registry

> AI-memory view of parallel workstreams. The repo-root `WORKSTREAMS.md` carries the
> git-level "currently dirty files" detail; re-verify with `git status --short`.
> Attach to a workstream (or add one) before coding. Never touch another stream's files
> without explicit scope.

*Last updated: 2026-06-12.*

## Failures Lab V4  (committed; paused)

- **Status:** feature-complete; integration cleanup committed. **Loser Run-Up breakdown shipped**
  (`2004d28`): Trade Outcome & Loser Run-Up panel/tab — loser MFE + ≥0.5/1/1.5/2R reach across cohorts
  (`data/loserRunUp.js`, gated when no loser carries `mfe_r`). Remaining work is interpretation, not build.
- **Lead:** Claude (design/analytics/frontend).
- **Purpose:** loss diagnostics — Distance to Stop (Excursion) tab: MFE reach, BE opportunity
  (upper bound), winner MAE stop pressure, MAE/MFE by dimension, penetration dimension,
  Failure Explorer (refine + verdict action chips), shared aggregation engine.
- **Owns:** `components/lab/failures/**`, `components/lab/roadmap/SectionRoadmap.jsx`,
  `data/roadmapStore.js`, `data/__validation__/failuresAggregation.validate.mjs`,
  `excursionAnalytics.validate.mjs`, `failuresFieldDetection.validate.mjs`,
  `pages/FailuresLab.jsx`. Design refs: `FAILURES-LAB-V4-ARCHITECTURE-AUDIT-1.md`,
  `FAILURES-LAB-V2-*`, `FAILURES-LAB-UX-AUDIT-1.md`.
- **Shared/caution:** `data/researchGlossary.js` (shared with Classification), `data/importer.js`
  (excursion field mapping — shared with Entry/FFT).
- **Next:** hand scoped commits to host → pause → pivot decision (Master Controls vs Protection).

## Trade Classification

- **Status:** paused (Phase 2 shipped; polish items in backlog). **Distance-at-arm breakdown shipped**
  (`449dc58`, D-014): `data/distanceBreakdown.js` + RunDetail D2 section (signed, TE-only gated);
  enables in-app F-004 validation (F-004 stays provisional).
- **Lead:** Claude (design/UX/frontend); Codex for data/test.
- **Purpose:** fill-state taxonomy, Classification Tab V2, research signals, confidence.
- **Owns:** `frontend/src/data/tradeClassificationDims.js`, `classificationRegistry.js`,
  `researchGlossary.js`, `fillStateBreakdown.js`, `components/lab/ClassificationBadge.jsx`,
  `components/lab/TermTip.jsx`, `components/lab/MetricChip.jsx` (read), and the Classification
  tab in `pages/RunDetail.jsx`. Phase 2 added `data/researchSignals.js`,
  `components/lab/ConfidenceChip.jsx`.
- **Shared/caution:** `pages/RunDetail.jsx` (huge, frequently dirty), `data/tradeUniverse.js`
  (shared with Strategy Map). Stage deliberately.
- **Next (when resumed):** Signal-Card confidence chips · `sumR2` effect-SE confidence (2b).

## Master Controls / Research Control Plane

- **Status:** active (parallel). **Through Phase 13 — preview consolidation implemented, validated,
  smoke-tested, and committed (D-009).** (Corrects the earlier stale "Phase 7A".)
  Earlier milestones: draft/active config, dirty + rerun-tier classification, preview→run promotion,
  active-vs-preview compare, the four instant Preview Lenses (cost / filter / FFT / RR) + the composed lens.
- **Phase 13 outcome:** the five parallel preview paths (cost / filter / FFT / RR / composed) are collapsed
  into ONE composer-driven path — `composePreviewBundle` is the sole preview builder, with a single preview
  state machine, single Apply path, and single drawer preview card. `previewLens` remains the single
  app-wide read overlay (unchanged); transform math unchanged. Added
  `components/masterControls/__validation__/previewComposer.parity.mjs` (25/25). See `DECISIONS.md` D-009
  and the repo-root `MASTER-CONTROLS-PHASE-13-*` audit/plan docs.
- **Owns:** `components/masterControls/*`, `data/configRegistry.js`, `data/configTranslator.js`.
- **Do not touch** from Classification work.

## Protection Lab / BE

- **Status:** active (parallel). **Selective BE + BE-affected map debug + BE Trade Explorer committed** (`a6b1c09`).
  Selective BE applies BE to a filtered cohort (Original → Selective → Difference, Global BE as reference);
  BE Trade Explorer is a per-trade original-vs-BE drilldown. Derived views only — no BE-calc / replay /
  protection-layer / trade-universe changes. See `DECISIONS.md` D-011.
- **Owns:** `pages/ProtectionLab.jsx`, `components/lab/protection/*` (incl. `BreakevenTab.jsx`,
  `BeTradeExplorer.jsx`, `BeAffectedTradesCard.jsx`), `data/selectiveBeUniverse.js`,
  `data/protectionTimeline.js`, `data/beReplay.js` (+ their validations).
- **Shared/caution:** `pages/StrategyMap.jsx` (BE-affected overlay — coordinate with Strategy Map).

## Storage / Durable Backend Mirror

- **Status:** committed (`ccb240e`). Mirrors research domains (playbook, section roadmaps, configs/presets,
  hypotheses, promotion) to a durable backend via `/storage/{domain}` GET/PUT; localStorage stays the instant
  cache; backend optional (down → local-only); union/newer-wins merge on boot. See `DECISIONS.md` D-012.
- **Owns:** `backend/server.py` (`/storage/{domain}`), `frontend/src/data/backendDomainSync.js`, and the
  mirror hooks in `playbookStore.js` / `roadmapStore.js` / `presets.js` / `usePlaybook.js` / `SectionRoadmap.jsx`
  / `EntryHypothesisLab.jsx` / `PromotionDesk.jsx`.

## Session Lab

- **Status:** active (parallel). Owns `pages/SessionLabV1/*`. Useful reference for session
  derivation (`SESSION_DEFINITIONS`) if Classification needs hour-based "Outside".

## Entry / FFT / Paired Runs

- **Status:** active (parallel). **FFT auto-pair control-run architecture complete** (auto-pairs
  FFT-OFF control trades); **auto-control importer ingestion complete**; FFT classification breakdown
  panel shipped. **Triggered-edge entry-universe expansion shipped** (`6a69ab4`, D-013): trigger
  thresholds → sorted/deduped SET (presets + custom, single-value back-compat); arm delays C0–C3 → C0–C6
  (`tradeUniverse` fill-order d5/d6, `configTranslator`, StrategyBuilder UI). Pairs with the backend C0–C6 change.
- **Owns:** `components/lab/entries/*`, `IntrabarInspector.jsx`, `data/importer.js`
  (auto-control ingestion), `data/configTranslator.js` (TE serialization — coordinate with Master Controls),
  `pages/StrategyBuilder.jsx` (shared — coordinate).

## Strategy Map

- **Status:** active (parallel). Owns `pages/StrategyMap.jsx`, `pages/strategyMap/*`,
  `components/lab/CandleChart.jsx`. Consumes classification badges (read canonical tags).

## OB Retest / Retest Lab

- **Status:** active. Phase 1 retest analysis lab + standalone retest tracker shipped; Phase 2 exporter
  audit done. **v2.1 monetization insights shipped** (`287dfe3`): `obRetestMonetization.js` (RR-capture
  curve, time-to-impact buckets, decay-by-retest) + RetestLabTab RunInsightCard / Monetization Before
  Death. Reward gated to OB-grain cohorts (event-grain hides reward by design). Next: interpret the
  monetization curves — research, not build.
- **Owns:** `data/obRetest.js`, `data/obRetestMonetization.js`, `data/obRetestTradeability.js`,
  `components/lab/retest/*`, `OB-RETEST-ANALYSIS-*.md`.

## Ghost / Backend Research

- **Status:** docs/research. `ghost_tracker*.py`, `GHOST*.md`. Keep isolated from frontend commits.
