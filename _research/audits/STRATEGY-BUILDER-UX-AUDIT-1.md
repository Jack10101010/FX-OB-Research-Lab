# STRATEGY-BUILDER-UX-AUDIT-1

**Type:** Senior-product-designer UX / information-architecture audit — *audit only, no code changes.*
**Scope:** `frontend/src/pages/StrategyBuilder.jsx` (`/strategy`, 2,816 lines) and the Session
Scenario / Session Strategy Portfolio system it now hosts.
**Date:** 2026-06-18 · **Branch:** `codex-dev` · **Author:** Claude (product architect / UX lead)

---

## 0 · Repository-state pre-audit (required before any work)

### 0.1 Project identity (verified against live git, not docs)

- **Repository:** `FX-OB-Research-Lab` (remote `github.com/Jack10101010/FX-OB-Research-Lab.git`).
- **Purpose:** React frontend research workstation for studying order-block (OB) trading behavior
  via large-scale backtests; Python backend is `Lux-OB-Backtester`. Dark "neon lab" theme.
- **Current branch:** `codex-dev`.
- **Active worktree:** single worktree at repo root on `codex-dev` (HEAD `6f5b649`). No secondary
  worktrees.

Identity matches FX-OB-Research-Lab / Lux-OB-Backtester trading-research infrastructure. **Proceeding.**

### 0.2 Current project status

The work actually in flight — the last six commits — is the **Session Scenario + Session Strategy
Portfolio** system (`6f5b649` … `ff9d663`). This is **the most recent and least-documented system in
the repo**: it is absent from every `docs/ai/` governance file. The governance docs still describe the
prior focus (Research Cockpit V2.0A / Failures Lab V5 decision-layer) and are materially stale (§0.5).

`codex-dev` is **6 commits ahead of `origin/codex-dev`, 0 behind**. The entire unpushed range *is* the
session-scenario series. Push is gated per AGENTS.md.

> Sandbox note: a stale `.git/index.lock` is present and the sandbox cannot unlink it (known mount
> restriction). Any *actual* staging/commit must be executed on the host. This audit performs no git
> writes, so it is not blocked.

### 0.3 Current active workstream

**Session Scenario / Session Strategy Portfolio (frontend).** Not registered in `WORKSTREAMS.md`.
It is distinct from the listed "Session Lab" stream (which owns `pages/SessionLabV1/*`, the `/session-lab`
page). The new system lives in `components/lab/sessionProfiles/*`, `data/sessionProfiles.js`,
`data/scenarioCompile.js`, `data/sessionResults.js`, and is surfaced inside `pages/StrategyBuilder.jsx`,
`pages/SessionPortfolioPreview.jsx`, and a Run Detail tab.

### 0.4 Recently completed workstreams

- **Session Strategy Portfolio + Scenario Builder** (`6f5b649`, `2a23d22`, `d473a9c`, `0789f6a`,
  `1151723`, `ff9d663`) — scenario builder, editable overrides, session-results analysis, results moved
  into Run Detail tabs, dedicated portfolio preview route + nav entry.
- **Research Cockpit** Phase 1 + V2.0A (`/cockpit`) — committed (per docs).
- **Failures Lab V5** Phase 2/2B confirmed-false-losers — live end-to-end (per docs).
- **Distance-at-arm consumption** (`449dc58`, D-014); **Triggered-edge entry-universe expansion**
  (`6a69ab4`, D-013); **OB-Retest v2.1 monetization** (`287dfe3`); **Protection Lab selective BE**
  (`a6b1c09`, D-011); **Master Controls Phase 13** (D-009); **Storage durable mirror** (`ccb240e`, D-012).

### 0.5 Active dirty files and owning workstreams

Live `git status --short` (authoritative; the first read also flagged `SessionResults.jsx` /
`data/sessionResults.js`, but an index refresh resolved those as unchanged — content-identical):

| Dirty file | +/− | Owning concern | Hotspot? |
|---|---|---|---|
| `components/lab/sessionProfiles/PortfolioBar.jsx` | +20 | Session Strategy Portfolio (new, undocumented stream) | No |
| `data/sidecarClient.js` | +7 | Strategy Builder market-data (`getMarketDataStatus` → default dates) | No (high-traffic, but append-only) |
| `pages/Runs.jsx` | +30/−1 | Runs page ergonomics ("Copy run path" for sanity checks) | No |

None of the four named hotspot files (`RunDetail.jsx`, `researchGlossary.js`, `BreakevenTab.jsx`,
`StrategyMap.jsx`) is dirty. The three dirty files are **three independent concerns** — they must not be
co-committed.

### 0.6 Documentation drift (advisory docs vs repository reality)

1. **The entire Session Scenario / Portfolio system is undocumented in `docs/ai/`** — no
   `CURRENT_WORKSTREAM` focus, no `PROJECT_STATUS` entry, no `WORKSTREAMS` registration, no `DECISIONS`
   record (latest is `D-015`; this system warrants a `D-016`), no `BACKLOG` item.
2. **`CURRENT_WORKSTREAM.md` is stale**: claims "15 commits ahead, HEAD `fe71537`." Reality: **6 ahead,
   HEAD `6f5b649`** (origin appears to have advanced or been reset since the doc was written).
3. **`PROJECT_STATUS.md` "current major workstream = Failures Lab V5"** no longer reflects where commits
   are landing (session scenarios).
4. Root design docs exist for this system — `SESSION-STRATEGY-PROFILES-ARCHITECTURE-AUDIT-1.md`,
   `SESSION-STRATEGY-CARDS-ARCHITECTURE-AUDIT-1.md`, `SESSION-LAB-1-ARCHITECTURE.md` (all ~Jun 16) — but
   `docs/ai/` never points to them, so the memory layer can't find them.

**Recommendation (not executed):** a `/sync` adding (a) a Session Scenario/Portfolio workstream entry,
(b) a corrected commits-ahead figure, (c) a `D-016` decision record, and (d) pointers to the three root
design docs. Proposed only — docs are committed on the host.

### 0.7 Active parallel workstreams

From `WORKSTREAMS.md` + git: **Master Controls** (active), **Protection Lab / BE** (active),
**Entry / FFT / Paired Runs** (active — *this stream owns `pages/StrategyBuilder.jsx` as a shared/coordinate
file*), **Strategy Map** (active), **OB Retest** (active), **Research Cockpit** (paused, unpushed),
**Session Lab** (active), **Storage** (committed). Plus the unregistered **Session Scenario/Portfolio**
stream.

> **Ownership flag:** `StrategyBuilder.jsx` is declared shared/coordinate by the Entry/FFT stream. The
> session-scenario work embedded two new components into it. Any future edit to this page is cross-stream
> and must be coordinated — relevant to every redesign option below.

### 0.8 Recommended next task

This audit (Parts 1–7 below). Per the user's instruction, **audit only — no implementation.** The
natural follow-on is a `/decision` + `/sync` to register the system in the memory layer, then a redesign
proposal review. No code task is recommended until the IA direction (Part 6) is chosen.

### 0.9 Recommended commit boundaries (for the existing dirty tree)

Three separate scoped commits, staged by path (never `git add .`):

1. `feat(session-portfolio): <PortfolioBar change>` — `PortfolioBar.jsx` only.
2. `feat(strategy-builder): market-data status for default dates` — `sidecarClient.js` only.
3. `feat(runs): copy run folder path for sanity checks` — `Runs.jsx` only.

No hotspot contamination; no cross-stream symbols; safe to stage independently **on the host** (sandbox
lock). This is a recommendation only — nothing staged.

---

# Strategy Builder UX Audit

> **Method note.** Findings below are grounded in the actual source (`StrategyBuilder.jsx`,
> `SessionStrategyCards.jsx`, `SessionScenarioBuilder.jsx`, `PortfolioBar.jsx`, `App.js`,
> `Sidebar.jsx`, Run Detail wiring), not assumptions. Section positions refer to render order on the page.

## Current render order (ground truth)

Above the grid: hero (`Create New Backtest`) + `ConfigScopeRibbon` + a small **"Scenario will be sent"**
chip (only when `sessionProfiles.enabled`), Run Name, post-run actions, **Current Run** panel,
**Load Other Run** + Config Preview, project assignment.

Then a 3-column grid of `BuilderFocusCard`s, in this order:

1. **Basic Settings** — symbol, dates
2. **Setup Universe Filter** — included setup/structure types
3. **Execution Settings**
4. **Filters** — Session Filtering · News Blackout · *"Generate exact BE for"* (BE variant generation)
5. **Session Strategy Portfolio** (`<SessionStrategyCards/>`) — *rendered raw, no focus-card frame*
6. **Entry Configuration** — Direction Scope · Entry Assignment · Entry Model · presets · Retrace/First-Failed cancel · **Scenario Batch** (penetration/depth *result views*)
7. **Advanced** — Monte Carlo
8. **Sanity / Generated Config** (full width)
9. **Session Scenario** (`<SessionScenarioBuilder/>`) (full width)
10. **Local Sidecar Run** — execution + generated config (full width)

---

## PART 1 — Information Architecture

### Logical domains actually present

| Domain | Where it lives today |
|---|---|
| Project / config loading | Top region (Load Other Run, Config Preview, project assignment, presets) |
| Market & data selection | Basic Settings (symbol, dates; backed by new `getMarketDataStatus`) |
| Strategy structure | Setup Universe Filter |
| Strategy logic / entry | Entry Configuration (direction, model, presets, cancels) |
| Execution | Execution Settings |
| Research filters | Filters (session, news, BE generation) |
| **Scenario generation (variant sweeps)** | *Two* places: BE generation (in Filters), Scenario Batch (in Entry Configuration) |
| **Session Scenario overrides** | *Two* places: Session Strategy Portfolio (pos 5), Session Scenario builder (pos 9) |
| Run execution | Local Sidecar Run (pos 10) |
| Diagnostics | Sanity / Generated Config (pos 8), Last-Run diagnostics, Trade-sanity strip |

### Where unrelated concerns are mixed

1. **"Scenario" means three different things on one page.** (a) *Scenario Batch* — entry-depth /
   penetration **result views** in one run (`entryMode === "research"`, inside Entry Configuration);
   (b) *BE scenario count* — `beArmLevels × beTriggerBases` exact-BE **variants** (inside Filters);
   (c) *Session Strategy Scenario* — per-session/cohort **Entry•BE•Target overrides** (Portfolio cards +
   Scenario builder, compiled into the `session_strategy_scenario` payload). Three unrelated mechanisms,
   one overloaded word, three different page locations. This is the single biggest IA defect.

2. **The Session Scenario system is split across two non-adjacent sections that edit the same state.**
   `SessionStrategyCards` (pos 5) and `SessionScenarioBuilder` (pos 9) both read/write the **same
   `sessionProfiles` working copy** via `buildEffectivePortfolioMap`, yet they are separated by Entry
   Configuration, Advanced, and Sanity, and use **different vocabularies** ("portfolio / bundle /
   exceptions / global strategy" vs "scenario / override / global default / cohort").

3. **BE generation sits under "Filters."** Generating exact-BE variants is scenario/variant generation,
   not a research filter; it is filed next to session and news filtering purely by layout convenience.

4. **The Portfolio section has no section frame.** Every other domain is a `BuilderFocusCard`; the
   Session Strategy Portfolio is dropped in raw between Filters and Entry Configuration, so it reads as
   an interruption rather than a domain.

5. **"Review config" and "run" straddle the override editor.** Sanity/Generated Config (pos 8) comes
   *before* the Session Scenario editor (pos 9), and the run button (pos 10) *after* it — so the override
   that changes what the run does is edited *after* the user has already reviewed the generated config.

---

## PART 2 — User Flow Analysis (researcher creating a new test)

### A) Natural workflow

Pick market & dates → choose structure universe → define entry logic → set execution → apply research
filters (session/news) → *(optionally)* layer session-specific overrides → review the resolved config →
name and run.

### B) Current workflow

Top region (load/preset/project) → Basic → Setup Universe → Execution → **Filters (incl. BE generation)**
→ **Session Strategy Portfolio** → **Entry Configuration (incl. Scenario Batch)** → Advanced → **Sanity**
→ **Session Scenario** → **Run**.

The two biggest deviations from the natural flow: **entry logic comes *after* the session-portfolio
overrides that modify it**, and the **override editor sits between config review and the run button.**

### C) Friction points

- **Context switching.** A researcher tuning session overrides must work in *two* places (pos 5 and pos 9)
  that are six sections apart, in two vocabularies, to manipulate one underlying model. Defining entry
  logic (pos 6) and then overriding it per-session (pos 5, *above* it) forces upward scrolling against
  the page's own order.
- **Duplicate concepts.** "Scenario" (×3 meanings); "global default / global strategy" expressed twice;
  Entry•BE•Target appears as base controls (Entry Config / Filters / Execution) *and* as override
  bundles (Portfolio / Scenario builder).
- **Hidden relationships.** The Session Scenario only affects the run when `profiles.enabled === true`,
  and that toggle lives inside `SessionScenarioBuilder` (pos 9). A user editing the **Portfolio cards**
  (pos 5) gets no local indication that nothing will be sent unless the *other* section is enabled. The
  sole global signal is a small **"Scenario will be sent"** chip in the hero — far from both editors.
- **Mental-memory load.** The base Entry•BE•Target choices (pos 4/6) must be held in mind while editing
  overrides (pos 5/9), because the override UI expresses everything as "Run Default" deltas without
  surfacing what the run default *is* next to it. The generated-config review (pos 8) must likewise be
  remembered when the override editor below it changes the effective config.

---

## PART 3 — Strategy vs Scenario Separation

**Audit verdict: yes — the page conflates two genuinely different authoring tasks**, and the data layer
already supports the split (base config is `cfg`/`sidecarConfig`; overrides are the independent
`sessionProfiles` working copy, attached only at payload-build time). The conceptual seam is real, not
cosmetic.

**A) Base Strategy Definition** (one config, the run's foundation): Symbol · Dates · Setup/Structure
universe · Entry Configuration (direction, model, presets, cancels) · Execution · Session Filters · News
Filters. *Also belongs here:* BE generation and Scenario Batch — they are base-run variant sweeps, not
overrides.

**B) Scenario Definition** (deltas layered on the base): the Session Scenario matrix · per-session /
per-cohort overrides · break-even variants per cohort · target (RR) variants per cohort · portfolio
application + naming/meta.

**Would the separation improve clarity? Yes, strongly**, on three conditions:

1. The base must remain a coherent, runnable strategy on its own (it already is — when
   `profiles.enabled === false`, the payload is byte-identical to a plain run).
2. The Scenario layer must *show* the base it overrides (resolve "Run Default" against the live base so
   the researcher never has to remember pos 4/6 while working in the scenario layer).
3. The **two** scenario editors (Portfolio cards + Scenario builder) must be unified or explicitly
   framed as two views of one model — splitting Strategy from Scenario while keeping a *split inside*
   Scenario would trade one confusion for another.

The split also resolves the overloaded-"scenario" problem: "Scenario Batch" and "BE generation" stay in
**Base** (rename toward "variant sweep"), and "Scenario" becomes reserved for the Session override layer.

---

## PART 4 — Session Scenario System (placement options)

The Session Scenario system is, by the user's own framing and by code centrality (its own model,
compiler, payload block, results tab, and dedicated preview route), a **primary system** — not an
advanced add-on. Today it is presented as a secondary, embedded afterthought (split, unframed, below the
config review). Each placement option, with trade-offs:

### Option 1 — Its own top-level page (e.g. `/scenario` or "Scenario Lab")
**Pros:** matches its importance; room to unify the Portfolio + Builder into one workspace; first-class
nav presence; removes ~700+ lines of unrelated concern from a 2,816-line page; clean Base-vs-Scenario
separation. **Cons:** introduces a page boundary in a flow that is currently single-page (the researcher
must navigate Base → Scenario → Run); requires a clear shared-state contract so the base config the
scenario overrides is unambiguous across pages; the run button must live somewhere unambiguous.

### Option 2 — Its own step / workspace *within* Strategy Builder (a Base ⇄ Scenario ⇄ Run stepper or tabs)
**Pros:** keeps the build-then-run flow on one page while giving Scenario a first-class, full-width home;
natural place to fold the two editors together; preserves single-page mental model; enables progressive
disclosure (Scenario step hidden/collapsed until enabled). **Cons:** stepper/tab affordance is new to this
page; must avoid hiding power-user controls behind clicks (Part 7); requires deciding whether Base config
stays editable while on the Scenario step.
**This is the lowest-risk option that fixes the core defects** (split editors, post-review placement,
unframed section) without a navigation rethink.

### Option 3 — Remain embedded inline, but corrected
If kept inline: (a) **unify** the two editors into one framed `BuilderFocusCard`; (b) place it
**immediately after Entry Configuration** (override the thing you just defined, reading top-down);
(c) move it **above** Sanity/Generated Config and the Run button so review and run see the final state;
(d) frame the enable toggle and "what will be sent" at the section head, not only in the hero.
**Pros:** smallest change; no navigation/state-contract work. **Cons:** the page stays very long; the
overloaded-"scenario" vocabulary persists unless renamed; doesn't elevate the system to the first-class
status the user wants.

### Recommendation framing
Order of preference for *clarity-per-unit-risk*: **Option 2 ≳ Option 3 > Option 1** for a single power
user; **Option 1** becomes attractive if Scenario authoring grows further (more axes, saved libraries,
cross-run scenario comparison) or if multiple researchers reuse scenarios independently of a specific
build.

---

## PART 5 — Session Strategy Portfolio (the duplicated section)

**Findings.** `SessionStrategyCards` is rendered in **two live places**: (1) inside Strategy Builder at
pos 5 (unframed), and (2) on the dedicated `/session-portfolio-preview` page (`SessionPortfolioPreview`,
listed in the sidebar as "Session Portfolio Preview", badge *Preview*). Both render the identical
component over the same `sessionProfiles` state. Separately, `SessionScenarioBuilder` (pos 9) edits the
*same* model with a different UI. So there are effectively **three editing surfaces for one model** — two
of them (cards) literally the same component in two locations.

**Is it duplicating functionality? Yes** — the in-builder Portfolio (pos 5) and the dedicated preview page
are the same surface; and the Portfolio (cards) vs Scenario builder overlap heavily in capability while
diverging in language.

**Recommendations:**

- **Do not keep a full second copy of the Portfolio editor inside Strategy Builder.** Two full editors for
  one model is the core duplication.
- **In Strategy Builder, replace pos 5 with a lightweight summary card**: show the *effective* portfolio
  at a glance (global strategy + count of exceptions + enabled/disabled state + "will be sent" status),
  with the editing depth living in the unified Scenario surface (Part 4) or the dedicated page.
- **Make the summary card a launch point** into the dedicated portfolio/scenario workspace ("Edit
  scenario →"), rather than reproducing the editor inline.
- **Resolve the dedicated page's status.** It is currently a *Preview* route. Either promote it to the
  canonical Scenario workspace (aligning with Part 4 Option 1/2) or retire it once the in-builder surface
  is the summary card — but **do not** leave two full editors plus a preview page indefinitely.
- **Unify Portfolio and Scenario-builder vocabulary** regardless of placement: one term set for
  global/override/cohort/bundle, so the two views read as one system.

---

## PART 6 — Page Hierarchy Redesign (no functionality removed)

Goal: structure / flow / hierarchy / progressive disclosure / lower cognitive load. No styling, no
control removal.

### Shared corrections (apply under every option)
- Reserve the word **"Scenario"** for the Session override layer. Rename the base-run sweeps (e.g.
  "BE variant generation", "Entry depth sweep / Scenario Batch") so they stop colliding.
- Group the page into two explicit domains: **Base Strategy** and **Scenario Overrides**, with **Run** as
  a terminal action that always reflects the *effective* (base + active scenario) config.
- Wherever overrides are edited, **resolve "Run Default" against the live base** so the researcher never
  has to remember base values.
- Put the **enable + "what will be sent"** state at the head of the Scenario surface, not only in the hero.

### Option A — Keep as one page (re-sequenced, single editor)
Reorder to: **Load/Preset/Project → Basic → Setup Universe → Entry Configuration → Execution → Filters →
Base variant sweeps (BE + entry-depth) → [Scenario Overrides: one unified, framed section] → Generated
Config / Sanity → Run.** Collapse the two override editors into one `BuilderFocusCard`; replace pos-5 with
the summary card if the unified editor lives lower. Move Scenario *above* Sanity+Run.
*Best when:* you want minimal disruption and a single-screen mental model. *Cost:* page stays long;
relies on collapse/progressive disclosure to manage density.

### Option B — Split into steps within one page (recommended)
A **Base Strategy → Scenario Overrides → Review & Run** stepper (or top tab bar) on `/strategy`. Step 1
holds all base domains; Step 2 holds the single unified Scenario workspace (cards + override editing,
sharing one model and vocabulary); Step 3 holds Generated Config + sanity + run, always showing the
effective config. Power-user controls stay fully expanded within each step (no nesting behind extra
clicks). *Best balance of clarity and the existing single-page run flow.*

### Option C — Split into workspaces / pages
**`/strategy` (Base Strategy)** + a first-class **`/scenario` (Scenario workspace)** that absorbs and
replaces both the in-builder Portfolio and the `/session-portfolio-preview` route, with **Run** available
from either against a shared, explicitly-displayed effective config. *Best when:* scenario authoring keeps
growing (more axes, libraries, cross-run comparison) or scenarios are reused across builds. *Cost:*
requires a clean cross-page shared-state contract and a single unambiguous run entry point.

### Cross-option progressive disclosure (without hiding power)
Density relief should come from **structure and defaults**, not from hiding controls: collapse a section
to a one-line effective-state summary *when it equals Run Default*, expand fully on focus; keep every
control reachable in one expand; never bury an advanced control more than one interaction deep.

---

## PART 7 — Power-User Constraint (compliance check)

This audit treats FX Research Lab as a research workstation, per `docs/ai/AGENTS.md`
(Research Workflow Preservation / Existing Explorer Protection):

- **No control, dimension, filter, sweep, or override is recommended for removal.** Every Base and
  Scenario capability (entry models C0–C6, threshold sets, BE arm/trigger matrices, penetration/depth
  scenario views, per-cohort overrides, portfolio library) is **preserved** in all three options.
- Recommendations are **re-grouping, re-sequencing, de-duplication, and naming** — additive/structural,
  never reductive. The one "remove" is removing a *duplicate editor*, not a capability.
- **Progressive disclosure is summarize-then-expand, not hide.** Collapsing equals-default sections to a
  one-line summary keeps everything one expand away; no advanced control is gated behind beginner flows.
- **Fast repeated workflows** are explicitly served: a clear Base→Scenario→Run order, presets/load
  retained, an effective-config summary so a researcher can re-run a tweaked scenario without re-reading
  the whole page.

### Explorer-protection statement (required by AGENTS.md for UI work)
- **Preserved:** all base-strategy controls, both scenario-editing capabilities, the dedicated portfolio
  route's functionality, the scenario-results Run Detail tab.
- **Added (proposed only):** unified Scenario vocabulary, base-resolved override display, section-level
  enable/"will be sent" state, summary-card launch point, de-overloaded "scenario" naming.
- **Removed:** nothing functional. Proposed only: the *duplicate* full Portfolio editor instance (kept as
  a summary + launch point), pending approval.
- **Live UI verification:** not performed — this is a static source/IA audit. Before any implementation,
  default / one-override / portfolio-loaded / scenario-disabled / no-run states should be verified in the
  running app (AGENTS.md live-verification requirement).

---

## Summary of the three highest-impact findings

1. **One model, three editing surfaces** (Portfolio in builder + Portfolio on preview page + Scenario
   builder) — the central duplication. Collapse to one editor + a summary launch point.
2. **"Scenario" is overloaded across three unrelated mechanisms** (entry-depth sweep, BE variant
   generation, session overrides) — reserve the word for the override layer; rename the sweeps.
3. **The override editor sits between config review and run, six sections from its twin**, with its
   on/off hidden inside one of the two editors — re-sequence so overrides are edited right after entry
   logic and *before* review+run, with enable state surfaced at the section head.

*No code, config, or doc files were modified by this audit. The only file written is this report.*
