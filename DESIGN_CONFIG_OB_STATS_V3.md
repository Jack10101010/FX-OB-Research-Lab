# Design Plan V3 — Configuration & Order Block Stats Panels
**Scope:** RunDetail.jsx · Configuration section · Order Block Stats section
**Mode:** Design refinement only — no implementation
**Supersedes:** DESIGN_CONFIG_OB_STATS_V2.md
**Date:** 2026-05-25

---

## Design Mandate

Run Detail answers four questions, in this order:

1. Did this run perform well?
2. Did it behave as configured?
3. Are there obvious operational anomalies?
4. Should I drill into Order Block Lab?

Every element on these two panels must serve at least one of those questions.
If it doesn't, it doesn't belong here.

---

## Part A — Configuration Panel (V3)

### Principle

The config panel answers: **"What was this run testing, and under what constraints?"**

It is a read receipt for the strategy parameters — compact enough to scan in
under ten seconds, grouped by meaning, not by schema. It is not a config editor.
It is not a sanity check tool. It does not mix runtime telemetry with settings.

All runtime outcome stats (events matched, windows created, flattened count,
flattened R, session filtered skipped) are **removed from this panel entirely**.
They belong in the OB Stats operational section.

---

### Four Groups

---

#### A — Market / Detection

*"What market and structural conditions was this run scanning?"*

These fields establish the research identity of the run. A researcher switching
between multiple imported runs should be able to read this group and immediately
know what they are looking at.

| Field | Source | Notes |
|---|---|---|
| Symbol | `run.symbol` | |
| Detection TF | `compactTimeframe(run.detectionTf)` | |
| Execution TF | `run.executionTf` | |
| Date Range | `formatRunDateRange(run.dateRange)` | |
| Structure | `runData?.config?.structure_type` | **Not hardcoded** — read from config |
| Direction | `runData?.config?.trade_direction` | **Not hardcoded** — read from config |
| Swing | `runData?.config?.swing_length ?? "—"` | Detection sensitivity |
| OB Filter | `runData?.config?.ob_filter ?? "—"` | `ATR` or `CMR` |

**Rendering:** 2-column label/value chip grid. Symbol and Date Range span full width
due to value length. Structure and Direction render as accent-coloured `<Pill>`
chips (`BOS`, `CHoCH`, `Both`, `Long`, `Short`). Swing and OB Filter render as dim
mono values — secondary context, not primary.

---

#### B — Execution / Risk

*"What were the economic mechanics and how did the strategy manage conflicts?"*

This group contains everything that directly shapes trade P&L and position handling.
Execution Mode and Conflict mode are included here — they are execution mechanics,
not filters.

| Field | Source | Notes |
|---|---|---|
| RR | `run.rr` | Render as `3.3×` |
| Entry Depth | `runData?.config?.ob_entry_depth_pct ?? "—"` | Render as `25%`, `Edge` if 0 |
| Entry Buffer | `run.entryBuffer` | Render as `0.0 pip` |
| Stop Buffer | `run.stopBuffer` | Render as `1.0 pip` |
| Verify Ticks | `run.verifyTicks` | |
| Execution Mode | `run.executionMode` via `variantLabel()` | `Single` / `Allow multi` / `One per dir` |
| Conflict Mode | `runData?.config?.position_conflict ?? runData?.config?.conflict ?? "—"` | `Auto Reversal` / `Block Opposite` |
| Conflict Cancel | `runData?.config?.cancel_action ?? "—"` | `Kill OB` / `Allow Resume` / `Kill If Touched` |

**Rendering:** 2-column grid. RR renders large and accented — it is the most
important single economic parameter. Entry Depth renders as a chip:
`Edge` when 0, `{n}%` otherwise. Conflict Cancel only appears when
Conflict Mode is `Block Opposite` (irrelevant otherwise — show `—` or omit).

---

#### C — Filters

*"What was allowed or excluded?"*

This group explains which OBs and sessions were in scope. It answers "why didn't
I see trades in Asia?" or "were bearish OBs excluded from this run?" directly.

| Field | Source | Notes |
|---|---|---|
| Session Filter | `runData?.config?.session_filter_enabled` | Boolean chip: `✓ Enabled` / `— Off` |
| Allowed Sessions | `runData?.config?.allowed_sessions` (array) | One `<Pill>` per session; `All` if filter off |
| OB Origin Session | `runData?.config?.origin_session ?? runData?.config?.ob_origin_session ?? "Any"` | |
| OB Detection Session | `runData?.config?.detection_session ?? runData?.config?.ob_detection_session ?? "Any"` | |

**Rendering:** Session Filter renders as a boolean chip. Allowed Sessions renders
as a horizontal row of session pills — active sessions use `tone="primary"`,
excluded sessions render as dim muted pills (or are omitted if filter is off and
everything is allowed). OB Origin / Detection Sessions render as plain values;
show `Any` when unrestricted, highlight with an accent colour when restricted.

If session filter is off AND both OB session filters are `Any`, collapse this group
to a single dim line: `"Session filter: Off · All sessions eligible"`.

---

#### D — News / Costs

*"What blackout rules and execution costs applied?"*

This group is **collapsible when news is disabled**. When collapsed, it renders as
a single dim status line: `"News protection: Off · Spread 0.2 · Slip 0.2 · Comm 0"`.
That single line still surfaces the cost model at a glance.

When expanded (or when news is enabled):

**News sub-section:**

| Field | Source | Notes |
|---|---|---|
| News Blackout | `run.news_blackout_enabled` | Boolean chip at the top of the group |
| Window | `−{news_blackout_minutes_before}m / +{news_blackout_minutes_after}m` | Combined label |
| Impacts | `runData?.config?.news_blackout_impacts` (array) | Chips: `High` `Medium` `Low` |
| Currencies | `runData?.config?.news_blackout_currencies` (array) | Chips, or `All` if empty |
| Cancel If Touched | `runData?.config?.news_cancel_if_touched_during_blackout` | Boolean chip |
| Flatten Active | `runData?.config?.news_flatten_active_trades` | Boolean chip |
| Flatten Lead Time | `runData?.config?.news_flatten_minutes_before_blackout ?? "—"` | `{n} min before` |

**Cost model sub-section** (thin separator line between news and costs):

| Field | Source | Notes |
|---|---|---|
| Spread | `runData?.config?.spread ?? runData?.config?.spread_pips ?? "—"` | `{n} pip` |
| Slippage | `runData?.config?.slippage ?? "—"` | `{n} pip` |
| Commission | `runData?.config?.commission ?? "—"` | |

Show `—` gracefully for any missing cost field. When all three are zero or missing,
render a single dim note: `"No cost model applied"`.

**Rendering:** The boolean chips in this group use a compact two-state style:
active = `border-accent bg-accent/12 text-white`, inactive = `border-border-soft
text-muted-lab`. This visually distinguishes "this rule was on" from "this rule
was off" without relying on colour alone.

---

### Config panel summary: fields by group

```
A  Market / Detection    8 fields
B  Execution / Risk      8 fields
C  Filters               4 fields (collapses to 1 line if all permissive)
D  News / Costs          10 fields (collapses to 1 line if news off)
                        ──────────
                  MAX   30 fields visible when all groups open
             TYPICAL   ~18 fields (groups C and D collapsed/minimal)
```

---

## Part B — Order Block Stats Panel (V3)

### Principle

This panel answers: **"Did the OBs behave as expected, and are there any conversion
or filtering anomalies I should investigate?"**

It is operational intelligence — a pipeline health check. It is not quality
research. It does not duplicate Order Block Lab's bucket analyses.

The panel is structured top-to-bottom in order of increasing granularity:
Summary → Integrity → Lifecycle → Direction → Anomalies → Next step.

---

### Zone 1 — Execution Summary Strip

A compact single row of six chips. This is the fastest possible reconciliation
between OB-level data and trade-level outcomes. The researcher can cross-check
these numbers against the KPI chips at the top of the page in under five seconds.

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Detected │ Eligible │ Executed │  Wins    │  Losses  │ Unfilled │
│   147    │   109    │    61    │    28    │    18    │    48    │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

| Chip | Value | Source | Tone |
|---|---|---|---|
| Detected | `total OBs` | `runData.orderBlocks.length` | muted |
| Eligible | `total − filtered − news − invalidated − reverse` | derived | secondary |
| Executed | valid traded OBs (filled and resulted in a trade) | trade join | primary |
| Wins | trades with positive outcome | `outcomeSummary.wins` | success |
| Losses | trades with negative outcome | `outcomeSummary.losses` | danger |
| Unfilled | eligible OBs with no fill event | derived | muted |

**Sub-labels:** Each chip shows its label and count. No percentages here — those
belong in the funnel. Keep this strip scannable and fast.

**Reconciliation intent:** `Executed` should equal `validTradeCount` from the
existing KPI strip. If it doesn't (due to unlinked trades or data gaps), that
discrepancy is itself an anomaly worth flagging in the integrity strip.

---

### Zone 2 — Run Integrity Strip

A compact row of diagnostic badges — green checkmarks and amber warnings.
Maximum six badges. Rendered as small mono chips in a flex-wrap row.

**Green checks** (show when condition is confirmed active and appears normal):

| Badge | Condition |
|---|---|
| `✓ Session filter active` | `session_filter_enabled === true` AND `sessionFilteredCount > 0` |
| `✓ News blackout active` | `news_blackout_enabled === true` AND `newsCancelledCount > 0` |
| `✓ Direction respected` | `trade_direction !== "both"` AND all linked trades match configured direction |

**Amber warnings** (show when a value exceeds an anomaly threshold):

| Badge | Condition | Threshold |
|---|---|---|
| `⚠ High invalidation` | `invalidatedCount / total > 0.20` | >20% |
| `⚠ Low fill conversion` | `filledCount / eligibleCount < 0.30` | <30% of eligible |
| `⚠ High session filter` | `sessionFilteredCount / total > 0.20` | >20% of detected |
| `⚠ High news cancel` | `newsCancelledCount / total > 0.10` | >10% of detected |
| `⚠ Directional skew` | `bullishCount / total > 0.70 OR bearishCount / total > 0.70` | >70% one direction |

**Important:** Only show a green check badge when the condition is confirmed from
actual data — not just from the config flag being set. A session filter that's
enabled but filtered zero trades should not show a green badge. Show neither green
nor amber in ambiguous cases.

**Rendering:** Each badge is a small `clip-bevel-sm` chip, monospaced text at
`text-[10px]`. Green: `border-[hsl(var(--success)/0.35)] text-[hsl(var(--success))]
bg-[hsl(var(--success)/0.06)]`. Amber: `border-[hsl(var(--warning)/0.35)]
text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)]`.

---

### Zone 3 — Lifecycle Funnel

The core unique contribution of this panel. A compact indented tree showing
what the strategy's OBs did from detection through to final outcome.

Every row shows **count + percentage**. Percentages are calculated relative to
the logical parent node (see right column), not always relative to total.

```
LIFECYCLE BREAKDOWN

Detected              147  (100%)     ← baseline
  ├─ Eligible         109  ( 74%)     ← % of Detected
  │    ├─ Filled       61  ( 56%)     ← % of Eligible
  │    │    ├─ Win      28  ( 46%)    ← % of Filled
  │    │    ├─ Loss     18  ( 30%)    ← % of Filled
  │    │    └─ BE / Partial  2 ( 3%)  ← % of Filled
  │    └─ Unfilled     48  ( 44%)     ← % of Eligible
  ├─ Session Filtered  22  ( 15%)     ← % of Detected
  ├─ News Cancelled     8  (  5%)     ← % of Detected
  ├─ Invalidated       18  ( 12%)     ← % of Detected
  └─ Reverse Cancel     6  (  4%)     ← % of Detected
```

**Eligible definition:**
`Eligible = Detected − Session Filtered − News Cancelled − Invalidated − Reverse Cancelled`

This represents OBs that made it past all terminal filter conditions and were
actively pending (waiting to fill or expire). It is the denominator for fill
conversion rate.

**Classification priority** (applied in this order when multiple timestamps exist):

1. `ob.sessionCancelTime != null` → **Session Filtered**
2. `ob.newsBlackoutTriggerTime != null` → **News Cancelled**
3. `ob.reverseTouchTime != null` → **Reverse Cancel**
4. `ob.invalidationTime != null` → **Invalidated**
5. `ob.fillTime != null` OR `ob.linkedTradeId !== ""` → **Filled**
6. None of the above → **Unfilled**

If `obFinalStatus` is present in the CSV, use it to resolve ambiguous cases.
The timestamp-based fallback is the default path and handles all known export formats.

**Win / Loss / BE / Partial classification** (for Filled OBs):
Join each filled OB to its linked trade via `linkedTradeId` or `obId`. Read the
trade's `outcome` and `r` value. Apply existing `normalizeOutcome()` logic:
- WIN → Win
- LOSS → Loss
- Finite `r` near target → Win or Loss
- `|r| < 0.1` or `outcome === "BREAKEVEN"` → BE / Partial
- No linked trade found → omit from Win/Loss/BE breakdown, count only in Filled

**Rendering:** Monospaced indented tree. Use CSS padding-left for indentation
(no SVG tree connectors — too complex for the value). The `├─` and `└─` characters
render fine in JetBrains Mono at `text-[11px]`. Counts in `tabular-nums`. Percentage
in `text-muted-lab` alongside each count. Colour coding:
- Win: `text-[hsl(var(--success))]`
- Loss: `text-[hsl(var(--danger))]`
- BE/Partial: `text-muted-lab`
- Session Filtered / News Cancelled / Reverse Cancel: `text-[hsl(var(--warning))]`
- Invalidated: `text-muted-lab`
- Eligible / Filled: `text-[hsl(var(--accent-primary))]`
- Unfilled: `text-white`

---

### Zone 4 — Directional Sanity

Two compact side-by-side cards: Long / Bullish vs Short / Bearish.

This is a **sanity check**, not research. The question is: "Did both directions
contribute roughly as expected, or is one direction dominating wins or losses?"

```
┌─────────────────────┐  ┌─────────────────────┐
│  LONG / BULLISH     │  │  SHORT / BEARISH    │
│  89 OBs detected    │  │  58 OBs detected    │
│  36 trades          │  │  25 trades          │
│  22W · 10L · 4BE    │  │   6W ·  8L · 0BE   │
│  Net R  +21.4R      │  │  Net R  −3.2R       │
│  Conv.    40%       │  │  Conv.    43%       │
└─────────────────────┘  └─────────────────────┘
```

| Row | Source |
|---|---|
| `{n} OBs detected` | filter `runData.orderBlocks` by `ob.side` |
| `{n} trades` | filter `runData.trades` by `trade.direction` (executed trades only) |
| `{n}W · {n}L · {n}BE` | group trade outcomes by direction |
| Net R | sum `trade.r` where `trade.direction === "Long"/"Short"` (executed) |
| Conv. % | `tradeCount / obsDetected * 100` for that direction |

**Rendering:** Two `NeonPanel`-style bordered cards in a `grid grid-cols-2 gap-3`.
Long card uses `accent-primary` for key numbers; Short card uses `accent-secondary`.
Net R is coloured green/red based on sign. Conv. % renders without colour unless
there's a large directional gap (>15pp difference between Long and Short conversion
rates), in which case the lower one renders amber — that's an anomaly worth noting.

**Hard constraint:** No bucket tables, no win rate columns, no expandable rows.
If a researcher wants deeper directional analysis they go to Order Block Lab.

---

### Zone 5 — Insight Lines

At most three anomaly lines. Rendered as the existing left-border accent strip
(same style as `autoInsights` in the Outcome Distribution panel). Each line
begins with `→`.

These fire on operational anomalies and unexpected behaviours, not quality observations.

| Condition | Insight |
|---|---|
| `filledCount / eligibleCount < 0.28` | `"Only {n}% of eligible OBs filled — check entry depth or session timing."` |
| `sessionFilteredCount / total > 0.22` | `"{n}% of detected OBs were session-filtered before fill."` |
| `reverseCancelledCount / total > 0.08` | `"Reverse conflict cancellations unusually high ({n}) — consider conflict settings."` |
| `bullishCount / total > 0.70` | `"Strong bullish detection skew this run ({n}% of OBs)."` |
| `bearishCount / total > 0.70` | `"Strong bearish detection skew this run ({n}% of OBs)."` |
| `invalidatedCount > filledCount AND invalidatedCount > 10` | `"More OBs invalidated ({n}) than filled ({n}) — review swing/TF sensitivity."` |
| `longNetR > 0 AND shortNetR < 0 AND abs(shortNetR) > 2` | `"Long OBs are driving returns; Short OBs are net negative this run."` |

Priority order: suppress lower-priority insights if higher-priority ones already
fire. Cap at three total. Do not emit an insight if the underlying count is derived
from a null-fallback chain (i.e., the required OB timestamp field is absent from
the data and we have no reliable count).

---

### Zone 6 — OB Lab CTA

A deliberate, premium navigation affordance. Not a lazy link — it is the explicit
hand-off point where "sanity check" ends and "quality research" begins.

Render as a bordered strip at the very bottom of the panel, slightly above the
panel's bottom padding:

```
┌──────────────────────────────────────────────────────────────────┐
│  → Open Order Block Lab                                          │
│    Structure · Width · Penetration · Age · Session analysis      │
└──────────────────────────────────────────────────────────────────┘
```

Styling:
- Container: `border border-[hsl(var(--accent-primary)/0.25)] bg-[hsl(var(--accent-primary)/0.04)] clip-bevel-sm px-4 py-3`
- Arrow + title: `text-[hsl(var(--accent-primary))] font-display text-[12px] uppercase tracking-wider`
- Sub-label: `text-muted-lab font-mono text-[10px] mt-0.5`
- Hover state: `hover:bg-[hsl(var(--accent-primary)/0.10)] hover:border-[hsl(var(--accent-primary)/0.45)] transition-colors`
- Implemented as a `<Link to="/order-block-lab">` wrapping the entire strip

This is the correct product flow signal: Run Detail is the landing page, OB Lab
is the research destination.

---

### OB Stats panel summary

```
Zone 1  Execution Summary Strip    6 chips — immediate reconciliation
Zone 2  Run Integrity Strip        up to 6 badges — config vs behaviour
Zone 3  Lifecycle Funnel           ~12 rows — full pipeline breakdown
Zone 4  Directional Sanity         2 side-by-side cards — Long vs Short
Zone 5  Insight Lines              max 3 — operational anomalies only
Zone 6  OB Lab CTA                 1 strip — explicit navigation
```

---

## Part C — Data Requirements

### Fully derivable from existing frontend data (no changes needed)

All funnel classification fields are already parsed by `parseOrderBlocksCSV` in
`importer.js` and stored in `runData.orderBlocks`:

| Funnel category | OB field used |
|---|---|
| Session Filtered | `ob.sessionCancelTime != null` |
| News Cancelled | `ob.newsBlackoutTriggerTime != null` |
| Reverse Cancel | `ob.reverseTouchTime != null` |
| Invalidated | `ob.invalidationTime != null` |
| Filled | `ob.fillTime != null` OR `ob.linkedTradeId !== ""` |
| Unfilled | none of the above |

Win/Loss from filled OBs: join via `linkedTradeId` → trade `outcome` / `r`.
Direction split: filter `runData.trades` by `trade.direction`.
All config fields in Groups A–D: read from `runData.config.*` directly.

### Requires importer promotion for cleaner code (Phase 3, optional)

Promoting `trade_direction`, `structure_type`, `swing_length`, `ob_filter`,
`position_conflict`, `cancel_action`, `ob_origin_session`, `ob_detection_session`,
`spread`, `slippage`, `commission`, and the news config fields into `runSummary`
in `ingestRunBundle` means the UI reads from `run.*` instead of `runData.config.*`.
This is cosmetic cleanup — not required for correct behaviour.

### Not required for this design (no backend work needed)

All metrics in both panels are computable from data already stored in the run bundle.
No new backend export fields are needed for V3.

---

## Part D — What Changed From V2

### Configuration panel

| Aspect | V2 | V3 |
|---|---|---|
| Number of groups | 5 | 4 (Execution Mode merged into Execution/Risk) |
| Runtime telemetry in config | Events matched, windows created, flattened count in news group | **Removed entirely** — config shows only settings, never outcomes |
| Group D contents | News settings + separate spread/slippage group | News settings + cost model in one collapsible group |
| Group D behaviour | Always expanded | **Collapsible when news disabled** — collapses to one-line summary |
| Group C collapse | Always expanded | **Collapses to one line** when filter is off and all sessions permitted |
| Conflict Cancel | Shown always | Only shown when Conflict Mode is `Block Opposite` (irrelevant otherwise) |

### OB Stats panel

| Aspect | V2 | V3 |
|---|---|---|
| Overview chips | 5 chips (Total, Bull, Bear, Width, Fill Rate) | **Zone 1 execution summary strip** — 6 chips adding Eligible and Executed, removing raw fill rate |
| Lifecycle funnel | Simple indented tree with 6 terminal states | **Adds Eligible as a distinct stage** with its own count + %; all rows show count + % |
| Integrity diagnostics | Not present | **Zone 2 integrity strip** — green/amber badges for config vs behaviour |
| Direction split | Full performance cards with avg R, win rate, detailed stats | **Simplified to 2 compact cards**: OBs detected, trades, W/L/BE, Net R, conversion % |
| Insight lines | 8 conditions, some research-oriented | **Reduced to 7 conditions, all operational anomalies** — quality findings removed |
| OB Lab CTA | Dim text link | **Styled bordered strip** — intentional, polished, visually distinct |

---

## Part E — Risks and Caveats

### OB timestamp field availability

The lifecycle funnel relies on `sessionCancelTime`, `newsBlackoutTriggerTime`,
`reverseTouchTime`, and `invalidationTime` being populated in the OB CSV export.
If the backend does not export these columns, all four of those rows will show zero
and the funnel will collapse to: Detected → Eligible (= total) → Filled/Unfilled.

**Mitigation:** This is a graceful degradation — the funnel still works, it just
shows less. Suppressed rows render as `0 (0%)` or are hidden entirely using
`count > 0` guards.

### "Eligible" can go negative in edge cases

If an OB has multiple cancellation events (e.g., both `sessionCancelTime` and
`newsBlackoutTriggerTime` are set), the priority-order classification prevents
double-counting. However, if the classification logic is not strict, Eligible
could undercount. **Mitigation:** Enforce exactly one classification per OB —
priority order is well-defined in Zone 3 above.

### Trade join completeness

Win/Loss counts in the funnel and the directional cards rely on `ob.linkedTradeId`
matching `trade.id`, or `ob.id` matching `trade.obId`. Unlinked trades (no OB id)
are already tracked as `analytics.unlinkedCount` in OB Lab. If unlinked count is
high, the funnel win/loss breakdown will be incomplete.

**Mitigation:** When unlinked trades exist, show a small note below the funnel:
`"{n} trades have no linked OB — win/loss counts may be understated."` This is the
same language OB Lab uses in its `MetricChip` for unlinked count.

### Group D collapse interaction

When news is disabled, Group D collapses to one line including the cost model
summary. If spread, slippage, and commission are all absent from the config, that
line reads `"News protection: Off · No cost model applied"`. This is correct and
honest — show it.

### Integrity strip false positives

The `✓ Direction respected` check requires comparing the configured direction filter
against actual trade directions. If trades include SESSION_FILTERED or UNFILLED rows
with no direction value, the check could incorrectly fail. **Mitigation:** Only
check direction on executed trades (those passing `isValidExecutedTrade()`).

### Visual density at small panel width

The OB Stats panel is currently `xl:col-span-1` (one third of the three-column
grid). The six-chip summary strip and two-card direction split need at least 380px
to avoid wrapping badly.

**Recommendation:** Consider giving the OB Stats panel `xl:col-span-2` to match
Outcome Distribution's span, or at minimum ensure the summary strip wraps gracefully
to two rows at narrow widths (flex-wrap is sufficient).
