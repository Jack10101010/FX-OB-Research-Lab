# OB-RETEST-V2.1-MONETIZATION-PLAN-1 — Implementation Planning Audit

Planning only — nothing implemented. Date: 2026-06-10 · Author: Claude.

## 1. Files read

`OB-LIFECYCLE-MONETIZATION-AUDIT-1.md` · `frontend/src/data/obRetest.js` ·
`obRetestResearch.js` · `components/lab/retest/RetestLabTab.jsx` /
`useRetestData.js` · FX-repo `retest_tracker.py` (staged) · Lux-OB-Backtester
`src/retest_tracker.py` (deployed v2, identical modulo test sys.path) ·
`scripts/export_ob_retests.py` · `scripts/run_backtest.py` (retest wiring) ·
`src/config.py` (`detection_timeframe="15min"`, `execution_timeframe="1min"`) ·
**`frontend/src/components/lab/roadmap/SectionRoadmap.jsx` + `frontend/src/data/roadmapStore.js`**
(generic primitives — exist, currently *untracked*, from a parallel stream) ·
`pages/OrderBlockLab.jsx` (sole RetestLabTab parent) · evidence-run `summary.json`
(confirms: no timeframe keys exported today).

## 2. Audit questions answered

**Q1 — Pure frontend:** every research *view* (RR capture curve, TTI buckets,
Kaplan–Meier, decay table, MFE-ranked cohorts) — pure functions over perOB rows +
enriched events. The Roadmap button (P2) is 100% frontend. The frontend
*derivation path* can also compute every new *field* itself (it holds the 1-min
candles).

**Q2 — Backend exporter changes:** only the per-OB fields + summary keys, and only
so that **Backend Computed** runs carry them. `export_ob_retests.py` and
`run_backtest.py` need no structural change (writers/`summary_fields` come from
the tracker module) — with one exception: passing the confirmation timeframe (Q4)
needs a one-line config plumb in `run_backtest.py` and one CLI arg in the
standalone exporter. `config.py` needs nothing (fields exist).

**Q3 — Is 15m confirmation derivable from 1m candles?** Yes, in both engines:
bucket the kill candle into its detection-TF window (`floor(time / tf)`), take the
bucket's last 1-min close, apply the same breach predicate. The audit script
already did exactly this. So: **both** — backend authoritative, frontend fallback
identical (required for parity anyway). Caveat: the final bucket may be partial at
data end → confirmation evaluated on the bucket's last *available* close, flagged
identically in both engines.

**Q4 — Hardcode 15m or tie to detection timeframe?** Tie it to the run:
`confirm_timeframe_minutes` in tracker config. `run_backtest.py` wires
`config.detection_timeframe` (parse "15min" → 15); the standalone exporter gets
`--confirm-timeframe-minutes` (default 15); frontend `DEFAULT_RETEST_CONFIG`
gains `confirmTimeframeMinutes: 15` (editable in the ConfigBar like the other
criteria). Never hardcode — JPY/other-TF runs exist in the roadmap.

**Q5 — Where is MFE computed?** Both engines, inside the existing v2 scan loop
(backend authoritative, frontend derivation fallback — the established pattern).
The scan already visits every candle from first touch to death; MFE is one `max()`
plus three retest-anchor registers (k = 1, 2, 3). Computing it post-hoc from
events is impossible for OBs that died before any retest — it must live in the
engine.

**Q6 — Exact schema additions** (one bump covering P0 + P1, fingerprint =
`kill_margin_pips` header):

| Surface | Additions |
|---|---|
| `ob_retest_summary.csv` (additive, appended) | `kill_margin_pips`, `kill_confirmed_tf` (true/false/empty), `reheld_after_kill` (true/false/empty), `mfe_before_death_pips`, `mfe_after_r1_pips`, `mfe_after_r2_pips`, `mfe_after_r3_pips` |
| `summary.json` (additive) | `retest_schema_version: "2.1"` (engine_version stays 2 — semantics unchanged), `retest_confirm_timeframe_minutes`, `retest_kill_confirmed_share`, `retest_reheld_after_kill_share`, `retest_median_kill_margin_pips`, `retest_rr_capture` ({"0.25R"…"5R"} shares), `retest_tti_buckets` ({"<15m","15-60m","1-4h","4-24h","1-7d",">7d","censored"}), `retest_mfe_before_death_median_r` (backend has width per OB from order_blocks rows) |
| Frontend `perOB` rows | camelCase mirrors: `killMarginPips`, `killConfirmedTf` (bool\|null), `reheldAfterKill` (bool\|null), `mfeBeforeDeathPips`, `mfeAfterR1Pips/R2/R3` (+ null for never-killed where applicable; MFE fields populated for alive OBs through data end, with the censored flag carried by `finalOutcome`) |
| Importer | map the 7 columns behind a `kill_margin_pips` header sniff → `retestArtifactVersion: 2.1`; absent → fields null (v2 artifacts unchanged) |
| `ob_retests.csv` | **unchanged** (event schema frozen, third release running) |

R-units are **not** exported per OB — the research layer derives
`mfeBeforeDeathR = pips / obWidthPips` via the existing `obJoinKey` join, keeping
the CSV minimal and the R definition in one place (glossary: *idealized
opportunity — 1R = zone width, entry proximal / stop distal; not realized PnL*).

**Q7 — UI room:** the lab column is already six sections deep. Recommendation: a
single **"Monetization (before death)"** collapsible `NeonPanel` section after OB
Outcomes containing the RR capture curve, TTI histogram, and decay table —
collapsible keeps the lab scannable. Defer a full tab split ("Reaction research" /
"Lifecycle & monetization" pills) until the KM curve lands; note it as the escape
valve if the section exceeds ~2 screens.

**Q8 — Old artifact degradation** (extends the proven `obLevel` null-gating):
v1 → no OB Outcomes, no Monetization, v1 banner badge (already shipped);
v2 → OB Outcomes yes, Monetization panels hidden (fields null);
v2.1 → everything. Frontend derivation always produces the newest shape. No
recompute, no fake zeros, no migration.

**Q9 — Tests** (mirrored fixtures, both languages, established pattern):
- Kill margin: bull + bear, exact pip math, buffer interaction.
- Confirmation: kill confirmed by bucket close; kill NOT confirmed (1-min noise,
  bucket closes back inside); kill in a partial final bucket; bucket boundary
  (kill on the last candle of a bucket).
- Re-held: close back inside within the window vs never; window length respected.
- MFE: peak before death only (favorable spike *after* kill must not count);
  censored OB MFE runs to data end; `mfeAfterR1 ≤ mfeBeforeDeath` invariant
  (subset window); R2/R3 anchors absent → null.
- Pure research fns: rrCaptureCurve monotonically non-increasing; ttiBuckets sum
  to killed + censored; decay table arithmetic.
- Importer: v2.1 sniff, v2 artifact → nulls, v1 unchanged.
- Parity: one combined fixture (kill margin + confirm + MFE) byte-identical
  JS↔Python output.
- Regression: all existing 172 JS / 114 Py assertions unchanged (v2 semantics
  preserved; **buffer default unchanged** pending explicit decision — surfaced as
  a flagged decision item, not changed in this work).

**Q10 — Safest order:** engines → importer → pure research module → UI → roadmap
→ re-export (detail in §5).

## 3. Architecture recommendation

**Combine P0 + P1 into one engine release (v2.1) but ship in staged commits.**
Both touch the same scan loop, the same CSV, the same sniff, the same parity
fixtures — splitting them means two schema bumps, two re-exports, two version
sniffs for zero benefit. The audit's only reason to sequence P0 first was metric
credibility, which is preserved by commit order inside the release.

New pure module `frontend/src/data/obRetestMonetization.js` for the curves
(rrCaptureCurve / ttiBuckets / kaplanMeier (P2, stub later) / decayByRetest) —
NOT bolted into `obRetestResearch.js`, which stays event-focused; the new module
is perOB-focused. `obRetest.js` gains only fields, no view logic.

## 4. Roadmap UI plan (P2 — reuse, don't build)

`SectionRoadmap.jsx` + `roadmapStore.js` already implement the exact pattern
(header button → modal with Idea/Planned/In-Progress/Complete columns, seeds in
code, localStorage status overrides, designed explicitly as the platform-standard
per-section roadmap). Plan:

1. Add a `"retest-lab"` seed to `ROADMAP_SEEDS` with the requested items:
   v2.1 death-definition refinement · monetization fields · RR capture curve ·
   TTI histogram · Kaplan–Meier lifecycle curve · MFE-ranked cohorts · cross-run
   confirmation · eventual-failure edge discovery (statuses: first two
   `in_progress` once work starts, rest `planned`) + shipped history as
   `complete` items (Phase 1 lab, 2.4, C1, C2, hold-rename, v2 engine).
2. Drop `<SectionRoadmap sectionKey="retest-lab" />` into the Retest Lab header
   row (next to the basis banner, right-aligned — ~28px, non-intrusive).
3. Small shared-component enhancement (benefits all consumers, no fork): render
   the existing-but-unrendered `note` field as muted subtext, and support an
   optional per-section `findings: [{stat, runId}]` block rendered above the
   columns — that covers the "Key findings" requirement.

**Blocker/coordination:** both files are **untracked** (parallel stream). Either
that stream commits them first, or the retest commit includes them — must be
decided with the other stream before P2 starts; do not fork a duplicate.

## 5. Implementation phases (exact order)

| Phase | Content | Gate |
|---|---|---|
| **A** | Engine v2.1 fields in `obRetest.js` + both `retest_tracker.py` copies (kill margin, confirm-TF, re-held, MFE family, config key) + JS/Py tests + parity fixture | all suites green; existing assertions untouched |
| **B** | Importer v2.1 sniff + `useRetestData` passthrough + glossary entries (R-unit definition, kill-confirmation caveat) | importer tests; v1/v2 artifacts load unchanged |
| **C** | `obRetestMonetization.js` pure module + logictest | pure-fn tests green |
| **D** | Monetization UI section (capture curve, TTI histogram, decay table) + OB-Outcomes additions (confirmed-share, median kill margin) | Babel + visual pass |
| **E** | Roadmap: seed + header button + shared-component note/findings enhancement | coordination with parallel stream resolved |
| **F** | Lux drop-in port + exporter `--confirm-timeframe-minutes` + run_backtest timeframe plumb + re-export evidence run (keep the v1 fixture AND one v2 fixture un-regenerated) | backend tests + smoke, headers verified |
| **G** | `docs/ai` sync: DECISIONS (R definition, confirm-TF, buffer-default deferral), FINDINGS candidates only after F | — |

Buffer-default change is **explicitly deferred** to a decision item in G — not
bundled into A.

## 6. Validation plan

Per phase gates above, plus end-to-end: re-export `20260606_084116` with v2.1 and
verify in-lab that Backend Computed mode shows identical Monetization numbers to
Frontend Derived on the same run (the audit script's independent values are the
reference: median MFE 1.46R, 1R capture 63%, confirmed share 63.4%, re-held
79.6%, median margin 1.0p). `ob_retests.csv` header byte-compare. Scope checks
per repo as before (parallel Failures-stream files stay untouched;
`researchGlossary.js` staging via `git add -p` if that stream is still in flight).

## 7. Risks

1. **Shared-file collision:** `roadmapStore.js`/`SectionRoadmap.jsx` are another
   stream's uncommitted work — landing order must be agreed (highest risk item).
2. **R-unit misreading** — every surface must carry the "idealized opportunity"
   label; this is the most quotable number in the lab and the easiest to misuse.
3. **Partial-bucket confirmation** at data end — define once, test in both engines.
4. **ConfigBar growth** (confirm-TF control) — keep it in the existing Segment
   row; backend mode stays read-only notice.
5. Scan-loop perf: +1 max() and a few registers per candle — negligible (2.6s on
   508k candles today).
6. MFE-after-R3 only covers the third retest, not "R3+" — research layer
   aggregates R3+ from events; label precisely.
7. KM curve (P2) deliberately stubbed until the simple histogram proves demand.

## 8. Final recommendation

**Combine v2.1 + monetization into one engine release** (Phases A–B together,
then C–D), because they share the scan loop, schema bump, sniff, parity fixtures,
and re-export. Inside the release, death-definition fields land first in commit
order so every monetization number is born with an honest death stamp. Roadmap
(E) is independent — schedule it opportunistically once the parallel-stream
question is settled. Defer only: buffer-default change (decision item) and the
KM curve (P2).
