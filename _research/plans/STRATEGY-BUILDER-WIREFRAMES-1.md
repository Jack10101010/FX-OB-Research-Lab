## STRATEGY-BUILDER-WIREFRAMES-1

**Type:** Wireframe-only design review (low-fidelity, ASCII). *No implementation, no code, no component
structure, no file plans.*
**Source of truth:** `STRATEGY-BUILDER-UX-AUDIT-1.md`, `STRATEGY-BUILDER-REDESIGN-PLAN-1.md`.
**Architecture under review:** Option B — `Base Strategy → Scenario Overrides → Review & Run`, one route.
**Date:** 2026-06-18 · **Author:** Claude (product architect / UX lead)

> Purpose: visualize the redesign and find UX problems *before* engineering. Boxes show structure and
> flow, not styling. Context: power-user research workstation — users jump between sections constantly;
> this is **not** a beginner wizard.

Legend: `▸` collapsed (summarize-then-expand) · `▾` expanded · `[ ]` control · `(•)` toggle/state ·
`▣` active step/tab · `▢` inactive · `→` navigation/launch.

---

# PART 1 — Step rail design exploration

### Option A — Stepper (linear, numbered, progress arrows)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Create New Backtest                                                               │
│                                                                                    │
│   ①━━━━━━━━━━━━━━━━━━━━━━ ②━━━━━━━━━━━━━━━━━━━━━━ ③                                 │
│   BASE STRATEGY  ▣          SCENARIO OVERRIDES ▢     REVIEW & RUN ▢                 │
│   complete                  ON · 4 overrides         ready                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Pros:** communicates the intended order at a glance; the connector arrows imply "base feeds scenario
feeds run," which matches the mental model the audit wants; per-step status ("complete / 4 overrides /
ready") reads naturally on the rail.
**Cons:** steppers *imply a wizard* — a forward-only, do-this-then-that affordance that fights the
power-user habit of jumping straight to Step 2 or back to tweak one base value. Numbered ①②③ also implies
gating/validation between steps, which we explicitly don't want. Visually heavier.

### Option B — Tabs (flat, equal, free movement)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Create New Backtest                                                               │
│  ┌───────────────┐ ┌────────────────────┐ ┌──────────────┐                        │
│  │ BASE STRATEGY ▣│ │ SCENARIO OVERRIDES ▢│ │ REVIEW & RUN ▢│                       │
│  └───────────────┘ └────────────────────┘ └──────────────┘                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Pros:** flat, non-hierarchical, instant jumping — exactly the power-user pattern; no implied gating or
order; lowest visual weight; familiar from the rest of the app (lab tabs). 
**Cons:** loses the "base → scenario → run" directional cue; bare tabs don't surface per-section state
(is scenario ON? is anything overridden? is a run live?) unless we add it — and without that, the audit's
hidden-relationship problem returns.

### Option C — Hybrid: tabs with inline state/progress indicators (no forced order)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Create New Backtest          EURUSD · M15→1m · 2024-01-01→12-31 · RR 2            │
│  ┌─────────────────────┐ ┌──────────────────────────┐ ┌───────────────────────┐   │
│  │ 1 · BASE STRATEGY  ▣ │ │ 2 · SCENARIO OVERRIDES  ▢ │ │ 3 · REVIEW & RUN     ▢ │  │
│  │ EURUSD · TE C2 · RR2 │ │ (•) ON · 4 overrides     │ │ idle · config ready   │  │
│  └─────────────────────┘ └──────────────────────────┘ └───────────────────────┘   │
│              ↑ free jump between any tab; numerals orient, do not gate              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Pros:** keeps tab freedom (jump anywhere) while the small ordinals (1·2·3) orient newcomers to the
intended flow; each tab carries **live state** — base identity, scenario ON/OFF + override count, run
status — which directly fixes the audit's "users forget what's active in the other section" problem; the
effective identity line sits on the rail so it's visible from every step.
**Cons:** denser than bare tabs; risk of the per-tab status text getting noisy if it tries to say too
much (must stay to ~3 tokens per tab).

### Recommendation — **Option C (Hybrid)**

For a power-user workstation, free movement is non-negotiable, so a true stepper (A) is wrong. But bare
tabs (B) throw away the orientation and cross-section awareness the audit identified as the core problem.
C keeps tab freedom and folds the always-on state (identity + `Scenario ON · N` + run status) into the
rail itself — solving hidden-relationship and cross-step-memory at the navigation layer. The ordinals are
labels, not gates.

---

# PART 2 — Step 1 wireframe · BASE STRATEGY

```
┌══════════════════════════════════════════════════════════════════════════════════┐
║ Create New Backtest                              EURUSD · M15→1m · 2024 · RR 2     ║  ← HERO + identity
║ Configure the base run. Builder writes config only; execution is local Python.     ║
║                                                                                    ║
║ [ 1·BASE ▣ ]  [ 2·SCENARIO  (•)ON · 4 ovr ▢ ]  [ 3·REVIEW & RUN  idle ▢ ]          ║  ← step rail (C)
╠════════════════════════════════════════════════════════════════════════════════════╣
║ CONFIG SCOPE:  Base run · No active preset · Project: (unassigned)   [Load run ▸]   ║  ← config ribbon
╠════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                    ║
║  ┌── SCENARIO SUMMARY (read-only) ───────────────────────────────────────────┐    ║  ← cross-step card
║  │ (•) Scenario Overrides: ON · will be sent with run                         │    ║    (Part 5)
║  │ Global: TE C2 · BE Wick 1R · Target 2R    Exceptions: 4 cohorts / 2 sess.  │    ║
║  │ Portfolio: "London-skew v3" (unsaved edits)                  [ Edit → ]    │    ║
║  └────────────────────────────────────────────────────────────────────────────┘   ║
║                                                                                    ║
║  ▾ RUN IDENTITY & DATA                                                  (expanded) ║
║    Run Name [ EURUSD M15 RR2 2024 ............................... ] [Reset]         ║
║    Symbol [ EURUSD ▾ ]   Detection TF [ M15 ▾ ]   Execution TF [ 1m ▾ ]            ║
║    From   [ 2024-01-01 ] To [ 2024-12-31 ]   Data file [ EURUSD_1m_master.csv ]    ║
║                                                                                    ║
║  ▾ SETUP UNIVERSE                                                       (expanded) ║
║    Included setup types: [✓ Continuation] [✓ Reversal] [ Sweep ] [✓ Mitigation]   ║
║    Structure direction:  [✓ Long] [✓ Short]                                        ║
║                                                                                    ║
║  ▾ ENTRY                                                                (expanded) ║
║    Direction scope [ Symmetric | Asymmetric ]   Assignment [ Single | Per-dir ]    ║
║    Entry model [ Triggered Edge ▾ ]  Presets [10][25][50][75][+custom]             ║
║      Threshold set {10,25,50}   Arm delay [ C2 ▾ (C0–C6) ]                          ║
║      [✓] Retrace cancel   [ ] First-failed-tag cancel                              ║
║                                                                                    ║
║  ▾ EXECUTION                                                            (expanded) ║
║    RR [ 2.0 ]  Entry buf [ 0.5 ]  Stop buf [ 1.0 ]  Verify [ 3 ]                    ║
║    Execution mode [ Multi | Single | One/Dir ]                                     ║
║    Position conflict [ Allow Auto Reversal | Block Opposite ]                       ║
║    If cancelled by conflict [ Kill OB | Allow Resume | Kill If Touched ]            ║
║                                                                                    ║
║  ▾ RESEARCH FILTERS                                                     (expanded) ║
║    Session filtering [✓] origin Any ▾  detection Any ▾   (allowed: London, NY)     ║
║    News blackout [✓] impacts [High][Med]  [✓pause pending][✓block fills][ flatten] ║
║                                                                                    ║
║  ▸ BASE VARIANT SWEEPS                          off · 0 entry views · BE gen: off  ║  ← summarize/expand
║      (expands to: Entry-Depth Sweep + Break-Even Variant Generation)               ║
║                                                                                    ║
║  ▸ ADVANCED                                                       Monte Carlo: off ║  ← summarize/expand
║                                                                                    ║
║                                          [ Continue to Scenario Overrides → ]      ║
└══════════════════════════════════════════════════════════════════════════════════┘
```

**Hierarchy & flow:** identity/data → setup → entry → execution → filters read top-down in causal order
(logic before mechanics). The two "generator" groups (variant sweeps, advanced) collapse to a one-line
effective-state summary so the default screen is scannable, yet every control is one expand away. The
Scenario Summary card sits at the top of Step 1 so the user always sees what overrides are live *before*
editing the base they sit on.

**Expanded by default:** Run identity, Setup universe, Entry, Execution, Research filters.
**Collapsed (summary shown):** Base variant sweeps, Advanced.

#### "Base variant sweeps" — expanded state

```
║  ▾ BASE VARIANT SWEEPS                                                              ║
║    ┌ Entry-Depth Sweep ───────────────────────────────────────────────────────┐   ║
║    │ (•) off    Baseline depth [Edge|25|50|75|100]                             │   ║
║    │            Penetration views: [ ]10 [ ]25 [ ]50 [ ]75   → 0 result views  │   ║
║    └────────────────────────────────────────────────────────────────────────────┘ ║
║    ┌ Break-Even Variant Generation ───────────────────────────────────────────┐   ║
║    │ (•) off    Trigger basis [✓wick][ close]   Arm levels [0.5R][1R][1.5R]    │   ║
║    │            → generates 0 BE variants                                       │   ║
║    └────────────────────────────────────────────────────────────────────────────┘ ║
```

---

# PART 3 — Step 2 wireframe · SCENARIO OVERRIDES  *(most important)*

Design principle made visual: **the overview matrix is read-only; editing is entered by expanding exactly
one cohort row inside it.** There is no second editor anywhere. `PortfolioBar` (library) lives in the
header band; `PortfolioCompare` is a collapsed drawer; the `SessionScenarioBuilder` cohort engine *is* the
in-row expansion; `SessionStrategyCards`' overview/performance *is* the matrix.

```
┌══════════════════════════════════════════════════════════════════════════════════┐
║ [ 1·BASE  ✓ ▢ ]  [ 2·SCENARIO  (•)ON · 4 ovr ▣ ]  [ 3·REVIEW & RUN  idle ▢ ]       ║  ← step rail
╠════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                    ║
║  ┌── SCENARIO STATE & LIBRARY (header band) ─────────────────────────────────┐    ║
║  │ (•) Scenario Overrides  [ ON ]      will be sent with run ✓                 │    ║  ← enable + consequence
║  │ Overrides: 4 cohorts / 2 sessions       Reset all to Global ↺              │    ║
║  │ Portfolio: [ London-skew v3 ▾ ] • unsaved edits   [Save][Save as][Revert]  │    ║  ← PortfolioBar
║  └────────────────────────────────────────────────────────────────────────────┘   ║
║                                                                                    ║
║  ┌── GLOBAL SCENARIO SETTINGS ───────────────────────────────────────────────┐    ║
║  │ Applies everywhere unless a session/cohort overrides it.                   │    ║  ← GlobalCard
║  │ Entry [ TE C2 ▾ ]   Break-Even [ Wick 1R ▾ ]   Target [ 2R ▾ ]             │    ║
║  └────────────────────────────────────────────────────────────────────────────┘   ║
║                                                                                    ║
║  OVERVIEW MATRIX   (read-first; click a row to edit)        Show: [Exceptions ▾]   ║  ← SessionProfileMatrix
║  ┌──────────┬──────────────┬───────────────┬─────────────┬──────────────────────┐ ║
║  │ SESSION  │ ENTRY        │ BREAK-EVEN     │ TARGET      │ STATE / PERF         │ ║
║  ├──────────┼──────────────┼───────────────┼─────────────┼──────────────────────┤ ║
║  │ ▸ London │ TE C2 (glob) │ Wick 1R (glob) │ 3R  ⮜over   │ 2 ovr · +0.4R vs base│ ║  ← collapsed cohort
║  │ ▸ NY     │ TE C1 ⮜over  │ Wick 1R (glob) │ 2R  (glob)  │ 1 ovr · +0.1R        │ ║
║  │ ▸ Asia   │ — disabled — │ —              │ —           │ OFF · takes no trades│ ║  ← disabled cohort
║  │ ▸ Other  │ TE C2 (glob) │ Wick 1R (glob) │ 2R  (glob)  │ all global           │ ║
║  └──────────┴──────────────┴───────────────┴─────────────┴──────────────────────┘ ║
║                                                                                    ║
║  ▸ COMPARE PORTFOLIOS                          (collapsed — expands PortfolioCompare)║
║                                                                                    ║
║                          [ ← Back to Base ]      [ Continue to Review → ]          ║
└══════════════════════════════════════════════════════════════════════════════════┘
```

**`(glob)` = inherits Global · `⮜over` = this cohort overrides the dimension.** State column shows
override count + performance-vs-baseline (the `SessionStrategyCards` Performance capability, surfaced inline
per row).

### Overview → editing: expanding ONE cohort row (the single editing surface)

Clicking a row expands it *in place*; the rest of the matrix stays as context. This is the only place
editing happens.

```
║  ┌──────────┬──────────────┬───────────────┬─────────────┬──────────────────────┐ ║
║  │ ▾ London │ TE C2 (glob) │ Wick 1R (glob) │ 3R  ⮜over   │ 2 ovr · +0.4R vs base│ ║  ← row expanded ▾
║  ├──────────┴──────────────┴───────────────┴─────────────┴──────────────────────┤ ║
║  │  EDIT — London  (4 cohorts: London×{Cont,Rev,Sweep,Mitig})        [Done ✓]   │ ║  ← in-row editor
║  │  ┌ per dimension, resolved against live base ────────────────────────────┐  │ ║
║  │  │ Entry      [ Run Default (= TE C2) ▾ ]                                 │  │ ║  ← Run Default resolved
║  │  │ Break-Even [ Run Default (= Wick 1R) ▾ ]                              │  │ ║
║  │  │ Target     [ 3R ▾ ]   base 2R → 3R                          ⮜override  │  │ ║  ← base → override shown
║  │  └────────────────────────────────────────────────────────────────────────┘  │ ║
║  │  Cohort cells:  [Cont ✓][Rev ✓][Sweep ⚠ unavailable in preview][Mitig ✓]    │ ║  ← availability warn preserved
║  │     ⚠ "Sweep" not in this run's preview export — a backend run can still use it │ ║
║  │  [ Reset cohort ↺ ]   [ Disable cohort ⏻ ]                                   │ ║
║  └──────────────────────────────────────────────────────────────────────────────┘ ║
║  │ ▸ NY     │ ...                                                                 │ ║  ← other rows stay collapsed
```

**Entry into editing is unambiguous:** the only affordance is the row chevron `▸→▾`. There is no separate
"open editor" button, no second panel, no parallel cards. Closing (`Done ✓`) collapses the row back to its
effective-bundle summary. "Run Default (= …)" shows the resolved base value read-only; choosing a concrete
value flips the dimension to `⮜override` and shows `base → override`.

**Collapsed cohort** = one line: Entry • BE • Target effective bundle + state.
**Expanded cohort** = the per-dimension editor + cohort cells + reset/disable, inline.

---

# PART 4 — Step 3 wireframe · REVIEW & RUN

Anchored on the question: *"How do I know exactly what happens when I press Run?"* Everything reads from
the same effective payload the run uses.

```
┌══════════════════════════════════════════════════════════════════════════════════┐
║ [ 1·BASE ✓ ▢ ]  [ 2·SCENARIO (•)ON · 4 ▢ ]  [ 3·REVIEW & RUN  idle ▣ ]             ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║  Run Name [ EURUSD M15 RR2 2024 — London-skew v3 ......................] [Reset]    ║
║                                                                                    ║
║  ┌── BASE STRATEGY SUMMARY ──────────────────┐ ┌── SCENARIO SUMMARY ────────────┐ ║
║  │ EURUSD · M15→1m · 2024-01-01→12-31         │ │ (•) ON · will be sent ✓        │ ║
║  │ Setup: Cont, Rev, Mitig · Long+Short       │ │ Global: TE C2·Wick 1R·2R       │ ║
║  │ Entry: Triggered Edge C2 {10,25,50}        │ │ Exceptions: 4 cohorts / 2 sess │ ║
║  │ Exec: Multi · Auto-Reversal · RR 2.0       │ │  London → Target 3R            │ ║
║  │ Filters: London+NY · News High/Med blackout│ │  NY → Entry TE C1              │ ║
║  │ Sweeps: none · Monte Carlo: off            │ │  Asia → disabled               │ ║
║  └────────────────────────────────────────────┘ │ Portfolio: London-skew v3*     │ ║
║                                                  └────────────────────────────────┘ ║
║                                                                                    ║
║  ┌── EFFECTIVE CONFIGURATION (base + active scenario) ──────────────────────────┐  ║
║  │ This is exactly what will be submitted. 1 base run + scenario block attached. │  ║
║  │ Estimated outputs: 1 baseline + 0 sweep views  ·  scenario cohorts: 4 active  │  ║
║  │ ▸ Show generated config (JSON)        [Copy generated config] [Copy last run] │  ║  ← JSON collapsed
║  └────────────────────────────────────────────────────────────────────────────────┘║
║                                                                                    ║
║  ┌── LOCAL SIDECAR RUN ──────────────────────────────────────────────────────────┐ ║
║  │ Sidecar: ● healthy   Market data: EURUSD ✓ (last candle 2024-12-31)           │ ║
║  │ Status: ▢ idle — ready to run                                                  │ ║
║  │                                            [ ▶ Run Backtest ]   [ Cancel ]     │ ║
║  └────────────────────────────────────────────────────────────────────────────────┘║
║                                                                                    ║
║  (after run) ● Completed → [Open Run] [All Runs] [Strategy Map] [Trade Inspector] ║
║              ▸ Last-run diagnostics    ▸ Trade-sanity strip                         ║
└══════════════════════════════════════════════════════════════════════════════════┘
```

**The answer to "what happens on Run":** two side-by-side summaries (base | scenario) + an explicit
"effective configuration" band that states *"this is exactly what will be submitted"* and whether the
scenario block is attached. JSON and diagnostics stay collapsed so the default review is human-readable;
the run button is the terminal, unambiguous action with health/market-data preconditions shown beside it.

---

# PART 5 — Cross-step orientation cards

Two lightweight, **read-only** cards that travel between steps so neither half is ever out of mind. They
are summaries with a single launch action — never editors.

### Scenario Summary Card (shown on Step 1 and Step 3)

```
┌── SCENARIO SUMMARY (read-only) ──────────────────────────────────────────┐
│ (•) Scenario Overrides: ON · will be sent with run                        │
│ Global: TE C2 · BE Wick 1R · Target 2R                                    │
│ Exceptions: 4 cohorts / 2 sessions    (London·Target 3R, NY·Entry C1, …)  │
│ Portfolio: "London-skew v3"  *unsaved edits                  [ Edit → ]   │
└────────────────────────────────────────────────────────────────────────────┘
                                                              ↑ jumps to Step 2
```

State when off:
```
┌── SCENARIO SUMMARY ──────────────────────────────────────────────────────┐
│ (○) Scenario Overrides: OFF · base config only — nothing extra sent       │
│ 4 overrides exist but are inactive.            [ Turn on ]   [ Edit → ]    │
└────────────────────────────────────────────────────────────────────────────┘
```

### Base Summary Card (shown on Step 2)

```
┌── BASE STRATEGY (read-only) ─────────────────────────────────────────────┐
│ EURUSD · M15→1m · 2024 · RR 2.0                                           │
│ Entry: Triggered Edge C2 {10,25,50} · Multi · Auto-Reversal               │
│ Filters: London+NY · News High/Med           Run Default = this config    │
│                                                          [ Edit base → ]  │
└────────────────────────────────────────────────────────────────────────────┘
                                                              ↑ jumps to Step 1
```

This card directly anchors the Step-2 "Run Default (= …)" resolution: the values the cohort editor
inherits are the values printed here.

---

# PART 6 — Critical UX review *(trying to break it)*

**Confusion points**
- **"Run Default" still carries two meanings.** On the rail/cards it means "the base config"; inside a
  cohort editor it means "inherit (don't override)." A user could read `Target [Run Default (= 2R)]` as
  "the run's default target is 2R" rather than "this cohort doesn't override target." The `(= value)`
  helps but the *word* is doing double duty.
- **Global Scenario Settings vs Base config overlap.** Step 2's "Global: TE C2 · Wick 1R · 2R" can look
  identical to Step 1's base entry/BE/RR. Users may not grasp that Global Scenario is *another* override
  layer sitting between base and cohort — three tiers (base → global-scenario → cohort) is genuinely
  subtle, and the wireframe doesn't yet make the tiering obvious.
- **Performance-in-matrix provenance.** "+0.4R vs base" per row implies a computed comparison; on a fresh
  config with no imported run there's nothing to compare against. The collapsed matrix doesn't show its
  empty/unavailable state, which is exactly where the audit warned drift hides.

**Areas that still feel heavy**
- **Step 1 is still long.** Even with two sections collapsed, five expanded sections + two cards is a tall
  scroll. The premium/minimal goal is only half-met; we traded one long page for one slightly-shorter tab.
- **The matrix row is wide.** Session × {Entry, BE, Target, State/Perf} plus chevrons crowds at desktop
  widths; the 4-cohort cell detail inside London (Cont/Rev/Sweep/Mitig) hints the matrix may actually need
  a session→cohort second level, which the single-row-per-session view hides.

**Navigation risks**
- **Tabs with no gating can mislead about run-readiness.** A user could sit on Step 2, never visit Step 3,
  and miss that market data is stale or the sidecar is down. Preconditions live only on Step 3.
- **"Continue →" buttons re-imply a wizard** even though tabs allow free jumping — mixed signals (flat
  tabs + linear CTAs). Pick one.
- **Edit → / Edit base → cross-jumps can disorient**: jumping from a Step-2 card to Step-1 and back loses
  the user's scroll/expansion position unless state is preserved; easy to get "where was I?".

**Power-user workflow concerns**
- **Repeated runs / sweeps across scenarios.** A power user often wants "run base, then run the same base
  with scenario A, then B." This design has one scenario working copy and one run button — comparing
  scenarios means edit→run→edit→run, with no batch. That may be the single biggest workflow gap.
- **Keyboard / density.** Heavy expanders reward mouse, not keyboard. Power users may want everything
  expanded at once (an "expand all") — forcing summarize-then-expand could slow them down.
- **The matrix hides cohort granularity.** Power users tune *cohorts* (session × structure), not just
  sessions; one row per session buries the cell where the real edge lives.

**Likely to cause rework later**
- **Three-tier resolution (base → global-scenario → cohort)** is the riskiest concept; if the tiering
  isn't crystal clear in the matrix, expect a redesign of the matrix after first user contact.
- **Performance column** invites scope creep (sort, filter, drill) — it's a mini-explorer waiting to
  happen; under-spec'd here.
- **Mixed tab/stepper affordances** (Part 1 C + "Continue" CTAs) will get re-litigated.

---

# PART 7 — Final recommendation

**Preferred design:** **Hybrid rail (Part 1 Option C)** + **Step 2 single-surface matrix with in-row
editing (Part 3)** + **read-only cross-step summary cards (Part 5)**, with two corrections from Part 6
folded in (below).

**Why it's superior**
- It fixes the audit's three core defects directly: one editing surface (no Portfolio/Builder duplication),
  de-overloaded "Scenario," and always-visible cross-section state (rail + cards) so nothing hides.
- It preserves free navigation (tabs) — mandatory for this audience — while adding the orientation a bare
  tab strip lacks.
- The in-row expand model means overview and editing are the *same* object, so "how do I get from overview
  to editing" has a single, obvious answer (the chevron) and can't drift into a second panel.

**Why it fits FX Research Lab specifically**
- Power users jump constantly → tabs, not a wizard. Ordinals orient without gating.
- It's a research workstation → the matrix doubles as a read-first comparison surface (effective bundle +
  performance per cohort), which suits "why did it happen" exploration, not just "what did I set."
- Capability is fully preserved; density relief is structural, not reductive.

**Corrections to adopt before build**
1. **Drop "Continue →" CTAs** (or demote to a quiet link). Tabs + linear CTAs send mixed signals; let the
   rail be the only navigation.
2. **Make the three tiers explicit** in the matrix (visually label base / global-scenario / cohort, or
   rename "Global Scenario Settings" to "Scenario Baseline (all cohorts)") to defuse the riskiest
   confusion.
3. **Add a session→cohort drill** in the matrix so cohort-level tuning isn't buried (one row per session
   collapses; expand to per-structure cells).

**What to validate with users before implementation**
- Do power users read three tiers (base → scenario-global → cohort) correctly, or collapse them mentally?
- Does "Run Default (= value)" read as "inherit" or as "the run's default"? Test the wording.
- Is one scenario working copy + one run button enough, or is **scenario batching / scenario A-vs-B
  comparison** a required workflow? (Highest-risk open question — answer before locking Step 3.)
- Does the matrix's single-row-per-session view hide the cohort granularity researchers actually tune?
- Tabs vs stepper: confirm free-jump is used in practice and the ordinals don't read as gates.
- Empty/no-imported-run state of the Performance column — confirm it degrades clearly.

*No code, components, or file plans are included by design. This is UX architecture, wireframes, and
review only. No repository files were modified other than this document.*
