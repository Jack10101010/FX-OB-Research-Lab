# FX-OB Research Lab — Run Detail Page: Information Architecture Audit

**Auditor role:** Senior UX / Product Architect  
**Subject page:** Order Block Lab → Run Detail (EURUSD Initial Test)  
**Date:** 2026-06-03  
**Scope:** Information architecture only. No visual or styling changes.

---

## PHASE 1 — CONTENT INVENTORY

Every discrete section visible on the current Run Detail page, assessed for value, frequency, and placement.

---

### 1.1 Persistent / Always-Visible Elements

| # | Section Name | Purpose | Value Level | Frequency | Placement Verdict |
|---|---|---|---|---|---|
| 1 | **Top Navigation Sidebar** | App-wide routing | Critical | Every run | Always visible |
| 2 | **Run Header (breadcrumb + title)** | Identifies the run in context | Critical | Every run | Always visible |
| 3 | **Run Metadata Strip** | Shows symbol, timeframe, date range, strategy params, hold/stop config | Critical | Every run | Always visible — collapse secondary params behind an expand toggle |
| 4 | **KPI Summary Cards** (6 cards: trade count, filtered count, total R, max loss, strategy type, data source) | Headline result at a glance | Critical | Every run | Always visible — pinned above tabs |
| 5 | **Availability Rule Banner** | Shows the active filter rules and how many trades were excluded | Useful | Every run | Collapsed by default; expandable inline |
| 6 | **Filtered Positions Banner** | Explains what the filtered dataset represents | Useful | Sometimes | Collapsed by default |
| 7 | **Research Notes** | Free-text notes about the run's hypothesis and observations | Critical | Every run | Always visible — move to a dedicated sidebar panel or top-of-Overview tab |

---

### 1.2 Research Suite Tab Contents

The current page exposes all of the following sections simultaneously in a single long scroll. Each is inventoried below.

| # | Section Name | Purpose | Value Level | Frequency | Placement Verdict |
|---|---|---|---|---|---|
| 8 | **Session Quality — Long to Short** | Win/loss breakdown by session combination | Critical | Every run | Overview tab (summary row) + Session tab (full) |
| 9 | **Standard Session Quality** | Alternative session quality view | Useful | Every run | Session tab |
| 10 | **Single Session Performance** | Performance when only one session is active | Useful | Every run | Session tab |
| 11 | **OB Creation Bias Performance** (by creation time UTC bucket) | When during the day the OB was created, and how those OBs perform | Critical | Every run | OB DNA tab |
| 12 | **News Created OB Trade Performance** | Impact of news events on OB-sourced trade performance | Useful | Sometimes | Context tab |
| 13 | **News Created OB Population** | Statistical breakdown of the news-linked OB pool | Useful | Sometimes | Context tab |
| 14 | **OB Maker Analysis** | Who/what created the OB (candle type, move type, etc.) | Critical | Every run | OB DNA tab |
| 15 | **OB Age / Time to Fill** | How long after creation the OB was filled | Critical | Every run | OB DNA tab |
| 16 | **Penetration Depth Analysis** | How deep price penetrated the OB before reacting | Useful | Every run | OB DNA tab |
| 17 | **Day of Week Performance** | Win/R stats by weekday | Useful | Every run | Session tab |
| 18 | **Time Analysis — Counterpart Returns** | Correlation between trade performance and counterpart instrument returns | Niche | Rarely | Deep-Dive tab or modal |
| 19 | **Local Drawdown** | Intra-trade drawdown behavior | Useful | Sometimes | Trade Quality tab |
| 20 | **Timing — Origin Session / 1H Session Heatmap** | Grid showing session-pair timing patterns | Useful | Every run | Session tab |
| 21 | **Breakout Analysis — Entry & Pricing Performance** | How entry price relative to OB boundaries affects outcome | Critical | Every run | Trade Quality tab |
| 22 | **Order Block — Candle Composition** | Candle structure (body size, wicks) within the OB zone | Niche | Rarely | OB DNA tab → collapsed by default |

---

### 1.3 Sections Inferred but Partially Obscured

| # | Section Name | Purpose | Placement Verdict |
|---|---|---|---|
| 23 | **Research Suite sub-tabs** (Trade Results, Triggering OBs Test, algo_walk_position) | Separate analytical views of the same run | Keep — reorganize into the new tab structure |
| 24 | **Action bar** (New Project, Timeline, etc. — top right) | Run management actions | Always visible in run header |

---

## PHASE 2 — USER FLOW AUDIT

### 2.1 Current (Broken) Flow

The page has no enforced or implied flow. A researcher opening a run immediately faces:

```
All KPIs → Availability Rules → Research Notes → 
[Session tables × 3] → [OB Creation tables] → 
[News tables × 2] → [OB Maker] → [OB Age] → 
[Penetration] → [Day of Week] → [Counterpart Returns] → 
[Drawdown] → [Session Heatmap] → [Breakout/Entry] → 
[Candle Composition] → ...
```

**Problems with current flow:**
- No visual hierarchy distinguishes "what happened" from "why it happened."
- The most time-critical question — *"Is this run worth investigating further?"* — requires scanning six KPI cards then immediately diving into granular tables with no transition.
- Research Notes (the researcher's own hypothesis) is buried mid-page, not at the top where it should frame the entire review.
- Session Analysis and OB DNA analysis are interleaved with news/context data, breaking the conceptual grouping.
- No section signals "you've seen enough for a first pass" — there is no natural pause point.

---

### 2.2 Ideal Researcher Flow

A researcher reviewing a run should move through three mental stages:

**Stage 1 — Orientation (< 30 seconds)**
> "What run is this, what was I testing, and did it work at a headline level?"

**Stage 2 — Diagnosis (2–10 minutes)**
> "Where does the edge exist, what sessions and OB types drive it, and where does it break down?"

**Stage 3 — Iteration (5–20 minutes)**
> "What should I change for the next experiment? What niche patterns warrant deeper investigation?"

The proposed flow mapping to these stages:

```
[Stage 1] Overview Tab
    → Run identity + hypothesis (Research Notes)
    → 6 KPI cards
    → Equity curve snapshot (if present)
    → Availability rule summary (collapsed)

[Stage 2a] Session & Timing Tab
    → Session Quality (Long/Short/Single)
    → Day of Week Performance
    → Origin Session × 1H Session Heatmap
    → Intraday creation time buckets (summary)

[Stage 2b] OB DNA Tab
    → OB Creation Bias (creation time buckets, full)
    → OB Maker Analysis
    → OB Age / Time to Fill
    → Penetration Depth Analysis
    → Candle Composition (collapsed by default)

[Stage 2c] Trade Quality Tab
    → Breakout Analysis — Entry & Pricing
    → Local Drawdown
    → (additional trade-level statistics)

[Stage 3] Market Context Tab
    → News Created OB Trade Performance
    → News Created OB Population
    → Counterpart Returns Analysis
    → Availability Rule detail (expanded)

[Stage 3 / Reference] Research Tools Tab
    → Research Notes (editable, full-size)
    → Run comparison
    → Experiment log / next steps
    → Raw data export
```

---

## PHASE 3 — PAGE ARCHITECTURE REDESIGN

### 3.1 Proposed Tab Structure

The new structure replaces the single infinite-scroll page with **five focused tabs** plus a persistent header zone.

---

#### PERSISTENT HEADER ZONE (always visible, non-scrolling)

**Contains:**
- Run title + breadcrumb
- Run metadata strip (symbol, timeframe, dates, key params) — secondary params behind a "Details ▾" toggle
- 6 KPI summary cards
- Tab bar

**Why:** A researcher should never lose sight of what run they're on or what the headline result is, regardless of which tab is active.

---

#### TAB 1 — Overview

**Purpose:** Stage 1 orientation. Answers "Is this run worth a deep dive?" in under 60 seconds.

**Contains:**
- Research Notes (prominent, top of tab — this is the hypothesis; it frames everything below)
- KPI summary cards (repeated inline for context when scrolled, or simply referenced from header)
- Availability Rule summary (collapsed accordion — one-line summary visible, expand for full detail)
- Filtered Positions Banner
- Session Quality — Long to Short (summary table only: top 5 rows, "See full" link → Session tab)
- OB Creation Bias Performance (summary: top 3 creation-time buckets by Net R, "See full" → OB DNA tab)
- Quick-verdict prompt area (a lightweight "Notes for next experiment" field)

**Why these sections belong together:** Everything here answers the first question: *"What happened?"* Session Quality gives the fastest read on whether the strategy has directional edge. Creation bias gives the fastest read on timing edge. Research Notes grounds both in the researcher's original hypothesis.

---

#### TAB 2 — Session & Timing

**Purpose:** Stage 2a diagnosis. Full temporal pattern analysis — when does this strategy perform and when does it fail?

**Contains:**
- Session Quality — Long to Short (full table)
- Standard Session Quality (full table)
- Single Session Performance (full table)
- Day of Week Performance
- Timing — Origin Session / 1H Session Heatmap (grid visualization)
- OB Creation Bias Performance — intraday time buckets (full table, repeated here from OB DNA for timing context)

**Why these sections belong together:** All of these answer "when" — what time of day, what session, what day of week. A researcher debugging a failing strategy needs to see all temporal data in one place without jumping around. The heatmap and the individual session tables answer the same question at different levels of granularity and belong side-by-side.

---

#### TAB 3 — OB DNA

**Purpose:** Stage 2b diagnosis. What is the structural character of the order blocks that work vs. those that don't?

**Contains:**
- OB Maker Analysis
- OB Age / Time to Fill
- Penetration Depth Analysis
- OB Creation Bias Performance (full table — also accessible here in OB context)
- Order Block — Candle Composition (collapsed by default; expand for detail)

**Why these sections belong together:** All of these characterize the order block itself — not the trade outcome, but the block's structural properties. A researcher asking "what kind of OB should I filter for?" works through all of these in sequence. Candle Composition is niche enough to warrant a collapsed state but belongs here conceptually.

---

#### TAB 4 — Trade Quality

**Purpose:** Stage 2c diagnosis. How does execution and price behavior affect outcome?

**Contains:**
- Breakout Analysis — Entry & Pricing Performance
- Local Drawdown
- (Future: slippage analysis, BE hit rate, partial fill behavior)

**Why these sections belong together:** These sections describe what happens once the trade is active — entry precision, how far against the trade goes, whether the trade recovered. This is the execution quality layer, distinct from OB selection quality (Tab 3) and timing quality (Tab 2).

---

#### TAB 5 — Market Context

**Purpose:** Stage 3 deep investigation. External factors and correlations that explain edge or variance.

**Contains:**
- News Created OB Trade Performance (headline KPIs + table)
- News Created OB Population (full stats + filter controls)
- Time Analysis — Counterpart Returns
- Availability Rule (full expanded detail view)

**Why these sections belong together:** These sections all answer "what external conditions were present?" — news events, correlated instruments, and the filter rules applied. They're context providers, not core strategy analytics. They matter a lot during specific investigations but are noise during a standard first-pass review.

---

#### TAB 6 — Research Tools *(Optional — depends on existing features)*

**Purpose:** Stage 3 iteration and record-keeping.

**Contains:**
- Research Notes (full editable view — mirrored from Overview)
- Run comparison table (vs. previous runs)
- Experiment log (next hypothesis, parameter changes to test)
- Raw data export / download controls

**Why:** Separating "research management" from "research analysis" allows the platform to feel like an institutional tool rather than a data dump. A researcher wrapping up a session uses this tab to capture their conclusions before closing the run.

---

### 3.2 Visual Architecture Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  [Breadcrumb]  EURUSD Initial Test         [Actions ▾]       │
│  Symbol | TF | Date Range | Strategy Params  [Details ▾]     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  │  63  │ │   0  │ │+16.2R│ │-20.6R│ │Multi │ │Import│     │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
├──────────────────────────────────────────────────────────────┤
│ Overview │ Session & Timing │ OB DNA │ Trade Quality │ Context│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [TAB CONTENT — focused, grouped, no infinite scroll]        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## PHASE 4 — IDENTIFY REMOVALS AND DEMOTIONS

### 4.1 Sections to Collapse by Default (visible but hidden until expanded)

| Section | Reason |
|---|---|
| Availability Rule Banner | Informational context, not analytical. One-line summary is sufficient. |
| Filtered Positions Banner | Same — reference, not insight. |
| Order Block — Candle Composition | Niche structural detail. Rarely changes interpretation at first pass. |
| Research Notes full-text | Show first 3 lines with "Read more" — the full note can be lengthy. |

---

### 4.2 Sections to Move Behind Tabs (currently always visible)

| Section | Move To |
|---|---|
| Session Quality — Standard (full) | Session & Timing tab |
| Single Session Performance (full) | Session & Timing tab |
| OB Maker Analysis | OB DNA tab |
| OB Age / Time to Fill | OB DNA tab |
| Penetration Depth Analysis | OB DNA tab |
| Day of Week Performance | Session & Timing tab |
| Origin Session × 1H Heatmap | Session & Timing tab |
| Breakout Analysis | Trade Quality tab |
| Local Drawdown | Trade Quality tab |
| News Created OB Trade Performance | Market Context tab |
| News Created OB Population | Market Context tab |
| Counterpart Returns Analysis | Market Context tab |

---

### 4.3 Sections to Move into Drawers or Modals

| Section | Recommended Pattern | Reason |
|---|---|---|
| Availability Rule (full detail) | Expandable drawer from the collapsed banner | It is reference material, not analytics. Needs space when reviewing but shouldn't dominate the page. |
| OB Creation Bias — time bucket detail rows | Expandable rows within the table (accordion pattern) | Too many buckets at once creates noise. Surface the top performers; expand the rest on demand. |
| News Created OB Population — filter controls | Inline filter panel (collapsible, above the table) | Filter controls compete with the data for attention. |

---

### 4.4 Sections to Move to Different Pages Entirely

| Section | Recommended Destination | Reason |
|---|---|---|
| Research Notes (edit mode) | A dedicated "Research Log" or "Run Notes" page / side panel | Editing research notes while also reviewing tables is a context-switch. Separate the writing mode from the reading mode. |
| Run comparison | A dedicated "Compare Runs" page | Cross-run comparison requires its own UI — it cannot be done well as a section on a single-run page. |
| Raw data export / download | Run Header action menu (top-right "Actions ▾" dropdown) | Export is an action, not an analytical view. It belongs in the action menu. |

---

## PHASE 5 — EXECUTIVE SUMMARY

---

### 5.1 Biggest UX Problems (Ranked by Impact)

**1. No cognitive entry point.**
The page gives equal visual weight to 20+ sections simultaneously. There is no moment where the researcher thinks "I understand the run" before going deeper. The brain never gets a rest.

**2. Research Notes are buried.**
The researcher's own hypothesis — the most important framing document on the page — is mid-scroll. It should be the first thing read, because it determines whether every metric below is a win or a failure.

**3. Temporal data and structural data are interleaved.**
Session timing data (when the OB fires) and OB structural data (what the OB looks like) are scattered across the page in alternating sections. These answer fundamentally different questions and should be in separate mental buckets.

**4. No progressive disclosure.**
Every section shows its full data table with all rows and columns regardless of whether it is relevant to the current investigation. There is no concept of "here is the summary; dig deeper if you need to."

**5. News Context data competes with core analytics.**
News Created OB data is important but situational. It is currently in the middle of the core session/OB analysis flow, breaking the researcher's concentration on fundamental strategy quality.

**6. The section headers all look the same.**
There is no visual hierarchy between "core insight" and "supplemental detail." Everything is a section header with a table below it. The cognitive cost of reading each header to determine its relevance is compounding across 20+ sections.

---

### 5.2 Biggest Wins from the Proposed Structure

**1. The Overview tab creates a 60-second verdict.**
A researcher can open a run, read their own hypothesis, see the 6 KPIs, see a session quality summary, and decide whether the run is worth a deep dive — all without scrolling past one screen.

**2. Tab 2 (Session & Timing) makes temporal patterns obvious.**
Grouping all time/session data together allows a researcher to diagnose "this strategy only works in London session" in one tab instead of hunting across the page.

**3. Tab 3 (OB DNA) makes structural filtering obvious.**
Seeing OB Maker, OB Age, Penetration, and Candle Composition together immediately surfaces the "ideal OB profile" — which is the primary output of this research platform.

**4. Tab 5 (Market Context) quarantines noise.**
News and counterpart analysis are genuinely useful but are rabbit holes. Moving them to their own tab means they are available when needed but do not interrupt the core diagnostic flow.

**5. Collapsing the rule banners removes dead weight.**
The Availability Rule and Filtered Positions banners currently occupy ~15% of the visible viewport on every page load. Collapsing them to a single line with an expand option recovers that space for actual data.

---

### 5.3 Expected Reduction in Cognitive Load

| Metric | Current State | Proposed State |
|---|---|---|
| Sections visible on page load | ~20 | ~6 (Overview tab) |
| Average scroll distance for first-pass review | ~4,000px | ~600px |
| Number of tables competing for attention | ~15–18 visible simultaneously | 2–4 per tab |
| Decision required to find session data | Scroll to find it | Click "Session & Timing" tab |
| Research hypothesis visible on page load | No (buried mid-scroll) | Yes (top of Overview) |
| First clear "stopping point" in review | None | End of Overview tab |

Estimated cognitive load reduction: **~65–70%** for a standard first-pass run review. The deep-dive capability is completely preserved — nothing is removed, only reorganized.

---

### 5.4 Recommended Implementation Order

Phases are ordered by impact-to-effort ratio. Each phase is independently shippable.

**Phase A — Quick wins (no restructuring required)**
1. Move Research Notes to the top of the current page (above the Research Suite).
2. Collapse the Availability Rule and Filtered Positions banners to a one-line summary with expand.
3. Collapse Candle Composition section by default.
4. Add a visual weight system to section headers: "Core" vs. "Deep Dive" labels or a subtle color distinction.

**Phase B — Tab introduction**
5. Introduce the 5-tab shell (Overview, Session & Timing, OB DNA, Trade Quality, Market Context).
6. Move Session tables (Standard, Single Session, Day of Week, Heatmap) to Session & Timing tab.
7. Move OB Maker, OB Age, Penetration, Candle Composition to OB DNA tab.
8. Move Breakout Analysis, Local Drawdown to Trade Quality tab.
9. Move News OB and Counterpart Returns to Market Context tab.

**Phase C — Overview tab polish**
10. Build summary rows (top-3-only views with "See full" links to full tabs) for Session Quality and OB Creation Bias on the Overview tab.
11. Pin the KPI cards to the persistent header so they are always visible regardless of active tab.

**Phase D — Progressive disclosure**
12. Add accordion rows to OB Creation Bias (collapse minor time buckets by default).
13. Add collapsible filter panels to News OB Population section.
14. Add "Run Metadata → Details ▾" toggle for secondary parameters in the run header.

**Phase E — Research Tools tab (if supporting multi-run workflows)**
15. Build the Research Tools tab: full Research Notes editor, run comparison view, experiment log.
16. Move export/download controls to the Actions menu in the run header.

---

*End of IA Audit — FX-OB Research Lab Run Detail Page*
