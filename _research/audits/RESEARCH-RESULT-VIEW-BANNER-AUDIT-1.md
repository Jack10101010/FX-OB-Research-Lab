# RESEARCH-RESULT-VIEW-BANNER-AUDIT-1

**Type:** audit + plan (AUDIT ONLY — no implementation, no source changes)
**Owner:** Claude (UI/UX + system audit)
**Branch verified:** `codex-dev` · HEAD `d93f385 feat(session-lab): show read-only research context banner`
**Date:** 2026-06-10
**Scope:** Plan a shared, **read-only** RunDetail-style "Research Result View Banner" (wide,
bordered, premium, with a dominant **Current Result View** on the right) for the lab pages that
are single-run / single-result-view scoped — designed so interactive switching can be added
later. Audit only; no files edited. No `tradeUniverse` semantics touched; dirty ProtectionLab
read for audit only; not merged with Master Controls Preview Lens.

> **User correction acknowledged:** `TradeUniverseBadge` (the current strip) is too subtle. The
> banner should look like RunDetail's entry-model header — wide, obvious, premium — with the
> Current Result View emphasized on the right. Read-only for now; switch-ready by design.

---

## §1 — Current state by page

| Page | Run/Result-View scope | Existing surface | Universe source | Banner verdict |
|---|---|---|---|---|
| **RunDetail** | single-run, result-view | **ResearchRunHeader** (full interactive) | useRunVariant | ✅ reference — keep as-is |
| **Hypothesis Lab** | single-run, result-view | LabRunHero + TradeUniverseBadge | useRunVariant | ✅ **banner now** |
| **Session Lab** | single-run, **locally-derived** result-view | PageHeader + TradeUniverseBadge (Phase B) | `useTradeUniverse(runId, derivePrimaryResultView(bundle))` | ✅ **banner now** (upgrade the strip) |
| **Session Lab V1** | single-run, locally-derived | Header + TradeUniverseBadge (Phase B) | same as above | ✅ **banner now** (upgrade) |
| **News Lab** | single-run, result-view | LabRunHero + RunConfigStrip + TradeUniverseBadge | useTradeUniverse | ✅ **banner now** |
| **Trade Inspector** | single-run, result-view | TradeUniverseBadge (no hero) | useTradeUniverse | ✅ **banner now** (also gives it run identity) |
| **Failures Lab** | single-run, result-view | TradeUniverseBadge inside `FailuresWorkspace` | useTradeUniverse | ✅ **banner now** (upgrade the workspace strip) |
| **Order Block Lab** | single-run, result-view | `OBLabTabShell` (LabRunHero+RunConfigStrip+TradeUniverseBadge) | useTradeUniverse | ⚠️ **banner via the shell** (already has a premium header region — integrate, don't stack) |
| **Protection Lab** | single-run, result-view | LabRunHero + RunConfigStrip + TradeUniverseBadge | useTradeUniverse | ⏸ **plan only** — file is **dirty (other stream)**; deploy after it lands |
| **Strategy Map** | single-run, result-view | `ScenarioSelector` (specialized interactive + own badge) | useResolvedScenario | ⛔ **skip** — already has a switcher+context; don't double up |
| **Entries Lab** | single-run but **multi-model comparison** | EntriesWorkspace (`tradesByMode`, `ExperimentCompare`) | entryResults (all modes) | ⛔ **skip** — the page exists to compare *many* result views; one "Current Result View" misrepresents it |
| **Sweep Lab** | **not universe-governed** (own SWEEP_* outputs; says so in-page) | LabRunHero | none | ⛔ **skip** |
| **Walk-Forward Lab** | **multi-run** (imported runs as OOS folds) | LabRunHero | ~none | ⛔ **skip** |
| **Monte Carlo** | run-level resampling (engine placeholder) | LabRunHero | none | ⛔ **skip** |

**So:** 7 pages get the banner now (Hypothesis, Session, Session V1, News, Trade Inspector,
Failures, Order Block-via-shell), Protection is plan-only (dirty), and 5 are correctly skipped
(Strategy Map, Entries, Sweep, Walk-Forward, Monte Carlo).

---

## §2 — Recommended shared component architecture (answers #4–#7)

A **3-tier** structure that single-sources the premium styling, keeps RunDetail's interactive
header, adds a read-only banner, and reuses `TradeUniverseBadge` as the compact inner strip.

```
Tier 1 — shared presentational primitives  (extracted from ResearchRunHeader; styling lives ONCE)
  • ResearchBannerShell          → wide bordered premium container (scenario/unavailable border
                                    tones, clip-bevel, the xl:grid-cols-[1fr_320px] two-col layout)
  • CurrentResultViewPanel       → the dominant RIGHT column: 20px Result View label, Trades /
                                    Analytics(source) / Status, Baseline line, warning chips
  • (reuse ScopeRow + Pill from DataTable)

Tier 2 — two banners compose the primitives
  • ResearchRunHeader (existing) → RunDetail. Interactive LEFT (entry-model button grid) +
                                    CurrentResultViewPanel. Refactor to USE Tier-1 (visual no-op).
  • ResearchResultViewBanner (NEW, read-only) → lab pages. Static LEFT summary +
                                    CurrentResultViewPanel, in ResearchBannerShell. Switch-ready.

Tier 3 — compact data strip
  • TradeUniverseBadge (existing) → embedded inside the banner as the compact data row
                                    (Universe / Result View / Position Variant / Source / Rows +
                                    Arm C0/C1 warning). Already relabeled in Phase A. Reused, not replaced.
```

**#4 — reuse ResearchRunHeader read-only?** Only partially. It is already pure/controlled (no
store imports), but its LEFT column is an *interactive button grid* that requires the heavy
option-tree contract (`resultViewOptions`, `activeResultViewOption`, `isDirectionalView`,
`scopeChip` with basis/account, `baselineParityAudit`, …). Forcing every lab page to reproduce
that is duplication + risk. So don't force-reuse it whole.

**#5 — new component sharing styling?** **Yes — `ResearchResultViewBanner`**, sharing the Tier-1
primitives with `ResearchRunHeader` but taking a *simple universe-based* contract (§5 data fields).

**#6 — avoid duplication?** Extract Tier-1 once; both banners consume it (no copied class
strings — `AGENTS.md` rule 7). Reuse `TradeUniverseBadge` for the compact cells. The
RunDetail right-panel logic (`currentViewDisplay`, `isUnavailable`, warning filter) becomes
`CurrentResultViewPanel`, derivable from `universe` alone in read-only mode.

**#7 — TradeUniverseBadge as the compact inner strip?** **Yes.** It becomes the data row *inside*
the premium banner; the banner is the full-width wrapper that adds the dominant Current Result
View + (optional) run identity. This is the cleanest reuse and directly answers the user's
"too subtle" correction — the strip stays, but it's framed by an obvious premium shell.

---

## §3 — Exact visual layout

```
┌ RESEARCH RESULT VIEW ─────────────────────────────────────────────────────────────────┐
│ Result View breakdown (static)                    │  CURRENT RESULT VIEW                │
│  Model            [ Triggered Edge ]               │  Triggered Edge 50% · Arm C1   (20px│
│  Threshold        [ 50% ]                          │   accent when scenario / white base)│
│  Fill Mode        [ Next candle ]                  │  Trades 142 · Source scenario · ✓   │
│  ───────────────────────────────────────          │  Available                          │
│  Position Variant [ Primary ]   Basis [ R ]        │  Baseline: 208                      │
│                                                    │  ⚠ Arm C0 and Arm C1 exported sepa- │
│ [ TradeUniverseBadge: Universe·Result View·Position│    rately — merging would double-   │
│   Variant·Source·Rows + warning chips ]            │    count each OB.                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
   ↑ same wide bordered shell + tones as RunDetail's RW-13 header; border flips to --warning
     when the selected view is unavailable (scenario with 0 trades), exactly like RunDetail.
```

- **Left (read-only):** the current Result View broken out as **static chips** (Model / Threshold / Fill Mode), then Position Variant / Basis. (In RunDetail these are clickable; here they're static — switch-ready slot for later.)
- **Right:** `CurrentResultViewPanel` — the dominant element the user asked for.
- **Bottom strip:** embedded `TradeUniverseBadge` (compact cells + Arm C0/C1 warning). Optional/compact mode can drop it where the right panel already conveys enough.
- **Run identity:** shown in the banner only on **hero-less** pages (Trade Inspector, Session Lab); pages with a `LabRunHero` keep identity in the hero (no duplication), per the Phase-A `showRunIdentity` pattern.
- Premium dark, `clip-bevel-sm`, `font-ui`/`font-num`, `text-[9.5–11px]` chips, `text-[20px]` Result View. No `font-mono`, no `tracking-widest`. Height ≈ RunDetail's header (compact, one band).

---

## §4 — Which pages get the banner now / skipped

**Banner now (read-only):** Hypothesis Lab, Session Lab, Session Lab V1, News Lab, Trade
Inspector, Failures Lab (via `FailuresWorkspace`), Order Block Lab (via `OBLabTabShell` slot).

**Plan-only (deploy later):** Protection Lab — file dirty from another stream; deploy after it
lands to avoid conflict.

**Skip (with reason):**
- **Strategy Map** — already has `ScenarioSelector` (interactive + context). A second banner duplicates.
- **Entries Lab** — multi-model comparison; a single Current Result View misrepresents the page.
- **Sweep Lab** — explicitly "not governed by the active Trade Universe."
- **Walk-Forward Lab** — multi-run (folds across imported runs).
- **Monte Carlo** — run-level resampling, not result-view scoped.
- **RunDetail** — already has the full interactive `ResearchRunHeader`.

---

## §5 — Data fields shown + data contract (#8)

**Fields (read-only):** Result View (`universe.label`), Position Variant (`universe.variant`),
Source (`universe.sourceFile/sourceKey`), Rows/Trades (`universe.stats.total`), Universe type
(scenario vs baseline reference), Status (Available / Unavailable), Baseline reference count
(optional), warning chips (`FILL_MODE_COERCED`, `BOTH_UNAVAILABLE_NO_COMBINED` = Arm C0/C1
double-count). Run identity (name/symbol/TF) optional, hero-less pages only.

**Contract — read-only now, switch-ready later:**
```ts
ResearchResultViewBanner({
  universe,                 // REQUIRED — from useTradeUniverse / useRunVariant.
                            //   { universeType, label, variant, sourceFile, sourceKey,
                            //     stats:{ total }, warnings[], scenario:{ family, threshold, fillMode } }
  run = null,               // OPTIONAL run identity { id, name, symbol, timeframe, dateRange, imported }
  showRunIdentity = false,  // true only on hero-less pages
  baselineCount = null,     // OPTIONAL → "Baseline: N" reference line
  compact = false,          // drop the embedded badge / source cell on tight pages

  // ── reserved for interactive switching (NOT used in read-only phase) ──
  interactive = false,      // when true, LEFT renders the switcher controls
  resultViewOptions = [],   // option tree (same shape ResearchRunHeader consumes)
  activeResultViewOption = null,
  onResultViewChange = null,// (next) => setScenario(...) — wired later
})
```
Everything the read-only banner needs is derivable from `universe` alone (the right panel’s
"Current Result View", trades, status, warnings) plus the optional `run`. The interactive props
are accepted but inert now — so Phase "switch later" is purely additive (flip `interactive`,
pass `resultViewOptions` + `onResultViewChange`, reuse the same left-controls subcomponent as
`ResearchRunHeader`). **No RunDetail-only fields (account/basis/parity) are required** — they're
optional, keeping the contract light for generic pages.

---

## §6 — Implementation phases (DO NOT implement yet)

**Phase 1 — Extract Tier-1 primitives (refactor, visual no-op on RunDetail).** Pull
`ResearchBannerShell` + `CurrentResultViewPanel` out of `ResearchRunHeader.jsx`; rewrite
`ResearchRunHeader` to consume them. Pixel-parity check on RunDetail.

**Phase 2 — Build `ResearchResultViewBanner` (read-only).** New component composing the Tier-1
primitives + a static left summary + embedded `TradeUniverseBadge`. Storybook-less; validate by
transpile + host visual check on one page.

**Phase 3 — Deploy to hero-less / simple pages first.** Trade Inspector, Session Lab, Session
Lab V1 (replace the subtle `TradeUniverseBadge` with the banner; pass `showRunIdentity` where no hero).

**Phase 4 — Deploy to hero pages.** Hypothesis Lab, News Lab (place under the existing
`LabRunHero`, `showRunIdentity={false}`).

**Phase 5 — Failures + Order Block (shell integrations).** Swap the badge slot inside
`FailuresWorkspace` and `OBLabTabShell` for the banner.

**Phase 6 — Protection Lab.** Only after the other stream's dirty work lands.

Phases 1–2 are the foundation; 3–6 are incremental, independently shippable deployments.

---

## §7 — Files likely to change

| Phase | File | Change |
|---|---|---|
| 1 | `components/lab/ResearchRunHeader.jsx` | extract `ResearchBannerShell` + `CurrentResultViewPanel`; consume them (visual no-op). |
| 1 | `components/lab/researchBanner/` *(new)* | home for the Tier-1 primitives (or co-locate in one new file). |
| 2 | `components/lab/ResearchResultViewBanner.jsx` *(new)* | the read-only banner. |
| 3 | `pages/TradeInspector.jsx`, `pages/SessionLab.jsx`, `pages/SessionLabV1/SessionLabPage.jsx` | swap `TradeUniverseBadge` → banner. |
| 4 | `pages/HypothesisLab.jsx`, `pages/NewsLab.jsx` | add the banner under the hero. |
| 5 | `components/lab/failures/FailuresWorkspace.jsx`, `components/lab/OBLabTabShell.jsx` | banner in the header slot. |
| 6 | `pages/ProtectionLab.jsx` | deferred (dirty). |

**Not touched:** `tradeUniverse.js` semantics, all `masterControls/*`, `ScenarioSelector`,
RunDetail's behavior, importer, Entries/Sweep/WalkForward/MonteCarlo/StrategyMap, ProtectionLab
(until Phase 6).

---

## §8 — Risks / blockers

| # | Risk | Mitigation |
|---|---|---|
| R1 | Extracting Tier-1 from `ResearchRunHeader` could shift RunDetail's pixels. | Phase 1 is a pure move; require a before/after screenshot parity check on RunDetail before proceeding. |
| R2 | A wide banner on every page **bloats** layouts (the opposite failure mode of "too subtle"). | `compact` prop; only one band; embed (not stack) the badge; never add it where a hero already + a switcher exist (Strategy Map). |
| R3 | Run-identity duplication where a `LabRunHero` exists. | `showRunIdentity` defaults false; on, only for hero-less pages. |
| R4 | Wording drift: right panel "Triggered Edge 50% · Next Candle" vs `universe.label` "… · Arm C1". | Read-only banner uses `universe.label` (single source); accept the Arm-Cn wording; a later pass can unify Arm-vs-fill terminology (out of scope). |
| R5 | Session Lab/V1 use a **locally-derived** Result View (not the global scenario) → banner may differ from other pages. | Correct/intended — the banner surfaces the page's true universe; note it so it isn't read as a bug. |
| R6 | ProtectionLab is dirty (other stream). | Audit only; defer deployment (Phase 6). |
| R7 | Interactive-later contract drifts from `ResearchRunHeader`'s. | Share the left-controls subcomponent in the switch phase; keep the option-tree shape identical. |

**Blockers:** none for Phases 1–5. Soft decisions: confirm whether the embedded `TradeUniverseBadge`
stays inside the banner or is replaced by the banner's own cells (recommend embed → max reuse);
and the Arm-Cn vs Same/Next wording unification (defer).

---

## §9 — Validation checklist

- [ ] Babel-transpile every changed file; no full `craco build`.
- [ ] `grep -R "font-mono|tracking-widest" frontend/src --include=*.jsx` → 0 new hits in changed files.
- [ ] Existing validators stay green (`useRunVariant`, `modelFamily`, `hypothesisLabStats`).
- [ ] **Phase 1 parity:** RunDetail header visually identical pre/post extraction (host screenshot).
- [ ] Banner renders **Universe · Result View · Position Variant · Source · Rows** + Current Result View (right) + status; Arm C0/C1 warning still appears.
- [ ] Banner is read-only (no clickable switching); no Preview Lens content; not merged with `GlobalPreviewBanner`.
- [ ] Each deployed page's analytics consume the **same** `universe` the banner displays (rows match).
- [ ] No banner on Strategy Map / Entries / Sweep / Walk-Forward / Monte Carlo / RunDetail.
- [ ] Hero pages don't show duplicate run identity (`showRunIdentity` off); hero-less pages do.
- [ ] Dark theme unchanged; banner stays one compact band; no horizontal overflow.
- [ ] Diff review: only the §7 files for the shipped phase changed; ProtectionLab untouched until Phase 6.

---

## §10 — One commit or split?

**Split — foundation first, then one commit per page group:**
1. `refactor(lab): extract ResearchBannerShell + CurrentResultViewPanel from ResearchRunHeader` (Phase 1, visual no-op).
2. `feat(lab): add read-only ResearchResultViewBanner` (Phase 2, the component, not yet wired).
3. `feat(lab): result-view banner on Trade Inspector + Session Lab(s)` (Phase 3 — hero-less group).
4. `feat(lab): result-view banner on Hypothesis + News Lab` (Phase 4 — hero group).
5. `feat(lab): result-view banner in Failures + Order Block shells` (Phase 5 — shell group).
6. `feat(protection-lab): result-view banner` (Phase 6 — after the dirty work lands).

Splitting isolates the risky refactor (1) and the new component (2) from the page deployments,
lets RunDetail parity be verified before any page adopts it, and keeps each consumer group
reviewable on its own. Commits 1–2 are the gate; 3–6 can land incrementally.

*End — RESEARCH-RESULT-VIEW-BANNER-AUDIT-1. Audit only; no source files were edited.*
