# PROJECT_STATUS.md — AI memory snapshot

> Canonical AI-coordination snapshot. The repo **root** `PROJECT_STATUS.md` is the
> git-coordination doc (dirty files, commits ahead). This one is the product/research
> state. Verify against live git before trusting it.

*Last updated: 2026-07-01 (synced after Market State / Regime Gate Phase 0 commit + Phase 1 build).*

> **⚠ Git reality (2026-07-01, authoritative):** `codex-dev` HEAD is `9856023`
> (`feat(regime): add client market state foundation`), **1 commit ahead of `origin/codex-dev`**
> (unpushed; push gated). Recent real history: `20d31ae` import-UX + chronological trade
> numbering, `d729223` fair baseline comparison, `1b7cb82` session-first scenario compiler,
> `b2c7cd6` timing & regime lab foundation. **The "shipped/pushed to `origin` at `96fc733`",
> "15 commits ahead at `fe71537`", and Research-Cockpit / Failures-Lab-V5 focus described below
> are STALE** — those commits are not in the current git history. Treat the sections below as
> unverified history until each owning stream re-syncs.

## Project

**FX-OB-Research-Lab** — React frontend research lab for studying order-block (OB)
trading behavior via large-scale backtests. Backend: `Lux-OB-Backtester` (Python).
Branch: `codex-dev`. Theme: dark "neon lab" (do not change without request).

## Current major workstream

**Market State / Regime Gate (2026-07-01).** Promoting the validated EMA200 / Bollinger-width /
ADX regime engine out of research code into the app. **Phase 0 foundation committed** (`9856023`)
— pure `data/marketState.js` (leakage-safe, golden-parity-exact vs `rich_features.pkl` over
2015→2026: state 3566/3566), `regime` registry group (off by default), `buildRegimeConfig`
(byte-identical when disabled). **Phase 1 UI built (uncommitted)** — registry-driven Market State
section in Strategy Builder V2 + per-trade snapshot card in TradeInspector; presentation-only.
Deferred: Phase 2 Master Controls filter lens, Phase 3+ engine emission/filter/sweep. See
`CURRENT_WORKSTREAM.md`, `WORKSTREAMS.md`, and `DECISIONS.md` D-017. *(The Failures-Lab-V5 text
below is retained history and is stale vs current git — see the git-reality note above.)*

**Failures Lab V5 — decision layer.** V4 cleanup + V5 Phase 1 (Filter Discovery) shipped.
V5 Phase 2 (confirmed false losers) + Phase 2B (Overview IA) **live end-to-end (verified 2026-06-12)** —
the backend `post_stop_*` export shipped, the importer maps it, and the Overview panel renders the real
confirmed/candidate/genuine breakdown ("6 confirmed of 32 losses · model `fixed_horizon` · horizon 50").
**Not waiting on any backend export.** Remaining work is research interpretation, not export/import.
(Classification Tab V2 is paused with Phase 2 shipped.)

**Shipped 2026-06-12 (was pushed to `origin/codex-dev` at `96fc733`) — next focus is interpreting these,
not more plumbing:** Distance-at-arm consumption (`449dc58`, D-014), Triggered-edge entry-universe
expansion (`6a69ab4`, D-013), OB-Retest v2.1 monetization insights (`287dfe3`), Failures Lab Loser
Run-Up breakdown (`2004d28`), and two build-integrity fixes (`7eeb596`, `96fc733`). See Completed.

**⚠ Origin state (2026-06-13):** `codex-dev` is now **15 commits ahead of `origin/codex-dev`** and is
**NOT pushed**. The unpushed range (`origin/codex-dev..HEAD`, HEAD `fe71537`) includes the Failures-Lab
V5 loss-triage drilldown series (`1b7b17e`…`6a03912`), the OB Lab Insights synthesis layer (`abc5be5`),
and the two Research Cockpit commits (`b500e36`, `fe71537`). Push is gated — needs approval.

Parallel state (all committed): **Master Controls Phase 13** (single composer-driven preview;
`previewLens` still the single read path), **Protection Lab selective BE / BE Trade Explorer**,
**Phase 14 Wave 1 terminology**, and the **Storage durable backend mirror**. OB-Retest remains active
under its own stream.

## Completed

- **Research Cockpit — Phase 1** (`b500e36`; D-015) — new read-only page at `/cockpit` (distinct from
  `/insights` saved findings) sitting **above** the labs. Pure selector `data/runInsights.js`
  (`buildRunInsights`) over already-computed analytics (`researchSignals`, `lossTriage`
  triage/BE-verdict/sinkholes, `distanceBreakdown`) → ranked static insight cards. No new metric, no new
  threshold (mirrors `TRIAGE_LOW_SAMPLE_N` / `EXPLORER_LIFT_HIGHLIGHT`), no persistence, no backend.
  Validator `runInsights.validate.mjs`; route + Sidebar nav added. Additive-only frontend.
- **Research Cockpit — V2.0A category command-centre** (`fe71537`; D-015) — upgraded the thin card list
  into a command centre: Action Queue (cross-category top-N, hurting/opportunity first) + topic sections
  **Sessions/Timing · Direction · Structure · Loss Clusters** + an "Other signals" catch-all preserving
  Phase-1 cards. New producers reuse existing pure helpers (`buildSessionBreakdown`, `buildLoserRunUp`
  cohort groups, `buildExplorer`). **Fix:** loss-cluster lift now comes from `buildExplorer` (true
  winners-inclusive lift) — the Phase-1 lift card was dormant because `buildFailureDrivers`/`buildPairDrivers`
  over losers-only return `lift=1`. Pure view fns `buildActionQueue` / `groupByTopic`; validator 60/60;
  build + SSR verified (populated / low-sample / no-run). Deferred: BE/FFT/TP/Entry/OB sections, cluster
  map, deep links, Save-Findings reuse (see BACKLOG).
- **OB Lab Insights synthesis layer** (`abc5be5`) — Order Block Insights synthesis layer (separate stream;
  committed locally in the same unpushed window).
- **Distance-at-arm — frontend consumption** (`449dc58`; D-014) — `importer.js` maps
  `price_distance_from_ob_at_arm_pips`; RunDetail renders the signed distance breakdown (occupied=0 /
  edge / 2–5 / 5–10 / 10+ pips), TE-only gated. **Enables in-app F-004 validation; F-004 stays provisional.**
- **Triggered-edge entry-universe expansion** (`6a69ab4`; D-013) — trigger thresholds are a
  sorted/deduped SET (presets 10/25/50/75 + custom; single-value back-compat); arm delays C0–C3 → C0–C6.
  configTranslator serialize + round-trip, tradeUniverse fill-order d5/d6, StrategyBuilder UI. Pairs with
  the backend C0–C6 candle-delay change. Validated (`beConfigSerialization` +6 TE cases).
- **OB-Retest v2.1 monetization insights** (`287dfe3`) — pure `obRetestMonetization.js` (RR-capture
  curve, time-to-impact buckets, decay-by-retest, summary) + 38-case logictest; surfaced in RetestLabTab
  (RunInsightCard + Monetization Before Death). Reward shown for OB-grain cohorts only (event-grain hides
  reward by design). Also repaired a dangling `obRetestMonetization.js` import already in HEAD.
- **Failures Lab — Loser Run-Up breakdown** (`2004d28`) — Trade Outcome & Loser Run-Up panel/tab:
  loser MFE (max-R-reached before losing) + ≥0.5/1/1.5/2R reach counts across direction / structure /
  session cohorts; gated to a clear unavailable state when no loser carries `mfe_r`. Validated (36 cases).
- **Build-integrity fixes** (`7eeb596`, `96fc733`) — committed `BeVerificationPanel.jsx` /
  `BannerRunIdentity.jsx`, referenced by tracked imports but never tracked (built locally, broke a clean clone).
- **Storage — durable backend mirror** (`ccb240e`) — research domains (playbook, section roadmaps,
  configs/presets, hypotheses, promotion) mirror to a durable backend via `/storage/{domain}` GET/PUT;
  localStorage stays the instant cache; backend optional (down → local-only); union/newer-wins merge on
  boot. No persisted-key/identifier changes. Decision `D-012`.
- **Protection Lab — selective BE + BE Trade Explorer** (`a6b1c09`) — selective BE applies BE to a filtered
  cohort under an Original → Selective → Difference framing (Global BE as reference); BE Trade Explorer is a
  per-trade original-vs-BE drilldown; BE-affected trades highlighted on the Strategy Map. Derived views only —
  no BE-calc / replay / protection-layer / trade-universe change. Decision `D-011`.
- **Phase 14 Wave 1 — research run terminology** (`e9d03aa`) — shared banner cluster aligned to the Phase 14
  model: Active Run→Run, Result View→Model/View, Position Variant→Position Mode, Current Result View→Current
  View. Display-only; identifiers/persisted keys unchanged; smoke-tested. Decision `D-010`. (Phase 14 is NOT
  complete — Wave 1 only; Wave 2 residual sweep is in `BACKLOG.md`.)
- **Master Controls Phase 13 — preview consolidation (frontend)** — collapsed the five parallel preview
  paths (cost / filter / FFT / RR / composed) into ONE composer-driven path: `composePreviewBundle` is the
  sole builder, with one preview state machine, one Apply path, and one drawer preview card. `previewLens`
  remains the single app-wide read overlay (unchanged); transform math unchanged. Added
  `__validation__/previewComposer.parity.mjs` (25/25); cost / filter / RR / FFT-unavailable / multi-stage /
  run-switch / apply-exit / cross-page all verified in the live app. Decision `D-009`. Committed.
- **Failures Lab V5 Phase 2 + 2B (frontend) — LIVE end-to-end (verified 2026-06-12)** —
  `buildConfirmedFalseLosers` classifies losers confirmed/candidate/genuine (reached ≥1R or hit original
  TP / ≥0.5R / never) with cohort breakdowns + horizon; importer maps the 5 `post_stop_*` fields
  (`post_stop_mfe_r` / `post_stop_reached_original_tp` / `post_stop_bars_to_1r` / `post_stop_lookahead_bars`
  / `post_stop_model`) dual-keyed (`failuresFalseLosers.validate.mjs` 30/30). The active imported run
  carries these fields, so the panel renders **live** (not the candidates fallback, which is the no-data
  path for older runs). **Phase 2B IA:** Confirmed False
  Losers moved Views & Export → **Overview**; new **Global Failure Explorer** (whole-run, valid-
  universe gated) on Overview; Distance-to-Stop explorer relabelled **MFE Bucket Explorer** (logic
  unchanged via parametrised `FailureExplorer`); Views & Export trimmed to exports + saved views +
  a pointer. No Protection Lab / OB-Retest / Master Controls / `roadmapStore` / `SectionRoadmap`
  changes. Analytics + validate committed on host; the 5 Phase 2B UI files are commit-pending.
- **Fill-state taxonomy** — canonical states: `occupied_at_arm`, `vacant_at_arm` (parent),
  `aae`, `vacant_no_aae`, `unknown_at_arm`. `deriveFillState()` is authoritative;
  `obOccupiedAtArm` decides the parent, `armedAfterObExit` only subdivides Vacant.
- **Research glossary** — `researchGlossary.js` (friendlyName / definition / whyItMatters).
- **`deriveFillState` + fields** — `fill_state`, `fill_state_parent`, `fill_state_is_anomaly`
  on `buildTradeClassification()`.
- **Tag normalization** — `ob_not_occupied → vacant_no_aae`, `clean → occupied_at_arm` aliases;
  `muteAsBadge` flag; all consumers migrated off hardcoded `"clean"` guards.
- **Classification Tab V2** — Signal Cards, Fill-State Breakdown (parent/child tree),
  Session Breakdown, Entry Model Breakdown; Entry Context table removed (Fill State replaces it).
- **Glossary tooltips** — `TermTip.jsx` over Radix; wired on headers, columns, rows, cards.
- **Pure data layer** — `fillStateBreakdown.js` (`buildFillStateBreakdown` / `buildSessionBreakdown`
  / `buildSignalCards`) + validation script.
- **Research Signals + Confidence engine** — `researchSignals.js` (`computeConfidence` →
  Very Low/Low/Medium/High; signal ranking; low-sample suppression; parent/child dedup). Pure,
  validated (37 assertions), committed.
- **Research Signals UI** — `researchGlossary` keys + `ConfidenceChip.jsx` + the Research Signals
  section (Strongest Edges / Key Risks) at the top of the Classification panel (`b3a200e`).
- **Entry-model clarity + Enabled Variant Comparison** — TE C0–C3 labels; in-tab Enabled Variant
  Comparison (all enabled entry-model variants from `entryResults.tradesByMode`, read-only),
  importer dual-key dedup + baseline-label fix, and a **Max DD** column from per-variant
  `entryResults.equityCurveByMode`.

- **Failures Lab V4 (June 8–10)** — Overview command center, shared aggregation engine,
  Failure Explorer (3 scopes, refine-by-dimension, persisted prefs, verdict action chips),
  Distance to Stop tab: loser MFE reach, BE opportunity (cumulative + exclusive, upper-bound
  framing), winner MAE stop pressure (to-original-exit + fallback provenance), MAE/MFE by
  dimension, penetration dimension, distance insights. Key commits: `0b5e499` overview,
  `649e200` shared engine, `19e8470` explorer + BE table, `dae7bfd` MFE reach, `ac5e070` MAE
  stop pressure, `880d67d` penetration + verdict engine, `c30486c` MAE by dimension.
  **Final integration cleanup implemented (commit pending):** tab wiring, roadmap deps,
  alias detection, NUL→`\u001F` separator, verdict chip UI.

Key commits (codex-dev): `4715513` feat(classification): add fill-state V2 tab;
`acdf4d7` / `6c8fc60` migrate consumers to flag-based suppression; `d68d237` add fill state
glossary and derivation.

## Active / next

- **Failures Lab V4 cleanup commits** — hand scoped commits to host, then **pause Failures Lab**.
- **Pivot decision** — Master Controls vs Protection Lab as next focus (Session Lab has no momentum).
- **Research Signals polish** — (optional) confidence chips on Signal Cards; (Phase 2b) `sumR2`
  accumulators → true effect-SE confidence. *(paused with Classification)*
- **UI Explainability Audit** — tooltips / plain-English descriptions across screens (one shared
  dark tooltip style via `TermTip`/`GlossaryCard`). *(next candidate)*
- **Distance importer mapping + breakdown** — **SHIPPED** (`449dc58`, D-014). Next on this thread is
  the signed `distance_band` research (occupation-depth), see `BACKLOG.md` P2 — research, not plumbing.
- **Model Family Comparison (full, cross-run)** — deferred; the in-tab Enabled Variant Comparison
  is the compact first step. *(next candidate: planning)*
- **Save findings / research library**.

## Important research findings

> Canonical home: `FINDINGS.md` (F-001…F-005), with run evidence in `EXPERIMENTS.md`. Summary:

- **OB Vacant At Arm is the PRIMARY signal** (~ +0.89R avg).
- **AAE is a child of Vacant At Arm** (~ +0.59R), not the headline.
- `vacant_no_aae` is the other Vacant child; `occupied_at_arm` ≈ +0.08R baseline.
- **Outside session is a danger condition** (~ −1.0R, ~0% WR).
- **Distance < 2 pips is weak/negative**.
- **Timing/expiry is low priority** (AAE fills land within ~4 min of OB exit).

## Environment / coordination notes

- Multiple agents edit `codex-dev` in parallel — never `git add .`; stage only your files.
- Sandbox git can create but not unlink `.git/index.lock` (mount EPERM) → commit on host.
- Detailed plans live at repo root: `_research/plans/CLASSIFICATION-TAB-V2-PLAN.md`,
  `_research/plans/FILL-STATE-TAXONOMY-2-IMPLEMENTATION-PLAN.md`, `_research/plans/CLASSIFICATION-TAB-AAE-V2-PLAN.md`,
  `AAE-DEEP-ANALYSIS-1/2.md`, plus this Phase-2 audit.
