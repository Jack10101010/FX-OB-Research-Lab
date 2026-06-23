# Phase 14 — Reality Audit (Round 2, post-Wave 1)

*Read-only audit. No code, no docs edits, no Wave 3 design. Maps remaining user-facing terminology after Wave 1 (commit `e9d03aa`) and classifies every occurrence. Anchors are file:line from the live tree.*

**Classification key:** ① already aligned · ② Wave 2 cosmetic · ③ Wave 3 structural · ④ deferred/risky (Baseline/Scenario/persisted/identifier) · ⑤ comment-only, safe to leave.

---

## 1. Current terminology map after Wave 1

| Concept | Wave 1 result (shared banner cluster) | Status |
|---|---|---|
| Run | TopBar kicker "Run" / "No Run" | ① aligned (cluster) |
| View | banner umbrella header "View" | ① aligned (cluster) |
| Current View | dominant panel "Current View" | ① aligned (cluster) |
| Model | banner dimension field "Model" + TradeUniverseBadge | ① aligned (cluster) |
| Position Mode | banner field + badge "Position Mode" | ① aligned (cluster) |
| Preview | single composer preview (Phase 13) | ① aligned |

Wave 1 fixed the **shared cluster** only (TopBar, TradeUniverseBadge, ResearchResultViewBanner, CurrentResultViewPanel, ResearchRunHeader, playbookTemplate). Everything below is **page-local**, outside that cluster.

---

## 2. Exact remaining user-facing old terminology

### "Result View" — display strings (② Wave 2)
- `pages/ProtectionLab.jsx:211` — "Protection analysis reflects the selected **Result View**." *(known residual #2)*
- `pages/ProtectionLab.jsx:637` — "…the selected **Result View**'s raw result is easy to…"
- `pages/StrategyBuilder.jsx:1210` — "…becomes a selectable **Result View** in Run Workspace."
- `pages/SessionLabV1/components/RunImpactSummary.jsx:133` — `?? "Current Result View"` (fallback eyebrow) → **Current View**
- `components/lab/protection/BreakevenTab.jsx:456` — `Active Result View` (label)
- `components/lab/protection/BreakevenTab.jsx:461` — `Clear Result View Layer` (button)
- `components/lab/protection/BreakevenTab.jsx:482` — `Open as Result View` (button)
- `components/lab/protection/BreakevenTab.jsx:485` — "…a global protected **Result View**." *(see risk #1 — BreakevenTab is mid-flight)*

### "Variant" — display labels (② Wave 2, but **overloaded** — see risk #2)
- `pages/strategyMap/ScenarioSelector.jsx:436` — `<BadgeCell label="Variant" …>` *(known residual #1 — position variant → **Position Mode**)*
- `pages/StrategyMap.jsx:2480` — `<StatChip label="Variant" value={variantLabel(runStats.variant)}/>` *(verify: position vs model variant)*
- `pages/RunDetail.jsx:4529` — `<span>Variant</span>` *(this is a **model-family** comparison column → "Model", **NOT** Position Mode)*

### "Active Run" — display strings (mixed ② / ④)
- `pages/NewsLab.jsx:312` — button "Match **Active Run**" → "Match Run" *(② cosmetic)*
- `components/lab/ActiveRunContext.jsx:67` — `<ContextBadge>Active Run</ContextBadge>` *(② / status badge — defensible to keep)*
- `components/lab/LabRunHero.jsx:171,192` — `<HeroBadge>Active Run</HeroBadge>` *(② / status badge — defensible to keep)*
- `pages/ProjectDetail.jsx:750,759` — "Active Run" / "Set **Active Run**" / "Project Active" *(④ — project-workflow semantics: "active" designates one run among many)*
- `components/masterControls/MasterControlsDrawer.jsx:315` — `SectionLabel label="Active Run"` *(③/④ — Phase 13 area; do not touch per scope)*

### "Scenario" / "Baseline" — display (④ deferred/risky)
- `pages/strategyMap/ScenarioSelector.jsx:429-430` — "Scenario trades" / "Baseline reference"
- `pages/Overview.jsx:232,242-244` — "Active scenario" / "Baseline reference" scope toggle *(maps to `scopeMode` "scenario"/"baseline" state)*
- `components/lab/entries/shared/EntryWorkspaceHeader.jsx:96,128` — "Baseline reference"

### "Run Preview" — Master Controls (③ Wave 3 / Phase 13)
- `components/masterControls/MasterControlsDrawer.jsx:245,371,662` — "Run Preview" (the sidecar-backtest path, distinct from the instant Preview)

### Comment-only (⑤ safe to leave)
- `SweepLab:39`, `ComparisonLab:562`, `WalkForwardLab:150`, `TradeInspector:178`, `SessionLab:61`, `MonteCarlo:30`, `EntriesWorkspace:190`, `RunAnalysisPlaybookDrawer:133`, plus the BreakevenTab/`ProtectionLab` inline `//` notes.

---

## 3. Minimal Wave 2 file list (② cosmetic only)

1. `pages/strategyMap/ScenarioSelector.jsx` — the "Variant" badge *(known #1)*
2. `pages/ProtectionLab.jsx` — two "selected Result View" sentences *(known #2)*
3. `pages/StrategyBuilder.jsx` — one "selectable Result View" sentence
4. `pages/SessionLabV1/components/RunImpactSummary.jsx` — "Current Result View" fallback
5. `pages/NewsLab.jsx` — "Match Active Run" button
6. `pages/StrategyMap.jsx` — "Variant" StatChip *(verify it's position variant)*
7. `components/lab/protection/BreakevenTab.jsx` — the "Result View" cluster *(LAST — see risk #1)*

*(≈7 files, display strings only. Status-badge files — ActiveRunContext, LabRunHero — optional; recommend leaving.)*

---

## 4. Strings to change in Wave 2

| File:line | From | To |
|---|---|---|
| ScenarioSelector.jsx:436 | `label="Variant"` | `label="Position Mode"` |
| ProtectionLab.jsx:211 | "selected Result View" | "selected View" (or "Model") |
| ProtectionLab.jsx:637 | "selected Result View's raw result" | "selected View's raw result" |
| StrategyBuilder.jsx:1210 | "selectable Result View" | "selectable View" |
| RunImpactSummary.jsx:133 | `"Current Result View"` | `"Current View"` |
| NewsLab.jsx:312 | "Match Active Run" | "Match Run" |
| StrategyMap.jsx:2480 | `label="Variant"` | `label="Position Mode"` *(if position variant — verify)* |
| BreakevenTab.jsx:456/461/482/485 | "Active Result View" / "Clear Result View Layer" / "Open as Result View" / "global protected Result View" | "View"-based equivalents *(after Protection-BE commits)* |

---

## 5. Strings NOT to change

- **All Scenario / Baseline strings** (④) — ScenarioSelector "Scenario trades"/"Baseline reference"; Overview "Active scenario"/"Baseline reference" (tied to `scopeMode` values); EntryWorkspaceHeader "Baseline reference". Renaming touches the Baseline/Scenario overload and state mapping → Wave 3 design first.
- **"Run Preview" in MasterControlsDrawer** (③) — the sidecar path; its rename to "Rerun" is Wave 3 + Phase 13 territory.
- **MasterControlsDrawer "Active Run" label** — Phase 13 area; out of scope per instructions.
- **ProjectDetail "Set Active Run" / "Project Active"** (④) — project-workflow semantics; "active" is meaningful there.
- **RunDetail.jsx:4529 "Variant"** — a **model-family** column, not position mode; → "Model" only if desired, never "Position Mode".
- **"Active Run" status badges** (ActiveRunContext, LabRunHero) — denote active-*state*, defensible as-is.
- **All comments** (⑤) and **internal identifiers** (`resultView`, `positionVariant`, `scenario`, `variant` values) (④).

---

## 6. Risks

1. **`BreakevenTab.jsx` is mid-flight** — it's dirty in the uncommitted Protection-BE workstream (untracked deps `selectiveBeUniverse`/`protectionTimeline`/`BeAffectedTradesCard`). Editing its "Result View" strings now collides with that work. **Do BreakevenTab last, after Protection-BE commits — or hunk-coordinate.** Highest risk.
2. **"Variant" is overloaded** — model-variant (RunDetail model-family grid, RunWorkspace entry models) vs position-variant (ScenarioSelector badge, StrategyMap StatChip). A blanket "Variant → Position Mode" is **wrong** for the model-family cases. Classify per occurrence.
3. **Scenario/Baseline strings tie to state values** (`scopeMode === "scenario"/"baseline"`). Display rename is cosmetic but must not touch the value mapping — high confusion risk; deferred to Wave 3.
4. **Phase 13 / Master Controls** owns "Run Preview" and the drawer "Active Run" label — out of scope; coordinate.
5. **Status-badge semantics** — "Active Run" badges mean "this run is active," not the run *concept*; renaming may reduce clarity. Treat as optional.

---

## 7. Recommended Wave 2 implementation order

1. **`ScenarioSelector.jsx` "Variant" → Position Mode** — the #1 known residual, isolated, highest visibility (sits right under a "Position Mode" banner).
2. **`ProtectionLab.jsx` two sentences** — #2 known residual, page-local strings.
3. **Isolated page strings** — `StrategyBuilder.jsx`, `NewsLab.jsx`, `RunImpactSummary.jsx`, `StrategyMap.jsx` StatChip (after verifying it's position variant).
4. **`BreakevenTab.jsx` "Result View" cluster — LAST**, only after the Protection-BE workstream commits (risk #1).
5. **Do not touch** Scenario/Baseline, MC drawer labels, RunDetail model-grid "Variant", status badges, comments (§5).

Each step is a 1–4 string edit; verify each renders; grep that no in-scope display "Result View"/"Variant"(position)/"Active Run" remains.

---

## 8. Should Wave 2 precede Wave 3 design?

**Yes — and they're independent.** Wave 2 is pure cosmetic page-string cleanup with no architectural dependency; it can ship now (or in parallel with Wave 3 design) and removes the visible inconsistency users see today (e.g. "Position Mode" banner above a "VARIANT" badge). Wave 3 is the structural work — making **View** a grouped control, **Run Preview → Rerun** disambiguation, the **Baseline/Scenario** split, and any identifier renames — and those decisions are exactly what gates the §5 deferred strings. So: **run Wave 2 first/independently; let Wave 3 design proceed separately**, and only touch the Scenario/Baseline/Run-Preview strings once Wave 3 has decided their target shape.

*Surgical scope: ~7 files, display strings only. The two known residuals (ScenarioSelector badge, ProtectionLab sentence) are real and joined by ~5 more page-local strings; everything touching Baseline, Scenario, Run Preview, identifiers, or the model-variant "Variant" stays out until Wave 3.*
