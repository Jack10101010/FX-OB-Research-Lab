# CLASSIFICATION-TAB-TYPOGRAPHY-AUDIT-1

**Type:** UI / typography / hierarchy audit (AUDIT ONLY — no implementation, no source changes)
**Owner:** Claude (UI/UX)
**Branch verified:** `codex-dev` · HEAD `f0e9f4f`
**Scope:** the Classification tab in `frontend/src/pages/RunDetail.jsx` — Research Signals,
Signal Cards, Fill State / Session / Entry Model breakdowns, and the new Model Family
Comparison. Typography, hierarchy, readability, table density, scanning speed only.

> No new analytics, no data-calculation changes, no new cards/charts. Every recommendation
> is a token / size / weight / spacing change using the existing dark-theme system.

---

## The one root cause (read this first)

In `src/index.css`, **`--text-3` is aliased to `--muted`** (`240 8% 52%` lightness). The
brightness ladder is:

| Token | Lightness | Intended role |
|---|---|---|
| `--text` | 96% | primary emphasis |
| `--text-2` | 78% | secondary body |
| `--muted` / `--text-3` | **52%** | de-emphasized micro-text |

Every wayfinding label on the tab — **section headers, table column headers, family
eyebrows** — is rendered at that **bottom 52% tier**, at 9–10px, with no weight. So the
elements that should *lead* the eye are painted in the *quietest* ink the theme has. That
is the "dashboard whispering": the page has one flat typographic plane instead of a
hierarchy. Fixing the header tiers (not the data rows) is ~80% of the perceived premium gain.

---

## A. Findings

### 1. Section headers — the primary hierarchy failure
`ClassSectionHeader` (RunDetail.jsx ~L5046):
`text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--text-3))] mb-2`.
- **Brightness:** `text-3` = 52% — the dimmest tier. Section headers are the page's
  top-level wayfinding and are painted at the *same* lightness as muted footnotes.
- **Weight:** none (`font-ui`, normal). No weight contrast against body rows.
- **Size:** 10px — barely larger than the 9px column headers beneath them.
- **Spacing:** `mb-2` (8px) below, nothing extra above; identical 20px (`space-y-5`)
  between every section, so a section header doesn't "own" the block under it.
- **Net effect:** "SIGNAL CARDS", "FILL STATE BREAKDOWN", "MODEL FAMILY COMPARISON" read as
  faint captions, not as headers. There is no clear tier-1 element on the tab.

### 2. Table column headers — the faintest text on the page
Both `ClassBreakdownTable` (~L5135) and `ModelFamilyTable` headers use
`text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-3)/0.7)]`.
- 9px at **52% × 0.7 alpha ≈ 36% effective lightness** — below comfortable scan contrast on
  the dark panel. "VARIANT / TRADES / WR / NET R / AVG R / MAX DD / PF" are hard to read at a
  glance; the eye lands on the data and has to *hunt upward* to identify a column.
- The columns themselves are fine (right-aligned numerics, `tabular-nums`); the **labels**
  are the bottleneck, not the layout.

### 3. Model Family Comparison table
- **Row density:** `py-1.5` + `space-y-1` is good — not the problem.
- **Family grouping:** the eyebrow is `text-[9px] ... text-[hsl(var(--text-3))]` with only
  `pt-1` above — so faint and so tight that "Baseline / Entry Model / FFT Control" barely
  register as group dividers. Families don't read as distinct zones.
- **Baseline vs entry vs fft rows:** every row is visually identical except the winner tint.
  The **baseline (the reference anchor)** has no distinguishing treatment, so the eye can't
  find the thing everything else should be compared against.
- **Confidence chip:** placed inline after the label in the same flex; the chip has no
  `shrink-0`, so on long labels it competes with / can be squeezed by the truncating label.
- **Winner visibility:** the win row is `bg-accent-primary/0.07` (7% alpha) + a `w-3` crown.
  At 7% the tint is nearly invisible on the panel; the crown is tiny. The strongest model is
  not "obvious at a glance" — it relies on the one-line summary above to convey the winner.

### 4. Signal Cards
`MetricChip size="compact"` (label 9.5px accent-primary semibold · value 22px tone+glow ·
sub 10px `text-muted-lab`).
- **This is the strongest-built block on the tab** (bevel, gradient, glow value) — keep it.
- **Title:** accent-primary at 9.5px reads fine (color carries it).
- **Value:** 22px glow — excellent prominence.
- **Subtitle:** the `57% WR · n=42 · +6.1R` line is *important context* but sits at
  `text-muted-lab` (~52%), so the supporting numbers whisper. Mild.
- **Hierarchy irony:** the cards look more premium than the section headers above them, which
  inverts the intended order — another symptom of the faint headers, not a card defect.

### 5. Overall page hierarchy / rhythm
- **Uniform 20px (`space-y-5`)** between every section and **identical faint headers** mean
  there is no tiering: Research Signals (the headline) looks exactly as important as the
  fifth table. The most important block doesn't present as most important.
- **No zoning:** the "summary" zone (Research Signals + Signal Cards) and the "detail" zone
  (the four/five breakdown tables) flow together with no visual break, so the eye gets a long
  undifferentiated scroll.
- **Weak tier-1:** there is currently *no* element that says "start here."

---

## B. Recommended changes (exact, token-based)

All values use existing tokens; dark theme preserved.

### B1 — Section headers (highest impact)
`ClassSectionHeader` →
- before: `text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--text-3))] mb-2`
- **after:** `text-[11px] font-ui font-semibold uppercase tracking-[0.13em] text-[hsl(var(--text-2))] mb-2.5`
  - brightness 52% → **78%** (`text-2`), add **`font-semibold`**, 10→11px, slightly wider
    tracking, a touch more air below.
- **Optional premium accent (typography-adjacent, still tiny):** prefix the label with a 2px
  accent tick so headers gain a quiet anchor without a full divider:
  `<span className="inline-block w-[3px] h-[11px] mr-2 align-middle bg-[hsl(var(--accent-primary))] clip-bevel-sm" />`
  Apply once in `ClassSectionHeader` so all sections inherit it consistently.

### B2 — Table column headers (instant scanability)
Both table header rows →
- before: `... text-[9px] ... text-[hsl(var(--text-3)/0.7)]`
- **after:** `... text-[9.5px] ... text-[hsl(var(--muted))]` (drop the `/0.7` alpha; 9→9.5px).
  - This lifts effective lightness from ~36% to a solid 52% and is now clearly *subordinate*
    to the new 78% semibold section headers — a clean two-step ladder.
  - Applies to the shared `ClassBreakdownTable` header **and** `ModelFamilyTable` header. The
    shared change is intentional and uniform (Fill State / Session / Entry Model all benefit
    identically); it is pure typography, no layout/data change.

### B3 — Model Family table
- **Family eyebrow** → from `text-[9px] ... text-[hsl(var(--text-3))]` + `pt-1`
  to `text-[9.5px] font-semibold tracking-[0.1em] text-[hsl(var(--text-2)/0.8)]` + `pt-2 pb-0.5`,
  optionally with a hairline above (`border-t border-[hsl(var(--border-soft))]`) for true zone
  separation. Makes families read as distinct groups.
- **Winner row** → bump tint `bg-[hsl(var(--accent-primary)/0.07)]` → `/0.12`, keep the
  `/0.4` border, raise crown `w-3` → `w-3.5`, and set the winner label to
  `text-[hsl(var(--text))] font-medium` so the best model is unmistakable at a glance.
- **Baseline anchor (optional):** give the baseline row a 2px left accent border
  (`border-l-2 border-[hsl(var(--accent-secondary)/0.5)]`) so the reference is findable.
- **Confidence chip:** add `shrink-0` to the chip wrapper so the label truncates first and the
  chip never deforms.

### B4 — Signal Cards
- **Subtitle brightness:** pass `subClassName="!text-[hsl(var(--text-2))]"` to the Signal-Card
  `MetricChip`s (override only here — do **not** change the shared `MetricChip` default).
  Lifts the WR/n/NetR context from ~52% to 78%.
- Leave title/value/bevel/glow unchanged — they're already premium.

### B5 — Page rhythm / zoning
- **Section spacing:** container `space-y-5` → `space-y-6` (20→24px) for calmer rhythm now
  that headers are heavier.
- **Summary vs detail break (optional):** insert a single hairline divider
  (`<div className="h-px bg-[hsl(var(--border-soft))]" />`) between the Signal Cards block and
  the Fill State Breakdown to separate the "summary" zone from the "tables" zone. One line, no
  new component.
- **Tier-1 cue (optional):** give only the **Research Signals** header a marginally larger
  treatment (e.g. `text-[12px]`) so the headline block reads as the top of the page.

---

## C. Exact implementation plan (when approved)

**Single file: `frontend/src/pages/RunDetail.jsx`.** No data, no shared-component logic, no
glossary, no theme-token edits.

1. **`ClassSectionHeader`** (~L5046) — apply B1 (brightness/weight/size/spacing; optional accent
   tick). One component → updates all five section headers at once.
2. **`ClassBreakdownTable` header `<div>`** (~L5135) — apply B2 brightness/size. (Shared header;
   uniform improvement to Fill State / Session / Entry Model.)
3. **`ModelFamilyTable`** (~L5188–5230) — apply B2 to its header row; B3 to the family eyebrow,
   winner row, and confidence-chip `shrink-0`.
4. **Signal Cards `MetricChip`** (~L3175) — add `subClassName` per B4.
5. **Panel container** (~L3162) — `space-y-5` → `space-y-6` (B5); optional hairline divider and
   Research-Signals tier-1 size.

No change to `MetricChip.jsx`, `ConfidenceChip.jsx`, `TermTip.jsx`, `modelFamily.js`,
`compareWinner.js`, the glossary, or `index.css`.

**Validation (UI-only):** Babel transpile `RunDetail.jsx`; host browser QA — confirm the
three-tier ladder reads (section header ≫ column header ≫ data), winner is obvious, families
separate, no overflow, dark theme unchanged, all four theme variants (the file ships multiple
accent themes) still legible.

---

## D. Ordered implementation priority (highest impact first)

1. **B1 — Section headers** (brightness 52→78%, semibold, 11px). *Single component; restores
   the missing tier-1. Biggest perceived-premium gain for the smallest change.*
2. **B2 — Table column headers** (drop the 0.7 alpha → solid muted, 9.5px). *Kills the worst
   whispering; makes columns instantly identifiable across all tables.*
3. **B3 — Model Family winner + family eyebrows** (stronger tint/crown/label; legible group
   dividers; chip `shrink-0`). *Makes the best model obvious and the families scannable.*
4. **B4 — Signal Card subtitle brightness** (subClassName → text-2). *Small, lifts the
   supporting metrics out of a whisper.*
5. **B5 — Spacing & zoning** (`space-y-6`, optional summary/detail divider, Research-Signals
   tier-1 size). *Final rhythm polish once the type tiers are in place.*

Items 1–2 alone resolve the core "dashboard whispering" and should be done together as the
first pass; 3–5 are incremental polish. All are reversible, token-based, and dark-theme-safe.
