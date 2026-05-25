# Design Plan V2 — Configuration & Order Block Stats Panels
**Scope:** RunDetail.jsx · Configuration section · Order Block Stats section  
**Mode:** Audit / Design only — no implementation changes  
**Supersedes:** DESIGN_CONFIG_OB_STATS.md  
**Date:** 2026-05-25

---

## Preface: What changed and why

The first design plan was written in isolation from the rest of the product. Reading
OrderBlockLab.jsx and StrategyBuilder.jsx changes several recommendations substantially.

The core shift: **Run Detail must not be a research page and must not be a config
editor.** It already has neighbours that own those jobs completely. The correct role
for Run Detail is a **decision-support surface** — the one place a researcher lands
after importing a run to answer three fast questions:

1. Did the run perform well?
2. Did the run behave as configured?
3. Should I drill deeper into OBs or go tune the strategy?

Every panel on Run Detail should answer one of those questions and nothing more.

---

## 1. Product Surface Audit

### 1.1 Order Block Lab — what it already owns

OrderBlockLab.jsx provides comprehensive research across every structural and
behavioural OB dimension:

| Dimension | OB Lab panel |
|---|---|
| BOS vs CHoCH win rate / net R | Structural Quality · BOS vs CHoCH |
| Long vs Short performance | Structural Quality · Long vs Short |
| OB origin session performance | Origin Session Performance |
| OB creation UTC hour | OB Creation Hour Performance |
| OB width buckets (0-2/2-5/5-10/10+) | OB Width Analysis |
| OB age / time-to-fill buckets | OB Age / Time-to-Fill |
| Max OB penetration % buckets | Penetration Depth Analysis |
| Hard invalidation (ob_fully_breached) | Catastrophic Failures |
| Fast stopout by time buckets | Fast Stopout Analysis |
| Distance before fill (in R) | Distance Before Fill |
| Origin × Fill session cross matrix | Timing · Origin × Fill Session |
| Worst losing trades with OB context | Failure Lab |

**Implication for Run Detail OB Stats:** The entire "quality research" angle is
already handled. Duplicating BOS/CHoCH, width buckets, age, penetration, session
performance, or worst losses in Run Detail would create a weaker version of what
already exists one navigation hop away.

The OB Lab does **not** currently show:
- A lifecycle funnel (Detected → Filled → Win/Loss/Unfilled/Cancelled/Invalidated)
- Operational status counts (how many session-filtered, news-cancelled, reverse-cancelled)
- The OB detection balance vs. actual trade conversion ratio

These three are uniquely valuable on Run Detail as a sanity check.

---

### 1.2 Strategy Builder — what it already owns

StrategyBuilder.jsx is the canonical config-authoring surface. Its panels define the
complete vocabulary of strategy parameters:

| Group | Parameters |
|---|---|
| Basic Settings | symbol, detection TF, execution TF, date range, data file |
| Structure Settings | swing length, OB filter (ATR/CMR), structure type, trade direction |
| Execution Settings | RR, OB entry depth %, entry buffer, stop buffer, verify ticks, execution mode, position conflict, cancel action |
| Filters | session filter on/off, per-session chips (London/Lull/NY/Asia/Outside), OB origin session, OB detection session |
| News Blackout | enabled, before/after window, impacts, currencies, pause pending, block fills, cancel if touched, flatten active, flatten minutes before |
| Advanced | spread, slippage, commission |

Its "Last Run Sanity Check" is a flat debug grid of ~30 key/value cells covering
all config fields plus run reporting stats.

**What Strategy Builder reveals about Run Detail's current config panel:**

The current Run Detail config panel shows 13 fields but is missing:
- `swing_length` (swing detection sensitivity)
- `ob_filter` (ATR vs CMR)
- `position_conflict` / `cancel_action` (conflict handling behaviour)
- `ob_origin_session` / `ob_detection_session` (OB-level session filters)
- `spread`, `slippage`, `commission` (execution cost model — critical for result validity)
- `structure_type` and `trade_direction` are hardcoded to "Both" instead of read from config

**Implication for Run Detail Configuration:** Don't duplicate the full Strategy
Builder — it already has all 30+ fields. Instead surface the minimum config context
a researcher needs to correctly interpret the results they're looking at.

---

### 1.3 Role clarification across pages

| Page | Primary role | Answers |
|---|---|---|
| Strategy Builder | Config authoring | "What settings should I test next?" |
| Run Detail | Results + sanity | "How did this run perform? Did it behave correctly?" |
| Order Block Lab | OB research | "Which OB characteristics predict performance?" |
| Trade Inspector | Per-trade drill-down | "What happened on this specific trade?" |
| Protection / Entries Lab | Execution variant comparison | "Which protection/entry model is better?" |

---

## 2. Revised Configuration Panel Design

### 2.1 Design principle

Show just enough config context to interpret the results correctly. A researcher
looking at a 52% win rate with +18R net needs to quickly understand:

- What was it trading? (Symbol, TF, date range, direction, structure)
- What were the entry economics? (RR, entry depth, buffers, execution costs)
- What was filtered out? (Sessions, OB sessions, news)
- What mode of conflict handling was active?

Anything beyond that belongs in Strategy Builder or the raw config export.

### 2.2 Proposed groups

Five compact groups, rendered as stacked bordered sub-sections within the existing
`NeonPanel`. Each group has a small uppercase section label, then a 2-column chip
grid.

---

#### Group 1 — Detection

*"What market and structure was this run scanning?"*

| Label | Source | Format |
|---|---|---|
| Symbol | `run.symbol` | e.g. `EURUSD` |
| Detection TF | `compactTimeframe(run.detectionTf)` | e.g. `H1` |
| Execution TF | `run.executionTf` | e.g. `1m` |
| Date Range | `formatRunDateRange(run.dateRange)` | e.g. `18 May 25 → 18 May 26` |
| Structure | `runData?.config?.structure_type` (NOT hardcoded) | `BOS` / `CHoCH` / `Both` |
| Direction | `runData?.config?.trade_direction` (NOT hardcoded) | `Long` / `Short` / `Both` |
| Swing | `runData?.config?.swing_length ?? "—"` | e.g. `50` |
| OB Filter | `runData?.config?.ob_filter ?? "—"` | `ATR` / `CMR` |

---

#### Group 2 — Entry / Risk

*"What were the economic parameters?"*

| Label | Source | Format |
|---|---|---|
| RR | `run.rr` | e.g. `3.3×` |
| Entry Depth | `runData?.config?.ob_entry_depth_pct ?? "—"` | `0%` / `25%` / `50%` etc. |
| Entry Buffer | `run.entryBuffer` | e.g. `0 pip` |
| Stop Buffer | `run.stopBuffer` | e.g. `1.0 pip` |
| Verify Ticks | `run.verifyTicks` | e.g. `3` |
| Spread | `runData?.config?.spread ?? runData?.config?.spread_pips ?? "—"` | e.g. `0.2 pip` |
| Slippage | `runData?.config?.slippage ?? "—"` | e.g. `0.2 pip` |
| Commission | `runData?.config?.commission ?? "—"` | e.g. `0` |

---

#### Group 3 — Execution Mode

*"How did the strategy manage concurrent setups?"*

| Label | Source | Format |
|---|---|---|
| Execution Mode | `run.executionMode` via `variantLabel()` | `Single position` / `Allow multi` / `One per dir` |
| Position Conflict | `runData?.config?.position_conflict ?? runData?.config?.conflict ?? "—"` | `Allow Auto Reversal` / `Block Opposite` |
| Conflict Cancel | `runData?.config?.cancel_action ?? "—"` | `Kill OB` / `Allow Resume` / `Kill If Touched` |

---

#### Group 4 — Session & OB Filters

*"What was traded and when?"*

| Label | Source | Format |
|---|---|---|
| Session Filter | `runData?.config?.session_filter_enabled` | `✓ Enabled` chip / `— Off` text |
| Allowed Sessions | `runData?.config?.allowed_sessions` (array) | Per-session `<Pill>` chips, or `All` if off |
| OB Origin Session | `runData?.config?.origin_session ?? runData?.config?.ob_origin_session ?? "Any"` | Session name or `Any` |
| OB Detection Session | `runData?.config?.detection_session ?? runData?.config?.ob_detection_session ?? "Any"` | Session name or `Any` |

---

#### Group 5 — News Protection

**Conditionally rendered** — only show this group when `run.news_blackout_enabled`
or `runData?.config?.news_blackout_enabled` is truthy. When news is off, show a
single dim "News protection: Off" line instead of the full group.

Split into two sub-rows: settings (config) and impact (runtime stats).

**Settings sub-row:**

| Label | Source |
|---|---|
| Window | `−{news_blackout_minutes_before}m → +{news_blackout_minutes_after}m` |
| Impacts | chips: `high` / `medium` / `low` |
| Currencies | chips per currency, or `All` if empty |
| Pause Pending | boolean chip |
| Block Fills | boolean chip |
| Cancel if Touched | boolean chip |
| Flatten Active | boolean chip |
| Flatten Lead Time | `{news_flatten_minutes_before_blackout} min before` |

**Impact sub-row** (small secondary font, runtime outcomes):

| Label | Source |
|---|---|
| Events Matched | `run.news_events_matched` |
| Windows Created | `run.news_windows_created` |
| Touch Cancelled | `run.news_touch_cancelled` |
| Trades Flattened | `run.news_active_trades_flattened` |
| Flattened R | `run.news_flattened_r` |
| Late Flattens | `run.news_flatten_late_count` |

---

### 2.3 Comparison with V1

| Change | V1 | V2 |
|---|---|---|
| Number of groups | 4 | 5 (Detection split from Entry/Risk; Execution Mode added) |
| Direction / Structure | Hardcoded "Both" | Read from `runData.config.*` |
| Swing length + OB filter | Absent | Added to Group 1 |
| Position conflict + cancel action | Absent | Added to Group 3 |
| OB origin/detection session filters | Absent | Added to Group 4 |
| Spread / slippage / commission | Absent | Added to Group 2 |
| News reporting stats placement | Inside news group | Sub-row within Group 5, styled secondary |
| Importer promotion (Phase 3) | Recommended | Still recommended but lower priority; raw config read is sufficient |

---

## 3. Revised Order Block Stats Panel Design

### 3.1 Design principle

**Run Detail OB Stats = sanity check, not research.**

The question this panel answers is: "Did the OB detection and conversion work
correctly for this run, and are there any obvious operational anomalies?"

It does NOT try to answer: "Which OB characteristics produce the best outcomes?"
That is Order Block Lab's job, and it does it comprehensively.

The metric to avoid above all: duplicating any of the 11 bucket analyses that OB Lab
already performs. Showing a BOS/CHoCH table or origin session performance table here
would be a worse version of OB Lab with no additional value.

---

### 3.2 What this panel should do that OB Lab does NOT

1. **Lifecycle funnel** — OB Lab never shows the full OB-to-trade conversion path
   (how many OBs were detected, how many filled, how many were killed before fill,
   and what happened to the filled ones). This is a sanity check on the detection
   pipeline, not a quality research dimension.

2. **Operational cancellation counts** — Session-filtered, news-cancelled, reverse-
   cancelled, invalidated. These are "did the strategy rules fire correctly?" numbers.
   OB Lab focuses on quality of the trades that did happen, not on what the
   strategy's filters removed.

3. **OB detection balance as a single number** — Bull/bear ratio as a quick check
   for obvious directional detection bias in this run.

4. **Link to OB Lab** — explicit affordance for the researcher to go deeper.

---

### 3.3 Proposed layout: three zones

---

#### Zone A — Overview chips (always visible when OBs exist)

Five chips in a row, styled like the existing KPI chips but smaller:

```
Total OBs  |  Bullish  |  Bearish  |  Avg Width  |  Fill Rate
  147            89         58        6.4 pip        41.5%
```

Derivation:
- Total: `runData.orderBlocks.length`
- Bullish/Bearish: from `ob.side === "bull"` / `"bear"`
- Avg Width: `mean(abs(ob.top − ob.bot) / pipSize)` — use `runData.config.pip_size` or fall back to `/ 10000`
- Fill Rate: `(OBs where fillTime != null OR linkedTradeId !== "") / total * 100`

---

#### Zone B — Lifecycle Funnel

The core unique contribution of this panel. A compact stepped breakdown showing
what the strategy's OBs did from detection to outcome.

Render as a vertical funnel with indented child rows — compact, monospaced, consistent
with the existing Stat component style:

```
LIFECYCLE

Detected             147
  ├─ Filled            61   (41.5%)
  │    ├─ Win           28
  │    ├─ Loss          18
  │    └─ Other / BE     2
  ├─ Unfilled           42
  ├─ Invalidated        18
  ├─ Session filtered   12
  ├─ News cancelled      8
  └─ Reverse cancel      6
```

Colour coding (consistent with the rest of the app):
- Win: `hsl(var(--success))`
- Loss: `hsl(var(--danger))`
- Filled parent: `hsl(var(--accent-primary))`
- Session filtered / News cancelled / Reverse cancel: `hsl(var(--warning))`
- Unfilled / Invalidated: muted white

**Derivation logic** (all from existing data, no backend changes):

```
Filled:          obs where ob.fillTime != null OR ob.linkedTradeId !== ""
                 — fall back to: trades grouped by obId where valid fill exists
Unfilled:        obs where all cancel/fill/invalidation timestamps are null
                 (i.e. no lifecycle event occurred before end of run)
Invalidated:     ob.invalidationTime != null
Session filtered: ob.sessionCancelTime != null
News cancelled:  ob.newsBlackoutTriggerTime != null
Reverse cancel:  trades where reverseConflict === true
                 (or ob.reverseTouchTime != null)
Win/Loss/Other:  join filled OBs to trades via linkedTradeId / obId, read outcome
```

If `obFinalStatus` is present in the data, use it directly for classification.
If absent, derive from the timestamp fields above. Both paths produce the same
categories — the timestamp fallback is fully safe.

---

#### Zone C — Insight line(s)

At most two auto-generated insight lines, rendered as the existing left-border
accent strip (consistent with `autoInsights` in RunDetail's Outcome Distribution).

Only emit a line when a condition is clearly anomalous:

| Condition | Line |
|---|---|
| `fillRate < 0.35` | `"Only {n}% of OBs filled — detection may be too restrictive or entry depth too shallow."` |
| `fillRate > 0.75` | `"{n}% of OBs filled — high conversion rate."` |
| `sessionFiltered > total * 0.15` | `"{n} OBs session-filtered before fill — session restrictions are active."` |
| `newsCancelled > 0` | `"{n} OBs cancelled by news blackout."` |
| `reverseCancelled > total * 0.05` | `"{n} reverse-conflict cancellations — consider position conflict settings."` |
| `invalidated > filled` | `"More OBs were invalidated than filled — consider detection TF or swing sensitivity."` |
| `bullish / total > 0.70` | `"Run is {n}% bullish OBs — directional skew present."` |
| `bearish / total > 0.70` | `"Run is {n}% bearish OBs — directional skew present."` |

Suppress any insight where the underlying field value is null / derived from a
null-fallback chain.

---

#### Zone D — OB Lab navigation affordance

A small dim text row at the bottom of the panel:

```
→ Open Order Block Lab for structure, width, age and session quality analysis
```

Rendered as a `Link` to `/order-block-lab`, styled with `text-muted-lab` and
accent-primary hover. This makes the handoff explicit.

---

### 3.4 What was removed vs V1

| Removed element | Reason |
|---|---|
| Bullish vs Bearish performance cards (win rate, avg R, net R per direction) | OB Lab's "Long vs Short" bucket table covers this completely and with more data |
| Direction split with full stats | Same — OB Lab |
| Per-direction avg R | Same — OB Lab |
| Best/worst OB by R | OB Lab's Failure Lab + best bucket metric already surfaces this |
| Detailed status chips grid (Zone D in V1) | Replaced by the funnel — same data, better information density |
| Median OB width | Removed as secondary; avg is sufficient for a sanity check |

| Added element | Reason |
|---|---|
| Lifecycle funnel (Zone B) | Unique to this panel; OB Lab does not show it |
| OB Lab navigation link (Zone D) | Makes the product flow explicit |
| Revised insight conditions | Rewritten to flag operational anomalies, not quality findings |

---

## 4. Metrics — Derivable Now vs Needs Backend

### 4.1 Safely derivable now (no changes to backend or importer)

**Configuration panel:**
- All Group 1-4 fields from `runData.config.*` — the raw config object is already
  stored in every run bundle
- `structure_type`, `trade_direction`, `swing_length`, `ob_filter`,
  `position_conflict`, `cancel_action`, `ob_origin_session`, `ob_detection_session`,
  `spread`, `slippage`, `commission` — all present in raw config

**OB Stats panel:**
- Total / Bullish / Bearish counts
- Avg OB width in pips (top − bot / pipSize, pipSize from config)
- Fill rate (via `ob.fillTime` or `ob.linkedTradeId`)
- Unfilled / Invalidated / Session-filtered / News-cancelled counts (via timestamp
  fields on each OB: `sessionCancelTime`, `newsBlackoutTriggerTime`, `invalidationTime`)
- Reverse-cancelled count (via `ob.reverseTouchTime` or trade `reverseConflict`)
- Wins / Losses / Other from filled OBs (via trade join on `linkedTradeId`/`obId`)
- Fill conversion rate
- All insight line conditions

### 4.2 Would benefit from importer promotion (optional Phase 3)

Promoting these fields from `runData.config` into `runSummary` means they're
available directly on the `run` object without needing `runData`:

```
trade_direction, structure_type, swing_length, ob_filter,
position_conflict, cancel_action, ob_origin_session, ob_detection_session,
spread, slippage, commission,
news_blackout_minutes_before, news_blackout_minutes_after,
news_blackout_impacts, news_blackout_currencies,
news_pause_pending_orders, news_block_new_fills,
news_cancel_if_touched_during_blackout, news_flatten_active_trades,
news_flatten_minutes_before_blackout,
ob_entry_depth_pct
```

This is clean-up, not a blocker. `runData.config` is accessible today.

### 4.3 Requires backend / export changes

- `obFinalStatus` column reliability — some backends may not export it. The
  timestamp-field fallback mitigates this completely; `obFinalStatus` is a bonus
  when present.
- Per-session OB detection counts — knowing that 12 OBs originated in Asia but
  none filled would require `ob_origin_session` in the OB CSV, which is currently
  only on trades.
- `ob_fully_breached` guarantee — used by OB Lab's Catastrophic Failures panel;
  not needed for this Run Detail redesign.

---

## 5. Recommended Implementation Phases (revised)

### Phase 1 — Configuration panel (RunDetail.jsx only)

Replace the current 13-row flat grid with five grouped sub-sections.

Key additions requiring attention:
- Read `runData.config.*` directly for all new fields
- Fix the hardcoded "Both" for Structure and Direction
- Group 3 (Execution Mode) needs a new sub-section not in the current layout
- Group 5 (News) is already partially implemented — extend with settings sub-row
- Spread/slippage/commission should render `—` gracefully when absent from config

Scope: ~120 lines of JSX, replacing current ~25-line grid.

---

### Phase 2 — OB Stats panel (RunDetail.jsx only)

Expand the `obStats` useMemo with lifecycle bucket logic, then render Zones A–D.

The lifecycle derivation is new logic (~50 lines) operating on `runData.orderBlocks`
and `runData.trades`. The render is simple (~70 lines).

Key: the funnel rows are computed in order — Filled first (via fill timestamp or
linked trade), then the cancelled/invalidated/unfilled remainder from remaining OBs.

Add the OB Lab `<Link>` affordance at the bottom.

Scope: ~120 lines total replacing the current ~15-line grid.

---

### Phase 3 — Importer field promotion (importer.js, optional)

Promotes the ~20 additional config fields into `runSummary` so the UI reads cleanly
from `run.*` rather than `runData.config.*`.

No user-visible change beyond minor code simplification. Low priority.

---

## 6. Files Requiring Changes

| File | Changes | Phase | Risk |
|---|---|---|---|
| `frontend/src/pages/RunDetail.jsx` | Config panel (5 groups), OB Stats panel (3 zones + link), expand `obStats` memo | 1, 2 | Low — isolated sections, no shared state |
| `frontend/src/data/importer.js` | Add ~20 config fields to `runSummary` in `ingestRunBundle` | 3 (optional) | Very low — additive only |
| `frontend/src/pages/OrderBlockLab.jsx` | No changes | — | — |
| `frontend/src/pages/StrategyBuilder.jsx` | No changes | — | — |
| `frontend/src/data/store.js` | No changes | — | — |

---

## 7. What Changed From V1

### Added to Configuration panel
- `swing_length` — absent in V1, present in Strategy Builder, important context
- `ob_filter` (ATR vs CMR) — absent in V1
- `position_conflict` + `cancel_action` — absent in V1; Strategy Builder exposes these as distinct settings
- `ob_origin_session` / `ob_detection_session` — absent in V1; Strategy Builder treats these as separate filter controls
- `spread`, `slippage`, `commission` — absent in V1; critical for result validity
- Group 3 "Execution Mode" as a standalone group — V1 buried execution mode and conflict together with risk params

### Removed from Configuration panel
- V1's News group put runtime stats (events matched, windows created) prominently in the group. V2 demotes them to a secondary sub-row since they're outcomes, not settings.

### Removed from OB Stats panel
- Full Bullish/Bearish performance cards (V1 Zone C) — OB Lab already covers Long vs Short performance comprehensively and with better formatting
- Detailed per-direction avg R, net R — same reason
- Best/worst OB by R — OB Lab Failure Lab covers this
- Median OB width — unnecessary for a sanity check
- Status chips as the primary display format — replaced by the funnel which communicates the same data with clearer causal structure

### Added to OB Stats panel
- Lifecycle funnel (V1 had this concept as a "potential" zone, V2 makes it the centrepiece)
- OB Lab navigation link — makes the product flow explicit; was absent from V1
- Insight lines refocused on operational anomalies rather than quality findings

### Overarching framing change
V1 designed both panels independently. V2 designs them as part of a product where
Order Block Lab owns quality research and Strategy Builder owns config authoring.
Run Detail's panels are narrowed to their actual decision-support roles:
Configuration = "verify what this run tested", OB Stats = "verify OBs behaved correctly".
