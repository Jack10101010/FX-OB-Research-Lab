# RUN-ANALYSIS-PLAYBOOK-AUDIT-1

**Type:** audit + plan (AUDIT ONLY — no implementation)
**Owner:** Claude (product + UI/UX + system audit)
**Branch verified:** `codex-dev` · HEAD `59974db`
**Date:** 2026-06-10
**Scope:** Plan a global, run-specific "Run Analysis Playbook" side drawer with a guided
decision-tree checklist (per-run state) and an "Add Insight" action that writes into the existing
Insights store. Audit only — no source changes. No analytics logic touched; no Master Controls /
Preview Lens coupling.

> **Recommended product name:** **Run Analysis Playbook** (drawer title), trigger label
> **"Playbook"**. Clear, action-oriented, not overloaded with "Checklist/Guide".

---

## §1 — What already exists (reuse map)

| Need | Found | Reuse decision |
|---|---|---|
| Side drawer | `components/ui/drawer.jsx` (wraps `vaul`; `Drawer/Trigger/Portal/Overlay/Content/Header/Footer/Close`, passes `direction` through) | **Reuse** with `direction="right"` for a right-side slide-over. |
| Master Controls drawer | `components/masterControls/MasterControlsDrawer.jsx` + `MasterControlsContext` (own provider, own trigger `openMasterControls`) | **Keep separate** — distinct provider/trigger/state; never share open-state with the Playbook. |
| Global mount point | `components/lab/AppShell.jsx` → `AppShellLayout` mounts `<Sidebar/>`, `<GlobalPreviewBanner/>`, `<MasterControlsDrawer/>` | **Mount the Playbook drawer + provider here**, mirroring the MC pattern. |
| Insights write | `store.addProjectFinding(projectId, finding)` (store.js:1526) → prepends to `project.findings`; `buildResearchFindingPayload({source,title,note,runId,tag,…})` (projectWorkflow.js:165) | **Reuse both.** Findings are stored **per project**, surfaced by `pages/Insights.jsx` (aggregates `project.findings`). |
| Insights source taxonomy | `classifyFindingSource` + `FINDING_SOURCE_FILTERS` (projectWorkflow.js:142/150): manual · run_workspace · table_compare · edge_explorer · comparison | **Add `run_review`** (small additive change) so Playbook insights are filterable; fallback = reuse `run_workspace`. |
| Persistence convention | `fxob_*_v1` localStorage keys in store.js (`LS_SCENARIO="fxob_scenario_v1"`, etc.) | **New key** `fxob_playbook_v1`, new tiny storage module. |
| Run / Result-View context | `useRunVariant(runId)` (resultView + universe), `useDataset()` (`ACTIVE_RUN`, `activeRunId`, `ACTIVE_PROJECT`, `SCENARIO`), `buildBannerRunIdentity` | **Reuse** for the drawer header + insight payload. |
| Routing | `react-router` `NavLink`/`Link`/`useNavigate`. Confirmed paths (Sidebar): `/failures-lab` `/session-lab` `/strategy-map` `/order-block-lab` `/hypothesis-lab` `/comparison` `/walk-forward` `/monte-carlo` `/insights` `/protection-lab` `/entries-lab` `/trade-inspector` `/runs/active` | **Reuse** for step shortcut buttons. |

**Net:** every dependency exists. The Playbook is a **new component + hook + storage module**, mounted in `AppShell`, that *composes* existing selectors/store calls. Only one small shared-file touch is recommended (the `run_review` source filter).

---

## §2 — Product decision tree (checklist content)

Seven sections, with one branch after §2 (High-level check). Each step is a checkable item; some carry a shortcut button.

```
1 · CONFIRM DATA CONTEXT                                  (orientation — answer before trusting anything)
   ☐ Correct run?                          → [Run Workspace /runs/active]
   ☐ Correct Result View?                  (banner shows it)
   ☐ Correct Position Variant?
   ☐ Correct date range?
   ☐ Enough trades to trust this? (decided-trade count)

2 · HIGH-LEVEL PERFORMANCE CHECK
   ☐ Net R positive?      ☐ Win rate healthy?     ☐ Profit factor acceptable?
   ☐ Max drawdown survivable?   ☐ Expectancy positive?   ☐ Enough DECIDED trades?
        ├─ stats BAD   → §3 Weakness discovery
        ├─ stats GOOD  → §6 Robustness / validation
        └─ stats MIXED → §4 Segmentation
   (Branch is a hint chip, not enforced — user can jump anywhere.)

3 · TRADE QUALITY / WEAKNESS DISCOVERY
   ☐ Losses concentrated in a session?     → [Session Lab /session-lab]
   ☐ Losses concentrated in CHoCH vs BOS?  → [Strategy Map /strategy-map]
   ☐ Losses concentrated by direction?
   ☐ Losses concentrated by fill mode / Result View?
   ☐ Fast stop-outs common?                → [Failures Lab /failures-lab]
   ☐ False losers present?                 → [Failures Lab]
   ☐ Distance-to-stop / MFE / MAE clues?   → [Failures Lab]
        (also: [Order Block Lab], [Hypothesis Lab])

4 · SEGMENTATION / PATTERN DISCOVERY
   ☐ Session performance       → [Session Lab]
   ☐ Direction performance     → [Strategy Map]
   ☐ Structure type (BOS/CHoCH)
   ☐ Entry model               → [Entries Lab]
   ☐ Result View / variant
   ☐ Time period / regime (if available)
   ☐ OB quality / lifecycle    → [Order Block Lab]

5 · IMPROVEMENT HYPOTHESIS
   ☐ What filter removes bad trades?       → [Hypothesis Lab /hypothesis-lab]
   ☐ What protection rule reduces damage?  → [Protection Lab /protection-lab]
   ☐ What entry rule improves timing?
   ☐ What session/direction/model to exclude?
   ☐ What requires a NEW backtest?

6 · ROBUSTNESS / VALIDATION
   ☐ Edge holds across date ranges?
   ☐ Holds across runs?                    → [Comparison Lab /comparison]
   ☐ Holds in walk-forward?                → [Walk-Forward /walk-forward]
   ☐ Monte Carlo ruin risk?                → [Monte Carlo /monte-carlo]
   ☐ Regime-dependent?
   ☐ Sample size enough?

7 · DECISION OUTCOME   (single-select, radio)
   ○ Promote candidate   ○ Needs more validation   ○ Create filter hypothesis
   ○ Create protection hypothesis   ○ Retest with modified config   ○ Reject / archive
   → [Add insight from this review]
```

The decision branch after §2 renders as a **non-blocking hint** ("Stats look mixed → try Segmentation") with a jump link — never gates the checklist.

---

## §3 — Recommended sidebar UX

- **Trigger:** a compact **"Playbook"** button in the global `TopBar` (right side), available on every lab page. Floating-tab alternative on the right edge if TopBar is crowded. Distinct from the Master Controls trigger.
- **Drawer:** right-side slide-over (`ui/drawer` `direction="right"`), ~380–420px wide, dark premium surface matching the lab. Scroll-y body; sticky header + sticky footer.
- **Header (sticky):** run identity via `buildBannerRunIdentity(activeRun)` — run name + symbol·TF + date range — plus the current **Result View** + **Position Variant** (from `useRunVariant`). A small "X of N steps done" progress chip. If no active run: a calm empty state ("Open or import a run to start a review").
- **Body:** the 7 sections as collapsible groups (all expanded by default; collapse state remembered). Each step = a checkbox + label; shortcut steps show a small ghost button (e.g. `Session Lab ↗`) that navigates via `useNavigate` (drawer can stay open or auto-close — recommend stay open). §7 is a radio group.
- **Footer (sticky) — Add Insight:** a textarea ("Add insight from this review"), an optional short title input, an optional tag/category select (reuse the source/decision context), and a **Save Insight** button. On save → toast + the insight appears on `/insights`. The selected §7 decision is captured into the insight note/tag.
- **Reset:** a small "Reset this run's checklist" affordance (clears only the current run's state).
- **Compactness:** dense rows (`text-[11px]–[12px]`), no per-step descriptions by default (tooltip on hover for the "why"). Sections keep it scannable.

---

## §4 — Data model (per-run checklist persistence)

Template (the step definitions) is a **static module constant**; only completion state is persisted, keyed per `runId`.

```ts
// localStorage key: "fxob_playbook_v1"
PlaybookState = {
  version: 1,
  byRun: {
    [runId: string]: {
      steps:    { [stepId: string]: boolean },   // checked steps
      sections: { [sectionId: string]: boolean }, // collapsed sections (optional)
      decision: string | null,                    // §7 single-select id
      updatedAt: string,                          // ISO
    }
  }
}
```

- **Template** lives in `data/playbookTemplate.js` (pure): `PLAYBOOK_SECTIONS = [{ id, title, steps: [{ id, label, tip?, shortcut?: { label, to } }] }]`, plus `PLAYBOOK_DECISIONS`. Step IDs are stable strings (e.g. `ctx.correct_run`, `perf.net_r`) so saved state survives template edits (unknown ids ignored; new ids default unchecked).
- **Storage module** `data/playbookStore.js` (pure, mirrors the `loadPersistedScenario`/`persistScenario` pattern): `loadPlaybook()`, `getRunPlaybook(runId)`, `setStep(runId, stepId, value)`, `setDecision(runId, id)`, `resetRun(runId)`, `clearRunPlaybook(runId)`. localStorage-backed, defensive try/catch, version-gated.
- **Hook** `data/usePlaybook.js`: `usePlaybook(runId)` → `{ state, toggleStep, setDecision, reset, progress: {done,total} }`, subscribing via a tiny event emitter or `useState`+storage. Per-run; switching runs swaps state cleanly.

Per-run is satisfied because every read/write is keyed by `runId` (from `useRunVariant`/`activeRunId`).

---

## §5 — Insights integration plan

Findings are stored **on the project** (`project.findings`), aggregated by `pages/Insights.jsx`. So a Playbook insight must resolve a `projectId`.

**Save flow:**
```js
const projectId = ACTIVE_PROJECT?.id || activeRun?.projectId || activeProjectId || null;
const payload = buildResearchFindingPayload({
  source: "run_review",                  // new source (see below); fallback "run_workspace"
  type: "finding",
  title: title || `Run review — ${runName}`,
  note,
  runId: activeRunId,
  tag: decisionId || undefined,          // §7 decision as the tag
  universeKey: universe?.sourceKey,      // Result View context
  metaExtra: { resultView: universe?.label, positionVariant: universe?.variant, decision: decisionId },
});
const entry = addProjectFinding(projectId, payload);
```
- It "attaches to the current run" via `runId`/`sourceRunId` (the existing finding shape already carries these) and shows on `/insights` immediately (same store).
- **Gotcha — no project:** `addProjectFinding` returns `null` if `projectId` is falsy/invalid. If the active run isn't assigned to a project, **disable Save** with a hint ("Assign this run to a project to save insights") + a link to `/projects`. Do **not** silently drop the insight.
- **Source filter (small, additive, recommended):** add `"run_review"` to `classifyFindingSource` + a `{ value: "run_review", label: "Run Review" }` entry in `FINDING_SOURCE_FILTERS` (projectWorkflow.js) so Playbook insights are filterable on the Insights page. **Safest fallback if we don't want to touch shared files:** pass `source: "run_workspace"` (already recognized) — Playbook insights then group under "Run Workspace". Recommend the additive `run_review`.

No new Insights store/page needed — reuse end-to-end.

---

## §6 — Component architecture

```
data/playbookTemplate.js     (pure)   PLAYBOOK_SECTIONS, PLAYBOOK_DECISIONS  + step ids
data/playbookStore.js        (pure)   localStorage read/write, fxob_playbook_v1, version-gated
data/usePlaybook.js          (hook)   usePlaybook(runId) → state + actions + progress
components/lab/playbook/
  PlaybookProvider.jsx        context: { isOpen, open, close, toggle }   (separate from MasterControls)
  RunAnalysisPlaybook.jsx     the drawer (ui/drawer right) — header + sections + footer
  PlaybookSection.jsx         collapsible group of steps
  PlaybookStep.jsx            checkbox row + optional shortcut button (useNavigate)
  AddInsightPanel.jsx         textarea/title/tag + Save → addProjectFinding
  PlaybookTrigger.jsx         the global "Playbook" button (mounted in TopBar)
AppShell.jsx                  mount <PlaybookProvider> + <RunAnalysisPlaybook/> (+ trigger via TopBar)
```

- **Read-only-ish**: the Playbook never changes analytics; it only reads context selectors and writes (a) its own localStorage and (b) Insights via the existing store call.
- **No coupling** to `MasterControlsContext` / Preview Lens.
- Validation `.mjs` for the pure store + template (step-id stability, per-run isolation, version gating).

---

## §7 — Files likely to change / add

| Action | File | Note |
|---|---|---|
| **New** | `data/playbookTemplate.js` | step/section/decision definitions (pure). |
| **New** | `data/playbookStore.js` | per-run localStorage persistence (pure). |
| **New** | `data/usePlaybook.js` | React hook. |
| **New** | `components/lab/playbook/*` (5 files above) | drawer + provider + step/section + add-insight + trigger. |
| **New** | `data/__validation__/playbookStore.validate.mjs` | pure-logic tests. |
| **Edit** | `components/lab/AppShell.jsx` | mount provider + drawer (mirror MC pattern). |
| **Edit** | `components/lab/TopBar.jsx` | add the "Playbook" trigger button. |
| **Edit (small, optional)** | `data/projectWorkflow.js` | add `run_review` source + filter entry. |

**Do NOT touch:** `masterControls/*`, tradeUniverse semantics, importer, analytics modules, any banner files.

---

## §8 — Risks / blockers

| # | Risk | Mitigation |
|---|---|---|
| R1 | No active project → `addProjectFinding` returns null (insight lost). | Resolve `projectId` from ACTIVE_PROJECT → run.projectId → activeProjectId; if none, **disable Save** with a link to assign a project. |
| R2 | Two right-side drawers (Playbook + Master Controls) could collide. | Separate providers; ensure only the relevant trigger opens each; both can't usefully be open at once (acceptable — independent state, no shared edge ownership logic). |
| R3 | `vaul` defaults to a bottom sheet; right-side needs `direction="right"`. | Pass `direction="right"`; if styling fights the primitive, fall back to a lightweight fixed slide-over (`fixed right-0 inset-y-0`). |
| R4 | Template edits orphan saved state. | Stable string step-ids; loader ignores unknown ids, defaults new ids unchecked; `version` gate. |
| R5 | Per-run state bloat in localStorage. | Only store booleans + decision per run; prune entries for runs no longer present on load (optional GC). |
| R6 | Shared `projectWorkflow.js` edit for the source filter. | Keep it additive (one source + one filter row); or take the zero-touch fallback (`source:"run_workspace"`). |
| R7 | Result View context drift (Session Lab uses local primary, etc.). | Header reads the SAME `useRunVariant`/universe the page uses; truthful by construction. |

**Blockers:** none. Decisions to confirm: (a) trigger placement (TopBar button — recommended — vs floating tab); (b) `run_review` source vs reuse `run_workspace`; (c) drawer stays open vs auto-closes on a shortcut jump (recommend stays open).

---

## §9 — Implementation phases

**Phase 1 — Persistence core (no UI).** `playbookTemplate.js` + `playbookStore.js` + `usePlaybook.js` + validator. Pure, testable.

**Phase 2 — Drawer shell + trigger (no insights yet).** `PlaybookProvider`, `RunAnalysisPlaybook` (header from `useRunVariant`, sections/steps, progress), `PlaybookTrigger`; mount in `AppShell` + TopBar. Checklist fully works + persists per run.

**Phase 3 — Shortcuts.** Wire step shortcut buttons to routes via `useNavigate` (drawer stays open).

**Phase 4 — Add Insight.** `AddInsightPanel` → `addProjectFinding`/`buildResearchFindingPayload`; project-resolution + disabled-state; toast; verify it lands on `/insights`. (Optional: `run_review` source filter.)

**Phase 5 — Polish.** Decision §7 radio, reset-per-run, collapse memory, empty states, tooltips.

Phases 1–2 deliver the usable checklist; 4 delivers the insight loop.

---

## §10 — Validation checklist

- [ ] Babel-transpile every new/edited file; pure validator green (per-run isolation, version gate, unknown-id tolerance).
- [ ] `grep` → 0 `font-mono` / `tracking-widest` in new JSX.
- [ ] Checklist state persists per `runId` across reload; switching runs swaps state; reset clears only the current run.
- [ ] Drawer opens from the global trigger on every lab page; does not open/affect the Master Controls drawer; no Preview-Lens interaction.
- [ ] Header shows correct run name + symbol·TF + date range + Result View + Position Variant (matches the page banner).
- [ ] Shortcut buttons navigate to the correct routes.
- [ ] Save Insight writes to the active run's project, appears on `/insights`, carries runId + Result View context + decision tag; Save disabled with guidance when no project.
- [ ] No analytics/importer/tradeUniverse/Master Controls files changed beyond the optional one-line source filter.
- [ ] Dark theme unchanged; drawer compact, not overwhelming.

---

## §11 — One commit or split?

**Split by phase (4–5 commits):**
1. `feat(playbook): per-run checklist persistence core` (template + store + hook + validator).
2. `feat(playbook): run analysis drawer + global trigger` (drawer shell, AppShell + TopBar mount).
3. `feat(playbook): step shortcut navigation`.
4. `feat(playbook): add-insight from review → Insights` (+ optional `run_review` source).
5. `polish(playbook): decision outcome, reset, empty states`.

Splitting isolates the pure persistence core (independently testable) from the UI and from the Insights write (the only cross-store integration), and lets the checklist ship before the insight loop. Commits 1–2 are the MVP gate.

*End — RUN-ANALYSIS-PLAYBOOK-AUDIT-1. Audit only; no source files were edited (banner tone change committed separately).*
