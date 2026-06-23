# Phase 14 — Wave 1 Implementation Audit (surgical)

*Audit only. No edits. Scope is **Wave 1** terminology: Active Run → Run · Result View → Model · Position Variant → Position Mode · introduce **View** as the grouping label. Banner cluster + ResearchRunHeader + ResearchResultViewBanner + ResearchContextBanner + TradeUniverseBadge + TopBar + Playbook template only. No Wave 2/3.*

Grounded in the live source (line numbers are anchors; re-locate by string before editing).

---

## 1. Minimal file list (6 hard, 3 comment-only optional)

**Must change (display strings):**

1. `components/lab/TopBar.jsx`
2. `components/lab/TradeUniverseBadge.jsx`  ← **shared, 11 consumers — highest reach**
3. `components/lab/ResearchResultViewBanner.jsx`
4. `components/lab/researchBanner/CurrentResultViewPanel.jsx`  ← **shared, 2 consumers (both banners)**
5. `components/lab/ResearchRunHeader.jsx`
6. `data/playbookTemplate.js`  ← labels only; **step IDs are frozen**

**Comment-only (stale after rename — optional, no UI effect):**
- `components/lab/ResearchRunHeader.jsx` (terminology note, L13–14)
- `components/lab/ResearchContextBanner.jsx` (L6 comment)
- `components/lab/researchBanner/ResearchBannerShell.jsx` (L6/L22 comments)

**In scope but NOTHING to change:** `components/lab/researchBanner/BannerRunIdentity.jsx` and `bannerRun.js` contain no Wave-1 strings.

---

## 2. Exact string map

> `Result View` is used in **two distinct roles** — as an *umbrella/panel header* (→ **View**) and as a *dimension label* alongside Position Variant (→ **Model**). The mapping below is therefore context-dependent; this is the one judgment call (see §5).

| File · anchor | Current string | → New string | Role |
|---|---|---|---|
| `TopBar.jsx` L110 | `kicker="Active Run"` | `kicker="Run"` | run switcher kicker |
| `TopBar.jsx` L93 | `"No Active Run"` | `"No Run"` | empty-state label |
| `TopBar.jsx` L96 | `label: "No Active Run"` | `label: "No Run"` | switcher option |
| `TradeUniverseBadge.jsx` L110 | `label="Result View"` | `label="Model"` | dimension cell |
| `TradeUniverseBadge.jsx` L112 | `label="Position Variant"` | `label="Position Mode"` | dimension cell |
| `CurrentResultViewPanel.jsx` L33 | `Current Result View` | `Current View` | dominant panel header (umbrella) |
| `ResearchResultViewBanner.jsx` L126 | `Result View` (block header) | `View` | breakdown header (umbrella over Model + Position Mode) |
| `ResearchResultViewBanner.jsx` L144 | `<Field label="Position Variant">` | `label="Position Mode"` | dimension field |
| `ResearchRunHeader.jsx` L328 | `<ScopeRow label="Position Variant">` | `label="Position Mode"` | scope row |
| `playbookTemplate.js` L23 | `label: "Confirm the Result View"` | `"Confirm the Model"` | checklist label |
| `playbookTemplate.js` L24 | `label: "Confirm the Position Variant"` | `"Confirm the Position Mode"` | checklist label |
| `playbookTemplate.js` L64 | `label: "Test Result View / fill-mode sensitivity"` | `"Test Model / fill-mode sensitivity"` | checklist label |

**Total hard edits: 12 strings across 6 files.**

---

## 3. Shared components where one edit propagates app-wide

- **`TradeUniverseBadge.jsx` (11 importers)** — the single highest-leverage edit. "Result View"→"Model" and "Position Variant"→"Position Mode" here update the badge on ~11 pages at once.
- **`CurrentResultViewPanel.jsx` (2 importers: `ResearchRunHeader` + `ResearchResultViewBanner`)** — "Current Result View"→"Current View" lands the new umbrella term on both the Run Detail header and the read-only banner from one edit.
- **`ResearchResultViewBanner.jsx` / `ResearchRunHeader.jsx`** — rendered across most analysis pages; their Position-Variant labels propagate widely.

Net: editing **3 shared files** (badge + panel + banner) carries the rename to nearly every analysis screen.

---

## 4. Places where changing the string would be MISLEADING (do NOT change)

| String / location | Why it must stay |
|---|---|
| **Playbook step IDs** (`context.correct_result_view`, `context.correct_position_variant`, `segmentation.result_view`) | Persisted localStorage keys (`playbookTemplate.js` states they're STABLE). Changing them orphans saved progress. **Change `label` only.** |
| **`{ key: "baseline", label: "Baseline" }`** (ResearchRunHeader L132) | "Baseline" here is a **Model/family value**, not the dimension label. Renaming corrupts a legit option. |
| **"Baseline Reference" / "Baseline trades" / "Baseline fallback" / "Scenario trades"** (banner/header/badge) | These are **Scope** (Baseline-vs-Scenario) labels — the "Baseline" overload is explicitly **deferred** (risky wave). Out of Wave 1. |
| **"Scenario" / `isScenarioView` / `ScenarioSelector`** | The store `scenario` concept; relabeling is **Wave 3**. |
| **Data identifiers** (`resultView`, `positionVariant`, `scenario`, `family`, `variant`, `universeType`) | Internal — renaming is the deferred structural wave, not Wave 1. |

---

## 5. Conflicts with existing terminology (must reconcile before editing)

1. **"Model" already means "entry model" (≈60 occurrences).** `Entry Model` / `entry model` (~60), `Model Family`, `label="Model"` (×3), `modelFamily.js`. Renaming **Result View → Model** is *semantically* consistent (Result View selects an entry-model variant) but creates **visual proximity** — e.g. Run Detail can show both an "Entry Model Breakdown" and a badge cell now reading "Model". **Decision needed:** accept "Model" (recommended — it's the same concept), or keep a distinct word. This is the single biggest naming risk in Wave 1.
2. **"View" mildly collides with "Saved Views"** ("Views & Export", "Saved view" in Failures Lab — filter/export presets). Low risk (different surfaces), but note it so "View" (Run view) isn't conflated with "saved views".
3. **"Result View" double-duty** (umbrella vs dimension) — the §2 context-dependent split resolves it, but it's a judgment call that needs sign-off: umbrella headers → **View/Current View**; dimension cells/steps → **Model**.

No conflict for **Run** (already the universal noun) or **Position Mode** (new term).

---

## 6. Estimates

- **Files touched:** **6** (display strings) + up to **3** comment-only = **6–9**.
- **Complexity:** **Low.** String-only; no logic, no data, no component restructuring. The only non-mechanical work is the §5 "Model vs View" decision.
- **Regression risk:** **Low.** Confirmed **no test / `data-testid` / `aria-label` / `getByText` coupling** to "Result View" / "Active Run" / "Position Variant" anywhere in the tree — so renames can't break selectors or tests. Residual risks are limited to (a) accidentally editing a playbook step **ID**, (b) accidentally hitting a **Baseline** family/scope string, (c) the **Model** visual-overlap above.

---

## Recommended implementation order

1. **`TradeUniverseBadge.jsx`** (2 strings) — biggest reach, simplest; verify badge renders on a couple of pages.
2. **`CurrentResultViewPanel.jsx`** (1 string) — lands "Current View" on both banners at once.
3. **`ResearchResultViewBanner.jsx`** (header → View, field → Position Mode) — verify Run Detail + a read-only banner page.
4. **`ResearchRunHeader.jsx`** (ScopeRow → Position Mode; optionally fix the L13–14 terminology comment).
5. **`TopBar.jsx`** (Active Run → Run ×3) — verify the run switcher kicker/empty state.
6. **`playbookTemplate.js`** (3 **labels**; **leave all IDs**) — verify the Playbook drawer renders the new wording and saved checks still resolve.
7. **Verify:** grep the 6 files for residual `Active Run` / `Result View` / `Position Variant` display strings — expect none except intentional **Baseline/Scenario** strings and code comments.

---

## Explicitly NOT in Wave 1

- Any **"Baseline"** rename (scope tabs, baseline family option, Baseline Reference/trades/fallback) — deferred/risky.
- Any **"Scenario"** rename or `ScenarioSelector` consolidation — Wave 3.
- Making **View** a real grouped *control* (vs a label) — Wave 3.
- Disambiguating the sidecar **"Run Preview" → Rerun** — Wave 3.
- Any **data identifier** or persisted-key rename — deferred.
- **Playbook step IDs**, and the `{key:"baseline"}` option label.

*Surgical scope: 12 strings, 6 files, no logic/data/tests touched. The one decision to make before editing is whether "Result View → Model" is acceptable given the existing "entry model" usage (recommended: yes).*
