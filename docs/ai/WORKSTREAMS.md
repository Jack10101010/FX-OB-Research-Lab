# WORKSTREAMS.md — registry

> AI-memory view of parallel workstreams. The repo-root `WORKSTREAMS.md` carries the
> git-level "currently dirty files" detail; re-verify with `git status --short`.
> Attach to a workstream (or add one) before coding. Never touch another stream's files
> without explicit scope.

*Last updated: 2026-07-01.*

## Market State / Regime Gate  (client + engine label emission COMPLETE; Phase 4 filter in progress)

- **Status:** **Client complete & committed** — Phase 0 (`9856023`), Phase 1 UI (`03c0bc9`,
  `fae2135`), **Phase 2 Strategy Map overlays (`e6e9fbb`)**. Off by default, byte-identical when
  disabled; golden parity vs `rich_features.pkl` exact (3566/3566). **Backend:** Phase 3a
  (`f6740c6`, config accepts `regime_*`), **Phase 3b (`3de2b2a`)** compute-only `src/regime.py` +
  frozen fixture (byte-identical, same SHA256) + parity test (4/4), **Phase 3c (`e935ce6`)**
  engine-side per-trade **label emission** (`enrich_trades_with_market_state`; canonical columns
  appended only in enabled label mode; no-op/byte-identical when off; label-only, no filtering);
  verified 20/20. **Phase 4 (filter mode) is IN PROGRESS / UNCOMMITTED** — do not stage without
  approval + baseline-parity proof. See `DECISIONS.md` D-017 and `CURRENT_WORKSTREAM.md`.
- **Lead:** Claude (design / research port / frontend + Python engine port).
- **Owns (frontend):** `frontend/src/data/marketState.js`, `frontend/src/data/useMarketState.js`,
  `frontend/src/data/executionMarkers.js`, `frontend/src/data/__validation__/marketState.validate.mjs`,
  `frontend/src/data/__validation__/executionMarkers.validate.mjs`,
  `frontend/src/data/__fixtures__/marketState.fixture.json` (frozen parity fixture),
  `frontend/src/components/lab/marketState/*`, the `regime` group in `data/configRegistry.js` +
  `buildRegimeConfig`/`mapRegimeTimeframe` in `data/configTranslator.js`, `MARKET_STATE_COLORS` /
  `marketStateColor` in `lib/chartStyles.js`, and the Market-State overlay/execution-marker hunks of
  `pages/StrategyMap.jsx` + `components/lab/CandleChart.jsx`. Design refs (repo root):
  `ui_market_state_audit.md`, `market_state_config_design.md`, `backend_market_state_design.md`,
  `strategy_map_overlay_design.md`, `strategy_map_market_state_overlay_notes.md`, `regime_spec.md`,
  `implementation_plan.md`.
- **Owns (backend):** Lux-OB-Backtester `src/regime.py` (`3de2b2a`), `tests/regime/*` (fixture +
  `fixture_gen.py`, `4f86366`), `tests/test_regime_parity.py`, and the Phase-3c label-emission hunks
  in `src/execution.py` + `scripts/run_backtest.py` + `tests/test_regime_emission.py` +
  `tests/test_regime_config.py` (`e935ce6`). **Source of truth = the JS engine + frozen fixture.**
  Label emission is compute+annotate only — no filtering, no execution change; disabled ⇒ byte-identical.
- **Phase 4 (filter) — uncommitted, under audit:** dirty `src/execution.py` (`_regime_filter_blocks`,
  `REGIME_BLOCKED`), `scripts/run_backtest.py`, `tests/test_regime_config.py`,
  `tests/test_regime_emission.py`; untracked `tests/test_regime_filter.py`. This is a real behaviour
  change — **do not stage until approved**, and only with a baseline-parity proof (disabled/label runs
  byte-identical). Untracked leftover: `tests/regime/regime_duplication_inventory.csv` (audit artifact).
- **Shared/caution:** `pages/TradeInspector.jsx` (regime snapshot card). `StrategyMap.jsx` /
  `CandleChart.jsx` are AGENTS hotspots co-owned with the Strategy Map stream — overlay hunks only.
- **Next (deferred):** P4 backend filter mode (first real strategy change; in-progress), P5 scenario
  sweep, P2 Master Controls instant-filter lens.

## Portfolio / Deployment Framework  (ACTIVE STRATEGIC DIRECTION — not yet started)

- **Status:** **Newly canonical strategic programme** (see `ROADMAP.md` + `DECISIONS.md` D-018).
  Replaces per-trade feature mining, which is exhausted (F-006/F-007). Five sequenced phases:
  **P1 Portfolio Manager · P2 Cohort Intelligence · P3 Edge Monitor · P4 Decision Engine ·
  P5 Execution Layer.** No phase implemented yet; Market State backend Phase 3b lands first.
- **Lead:** Claude (design/architecture) + Codex (data/test).
- **Existing seeds to EXTEND (do not build parallel systems):** the untracked **Edge Attribution /
  Run Intelligence** layer (`frontend/src/data/edgeAttribution.js`, `components/lab/EdgeAttributionTab.jsx`,
  `edgeAttribution.validate.mjs`) already computes per-cohort "worth trading" labels/flags — a natural
  **Cohort Intelligence (P2)** seed. The **session-first / portfolio compare** layer
  (`portfolioCompare`/`targetRescore`/`payloadWiring` validators, `sessionStrategy*`) is a **Portfolio
  Manager (P1)** seed. Prefer additive enhancement of these over replacement (AGENTS Existing Explorer
  Protection).
- **Owns:** TBD as phases are scoped. Design refs (repo root): `EDGE-ATTRIBUTION-*.md`,
  `_research/plans/LIVE-TRADING-CONTROL-TOWER-ARCHITECTURE-AUDIT.md`.
- **Note:** Edge Attribution + session-first/portfolio validators are currently **untracked dirty
  work** owned by their originating streams; register + commit them under their own scoped commits
  before folding into this programme.

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
  `pages/FailuresLab.jsx`. Design refs: `_research/plans/FAILURES-LAB-V4-ARCHITECTURE-AUDIT-1.md`,
  `FAILURES-LAB-V2-*`, `_research/audits/FAILURES-LAB-UX-AUDIT-1.md`.
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

## Research Cockpit (COCKPIT-1 → V2.0A)

- **Status:** Phase 1 + V2.0A **shipped (committed, not pushed)**; paused pending push approval / next
  phase. **Phase 1** (`b500e36`) — top-level read-only Research Cockpit at `/cockpit` surfacing ranked
  insight cards from existing pure analytics. **V2.0A** (`fe71537`) — upgraded the thin card list into a
  *category command-centre*: Action Queue + topic sections (Sessions/Timing, Direction, Structure, Loss
  Clusters) + an "Other signals" catch-all, reusing only the safest single-run helpers. **Loss-cluster
  lift now uses `buildExplorer`** (true winners-inclusive lift); the Phase-1 lift card was dormant
  because `buildFailureDrivers`/`buildPairDrivers` over losers-only return `lift=1`. See `D-015`.
  Pure selector `buildRunInsights(inputs)` keeps its flat semantic-ordered contract; V2.0A adds a
  `topic` tag per card plus two pure view fns (`buildActionQueue`, `groupByTopic`) + `COCKPIT_TOPICS`.
  Still no new metric, no new threshold (mirrors `TRIAGE_LOW_SAMPLE_N` / `EXPLORER_LIFT_HIGHLIGHT`),
  no persistence, no backend, no deep-link plumbing. Design refs:
  `_research/plans/RUN-INSIGHTS-COCKPIT-DESIGN-AUDIT-1.md`, `_research/audits/RESEARCH-COCKPIT-V2-INSIGHT-CATEGORIES-AUDIT-1.md`.
- **V2.0A categories (this slice):** Sessions/Timing (`buildSessionBreakdown` + `buildContextSinkholes`),
  Direction & Structure (`buildLoserRunUp` cohort groups), Loss Clusters (`buildFailureDrivers` +
  `buildPairDrivers`). Phase-1 cards (BE verdict, distance-at-arm, fill-state signals) kept working,
  routed to an "Other signals" catch-all + the Action Queue. **Explicitly deferred:** Protection BE/FFT
  *sections*, Optimal TP, Entry Model, Order Blocks/Retest, cluster map, deep links, Save Findings,
  cross-run stability.
- **Lead:** Claude (design/analytics/frontend).
- **Owns:** `frontend/src/data/runInsights.js`,
  `frontend/src/data/__validation__/runInsights.validate.mjs`,
  `frontend/src/pages/ResearchCockpit.jsx`, and the `/cockpit` route line in `frontend/src/App.js`
  + the one Research Cockpit nav entry in `frontend/src/components/lab/Sidebar.jsx`.
- **Do NOT touch:** backend / exporters / candle-data pipeline / BE-matrix restructure / any lab
  internals / `pages/Insights.jsx` (saved-findings page) / the store / persistence. Consumes the
  per-lab pure helpers as read-only outputs; never reaches into a lab's render state.
- **Shared/caution:** reads (does not modify) `data/researchSignals.js`, `data/lossTriage.js`,
  `data/fillStateBreakdown.js`, `data/distanceBreakdown.js`, `data/loserRunUp.js`,
  `components/lab/failures/shared/excursionAnalytics.js`, `data/projectWorkflow.js`.
- **Next (V2.1+, not started):** cluster map panel (2-D explorer reuse); then deep-link params +
  Save-Finding reuse (`source: "research_cockpit"`); BE/FFT/TP/Entry/OB categories; V3 backend items
  after BE-matrix parity.

## Ghost / Backend Research

- **Status:** docs/research. `ghost_tracker*.py`, `GHOST*.md`. Keep isolated from frontend commits.
