# STRATEGY-BUILDER-REDESIGN-PLAN-1

**Type:** Concrete redesign plan (Option B) — *plan only, no implementation, no code changes.*
**Source of truth:** `STRATEGY-BUILDER-UX-AUDIT-1.md`.
**Target:** `/strategy` (`pages/StrategyBuilder.jsx`) + the Session Scenario / Session Strategy
Portfolio system.
**Chosen architecture:** **Option B — three in-page steps:** `Base Strategy → Scenario Overrides →
Review & Run`, on one route, single shared state, all controls preserved.
**Date:** 2026-06-18 · **Branch:** `codex-dev` · **Author:** Claude (product architect / UX lead)

> **Design intent:** minimal, premium, fast, coherent. Density relief comes from *structure +
> summarize-then-expand*, never from hiding power-user controls. Every control in today's page survives
> the move. Nothing here is implemented; this is a build-ready specification for review.

---

## 0 · Shape of the redesign

One route (`/strategy`), one `cfg`/`sidecarConfig` base-state object, one `sessionProfiles` working copy.
A persistent **step rail** (3 steps) replaces the current long single scroll. Steps are *navigation over
the same page state* — switching steps never resets or submits anything. The run action and the
"effective config" are computed identically to today (`buildSidecarPayload`); only the surface changes.

```
┌─────────────────────────────────────────────────────────────┐
│  Create New Backtest        [ 1 Base ] [ 2 Scenario ] [ 3 Run ]│  ← step rail (always shows
│  EURUSD · M15→1m · 2024-… · RR 2     Scenario: ON · 4 overrides │     effective identity + scenario state)
└─────────────────────────────────────────────────────────────┘
   Step body (one step visible at a time; all controls live, none removed)
```

Persisted globally across all steps (the hero/identity strip): symbol · TF · date span · RR ·
**Scenario state chip** (`isProfilesActive` + `countOverrides`) · `ConfigScopeRibbon` · run status. This
is the one piece of "always-on" context that fixes the audit's hidden-relationship finding.

---

## PART 1 — Proposed page structure

### Step rail (always visible)
`1 · Base Strategy` → `2 · Scenario Overrides` → `3 · Review & Run`. The rail shows, at all times, the
effective identity (symbol/TF/dates/RR) and the live **Scenario: ON/OFF · N overrides** chip. Free
navigation between steps (not a locked wizard) — power users jump around.

### STEP 1 — Base Strategy
Everything that defines the single base run. Sub-sections (each a `BuilderFocusCard`, default-expanded
unless noted):

| Sub-section | Current controls moved in (verbatim, nothing dropped) | Default state |
|---|---|---|
| **Run identity & data** | Run Name (+auto-name/reset), Symbol, Detection TF, Execution TF, From, To, Data Source File | Expanded |
| **Setup universe** | Included Setup Types, structure-direction filters (from "Setup Universe Filter") | Expanded |
| **Entry** | Direction Scope, Entry Assignment, Entry Model (+presets, per-model params), Retrace Cancel, First-Failed-Tag Cancel | Expanded |
| **Execution** | RR Multiple, Entry/Stop Buffer, Verify Limit, Execution Mode, Position Conflict, If-Cancelled-by-Conflict | Expanded |
| **Research filters** | Session Filtering, News Blackout (impacts, pause pending, block fills, flatten) | Expanded |
| **Base variant sweeps** | "Scenario Batch" (baseline depth + penetration result views) **+** exact-BE generation (Trigger Basis, "Generate exact BE for", arm-levels × trigger-bases) — *relocated here from Filters/Entry*, renamed per Part 3 | **Summarize-then-expand** (collapsed to a one-line "off / N variants" summary; expands to full controls) |
| **Advanced** | Monte Carlo | Summarize-then-expand |

Two IA corrections realized here: **BE generation leaves "Filters"** (it is variant generation, not a
research filter) and **joins the entry-depth sweep** under one "Base variant sweeps" group; **Entry moves
above Execution** so logic reads before mechanics, and crucially *above* the Scenario step that overrides
it.

**Stays visible by default in Step 1:** identity/data, setup universe, entry, execution, research
filters. **Summarize-then-expand:** base variant sweeps, advanced (Monte Carlo). Collapsed summary always
states the effective state ("BE generation: off", "Entry-depth sweep: 3 views") so nothing is hidden —
it's one click to full controls.

### STEP 2 — Scenario Overrides
The unified Session Scenario workspace (Part 2). One framed surface, one vocabulary. Replaces *both*
today's pos-5 `SessionStrategyCards` and pos-9 `SessionScenarioBuilder`.

**Stays visible by default:** enable toggle + state, Global Scenario Settings, the session/cohort matrix
overview, the effective-vs-base resolution. **Summarize-then-expand:** individual cohort editors (a cohort
row collapses to its effective bundle; expands to the Entry/BE/Target editor), the named-portfolio library
panel, and the compare panel.

### STEP 3 — Review & Run
Read-first confirmation + execution (Part 5). Base summary + scenario summary + effective config / JSON +
sidecar run status & controls.

**Stays visible by default:** base summary, scenario summary, run status, run button. **Summarize-then-
expand:** raw generated-config JSON (collapsed behind "Show generated config"), last-run diagnostics,
trade-sanity strip.

---

## PART 2 — Session Scenario redesign (unify into one workspace)

### What each current surface contributes (so nothing is lost)
- **`SessionScenarioBuilder`** already has the *editing engine*: enable toggle (`setScenarioEnabled`),
  Global Scenario Settings card (`setGlobalDefaultValue`), "Use Global for all sessions"
  (`resetAllToGlobal`), per-cohort `CohortCard` with Edit/Reset/Enable/Disable
  (`setCohortValue`/`resetCohort`/`setCohortEnabled`), "Run Default" leave-as semantics, and the
  "unavailable in preview — backend can still run it" availability warning. **This is the spine.**
- **`SessionStrategyCards` + `PortfolioBar` + `SessionProfileMatrix` + `PortfolioCompare`** add four
  capabilities the builder lacks: **named portfolio library** (save / load / revert), **Performance after
  overrides** (vs baseline control), **portfolio overview matrix** (Global · Exceptions · Performance),
  and **compare saved portfolios**. **All four must be preserved.**

### The unified "Scenario Overrides" workspace (one component, one model)
Both already read/write the **same `sessionProfiles` working copy** via `buildEffectivePortfolioMap` —
unification is a *presentation* merge, not a data migration. Proposed single layout:

1. **Header band** — enable toggle + status (see "enabled/disabled" below) + override count
   (`countOverrides`) + portfolio library controls (save/load/revert, from `PortfolioBar`) + "what will
   be sent" line.
2. **Global Scenario Settings** — the global Entry/BE/Target defaults (from `GlobalCard`), each shown
   resolved against the live base (see "Run Default" below).
3. **Overview matrix** — Global · Exceptions · Performance (from `SessionStrategyCards` /
   `SessionProfileMatrix`); rows are sessions/cohorts; this is the read-first scan.
4. **Cohort editing** — expand any cohort row in-place to the Entry/BE/Target editor (the `CohortCard`
   engine). One editor, reached from the matrix — **no second editing surface.**
5. **Compare** (summarize-then-expand) — `PortfolioCompare` for saved-portfolio diffing.

### Surfacing enabled / disabled state
- **Step rail chip (global):** `Scenario: ON · 4 overrides` / `Scenario: OFF`, driven by
  `isProfilesActive(profiles)` + `countOverrides(profiles)`. Visible on every step, fixing the audit
  finding that enable lived only inside one editor.
- **Workspace header (local):** the existing `setScenarioEnabled` toggle, plus an explicit
  "**Will be sent with run / Not sent — base config only**" line mirroring `buildSidecarPayload`'s
  `profiles.enabled === true` gate, so the user sees consequence at the point of editing.
- **Per-cohort:** keep the existing Enabled/Disabled/Custom/Global state chips; a disabled cohort keeps
  its "takes no trades" note.

### Showing "Run Default" resolved against the live base
Today the override UI shows the literal token "Run Default" without the value it resolves to, forcing the
user to remember Step-1 choices. Fix: render **"Run Default (= <resolved base value>)"** beside each
dimension, computed from the live `cfg`/`sidecarConfig` (Entry model from `selectedEntryModel`/directional
config, BE from base BE settings, Target from `cfg.rr`). When a cohort overrides a dimension, show
`base → override` inline. This requires passing the live base into the workspace (it already receives
`runRr`; extend to the full resolved base) — a read-only prop, no new state.

### Avoiding duplicate editing surfaces
- **One editor only:** cohort editing happens in the unified workspace's expandable rows. Delete the
  separate pos-5 vs pos-9 split entirely.
- **The matrix is read-first;** editing is reached by expanding a row, never by a parallel editor.
- See Part 4 for the dedicated `/session-portfolio-preview` route disposition.

---

## PART 3 — Naming cleanup

**Rule:** "**Scenario**" is reserved exclusively for the session/cohort override layer (Step 2). Base-run
variant generators must not use the word.

| Today | Problem | Proposed final UI label |
|---|---|---|
| "Session Scenario" (builder) / "Session Strategy Portfolio" (cards) | two names, one system | **"Scenario Overrides"** (step) · workspace title **"Session Scenario Overrides"** |
| "Scenario Batch" (entryMode = research; penetration/depth result views) | collides with session scenarios | **"Entry-Depth Sweep"** (or "Entry Variant Sweep") · sub-items: "Baseline depth", "Penetration views" |
| "Generate exact BE for" + "BE scenario count" | "scenario" overload; lives under Filters | **"Break-Even Variant Generation"** (grouped under "Base variant sweeps", out of Filters) |
| "Scenario will be sent" (hero chip) | fine, but tie to new vocab | **"Scenario Overrides will be sent"** / step-rail `Scenario: ON` |
| Group label for the two sweeps | none today | **"Base Variant Sweeps"** (Step 1 sub-section) |

Internal identifiers, persisted keys, payload field names (`session_strategy_scenario`, `entryMode`,
`beArmLevels`, etc.) **do not change** — this is display-label only, to avoid breaking saved presets,
portfolios, and round-trips. (Mirrors the D-010 display-only-rename precedent.)

---

## PART 4 — Session Strategy Portfolio disposition

**Decision: replace the embedded full Portfolio *editor* with the unified Step-2 workspace; do not keep a
second full editor.** The Portfolio's *capabilities* (library, performance, matrix, compare) are absorbed
into the Step-2 workspace (Part 2), so nothing is lost — only the duplicate editing surface is removed.

**Is a summary card still needed?** Yes — but on **Step 1 and Step 3**, not as an editor:

**Summary card contents (read-only, launches into Step 2):**
- Scenario state: `ON / OFF` (`isProfilesActive`).
- Global strategy bundle: Entry • Break-Even • Target (from `resolveControlSummary(bundle, profiles)`).
- Exceptions: count of overridden cohorts (`countOverrides`) — e.g. "4 cohorts overridden across 2
  sessions".
- Loaded portfolio name, if any (`getLoadedPortfolio()`), + dirty/unsaved indicator.
- "Will be sent with run" status line.
- A single **"Edit scenario →"** action that switches to Step 2. No editing inside the card.

**Dedicated `/session-portfolio-preview` page:** today it is a *Preview*-badged route that simply renders
`SessionStrategyCards`. Two acceptable end-states:
1. **Retire it** once Step 2 is the canonical workspace (preferred for "one editor" coherence); keep a
   redirect to `/strategy` (Step 2) so the nav entry/bookmarks don't 404.
2. **Repurpose it** as a *standalone* Scenario workspace for users who want to author scenarios outside a
   build — but only if it renders the **same unified component** as Step 2 (no third variant). 

Given the power-user, single-operator context, **Option 1 (retire + redirect)** is the minimal, coherent
choice unless cross-build scenario authoring becomes a real need. Either way: **never three surfaces.**

---

## PART 5 — Review & Run step

Read-first confirmation that the run reflects exactly what was configured (base + active scenario),
followed by execution. Contents top-to-bottom:

1. **Run identity** — Run Name (editable here too), symbol · TF · date span · RR. Effective, not raw.
2. **Base strategy summary** — compact read-only recap of Step 1: setup universe, entry model + direction
   scope, execution mode/conflict, active research filters (session/news), and any **base variant sweeps**
   ("Entry-Depth Sweep: 3 views", "BE Variant Generation: 4 variants"). Derived from `cfg`/`sidecarConfig`
   + `estimateScenarioPlan(sidecarConfig)` (already used for the generated plan).
3. **Scenario override summary** — the Part-4 summary card in full: ON/OFF, global bundle, exception
   count, loaded portfolio, "will be sent" status. Mirrors `buildSidecarPayload`'s
   `session_strategy_scenario` gate so the review *is* the truth.
4. **Generated config / JSON access** — collapsed "Show generated config" → the existing Generated Config
   panel + "Copy Generated Config" / "Copy Last Run JSON" (today's Sanity section), showing the exact
   `buildSidecarPayload()` output (with the scenario block when enabled).
5. **Local sidecar run** — the existing run controls + status pill (`runStatusLabel`/`runStatusTone`),
   run/cancel, lazy-import status, and post-run actions (Open Run / All Runs / Strategy Map / Trade
   Inspector). Plus health/market-data status (`getSidecarHealth`, `getMarketDataStatus`).

Principle: Step 3 **reads from the same `buildSidecarPayload`** the run uses — review and execution can
never diverge (preserves today's "single source of truth" comment intent).

---

## PART 6 — Implementation risk audit

### Files likely involved
- **`pages/StrategyBuilder.jsx`** (2,816 lines) — primary surface change: introduce step rail, regroup
  `BuilderFocusCard`s into 3 steps, relocate BE-generation out of Filters, host the summary card + Review
  step. **Largest edit.**
- **`components/lab/sessionProfiles/SessionScenarioBuilder.jsx`** — becomes (or is absorbed into) the
  unified Step-2 workspace spine.
- **`components/lab/sessionProfiles/SessionStrategyCards.jsx`** — its library/performance/matrix/compare
  capabilities fold into the unified workspace; component likely refactored or decomposed.
- **`components/lab/sessionProfiles/PortfolioBar.jsx`** (currently dirty, +20) — named-library controls
  reused in the workspace header. **Coordinate with its in-flight change.**
- **`components/lab/sessionProfiles/SessionProfileMatrix.jsx`, `PortfolioCompare.jsx`** — reused as
  overview/compare panels.
- **`pages/SessionPortfolioPreview.jsx` + `App.js` route + `Sidebar.jsx` nav** — retire/redirect or
  repurpose (Part 4).
- **Read-only / no behavior change expected:** `data/sessionProfiles.js`, `data/scenarioCompile.js`,
  `data/store.js` (`getSessionProfiles`/`setSessionProfiles`/`getLoadedPortfolio`), `data/presets.js`,
  `data/sidecarClient.js`. The plan deliberately reuses `isProfilesActive`, `countOverrides`,
  `resolveControlSummary`, `buildEffectivePortfolioMap`, `compileScenarioToRunConfig`,
  `estimateScenarioPlan`, `buildSidecarPayload` **as-is**.

### Shared / hotspot files (coordinate before editing)
- **`StrategyBuilder.jsx` is a declared shared/coordinate file** owned by the **Entry / FFT / Paired
  Runs** stream (`WORKSTREAMS.md`). Any restructure is cross-stream — coordinate to avoid contaminating
  their TE C0–C6 / entry-universe work. **Highest coordination risk.**
- **`PortfolioBar.jsx` is currently dirty** (uncommitted +20). Land or rebase that change first; don't
  stage the redesign on top of unclassified dirty work (pre-implementation classification gate).
- `App.js` and `Sidebar.jsx` are app-wide; route/nav edits must stay surgical.
- Not hotspots here, but note `RunDetail.jsx` hosts the `SessionResults` tab — **out of scope**, do not
  touch.

### State / data-contract risks
- **Single-model invariant:** both editors already share the `sessionProfiles` working copy; the merge
  must keep **one** read/write path (`setSessionProfiles` + the pure write helpers). Risk = accidentally
  introducing a second local copy during refactor → divergent edits. Validate that the matrix, cohort
  editor, and library all reflect one source.
- **Payload parity (critical):** `buildSidecarPayload` must remain byte-identical to today when
  `profiles.enabled === false` (plain run), and attach the same `session_strategy_scenario` block + meta
  when enabled. Re-sequencing UI must not change *what* is compiled.
- **"Run Default" resolution:** feeding the live base into Step 2 for resolved display must be **read-
  only**; it must not write base values into the overrides (a "Run Default" must stay null/unset, not get
  materialized to a concrete value) — otherwise saved scenarios silently freeze the base.
- **Preset / portfolio persistence:** display-label renames (Part 3) must not touch persisted keys,
  profile ids, or `session_strategy_scenario` fields; existing saved presets and named portfolios must
  still load and round-trip.
- **Step navigation ≠ submission/reset:** switching steps must preserve all in-progress edits and never
  trigger a run; the run remains an explicit Step-3 action.
- **Availability gating:** preserve the "unavailable in preview — backend can still run it" warning;
  don't let the new resolution logic suppress legitimately-unavailable-but-runnable settings.

### Browser validation checklist (post-implementation — AGENTS.md live-UI requirement)
Verify in the running app (not from diff/build alone):
- **Default state:** fresh `/strategy`, Scenario OFF → Step 3 generated config is byte-identical to a
  pre-redesign plain run (payload parity).
- **One override:** set a single cohort Entry/BE/Target override → step-rail chip shows `ON · 1`, summary
  card + Review reflect it, payload contains the `session_strategy_scenario` block.
- **Portfolio loaded:** load a named portfolio → library state, performance, exceptions, and "will be
  sent: <name>" all correct.
- **Scenario disabled with overrides present:** overrides exist but enable = OFF → chip `OFF`, Review says
  "not sent — base only", payload omits the scenario block.
- **Run Default resolution:** each dimension shows "Run Default (= <base value>)"; changing a Step-1 base
  value updates the resolved display in Step 2 without altering stored overrides.
- **Empty / unavailable:** no run imported (preview unavailable) → availability warnings render; controls
  still allow configuring a backend run.
- **Step navigation:** edit in Step 2, jump to Step 1 and back → edits intact, no run triggered.
- **All base controls present:** every Step-1 control (incl. collapsed sweeps + Monte Carlo) is reachable
  in one expand — confirm nothing was dropped.
- **Run execution path:** actual sidecar run from Step 3 starts, status pill updates, post-run actions and
  import work as before.
- **Typography gate:** run the AGENTS.md grep (`font-mono`, `tracking-widest`) → 0 hits.

---

## Capability-preservation statement (required for UI work)

- **Preserved:** all Step-1 base controls (identity/data, setup universe, entry incl. cancels, execution,
  session + news filters, entry-depth sweep, BE variant generation, Monte Carlo); all scenario editing
  (enable, global defaults, per-cohort Entry/BE/Target, enable/disable/reset); named portfolio library,
  performance, overview matrix, compare; generated-config/JSON access; full sidecar run + import flow.
- **Added (proposed):** 3-step rail, always-on scenario state chip, base-resolved "Run Default" display,
  unified single-editor Scenario workspace, summary card launch point, de-overloaded naming, Review step.
- **Removed:** nothing functional. Only the **duplicate** editing surface (two editors → one) and,
  optionally, the redundant `/session-portfolio-preview` route (retire + redirect) — both pending
  approval.
- **Beginner-optimization:** none. No advanced control removed, gated behind a beginner flow, or buried
  more than one expand deep. Progressive disclosure is summarize-then-expand only.

*No code, config, or doc files were modified by this plan. The only file written is this document.*
