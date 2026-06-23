# BE-SELECTIVE-DEBUG-ATTRIBUTION-PANELS

> Two per-session attribution tables on the right of the selective-BE filter area
> (above the cards): **Current Cohort Impact** (follows filters) and **Global BE
> Impact** (all trades). Each shows Session · Affected · Saved · Cut · Δ R with a
> footer total that is sanity-checked against the universe summary delta.

## 1. Files read
`BreakevenTab.jsx`, `selectiveBeUniverse.js`, `protectionTimeline.js` (`buildBeAffectedTrades`).

Phase A confirmed: (1) cohort trades = `protectionApplied` rows in the selective universe (`matchesCohort`); (2) `lossesSaved`/`winnersCut` counted over applied+triggered rows by `originalR` sign; (3) `deltaNetR = protectedNetR − originalNetR` = Σ `deltaR` over applied rows; (4) the §6b affected-trades table is now toggleable cohort/global (prior task); (5) available fields on protected rows: `session`, `direction`, `structure`, `originalR`, `deltaR`, `protectionApplied`, `be_triggered`/`be_exit_reason`.

## 2. Files changed
- `data/selectiveBeUniverse.js` — `buildSessionAttribution(universeTrades)` (pure per-session aggregator); protected rows now carry `session`/`direction`/`structure` from the **original** setup (robust attribution even if a backend BE CSV omits those columns).
- `components/lab/protection/BreakevenTab.jsx` — `AttributionTable` component; global-BE universe + cohort/global attributions; **Show Attribution Debug** toggle (default ON, persisted to `localStorage`); two-column `[filters | attribution]` layout above the cards.
- `data/__validation__/selectiveBeUniverse.validate.mjs` — §20 attribution tests.

## 3. Cohort attribution logic
`buildSessionAttribution(selectiveBe.trades)` groups **only `protectionApplied` rows** by session: `affected` = count; `saved`/`cut` = triggered rows with `originalR <0` / `>0` (same rule as the summary); `deltaR` = Σ row `deltaR`. Because non-applied trades contribute Δ 0, the footer totals reconcile exactly: `totals.affected === applied`, `totals.saved === summary.lossesSaved`, `totals.cut === summary.winnersCut`, `totals.deltaR === summary.deltaNetR` (2dp). The table renders against the **global session order** so a deselected session (e.g. New York) shows a zeroed row, and included sessions are highlighted; excluded sessions are dimmed.

## 4. Global attribution logic
A second universe is built with `applyToAll: true` (BE applied to every paired trade, filters ignored) and run through the same `buildSessionAttribution`. It always lists every BE-touched session and answers "what would BE do globally?" Its footer is sanity-checked against that universe's `summary.deltaNetR`. Visual differentiation: cohort = bright accent panel; global = muted reference panel.

## 5. Validation results
- `selectiveBeUniverse.validate.mjs` §20 ✅ — global includes all sessions incl. New York; cohort excludes deselected New York (zeroed row); cohort & global footers == their summary deltas; saved/cut == summary; no duplicate counting (rows sum to total); Long and CHoCH filters attribute correctly.
- Regression ✅: `protectionLayers`, `protectionPhase3`, `beIntegration`, `protectionTimeline`, `beReplay`. Both changed files transpile; 0 new typography violations.

## 6. Example output (real bundle `20260611_154254`, 1R Wick)
```
== GLOBAL BE (all sessions) ==        (summary Δ=-26.11R, applied=99)
Session       Aff Saved Cut   ΔR
—              15    0   0   0.0R
Asia            9    2   1  -1.3R
London         12    1   3  -8.9R
London Lull     7    2   2  -4.6R
New York       32    5   6 -13.0R
Outside        24    5   1  +1.7R
TOTAL          99   15  13 -26.1R   footer==summary ✓

== COHORT (Asia+London+London Lull+Outside, NY excluded) == (summary Δ=-15.1R, applied=27)
Asia            4    2   1  -1.3R
London          8    1   3  -8.9R
London Lull     5    1   2  -5.6R
Outside        10    4   1  +0.7R
TOTAL          27    8   7 -15.1R   footer==summary ✓
```
Immediate read: **New York alone accounts for −13.0R of the −26.1R global BE damage**; excluding it lifts the protected delta to −15.1R. Outside is the only net-positive session (+1.7R global). This is the mental-arithmetic the panels remove.

> Temp scratch (`frontend/_attrSmoke.mjs`, `_tpa.mjs`, plus earlier `_tp*.mjs`/`_cohortAudit.mjs`) can't be deleted from the sandbox — please `rm` them on the host (all untracked).
