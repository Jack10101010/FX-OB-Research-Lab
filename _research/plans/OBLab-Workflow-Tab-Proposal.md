# OB Lab — Workflow-Based Tab Architecture Proposal

**Reference pattern:** Entries Research Workspace (`EntriesWorkspace.jsx`)
**Constraint:** Proposal only. No implementation.

---

## The Core Problem with the Current Grouping

The current four tabs — Structure · OB Shape · Risk & Context · Performance & Admin — answer the question "what type of data is this?" A researcher opening the page still has to decide which tab to go to based on what they want to know. The tab labels describe containers, not intentions.

The Entries Workspace answers the question "what am I trying to do right now?" A researcher opens Model Analysis because they want a verdict. They open Robustness Lab because they want to validate durability. They open Promotion Desk when they're ready to make a decision. Each tab is a stage in a workflow.

The goal of this proposal is to apply that same logic to OB Lab.

---

## Proposed Tab Structure

### Persistent header (above all tabs, always visible)
- `LabRunHero` — run identity, Generate Report, variant selector
- `RunConfigStrip` — collapsible config chips
- `TradeUniverseBadge` — universe / model / source / rows / warnings
- `WorkspaceTabBar` — tab navigation (sticky, same visual language as Entries Workspace)
- `FilterBar` — structure / direction / session filters; applies globally

KPI chips move **into Tab 1** (Model Analysis). In the current design they sit in the header but the "Best Bucket" and "Worst Bucket" values are only meaningful in context — they belong on the verdict page, not in a global strip.

---

### Tab 1 — Model Analysis *(landing tab)*

**Researcher goal:** *"What is the headline verdict on this OB run? Does this model produce edge, and which structural configuration carries it?"*

This is the page every researcher opens first, every single session. It should give a complete answer to "is this worth pursuing?" without requiring any other tab. It is the primary decision surface.

| Section | From current tab |
|---------|-----------------|
| KPI chips (6×) | Persistent header → moved here |
| InsightCallouts (conditional) | Persistent header → moved here |
| Research Safety warning (conditional) | Tab 1 Structure |
| Structural Quality 3-col: BOS/CHoCH · Long/Short · Origin Session | Tab 1 Structure |
| OB Creation Hour Performance | Tab 1 Structure |
| Day of Week Performance | Tab 1 Structure |

**Why these together:** All six sections answer variations of the same question — "does this OB model produce edge, and through which structural lens?" Structure type, direction, session origin, timing. A researcher reading this tab leaves knowing the model's verdict.

**Internal tier structure (mirrors ModelAnalysis.jsx):**

```
── Core Results ─────────────────────────────────────────────
  KPI strip  ·  InsightCallouts  ·  Research Safety
  Structural Quality grid (3-col)
── Decision Analytics ───────────────────────────────────────
  OB Creation Hour (full-width)
  Day of Week
```

---

### Tab 2 — Edge Discovery

**Researcher goal:** *"What OB characteristics define the winning setup? What does the ideal OB look like so I can refine my filter?"*

After Model Analysis confirms there's edge, the researcher needs to build a profile of the winning OB. This tab is entirely about OB characteristics — not outcomes (that's Tab 1), not failures (that's Tab 3). Every section answers: "what kind of OB should I be targeting?"

| Section | From current tab |
|---------|-----------------|
| OB Width Analysis | Tab 2 OB Shape |
| OB Age / Time-to-Fill | Tab 2 OB Shape |
| Penetration Depth Analysis | Tab 2 OB Shape |
| Session Matrix (Origin × Fill) | Tab 2 OB Shape |
| News OB Trades *(collapsed)* | Tab 3 Risk & Context → moved here |
| News OB Population *(collapsed)* | Tab 3 Risk & Context → moved here |

**Why News OBs move here:** The primary research question for news-adjacent OBs is "do news-adjacent OBs have a different profile?" — that is a characteristics question. A researcher investigating whether to add a news proximity filter looks here, not on a failure tab. The failure tab would ask "did news events cause losses?" — different question.

**Session Matrix placement rationale:** The origin × fill cross-tab answers "what session combination produces the winning fill?" — a profile/targeting question. It belongs next to width, age, and depth, all of which contribute to the same output: "here is the filter I should set."

---

### Tab 3 — Failure Lab

**Researcher goal:** *"What breaks this model? Where is the loss concentration, and what are the specific failure modes?"*

This is the stress-testing and loss-attribution tab. After understanding what the model does and what the winning OB looks like, the researcher audits what goes wrong. This tab directly parallels the `FailuresWorkspace` pattern in the app.

| Section | From current tab |
|---------|-----------------|
| Failure Lab (worst losses / best wins) | Tab 3 Risk & Context |
| Catastrophic Breach | Tab 3 Risk & Context |
| Fast Stopout Analysis | Tab 3 Risk & Context |
| Distance Before Fill | Tab 3 Risk & Context |

**Why Distance Before Fill is here (not Edge Discovery):** Distance Before Fill answers "trades that approached from far away behave differently" — this is primarily a failure signal (far-approach fills tend to have lower edge or higher breach risk). If it were pure profile data it would sit in Tab 2, but its research value is in explaining loss, so it stays in Failure Lab.

**Internal structure:**

The Failure Lab `NeonPanel` (wins/losses ranked table) should be the **first and most prominent** section — it is the highest-information panel for understanding specific losses. Catastrophic Breach, Fast Stopout, and Distance Before Fill are secondary decompositions.

---

### Tab 4 — Robustness

**Researcher goal:** *"Is this edge stable across time? Is the data complete enough to trust the conclusions?"*

After building conviction through Tabs 1–3, the researcher validates durability before making a decision. This maps directly to `RobustnessLab.jsx` in Entries Workspace.

| Section | From current tab |
|---------|-----------------|
| Temporal Analytics (equity curves + rolling expectancy) | Tab 4 Performance & Admin |
| Field Completeness | Tab 4 Performance & Admin |
| Research Backlog | Tab 4 Performance & Admin |

**Changes from current tab:** Identical content, but `TemporalAnalytics` should **default to expanded** on this tab. It currently defaults collapsed — that made sense when it was buried in a general-purpose Performance tab, but here it is the primary section. The researcher landed on this tab specifically to look at it.

---

### Tab 5 — Promotion Desk *(new — needs build)*

**Researcher goal:** *"Based on the evidence, what parameter changes or filter additions am I committing to? Structured decision record."*

This is the output stage. It is where a research session produces an artifact — not just insight, but a committed decision. The Entries Workspace has a full `PromotionDesk.jsx` (shortlist, approve/reject/watchlist, notes, CSV export). OB Lab needs an equivalent.

This tab does not exist today. It needs to be designed and built.

**Proposed content:**

Auto-populated evidence brief (read-only, from analytics):
- Best structural bucket: `{label} · {netR} · {winRate}%`
- Worst structural bucket
- Stability verdict from Temporal Analytics (stable / degrading / insufficient data)
- Data completeness flag from Field Completeness

Decision cards (researcher-authored, persisted to localStorage):
- Each card represents a proposed parameter change or filter addition
- Fields: title, rationale, linked evidence (which bucket/section informed this), status (Pending / Test / Committed / Rejected), notes
- Example cards a researcher would write: "Restrict to BOS only", "Add min OB age ≥ 4h", "Exclude news-adjacent OBs", "London + New York origin sessions only"

Actions:
- Add new decision card
- Set status (Pending → Test → Committed / Rejected)
- Export decisions as text / CSV (feeds into Generate Report)
- Link decisions to a run (so when a new run is imported, cards from a prior session can be reviewed against new evidence)

**localStorage key:** `fxob_oblab_promotion_v1`

---

## Section-to-Tab Mapping Summary

| Section | Current tab | Proposed tab | Notes |
|---------|------------|--------------|-------|
| KPI chips | Header | Tab 1 Model Analysis | |
| InsightCallouts | Header | Tab 1 Model Analysis | |
| Research Safety warning | Tab 1 | Tab 1 Model Analysis | |
| Structural Quality 3-col | Tab 1 | Tab 1 Model Analysis | |
| OB Creation Hour | Tab 1 | Tab 1 Model Analysis | |
| Day of Week | Tab 1 | Tab 1 Model Analysis | |
| OB Width Analysis | Tab 2 | Tab 2 Edge Discovery | |
| OB Age / TTF | Tab 2 | Tab 2 Edge Discovery | |
| Penetration Depth | Tab 2 | Tab 2 Edge Discovery | |
| Session Matrix | Tab 2 | Tab 2 Edge Discovery | |
| News OB Trades | Tab 3 | Tab 2 Edge Discovery | Moved — OB profile question |
| News OB Population | Tab 3 | Tab 2 Edge Discovery | Moved — OB profile question |
| Failure Lab | Tab 3 | Tab 3 Failure Lab | Promoted to first position |
| Catastrophic Breach | Tab 3 | Tab 3 Failure Lab | |
| Fast Stopout | Tab 3 | Tab 3 Failure Lab | |
| Distance Before Fill | Tab 3 | Tab 3 Failure Lab | |
| Temporal Analytics | Tab 4 | Tab 4 Robustness | Default expanded (change) |
| Field Completeness | Tab 4 | Tab 4 Robustness | |
| Research Backlog | Tab 4 | Tab 4 Robustness | |
| *(new)* | — | Tab 5 Promotion Desk | Needs build |

---

## Comparison with Entries Workspace Tabs

| Entries Workspace | OB Lab Equivalent | Analog quality |
|---|---|---|
| Model Analysis | Model Analysis | Direct — same purpose, different data |
| Experiment Compare | *(not proposed)* | OB Lab's inline `TableCompareShell` compare already handles per-table run comparison. A dedicated cross-run OB summary compare tab is future work. |
| Entry Hypotheses | *(not proposed)* | A future "OB Hypotheses" tab (structured notepad for "test BOS-only with age > 4h" type hypotheses) would fit here. Lower priority than Promotion Desk. |
| Robustness Lab | Robustness | Direct — temporal stability, confidence, data quality |
| Promotion Desk | Promotion Desk | Direct — decision record, approve/reject parameter changes |

---

## What Changes Relative to the Current Implementation

**Existing code changes (reorganization only):**
- Move KPI chips from persistent header into Tab 1
- Move InsightCallouts from persistent header into Tab 1
- Move News OB panels from Tab 3 → Tab 2
- Change `TemporalAnalytics` to `defaultCollapsed={false}` on Tab 4 (it's the primary section there)
- Rename tabs: Structure → Model Analysis, OB Shape → Edge Discovery, Risk & Context → Failure Lab, Performance & Admin → Robustness

**New code required:**
- Tab 5: Promotion Desk — new page-level component (~200–300 LOC) + localStorage persistence
- `WorkspaceTabBar` should be adopted (or OBLabTabShell updated) to use the sticky underline style from Entries Workspace rather than the current chip-strip style, for visual consistency between the two workspaces

**No analytics changes.** All `buildOrderBlockAnalytics` output is unchanged. Only the display organisation changes.

---

## Tab Labels (short + long)

| key | label | short |
|-----|-------|-------|
| `model-analysis` | Model Analysis | Analysis |
| `edge-discovery` | Edge Discovery | Discovery |
| `failure-lab` | Failure Lab | Failures |
| `robustness` | Robustness | Robustness |
| `promotion` | Promotion Desk | Promotion |

**localStorage key for active tab:** `oblab-active-tab-v1` (already in use, keys are compatible)
