# AI Design Rules — FX-OB Research Lab

Canonical visual standard for all AI-assisted UI work.  
**Aesthetic:** premium dark research terminal / institutional quant SaaS — dense but calm, data-first, no casino chrome.

**Source of truth for tokens:** `frontend/src/index.css` (`:root` + `[data-theme="…"]`).  
**Reference implementations:** `NeonPanel`, `MetricChip`, `DataTable`, `WorkspaceTabBar`, `controls.jsx`.

---

## Design principles

1. **Readability over decoration** — every pixel serves a metric, filter, or action.
2. **Token-only color** — never hardcode `#`, `rgb()`, or raw Tailwind palette colors in lab UI.
3. **Hierarchy via surface + type** — not rainbow borders or competing glows.
4. **Honest states** — empty and low-N are first-class; never placeholder numbers.
5. **Reuse primitives** — extend existing chips/panels before new one-off components.

---

## Color tokens

Use HSL components from CSS variables: `hsl(var(--name))` or `hsl(var(--name) / 0.5)` for alpha.

| Role | Token | Usage |
|------|--------|--------|
| App background | `--bg`, `--bg-2` | Page shell, scroll areas |
| Surfaces | `--panel`, `--panel-2`, `--panel-3` | Cards, nested regions, inputs |
| Borders | `--border-soft`, `--border-mid` | Panel edges, table rules, dividers |
| Text | `--text`, `--text-2`, `--muted` | Body, secondary, disabled hints |
| Brand accents | `--accent-primary`, `--accent-secondary` | KPI emphasis, active nav, key links |
| Semantic | `--success`, `--danger`, `--warning`, `--info` | P&L, alerts, confidence |
| Directional | `--bull`, `--bear` | Long/short, bid/ask context |
| Grid / chart | `--grid` | Chart gridlines, faint guides |

**Themes:** `violet` (default), `emerald`, `amber`, `ice`, `blood`, `terminal` — switch via `data-theme` on root; do not fork per-page palettes.

**Forbidden:** `#8b5cf6`, `text-purple-500`, `bg-zinc-900`, inline gradients not built from token stops.

---

## Typography

| Layer | Font | Size / weight | Notes |
|-------|------|----------------|-------|
| Body | IBM Plex Sans (`font-display` / default body) | 13–14px, 400–500 | Primary reading font |
| Panel titles | `.panel-title-label` | 12px, 600, letter-spacing ~0.10em | Accent secondary color; uppercase optional, not mandatory on new UI |
| Control labels | `.control-label` | 11.5px, 500 | Muted `--text-2` |
| KPI values | `font-display` + `tabular-nums` | 24–32px, semibold | MetricChip hero numbers |
| Mono | JetBrains Mono | **Sparingly** — timestamps, IDs, raw config keys only | Project overrides map most `.font-mono` on controls to Plex; do not add new mono-heavy screens |

**Avoid:** 9–10px body copy, all-caps paragraphs, mono for every table cell.

---

## Spacing & layout

| Context | Padding / gap |
|---------|----------------|
| `NeonPanel` default | `p-4` body; header `px-4 py-3` |
| `NeonPanel` dense | `p-3`; header `py-2` |
| Section stack | `gap-4` to `gap-6` between panels |
| KPI strip | `gap-3` horizontal wrap |
| Table cell | `px-3 py-2` compact; `py-2.5` comfortable |
| Page max width | Follow `AppShell` — full bleed within lab content column |

Use consistent vertical rhythm: header → filter bar → KPI strip → primary panel → secondary (collapsed) panels.

---

## Panels (`NeonPanel`)

- **Surface:** `bg-[hsl(var(--panel)/0.86)]`, `backdrop-blur-xl`, `--border-soft` border, inset hairline shadow.
- **Corners:** accent corner ticks (`--accent-primary` / `--accent-secondary`) — signature element; do not duplicate with extra box-shadow rings.
- **Tones:** `default` | `primary` | `secondary` border emphasis for hierarchy.
- **Collapsible:** `collapsible={true}` for secondary analytics; `defaultCollapsed={true}` for advanced sections (Failures Lab standard).
- **Header:** title left, optional `action` right; clickable header only when collapsible.

---

## Headers & workspace chrome

- **Lab title:** `EntryWorkspaceHeader` / Failures equivalents — display font, short subtitle in `--text-2`.
- **Tab bar:** `WorkspaceTabBar` — equal-weight tabs, active state uses accent underline or primary tint, not filled pills.
- **Global filters:** single bar below tabs (`GlobalFilterBar`, `FailuresCohortFilter`) — do not scatter filters inside every panel.
- **Data quality:** banner pattern from `FailuresDataQualityBanner` when fields missing — factual, not alarming red walls.

---

## KPI chips (`MetricChip`)

- Beveled outer gradient border (`clip-bevel`) → inner `--panel` fill.
- **Label:** small, uppercase acceptable here only; accent primary tint.
- **Value:** large `font-display`, `tabular-nums`, tone-driven color + subtle glow classes (`text-glow-primary`, etc.).
- **Tones:** `primary` | `secondary` | `success` | `danger` | `warning` | `muted`.
- Optional sparkline: muted stroke from `--accent-secondary` / `--grid`; no chart junk.

For inline/table KPIs use `.row-chip` variants (`.row-chip-primary`, `.row-chip-success`, …) — 18px min-height, compact padding.

---

## Tables (`DataTable` + shadcn `table`)

- Header row: `--panel-2` background, `--text-2` labels, no heavy borders.
- Body: zebra optional via `--panel/0.4` hover only; prefer row hover `bg-[hsl(var(--panel-2)/0.5)]`.
- Numeric columns: right-align, `tabular-nums`.
- Status cells: `.row-chip*` — not raw colored text.
- Empty table: centered message in `--muted`, one line what to do (import run, widen filters).

---

## Empty states

Structure (see Failures `NoDataState`):

1. Small beveled icon container (gradient border, `--panel` fill) — optional emoji/icon.
2. **Title:** 15px `font-display`, `--text` / white.
3. **Body:** 11–12px `--text-2`, max-width ~320px, explains *why* empty.
4. **CTA:** link/button to Projects or filter adjustment — only if real route exists.

**Never:** lorem ipsum, fake “0.00” KPIs, skeleton charts pretending to load forever.

---

## Filter chips & toggles

- Session/direction/cohort: compact toggles in `controls.jsx` patterns or pill rows.
- Active filter: `--accent-primary` border + tinted fill (`/0.14` background).
- Inactive: `--panel-2`, `--border-soft`, `--text-2`.
- Multi-select: show count badge when >3 selected; “All” when empty array = no filter (Entries/Failures convention).

---

## Buttons

| Variant | When |
|---------|------|
| Primary | One main action per panel (export, apply, promote) |
| Ghost / outline | Secondary, cancel, “view in other lab” |
| Destructive | `--danger` only for irreversible actions |

- Use shadcn `Button` with token-mapped variants; size `sm` in dense toolbars.
- Icon + label: 14–16px icon, 12–13px label, gap-2.
- No full-width neon buttons unless modal confirm.

---

## Charts (`EquityCurve`, `CandleChart`, Recharts)

- Background: transparent or `--panel`; grid `--grid` at low opacity.
- Series: `--accent-primary` main, `--accent-secondary` compare overlay, `--success`/`--danger` for outcome series.
- Axes: `--muted` ticks, `--text-2` labels, minimal axis lines.
- Tooltip: `--panel-2` glass, border `--border-soft`, tabular values.
- Legend: horizontal, compact, no drop shadow.
- **No data:** single line “No series for current filters” — not an empty Cartesian frame with fake axes.

---

## Motion & effects

- Transitions: 150–300ms on hover borders and collapse chevrons.
- Glow: use existing utilities (`text-glow-*`); respect `--glow-strength` on `terminal` theme.
- Do not add pulsing animations, parallax, or particle backgrounds.

---

## Accessibility & density

- Touch targets ≥ 32px for primary controls in filter bars.
- Contrast: body text on `--panel` must read clearly; use `--text` not `--muted` for important numbers.
- Dense labs are OK; illegible is not.

---

## Checklist for new UI

- [ ] Colors from `index.css` tokens only
- [ ] Composed from `NeonPanel` / `MetricChip` / `DataTable` / shared controls
- [ ] Analytics in `*Analytics.js`, not in JSX
- [ ] Empty and low-N states explicit
- [ ] Matches Entries/Failures workspace layout patterns
- [ ] No new monolith page file

When in doubt, open an existing Entries or Failures module and match it.
