# OB Retest Analysis — Phase C: Research Layer (OB-RETEST-5)

**Status:** C1 implemented (this pass); C2/C3 planned, not built.
**Goal:** Break retest performance down by meaningful OB/context features so we can answer *which retest conditions actually matter* — not cosmetic charts, quantitative edge discovery.

Source of truth for data shapes: `OB-RETEST-ANALYSIS-1/2/3/4`. Parity (backend == frontend) is proven; this layer is source-agnostic (enriches whichever events the unified Phase 2.4 hook supplies).

---

## 1. Research questions
- Do later retests (R2, R3+) survive less often than first retests (R1)?
- Does OB size (pips) predict survival / reaction magnitude?
- Which session (origin / detection / first-touch / retest) favors survival? Does cross-session retest behave differently from same-session?
- Do BOS vs CHoCH and bullish vs bearish (and their combination) differ?
- Does retest depth (entry/max penetration) relate to survival and to failure speed?
- Does time elapsed (since detection / first touch / previous retest) change odds?
- Does first-touch outcome / traded-state condition later retest behavior?
- Does news proximity at origin/detection matter?
- Failure shape: do shallow retests fail differently from deep ones? How often is there full penetration without a close breach? How often do OBs survive repeatedly before a final failure?

---

## 2. Available dimensions NOW (C1 — existing imported data)
**Event fields:** retest number, entry/max penetration %, reaction pips, reaction_met, time-since-first-touch, time-since-detection (derive), retest/first-touch/detection session (derive via `sessionOf`), same/cross session, BOS/CHoCH, bull/bear, structure×direction, first-touch outcome, traded?, candles-to-failure, shallow/deep failure, full-pen-no-breach (`retest_type`), time-since-previous-retest (group by ob_id).
**Via OB join (already imported):** OB size pips + buckets (`obWidthPips`), origin session (OB `originTime`), news at origin/detection (`ob_origin_news_window` / `ob_origin_minutes_from_news` / impact), first-touch filtered/skipped (partial, `obFinalStatus`/`lifecycleReason`), repeated survival before final failure (`obRetestSummary`).

## 3. Missing dimensions
- **Needs tiny frontend importer add (C2):** origin candle body/wick structure (`origin_open/high/low/close` present but unparsed), origin impulse proxy (`break_level`).
- **Needs backend field (C3):** ATR-normalized OB size, origin displacement/velocity, origin volume. Retest-time news proximity is frontend-derivable from imported `newsEvents` (deferred to a later pass).

## 4. Proposed backend field additions (C3 wishlist — not now)
`ob_size_atr`, `atr_at_origin`, `origin_displacement_pips`, `origin_velocity`, `origin_volume`, and retest-time `retest_news_window` / `retest_minutes_from_news` / `retest_news_impact` on `ob_retests.csv`. Additive/optional, consumed via the Phase 2.4 importer path.

## 5. Frontend grouping/bucket logic (C1 — FIXED buckets)
- **OB size (pips):** small `< 10`, medium `10–20`, large `> 20`.
- **Penetration % (entry & max):** clean `0–33`, mid `33–66`, deep `66–<100`, full `100`.
- **Time since detection:** `<1h`, `1–6h`, `6–24h`, `1–3d`, `3d+`.
- **Time since first touch:** `<30m`, `30m–2h`, `2–8h`, `8–24h`, `24h+`.
- **Time since previous retest:** `first` (R1, none), `<30m`, `30m–2h`, `2–8h`, `8h+`.
- **Retest number:** `R1`, `R2`, `R3+`.
- **Reaction quality:** `met` / `missed` (`reaction_met`).
- **Failure behavior:** `survived_shallow` / `survived_deep` / `failed_shallow` / `failed_deep` (deep = max penetration ≥ 66%).
- **Sessions:** canonical bands from `sessionOf` (Asia / London / London Lull / New York / Outside).
- **min-N = 20:** rows below are shown but not ranked / not color-emphasized.

## 6. Proposed Retest Lab UI sections
"**Retest Edge Discovery**" below the summary cards: grouped breakdown tables (retest #, OB size, origin session, retest session, BOS/CHoCH, bull/bear, penetration, time-since-detection, time-since-first-touch), a **Best / Worst Retest Conditions** panel (min-N gated), sample-size warnings (`*` for n<20), helper text "Rows below min sample are shown but not ranked.", and glossary tooltips. ConfigBar bucket thresholds stay fixed in C1.

## 7. Validation strategy
Pure logic test (`obRetestResearch.logictest.cjs`): join-key normalization, session derivation, fixed-bucket outputs, grouped arithmetic invariant (`survived+failed+open==n`), min-N suppression, best/worst excludes thin samples, time-since-previous-retest per OB. Plus existing `obRetest.logictest.cjs` unchanged, Babel parse-check, scoped-files check.

## 8. Implementation phases
- **C1 (this pass):** pure `obRetestResearch.js` + test; export `sessionOf`; wire into `useRetestData` (`enrichedEvents`, `edgeBreakdowns`, `bestWorstConditions`); render Edge Discovery in `RetestLabTab`. Existing imported data only; fixed buckets.
- **C2:** importer maps `origin_open/high/low/close` + `break_level` → origin structure / impulse breakdowns.
- **C3:** backend ATR/volume/displacement + retest-news fields; quantile buckets option.

## 9. Risks / edge cases
Thin samples (min-N≥20 essential — retests are sparse vs trades); session-definition consistency (reuse `sessionOf`); ob_id join normalization; bucket-threshold arbitrariness (fixed in C1, documented); origin-session derived from time (column absent); source-agnostic enrichment (works for backend or derived events); first-touch "skipped" only best-effort.

*Files to edit (C1): `data/obRetestResearch.js` (new), `data/__validation__/obRetestResearch.logictest.cjs` (new), `data/obRetest.js` (export sessionOf), `components/lab/retest/useRetestData.js`, `components/lab/retest/RetestLabTab.jsx`.*
