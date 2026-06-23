# GHOST-SYNC-0 Audit Report
**Reconcile Duplicate Ghost Work Across Claude Chats**
**Date:** 2026-06-03
**Status:** Audit complete — no files modified

---

## 1. Git Status Summary

```
 M frontend/src/components/lab/CandleChart.jsx
 M frontend/src/components/lab/CanonicalBucketTable.jsx
 M frontend/src/components/lab/entries/model/ModelAnalysis.jsx
 M frontend/src/data/importer.js
 M frontend/src/data/obLifecycle.js
 M frontend/src/pages/OrderBlockLab.jsx
 M frontend/src/pages/StrategyMap.jsx
 M frontend/src/pages/strategyMap/useResolvedScenario.js
?? GHOST-0-audit.md
?? GHOST-SYNC-0-audit.md
?? IA-Audit-OrderBlockLab.md
?? IA-Audit-Run-Detail-Page.md
?? OBLab-Workflow-Tab-Proposal.md
?? PRETRIGGER-CANCEL-1.md
?? PRETRIGGER-CANCEL-2-LAB-IA.md
?? TE-DELAY-1-audit.md
?? frontend/src/components/lab/OBLabTabShell.jsx
?? frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx
```

**8 modified tracked files · 2 new untracked components · multiple audit docs**

Diff stat: `247 insertions(+), 8 deletions(-)` across the 8 tracked files.

All 10 code files (8 modified + 2 untracked) pass Babel parse ✅

---

## 2. File Inventory

| File | Status | Ghost-related? | Overlap with e9a6672? |
|------|--------|---------------|----------------------|
| `frontend/src/data/importer.js` | Modified (unstaged) | ✅ Yes | ❌ New |
| `frontend/src/data/obLifecycle.js` | Modified (unstaged) | ✅ Yes | ❌ New |
| `frontend/src/pages/StrategyMap.jsx` | Modified (unstaged) | ✅ Yes | ❌ New |
| `frontend/src/pages/strategyMap/useResolvedScenario.js` | Modified (unstaged) | ✅ Yes | ❌ New |
| `frontend/src/components/lab/entries/model/ModelAnalysis.jsx` | Modified (unstaged) | ✅ Yes | ❌ New |
| `frontend/src/components/lab/CandleChart.jsx` | Modified (unstaged) | ✅ Yes | ❌ New |
| `frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx` | New (untracked) | ✅ Yes | ❌ New |
| `frontend/src/components/lab/OBLabTabShell.jsx` | New (untracked) | ❌ No | ❌ New (import already committed) |
| `frontend/src/pages/OrderBlockLab.jsx` | Modified (unstaged) | ❌ No | ⚠️ Extension of committed work |
| `frontend/src/components/lab/CanonicalBucketTable.jsx` | Modified (unstaged) | ❌ No | ⚠️ Extension of committed work |

**Spec path discrepancies (spec vs actual):**

| Spec path | Actual path | Status |
|-----------|-------------|--------|
| `frontend/src/utils/obLifecycle.js` | `frontend/src/data/obLifecycle.js` | found at correct path |
| `frontend/src/pages/entries/ModelAnalysis.jsx` | `frontend/src/components/lab/entries/model/ModelAnalysis.jsx` | found at correct path |
| `frontend/src/components/lab/GhostOutcomePanel.jsx` | `frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx` | found at correct path |
| `frontend/src/hooks/useResolvedScenario.js` | `frontend/src/pages/strategyMap/useResolvedScenario.js` | found at correct path |
| `frontend/src/components/charts/CandleChart.jsx` | `frontend/src/components/lab/CandleChart.jsx` | found at correct path |
| `frontend/src/pages/RunDetail.jsx` | `frontend/src/pages/RunDetail.jsx` | **clean — already committed** |

---

## 3. Duplicate / Conflict Findings

### Two chats, two layers — no duplication

The two Claude chats each worked on a **different layer** of the ghost stack:

**Chat 2 (committed in e9a6672):** Run-level ghost summary
- `RunDetail.jsx` — ghost KPI strip reading `summary.ghost_candidates_total`, `summary.ghost_wins`, `summary.ghost_losses`, `summary.ghost_never_triggered`, `summary.ghost_net_r`
- `OrderBlockLab.jsx` — OBLabTabShell wiring + `hideResultsBasis/hideChip/basisFooter` on 4 bucket tables

**Chat 1 (current unstaged):** Trade/OB-level ghost parsing and display
- `importer.js` — parse ghost fields from CSV + populate those exact summary aggregates in `ingestRunBundle`
- `obLifecycle.js` — ghost fields in `deriveOBLifecycle`
- `StrategyMap.jsx` + `useResolvedScenario.js` + `CandleChart.jsx` — ghost overlay badges on the chart
- `ModelAnalysis.jsx` + `GhostOutcomePanel.jsx` — ghost outcome panel in entry analysis

**No features appear twice. No components are duplicated. No constants are re-declared. No imports conflict.**

---

### Critical dependency: RunDetail ← importer.js (unstaged)

`RunDetail.jsx` (committed) reads these summary fields at runtime:
```
summary.ghost_candidates_total
summary.ghost_wins / ghost_losses / ghost_never_triggered
summary.ghost_net_r
```

These fields are **only populated by the unstaged `importer.js` changes** (`ingestRunBundle` function). Until `importer.js` is committed, the RunDetail ghost KPI strip will silently show zeros/dashes on all bundles — no error, but non-functional. This is not a blocker (safe fallback), but it means **Chat 2's RunDetail work is incomplete without Chat 1's importer changes.**

---

### OrderBlockLab.jsx — Chat 2 extended Chat 1's commit

Chat 2 added `hideResultsBasis/hideChip/basisFooter` to **4** bucket tables in the committed `e9a6672`. The current unstaged diff adds the same props to **7 more** bucket tables — same pattern, same props, no collision. These are additive and safe.

Chat 2 also added in the unstaged diff:
- `showDefaultStatusBadges={false}` on LabRunHero (prop exists in committed `LabRunHero.jsx`)
- Removed `HeroBadge` trade count chip from the header
- `VariantSelector` no longer renders for single-variant runs

All three changes are self-contained UI polish. No ghost relationship.

---

### CanonicalBucketTable.jsx — two changes, one unrelated

The unstaged diff has **two separate changes**:
1. `className={popOpen ? "z-50" : undefined}` — z-index fix (the GHOST-0 audit noted this)
2. `<Info>` tooltip wrapped in `<span title={info}>` — tooltip event propagation fix, same origin as #1

Neither change is ghost-related. Neither conflicts with the committed version (which added the `hideResultsBasis/hideChip/basisFooter` props in e9a6672 — different lines, no overlap).

---

### No conflicts found anywhere

- Zero stale references
- Zero undefined variables from ghost fields
- Zero broken component names or mismatched prop names
- `obLookupKey` is defined at line 227 of CandleChart.jsx — ghost badge logic uses it correctly
- `GhostOutcomePanel` import in ModelAnalysis.jsx matches the untracked file path exactly
- `OBLabTabShell` import in OrderBlockLab.jsx matches the untracked file path exactly

---

## 4. Checks Summary

| Check | Result |
|-------|--------|
| Frontend-only? | ✅ All changes are frontend-only |
| Backend assumptions? | ✅ None — all fields parse-time optional |
| Old bundles safe? | ✅ All ghost fields default `null`/`0`/`""` — old bundles load unchanged |
| RunDetail KPI strip (committed) safe on old bundles? | ✅ Uses `?? 0` / `?? null` — shows dashes/zeros, no crash |
| Duplicate ghost panels? | ✅ None — GhostOutcomePanel appears once, in ModelAnalysis only |
| Duplicate layer toggles? | ✅ None — ghost toggles only in StrategyMap |
| Duplicate field definitions? | ✅ None — snake_case + camelCase aliases are intentional dual-key pattern |
| Babel parse all 10 files? | ✅ All pass |

---

## 5. Recommended Action

**→ C: Split into two commits, land in order shown.**

No fixes required. Both commits are safe to land as-is.

---

### Commit 1 — OBLab polish + z-index fix (no ghost)

```
fix(oblab): tab shell, bucket table polish, z-index fix
```

Stage:
- `frontend/src/components/lab/OBLabTabShell.jsx` ← resolves orphaned import in committed OrderBlockLab.jsx
- `frontend/src/components/lab/CanonicalBucketTable.jsx` ← z-index + Info tooltip fix
- `frontend/src/pages/OrderBlockLab.jsx` ← remaining hideResultsBasis/hideChip/basisFooter + hero badge cleanup

**Land this first** — `OBLabTabShell.jsx` is already imported by committed code, so it's an active missing-file issue on any fresh checkout.

---

### Commit 2 — Ghost tracking Phase 0 (observational read-out)

```
feat(ghost): Phase 0 observational ghost tracking — parse, lifecycle, overlays, panels
```

Stage:
- `frontend/src/data/importer.js`
- `frontend/src/data/obLifecycle.js`
- `frontend/src/pages/StrategyMap.jsx`
- `frontend/src/pages/strategyMap/useResolvedScenario.js`
- `frontend/src/components/lab/entries/model/ModelAnalysis.jsx`
- `frontend/src/components/lab/CandleChart.jsx`
- `frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx`

**This commit completes the ghost stack** — after landing, RunDetail's ghost KPI strip (already committed) will be fully functional on bundles with ghost data.

---

## 6. Next Prompt

No fixes needed. Proceed directly to commit:

```
MODE: VALIDATE + COMMIT
TASK: GHOST-1 — Commit OBLab polish and Ghost Phase 0

Commit 1 of 2 — OBLab polish + z-index fix:
  git add frontend/src/components/lab/OBLabTabShell.jsx
  git add frontend/src/components/lab/CanonicalBucketTable.jsx
  git add frontend/src/pages/OrderBlockLab.jsx
  git commit -m "fix(oblab): tab shell, bucket table polish, z-index fix"

Commit 2 of 2 — Ghost Phase 0:
  git add frontend/src/data/importer.js
  git add frontend/src/data/obLifecycle.js
  git add frontend/src/pages/StrategyMap.jsx
  git add frontend/src/pages/strategyMap/useResolvedScenario.js
  git add frontend/src/components/lab/entries/model/ModelAnalysis.jsx
  git add frontend/src/components/lab/CandleChart.jsx
  git add frontend/src/components/lab/entries/model/GhostOutcomePanel.jsx
  git commit -m "feat(ghost): Phase 0 observational ghost tracking — parse, lifecycle, overlays, panels"

Before each commit:
- Babel parse all staged files
- Confirm git status is clean after each commit
- Report both commit hashes
```

---

*End of GHOST-SYNC-0 audit.*
