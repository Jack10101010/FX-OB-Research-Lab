# FX-OB-Research-Lab — Project Status

> Living source of truth for parallel Claude / Codex / GPT chats working on this repo.
> Keep it short, accurate, and current. Update it before you end your session.
> **Every new chat must also read [WORKSTREAMS.md](./WORKSTREAMS.md) and attach to a workstream before coding.**
> Last updated: 2026-06-05 — Phase 7A (instant cost rescore panel) is committed (`4616506`).
> **HEAD = `4616506`**; `origin/codex-dev` = `6c8fc60` → **2 commits ahead of origin (unpushed)**:
> `4616506` (Master Controls Phase 7A) + `3d6b5ee` (Entry/FFT FFT-tooltip copy). Refreshed against
> live `git status` / `git log`.

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
- Preview results display (Phase 4B — committed, `bdc7473`)
- Promote preview to run / Save As Run (Phase 4C — committed, `c3db5f8`)
- Active-vs-Preview compare (Phase 5 — committed, `354dcca`)
- Rerun-tier classification (Phase 6 — committed, `99f07c7`)
- Instant cost rescore panel (Phase 7A — committed, `4616506`)

Important architecture (do not violate):

- Preview bundles live **only** in `MasterControlsContext.preview.bundle`.
- Preview **execution + import** must **not** call `addRunBundle`, must **not** change
  `activeRunId`, and must **not** appear in run history / the run list. Isolation holds
  for the entire preview lifecycle — **right up until the user clicks Save As Run**.
- Promotion is the **one** deliberate crossing point: `promotePreview()` in
  `MasterControlsContext` calls `addRunBundle(preview.bundle)` **only on explicit user
  action**, then clears the preview. `addRunBundle` assigns a unique id (no overwrite),
  makes the promoted run active, and persists.
- Phase 4B preview results are read-only: extraction reads `preview.bundle.summary`
  first, then falls back to `preview.bundle.tradesByVariant` / `equityCurve`. The shared
  extractor lives in `components/masterControls/previewMetrics.js` (used by both the
  preview panel and the Phase 5 Active-vs-Preview compare).
- Phase 6 `rerunTier` is **classification only**: registry fields are tagged
  `instant_filter` / `frontend_rescore` / `backend_rescore` / `full_backtest`, and the
  preview button label + hint reflect the dirtiest dirty field's tier. **Behavior is
  unchanged — the button still runs the sidecar preview path.**
- Phase 7A cost rescore (`components/masterControls/costRescore.js`) is **display-only**:
  when the dirty set is cost-only (spread / slippage / commission) it recomputes net R /
  avg R / max DD / equity locally from `gross_r` + per-trade cost columns and shows an
  Active-vs-Rescored panel. **No backend, no sidecar, no store mutation, no run creation,
  no Strategy Map update.** Wins/losses are **preserved from original outcomes** — never
  re-derived from the new R sign. Exactness needs separable gross/cost data; otherwise the
  panel says "unavailable" and the user falls back to Run Preview. `startPreview` unchanged.

## Latest Known Master Controls Commits

From `git log` on `codex-dev` (newest first):

- `4616506` feat(master-controls): add instant cost rescore panel (Phase 7A) ← current HEAD
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

Branch position: `HEAD -> codex-dev` is at `4616506`; `origin/codex-dev` is at `6c8fc60`
(`refactor(classification): migrate consumers to flag-based suppression`). The branch is
**2 commits ahead of origin (unpushed)**: `4616506` (Master Controls Phase 7A) and
`3d6b5ee` (Entry/FFT FFT-tooltip copy) (`git log --oneline origin/codex-dev..HEAD`).

## Current Pending Step

Phase 7A (instant cost rescore panel) **has been committed** as
`4616506 feat(master-controls): add instant cost rescore panel`. When only cost fields are
dirty (spread / slippage / commission), the drawer shows a local Active-vs-Rescored panel
recomputed in-browser from `gross_r` + per-trade cost columns — **display-only: no backend,
no sidecar, no store mutation, no run creation, no Strategy Map update**. Exactness requires
separable gross/cost data; otherwise it shows "unavailable" and the user falls back to Run
Preview. No Master Controls source files remain dirty.

**Phase 7A manual QA: PASS** (live browser QA, 2026-06-07, run `imported_1780733962068`).
Verified: clean state (no panel); spread-only → Fast Rescore + Cost rescore panel;
slippage-only; commission-only (exact flat −R per trade); multiple cost fields additive;
adding RR escalates to Backend Preview and hides the cost panel; reset clears the panel.
The cost panel is display-only — no store mutation, no auto-sidecar, no console errors
(only benign Recharts width/height warnings).

**Phase 7A QA findings (2026-06-07) — tracked in `docs/ai/BACKLOG.md` → Master Controls:**

1. **Sidecar preview import "hang" — DIAGNOSED & FIXED (2026-06-07).** Timing instrumentation
   showed the import is actually fast (fetch ~24 ms, ingest ~85 ms, total ~117 ms) — **not a
   performance issue.** Root cause: the import effect (keyed on `preview.status`) **self-cancelled**
   — its first line sets status `completed → importing`, which re-ran the effect and fired the old
   cleanup, flipping a local `cancelled` flag before the async import resolved, so the final
   `status:"done"` write was skipped and the UI sat on "Importing preview bundle…" indefinitely.
   Fix (`MasterControlsContext.jsx`): replaced the `cancelled` flag with a job-id ref guard
   (`importJobRef`), reset on clear/cancel/active-run change. **Live QA passed:** preview reaches
   "Preview ready", Preview Results + Active-vs-Preview render, Save As Run appears, Clear preview
   works, active run unchanged. (Temporary timing logs have been removed.)
2. **Cost-rescore Active baseline mismatch.** The panel's Active column (~+9.8R / 33.3% /
   35 trades) doesn't match the page Trade Sanity (~+8.44R / 38%) — likely a variant/basis
   mismatch (extractor uses `primaryVariant` + raw R). Internally consistent, but trust
   requires investigation.
3. **Full-backtest tier unreachable from the drawer.** T3 fields (symbol / detection tf /
   dates) are read-only in Master Controls, so "Run Full Backtest" can't be exercised here.
   Likely acceptable for now; noted.

Next expected actions:

1. ~~Investigate the sidecar import hang~~ — **DONE**: diagnosed as a self-cancelling import
   effect, fixed with a job-id ref guard; live QA passed; temp timing logs removed.
2. Investigate the cost-rescore baseline mismatch (variant/basis) so the panel's Active
   numbers reconcile with the rest of the run view. **(still open)**
3. Only then consider Phase 7B (transient rescored bundle → live Strategy Map / report).
4. Blocked tiers — RR↑ / stop / entry / OB-depth — remain **blocked** until the exporter
   adds per-trade MFE/MAE (or candle-path) data (FX-OB-Backtester change).
5. Two commits (`4616506`, `3d6b5ee`) are ahead of origin — decide on push per the Push
   Protocol (they span two workstreams: Master Controls + Entry/FFT).

## Current Dirty Working Tree

Snapshot from `git status --short` (2026-06-05). Other chats add to this constantly —
re-run `git status --short` yourself; do not trust this list blindly.

### Modified (tracked)

Live `git status --short` at `4616506`. All Master Controls source files are committed/clean
(through Phase 7A `4616506` — including `configRegistry.js`, `MasterControlsContext.jsx`,
`MasterControlsDrawer.jsx`, `previewMetrics.js`, `costRescore.js`). Remaining modified tracked
**source** files belong to other workstreams — do **not** stage them with Master Controls:

| File | Likely workstream |
|------|-------------------|
| `frontend/src/data/importer.js` | Trade Classification / exporter (fill-state taxonomy) — verify owner before staging |
| `frontend/src/components/lab/TradeSanityStrip.jsx` | Strategy Map / Classification (research strip) |
| `frontend/src/pages/SessionLabV1/data/sessionLabV1Adapter.js` | Session Lab |

(`PROJECT_STATUS.md` and `WORKSTREAMS.md` also show as modified — this docs-update task.)

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
- **OB Retest / Retest Lab** (new workstream — see WORKSTREAMS.md): `frontend/src/data/obRetest.js`,
  `frontend/src/data/__validation__/obRetest.logictest.cjs`,
  `frontend/src/components/lab/retest/` (untracked dir), `OB-RETEST-ANALYSIS-1.md`,
  `OB-RETEST-ANALYSIS-2-PHASE-1-PLAN.md`
- **Docs / analysis (general):** `IA-Audit-OrderBlockLab.md`, `IA-Audit-Run-Detail-Page.md`,
  `OBLab-Workflow-Tab-Proposal.md`, `FULL-PIPELINE-INTEGRITY-AUDIT-1.md`,
  `STRUCTURE-DIRECTION-FILTERS-1.md`, `PRIORITY-RESET-1-prompts.md`
- **Unknown / build artifacts (verify before touching):** `package.json`,
  `package-lock.json` (these are at **repo root**, not `frontend/` — likely accidental;
  the real frontend manifest is `frontend/package.json`. Do not commit the root ones
  without confirming intent.)
- **Now tracked (committed in `4e08b35`):** `PROJECT_STATUS.md` and `WORKSTREAMS.md` are no
  longer untracked. After this refresh they will appear as **modified (tracked)** until committed.

## Known Risks / Warnings

- Multiple chats are modifying `codex-dev` at the same time.
- There are often unrelated dirty files — never `git add .`, never commit the whole tree.
- Stale git locks (`.git/index.lock`) have appeared repeatedly. If git reports a lock
  and no git process is running, remove it deliberately, only after confirming no other
  chat is mid-commit.
- The user has accidentally run git commands from the backtester / output folder before.
  **Always verify the current repo path is `FX-OB-Research-Lab` before any git operation**
  (e.g. `git rev-parse --show-toplevel`).
- The branch is currently **2 commits ahead of `origin/codex-dev`** (HEAD = `4616506`,
  origin = `6c8fc60`; unpushed: `4616506` Master Controls Phase 7A, `3d6b5ee` Entry/FFT
  FFT-tooltip copy). Confirm with `git log --oneline origin/codex-dev..HEAD` before any push —
  the unpushed set spans two workstreams, so follow the Push Protocol and ask first.
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
6. Report whether it is safe to continue. Note: Master Controls Phase 4A–4C are all
   committed; the workstream is now in QA / polish, not architecture.
Do not modify, stage, commit, or push anything until I confirm.
```
