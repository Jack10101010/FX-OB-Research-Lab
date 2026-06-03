# FX-OB Research Lab — Agent Guidelines

## Typography & Chip UI Rules

These rules preserve the intentional typography system. Violations cause visual
regression — new UI ends up looking like old terminal-style debug output even
when font tokens are correct.

### 1. Font token assignment

| Token | Use for |
|---|---|
| `font-ui` | UI text, prose, labels, chips, buttons, headings, inputs |
| `font-num` | Stats, counts, R values, percentages, any tabular/numeric value |
| `font-code` | Code, logs, IDs, hashes, paths, timestamps, raw technical strings |

**Never add `font-mono` in JSX/TSX.** `font-mono` is reserved for `<pre>` code
blocks in CSS only (via `.font-mono` utility). It must not appear in component
className strings.

### 2. Tracking — never use `tracking-widest` in JSX/TSX

`tracking-widest` (Tailwind preset = `0.1em`) is prohibited in component code.
In IBM Plex Sans it produces excessive inter-letter gaps that make small-text
labels unreadable. Use an arbitrary value instead if wider tracking is truly
needed (see rule 5 for the allowed ceiling).

### 3. Old chip anti-pattern — do not copy this

```
text-[9px] uppercase tracking-widest
text-[10px] uppercase tracking-wider
```

These were artifacts of the pre-refactor monospace era. Do not copy them when
adding new chips, pills, or label spans.

### 4. Scenario chips, filter chips, tabs, navigation pills

Interactive chips that users click — scenario selectors, filter toggles, result
view pills, tab bars — should read as legible UI, not terminal labels:

- Font: `font-ui`
- Case: sentence case or natural case (no `uppercase` unless the design
  explicitly calls for it)
- Size: `text-[10.5px]` – `text-[11px]`
- Tracking: `tracking-[0em]` – `tracking-[0.04em]`

### 5. Tiny uppercase eyebrow / metadata labels

Non-interactive metadata labels (e.g. "Trades · 208", "Source", "Variant") may
use uppercase for visual hierarchy, but must respect these limits:

- Minimum size: `text-[9.5px]`
- Maximum tracking: `tracking-[0.08em]`
- Do **not** use `tracking-widest`

### 6. Validation grep — run before finishing any UI/chip work

```bash
grep -R "font-mono" frontend/src --include="*.jsx" --include="*.tsx" -n
grep -R "tracking-widest" frontend/src --include="*.jsx" --include="*.tsx" -n
```

Expected result: **0 lines** for both commands. If either returns results,
either fix them or explicitly justify and document the exception in your report.

### 7. Reusable chip styles — centralize, do not copy

If adding a new chip or pill variant that will appear in more than one place,
define the style in `src/index.css` (as a `.row-chip-*` variant) or in a shared
component. Do not copy one-off class strings across multiple files — that is
what caused the drift that required TYP-5 through TYP-7 to fix.
