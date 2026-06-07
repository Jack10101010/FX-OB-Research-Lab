# WORKSTREAMS.md — registry

> AI-memory view of parallel workstreams. The repo-root `WORKSTREAMS.md` carries the
> git-level "currently dirty files" detail; re-verify with `git status --short`.
> Attach to a workstream (or add one) before coding. Never touch another stream's files
> without explicit scope.

*Last updated: 2026-06-07.*

## Trade Classification  ← PRIMARY (this memory system's focus)

- **Status:** active.
- **Lead:** Claude (design/UX/frontend); Codex for data/test.
- **Purpose:** fill-state taxonomy, Classification Tab V2, research signals, confidence.
- **Owns:** `frontend/src/data/tradeClassificationDims.js`, `classificationRegistry.js`,
  `researchGlossary.js`, `fillStateBreakdown.js`, `components/lab/ClassificationBadge.jsx`,
  `components/lab/TermTip.jsx`, `components/lab/MetricChip.jsx` (read), and the Classification
  tab in `pages/RunDetail.jsx`. Phase 2 adds `data/researchSignals.js`,
  `components/lab/ConfidenceChip.jsx`.
- **Shared/caution:** `pages/RunDetail.jsx` (huge, frequently dirty), `data/tradeUniverse.js`
  (shared with Strategy Map). Stage deliberately.
- **Next:** Research Signals engine + Confidence layer (Phase 2).

## Master Controls / Research Control Plane

- **Status:** active (parallel). Phases 4A/4B shipped; promotion (4C) later.
- **Owns:** `components/masterControls/*`, `data/configRegistry.js`, `data/configTranslator.js`.
- **Do not touch** from Classification work.

## Session Lab

- **Status:** active (parallel). Owns `pages/SessionLabV1/*`. Useful reference for session
  derivation (`SESSION_DEFINITIONS`) if Classification needs hour-based "Outside".

## Entry / FFT / Paired Runs

- **Status:** active (parallel). Owns `components/lab/entries/*`, `IntrabarInspector.jsx`,
  `pages/StrategyBuilder.jsx` (shared — coordinate).

## Strategy Map

- **Status:** active (parallel). Owns `pages/StrategyMap.jsx`, `pages/strategyMap/*`,
  `components/lab/CandleChart.jsx`. Consumes classification badges (read canonical tags).

## OB Retest / Retest Lab

- **Status:** new. Owns `data/obRetest.js`, `components/lab/retest/*`, `OB-RETEST-ANALYSIS-*.md`.

## Ghost / Backend Research

- **Status:** docs/research. `ghost_tracker*.py`, `GHOST*.md`. Keep isolated from frontend commits.
