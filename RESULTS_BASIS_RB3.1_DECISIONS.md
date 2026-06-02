# Phase RB-3.1 — Pilot Cleanup + Denominator Decision

**Mode:** Audit / design + tiny cleanup. No table migration. No analytics changed.
**Date:** 2026-06-01
**Predecessor:** RB-3 (Structure Quality pilot)

---

## 1. Files Read
`pages/OrderBlockLab.jsx` (finalizeBucket + StructureQualityPanel), `data/resultsBasis.js`, `data/tradeClassification.js` (summarizeTradeSanity / summarizeTradeClassifications), `components/lab/failures/shared/failuresAnalytics.js`, `pages/NewsLab.jsx`, `pages/HypothesisLab.jsx`, `components/lab/entries/analytics/entryAnalytics.js`.

## 2. Files Changed
None to application code. One new design doc (this file). No analytics migrated; no visible numbers changed.

## 3. Temp File Status
`frontend/rb3_validate.tmp.mjs` is still present (0 bytes, already truncated). Plain `rm` fails with **"Operation not permitted"** in this sandbox. Per the phase rules I did not request broad delete permission. **Action for you:** delete it manually — `rm frontend/rb3_validate.tmp.mjs`. It is empty, imported by nothing, and has zero effect on build or runtime.

---

## 4. Denominator Audit

How "WR" is actually computed in each major surface today:

| Surface | winRate formula | Denominator meaning |
|---|---|---|
| **OrderBlockLab** `finalizeBucket` (all bucket tables incl. Structure Quality) | `wins / count` where `count` = every row added to the bucket; `wins = r>0 \|\| outcome==='Win'` | **All bucket rows** (flats and any non-win row dilute it) |
| **NewsLab** bucket rows (L1087, L1122) | `wins / uniqueRows.length`, `wins / items.length` | **All rows in group** |
| **resultsBasis.summarizeTrades(raw_r)** → `summarizeTradeSanity` (default) | `wins / (wins + losses)` | **Decided trades** (excludes flats + excluded setups) |
| **resultsBasis** with `winRateDenominator:"performance"` | `wins / (wins+losses+flats)` | Performance trades |
| **entryAnalytics** | mixed: L69 `wins/list.length` (all) **and** L152 `wins/(wins+losses)` (decided) | inconsistent even within one file |
| **failuresAnalytics** | loss-centric: `losses/all.length` | All rows |

**Findings:**

1. **Two conventions coexist.** The visible bucket tables (OrderBlockLab, NewsLab) use **wins / all-rows**. The Results Basis layer (`summarizeTradeSanity`) uses **wins / (wins+losses)** by default. `entryAnalytics` mixes both.
2. **The old display "WR" is "win rate among all bucket rows"** — `wins/count`, where `count` includes flats/breakevens (and, if present, any non-win/non-loss row). It is *not* "win rate among performance trades."
3. This is exactly why the RB-3 pilot showed two numbers for the same bucket: Raw R `wins/count` (BOS 31.9%) vs CE branch `wins/(wins+losses)` (BOS 35.4%). **WR should be basis-invariant; it currently is not, purely because the two branches call different calculators.**

**Which denominator is mathematically better for bucket analytics?**
`wins / (wins + losses)` — the **decided-trade win rate**. Flats/breakevens and protected/unfilled rows occur at different rates across buckets, so including them in the denominator makes WR a blend of "edge" and "how often this bucket produced a non-decision," which is not comparable across buckets. Excluding them gives a clean "when a trade in this bucket resolved, how often did it win?" Sample size and the excluded counts must still be shown so nothing is hidden.

---

## 5. Recommended Canonical Bucket Semantics

### Standard going forward (applies to every migrated table)

```
winRate = wins / (wins + losses)          // decided-trade WR, basis-INVARIANT
N (sample) column = performanceTrades = wins + losses + flats
flats, protected shown as separate counts (never inside the WR denominator)
```

WR, PF, and all counts are **basis-invariant** — computed once, identical under Raw R and Current Equity. Only money-/R-weighted quantities differ by basis.

### Canonical row shape

| Field | Raw R | Current Equity |
|---|:---:|:---:|
| `rows` (all rows in bucket) | ✓ | ✓ |
| `performanceTrades` (=wins+losses+flats) | ✓ | ✓ |
| `wins` / `losses` / `flats` | ✓ | ✓ |
| `protected` (excluded setups: unfilled+cancelled+session_filtered+news_cancelled+open+unknown) | ✓ | ✓ |
| `winRate` = wins/(wins+losses) | ✓ | ✓ *(identical — invariant)* |
| `profitFactor` | ✓ | ✓ *(invariant)* |
| `netR` | ✓ | ✓ *(R view shown in both)* |
| `expectancy` (R) | ✓ | ✓ *(R view)* |
| `contributionAmount` (currency) | — | ✓ *(contribution mode)* |
| `contributionPct` (% of net) | — | ✓ *(contribution mode)* |

`resultsBasis.summarizeTrades`/`summarizeBuckets` already return `wins`, `losses`, `flats`, `winRate`, `profitFactor`, `performanceTrades`, `excludedSetups` (via the spread of `summarizeTradeSanity`), plus `contributionAmount`/`contributionPctOfNet`. So the canonical shape is **already available** — standardization is a display + denominator-selection decision, not new math. (`protected` = `excludedSetups`; `rows` = `total`.)

---

## 6. Current Equity Account-Mode Decision

**Problem:** Current Equity + account mode `r_only` produces contribution in R units but the UI formats it as currency ("$33.9"), which is misleading.

**Decision: Option A — keep `r_only`, render CE values as R-equivalent (not dollars) whenever the account mode is `r_only`.** Reasons:
- It directly removes the misleading-dollar problem **without** silently changing everyone's default (rules out C) and **without** blocking the feature (rules out D).
- It needs no modal/flow plumbing (lighter than B).
- It's honest: with no account model, "Current Equity" contribution *is* R, so show R.

Implementation sketch (for RB-4, not now): a `formatBasisValue(basis, account, value)` helper that returns `formatAccountValue($)` when `mode !== 'r_only'` and `${value}R` when `mode === 'r_only'`. Keep the existing RB-3 "set an account mode in Settings" hint as the gentle nudge (a touch of B). If the product later wants dollars by default, revisit C as a deliberate, announced default change — not a silent one.

---

## 7. Should RB-3 Be Amended?

**Yes — adjust the denominator logic, but land it as part of RB-4's coordinated rollout, not as a lone edit now.**

Rationale:
- The live within-panel inconsistency (Structure Quality WR = 31.9% Raw R vs 35.4% CE) is real and worth fixing, but the fix is "make WR basis-invariant by standardizing on `wins/(wins+losses)`." Doing that *only* on Structure Quality would make one panel disagree with its unmigrated neighbors (Direction, Session, …) that still use `wins/count`. That trades one inconsistency for another.
- The clean move is to flip the denominator for **all** OrderBlockLab bucket tables together in RB-4 (they all share `finalizeBucket`), so the whole page is consistent in one step, with the before/after documented.

**Therefore for RB-3.1 specifically:** *leave the code as-is* (no migration, no number change this phase). The decision is recorded; the edit happens in RB-4.

**Heads-up — this is the one approved visible change coming in RB-4:** standardizing on `wins/(wins+losses)` will change existing Raw R WR values. Known deltas on the validated run:

| Bucket | WR now (wins/count) | WR after (wins/(wins+losses)) |
|---|---|---|
| BOS | 31.9% | 35.4% |
| CHoCH | 23.1% | 25.0% |

Net R, expectancy, PF, and counts are unaffected. Only the WR denominator changes, and it makes Raw R and Current Equity agree.

---

## 8. Risks
- **Approved WR change in RB-4 is user-visible.** Existing screenshots/notes citing the old WR will differ. Mitigate by shipping all OrderBlockLab bucket tables together + a one-line "WR now = decided-trade win rate" note.
- **`entryAnalytics` mixes denominators internally** — when EntriesLab is eventually migrated it needs its own reconciliation; don't assume one rule fixes it.
- **`protected`/excluded rows:** `universe.trades` is usually already executed trades, so `excludedSetups` is often ~0 today; the field matters more once unfilled/cancelled rows flow into buckets. Keep it in the shape now so later data doesn't silently distort WR.
- **Temp file** remains until manually deleted (no functional risk).

## 9. Recommended Next Task
**RB-4 — generalize `StructureQualityPanel` into a reusable basis-aware bucket wrapper and roll it across all OrderBlockLab bucket tables in one pass**, applying the canonical `wins/(wins+losses)` WR (basis-invariant), the canonical row shape, and the `formatBasisValue` R-vs-$ rule. Validate the documented WR deltas, then extend to NewsLab/FailuresLab in a later phase.

---

STATUS:
- COMPLETE (audit + decisions delivered; cleanup attempted, temp file blocked by sandbox and reported)

NEXT:
- RB-4 — coordinated OrderBlockLab bucket-table migration with canonical denominator + basis-invariant WR + R-vs-$ formatting

SUGGESTIONS:
- Add `formatBasisValue(basis, account, value)` + a shared `canonicalBucketRow` adapter in `resultsBasis.js` so every future table renders identically.
- Promote the RB-3 numeric parity check into a committed `*.test.js` (CRA jest) covering both the old `finalizeBucket` numbers and the new canonical WR, so the RB-4 denominator flip is guarded.
- Delete `frontend/rb3_validate.tmp.mjs`.

END OF TASK
