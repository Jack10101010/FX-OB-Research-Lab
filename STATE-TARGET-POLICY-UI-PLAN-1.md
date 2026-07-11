# Market State Target Overrides — Architecture Audit + Implementation Plan (Plan 1)

**Audit first — findings, then the plan. Nothing modified before this document.**

## 1. Architecture audit

| Piece | Where | Finding |
|---|---|---|
| CohortTargetOverrides | `frontend/src/data/cohortTargetOverrides.js` (pure model, 361 ln) + `components/lab/portfolio/CohortTargetOverrides.jsx` (panel, 243 ln), rendered in `StrategyBuilderV2.jsx:1312` | Another session's (idle, uncommitted) Phase-1 work — and it is EXACTLY the right foundation: canonical 24-cohort axis, the requested target ladder (`TARGET_OPTIONS` = 0.5–1.0 by 0.1, then 1.25–5.0 by 0.25), normalize/serialize/reverse-serialize, PM action lookup + warnings, pre-launch `buildRunSummary`. **Reuse, never duplicate.** |
| Serialization chokepoint | `configTranslator.buildCohortScenarioConfig(cfg)` → `buildSessionStrategyScenario(cfg)` → `session_strategy_scenario` | One function emits the scenario. Gate discipline proven: OFF ⇒ `{}` ⇒ byte-identical run. `meta` block already rides through engine-ignored. |
| Target override execution path | `Lux src/execution.py` `_build_cohort_index` (~1679) parses cohort rules (enabled / target.rr / be / move-stop / risk_amount); fill-gate block (~2770) applies COHORT_DISABLED then recomputes tp/rr | The natural extension point. Gate order at fill is ALREADY: regime filter → **PM gate** → **cohort enabled/disabled** → target/BE overrides → execute. State Target Policy slots between the disable check and the target recompute. |
| PM interaction | `_portfolio_policy_block_row` runs BEFORE the cohort block; PM never reads scenario | Separation already structural. State policy must NOT touch PM — it only needs read-only PM policy for UI warnings (`cohortPmAction`, `POLICY_STATE_RULES` already exist). |
| Engine state resolution | `_regime_state_for_candle(candle, emit)` reads a prebuilt daily panel index (`_portfolio_panel_index` / `regime_emit_for_run`) | Reusable as-is: build a `state_policy_emit` {index, threshold} once per run when any cohort has actionable state overrides — same leakage-safe panel, no new math. |
| Market State lens / SessionResults / Management drilldown | `data/marketStateLens.js`, `SessionResults.jsx` (TargetPolicyMatrix, state selector, drilldown) | Matrix + deep-link + per-state Management already exist from Phase 1; the new matrix upgrades CELL CONTENT (evidence) and reuses the same `openCohortAtState` deep-link. NO new analytics page. |
| Ladder / rescore engine | `data/sessionResults.js cohortTargetEconomics` (+ tags Best/Conservative/Current) | Validated native-exact (Addendum 2). Add-only: plateau score (ported from the study), Base-target tag, era panel. |

**Cleanest home:** state overrides are a NESTED, OPTIONAL extension of the existing
`session_strategy_scenario` cohort rule — one new key `state_overrides` per cohort —
consumed by the existing cohort fill-gate. No new PM classes, no new execution path,
no parallel scenario system.

## 2. Contract

Scenario cohort (additive, absent ⇒ byte-identical):
```json
{ "session":"newYork","structure":"BOS","direction":"Short","target":{"rr":2},
  "state_overrides": {
     "Bull/Expand":  {"mode":"custom","rr":4.0},
     "Bear/Chop":    {"mode":"block"},
     "Bull/Chop":    {"mode":"research","rr":0.6},
     "Bear/Expand":  {"mode":"inherit"} } }
```
Execution semantics (fill gate, AFTER PM and AFTER cohort-enabled, using the
leakage-safe CONFIRMED state for the fill day):
- `inherit` / `research` / absent / Unlabelled / unconfirmed → cohort base target
  (research is provenance-only; **never invents labels, never executes**);
- `custom` → tp/rr recomputed from the state rr (same formula as the cohort target);
- `block` → new missed outcome `STATE_BLOCKED` (reason `state_target_block`),
  market-state provenance stamped, the candidate simply removed from the execution
  population (no capacity interaction under allow_multi_position) — visually and semantically distinct
  from PM blocks (REGIME_BLOCKED) and scenario disables (COHORT_DISABLED).
Execution order therefore stays: Candidate → PM → Cohort enabled → State resolve →
State Target Policy → Final target → Execute.

## 3. Build order

1. **Backend** (`execution.py` + `run_backtest.py`): parse `state_overrides` in
   `_build_cohort_index` (actionable only when any custom/block); `state_policy_emit`
   built once per run when actionable; gate insert; `STATE_BLOCKED`; regime columns
   emitted when active; pytest `test_state_target_policy.py` (byte-identity off,
   inherit/custom/block/research, Unlabelled inherits, PM-first ordering).
2. **Frontend model** `data/stateTargetOverrides.js` (pure): 6-state axis reusing
   `MARKET_STATES` + `COHORTS` + `TARGET_OPTIONS`; normalize; per-row ops (copy base,
   reset, enable/disable passthrough); `mergeStateOverridesIntoScenario(scenario,cfg)`;
   reverse-parse; `buildStateSummary` (144-cell counts + PM-conflict warnings via
   `POLICY_STATE_RULES`: STATE_ONLY ⇒ chop cells never execute; DIRECTION_AWARE ⇒
   counter-trend cells never execute).
3. **Serialization**: one additive merge inside `buildCohortScenarioConfig` (single
   line-block in configTranslator; delegates to the untouched cohort serializer; OFF ⇒
   unchanged output).
4. **Strategy Builder panel** `components/lab/portfolio/MarketStateTargetOverrides.jsx`
   directly below CohortTargetOverrides (one import + one JSX line in V2): 24 rows ×
   (Base + 6 states), 4-mode cell (Inherit/Custom RR/Block/Research), ladder select,
   row actions, PM action chip + warnings, pre-launch resolved summary. OFF by default
   (`cfg.stateOverridesEnabled`).
5. **Session Results — State Policy Matrix**: upgrade TargetPolicyMatrix cells to
   compact evidence (n, executed/override target or BLOCK, Net R, badge) computed
   lazily on open from the lens buckets + `cohortTargetEconomics` + the RUN's own
   scenario `state_overrides` + draft store; same click-through to the existing
   drilldown.
6. **Drilldown additions**: native stats header (n/W/L/WR/PF/NetR/MaxDD/streak),
   PM-blocked + STATE_BLOCKED counts, source file (provenance line exists); ladder +
   plateau score, Δ vs executed (existing Δ Current), highlights for executed / cohort
   base / best / conservative; always-visible 4-era panel; evidence badges
   NATIVE / RESCORE / BASE / INSUFFICIENT / NOT TESTED.
7. **Draft research layer** `data/statePolicyDrafts.js` (localStorage, run-agnostic
   keyed `cohort|state`): {suggestedTarget, block, confidence, notes, status:
   Inspect/Candidate/Confirmed/Rejected/Applied, evidence kind}. Editor in the
   drilldown state view; badges in the matrix; explicit **Apply confirmed drafts**
   action in the Strategy Builder panel (drafts → cell modes, drafts marked Applied).
   Draft state never feeds execution except through that explicit apply.
8. **Validators**: `stateTargetOverrides.validate.mjs`, `statePolicyDrafts.validate.mjs`,
   matrix/drilldown wiring checks, backend pytest; full FX + Lux regression sweeps.

## 4. Risks / guards

- `configTranslator.js` + `StrategyBuilderV2.jsx` carry the idle uncommitted WIP of the
  other session → edits limited to one additive block + one insertion line each;
  everything else lives in NEW files.
- 144 econ computations render lazily (matrix open / drilldown only).
- STATE_BLOCKED rows must not leak into frontend Executed buckets (classifyTrade routes
  unknown outcomes to cancelled/missed — verified in validator).
- Byte-identity proofs: backend pytest (scenario without state_overrides ⇒ identical
  `_build_cohort_index`) + frontend validator (serializer OFF ⇒ output identical to the
  cohort-only serializer).

---

## STATUS (2026-07-11): IMPLEMENTED + VALIDATED (not committed, not pushed)

- Backend: `state_overrides` parsed in `_build_cohort_index`; `state_policy_emit_for_run`
  wired at all 7 emit sites; gate inserted AFTER PM + cohort-enable (STATE_BLOCKED /
  custom rr / inherit; Unlabelled+unconfirmed always inherit); REGIME columns emitted
  when active. `tests/test_state_target_policy.py`: 8 tests incl. byte-identity,
  parsing gates, PM-first ordering — 138 targeted Lux tests green.
- Frontend model: `data/stateTargetOverrides.js` (normalize/serialize/round-trip/
  summary/PM-conflict warnings) + additive merge inside `buildCohortScenarioConfig`
  (guarded; OFF ⇒ same reference) + reload round-trip in the translator restore block.
- Strategy Builder: `MarketStateTargetOverrides.jsx` below Cohort Target Overrides —
  24×6 four-mode cells, canonical ladder, per-row Copy base / Enable-Disable (shared
  cfg source of truth), PM action chips, per-cell "PM blocks" flags, pre-launch
  resolved summary (cohorts/cells/inherit/custom/block/research/PM mode/warnings),
  "Apply N confirmed drafts" action. OFF by default.
- Session Results: State Policy Matrix cells now show compact evidence (decided n,
  EXECUTED policy incl. state overrides/BLOCK, native Net R, NATIVE/INSUFFICIENT/
  NOT TESTED/BLOCK badge, ✎ draft glyph) → existing drilldown deep-link unchanged.
- Drilldown: NativeStatsStrip (n/W/L/NF/WR/PF/NetR/MaxDD/longest streak/PM-blocked/
  state-blocked/source file/executed target), always-visible 4-era panel, RESCORE
  badge + plateau score on the ladder, ● Executed / ◇ Base / ★ Best / ◆ Conservative
  highlights, Δ vs executed target.
- Draft research layer: `data/statePolicyDrafts.js` (localStorage; statuses Inspect/
  Candidate/Confirmed/Rejected/Applied; native/rescore evidence tag; notes) + editor
  in the drilldown; the ONLY bridge to execution is the explicit apply action.
- Validators: `stateTargetOverrides.validate.mjs` + `statePolicyDrafts.validate.mjs`
  (incl. STATE_BLOCKED never counted as executed) — ALL PASS; full FX sweep green
  except the two known pre-existing unrelated failures (playbookStore import bug,
  portfolioManagerWiring v1.1-vs-v1.2 WIP drift).

---

## CORRECTIONS ADDENDUM (2026-07-11, architecture review) — IMPLEMENTED

1. **Slot semantics removed.** All "slot freed" wording in execution.py / tests /
   docs reworded to "removed from the execution population (no capacity interaction
   under allow_multi_position; single-position accounting unchanged)". No logic ever
   assumed slot release (audited). New pytest `test_state_blocked_zero_side_effects`:
   blocking one cohort×state leaves every other trade BYTE-IDENTICAL.
2. **Drafts scoped by STRATEGY SIGNATURE** `instrument|detection_tf|family|threshold|
   delay|variant` (e.g. `EURUSD|15min|triggered_edge|25|d3|allow_multi_position`).
   Store v2 (`fxob.statePolicyDrafts.v2`); one-time v1 migration into the TE25-C3
   signature (the only universe v1 drafts existed under), scoped-wins dedupe, drafts
   marked `migrated`. Session Results derives the signature from the ACTIVE universe;
   the Strategy Builder from its own cfg (canonical translator mappings) — listings,
   counts, badges and apply are all signature-scoped, so research can never leak
   across strategies. The editor displays the universe.
3. **Lifecycle**: Inspect → Candidate → Confirmed → Added to Run → Native Validated
   → Approved → Deployed, + Rejected (terminal side-state, from anywhere; re-open →
   Inspect). Transitions guarded in the store (one step forward/back only); the
   editor offers only legal moves; apply advances Confirmed → "Added to Run" (honest:
   copied into config, NOT validated). Legacy "Applied" migrates to "Added to Run".
4. **Research out of execution config.** The scenario serializer emits ONLY
   inherit(implicit)/custom/block; "Research Only" panel cells are a panel-local
   visual bookmark that never serializes (backend also drops legacy "research" keys
   defensively). All research metadata lives exclusively in the scoped draft layer.
   Justification for keeping the panel mode at all: a visible per-cell bookmark while
   configuring, with zero execution footprint (validated: research-only panel ⇒
   scenario reference-identical).
5. **Evidence clarity.** New per-state Evidence Summary in the drilldown: Executed
   target · Native result (NATIVE badge) · Draft recommendation ("draft · not
   deployed") · Rescore estimate at the draft target (RESCORE badge) · Native
   confirmation (Available / Not yet tested, driven by evidence=native or lifecycle
   ≥ Native Validated). Badges are structurally distinct; rescore can never render
   as native.

Validation: statePolicyDrafts.validate.mjs rewritten (scoping/leaks, lifecycle order
incl. refused jumps, honest apply, migration semantics, refusals, UI distinctness,
STATE_BLOCKED-not-executed regression); stateTargetOverrides.validate.mjs updated
(research never serializes; research-only ⇒ reference-identical scenario). Full FX
sweep green except the two known pre-existing unrelated failures; Lux suite 124
passed. Nothing committed or pushed; PM behaviour untouched.

---

## SB-V2 CONSOLIDATION (2026-07-11) — IMPLEMENTED (not committed, not pushed)

**Redundancy verdicts (reported pre-implementation):** standalone Cohort Target
Overrides panel removed (module kept as serializer; base targets edit in the merged
Target Policy panel); include-disabled demoted to an internal research-override note;
target-panel Block moved to eligibility; Session Strategy grid NOT redundant (BE/
move-stop/risk-amount/fair-baseline + supersedes-scenario behaviour) → Advanced/
Legacy with an explicit warning; Global MS Gate → Advanced Research.

**Eligibility schema v2** per scenario cohort: `eligibility:{base:"allow"|"disable",
states:{state:"allow"|"block"}}` + legacy `enabled` mirror + meta provenance
(schema/preset/counts). Engine (`_build_cohort_index` + fill gate): NEW explicit
order — Candidate → PM → resolve confirmed state (only when state rules exist) →
eligibility (state allow RESCUES inside a disabled cohort; state block disables
inside an enabled one; Unlabelled/unconfirmed → base) → target (state custom else
base) → execute. Rescued fills carry `state_eligibility="rescued"` (new column,
imported + shown in Session Results next to PM-blocked / cohort-disabled /
state-blocked). Legacy state_overrides blocks unify into eligibility at parse time.
`eligibility.base` supersedes a contradicting legacy `enabled`.

**UI:** Trade Eligibility panel (PM Off/Label/Enforce as one control — label mode now
serializable, fixing the discovery-run gap; presets Deployed PM / All Cohorts
Research / Custom; resolved summary that NAMES what the deployed PM disables;
24×(base+6) custom editor with PM decision column, effective eligibility, and
"PM ENFORCE still blocks this rescued state" warnings). Target Policy panel =
editable Base column + per-state Inherit/Custom only. Page: Setup → Global Strategy
→ Advanced/Legacy Session Strategy → Trade Eligibility → Advanced Research MS Gate →
Target Policy → Resolved Run Summary (ENTRY/ELIGIBILITY/TARGETS/MANAGEMENT/DATA +
conflict warnings incl. dead targets under resolved eligibility).

**Compatibility:** reload restores PM enabled/mode/include-disabled exactly; legacy
enabled-only scenarios stay under the legacy model (eligibility restores only when
the key exists); everything OFF ⇒ byte-identical emission (reference-equality
validated).

**Validation:** backend `test_eligibility_policy.py` (rescue-in-one-state, others
stay disabled, exact-state block, Unlabelled-base, PM-first no-bypass, uncensored
all-research, legacy byte-identity/supersede) — 139 Lux tests green;
`eligibilityPolicy.validate.mjs` (items 7-12 frontend) + all prior suites — FX sweep
green except the two known pre-existing unrelated failures (playbookStore import
bug, portfolioManagerWiring v1.1-vs-v1.2 WIP drift). Deployed PM policy untouched.
