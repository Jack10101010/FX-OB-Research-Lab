# Phase 14 — Rollout Plan (terminology migration)

*Migration planning only. No implementation, no model redesign. Phase 13 is complete (Preview is now singular). The Phase 14 conceptual model — **Run · View · Preview · Comparison · Project** — is the target. This plan sequences the move from today's labels to that model with the least risk for the most clarity.*

Surface grounded in the live codebase: "Result View" display strings in ~19 files (heaviest: `RunDetail` ×7, `ResearchResultViewBanner` ×5, `ProtectionLab`/`HypothesisLab` ×4, `ResearchRunHeader` ×4); "Position Variant" in ~5 UI files + data layer; "Active Run" in ~6; "Baseline" ×30 (overloaded); a central banner cluster at `components/lab/researchBanner/*` + `ResearchRunHeader` / `ResearchResultViewBanner` / `ResearchContextBanner` / `TradeUniverseBadge`.

---

## 1. Current terminology that conflicts with the Phase 14 model

| Conflict | Where it shows | Why it conflicts |
|---|---|---|
| **"Active Run" / "ACTIVE RUN"** | TopBar run switcher, MasterControls drawer, `ActiveRunContext`, `LabRunHero`, ProjectDetail | Phase 14 has exactly one **Run** in focus — the "Active" adjective is noise and collides with project-`activeRunId`. |
| **"Result View"** | banner cluster + ~19 pages, Playbook checklist | Jargon for "which entry-model family". Phase 14 folds this into **View → Model**. |
| **"Position Variant"** | banner, StrategyMap, SessionLab, TradeInspector, store | Jargon for "how positions stack". Phase 14 → **View → Position Mode**. |
| **"Variant" (bare)** | "Run Variant", "VARIANT Multi", enabled-variant breakdowns | Overloaded across entry-model, position handling, scenario. Phase 14 retires the bare word. |
| **"Scenario" / "Active scenario" / "Baseline reference"** | StrategyMap `ScenarioSelector`, scope tabs, store `scenario` | The store's `scenario` is really the **View** selection; "Baseline reference" scope = a View, not a Run. |
| **"Baseline" (×30)** | scope tabs, project stage, `BASELINE_VIEW`, `getRawRunData` | Means 3 things — a View family, a Project stage, and "the raw un-previewed run". Only the Project-stage meaning is Phase-14-correct. |
| **"Run Preview" vs "Preview"** | MasterControls "Run Preview" (sidecar) vs the instant Preview lens | Two different things share the word. Phase 14 **Preview** = the instant reversible projection; the sidecar path is **Rerun/Promote**, not "Preview". |

Already aligned (little/no conflict): **Comparison** (Comparison Lab), **Project / Open Project / Candidate**.

---

## 2. Current terminology map → 3. Target terminology map

| # | Current (user-facing) | Target (Phase 14) | Internal identifier (DO NOT rename) |
|---|---|---|---|
| 1 | Active Run / ACTIVE RUN | **Run** (or "Current Run") | `activeRunId`, `getRawRunData` |
| 2 | Result View | **View → Model** (a.k.a. "Entry Model") | `resultView`, `scenario.family`, `useRunVariant`, `runVariantResolve` |
| 3 | Position Variant | **View → Position Mode** | `positionVariant`, `scenario.positionVariant` |
| 4 | Variant (bare) | *retire* → "Model" or "Position Mode" | `selectedTradeVariant`, enabled-variant data |
| 5 | Scenario (selector/scope) | **View** (the selected view of the Run) | store `scenario`, `LS_scenario`, `ScenarioSelector` |
| 6 | Baseline reference (scope) | **View → Baseline** (a Model value) | `BASELINE_VIEW` |
| 7 | Baseline (project) | **Baseline** (Project stage — keep) | `project.baselineRunId` |
| 8 | Run Preview / Rescore Preview / TEMPORARY PREVIEW | **Preview** (one word, instant) | `composedPreviewResult`, `previewLens` (mode `"preview"`) |
| 9 | (sidecar) Run Preview → Promote | **Rerun → Promote** (creates a new Run) | `startPreview`/`promotePreview` |
| 10 | Comparison Lab / Comparison | **Comparison** (keep) | `comparedRunId` |
| 11 | Project / Open Project / Candidate Run | **Project / Candidate** (stage) (keep) | `candidateRunId`, `finalRunId` |

**The umbrella:** introduce **View** as the single handle over **Model** (was Result View) + **Position Mode** (was Position Variant). That one new word does most of the clarity work.

**Key rule for every rename:** change the *display string only*. The data identifiers in the right column stay — renaming them is a separate structural refactor with no user benefit (and is explicitly out of Phase 14's vocabulary scope).

---

## 4. Screens affected

- **Everywhere via the banner cluster** (one edit point, app-wide effect): `researchBanner/*`, `ResearchRunHeader`, `ResearchResultViewBanner`, `ResearchContextBanner`, `TradeUniverseBadge`. These render the "Result View / Position Variant" chips on most analysis pages.
- **Per-page header strings** that don't go through the banner: `RunDetail` (×7), `ProtectionLab`, `HypothesisLab`, `StrategyMap`, `SessionLab`, `SweepLab`, `WalkForwardLab`, `MonteCarlo`, `ComparisonLab`, `EntriesWorkspace`, `TradeInspector`, `Overview`, `StrategyBuilder`.
- **TopBar** — "Active Run" switcher kicker.
- **Master Controls drawer** — "Active Run" section header, "Run Preview" section.
- **Playbook drawer + template** — checklist items literally say "Correct Result View?" / "Correct Position Variant?" (`playbookTemplate.js`).
- **StrategyMap `ScenarioSelector`** — the "Scenario / Baseline / Variant" picker.

---

## 5. Smallest rollout, largest clarity gain

**Wave 1 (do first — pure cosmetic, one cluster):** rename the **banner cluster display strings** — "Result View" → **Model**, "Position Variant" → **Position Mode**, group them visually under a **View** label, and drop "Active" from "Active Run" → **Run**. Because nearly every analysis page reads these banners, this single low-risk change delivers the bulk of the clarity gain app-wide without touching any data identifier or logic.

Pair it with the **Playbook template** wording (`"Correct Result View?"` → `"Correct Model?"`, `"Correct Position Variant?"` → `"Correct Position Mode?"`) and the **TopBar** kicker ("Active Run" → "Run") — both are isolated string edits.

That is the 80/20: **one component cluster + one template + one TopBar string** = the new vocabulary visible everywhere, with zero structural risk.

---

## 6. Change classification

**Cosmetic (safe, Wave 1–2):**
- Display-string renames: Result View→Model, Position Variant→Position Mode, Active Run→Run, in the banner cluster, page headers, Playbook template, TopBar, MasterControls section headers.
- Introducing "View" as a visual grouping label over the two existing chips.

**Structural (Wave 3 — touches component shape, still no model change):**
- Making **View** a real grouped control (one menu exposing Model + Position Mode) rather than two separate chips/selectors — consolidating `ScenarioSelector` presentation.
- Disambiguating **Preview** (instant) from the sidecar **Run Preview** by renaming the sidecar section to "Rerun" / "Backend Run" in the MasterControls drawer.
- De-duplicating per-page header strings into the shared banner so future renames are one-touch.

**Risky (defer — needs explicit sign-off):**
- Renaming any **data identifier** (`resultView`, `positionVariant`, `scenario`, `BASELINE_VIEW`) or the persisted `fxob_scenario_v1` localStorage key — high churn, migration of saved state, zero user-visible benefit.
- Touching the **"Baseline" overload** beyond display: it means a View family AND a Project stage AND raw-run data; a blind rename breaks one of the three. Must be split deliberately.
- Re-labeling the **sidecar Run Preview → Promote** flow if it changes the promote mental model or button identity (the "Apply/Exit" stable-identity fix from Phase 12C must be preserved).

---

## 7. Terminology to formally deprecate

Record in `DECISIONS.md` (vocabulary decision) and `GLOSSARY.md`:
- **"Result View"** → deprecated in favor of **Model**.
- **"Position Variant"** → deprecated in favor of **Position Mode**.
- **"Active Run"** (the adjective) → deprecated in favor of **Run**.
- **"Variant"** as a bare standalone noun → deprecated; must be qualified as Model or Position Mode.
- **"Baseline"** as a synonym for raw/un-previewed run data → deprecated; reserve **Baseline** for the Project stage only.

Keep (not deprecated): **Run, View, Preview, Comparison, Project, Model, Position Mode, Candidate, Baseline (project stage), Promote, Rerun**.

---

## Recommended rollout order

1. **Wave 1 — Banner cluster + Playbook template + TopBar (cosmetic).** Result View→Model, Position Variant→Position Mode, group under **View**, Active Run→Run. One cluster, app-wide effect. *Lowest risk, highest clarity.*
2. **Wave 2 — Residual page-header strings (cosmetic).** Sweep the ~12 pages that hardcode "Result View"/"Position Variant" outside the banner (RunDetail heaviest). Mechanical find-by-string; verify each renders.
3. **Wave 3 — "View" as a real grouped control + Preview/Run-Preview disambiguation (structural).** Consolidate `ScenarioSelector`; rename the sidecar "Run Preview" section to "Rerun/Backend". Behind the same vocabulary, now structurally coherent.
4. **Deferred — identifier rename + Baseline split (risky).** Only if/when there's appetite; needs a migration plan for `scenario`/`positionVariant`/localStorage and a deliberate 3-way split of "Baseline".

Ship Waves 1–2 first and stop there if you want the clarity win without structural churn — they are independently shippable and fully reversible.

---

## Risk assessment summary

| Wave | Risk | Blast radius | Reversible? |
|---|---|---|---|
| 1 — banner/template/TopBar | **Low** | Display strings in ~6 files; app-wide visual effect | Yes (string revert) |
| 2 — page-header sweep | **Low** | ~12 page files, strings only | Yes |
| 3 — View control + Preview disambig | **Medium** | `ScenarioSelector`, MasterControls drawer section, banner grouping | Mostly (component-local) |
| Deferred — identifiers + Baseline | **High** | data layer, persisted state, 3-way "Baseline" meaning | Hard (state migration) |

No wave changes the Phase 13 preview engine, `previewLens`, transform math, or the conceptual model. Every wave is vocabulary-over-existing-behavior.

---

## Estimated implementation scope

- **Wave 1:** ~5–7 files (banner cluster + `playbookTemplate.js` + `TopBar.jsx`), display strings + one grouping label. **Small.**
- **Wave 2:** ~10–12 page files, string-only. **Small–medium** (volume, not complexity).
- **Wave 3:** ~3–5 files, real component changes (`ScenarioSelector`, MasterControls drawer, banner grouping). **Medium.**
- **Deferred:** data-layer + persisted-state migration. **Large** — separate project, explicit sign-off.

Total for the clarity win (Waves 1–2): **modest, cosmetic, reversible** — ~15–18 files of string changes, no logic, no data, no model change. Recommend scoping Wave 1 as the first shippable PR and re-evaluating before Wave 3.

*Migration planning only. No code changed; the Phase 14 model is unchanged and not advanced to "complete" by this plan.*
