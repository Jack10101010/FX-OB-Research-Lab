# RESEARCH-CONTEXT-BANNER-AUDIT-1

**Type:** audit + plan (AUDIT ONLY — no implementation, no source changes)
**Owner:** Claude (UI/UX + system audit)
**Branch verified:** `codex-dev` · HEAD `f1876fa fix(hypothesis-lab): calculate win rate from decided trades`
**Date:** 2026-06-10
**Scope:** Plan a shared, **read-only** "Research Context Banner" that makes the run /
Result View / Position Variant / source / universe obvious on every single-run Research Lab
page. Audit only — no files edited. No `tradeUniverse` semantics touched; Master Controls read
for overlap only.

> **Headline finding:** the read-only context banner **already exists** — it is
> `components/lab/TradeUniverseBadge`, deployed on **8 surfaces**. It was purpose-built to be
> the single shared read-only context strip (it killed 5 copy-paste copies). So the right
> move is **upgrade + standardize TradeUniverseBadge as the canonical Research Context
> Banner**, NOT build a 4th overlapping component. The real work is small: two locked-term
> relabels, a couple of optional cells, and filling **two gap pages (Session Lab, Session Lab
> V1)**.

---

## §1 — Current state by page

Surveyed every Research Lab page for which context surfaces it renders and whether it consumes
the single-run universe.

| Page | Run identity | Read-only universe context | Interactive switcher | Consumes universe? | Verdict |
|---|---|---|---|---|---|
| **RunDetail** | LabRunHero | (in header) | **ResearchRunHeader** (full) | useRunVariant | ✅ complete — keep full header |
| **Hypothesis Lab** | LabRunHero | **TradeUniverseBadge** | — | useRunVariant | ✅ has banner |
| **Strategy Map** | LabRunHero | ScenarioSelector's own badge | **ScenarioSelector** (specialized) | useResolvedScenario | ✅ has specialized switcher+badge — keep |
| **Protection Lab** | LabRunHero | **TradeUniverseBadge** (+RunConfigStrip) | — | useTradeUniverse | ✅ has banner |
| **News Lab** | LabRunHero | **TradeUniverseBadge** (+RunConfigStrip) | — | useTradeUniverse | ✅ has banner |
| **Trade Inspector** | — | **TradeUniverseBadge** | — | useTradeUniverse | ✅ has banner (no hero) |
| **Order Block Lab** | LabRunHero | **TradeUniverseBadge** (via `OBLabTabShell` + RunConfigStrip) | — | useTradeUniverse | ✅ has banner |
| **Failures Lab** | (in workspace) | **TradeUniverseBadge** (in `FailuresWorkspace`) | — | (workspace) | ✅ covered one level down |
| **Overview** | LabRunHero | **TradeUniverseBadge** | — | useTradeUniverse | ✅ has banner |
| **Session Lab** | — (generic `PageHeader` only) | **none** | — | `useTradeUniverse(runId, derivePrimaryResultView(bundle))` | ❌ **GAP** |
| **Session Lab V1** | — | **none** | — | useTradeUniverse | ❌ **GAP** |
| **Comparison Lab** | multiple LabRunHero | per-run TradeUniverseBadge | — | useTradeUniverse (multi-run) | ⛔ multi-run — banner would be wrong |
| **Insights** | LabRunHero | — | — | cross-run aggregate | ⛔ not single-run scoped |
| **Monte Carlo** | LabRunHero | — | — | none (equity resample) | ⛔ not Result-View scoped |
| **Walk-Forward / Sweep** | LabRunHero | — | — | ~none | ⛔ not Result-View scoped |

**Reading of the data:**
- `TradeUniverseBadge` is already the shared read-only context strip on **8 surfaces** (Hypothesis, Protection, News, Trade Inspector, Order Block, Failures-workspace, Overview, + Comparison per-run). It shows **Universe / Model / Variant / Source / Rows** + the user-facing warning chips (incl. the Arm C0/C1 double-count).
- `LabRunHero` is the **big** run-identity hero (3xl title + symbol/TF/dates via `buildLabHeroContent`) on nearly every page — that's run identity, but it is *not* "small/obvious context," and it does not show Result View / source / rows.
- **The only true gaps are Session Lab and Session Lab V1**: both consume the single-run universe but render no run identity, no Result View, no badge. Session Lab is the most valuable fix because it derives its **own** Result View locally (`derivePrimaryResultView(bundle)`, ignoring the global scenario) — so a banner there reveals exactly which Result View it used and prevents "why doesn't this match Run Detail?" confusion.

---

## §2 — Recommended component architecture

**Reuse and upgrade `TradeUniverseBadge` as the canonical Research Context Banner. Do NOT
create a new parallel component.**

Rationale (evidence-based):
- It already is the read-only context strip on 8 pages and its own docstring says it exists to be the single source after 5 copy-paste copies drifted. A new `ResearchContextBanner` would be a 4th overlapping surface and re-create that exact problem (and violate `AGENTS.md` rule 7 "centralize, do not copy").
- It already meets the UX bar: compact, premium dark, `clip-bevel-sm`, `text-[9.5px]` labels / `text-[10.5px]` values, one row + a warning row.

**Optional naming nicety (zero duplication):** add a re-export alias so new code can use the
clearer product name backed by the same implementation —
`export { TradeUniverseBadge as ResearchContextBanner }`. One component, two names.

**Three roles stay distinct (ownership boundaries — §6):**
- **Research Context Banner = `TradeUniverseBadge`** → read-only context.
- **`ResearchRunHeader`** → interactive Result View switcher (RunDetail only).
- **`ScenarioSelector`** → Strategy Map's specialized interactive switcher (keep).
- **`GlobalPreviewBanner`** (Master Controls) → temporary unsaved Preview-Lens state (app-wide top bar).

---

## §3 — Exact fields & layout

The banner is one compact bevelled strip placed **directly under the page hero/header, same
position on every page**, with a second row of warning chips when present.

| Cell | Source | Today | Change |
|---|---|---|---|
| **Universe** | `universe.universeType` | "Scenario trades" / "Baseline reference" | keep |
| **Result View** | `universe.label` (`describeUniverseLabel`) | labelled **"Model"** | **relabel → "Result View"** (locked term) |
| **Position Variant** | `universe.variant` | labelled **"Variant"** | **relabel → "Position Variant"** (locked term) |
| **Source** | `universe.sourceFile / sourceKey` | "Source" (dropped in `compact`) | keep |
| **Rows** | `universe.stats.total` | "Rows" | keep |
| **Warning chips** | `universe.warnings` filtered to `BOTH_UNAVAILABLE_NO_COMBINED` + `FILL_MODE_COERCED` | ✅ already | keep (preserves Arm C0/C1 double-count surfacing verbatim) |
| **Run / Symbol·TF** *(optional)* | run summary (`buildLabHeroContent` inputs / bundle.summary) | not shown | **add, gated by a new optional `run`/`showRunIdentity` prop** — only on pages without a `LabRunHero` (Session Lab) so it can stand alone; off elsewhere to avoid duplicating the hero |
| **Imported / estimate marker** *(optional)* | bundle/run flag (`imported`/`indexOnly`) or universe fallback flag | not shown | **add only if the flag already exists**; otherwise defer. Note: `LabRunHero` already shows an "Imported" badge, so pages with a hero don't need it. |

**Master Controls Preview Lens (field #4 "optional read-only preview status"):**
**recommend NOT adding it to the banner.** `GlobalPreviewBanner` already shows
"Temporary preview active — not saved" app-wide whenever `previewLens.active`. Repeating it
per-page is redundant noise. Leave preview-lens status to `GlobalPreviewBanner` (ownership
boundary §6). If ever wanted inline, gate it strictly on `previewLens.active` and render a
single muted chip — but the default recommendation is to defer to the global bar.

All cells use existing tokens (`font-ui` labels `text-[9.5px] tracking-[0.08em]`, values
`text-[10.5px]`, `font-code` for the source path). No `font-mono` / `tracking-widest`.

---

## §4 — Visual hierarchy

- **Small but obvious:** one bevelled strip (~28–34px) + an optional warning row. Not a second giant header.
- **Same position everywhere:** immediately below the page hero (`LabRunHero` / `PageHeader`) and above content. Today placement varies slightly; standardize it.
- **Premium dark cockpit:** reuse the existing `TradeUniverseBadge` surface (`border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm`).
- **Not noisy / no duplication:** never render the banner on a page that already shows the full `ResearchRunHeader` (RunDetail) or the `ScenarioSelector` badge (Strategy Map). Run identity cells stay **off** where a `LabRunHero` already exists.

---

## §5 — Which existing component to reuse / refactor

**Refactor target: `frontend/src/components/lab/TradeUniverseBadge.jsx`** — additive only:
1. Relabel `"Model"` → `"Result View"` and `"Variant"` → `"Position Variant"` (display strings; values unchanged). This is the one change that touches all 8 existing callers' display — and it is exactly the locked-terminology consistency the user is asking for.
2. Add optional `run` / `showRunIdentity` props → render compact **Run** + **Symbol · TF** cells (default off → existing 8 callers byte-identical).
3. Optional `imported`/`estimate` marker cell, gated on a flag that already exists (else defer).
4. (Optional) `export { TradeUniverseBadge as ResearchContextBanner }`.

Everything else (warning filtering, `compact` mode, `BadgeCell`) is reused unchanged.

---

## §6 — Ownership boundaries (confirmed)

| Surface | Role | Writes? |
|---|---|---|
| **Research Context Banner** (`TradeUniverseBadge`) | read-only context (run / Result View / Position Variant / source / rows / warnings) | never |
| **ResearchRunHeader** | interactive Result View switcher | `setScenario` (RunDetail) |
| **ScenarioSelector** | Strategy Map specialized switcher | `setScenario` / `setSelectedTradeVariant` |
| **GlobalPreviewBanner** (Master Controls) | temporary unsaved Preview-Lens state | `exitPreviewLens` only |

Result View (store `scenario`) and Preview Lens (Master Controls) remain orthogonal and are
**not** merged. The banner reflects the resolved universe; it does not read or write the
Preview Lens.

---

## §7 — Pages where the banner is redundant or harmful

- **RunDetail** — already has the full `ResearchRunHeader`. Adding the banner = duplicate. **Skip.**
- **Strategy Map** — `ScenarioSelector` already renders its own context badge + is interactive. **Skip** (would double up).
- **Comparison Lab** — multi-run by design; a single-run context banner would misrepresent the page. It already uses per-run `LabRunHero` + `TradeUniverseBadge` correctly. **Skip.**
- **Insights / Monte Carlo / Walk-Forward / Sweep** — cross-run / aggregate / run-level analyses that are **not** Result-View-scoped (little or no universe consumption). A Result-View banner would imply a scoping they don't have. **Skip** (their `LabRunHero` is the right level of context).
- **Failures Lab** — already covered by `TradeUniverseBadge` inside `FailuresWorkspace`. **No page-level change** (optionally standardize placement only).

---

## §8 — Implementation phases (DO NOT implement yet)

**Phase A — Foundation (shared component).** Upgrade `TradeUniverseBadge`: relabel Model→Result
View + Variant→Position Variant; add optional run-identity + imported-marker props; optional
`ResearchContextBanner` alias. Visual no-op for the 8 existing callers except the two relabels.

**Phase B — Gap fill (Session Lab pages).** Add `<TradeUniverseBadge universe={universe}
showRunIdentity …/>` under the `PageHeader` on **Session Lab** and **Session Lab V1**. (Session
Lab passes the locally-derived `primaryScenario` universe — the banner then truthfully shows the
Result View that page used.)

**Phase C — Placement standardization (light, optional).** Ensure the banner sits in the same
spot (under hero, above content) on the pages that already render it; no logic change.

Phases A and B are the value; C is polish.

---

## §9 — Files likely to change

| Phase | File | Change |
|---|---|---|
| A | `frontend/src/components/lab/TradeUniverseBadge.jsx` | Relabels + optional run-identity/imported props + optional alias. **High-leverage (8 consumers) — review across all.** |
| B | `frontend/src/pages/SessionLab.jsx` | Render the banner under its `PageHeader`. |
| B | `frontend/src/pages/SessionLabV1/SessionLabPage.jsx` | Render the banner. |
| C (opt) | placement tweaks in pages already using the badge | position only |

**Not touched:** `tradeUniverse.js` semantics, all `masterControls/*`, `ResearchRunHeader`,
`ScenarioSelector`, RunDetail, Comparison/Insights/MonteCarlo/WalkForward/Sweep, importer.

---

## §10 — Risks / blockers

| # | Risk | Mitigation |
|---|---|---|
| R1 | Relabel "Model"→"Result View" / "Variant"→"Position Variant" changes **8 pages' display at once**. | Label strings only (values unchanged); it IS the intended locked-terminology consistency. Quick visual pass across the 8 consumers. |
| R2 | Session Lab shows a Result View that **differs** from Run Detail (it derives its own `primaryScenario`, ignoring global scenario). | This is pre-existing behavior; the banner surfaces it (a feature). Note it so it's not mistaken for a banner bug. A later unification could route Session Lab through the store scenario — out of scope here. |
| R3 | Added run-identity cells widen the strip. | Optional + off by default; keep `compact` dropping Source; only enable run cells on hero-less pages. |
| R4 | Duplicating Preview-Lens status. | Don't — defer to `GlobalPreviewBanner` (§3/§6). |
| R5 | `imported`/`estimate` marker may not have a clean flag. | Only add if the flag already exists; otherwise defer (LabRunHero already shows "Imported"). |
| R6 | Shared component is multi-owner. | Additive optional props; scoped commit; verify the 8 consumers render unchanged except relabels. |

**Blockers:** none. One decision: confirm the **"Result View" / "Position Variant" relabel**
should apply to all existing `TradeUniverseBadge` instances now (recommended yes — consistency).

---

## §11 — Validation checklist

- [ ] Babel-transpile every changed file (`@babel/core` env+react presets); no full `craco build`.
- [ ] `grep -R "font-mono|tracking-widest" frontend/src --include=*.jsx` → 0 new hits in changed files.
- [ ] Existing validators still green (`useRunVariant`, `modelFamily`, `hypothesisLabStats`).
- [ ] **8 existing consumers** (Hypothesis, Protection, News, Trade Inspector, Order Block, Failures-workspace, Overview, Comparison) render unchanged except the two relabels; no layout break.
- [ ] **Session Lab + Session Lab V1** now show the banner in the standard position, with run + Result View + source + rows.
- [ ] Result View label reads the resolved universe (e.g. "Triggered Edge 50% · Arm C1" / "Baseline"); Position Variant reads the variant.
- [ ] Arm C0/C1 double-count warning still renders through the banner where applicable.
- [ ] RunDetail (ResearchRunHeader) and Strategy Map (ScenarioSelector) are **not** given a second banner.
- [ ] Preview Lens status appears only via `GlobalPreviewBanner`, not duplicated in the banner.
- [ ] Dark theme unchanged; banner height stays compact (~one row + optional warning row).

---

## §12 — One commit or split?

**Split into two commits by concern (not by page):**

1. **`refactor(lab): TradeUniverseBadge → canonical Research Context Banner`** — the shared-component upgrade (relabels + optional run-identity/imported props + optional alias). One reviewable unit covering all 8 consumers' display.
2. **`feat(session-lab): show read-only research context banner`** — deploy to Session Lab + Session Lab V1 (the gap fill).

Splitting isolates the broad shared-component change (which touches every consumer's labels)
from the additive page deployments, and lets the relabel land/QA independently before the gap
pages adopt it. (Optional Phase C placement polish can fold into commit 2 or a small third.)

*End — RESEARCH-CONTEXT-BANNER-AUDIT-1. Audit only; no source files were edited.*
