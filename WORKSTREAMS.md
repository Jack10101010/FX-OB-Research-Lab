# FX-OB-Research-Lab — Workstreams

> Registry of parallel workstreams so each Claude / Codex / GPT chat knows what it
> owns and what to leave alone. The user often runs 5–6 Claude chats and 5–6 ChatGPT
> chats at once, each potentially editing code. Attach yourself to a workstream before
> coding. Pair this with [PROJECT_STATUS.md](./PROJECT_STATUS.md).
> Last updated: 2026-06-05.

## Rules

- Every chat must attach itself to **one** workstream before coding.
- If no workstream fits, **create a new one** before writing code.
- Never edit files outside your workstream's "Expected files" without explicitly
  scoping it and noting it here.
- Never `git add .`. Stage only your workstream's files (see PROJECT_STATUS.md →
  Mandatory Pre-Commit Protocol).
- Each workstream entry should list:
  - **status**
  - **owner / chat label** (if known)
  - **purpose**
  - **expected files**
  - **do-not-touch files**
  - **latest relevant commits**
  - **open risks**
  - **next action**

## Current Repo Facts (verify, don't trust blindly)

- Branch: `codex-dev`
- `origin/codex-dev` is at `c534408`; local `codex-dev` is **3 commits ahead (unpushed)**:
  `a953df4`, `38f8a60`, `5d0806e`.
- Re-run `git status --short` and `git log --oneline --decorate -10` yourself — other
  chats change this constantly.

## Active Workstreams

### Master Controls / Research Control Plane

- **Status:** active (primary workstream)
- **Owner / chat label:** _unassigned — claim it here_
- **Purpose:** TradingView-style control plane for editing the active run config,
  previewing runs, and later promoting preview results.
- **Expected files:**
  - `frontend/src/components/masterControls/MasterControlsContext.jsx`
  - `frontend/src/components/masterControls/MasterControlsDrawer.jsx`
  - `frontend/src/data/configRegistry.js`
  - `frontend/src/data/configTranslator.js`
  - `frontend/src/pages/StrategyBuilder.jsx` — **only** when the config build/load flow requires it
- **Do not touch unless explicitly scoped:**
  - Session Lab files
  - Entry / FFT files
  - Classification files
  - Strategy Map files
- **Latest relevant commits:**
  - `5d0806e` feat(master-controls): add preview run context (Phase 4A)
  - `38f8a60` fix(master-controls): polish drawer state feedback
  - `077b826` fix(master-controls): preserve entry metadata roundtrip
  - `e4025f7` feat(master-controls): add safe editable draft fields
  - `207df35` feat(master-controls): add readonly active config view
  - `3ff1007` feat(master-controls): add draft config state
  - `f121157` feat(master-controls): add config registry metadata
  - `3154dab` refactor(master-controls): extract shared config translator
- **Latest state:**
  - Phase 4A committed: preview run context.
  - Phase 4B (preview results display) implemented but **pending commit** — confirm via
    `git status` that `MasterControlsDrawer.jsx` is still modified.
  - Phase 4C (promotion / save-as-run) **not started**.
- **Open risks:** preview bundle isolation must hold — no `addRunBundle`, no
  `setActiveRunId`, no run-history entry, no store mutation from preview.
- **Next action:**
  1. Commit Phase 4B if the diff is clean (only `MasterControlsDrawer.jsx`).
  2. Manual QA the preview results panel.
  3. Then audit / design Phase 4C promotion / save-as-run.

### Session Lab

- **Status:** active / parallel
- **Owner / chat label:** _unassigned_
- **Purpose:** Session Lab V1 analytics and Deep Dive / QuickControls UX.
- **Expected files:**
  - `frontend/src/pages/SessionLabV1/*`
  - `frontend/src/pages/SessionLabV1/data/sessionLabV1Adapter.js`
- **Do not touch:** Master Controls files unless explicitly required.
- **Latest relevant commits:**
  - `fc70cc4` refactor(session-lab-v1): collapse Deep Dive filters into QuickControls accordion
  - `67b92da` feat(session-lab-v1): add outcome and cancel reason Deep Dive filters
- **Currently dirty:** `frontend/src/pages/SessionLabV1/data/sessionLabV1Adapter.js`
- **Open risks:** none noted.
- **Next action:** continue Session Lab work; commit only SessionLabV1 files.

### Entry / FFT / Paired Runs

- **Status:** active / parallel
- **Owner / chat label:** _unassigned_
- **Purpose:** Entry models, FFT pairing controls/overlays, intrabar inspection,
  paired FFT-OFF counterfactual runs, pre-trigger cancel and TE-delay research.
- **Expected files:**
  - `frontend/src/components/lab/entries/*`
  - `frontend/src/components/lab/IntrabarInspector.jsx`
  - `frontend/src/pages/StrategyBuilder.jsx`
  - related FFT analytics files
- **Do not touch:** Master Controls / Session Lab files unless explicitly scoped.
  Note `StrategyBuilder.jsx` is **shared** with Master Controls — coordinate before
  committing it.
- **Latest relevant commits:**
  - `c534408` fix(entries): show FFT pairing controls and panel
  - `35027ac` feat(entries): add paired FFT-OFF run selector
- **Currently dirty:** `frontend/src/components/lab/IntrabarInspector.jsx`,
  `frontend/src/pages/StrategyBuilder.jsx`
- **Open risks:** `StrategyBuilder.jsx` overlaps Master Controls — mixed commits likely
  here. Stage deliberately.
- **Next action:** continue Entry/FFT work; coordinate on `StrategyBuilder.jsx`.

### Strategy Map

- **Status:** active / parallel
- **Owner / chat label:** _unassigned_
- **Purpose:** Strategy Map page, scenario selection, and chart overlays.
- **Expected files:**
  - `frontend/src/pages/StrategyMap.jsx`
  - `frontend/src/pages/strategyMap/*`
  - `frontend/src/components/lab/CandleChart.jsx` — when overlay-related
- **Do not touch:** Master Controls / Session Lab files unless explicitly scoped.
- **Latest relevant commits:**
  - `a953df4` fix(strategy-map): prevent cancelled trades from receiving fill badges
- **Currently dirty:** `frontend/src/pages/StrategyMap.jsx`,
  `frontend/src/pages/strategyMap/ScenarioSelector.jsx`,
  `frontend/src/components/lab/CandleChart.jsx`
- **Open risks:** `CandleChart.jsx` may overlap Entry/FFT overlays; `tradeUniverse.js`
  is shared with Trade Classification.
- **Next action:** continue Strategy Map work; coordinate on shared files.

### Trade Classification

- **Status:** active / parallel
- **Owner / chat label:** _unassigned_
- **Purpose:** Trade classification system, trade universe resolution, AAE analysis,
  and classification displays in RunDetail / StrategyMap.
- **Expected files:**
  - `frontend/src/data/tradeUniverse.js`
  - classification registry / files
  - RunDetail / StrategyMap **only** when classification display requires it
- **Do not touch:** Master Controls / Session Lab files unless explicitly scoped.
- **Latest relevant commits:**
  - `7e1229a` feat(classification): add run detail performance breakdown
  - `3504918` feat(classification): add run detail class filters
  - `7e25d7b` feat(classification): add trade classification foundation
  - `aee8d33` feat(classification): show trade class badges in run and map views
- **Currently dirty:** `frontend/src/data/tradeUniverse.js` (shared with Strategy Map)
- **Open risks:** `tradeUniverse.js` is a shared data resolver — changes ripple into
  Strategy Map. Coordinate.
- **Next action:** continue classification work; treat `tradeUniverse.js` carefully.

### Ghost / Backend Research Docs

- **Status:** docs / research
- **Owner / chat label:** _unassigned_
- **Purpose:** Ghost-tracking research and backend prototyping; mostly markdown audits
  and standalone Python scratch scripts.
- **Expected files:**
  - `ghost_tracker.py`
  - `ghost_tracker_test.py`
  - `GHOST*.md`
  - related research docs
- **Do not touch:** any `frontend/` source unless a separate workstream is created.
- **Latest relevant commits:** none on `codex-dev` yet (currently untracked files only).
- **Currently dirty (untracked):** `ghost_tracker.py`, `ghost_tracker_test.py`,
  `GHOST-0-audit.md`, `GHOST-SYNC-0-audit.md`, `LUX-GHOST-PHASE-1-integration.md`
- **Open risks:** root-level `package.json` / `package-lock.json` are untracked and look
  misplaced (real manifest is `frontend/package.json`) — not part of this workstream;
  verify before anyone commits them.
- **Next action:** keep research isolated; do not mix with frontend commits.

## New Chat Startup Template

Copy-paste this block at the start of any new chat:

```
NEW CHAT STARTUP TEMPLATE:
Read PROJECT_STATUS.md and WORKSTREAMS.md.
Then run:
- git rev-parse --show-toplevel
- git branch --show-current
- git status --short
- git log --oneline --decorate -10

Before coding, report:
1. Repo path
2. Branch
3. Workstream you are attaching to
4. Files you expect to touch
5. Dirty files you will NOT touch
6. Commits ahead of origin
7. Whether it is safe to proceed

If this task does not fit an existing workstream, add a new workstream entry to
WORKSTREAMS.md before coding.
```
