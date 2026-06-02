# App Workflow + Projects Section Audit

**Mode:** Audit / product design only. No code changed.
**Date:** 2026-06-02

---

## 1. Files read

Navigation / shell
- `frontend/src/App.js` — route table (24 routes)
- `frontend/src/components/lab/Sidebar.jsx` — single flat nav (21 items + roadmap)
- `frontend/src/components/lab/ActiveRunContext.jsx` — page context header (active project + active run)
- `frontend/src/components/lab/TopBar.jsx`, `RunConfigStrip.jsx` — no global run/project switcher

Data model
- `frontend/src/data/store.js` (~1900 lines) — runs, projects, active IDs, derived view, project↔run linking

Pages
- `pages/Projects.jsx`, `pages/ProjectDetail.jsx` (1189 lines)
- `pages/Runs.jsx`, `pages/RunDetail.jsx` (2790 lines)
- `pages/Overview.jsx`, `pages/ComparisonLab.jsx`, `pages/StrategyMap.jsx`, `pages/OrderBlockLab.jsx`, `pages/EntriesLab.jsx`, `pages/WorkflowGuide.jsx`

---

## 2. Current workflow map

**Intended flow** (from WorkflowGuide `bigPicture` + ProjectDetail `getNextStep`):

> Project → Baseline Backtest → Inspect Baseline → Identify Weaknesses → Run Targeted Experiments → Compare Results → Promote Candidate → Validate → Export Live Config

**Actual flow the code supports:**

1. **Idea** → Strategy Builder (`/strategy`) configures a backtest. (You also said runs are imported from an external Python backtester via a sidecar.)
2. **Run** → result is imported into `store.runs` as a bundle, keyed by a generated run id.
3. **Inspect** → set that run as the **global active run**, then visit Run Detail / Strategy Map / the Labs — *all of which read one shared `activeRunId`*.
4. **Compare** → Comparison Lab + Table Compare (multi-select runs).
5. **Decide** → in Project Detail you mark a run as `candidate`/`final`, tick a checklist, and write findings notes.

**The critical architectural fact:** there is exactly **one global `activeRunId`** (and one `activeProjectId`) in `store.js`. Every lab — OrderBlockLab, EntriesLab, ProtectionLab, NewsLab, Strategy Map, Trade Inspector — renders whatever the active run is. There is **no run picker in the top bar**. You change the subject of the whole app by clicking "Set Active" buried inside the Runs table, the Project Detail run rows, or the run dropdown inside Run Detail.

So the real journey is: *pick active run somewhere → every lab in the sidebar now points at it → wander the sidebar → come back to Project Detail to record what happened.*

---

## 3. Problems with the current flow

1. **21 flat sidebar items, no grouping.** Strategy Builder, Strategy Logic, 8 labs, Runs, Run Detail, Projects, Comparison, Sweep, Walk-Forward, Monte Carlo, Parity, Workflow Guide, Overview, Settings all sit at the same level. This is the single biggest overwhelm driver. Nothing tells you what's a *destination* vs a *tool*.

2. **The "active run" is invisible and global.** The thing that controls every lab's content is set in three different out-of-the-way places and shown only inside a page header (`ActiveRunContext`). You can open Order Block Lab and silently be looking at the wrong run. For an ADHD-friendly tool this is the worst property: the most important state variable is the least visible.

3. **Two competing centres: Projects vs Runs.** Projects wants to be the organizing home (baseline/candidate/final, checklist, findings, experiment timeline, even runs sweeps from inside Project Detail). Runs is a flat global inventory of everything ever imported. They overlap heavily and neither clearly wins. You feel this tension — it's real and it's in the code.

4. **"Run Detail" is a nav item pointing at `/runs/active`.** A detail view of a *specific* run is in the global sidebar as if it were a section. It only makes sense relative to a selected run.

5. **Duplicate / thin destinations.** Workflow Guide (static diagram), Strategy Logic (reference), Parity Debugger, Monte Carlo, Sweep, Walk-Forward are all top-level peers of your daily labs. Several are reference/utility, not daily workflow.

6. **No single "after a run" landing.** After importing a run, where do you go? Overview is generic, Run Detail is one run, Project Detail is project-level. There's no "here's what just changed and what to do next" screen, even though `getNextStep` already computes exactly that logic — it's just hidden inside Project Detail.

7. **Compare lives in two places** (Comparison Lab + Table Compare drawer + the sweep tables inside Project Detail). Fine functionally, but you asked "where do I compare?" and the honest answer is "three places."

---

## 4. Projects section audit

**What it currently does**
- Create a project scoped by symbol + timeframe (`Projects.jsx`).
- Project Detail (`ProjectDetail.jsx`, 1189 lines) is genuinely rich: baseline/candidate/final slots, an 8-item checklist, a `getNextStep` engine, an experiment timeline, a findings/notes log, and it can even *launch RR and protection sweeps via the sidecar* and auto-import results.

**What data it owns** (`store.js` project shape)
- `name, symbol, timeframe, status`
- `runIds[]` and role pointers `baselineRunId / candidateRunId / finalRunId / activeRunId`
- `checklist` (8 booleans), `notes`, `findings[]`
- Each run carries a back-pointer `projectId` + `runRole` + `experimentType`.

**Is it useful?** Yes — conceptually it's the *right* idea and the richest part of the app. The checklist, next-step engine, and findings log are exactly the "what did I test / what's next" memory an ADHD workflow needs. **The problem isn't the concept, it's that it's underused as a hub and overloaded as a page.**

**Is it confusing / redundant with Runs?** Partly. Runs = "every run I ever imported." Projects = "the runs that belong to this investigation, with roles + notes." Today they read like two inventories. The redundancy is in *presentation*, not in *purpose*.

**Should Projects stay central?** Yes — but as a lightweight **campaign/folder + memory layer**, not as a place that also runs sweeps and duplicates the runs table. Right now it's trying to be both the filing cabinet and the workbench.

**Folders/campaigns vs simplify vs remove?**
- **Keep it. Reframe it as "Campaigns/Folders + findings."** Do *not* remove it — you'd lose the only place the app remembers what you concluded.
- Move the heavy machinery (launching sweeps) *out* of Project Detail into the Sweep/experiment tools; let Project Detail link to them instead.

---

## 5. Recommended ideal workflow

Design goal: at every moment you can answer *what am I looking at, what changed, what's next* without hunting.

```
PICK SUBJECT once (a Run, inside a Project)  →  visible everywhere via a top-bar switcher
        │
        ▼
RUN WORKSPACE  (the new hub — replaces "Run Detail" + landing)
  • headline result + "vs previous run" delta
  • next-step suggestion (reuse getNextStep)
  • tabs/links into the labs for THIS run
        │
        ├── dig in  → Labs (OB / Entries / Protection / News / Strategy Map) — all scoped to active run
        ├── compare → Comparison (this run vs baseline/candidate, or multi-select)
        └── record  → Findings + role (baseline/candidate/final) — saved on the Project
```

Concretely, the five questions map to fixed homes:
- **What did I test?** → Project page (run list + roles + findings)
- **What changed from last run?** → Run Workspace "delta vs previous" panel
- **What result mattered?** → Run Workspace headline + Findings you pinned
- **What should I test next?** → `getNextStep` surfaced on the Run Workspace, not buried in Project Detail
- **Where do I go first after a run?** → Run Workspace (one fixed landing)
- **Where do I compare?** → Comparison (one place; promote Table Compare to be a mode of it)
- **Where do I extract final insight?** → Project Findings (the durable memory)

---

## 6. Recommended navigation / hierarchy

Collapse 21 flat items into **5 groups**. Put a **global Project + Run switcher in the top bar** so the active subject is always visible and changeable in one click.

```
TOP BAR:  [ Project ▾ ]  [ Active Run ▾ ]   ← always visible, controls every lab

WORKSPACE
  • Dashboard (Overview)
  • Projects            ← campaigns / folders + findings (the hub)
  • Runs                ← inventory

BUILD & RUN
  • Strategy Builder
  • Strategy Logic      (reference — could fold into Builder)

ANALYZE  (all scoped to the active run)
  • Run Workspace       ← was "Run Detail", now the post-run landing
  • Order Block Lab
  • Entries Lab
  • Protection Lab
  • News Lab
  • Strategy Map
  • Trade Inspector

COMPARE & VALIDATE
  • Comparison          (absorbs Table Compare)
  • Sweep
  • Walk-Forward
  • Monte Carlo

UTILITIES (collapsed by default)
  • Parity Debugger
  • Workflow Guide
  • Settings
```

This keeps every existing page but makes the sidebar scannable. The grouping itself does ~70% of the de-overwhelming work.

---

## 7. What should be the main hub

**Two-layer hub, not one:**

- **Projects = the home you start and end at** (the campaign + memory layer). It's where you answer "what did I test / what mattered / what's next."
- **Run Workspace = the hub you live in during a session** (the active-run cockpit). It's where you land after every run and branch into the labs.

**Why not the alternatives:**
- *Runs* is an inventory, not a hub — it has no notion of intent or next-step.
- *Strategy Map* is one analysis view of one run; too narrow to be home.
- *Overview* is fine as a glanceable dashboard but has no memory and no next-step — keep it as the dashboard, not the hub.
- A brand-new "Research Dashboard" isn't needed — you already have the pieces (`getNextStep`, findings, deltas). Don't build a new page; **promote the logic that's already trapped inside Project Detail up to the Run Workspace.**

So: **Projects stays central as the organizing hub; the Run Workspace becomes the operational hub.** They're complementary, and the top-bar switcher is the glue.

---

## 8. What to simplify / remove (for now)

- **Remove "Run Detail" as a standalone nav item.** Rename to "Run Workspace" and reach it via the active-run switcher / clicking a run. It's not a section.
- **Demote** Parity Debugger, Monte Carlo, Walk-Forward, Workflow Guide into grouped/utility sections — keep the code, drop them from the top level.
- **Fold Table Compare into Comparison** as a view mode rather than a separate surface.
- **Strip sweep-launching out of Project Detail** — let it link to Sweep instead. Project Detail should *record* experiments, not *run* them.
- **Consider folding Strategy Logic into Strategy Builder** as a reference tab.
- Don't remove Projects. Don't remove any analysis lab.

---

## 9. Quick wins (hours, low risk)

1. **Group the sidebar** into the 5 sections in §6 (pure `Sidebar.jsx` edit — reorder + add headers). Biggest overwhelm reduction for the least work.
2. **Add a global active-run (and project) switcher to `TopBar.jsx`.** The state already exists (`activeRunId`, `setActiveRunId`, `RUNS`); you just need a dropdown. Makes the most important state visible everywhere.
3. **Rename "Run Detail" → "Run Workspace"** and remove it from the flat nav list.
4. **Surface `getNextStep` on Run Detail/Overview**, not only inside Project Detail — it already exists, just import and render it.

## 10. Medium-term changes (days)

5. **Build the "delta vs previous run" panel** on the Run Workspace (headline metrics diff against `baselineRunId` or the prior run in the project). This directly answers "what changed."
6. **Make Run Workspace the post-import landing** — after an import, route there with the new run set active.
7. **Reframe Project Detail** into the lighter Campaign + Findings layout; move sweep execution out to Sweep with a link back.
8. **Merge Table Compare into Comparison** as a mode.

## 11. Later roadmap

9. Per-lab "pin to findings" so any chart/insight in a lab writes back to the active project's findings log in one click (closes the loop between analysis and memory).
10. A compact "Campaign timeline" view: baseline → experiments → candidate → final as a horizontal track with deltas at each hop.
11. Optional: saved comparison sets per project.
12. Revisit the disabled "Research Workstation" sidecar once the above is stable.

---

## 12. Recommended next implementation phase

**Phase 1 — "Make the subject visible and the sidebar calm."** Two changes, both low-risk and high-impact, no data-model work:
1. Group the sidebar into the 5 sections (§6).
2. Add the global Project + Active-Run switcher to the top bar.

Everything else (Run Workspace delta panel, Project Detail reframe) depends on you *feeling* the active-run model first. Do Phase 1, use it for a few sessions, then decide on the deeper hub work.

---

STATUS:
COMPLETE

NEXT:
Phase 1 — group the sidebar into 5 sections and add a global Project + Active-Run switcher to the top bar (the active run is currently the app's most important yet least visible state). No data-model changes required.

SUGGESTIONS:
- Surface the existing `getNextStep` engine outside Project Detail; it's the ready-made answer to "what should I test next."
- Add a "vs previous run" delta on the run landing to answer "what changed" without manual comparison.
- Let labs write findings back to the active project so analysis and memory stay in sync.

END OF TASK
