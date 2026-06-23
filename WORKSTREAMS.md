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
- `HEAD` is at `4616506` (Master Controls Phase 7A); `origin/codex-dev` is at `6c8fc60` — the
  branch is **2 commits ahead of origin (unpushed)**: `4616506` (Master Controls Phase 7A) and
  `3d6b5ee` (Entry/FFT FFT-tooltip copy). Note: Phase 6 and the classification fill-state work
  are now **on origin** (pushed).
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
  - `4616506` feat(master-controls): add instant cost rescore panel (Phase 7A)
  - `99f07c7` feat(master-controls): classify rerun tiers (Phase 6)
  - `354dcca` feat(master-controls): compare active and preview runs (Phase 5)
  - `c3db5f8` feat(master-controls): promote preview to run (Phase 4C)
  - `bdc7473` feat(master-controls): add preview results display (Phase 4B)
  - `5d0806e` feat(master-controls): add preview run context (Phase 4A)
  - `38f8a60` fix(master-controls): polish drawer state feedback
  - `077b826` fix(master-controls): preserve entry metadata roundtrip
  - `e4025f7` feat(master-controls): add safe editable draft fields
  - `207df35` feat(master-controls): add readonly active config view
  - `3ff1007` feat(master-controls): add draft config state
  - `f121157` feat(master-controls): add config registry metadata
  - `3154dab` refactor(master-controls): extract shared config translator
- **Latest state:**
  - Phase 4A–4C committed: preview run context, results display, Save As Run promotion.
  - Phase 5 committed (`354dcca`): Active-vs-Preview compare. Shared metric extractor now
    in `components/masterControls/previewMetrics.js`.
  - Phase 6 committed (`99f07c7`): rerun-tier classification. Registry fields tagged
    `instant_filter` / `frontend_rescore` / `backend_rescore` / `full_backtest`; context
    exposes `highestRerunTier`; preview button label + hint reflect the dirtiest tier.
  - Phase 7A committed (`4616506`): instant cost rescore. New pure util
    `components/masterControls/costRescore.js`; when the dirty set is cost-only
    (spread / slippage / commission) the drawer shows a local Active-vs-Rescored panel
    recomputed from `gross_r` + per-trade cost columns. **Display-only — no backend, no
    sidecar, no store mutation, no run creation, no Strategy Map update. Wins/losses
    preserved from original outcomes (never re-derived from the new R sign).**
  - **Phase 7A manual QA: PASS** (live browser QA, 2026-06-07, run `imported_1780733962068`).
    Verified end-to-end: clean / spread / slippage / commission (exact flat −R per trade) /
    additive multi-cost / RR-escalation hides the panel / reset clears it; display-only, no
    store mutation, no auto-sidecar, no console errors. (Save As Run live QA was initially
    blocked by the import "hang" — now diagnosed & fixed; see below.)
  - **Preview import "hang" — FIXED (2026-06-07, uncommitted).** Diagnosed via timing logs as a
    self-cancelling import effect (not a perf issue: total import ~117 ms). The effect, keyed on
    `preview.status`, set `completed → importing` which re-ran it and tripped the old `cancelled`
    cleanup before the async import resolved, skipping the `status:"done"` write. Fixed in
    `MasterControlsContext.jsx` with a job-id ref guard (`importJobRef`). **Live QA passed:**
    preview reaches "Preview ready", Preview Results + Active-vs-Preview render, Save As Run
    appears, Clear preview works.
- **Open risks:** preview isolation must hold for the whole preview lifecycle — no
  `addRunBundle`, no `setActiveRunId`, no run-history entry, no store mutation — **until**
  the user clicks Save As Run, the one deliberate promotion point (`promotePreview()` →
  `addRunBundle`). Phase 6 tiers are signal-only; Phase 7A cost rescore is display-only —
  do not let either imply the sidecar path changed.
  - ~~**Sidecar preview import hang/slow**~~ — **RESOLVED** (self-cancelling import effect; fixed
    with job-id ref guard, live QA passed). Was never a perf issue.
  - **Cost-rescore Active baseline mismatch** *(still open)* — panel Active (~+9.8R / 33.3% / 35 trades) ≠
    page Trade Sanity (~+8.44R / 38%); likely variant/basis mismatch (`primaryVariant` + raw R).
    Internally consistent, but needs investigation for user trust. (See `BACKLOG.md`.)
- **Next action:** Phase 7A QA done (PASS); import "hang" diagnosed & fixed (commit pending).
  1. ~~Investigate the sidecar preview import hang~~ — **done** (self-cancel effect → ref guard).
  2. **Investigate the cost-rescore baseline mismatch** (variant/basis) so the panel's Active
     numbers reconcile with the run view. *(still open)*
  3. Consider Phase 7B (transient rescored bundle → live Strategy Map / report; still no
     backend, no store registration).
  4. RR↑ / stop / entry / OB-depth rescore stays **blocked** until the exporter adds
     per-trade MFE/MAE (backend / FX-OB-Backtester change).

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

### OB Retest / Retest Lab

- **Status:** active / new
- **Owner / chat label:** _unassigned — claim it here_
- **Purpose:** Research and implement OB retest analysis logic and Retest Lab surfaces.
- **Expected files:**
  - `frontend/src/data/obRetest.js`
  - `frontend/src/data/__validation__/obRetest.logictest.cjs`
  - `frontend/src/components/lab/retest/*` (RetestLabTab.jsx, useRetestData.js)
  - `frontend/src/pages/OrderBlockLab.jsx` — **tab wiring only unless explicitly scoped**
    (owned by OB Retest Phase 1: import + `tabRetestLab` content + one `TABS` entry)
  - `OB-RETEST-ANALYSIS-*.md`
- **Do not touch:**
  - Master Controls files
  - Session Lab files
  - Entry / FFT files
  - Strategy Map files unless a retest overlay is explicitly scoped
- **Latest relevant commits:** none on `codex-dev` yet (Phase 1 staged/committed this session — see PROJECT_STATUS.md log).
- **Currently dirty / untracked:**
  - `frontend/src/data/obRetest.js` (untracked)
  - `frontend/src/data/__validation__/obRetest.logictest.cjs` (untracked)
  - `frontend/src/components/lab/retest/` (untracked dir: RetestLabTab.jsx, useRetestData.js)
  - `frontend/src/pages/OrderBlockLab.jsx` (modified — OB Retest Phase 1 tab wiring, owned by this chat)
  - `_research/audits/OB-RETEST-ANALYSIS-1.md`
  - `_research/plans/OB-RETEST-ANALYSIS-2-PHASE-1-PLAN.md`
- **Open risks:**
  - `OrderBlockLab.jsx` is a shared page surface — keep OB Retest edits to tab wiring only;
    coordinate before any deeper change so other tabs are untouched.
- **Next action:** Validate and commit OB Retest Phase 1 as a separate scoped commit
  (`feat(ob-retest): add retest analysis lab phase 1`).

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
  `_research/audits/GHOST-0-audit.md`, `_research/audits/GHOST-SYNC-0-audit.md`, `_research/plans/LUX-GHOST-PHASE-1-integration.md`
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

Then compare PROJECT_STATUS.md and WORKSTREAMS.md against the live git state
(HEAD, origin position, dirty files, latest commits). **If either doc is stale,
refresh it before coding** — update the branch position, pending steps, latest
commits, and dirty-tree lists so the next chat inherits accurate state.

If this task does not fit an existing workstream, add a new workstream entry to
WORKSTREAMS.md before coding.
```
