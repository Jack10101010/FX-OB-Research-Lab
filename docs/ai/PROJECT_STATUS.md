# PROJECT_STATUS.md — AI memory snapshot

> Canonical AI-coordination snapshot. The repo **root** `PROJECT_STATUS.md` is the
> git-coordination doc (dirty files, commits ahead). This one is the product/research
> state. Verify against live git before trusting it.

*Last updated: 2026-06-11.*

## Project

**FX-OB-Research-Lab** — React frontend research lab for studying order-block (OB)
trading behavior via large-scale backtests. Backend: `Lux-OB-Backtester` (Python).
Branch: `codex-dev`. Theme: dark "neon lab" (do not change without request).

## Current major workstream

**Failures Lab V5 — decision layer.** V4 cleanup + V5 Phase 1 (Filter Discovery) shipped.
V5 Phase 2 (confirmed false losers, frontend) + Phase 2B (Overview IA) built and validated;
Phase 2B commit pending. Live data path waits on the Lux-OB-Backtester post-stop export.
(Classification Tab V2 is paused with Phase 2 shipped.)

Parallel state (all committed): **Master Controls Phase 13** (single composer-driven preview;
`previewLens` still the single read path), **Protection Lab selective BE / BE Trade Explorer**,
**Phase 14 Wave 1 terminology**, and the **Storage durable backend mirror**. OB-Retest remains active
under its own stream.

## Completed

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
- **Failures Lab V5 Phase 2 + 2B (frontend)** — `buildConfirmedFalseLosers` classifies losers
  confirmed/candidate/genuine (reached ≥1R or hit original TP / ≥0.5R / never) with cohort
  breakdowns + horizon; importer maps the 5 `post_stop_*` fields dual-keyed; field-gated with a
  candidates fallback (`failuresFalseLosers.validate.mjs` 30/30). **Phase 2B IA:** Confirmed False
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
- **Distance importer mapping** — `price_distance_from_ob_at_arm_pips` (NOT yet in `importer.js`);
  then the **Distance-at-arm breakdown**. *(next candidate)*
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
- Detailed plans live at repo root: `CLASSIFICATION-TAB-V2-PLAN.md`,
  `FILL-STATE-TAXONOMY-2-IMPLEMENTATION-PLAN.md`, `CLASSIFICATION-TAB-AAE-V2-PLAN.md`,
  `AAE-DEEP-ANALYSIS-1/2.md`, plus this Phase-2 audit.
