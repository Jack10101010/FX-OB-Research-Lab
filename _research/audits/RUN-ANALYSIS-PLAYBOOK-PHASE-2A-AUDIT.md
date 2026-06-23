# RUN-ANALYSIS-PLAYBOOK — PHASE 2A DRAWER UI — AUDIT

**Type:** audit + plan (AUDIT ONLY — no implementation this phase)
**Owner:** Claude (UI/UX + system audit)
**Branch verified:** `codex-dev`
**Date:** 2026-06-10
**Scope:** Plan the first usable Playbook drawer UI on top of the existing Phase-1
persistence (`playbookTemplate.js` / `playbookStore.js` / `usePlaybook.js`). Reuse existing
primitives. Global, AppShell-mounted, independent of Master Controls. No analytics/backend/
Insights changes (Insights = Phase 2B).

---

## 1. Audit findings

### 1.1 Best global trigger location
`TopBar.jsx` (the global top bar, rendered inside `AppShellLayout` on every page). It already
hosts the **"Controls"** button (Master Controls) at the right via a mirror-able pattern
(`<button>` + icon + `text-[10px] uppercase tracking-wider` label, active/idle border states,
driven by `useMasterControls().toggleMasterControls` + `isOpen`). **Add a sibling "Playbook"
button immediately left of "Controls"**, driven by a new `useRunPlaybook().toggle` + `isOpen`,
icon `ClipboardCheck`/`ListChecks`. Distinct button, distinct context — visually parallel to
Controls so it reads as a peer global tool.

### 1.2 Existing drawer patterns to reuse
- **`ui/drawer.jsx` (vaul)** — the named primitive, but it is hardcoded as a **bottom sheet** (`fixed inset-x-0 bottom-0 … rounded-t-[10px]`, `shouldScaleBackground`, a bottom drag-handle). It passes `direction` through to Root, so a right-side variant is possible, but the hardcoded `DrawerContent` className + bottom handle fight a tall right-side panel.
- **`ui/sheet.jsx`** — a Radix-Dialog **side panel** (slides from `side="right"`), purpose-built for exactly this (tall, scrollable, edge-anchored). **Recommendation: use `ui/sheet.jsx` (`side="right"`)** — it is an *existing* primitive (so "reuse, don't build new" is honored) and is the right fit for a 7-section / 36-step checklist. If you specifically require vaul, the fallback is `ui/drawer` with `direction="right"` + a `DrawerContent` className override (`fixed inset-y-0 right-0 h-screen w-[420px] mt-0 rounded-none border-l`) and the bottom handle suppressed. **I recommend Sheet; flagging the deviation from the literal "ui/drawer" mention with rationale.**
- Supporting primitives already present: **`alert-dialog.jsx`** (reset confirmation), **`collapsible.jsx`** (sections), **`radio-group.jsx`** (decision), **`checkbox.jsx`** (steps), **`scroll-area.jsx`** (scrollable body), **`button.jsx`**, **`tooltip.jsx`**, **`progress.jsx`** (optional progress bar). No new primitive needed.

### 1.3 AppShell integration point
`AppShellLayout` (in `AppShell.jsx`) renders `<MasterControlsDrawer />` as a **root-level sibling**
of the main column, inside `MasterControlsProvider`. Mirror this exactly:
- Wrap `AppShellLayout` in a **new `RunPlaybookProvider`** (sibling to `MasterControlsProvider`,
  so `TopBar` — which lives inside the layout — can read the toggle).
- Render **`<RunAnalysisPlaybookDrawer />`** as a root-level sibling (next to `<MasterControlsDrawer />`).
- **Completely independent of Master Controls:** separate provider, separate `isOpen` state,
  separate trigger. No shared context, no Preview-Lens coupling.

```
AppShell
 └─ TooltipProvider
     └─ MasterControlsProvider
         └─ RunPlaybookProvider                 ← NEW (own open-state)
             └─ AppShellLayout
                 ├─ Sidebar
                 ├─ TopBar  → [Playbook][Controls] triggers
                 ├─ GlobalPreviewBanner
                 ├─ <main>{children}</main>
                 ├─ <MasterControlsDrawer/>      (existing)
                 └─ <RunAnalysisPlaybookDrawer/> ← NEW
```

### 1.4 Existing run-selection source of truth
`useDataset()` exposes global, store-backed `ACTIVE_RUN`, `activeRunId`, `getRunData`, `SCENARIO`.
The Playbook keys everything off **`activeRunId`**. Header content reuses
**`buildBannerRunIdentity(activeRun)`** (run name + symbol·TF + date range + month span — same
helper the banners use, so it stays consistent) and optionally `useRunVariant(activeRunId)` for
the current Result View label. Checklist state = **`usePlaybook(activeRunId)`**.

### 1.5 Current active run availability across pages
`activeRunId` / `ACTIVE_RUN` are global store state available via `useDataset()` on **every** page
(persisted under `fxob_active_run_id`). So the Playbook is genuinely global and run-aware
everywhere. **No active run → empty state** ("Open or import a run to start a review"); the
drawer still opens, header shows the empty state, body is disabled.

### 1.6 Minimal file set
Three new components + one provider + two small edits (AppShell, TopBar). Everything else reused.

---

## 2. Files read
`components/ui/drawer.jsx`, `components/lab/AppShell.jsx`, `components/lab/TopBar.jsx` (trigger
pattern), `components/ui/` listing (sheet/alert-dialog/collapsible/radio-group/checkbox/scroll-area),
`data/usePlaybook.js` (return shape: `sections, decisions, runState, decision, progress{done,total},
toggleStep, setStep, setSectionCollapsed, setDecision, resetRun, isChecked, isCollapsed`).
Phase-1 `playbookTemplate.js` / `playbookStore.js` already authored.

---

## 3. Proposed file list

| Action | File | Purpose |
|---|---|---|
| **New** | `components/lab/playbook/RunPlaybookProvider.jsx` | Context: `{ isOpen, open, close, toggle }` + `useRunPlaybook()`. Independent of Master Controls. |
| **New** | `components/lab/playbook/RunAnalysisPlaybookDrawer.jsx` | The drawer: `ui/sheet` (right) → header + scrollable sections + footer. Consumes `useDataset`, `usePlaybook(activeRunId)`, `buildBannerRunIdentity`. |
| **New** | `components/lab/playbook/PlaybookSection.jsx` | One `collapsible` section: title + progress, steps (checkbox + label + optional shortcut button), or the decision radio group when `section.isDecision`. |
| **New** | `components/lab/playbook/PlaybookTrigger.jsx` | The "Playbook" TopBar button (mirrors the Controls button). |
| **Edit** | `components/lab/AppShell.jsx` | Wrap layout in `RunPlaybookProvider`; render `<RunAnalysisPlaybookDrawer/>` sibling. |
| **Edit** | `components/lab/TopBar.jsx` | Render `<PlaybookTrigger/>` left of the Controls button. |

Reused unchanged: `usePlaybook`, `playbookTemplate`, `buildBannerRunIdentity`, `useRunVariant`,
`useDataset`, `ui/sheet`, `ui/alert-dialog`, `ui/collapsible`, `ui/radio-group`, `ui/checkbox`,
`ui/scroll-area`, `ui/button`, `useNavigate` (shortcuts).

---

## 4. UI wireframe

```
┌ Run Analysis Playbook ──────────────────────────────────────── ✕ ┐
│ EURUSD Initial Test                                               │  ← buildBannerRunIdentity
│ EURUSD · 15min · 11 Sep 25 → 18 May 26 · 8 months                 │
│ Result View: Triggered Edge 25% · Arm C2        ▓▓▓▓▓░░░ 14 / 36  │  ← progress (decided steps only)
├───────────────────────────────────────────────────────────────────┤
│ ▾ Confirm Data Context                                    3 / 5   │  ← collapsible, per-section count
│    ☑ Correct run?                              [ Run Workspace ↗ ] │
│    ☑ Correct Result View?                                          │
│    ☐ Correct Position Variant?                                     │
│    ☑ Correct date range?                                           │
│    ☐ Enough trades to trust this?                                  │
│ ▸ High-Level Performance Check                            6 / 6   │  ← collapsed (state persisted)
│ ▾ Trade Quality / Weakness Discovery                     1 / 7   │
│    ☐ Losses concentrated in a session?         [ Session Lab ↗ ]  │
│    … (shortcut buttons only where the template defines them)      │
│ ▾ Segmentation / Pattern Discovery                       0 / 7   │
│ ▾ Improvement Hypothesis                                 0 / 5   │
│ ▾ Robustness / Validation                                0 / 6   │
│ ▾ Decision Outcome                            (not counted)       │  ← radio, excluded from %
│    ○ Promote candidate   ○ Needs more validation                  │
│    ○ Create filter hypothesis   ○ Create protection hypothesis    │
│    ○ Retest with modified config   ○ Reject / archive             │
├───────────────────────────────────────────────────────────────────┤
│ [ Reset Playbook ]                            (Add Insight — 2B)  │  ← footer; reset → AlertDialog
└───────────────────────────────────────────────────────────────────┘
```

- **Header:** run name (large), symbol·TF·date·months, Result View line, progress `X / 36` (+ a thin `progress` bar). Empty state when no `activeRunId`.
- **Body:** `scroll-area`; each `PLAYBOOK_SECTIONS` entry a `collapsible` (collapse state via `setSectionCollapsed`/`isCollapsed`); per-step `checkbox` (`isChecked`/`toggleStep`); shortcut buttons (`step.shortcut.{label,to}`) via `useNavigate(to)` (drawer stays open). Decision section = `radio-group` (`decision`/`setDecision`), **no checkboxes, not in progress**.
- **Footer:** Reset Playbook (→ `alert-dialog` confirm → `resetRun()`); the Add-Insight area is a stubbed placeholder labeled "(Phase 2B)".

---

## 5. Implementation plan (for the build step — not now)

1. **`RunPlaybookProvider`** — `useState(false)` + `{isOpen, open, close, toggle}`; export `useRunPlaybook`. ~25 lines.
2. **`PlaybookTrigger`** — clone the Controls button markup; `onClick={toggle}`, active styling from `isOpen`; icon `ClipboardCheck`.
3. **`PlaybookSection`** — props `{ section, isCollapsed, onToggleCollapse, isChecked, onToggleStep, decision, onSetDecision, doneCount }`. Renders steps or the decision radio.
4. **`RunAnalysisPlaybookDrawer`** — `ui/sheet side="right"` open-bound to `useRunPlaybook`; reads `activeRunId` + `buildBannerRunIdentity(activeRun)` + `useRunVariant`; `usePlaybook(activeRunId)` for state; maps `sections` → `PlaybookSection`; footer reset via `alert-dialog`.
5. **AppShell** — wrap layout in `RunPlaybookProvider`; render the drawer sibling.
6. **TopBar** — drop in `<PlaybookTrigger/>` left of Controls.
7. Validate (transpile all edited/new files; Phase-1 validator still green; grep 0 `font-mono`/`tracking-widest`).

**Commit split:** (1) provider + trigger + AppShell/TopBar wiring (drawer opens, empty), (2) section/step rendering + persistence wiring, (3) decision radio + reset confirm. Or one commit if small.

---

## 6. Validation checklist (build phase)

- [ ] Babel-transpile all new/edited files; Phase-1 `playbookStore.validate.mjs` still 25/25.
- [ ] 0 new `font-mono` / `tracking-widest`.
- [ ] **Checkbox persistence** survives page navigation, drawer close/open, and browser refresh (localStorage `fxob_playbook_v1`).
- [ ] **Decision persistence** survives the same three.
- [ ] **Switching runs** loads the correct saved state (state keyed by `activeRunId`); run A's checks never appear on run B.
- [ ] Progress shows `X / 36` and the decision selection does **not** change it.
- [ ] Collapse state persists per run.
- [ ] Shortcut buttons navigate to the correct routes; drawer stays open.
- [ ] Trigger is global (every page); drawer is independent of Master Controls (opening one never affects the other); no Preview-Lens interaction.
- [ ] No active run → calm empty state; no crash.
- [ ] Dark theme unchanged; drawer scrolls; not overwhelming.

---

## 7. Open decisions (confirm before build)
1. **Primitive:** `ui/sheet` (right) — recommended — vs literal `ui/drawer` (vaul, `direction="right"` + overrides). *(I recommend Sheet.)*
2. **Trigger label/icon:** "Playbook" + `ClipboardCheck`, placed left of "Controls". *(Recommended.)*
3. **Shortcut behavior:** keep drawer open on navigate (recommended) vs auto-close.

*End — RUN-ANALYSIS-PLAYBOOK-PHASE-2A-AUDIT. Audit only; no source files edited.*
