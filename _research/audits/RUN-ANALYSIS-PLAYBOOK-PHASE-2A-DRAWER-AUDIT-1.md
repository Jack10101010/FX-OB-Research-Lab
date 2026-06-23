# Phase 2A — Run Analysis Playbook Drawer UI — Audit

*Audit only. No code written. Builds the first usable drawer on top of the already-complete persistence layer (`playbookTemplate.js` / `playbookStore.js` / `usePlaybook.js`). Independent of Master Controls. No analytics, backend, or Insights changes.*

---

## 1. Audit findings (answers to the six questions)

### 1. Best global trigger location
**`components/lab/TopBar.jsx`**, a new button immediately left of the existing **"Controls"** button (the Master Controls toggle, `data-testid="topbar-master-controls"`, far right of the bar).

Rationale: the TopBar already hosts (a) the **Run switcher** — so the run the playbook scopes to and the trigger sit side by side — and (b) the only other global drawer toggle, so users already learn "global tools live top-right." TopBar persists across every page (rendered once in `AppShellLayout`, outside `<main>`). A sidebar nav item was rejected — nav is for page routes; the playbook is an overlay on whatever page you're on, exactly like Controls.

### 2. Existing drawer patterns to reuse
- **`components/ui/drawer.jsx` (vaul)** — the required primitive. Exports `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerClose`, `DrawerTrigger`. It is a **bottom sheet** (`fixed inset-x-0 bottom-0`, `rounded-t-[10px]`, grab handle, `shouldScaleBackground`).
- **Note / decision flagged:** the **Master Controls drawer does NOT use this primitive** — `MasterControlsDrawer.jsx` is a hand-rolled **right-side** panel (`fixed inset-y-0 right-0 w-96`). So there is no precedent for `ui/drawer.jsx` actually being mounted yet. The requirement says reuse `ui/drawer.jsx / vaul`, so this drawer becomes the **first** real consumer of it (bottom sheet). This is intentional and keeps us off the MC pattern (supports the "completely independent" rule), but it means the visual language (bottom sheet vs right panel) will differ from Controls — acceptable, and worth a one-line product confirm.
- **`components/ui/alert-dialog.jsx`** — reuse for the Reset confirmation. Established usage to mirror: `components/lab/entries/promotion/PromotionDesk.jsx`, `pages/Runs.jsx`, `pages/Projects.jsx`.
- **Body primitives, all already present:** `ui/collapsible.jsx` (section collapse), `ui/checkbox.jsx` (steps), `ui/radio-group.jsx` (decision), `ui/progress.jsx` (header progress bar), `ui/scroll-area.jsx` (scrollable body), `ui/button.jsx`. **No new primitives needed.**

### 3. AppShell integration point
**`components/lab/AppShell.jsx → AppShellLayout`.** The drawer mounts as a **sibling to `<MasterControlsDrawer />`** at the end of the layout tree. Open/close state comes from a **new, MC-independent context** (`PlaybookDrawerProvider`) wrapping `AppShellLayout` — mirroring how `MasterControlsProvider` wraps it, but importing nothing from Master Controls. The TopBar trigger and the drawer both consume this small context (the trigger is rendered inside the layout, so a shared context is the clean way to connect a TopBar button to a layout-level drawer).

### 4. Existing run-selection source of truth
**`store.activeRunId`**, read via `useDataset()` from `@/data/store`:
- Persisted to `localStorage` (`LS_ACTIVE`); written by `setActiveRunId(id)` (the TopBar **RunSwitcher** is the primary writer).
- The canonical, app-wide "which run am I on" — the same value RunDetail, Strategy Map, Failures, Protection, etc. all key off.
- This is the `runId` the drawer passes to `usePlaybook(activeRunId)`.

### 5. Current active run availability across pages
Global and already everywhere: any component under `AppShell` can call `useDataset()` to read `activeRunId` and the `RUNS` summary list. The header fields come straight from the active `RUNS` entry + existing store helpers — **no analytics**:
- **Run name** → `getRunDisplayName(activeRun)`
- **Symbol** → `activeRun.symbol`
- **TF** → `compactTimeframe(activeRun.detectionTf)` (and `executionTf` available)
- **Date range** → `activeRun.dateRange` (store already formats `date_from → date_to`)
- **Progress** → `usePlaybook().progress` → `{ done, total }`, `total = 36` from `allStepIds()`.

Edge case: `activeRunId` can be `null` ("No Active Run"). `usePlaybook(null)` already returns safe-empty state, so the drawer must render a friendly empty/disabled state rather than crash.

### 6. Minimal file set required
**2 edits + 3 new files** (a 4th optional). Detailed in §3.

---

## 2. Files read

- `frontend/src/data/playbookTemplate.js` — `PLAYBOOK_SECTIONS` (7 sections, **36 checkable steps**: context 5, performance 6, weakness 7, segmentation 7, improvement 5, robustness 6; decision section = 0 steps, `isDecision:true`), `PLAYBOOK_DECISIONS` (6 outcomes), `allStepIds`, `isKnownStepId/DecisionId`. Steps may carry `shortcut: { label, to }`; performance carries a non-blocking `branchHint`.
- `frontend/src/data/usePlaybook.js` — hook API: `{ sections, decisions, runState, decision, progress, toggleStep, setStep, setSectionCollapsed, setDecision, resetRun, isChecked, isCollapsed }`. Loads once via `useState(() => loadPlaybook())`; every action persists via `savePlaybook`.
- `frontend/src/data/playbookStore.js` — per-run localStorage layer (`fxob_playbook_v1`), keyed `byRun[runId]`, stores only `true` flags; `computeProgress` counts only template ids; `withResetRun` clears a run.
- `frontend/src/components/ui/drawer.jsx` — vaul bottom-sheet primitive (full export surface above).
- `frontend/src/components/lab/AppShell.jsx` — `AppShell` → `MasterControlsProvider` → `AppShellLayout`; `MasterControlsDrawer` mounted at layout end; `PageHeader` helper.
- `frontend/src/components/lab/TopBar.jsx` — global bar; `RunSwitcher` (reads `RUNS`/`activeRunId`, writes `setActiveRunId`); the Controls toggle button (trigger pattern to mirror).
- `frontend/src/data/store.js` — `activeRunId` (persisted `LS_ACTIVE`), `useDataset`, `getRunDisplayName`, `compactTimeframe`, run-summary fields (`symbol`, `detectionTf`, `executionTf`, `dateRange`).
- `frontend/src/components/ui/` (listing) — confirmed `collapsible`, `checkbox`, `radio-group`, `progress`, `scroll-area`, `alert-dialog`, `button` all exist.
- `frontend/src/App.js` — confirmed `/runs/active` route (`ActiveRunRedirect`) exists, so step shortcuts resolve.

---

## 3. Proposed file list

**New (3):**

1. `components/playbook/PlaybookDrawerContext.jsx` — tiny provider exposing `{ isOpen, openPlaybook, closePlaybook, togglePlaybook }`. **Imports nothing from Master Controls.** ~40 lines.
2. `components/playbook/RunAnalysisPlaybookDrawer.jsx` — the drawer. Consumes `usePlaybook(activeRunId)` + `useDataset()` (header meta) + `PlaybookDrawerContext` (open state) + `react-router` `useNavigate` (shortcuts). Renders header / body / decision / footer. ~220 lines.
3. `components/playbook/PlaybookSection.jsx` — one collapsible section (title + progress pip + steps + optional `branchHint` + shortcut buttons). Keeps the drawer file readable. ~90 lines. *(Could be inlined; kept separate for clarity.)*

**Edited (2):**

4. `components/lab/AppShell.jsx` — wrap `AppShellLayout` with `<PlaybookDrawerProvider>` (sibling-independent of `MasterControlsProvider`) and mount `<RunAnalysisPlaybookDrawer />` next to `<MasterControlsDrawer />`.
5. `components/lab/TopBar.jsx` — add the "Playbook" trigger button (icon `ClipboardCheck` or `BookOpenCheck`) that calls `togglePlaybook()`; show a subtle `done/total` badge when `done > 0`.

**Optional (1):** the Reset confirmation can live inline in the drawer using `ui/alert-dialog.jsx` (no separate file). Only split out (`PlaybookResetDialog.jsx`) if it grows.

**No changes** to: any `data/*` analytics, `masterControls/*`, importer, backend, or Insights. Persistence layer is consumed **as-is**.

---

## 4. UI wireframe (vaul bottom sheet)

```
╔════════════════════════════════════════════════════════════════════╗
║                              ──────                                  ║  ← grab handle
║  Run Analysis Playbook                                        [ ✕ ]  ║  DrawerTitle
║  ┌──────────────────────────────────────────────────────────────┐  ║
║  │ EURUSD_M5_RR3              Symbol EURUSD · TF M5               │  ║  Header
║  │ 2023-01-01 → 2024-06-30           Progress  ▓▓▓▓▓░░░░  14 / 36 │  ║  (ui/progress)
║  └──────────────────────────────────────────────────────────────┘  ║
║ ──────────────────────────────────────────────────────────────────  ║
║  ▼ Confirm Data Context                                       3 / 5  ║  ← Collapsible
║      ☑ Am I looking at the correct run?      [ Run Workspace → ]     ║  step + shortcut
║      ☑ Correct Result View?                                         ║
║      ☐ Correct Position Variant?                                    ║
║      ☑ Correct date range?                                          ║
║      ☐ Enough trades to trust this result?                          ║
║                                                                     ║
║  ▶ High-Level Performance Check                              6 / 6 ✓ ║  ← collapsed
║  ▼ Trade Quality / Weakness Discovery                        2 / 7  ║
║      ☐ Losses concentrated in a session?     [ Session Lab → ]      ║
║      ☐ Losses concentrated in CHoCH or BOS?  [ Strategy Map → ]     ║
║      …                                                              ║
║      ⓘ Bad stats → Weakness · Good → Robustness · Mixed → Segment   ║  ← branchHint
║                                                                     ║
║  ▶ Segmentation / Pattern Discovery                          0 / 7  ║
║  ▶ Improvement Hypothesis                                    0 / 5  ║
║  ▶ Robustness / Validation                                  0 / 6  ║
║ ──────────────────────────────────────────────────────────────────  ║
║  Decision Outcome              (does not affect completion %)        ║  ← radio-group
║      ○ Promote candidate            ○ Create protection hypothesis   ║
║      ◉ Needs more validation        ○ Retest with modified config   ║
║      ○ Create filter hypothesis     ○ Reject / archive               ║
║ ──────────────────────────────────────────────────────────────────  ║
║                                       [ Reset Playbook ]  [ Done ]   ║  Footer
╚════════════════════════════════════════════════════════════════════╝

Reset confirmation (ui/alert-dialog):
┌───────────────────────────────────────────────┐
│  Reset this run's playbook?                    │
│  Clears all 36 checkboxes, collapse states,    │
│  and the decision for EURUSD_M5_RR3. Other     │
│  runs are unaffected. This can't be undone.    │
│                       [ Cancel ]  [ Reset ]    │
└───────────────────────────────────────────────┘

Empty state (activeRunId === null):
║  Run Analysis Playbook                                   [ ✕ ]      ║
║   No active run. Pick a run in the top bar to start its playbook.   ║
```

Layout notes: header is fixed; the section list sits in a `ScrollArea` (sheet capped ~`mt-24`/`h-auto`); decision + footer pinned below the scroll region. Section header row shows a per-section `done/total` pip derived locally from `isChecked` over that section's step ids (display only — global progress still comes from `usePlaybook().progress`). Typography per `AGENTS.md`: `font-ui` for labels, `font-num` for the `14 / 36` counts, no `tracking-widest`, shortcut chips use `text-[10.5px]` natural-case `row-chip` styling.

---

## 5. Implementation plan (for the build phase — not executed now)

1. **`PlaybookDrawerContext.jsx`** — `createContext` + `PlaybookDrawerProvider` holding `useState(false)` and `open/close/toggle` callbacks; `usePlaybookDrawer()` hook. Zero MC imports. (Independence requirement satisfied structurally.)
2. **Wire AppShell** — wrap `AppShellLayout` in `<PlaybookDrawerProvider>` (outside or inside `MasterControlsProvider`, but not coupled); mount `<RunAnalysisPlaybookDrawer />` beside `<MasterControlsDrawer />`. The drawer's `open` ⇄ `isOpen`, `onOpenChange` ⇄ `open/close`.
3. **TopBar trigger** — add the Playbook button mirroring the Controls button's markup/`clip-bevel-sm` styling; `onClick={togglePlaybook}`; optional `done/total` badge. Keep `data-testid="topbar-playbook"` for parity with `topbar-master-controls`.
4. **Drawer header** — read `activeRunId` + `RUNS` via `useDataset()`; render `getRunDisplayName`, `symbol`, `compactTimeframe(detectionTf)`, `dateRange`, and `<Progress value={done/total*100}/>` + `{done} / {total}`. Handle `activeRunId === null` → empty state.
5. **Drawer body** — `usePlaybook(activeRunId)`; map `sections` (skip `isDecision`) → `PlaybookSection`, each `Collapsible` whose `open` is `!isCollapsed(section.id)` and `onOpenChange` → `setSectionCollapsed(id, !open)`. Per step: `Checkbox` bound to `isChecked(step.id)` / `toggleStep(step.id)`; render `step.shortcut` as a button → `navigate(shortcut.to)` (optionally `closePlaybook()` on navigate). Render `section.branchHint` as a muted hint row.
6. **Decision section** — `RadioGroup` over `decisions`, `value={decision}`, `onValueChange={setDecision}`; label clarifies it does not affect progress. (Already true: decision section contributes 0 steps to `total = 36`.)
7. **Footer** — `Done` = `closePlaybook`; `Reset Playbook` opens the `alert-dialog`; confirm → `resetRun()`.
8. **Manual validation pass** (maps 1:1 to the stated requirements):
   - Check several boxes → navigate to another page → reopen: state intact (long-lived hook + persisted).
   - Close/open drawer: state intact.
   - Browser refresh: state reloads from `localStorage` via `loadPlaybook()`.
   - Set a decision → refresh: decision intact; confirm `done/total` unchanged by the decision.
   - Switch run in the RunSwitcher: drawer reloads that run's saved boxes/decision; original run still independent.
   - Run `playbookStore.validate.mjs` (unchanged) to confirm the persistence contract still passes.
   - Typography greps from `AGENTS.md` §6 (`font-mono`, `tracking-widest`) → expect 0 hits in the new files.
9. **Scoped commit** — only the 3 new `components/playbook/*` files + the 2 edited shell files (`AppShell.jsx`, `TopBar.jsx`). No `git add .`.

---

## Risks / decisions to confirm before building

- **Bottom sheet vs right panel.** `ui/drawer.jsx` (required) is a bottom sheet; Master Controls is a right-side panel. The two global drawers will look different. Confirm that's acceptable, or we adapt vaul to a side variant. *(Recommend: accept — it reinforces independence and signals a different tool.)*
- **Drawer always-mounted.** Keeping `<RunAnalysisPlaybookDrawer />` mounted (vaul toggled via `open`) is what gives in-memory persistence across close/open + navigation. Confirm we don't conditionally unmount it.
- **`branchHint` placement.** Spec says shortcut buttons "if the template defines them"; `branchHint` is template-defined too but non-blocking — rendered as a hint, not enforced. Confirmed surfaced read-only.
- **No Insights yet.** The decision section's future "Add insight" action (Phase 2B) is intentionally omitted; only the radio outcome ships now.

*Conclusion: the persistence layer is complete and sufficient; this phase is pure UI assembly from existing primitives — 3 new files, 2 small shell edits, no analytics/backend/MC coupling. Ready to implement on approval.*
