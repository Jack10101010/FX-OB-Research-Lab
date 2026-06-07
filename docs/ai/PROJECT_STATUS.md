# PROJECT_STATUS.md — AI memory snapshot

> Canonical AI-coordination snapshot. The repo **root** `PROJECT_STATUS.md` is the
> git-coordination doc (dirty files, commits ahead). This one is the product/research
> state. Verify against live git before trusting it.

*Last updated: 2026-06-07.*

## Project

**FX-OB-Research-Lab** — React frontend research lab for studying order-block (OB)
trading behavior via large-scale backtests. Backend: `Lux-OB-Backtester` (Python).
Branch: `codex-dev`. Theme: dark "neon lab" (do not change without request).

## Current major workstream

**Trade Classification / Classification Tab V2.**

## Completed

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

Key commits (codex-dev): `4715513` feat(classification): add fill-state V2 tab;
`acdf4d7` / `6c8fc60` migrate consumers to flag-based suppression; `d68d237` add fill state
glossary and derivation.

## Active / next

- **Research Signals engine** (auto-surface strongest +/- findings) — designed, plan ready.
- **Confidence layer** (Very Low / Low / Medium / High) — designed, plan ready.
- **TE variant naming cleanup**.
- **Distance importer mapping** — `price_distance_from_ob_at_arm_pips` (NOT yet in `importer.js`).
- **Distance breakdown** (blocked on the importer mapping above).
- **Model family comparison**.
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
