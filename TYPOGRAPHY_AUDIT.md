# Typography / Font System Audit — FX-OB Research Lab
**Date:** 2026-06-02 | **Mode:** AUDIT ONLY — no files modified

---

## 1. FILES READ

| File | Purpose |
|---|---|
| `frontend/tailwind.config.js` | Tailwind font token definitions |
| `frontend/src/index.css` | Global CSS, Google Fonts import, body/utility styles |
| `frontend/src/App.css` | App shell (minimal — 2 lines) |
| `src/components/lab/DataTable.jsx` | Canonical table primitive |
| `src/components/lab/controls.jsx` | Segment, NeonInput, NeonSelect, NeonButton, FilterToggle, HeroBadge |
| `src/components/lab/NeonPanel.jsx` | Panel wrapper + SectionTitle |
| `src/components/lab/MetricChip.jsx` | KPI chip |
| `src/components/lab/TopBar.jsx` | Top navigation bar |
| `src/components/lab/Sidebar.jsx` | Sidebar nav + theme picker |
| `src/components/lab/RunConfigStrip.jsx` | Config chip strip |
| `src/components/lab/TradeUniverseBadge.jsx` | Universe scope badge |
| `src/components/lab/ResultsLensControl.jsx` | Results basis control |
| `src/components/lab/EquityCurve.jsx` | Equity curve chart (V1 + V2) |
| `src/components/lab/CanonicalBucketTable.jsx` | Shared bucket table |
| `src/components/lab/IntrabarInspector.jsx` | Intrabar candle inspector (inline font constants) |
| `src/components/lab/CandleChart.jsx` | Candlestick chart (inline font constant) |
| + grep output across all 88 JSX/JS files in `src/` |

---

## 2. CURRENT TYPOGRAPHY SYSTEM

### 2a. Fonts Loaded

```css
/* index.css line 1 */
@import url('https://fonts.googleapis.com/css2?
  family=IBM+Plex+Sans:wght@300;400;500;600;700
  &family=JetBrains+Mono:wght@300;400;500;600;700
  &family=Space+Grotesk:wght@300;400;500;600;700
  &display=swap');
```

Three font families, five weights each = **15 font files loaded per page**.

### 2b. Body Font

```css
/* index.css line 188 */
body {
  font-family: 'IBM Plex Sans', 'Inter', system-ui, sans-serif;
}
input, select, textarea {
  font-family: 'IBM Plex Sans', 'Inter', system-ui, sans-serif;
}
```

**Effective body font: IBM Plex Sans**

### 2c. Tailwind Font Tokens

```js
// tailwind.config.js
fontFamily: {
  display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
  mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
}
```

### 2d. CSS Utility Overrides (in index.css)

```css
/* These OVERRIDE the Tailwind generated classes */
.font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.font-display { font-family: 'IBM Plex Sans', 'Inter', system-ui, sans-serif; }
.control-value-font { font-family: 'IBM Plex Sans', 'Inter', system-ui, sans-serif; }
```

### 2e. ⚠️ CRITICAL MISMATCH

| Token | Tailwind config says | CSS utility resolves to |
|---|---|---|
| `font-display` | Space Grotesk | **IBM Plex Sans** (CSS utility wins) |
| `font-mono` | JetBrains Mono | JetBrains Mono ✓ |

**Space Grotesk is imported but effectively unused.** Every `font-display` class in every component renders IBM Plex Sans due to the `.font-display` utility override in index.css. The tailwind config value is dead code.

### 2f. Numeric Feature Settings

```css
/* index.css — applied to html, body, #root AND all inputs/selects/tables/pre/code */
font-variant-numeric: normal;
font-feature-settings: "zero" 0, "ss01" 0, "ss02" 0, "cv01" 0;
```

**Tabular numerals are globally disabled.** The `font-variant-numeric: normal` reset means numbers in tables and KPIs do NOT use tabular spacing unless explicitly re-applied. The only place tabular-nums is explicitly set is `.row-chip` (inline in index.css) and the `tabular-nums` Tailwind class in DataTable body cells.

### 2g. Custom CSS Variable Font Tokens

**None exist.** There are no `--font-*` CSS variables. No central token for `--font-ui`, `--font-display`, `--font-numeric`, etc.

---

## 3. HARDCODED FONT INVENTORY

### 3a. Scope

```
font-mono (Tailwind class):  964 uses  across 88 files
inline fontFamily (JS):       90 uses  across ~18 files
  of which: "monospace" bare: 34 uses  (inconsistent — system default, not JetBrains Mono)
font-display (Tailwind class): ~50 uses in shared components
font-sans:  0 uses
font-serif: 0 uses
font-['...'] arbitrary: 0 uses
Space Grotesk explicit ref: 0 uses in components
```

### 3b. Top font-mono Files (by count)

| File | Count | Category |
|---|---|---|
| `pages/RunDetail.jsx` | 91 | Mixed: labels + data values |
| `pages/NewsLab.jsx` | 49 | Labels, UI text |
| `pages/StrategyBuilder.jsx` | 41 | Labels, form fields |
| `components/lab/entries/model/DirectionPanel.jsx` | 35 | Labels + numeric values |
| `components/lab/protection/ProtectionPowerTools.jsx` | 29 | Labels |
| `pages/Settings.jsx` | 28 | Form labels, UI text |
| `pages/ProtectionLab.jsx` | 28 | Labels |
| `components/lab/entries/hypothesis/EntryHypothesisLab.jsx` | 28 | Labels |
| `pages/HypothesisLab.jsx` | 26 | Labels |
| `components/lab/ImportZone.jsx` | 26 | Labels, instructions |

### 3c. Inline fontFamily (JS Objects)

| File | Value | Usage |
|---|---|---|
| `EquityCurve.jsx` | `"JetBrains Mono"` | XAxis tick, YAxis tick, Tooltip contentStyle |
| `EquityCurveV2` (in EquityCurve.jsx) | `"JetBrains Mono"` | XAxis, YAxis, TT_STYLE constant, legend items |
| `FailuresEquityPanel.jsx` | `"JetBrains Mono, monospace"` | Chart ticks, shared chart style object |
| `DirectionDivergingBar.jsx` | `"JetBrains Mono"` | XAxis, YAxis, label style |
| `ArchetypeRadarPanel.jsx` | `"JetBrains Mono, monospace"` | Chart style object |
| `StreakDotStrip.jsx` | `"JetBrains Mono, monospace"` | Chart style object |
| `IntrabarInspector.jsx` | `UI_FONT` / `MONO_FONT` constants | Chart ticks and tooltips — **best practice, local constants** |
| `CandleChart.jsx` | `CHART_FONT_STACK = "IBM Plex Sans, Inter, system-ui..."` | Chart labels — **already uses UI font** ✓ |
| `EquityCurvePanel.jsx` | `"monospace"` | XAxis, YAxis, Tooltip ⚠️ |
| `SensitivityPanel.jsx` | `"monospace"` | XAxis, YAxis, Tooltip, Legend ⚠️ |
| `ParetoPanel.jsx` | `"monospace"` | XAxis, YAxis ⚠️ |
| `RollingMetricsPanel.jsx` | `"monospace"` | XAxis, YAxis ⚠️ |
| `ExperimentEquityOverlay.jsx` | `"monospace"` | XAxis, YAxis, Legend ⚠️ |
| `ProtectionVisualAnalytics.jsx` | `"monospace"` | Multiple chart axes ⚠️ |

⚠️ = bare `"monospace"` renders as system default mono (Courier New on Windows, Monaco on macOS) — inconsistent with JetBrains Mono used everywhere else.

---

## 4. MONOSPACE USAGE CLASSIFICATION

### 4a. Necessary Monospace — KEEP as font-mono

| Pattern | Examples | Reason |
|---|---|---|
| Run/trade IDs | `String(r.id).slice(0,12)` in FailureDrilldown | Hash-like, char-aligned |
| Config param values | RunConfigStrip chip values | Technical params benefit from mono |
| Chart axis ticks | XAxis/YAxis numeric labels | Tabular alignment across ticks |
| Price/R values in IntrabarInspector | Intrabar candle price levels | Dense numeric layout |
| Code/pre blocks | Any `<pre>` or `<code>` | Inherently code |

### 4b. Unnecessary Monospace — REPLACE with font-ui

| Pattern | Examples | Reason |
|---|---|---|
| Section header labels | `text-[9.5px] font-mono uppercase tracking-wider` (everywhere) | UI chrome, not data |
| Panel title labels | NeonPanel uses `.panel-title-label` (IBM Plex Sans) ✓ but many one-off panels use font-mono | UI headers |
| Button text | TopBar "New Backtest" button, filter toggle buttons | CTA text, not data |
| Dropdown labels | TopBar Switcher kicker text, dropdown option text | Navigation text |
| Sidebar labels | Section headers, "Research Lab" subtitle, theme name | UI nav |
| Descriptive prose | `font-mono leading-relaxed` paragraphs in FailureDNA, PreventionEngine, ViewManager | Long prose is unreadable in mono |
| Warning/info text | Warning banners, empty-state messages | Prose text |
| Form field labels | Most `text-[9px] font-mono uppercase tracking-widest` label spans | Form chrome |

### 4c. Dense-Table Monospace — CONVERT to font-numeric

| Pattern | Examples | Reason |
|---|---|---|
| R values in table cells | `font-mono tabular-nums` R/pct values | Should be font-numeric (tabular sans) |
| KPI chip values | MetricChip already uses font-display + tabular-nums ✓ | Already correct |
| Heatmap cell values | `font-mono tabular-nums` in heatmap cells | Switch to font-numeric |

### 4d. Accidental/Inconsistent — FIX

| Pattern | Files | Issue |
|---|---|---|
| `fontFamily: "monospace"` | EquityCurvePanel, SensitivityPanel, ParetoPanel, RollingMetricsPanel, ExperimentEquityOverlay, ProtectionVisualAnalytics | System default mono — renders as Courier New on Windows. Must be changed to JetBrains Mono explicitly. |

---

## 5. SHARED COMPONENT TYPOGRAPHY FINDINGS

### DataTable
- **Header:** `font-display text-[10.5px] font-semibold uppercase tracking-[0.06em]` → resolves to IBM Plex Sans ✓
- **Body cells:** `col.mono === true ? "font-mono" : "font-display"` → correct toggle ✓
- **Tabular nums:** `tabular-nums` class on body cells ✓
- **Gap:** DataTable uses `tabular-nums` but doesn't use `font-variant-numeric: tabular-nums` directly — relies on Tailwind class (which resolves to the CSS property, so this is fine) ✓

### controls.jsx
- `Segment` buttons: no font class → inherits body (IBM Plex Sans) ✓
- `NeonInput` / `NeonSelect`: `control-value-font` → IBM Plex Sans ✓
- `NeonButton`: no font class, inherits body ✓
- `FilterToggle`: `font-display font-medium uppercase` → IBM Plex Sans ✓
- `HeroBadge`: `font-display font-medium` → IBM Plex Sans ✓
- `Field` label: `control-label` utility → IBM Plex Sans 11.5px ✓
- **Overall: controls.jsx is clean — no font-mono anywhere** ✓

### NeonPanel
- Title uses `.panel-title-label` utility → IBM Plex Sans 12px ✓
- No font-mono ✓
- **Clean** ✓

### MetricChip
- Label: `font-display font-semibold uppercase` → IBM Plex Sans ✓
- Value: `font-display font-semibold tabular-nums` → IBM Plex Sans with tabular-nums ✓
- Sub: `font-display` ✓
- **MetricChip is the best example of correct typography** ✓

### TopBar
- Search input: `font-mono` ← ❌ unnecessary (search UI)
- "New Backtest" button: `font-mono uppercase tracking-wider` ← ❌ CTA button
- Switcher kicker label: `font-mono uppercase tracking-wider` ← ❌ UI label
- Switcher value text: `font-mono text-[11px]` ← ❌ run/project name (readable name, not code)
- Dropdown options: `font-mono text-[12px]` ← ❌ navigation text
- Pill labels: `font-mono uppercase tracking-wider` ← ❌ UI label
- Pill values: `font-mono text-[11px]` ← borderline (TZ, Data Source — could be font-ui)
- **TopBar is the most visible readability problem — nearly all font-mono** ❌

### Sidebar
- Nav items: inherits body, `text-[12.5px] font-medium` ✓
- Logo "FX-OB" title: `font-display text-[14px] font-semibold` ✓
- Logo "Research Lab" subtitle: `font-mono uppercase tracking-[0.22em]` ← ❌ (intentional identity, debatable)
- Section headers: `font-mono uppercase tracking-[0.22em]` ← ❌ UI nav chrome
- Theme section label: `font-mono uppercase tracking-[0.22em]` ← ❌
- Current theme name: `font-mono text-[10.5px]` ← ❌ readable name
- Active config values (EURUSD, M15, RR): `font-mono` ← borderline appropriate (config params)
- Profile initials "QO": `font-mono font-bold` ← ❌ could be font-display
- Profile role "Research": `font-mono uppercase` ← ❌ UI text

### RunConfigStrip
- `ConfigChip`: `font-mono text-[10px]` on chip container ← config values, borderline appropriate
- Chip label span (`sym`, `tf`, `rr`): inherits, `uppercase tracking-[0.07em]` ← no explicit font ✓
- **Verdict:** acceptable to keep font-mono here since chips contain technical parameter values

### TradeUniverseBadge
- `BadgeCell` label: `font-mono uppercase tracking-widest` ← ❌ UI labels ("Universe", "Model", "Source")
- `BadgeCell` value: `font-mono` ← borderline (source filename could be mono, but "Baseline reference" text should not be)
- Warning chip text: `font-mono` ← ❌ readable warning message prose

### ResultsLensControl
- "Results Basis" label: `font-mono uppercase tracking-widest` ← ❌ UI label
- "Account Model" label: `font-mono uppercase tracking-widest` ← ❌ UI label

### CanonicalBucketTable
- Delegates to DataTable (which is clean) ✓
- Column definition `mono: col.kind === "ci"` — CI (confidence interval) columns get mono ✓

### EquityCurve (chart)
- XAxis/YAxis ticks: `fontFamily: "JetBrains Mono"` — appropriate for numeric tick labels
- V2 XAxis/YAxis: same ✓
- Tooltip: `fontFamily: "JetBrains Mono"` — all tooltip text (including labels) in mono ← consider splitting
- Legend: `fontFamily: "JetBrains Mono"` ← ❌ legend labels ("Win", "Loss") should be UI font
- **Inconsistency:** 6 panels use bare `"monospace"` instead of `"JetBrains Mono"` ← ❌

### HeatmapPanels
- `<table className="... font-mono text-[10px]">` ← entire heatmap table in mono
- Column/row headers: `font-mono uppercase tracking-widest` ← UI labels
- Cell values: `font-mono tabular-nums` ← appropriate for numeric data
- **Should split: headers → font-ui, cell values → font-numeric**

---

## 6. RECOMMENDED FONT STRATEGY

### Option A: System Font Stack Only

```css
--font-ui:      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
--font-numeric: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
--font-mono:    ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
```

**Pros:**
- Zero Google Fonts dependency, zero FOUT, zero network requests
- Always matches the user's OS rendering (macOS: San Francisco, Windows: Segoe UI)
- Perfect Lighthouse score for font loading

**Cons:**
- Completely generic look — no visual personality
- No consistent cross-platform appearance (San Francisco ≠ Segoe UI ≠ Roboto)
- Loses the IBM Plex Sans character that already works well here
- Inconsistent mono across platforms (SFMono vs Consolas)

**Verdict:** Not recommended. The app's premium research feel would disappear.

---

### Option B: Optimize Current Stack — IBM Plex Sans + JetBrains Mono ✅ RECOMMENDED

```css
/* index.css — simplified import (drop Space Grotesk) */
@import url('https://fonts.googleapis.com/css2?
  family=IBM+Plex+Sans:wght@400;500;600;700
  &family=JetBrains+Mono:wght@400;500;600
  &display=swap');

:root {
  --font-ui:      'IBM Plex Sans', 'Inter', system-ui, sans-serif;
  --font-numeric: 'JetBrains Mono', ui-monospace, monospace; /* tabular-nums always applied */
  --font-mono:    'JetBrains Mono', ui-monospace, monospace; /* code/IDs only */
}
```

**What changes:**
- Remove Space Grotesk (saves ~50KB across 5 weights, removes 5 font file requests)
- Remove weight 300 from both fonts (saves another ~20KB, weight 400 is light enough)
- Define CSS variables for font families
- Restrict `font-mono` to true code/data contexts
- Replace UI-label `font-mono` with `font-ui`
- Fix chart `"monospace"` → JetBrains Mono consistently
- Re-enable `font-variant-numeric: tabular-nums` for numeric contexts

**Pros:**
- Stays with fonts that are already loaded (zero new files)
- IBM Plex Sans is genuinely good for dense research UIs (IBM designed it for exactly this)
- JetBrains Mono is already appropriate for code/IDs
- Low risk — no visual identity change
- Fixes readability without changing the font

**Cons:**
- IBM Plex Sans is slightly heavier stroke at small sizes compared to Inter
- Not quite as sharp as Inter at 11-12px on non-retina screens

---

### Option C: Upgrade to Inter + JetBrains Mono (Premium Pair)

```css
/* index.css */
@import url('https://fonts.googleapis.com/css2?
  family=Inter:wght@400;500;600;700
  &family=JetBrains+Mono:wght@400;500;600
  &display=swap');

:root {
  --font-ui:      'Inter', system-ui, sans-serif;
  --font-numeric: 'JetBrains Mono', ui-monospace, monospace;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;
}
```

**What changes:**
- Replace IBM Plex Sans with Inter
- Remove Space Grotesk
- Same mono token strategy as Option B

**Pros:**
- Inter was specifically designed for screen readability at small sizes
- Excellent optical metrics at 10–13px (the dominant size range in this app)
- Used by Linear, Vercel, Figma, Grafana — premium "data tool" feel
- Slightly higher x-height than IBM Plex Sans → better at 10–11px labels
- Already in the fallback chain (`'IBM Plex Sans', 'Inter', system-ui`) so Inter loads if Plex Mono fails

**Cons:**
- Slightly more work — body/forms need to be updated
- Inter at large sizes (display headers) looks generic — may need a display font for headings
- Changes the visual feel more than Option B

**Performance note (both B and C):** Loading from Google Fonts with `display=swap` means text is visible immediately in the system fallback font, then swapped when the font loads. For a desktop app on localhost/LAN, this is imperceptible. For production, consider self-hosting fonts via `@fontsource` npm packages to eliminate the Google Fonts DNS lookup and make font loading deterministic.

---

## 7. RECOMMENDED FONT TOKENS

### CSS Variables (add to `:root` in index.css)

```css
:root {
  --font-ui:      'IBM Plex Sans', 'Inter', system-ui, sans-serif;
  --font-numeric: 'JetBrains Mono', ui-monospace, monospace;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;
}
```

> Note: `--font-numeric` and `--font-mono` use the same font family but are semantically distinct tokens so they can diverge later (e.g., swap `--font-numeric` to `IBM Plex Mono` for perfect tabular numerals without touching code/ID styling).

### Tailwind Tokens (update tailwind.config.js)

```js
fontFamily: {
  ui:      ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
  display: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],  // fix: was Space Grotesk
  num:     ['JetBrains Mono', 'ui-monospace', 'monospace'],
  mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
  code:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
},
```

### Tailwind Utility Classes in index.css

```css
@layer utilities {
  .font-ui      { font-family: var(--font-ui); }
  .font-num     {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  .font-code    { font-family: var(--font-mono); }

  /* Keep existing .font-display — alias for .font-ui */
  .font-display { font-family: var(--font-ui); }
  /* Keep existing .font-mono — alias for .font-code */
  .font-mono    { font-family: var(--font-mono); }
}
```

### Usage Map

| Token | Class | Use Cases |
|---|---|---|
| `--font-ui` | `font-ui` / `font-display` | Body text, labels, buttons, nav items, panel headers, dropdowns, badges, descriptions, empty states, tooltips (label part), chart legends |
| `--font-numeric` | `font-num` | R values, percentages, price levels, trade counts, KPI numbers, chart axis ticks, heatmap cell values — **always paired with tabular-nums** |
| `--font-mono` | `font-mono` / `font-code` | Run IDs, trade IDs (hash-like), config param names, technical code strings, candle timestamps in IntrabarInspector |

### Key Rules

1. **Body / UI text → always `font-ui`** (this includes most of what currently uses `font-mono`)
2. **Numbers that need alignment → `font-num`** (R values in tables, pct columns, KPIs)
3. **True code/IDs → `font-mono` / `font-code`** (run IDs, strategy code, hash values)
4. **Chart axis ticks → `font-num`** (numeric tick labels need tabular-nums)
5. **Chart legend labels → `font-ui`** (text labels, not data)
6. **Table column headers → `font-ui`** (UI chrome, not data)
7. **Paragraph prose → never `font-mono`** (currently violated ~30 times)

---

## 8. IMPLEMENTATION PHASES

### Phase TYP-1: Global Tokens + Font Simplification
**Scope:** `tailwind.config.js`, `index.css` only — no component changes.
**Risk:** Low. No components touched.

Changes:
1. Remove `Space Grotesk` from the Google Fonts import
2. Remove weight `300` from both remaining fonts (saves ~20KB)
3. Fix `tailwind.config.js`: change `font-display` → IBM Plex Sans (match existing CSS behavior, align config to reality)
4. Add `--font-ui`, `--font-numeric`, `--font-mono` CSS variables to `:root`
5. Add `font-ui`, `font-num`, `font-code` utility classes to `@layer utilities`
6. Fix `font-variant-numeric: normal` — remove the global reset from `table`, `pre`, `code`, `kbd`, `samp` (keep on body/inputs for form safety)

**Impact:** Saves ~5 network requests, ~50KB of font data. No visible change.

---

### Phase TYP-2: Chrome Components (High Impact, Low Risk)
**Scope:** TopBar, Sidebar, TradeUniverseBadge, ResultsLensControl, RunConfigStrip.
**Risk:** Low-medium. Visual feel changes in nav/chrome — test against all 6 themes.

Changes:
1. **TopBar:** Search input, "New Backtest" button, Switcher kicker labels, Switcher option text → `font-ui`
2. **Sidebar:** Section headers, theme label, profile role → `font-ui`. Active config values (EURUSD, M15, RR numbers) → `font-num`. Keep `font-display` on "FX-OB" logo title.
3. **TradeUniverseBadge:** BadgeCell labels → `font-ui`. BadgeCell values → `font-ui` (except source filename → `font-code`). Warning chip text → `font-ui`.
4. **ResultsLensControl:** Both `font-mono uppercase tracking-widest` labels → `font-ui`.
5. **RunConfigStrip:** Chip value spans → `font-num`. Chip labels → `font-ui`.

---

### Phase TYP-3: Charts and Heatmaps
**Scope:** All Recharts components. IntrabarInspector, CandleChart.
**Risk:** Medium. Recharts requires JSX changes, not CSS. Column widths in charts may shift slightly.

Changes:
1. Create a shared chart font constant file `src/lib/chartStyles.js`:
   ```js
   export const CHART_UI_FONT = "IBM Plex Sans, Inter, system-ui, sans-serif";
   export const CHART_NUM_FONT = "JetBrains Mono, ui-monospace, monospace";
   export const AXIS_TICK = (fill = "hsl(var(--muted))") =>
     ({ fill, fontFamily: CHART_NUM_FONT, fontSize: 10, fontVariantNumeric: "tabular-nums" });
   export const TOOLTIP_STYLE = {
     background: "hsl(var(--panel-2))",
     border: "1px solid hsl(var(--accent-primary) / 0.4)",
     borderRadius: 2,
     fontFamily: CHART_UI_FONT,
     fontSize: 11,
   };
   ```
2. Replace all `fontFamily: "JetBrains Mono"` in chart components with `CHART_NUM_FONT` import
3. Replace all bare `fontFamily: "monospace"` → `CHART_NUM_FONT` (6 files: EquityCurvePanel, SensitivityPanel, ParetoPanel, RollingMetricsPanel, ExperimentEquityOverlay, ProtectionVisualAnalytics)
4. Update EquityCurve tooltip styles: use `CHART_UI_FONT` for tooltip body, `CHART_NUM_FONT` for numeric values
5. Update chart legend labels → `CHART_UI_FONT`
6. HeatmapPanels: split table header → `font-ui`, cell values → `font-num`
7. Verify CandleChart `CHART_FONT_STACK` — already correct ✓

---

### Phase TYP-4: Page-Specific Cleanup
**Scope:** All page files. Failures panels, protection panels, lab pages.
**Risk:** Medium. Large file count. Must audit each `font-mono` usage individually.

Approach — audit each `font-mono` instance for one of three outcomes:
- `font-mono` → `font-ui` (UI label, prose, button text)
- `font-mono` → `font-num` (numeric value in table/chart context)
- `font-mono` → keep (run ID, strategy code, technical param value)

Priority order (highest user visibility first):
1. `pages/RunDetail.jsx` (91 uses — the main workspace page)
2. `pages/StrategyBuilder.jsx` (41 uses)
3. `components/lab/entries/model/DirectionPanel.jsx` (35 uses)
4. `components/lab/entries/hypothesis/EntryHypothesisLab.jsx` (28 uses)
5. `components/lab/failures/*` (FailureDrilldown, PreventionEngine, FailureDNA, ViewManager)
6. All remaining lab pages

Special attention: Any prose text using `font-mono leading-relaxed` — these are the worst readability offenders and should all become `font-ui leading-relaxed`.

---

## 9. RISKS

### Risk 1: Visual Identity Disruption ⚠️ HIGH
`font-mono uppercase tracking-[0.22em]` is the cyberpunk aesthetic signature across section labels, sidebar nav, and panel chrome. Mass-replacing this with sans-serif changes the visual character of the app — it will feel more "normal" and less "terminal". This is the desired goal per the brief but it's worth previewing on all 6 themes before committing. The `[data-theme="terminal"]` theme in particular already has overrides that calm down the mono labels — it will look best with this change.

**Mitigation:** Use the terminal theme as a test-bed first. It already suppresses many mono usages.

### Risk 2: Table Column Width Shifts ⚠️ MEDIUM
JetBrains Mono at the same `font-size` is wider than IBM Plex Sans. Swapping body text in dense tables from mono to sans will narrow text and may cause column reflows. Specifically:
- Heatmap table cells: removing `font-mono` from the table wrapper will narrow rows
- `font-mono` columns in DataTable (where `col.mono === true`) will stay unchanged
- Custom table-like layouts in RunDetail, StrategyBuilder may need padding adjustment

**Mitigation:** Phase 4 should include visual review of dense tables. Consider adding a minimum column width where needed.

### Risk 3: Chart Axis Font Consistency ⚠️ MEDIUM
Six chart components currently use bare `"monospace"` which renders differently per OS. Fixing to JetBrains Mono is always an improvement but will slightly change how axis labels look — taller x-height, slightly wider character spacing than Courier New.

**Mitigation:** Low risk in practice since JetBrains Mono is already loaded. The fix is always an improvement.

### Risk 4: Tabular Numeral Re-enablement ⚠️ LOW-MEDIUM
The global `font-variant-numeric: normal` reset was added intentionally (line 183, index.css) — likely to suppress unwanted tabular-nums that were causing visual alignment issues in some non-numeric text. Re-enabling tabular-nums on numeric-specific classes (`font-num`) is safe. However, removing the global reset from `table` and `pre` elements may expose numeric alignment issues in places that were accidentally fixed by the reset.

**Mitigation:** Only add tabular-nums explicitly on the new `font-num` class; don't remove the global reset from `font-variant-numeric: normal` on body. Keep it — just add the explicit override on `font-num`.

### Risk 5: Dark Mode Contrast at Small Sizes ⚠️ LOW
IBM Plex Sans has a slightly different stroke weight profile from monospace fonts. At 9-10px on dark backgrounds (which this app uses extensively), sans-serif strokes can appear slightly thinner and harder to read at low brightness settings. The muted color `hsl(var(--muted))` at ~52% lightness may become too faint for `font-ui` labels at 9px.

**Mitigation:** After Phase 2, check `font-ui text-[9px]` instances on dark panels. Consider bumping muted label size to 10px minimum and lightness to 56%+ for critical labels.

### Risk 6: font-mono as Intentional Identity (Sidebar/Logo)
The sidebar "Research Lab" subtitle (`font-mono uppercase tracking-[0.22em]`) and section headers are intentional design choices that give the app a terminal/research identity. These may be worth keeping as deliberate aesthetic decisions rather than converting.

**Recommendation:** Keep `font-mono` on the sidebar logo subtitle and section headers if the "research terminal" aesthetic is valued. Convert everything else.

---

## 10. EXACT NEXT IMPLEMENTATION PROMPT

When ready to implement, paste this prompt:

---

> **TASK: Implement Phase TYP-1 — Typography Global Tokens**
>
> MODE: Implement
> FILES TO EDIT: `frontend/tailwind.config.js`, `frontend/src/index.css`
>
> Changes to make:
>
> 1. `index.css` line 1 — Update Google Fonts import:
>    - Remove `Space+Grotesk:wght@300;400;500;600;700`
>    - Remove weight 300 from IBM Plex Sans (change `wght@300;400;500;600;700` → `wght@400;500;600;700`)
>    - Remove weight 300 from JetBrains Mono (same change)
>    - Keep `display=swap`
>
> 2. `tailwind.config.js` — Fix `fontFamily.display` from Space Grotesk to IBM Plex Sans (match what index.css already does):
>    ```js
>    display: ['"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
>    ```
>    Add these new tokens under `fontFamily`:
>    ```js
>    ui:   ['"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
>    num:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
>    code: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
>    ```
>
> 3. `index.css` — Add CSS variables to `:root`:
>    ```css
>    --font-ui:      'IBM Plex Sans', 'Inter', system-ui, sans-serif;
>    --font-numeric: 'JetBrains Mono', ui-monospace, monospace;
>    --font-mono:    'JetBrains Mono', ui-monospace, monospace;
>    ```
>
> 4. `index.css` — Add utility classes to `@layer utilities`:
>    ```css
>    .font-ui { font-family: var(--font-ui); }
>    .font-num {
>      font-family: var(--font-numeric);
>      font-variant-numeric: tabular-nums;
>      font-feature-settings: "tnum" 1;
>    }
>    .font-code { font-family: var(--font-mono); }
>    ```
>
> 5. `index.css` — In the `table, pre, code, kbd, samp` rule block (around line 200): remove `table` from the selector so tables are no longer globally receiving `font-variant-numeric: normal`. Leave `pre, code, kbd, samp` in the block.
>
> Do not change any component files. Do not install packages. After editing, verify the diff is correct.

---

---

## STATUS

```
STATUS: COMPLETE
NEXT:   Phase TYP-1 — global tokens + font import cleanup (tailwind.config.js + index.css only, no component edits)
```

## SUGGESTIONS

**Future improvements (post-TYP-4):**
1. **Self-host fonts:** Add `@fontsource/ibm-plex-sans` and `@fontsource/jetbrains-mono` as npm packages. Eliminates Google Fonts DNS lookup, makes font loading deterministic, improves privacy.
2. **Consider Inter for a readability upgrade:** If IBM Plex Sans is too heavy at 10-11px after testing, swap to Inter. It is already in the fallback chain and available on Google Fonts with the same import pattern.
3. **Add `font-variant-numeric: tabular-nums` to `.row-chip`:** Currently set explicitly ✓ but document it in the token system.
4. **Add Storybook or a dedicated typography specimen page** showing all tokens at each size — helps catch regressions across themes during Phase 2–4.
5. **Separate `--font-numeric` from `--font-mono`:** Long-term, consider IBM Plex Mono for numeric contexts. It was designed alongside IBM Plex Sans for data-dense layouts, has matching optical metrics, and excellent `tnum` support. The token split (`--font-numeric` vs `--font-mono`) means this can be done with a 1-line CSS change.
