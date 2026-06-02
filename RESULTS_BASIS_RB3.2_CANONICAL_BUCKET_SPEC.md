# Phase RB-3.2 — Canonical Bucket Semantics (FROZEN SPEC)

**Mode:** Design / finalization. No migrations, no table rewrites, no analytics behavior changed.
**Date:** 2026-06-01
**Predecessors:** RB-3 (Structure Quality pilot), RB-3.1 (denominator decision)
**Status of this document:** This is the frozen specification. RB-4 and every later migration implement against it verbatim.

---

## 1. Files Read
`pages/OrderBlockLab.jsx`, `pages/NewsLab.jsx`, `pages/Overview.jsx`, `pages/HypothesisLab.jsx`, `pages/ComparisonLab.jsx`, `pages/ProtectionLab.jsx`, `pages/TradeInspector.jsx`, `data/resultsBasis.js`, `data/tradeClassification.js`, `components/lab/failures/shared/failuresAnalytics.js`, `components/lab/protection/protectionAnalytics.js`, `components/lab/entries/analytics/entryAnalytics.js`.

## 2. Files Changed
None. Design-only phase. (The RB-3 pilot already proves the design at runtime; no further code was needed to validate this spec.)

---

## 3. Canonical Win Rate — DECISION

**Final: B — `winRate = wins / (wins + losses)`** (the *decided-trade* win rate).

- **Mathematical meaning:** of the trades in a bucket that reached a decisive win or loss, the fraction that won. Flats/breakevens and excluded setups (unfilled, cancelled, session-filtered, news-cancelled, open, unknown) are **not** in the denominator.
- **Research usefulness:** the only denominator that is comparable across buckets. `wins/all-rows` blends edge with "how often this bucket produced a non-decision," which varies bucket-to-bucket and corrupts comparison. Decided-trade WR isolates directional edge.
- **User interpretation:** "when a trade in this bucket resolved, it won X% of the time" — the intuitive reading, and it already matches the W/L sublabels shown across the app (`{wins}W / {losses}L`).
- **Results Basis compatibility:** it is exactly `summarizeTradeSanity`'s default, which `resultsBasis.summarizeTrades/summarizeBuckets` already returns. **Zero adapter** for the canonical path, and it is **basis-invariant** (identical under Raw R and Current Equity).
- **Alignment bonus:** Overview and Strategy Map already compute WR this way (via `universe.stats`). Choosing B makes migrated bucket tables *agree* with the existing canonical KPIs rather than diverge.

**Rejected:** A (`wins/all-rows`) — current OrderBlockLab/NewsLab/Protection behavior; not comparable across buckets. C (`wins/performanceTrades = wins+losses+flats`) — flats are non-edge outcomes that dilute the rate; **but C is retained as an opt-in** via the existing `winRateDenominator:"performance"` option for users who explicitly want flats counted. **Default is always B.**

**Consequence (the one approved visible change, lands in RB-4):** OrderBlockLab/NewsLab/Protection WR values shift. Documented deltas on the validated run: BOS 31.9%→35.4%, CHoCH 23.1%→25.0%. Net R / expectancy / PF / counts unaffected.

---

## 4. Canonical Bucket Shape — FROZEN

```
CanonicalBucketRow {
  // ── identity ─────────────────────────────────────────────
  key,                  // string  bucket key / label (REQUIRED)

  // ── counts (REQUIRED, basis-invariant) ───────────────────
  rows,                 // int  total trades assigned to this bucket (= summarizeTradeSanity.total)
  performanceTrades,    // int  wins + losses + flats  → the "N" shown in tables
  wins,                 // int
  losses,               // int
  flats,                // int  breakeven / news-flatten-flat
  excluded,             // int  excludedSetups: unfilled+cancelled+session_filtered
                        //      +news_cancelled+open+unknown (a.k.a. "protected/non-performance")

  // ── R metrics (REQUIRED, basis-invariant) ────────────────
  winRate,              // number | null   wins / (wins + losses) * 100  (null when no decided trades)
  profitFactor,         // number | null | Infinity   grossWinR / |grossLossR|  (R basis, always)
  expectancy,           // number | null   netRPerformance / performanceTrades   (R per trade)
  netR,                 // number          performance net R (= netRPerformance), matches equity chart

  // ── Current-Equity ONLY (omit/undefined under Raw R) ─────
  contributionAmount,   // number   bucket's sequence P&L within the full ordered curve (contribution mode)
  contributionPct,      // number | null   contributionAmount / run net * 100
  // isolated mode adds (optional, only when bucketMode === "isolated"):
  netAmount,            // number   isolated bucket P&L from startingBalance
  expectancyAmount,     // number   netAmount / performanceTrades
  endingBalance,        // number
  maxDrawdownAmount,    // number
  maxDrawdownPct,       // number

  // ── meta (REQUIRED) ──────────────────────────────────────
  basis,                // "raw_r" | "current_equity"
  bucketMode,           // null | "contribution" | "isolated"
  currency,             // string (display; relevant only when basis = current_equity & mode ≠ r_only)
}
```

**Field classification:**

| Class | Fields |
|---|---|
| **Required (every basis)** | key, rows, performanceTrades, wins, losses, flats, excluded, winRate, profitFactor, expectancy, netR, basis, bucketMode, currency |
| **Optional** | flats/excluded breakdowns, CI (ciLo/ciHi), tradeRefs (for drill) — page-level extras, not part of the canonical contract |
| **Raw R fields** | all Required (no contribution/amount fields) |
| **Current Equity fields** | all Required **plus** contributionAmount, contributionPct (contribution mode) **or** netAmount, expectancyAmount, endingBalance, maxDrawdownAmount, maxDrawdownPct (isolated mode) |

`resultsBasis.summarizeBuckets` already returns `rows`(total), `performanceTrades`, `wins`, `losses`, `flats`, `excludedSetups`, `winRate`, `profitFactor`, `expectancy`, `netRPerformance`, `contributionAmount`, `contributionPctOfNet`. The frozen shape is a **thin rename/normalization** of what exists (`excluded`←`excludedSetups`, `netR`←`netRPerformance`, `contributionPct`←`contributionPctOfNet`), not new math.

---

## 5. Basis-Invariant Matrix

| Metric | Raw R | Current Equity | Invariant? |
|---|---|---|---|
| rows | ✓ | ✓ identical | **Invariant** |
| performanceTrades | ✓ | ✓ identical | **Invariant** |
| wins / losses / flats / excluded | ✓ | ✓ identical | **Invariant** |
| winRate | ✓ | ✓ identical | **Invariant** |
| profitFactor (R basis) | ✓ | ✓ identical | **Invariant** |
| expectancy (R) | ✓ | ✓ identical | **Invariant** |
| netR (R) | ✓ | ✓ identical | **Invariant** |
| contributionAmount | — | ✓ | **Basis-dependent (CE only)** |
| contributionPct | — | ✓ | **Basis-dependent (CE only)** |
| netAmount / expectancyAmount (isolated) | — | ✓ | **Basis-dependent (CE only)** |
| endingBalance / maxDrawdown$ / maxDrawdown% | — | ✓ | **Basis-dependent (CE only)** |

**Rule:** the invariant block is computed **once** and rendered identically in both modes. Switching basis never recomputes WR, PF, counts, expectancy-R, or net-R. Only the money-weighted block appears/changes under Current Equity. **PF stays on the R basis in both modes** (we do not compute a currency-weighted PF — that would mix edge with sequence position).

---

## 6. Display Specification

### Raw R mode
- **Columns:** Bucket · N (`performanceTrades`) · WR · Net R · Exp · PF · (optional 95% CI, flats/excluded).
- **Labels:** "WR", "Net R", "Exp", "PF".
- **Formatting:** R values `+33.9R` (1 dp net, 3 dp expectancy), WR `35.4%`, PF `1.65` / `∞` / `—`.

### Current Equity mode
- **Columns:** Bucket · N · WR · **Contribution** · **Contrib %** · (optional Net R retained as secondary, dim).
- **Labels:** "WR" (same invariant value), "Contribution", "Contrib %".
- **Formatting:** see `r_only` rule below.

### `r_only` account mode under Current Equity — FINAL
When the account mode is `r_only`, Current-Equity contribution **is** R (no account model), so render it **as R, not dollars**:

```
mode === "r_only"     →  "+33.9R"          (+ hint: "Pure R — set an account mode for $ contribution")
mode !== "r_only"     →  formatAccountValue → "+$3,921.58"
```

This is RB-3.1 Option A, finalized: it never shows a misleading dollar figure, changes no defaults, and never blocks the feature. A single helper `formatBasisValue` (below) enforces this everywhere.

---

## 7. Migration Matrix

| Surface | Current WR denom | State | Action |
|---|---|---|---|
| **Overview** | `wins/(wins+losses)` via `universe.stats` | ✅ already canonical | none (reference impl) |
| **Strategy Map** | `wins/(wins+losses)` via stats | ✅ already canonical | none |
| **OrderBlockLab** bucket tables | `wins/count` (`finalizeBucket`) | ⚠ needs migration | **RB-4** — primary target (Structure Quality already piloted) |
| **NewsLab** bucket tables | `wins/all-rows` | ⚠ needs migration | RB-5 |
| **FailuresLab** | loss-centric `losses/all` | ⚠ needs adapter | RB-6 (loss-rate maps cleanly; add winRate via canonical) |
| **ProtectionLab** / protectionAnalytics | `wins/count` | ⚠ needs migration | RB-6 |
| **HypothesisLab** | entries path, `wins/(wins+losses)` for exact rows (mixed) | 🔶 needs adapter | RB-7 (verify exact rows already canonical) |
| **EntriesLab** (entryAnalytics + model panels) | **mixed** (`wins/list` and `wins/(wins+losses)`) | ⚠ needs migration | RB-8 — multi-scenario, own design pass |
| **ComparisonLab** | `lib/metrics` on raw `TRADES`, baseline-only | ⚠ needs migration | RB-8 — multi-run/Table-Compare design pass |
| **TradeInspector** | none (ledger, no WR) | ✅ N/A | none |
| **RunDetail** | account engine (own) | 🔶 re-point later | final phase |

Legend: ✅ compatible · 🔶 adapter · ⚠ migrate.

---

## 8. Canonical Helper Architecture

Add three pure primitives so every migrated table renders identically (all framework-free; no JSX in `resultsBasis.js`):

```
// data/resultsBasis.js  (pure)
toCanonicalBucketRow(bucketSummary) -> CanonicalBucketRow
    // normalizes summarizeBuckets() output to the frozen §4 shape
    // (excludedSetups→excluded, netRPerformance→netR, contributionPctOfNet→contributionPct).

formatBasisValue(basis, account, value, { kind }) -> string
    // kind: "r" | "money" | "pct" | "int"
    // money + mode==="r_only"  → renders R (the §6 rule)
    // money + mode!=="r_only"  → formatAccountValue
    // r → "+33.9R", pct → "35.4%", int → "120"

bucketDisplaySchema(basis, account) -> ColumnDescriptor[]
    // DATA ONLY (no JSX): [{ key, label, align, kind, invariant }]
    // returns the Raw R column set or the Current Equity column set per §6.
    // The table component maps `kind` → its existing cell renderers
    // (ColoredR, formatPct, PFCell, money cell), keeping the module pure.
```

`summarizeBuckets` stays the single calculator. `toCanonicalBucketRow` is the contract boundary; `bucketDisplaySchema` + `formatBasisValue` are the shared rendering layer. A thin `<CanonicalBucketTable>` component (built in RB-4) consumes schema + rows so each page stops hand-rolling columns.

---

## 9. RB-4 Readiness

**YES — RB-4 can begin immediately.** Nothing blocks it: the calculator (`resultsBasis`), the pilot (Structure Quality), and now the frozen semantics all exist. The only new build work is the three helpers + one shared table component, then re-point OrderBlockLab's bucket tables.

**Exact RB-4 implementation order:**
1. Add `toCanonicalBucketRow`, `formatBasisValue`, `bucketDisplaySchema` to `resultsBasis.js` (+ extend the validation script to cover them).
2. Build `<CanonicalBucketTable basis account rows schema onDrill>` (generalizes `StructureQualityPanel`; keeps `BucketPanel` until all OBL tables move).
3. Re-point **Structure Quality** onto `<CanonicalBucketTable>` — apply canonical WR (`wins/(wins+losses)`); confirm the documented WR delta (BOS 31.9→35.4) and that Net R/Exp/PF/counts are unchanged.
4. Re-point the remaining OrderBlockLab bucket tables (Direction, Origin Session, Creation Hour, Width, Age, Penetration, Day of Week, Fast Stopout, Distance) in the same pass so the whole page is consistent.
5. Retire `finalizeBucket`'s `wins/count` WR (or leave the field, source WR from canonical).
6. Validate: Raw R Net R/Exp/PF/counts unchanged across all OBL tables; WR matches canonical; CE contributions reconcile to run net; other pages untouched.

---

## 10. Risks
- **Approved WR change is user-visible** across OBL/NewsLab/Protection once migrated. Ship per-page in one pass + a one-line "WR = decided-trade win rate" note.
- **`netR` semantics shift** from raw-sum to performance-net (`netRPerformance`). Identical when buckets contain only executed trades (the norm today), but document it; the delta surfaces only if excluded rows carry R.
- **EntriesLab/ComparisonLab are multi-scenario/multi-run** — the frozen single-bucket shape applies, but their *layout* (many universes/runs at once) needs its own design pass; don't force them into RB-4.
- **`profitFactor = ∞`/`null`** edge cases must be handled by `formatBasisValue`/schema, not the table.
- **Temp file** `frontend/rb3_validate.tmp.mjs` still present (sandbox-locked); delete manually.

## 11. Recommended Next Task
**RB-4 — implement the three canonical helpers + `<CanonicalBucketTable>`, then migrate all OrderBlockLab bucket tables onto canonical semantics** (WR = wins/(wins+losses), frozen shape, R-vs-$ formatting), validating the documented WR deltas and Raw-R parity of every other metric.

---

STATUS:
- COMPLETE (semantics frozen; no analytics changed, no migrations performed, no tables rewritten)

NEXT:
- RB-4 — canonical helpers + shared bucket table + OrderBlockLab full bucket migration

SUGGESTIONS:
- Land `toCanonicalBucketRow` / `formatBasisValue` / `bucketDisplaySchema` with unit tests in the same commit so all later phases inherit a guarded contract.
- When EntriesLab/ComparisonLab come up, pair this spec with `TABLE_COMPARE_BASIS_AUDIT.md` (delta suppression rules) — they're the multi-scenario cases.
- Delete `frontend/rb3_validate.tmp.mjs`.

END OF TASK
