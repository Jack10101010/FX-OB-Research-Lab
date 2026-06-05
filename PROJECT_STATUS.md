# FX-OB-Research-Lab — Project Status

> Living source of truth for parallel Claude / Codex / GPT chats working on this repo.
> Keep it short, accurate, and current. Update it before you end your session.
> **Every new chat must also read [WORKSTREAMS.md](./WORKSTREAMS.md) and attach to a workstream before coding.**
> Last updated: 2026-06-05 — after Phase 4B (Preview Results display) was implemented but **not yet committed**.

## Rules for Future Chats

Before implementing anything:

1. Read this file.
2. Run `git status --short`.
3. Run `git log --oneline --decorate -10`.
4. Identify the current workstream.
5. Identify unrelated dirty files.
6. Confirm the exact files you intend to touch.
7. Do **not** use `git add .`.
8. Commit only the files belonging to your current task.
9. Update this file before ending the session.

Also read **[WORKSTREAMS.md](./WORKSTREAMS.md)** and attach this chat to a workstream
before writing any code. If no workstream fits, add a new one there first.

## Mandatory Startup Protocol for Every New Chat

Every new Claude / Codex / GPT chat **must** do all of this before writing any code:

1. **Confirm repo path:**
   `git rev-parse --show-toplevel` — the path **must end in `FX-OB-Research-Lab`**.
2. **Confirm branch:**
   `git branch --show-current` — expected `codex-dev` unless the user explicitly says otherwise.
3. **Read:**
   `PROJECT_STATUS.md` and `WORKSTREAMS.md`.
4. **Run:**
   `git status --short` and `git log --oneline --decorate -10`.
5. **Identify:**
   - the current workstream,
   - the intended files to touch,
   - unrelated dirty files,
   - unpushed commits (`git log --oneline origin/codex-dev..HEAD`),
   - whether stale `.git` lock files exist.
6. **Report before coding:**
   - "I am working on: `<workstream>`"
   - "Expected files to touch: `<files>`"
   - "Files I will not touch: `<unrelated dirty files>`"
   - "Safe to proceed: yes/no"
7. **If the task does not match an existing workstream:**
   - create a new entry in `WORKSTREAMS.md`,
   - mark status as `active`,
   - list likely files,
   - list the chat's purpose.

## Mandatory Pre-Commit Protocol

Before **every** commit:

1. Run:
   ```
   git status --short
   git diff --stat
   git diff --cached --name-only
   ```
2. Stage **only explicit files**:
   ```
   git add path/to/file1 path/to/file2
   ```
3. **Never** use:
   ```
   git add .
   git commit -am "..."
   ```
4. Confirm the staged files belong to the **current workstream only**.
5. Commit with a scoped message, e.g.:
   - `feat(master-controls): ...`
   - `fix(session-lab): ...`
   - `docs(status): ...`

## Push Protocol

Push is allowed **only** when:

1. The working tree has no unrelated staged changes.
2. The user confirms they are happy pushing **all** commits ahead of origin.
3. You have run and shown:
   ```
   git log --oneline origin/codex-dev..HEAD
   ```
4. You have listed exactly what will be pushed.
5. **Ask the user before pushing if the commits span more than one workstream.**

## ⚠️ Wrong Repo / Wrong Folder Warning

**ALWAYS verify the repo before any git operation:**

```
git rev-parse --show-toplevel
```

**Do NOT run frontend git commands from:**

- `FX-OB-Backtester`
- output run folders
- generated run-bundle folders
- any folder named like `20260605_152018_EURUSD_15min...`

If the toplevel does not end in `FX-OB-Research-Lab`, **stop** and `cd` into the
correct repo first.

## Stale Lock Handling

If `.git/index.lock` or `.git/HEAD.lock` exists (git will refuse to operate, or
`git status` warns it cannot unlink the lock):

1. First check for a live git process:
   ```
   ps aux | grep git
   ```
2. If **no** relevant git process is running, remove **only** the stale lock:
   ```
   rm -f .git/index.lock .git/HEAD.lock
   ```
3. Then retry the git operation.

> A stale `.git/index.lock` has already been observed in this repo. Never delete a
> lock while another chat may be mid-commit — confirm no git process is active first.

## Current Branch

`codex-dev`

## Current Main Workstream

Master Controls / Research Control Plane

## Current Master Controls Status

Completed:

- Config registry foundation
- Config registry metadata
- Shared `configTranslator` extraction
- Active config derivation
- Draft config state
- Dirty field tracking
- Validation system
- Drawer QA polish
- Safe editable draft fields
- Run Preview context (Phase 4A)
- Preview bundle isolation
- Preview results display (Phase 4B — implemented, see Pending Step)

Important architecture (do not violate):

- Preview bundles live **only** in `MasterControlsContext.preview.bundle`.
- Preview runs must **not** call `addRunBundle`.
- Preview runs must **not** change `activeRunId`.
- Preview runs must **not** appear in run history / the run list.
- Promotion / save-as-run is **not implemented yet** (planned Phase 4C).
- Phase 4B preview results are read-only: extraction reads `preview.bundle.summary`
  first, then falls back to `preview.bundle.tradesByVariant` / `equityCurve`. No
  store mutation, no `setActiveRunId`, no promotion.

## Latest Known Master Controls Commits

From `git log` on `codex-dev` (newest first):

- `5d0806e` feat(master-controls): add preview run context  ← current HEAD
- `38f8a60` fix(master-controls): polish drawer state feedback
- `077b826` fix(master-controls): preserve entry metadata roundtrip
- `e4025f7` feat(master-controls): add safe editable draft fields
- `207df35` feat(master-controls): add readonly active config view
- `3ff1007` feat(master-controls): add draft config state
- `f121157` feat(master-controls): add config registry metadata
- `3154dab` refactor(master-controls): extract shared config translator

Branch position: `HEAD -> codex-dev` is at `5d0806e`. `origin/codex-dev` is at
`c534408`, so the branch is **3 commits ahead of origin (unpushed)**:
`a953df4`, `38f8a60`, `5d0806e`.

## Current Pending Step

Phase 4B (Preview Results display) **has been implemented but is NOT yet committed.**
The change is confined to `frontend/src/components/masterControls/MasterControlsDrawer.jsx`
(currently showing as modified in the working tree).

Next expected actions:

1. Inspect the Phase 4B diff:
   `git diff -- frontend/src/components/masterControls/MasterControlsDrawer.jsx`
2. Commit **only** `MasterControlsDrawer.jsx` if the diff is clean
   (e.g. `git commit -m "feat(master-controls): add preview results display" -- frontend/src/components/masterControls/MasterControlsDrawer.jsx`).
3. Manual QA the preview results panel (run a preview, confirm stats render, confirm
   active run + run list are unchanged, confirm "Clear preview" works).
4. Then decide whether to implement Phase 4C (promotion / save-as-run).

## Current Dirty Working Tree

Snapshot from `git status --short` (2026-06-05). Other chats add to this constantly —
re-run `git status --short` yourself; do not trust this list blindly.

### Modified (tracked)

| File | Likely workstream |
|------|-------------------|
| `frontend/src/components/masterControls/MasterControlsDrawer.jsx` | **Master Controls** (Phase 4B — current task, uncommitted) |
| `frontend/src/pages/SessionLabV1/data/sessionLabV1Adapter.js` | Session Lab |
| `frontend/src/pages/StrategyMap.jsx` | Strategy Map |
| `frontend/src/pages/strategyMap/ScenarioSelector.jsx` | Strategy Map |
| `frontend/src/components/lab/CandleChart.jsx` | Strategy Map / Entry-FFT overlay (ambiguous) |
| `frontend/src/components/lab/IntrabarInspector.jsx` | Entry / FFT |
| `frontend/src/pages/StrategyBuilder.jsx` | Entry / FFT (FFT pairing controls) |
| `frontend/src/data/tradeUniverse.js` | Trade Classification / Strategy Map (ambiguous) |

### Untracked

Classified by likely workstream:

- **Master Controls:** `MASTER-CONTROLS-ARCHITECTURE.docx`, `PHASE-2B-CONFIG-TRANSLATION-AUDIT.md`
- **Session Lab:** `SESSION-LAB-1-ARCHITECTURE.md`
- **Entry / FFT:** `FFT-OVERLAY-SYNC-PLAN.md`, `DIRECTIONAL-ENTRY-1-audit.md`,
  `DIRECTIONAL-ENTRY-3-audit.md`, `TE-DELAY-1-audit.md`, `TE-DELAY-VALIDITY-1.md`,
  `TE-DELAY-VALIDITY-2.md`, `TE-DELAY-VALIDITY-CLOSEOUT-1.md`,
  `TE-DELAY-VALIDITY-FIELDS-integration.md`, `TE-EXPORT-AUDIT-1.md`,
  `TE-FFT-VALIDATION-READINESS-AUDIT-1.md`, `PRETRIGGER-CANCEL-1.md`,
  `PRETRIGGER-CANCEL-2-LAB-IA.md`, `PRETRIGGER-CANCEL-3-RESEARCH-LAYER.md`,
  `AUTO-PAIR-CONTROL-RUNS-1.md`, `AUTO-PAIR-CONTROL-RUNS-2-BACKEND-AUDIT.md`
- **Trade Classification:** `TRADE-CLASSIFICATION-SYSTEM-1.md`,
  `TRADE-CLASSIFICATION-PHASE-1-PLAN.md`, `TRADE-CLASSIFICATION-PHASE-1-CODEBASE-AUDIT.md`,
  `CLASSIFICATION-TAB-AAE-V2-PLAN.md`, `AAE-DEEP-ANALYSIS-1.md`, `AAE-DEEP-ANALYSIS-2.md`
- **Ghost tracking:** `ghost_tracker.py`, `ghost_tracker_test.py`, `GHOST-0-audit.md`,
  `GHOST-SYNC-0-audit.md`, `LUX-GHOST-PHASE-1-integration.md`
- **Docs / analysis (general):** `IA-Audit-OrderBlockLab.md`, `IA-Audit-Run-Detail-Page.md`,
  `OBLab-Workflow-Tab-Proposal.md`, `OB-RETEST-ANALYSIS-1.md`,
  `FULL-PIPELINE-INTEGRITY-AUDIT-1.md`, `STRUCTURE-DIRECTION-FILTERS-1.md`,
  `PRIORITY-RESET-1-prompts.md`
- **Unknown / build artifacts (verify before touching):** `package.json`,
  `package-lock.json` (these are at **repo root**, not `frontend/` — likely accidental;
  the real frontend manifest is `frontend/package.json`. Do not commit the root ones
  without confirming intent.)
- **This file:** `PROJECT_STATUS.md`

## Known Risks / Warnings

- Multiple chats are modifying `codex-dev` at the same time.
- There are often unrelated dirty files — never `git add .`, never commit the whole tree.
- Stale git locks (`.git/index.lock`) have appeared repeatedly. If git reports a lock
  and no git process is running, remove it deliberately, only after confirming no other
  chat is mid-commit.
- The user has accidentally run git commands from the backtester / output folder before.
  **Always verify the current repo path is `FX-OB-Research-Lab` before any git operation**
  (e.g. `git rev-parse --show-toplevel`).
- The branch currently has **unpushed commits** (3 ahead of `origin/codex-dev`). Do not
  push without confirming exactly which commits are included
  (`git log --oneline origin/codex-dev..HEAD`).
- Root-level `package.json` / `package-lock.json` are untracked and look out of place —
  do not commit them blindly.

## Next Recommended Prompt

Copy-paste this into the next chat before doing any work:

```
Read PROJECT_STATUS.md at the repo root. Then audit the current repo state:
1. Confirm repo path is FX-OB-Research-Lab (git rev-parse --show-toplevel).
2. Run git status --short and git log --oneline --decorate -10.
3. Compare against PROJECT_STATUS.md: note any new dirty files or new commits
   since the doc was last updated.
4. Identify which workstream I'm continuing and which exact files it should touch.
5. List unrelated dirty files I must NOT stage.
6. Report whether it is safe to continue, and what (if anything) still needs to be
   committed for Phase 4B (MasterControlsDrawer.jsx).
Do not modify, stage, commit, or push anything until I confirm.
```
