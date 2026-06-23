# Protection Lab — Restructure Plan (verdict-first)

**Mode:** PLAN ONLY — no code, nothing implemented, no analytics/calculations/exporter
changes, no new metrics.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Builds on:** `PROTECTION-LAB-UX-AUDIT-1.md`, `PROTECTION-LAB-INTEGRITY-AUDIT-1.md`.

**Design contract:** the structure below must make it *structurally impossible* for an
optimistic research estimate to be mistaken for a validated exact result. The five
integrity blockers are not footnotes here — they are load-bearing parts of the design.

---

## 1. Core decision model (Phase A)

**Primary decision:** *For this strategy, do I apply a protection mode — and if so, which
— or trade unprotected?*

The decision is **gated by evidence quality**, so it is a funnel, not a single ranking:

```
Do we have an EXACT protection backtest?
 ├─ No exact, no estimate, required fields missing  → "Can't evaluate — gather data"
 ├─ Only research estimates (optimistic)            → "Validate the best candidate with an exact backtest"
 └─ Exact available:
      Best exact mode beats Unprotected (net + not-worse drawdown, winner cost ok)?
        ├─ Yes → "Use <mode>"
        ├─ Within a small band → "Stay unprotected (no real benefit)"
        └─ Worse → "Stay unprotected / reject <mode>"
```

Five possible page-level recommendations: **Use a mode · Stay unprotected · Validate with
exact backtest · Gather data · Reject.** Only the *exact* branch can produce a "Use"/"Stay"/
"Reject"; estimates can only ever produce "Validate"; missing data only "Gather."

## 2. Verdict framework (Phase B)

Per-mode verdicts, with confidence requirements that **prevent estimate→exact confusion
at the vocabulary level** (estimates never earn "Helping"):

| Verdict | Meaning | User action | Confidence required |
|---|---|---|---|
| **Helping** | Exact backtest beats Unprotected on Net R, drawdown not worse, winner cost known & acceptable | **Use it** | **Exact** |
| **Neutral** | Exact, Net-R change within a small band (no real benefit/harm) | Optional — no benefit | **Exact** |
| **Hurting** | Exact, lower Net R than Unprotected (or cuts winners more than it saves) | **Don't use / reject** | **Exact** |
| **Promising (estimate)** | A research estimate suggests benefit, but it's an optimistic upper bound and unproven | **Validate with an exact backtest** | **Estimate only** (no exact for this mode) |
| **Needs data** | Required exporter fields missing — cannot evaluate | **Export fields & re-run** | Insufficient |

Notes:
- **Unprotected** is the *reference row*, not a verdict — it's the zero-line everything is
  measured against.
- An estimate mode that *also* has an exact backtest is represented by its **exact**
  verdict; the estimate is then just corroborating context.
- "Helping" may be qualified to **"Helping (winner cost unknown)"** when the winner-cost
  breakdown fields are absent (see guardrails) — it stays actionable but honest.

## 3. Guardrail strategy (Phase C) — the heart of the design

**Three mode classes, three visually-distinct homes, one data-derived confidence axis.**

### How each class appears
- **Exact modes** → **Zone A1 "Exact backtests · decision-grade."** Full verdict, ranked,
  recommendable. Confidence chip = **Exact**.
- **Estimate-only modes** (A–D models, penetration sweep) → **Zone A2 "Directional
  estimates · validate before acting."** Visually demoted (muted/warning tint, "ESTIMATE"
  chip, an "optimistic upper bound — ignores winner cost" caption). Verdict capped at
  **Promising (estimate)**.
- **Missing-data modes/scenarios** → **Zone A3 "Needs data."** Unranked; each shows the
  exact exporter field(s) required.

### How each is ranked
- **A1 (exact):** ranked by **Net vs Unprotected (R)** descending. Drawdown improvement is
  a **secondary** sort *only once the sign is verified* (Blocker 4); until then drawdown is
  shown as neutral context and is **not** a ranker. Winner cost acts as a **guard** (can
  demote a Helping→Neutral), never as a primary ranker.
- **A2 (estimate):** ranked **within its own tier** by estimated benefit, but carries **no
  rank number that competes with A1** and is never interleaved with exact rows.
- **A3 (needs data):** unranked.

### How confidence is surfaced
A single **data-derived** confidence axis (replacing reliance on the static `ConfidenceTag`
labels, Blocker 3): **Exact** (exporter backtest present for the mode) · **Estimate**
(only research-estimate models) · **Insufficient** (required fields missing). The hero
inherits the *best available* basis and **gates its recommendation on it** — "Use it" is
reachable only from Exact.

### Preventing estimate-superiority (explicit, three independent mechanisms)
1. **Structural separation** — estimates live in A2, never in the A1 ranking, so a larger
   estimate number physically cannot sit above an exact row in the same list.
2. **Vocabulary cap** — estimates max out at "Promising (estimate) → validate," never
   "Helping/Use."
3. **Labeling + demotion** — every estimate value shows "estimate · optimistic upper bound
   (ignores winner cost)" and a muted/warning visual treatment, so even a big number reads
   as "unproven."

### Metric guardrails (Blockers 2, 4, 5)
- **"Winner Cost" → relabel to "Winners cut" (count).** It is a trade count, not R. Any
  R-based winner cost shown separately and only when derivable.
- **Winner cost / efficiency gated on `baseline_winners_cut` + `loser_r_saved`.** Absent →
  "Winner cost: unknown"; the verdict may not claim "controlled winner cost" (qualifies the
  Helping verdict instead of asserting it).
- **Drawdown gated on sign verification.** Until confirmed, show the raw value with a
  neutral label and a "sign unverified" footnote; keep it out of the verdict. Design
  accommodates flipping it on later with no layout change.

## 4. Hero section (Phase D)

The 5-second answer. Three states:

**State 1 — Exact data available:**
```
PROTECTION VERDICT
✅ USE  Break-even escape                 Net +3.4R vs unprotected
        Confidence: EXACT                 Drawdown −2.1 (context)
        Saves 5.2R on losers · costs 1.8R on winners
        Do next → Apply this protection to the strategy
```
(or `Stay unprotected — no mode beats the baseline` / `Reject <mode> — it hurts`)

**State 2 — Estimate-only (no exact for any mode):**
```
PROTECTION VERDICT
⚠ VALIDATE FIRST   Best candidate (estimate): OB penetration ≥75%
        Estimated +4.1R vs unprotected · OPTIMISTIC UPPER BOUND (ignores winner cost)
        Confidence: ESTIMATE — not yet proven
        Do next → Run an exact protection backtest before acting
```

**State 3 — Missing data:**
```
PROTECTION VERDICT
◷ CAN'T EVALUATE YET
        Missing: ob_fully_breached, max_ob_penetration_pct (12% / 0% coverage)
        Confidence: INSUFFICIENT
        Do next → Export these fields and re-run
```

Hero anatomy (consistent across states): recommended action (verb-first headline) · best
mode · the primary number (Net vs Unprotected, large) · drawdown as neutral context ·
**confidence chip** (data-derived) · a one-line "do next." A compact **data-readiness**
indicator sits beside/under the hero and drives the confidence chip (full detail in Zone D).

## 5. Mode comparison table (Phase E)

Slim the current 12-column table to a scannable decision surface.

**Primary columns (always):** Mode · Verdict (chip) · **Net vs Unprotected (R)** (default
sort, the decision metric) · Confidence chip · (chevron to inspect).
**Secondary columns:** Drawdown (neutral context until sign verified) · Winners cut (count)
· Loss R saved (R, if present) · Efficiency (Loss R saved ÷ winner R cost, only when both
present, else "—") · Trades (sample, supports confidence).
**Hidden / moved to Zone B deep-dive:** Threshold/Buffer, Defense exits, Avg exit R, Total
exit R, Profit factor, Expectancy.

**Ranking behavior:**
- The table is **sectioned by class**: A1 exact (ranked by Net vs Unprotected desc, with
  **Unprotected pinned as the reference row** at value 0), then A2 estimates (own sub-sort,
  tagged optimistic), then A3 needs-data (unranked). Sorting never crosses sections.
- Row click → sets the selected mode for Zone B.
- Missing secondary metrics render "—" (never 0), so absence never reads as a real value.

## 6. Page-zone architecture (Phase F)

The audit's Zone 0–D is right; the key improvement is **splitting Zone A by evidence
class**, which turns the guardrail into structure:

```
Protection Lab — Is protection helping, and which mode should I use?

ZONE 0 · VERDICT HERO            (+ compact data-readiness indicator)
ZONE A · PROTECTION MODES
   A1  Exact backtests · decision-grade      (ranked; recommendable)
   A2  Directional estimates · validate first (demoted; "optimistic")
   A3  Needs data                            (required fields listed)
ZONE B · INSPECTING: <mode>      equity overlay · impact scatter · drawdown comparison ·
                                  R distribution · paired-trade audit (selected mode)
ZONE C · FORENSICS  (collapsed)  loss analytics (weekday×hour, close-confirmed, session) ·
                                  OB risk characteristic · lifecycle flow · trigger time
ZONE D · RESEARCH & WORKBENCH    data-quality coverage (full) · what-if screening ·
                                  research queue/backlog · hypothesis workbench
```

Changes vs current page: the legend/safety paragraph folds into the hero's confidence
chip + a Tier-3 card later; the what-if simulator, research queue, and hypothesis
workbench drop from the decision flow into Zone D; Data Quality is promoted to *feed* the
hero (mini) while its full panel stays in D. Zone C/D collapsed by default. **Label the
index-paired visual panels (lifecycle, equity overlay) "approximate (index-aligned)"** per
the integrity finding, or switch them to the ID-based pairing used elsewhere.

## 7. Readability strategy (Phase G)

- **Hero:** large verb-first verdict + large Net-vs-Unprotected number (Robustness-Lab V3
  scale); confidence chip prominent.
- **Tables:** 12 → ~7 columns; the decision column visually dominant; brighten
  `text-muted-lab` (52%) body to `--text-2`/`--text`; key numbers enlarged; confidence chip
  always visible per row.
- **Zone headers** (A/B/C/D) like Robustness Lab; A1/A2/A3 sub-headers carry the
  evidence-class framing.
- **Estimate tier visually demoted** (muted/warning tint, striped or dimmed) so it reads as
  "context, not answer."
- **Collapse** forensics + workbench by default to cut density.
- Keep `ProtectionSectionDivider` (it works) but reduce within-panel density.

## 8. Explainability roadmap (Phase H) — identify only, no cards yet

- **Tier-3 (rich cards):** Exact vs Research Estimate vs Data Required (the confidence
  model — highest priority); FFT; Ghost; Protection mode (concept) + each mode (Break-even
  escape, Immediate hard-invalidation exit, OB penetration defense); Efficiency ratio;
  Net vs Unprotected; Loss R saved; Winners cut (count) vs Winner R cost; Hard
  invalidation; OB penetration / penetration threshold; Close-confirmed invalidation.
- **Tier-2 (compact):** Net R, WR, Expectancy, Profit Factor, Max DD (with the verified
  drawdown caveat).
- Reuse existing `fft` / `ghost` glossary keys; the rest are new keys added when the
  explainability phase runs (last).

## 9. Risks

- **Drawdown sign (Blocker 4)** — if shipped before verification and wired into the
  verdict, a wrong-signed drawdown silently flips "helping/hurting." *Mitigation:* keep
  drawdown out of the verdict and labeled neutral until verified; the design flips it on
  with no rework.
- **Confidence depends on field detection** — and the `buildDataQuality` numeric check is
  currently a no-op (overstates coverage). *Mitigation:* fix that first (sequence step 1),
  since the confidence chip and Zone A3 depend on honest coverage.
- **Estimate optimism perception** — even tiered, users may anchor on a big estimate
  number. *Mitigation:* the three independent mechanisms in §3 (separation + vocabulary +
  labeling).
- **Pairing attribution** — Zone B/forensic panels use index alignment; can mis-attribute.
  *Mitigation:* label "approximate" or adopt ID pairing.
- **Cross-stream data dependency** — page consumes Entry/FFT-owned data (read-only);
  coordinate if shapes change. Page files themselves are unclaimed.
- **Scope** — large surface; must be delivered in phases (below), not one PR.

## 10. Recommended implementation sequence

1. **Integrity prerequisites (small, do first):** verify/normalize the exporter drawdown
   sign; fix the `buildDataQuality` numeric no-op. These gate everything downstream.
2. **Data-derived confidence (presentation layer):** compute per-mode basis
   (Exact/Estimate/Insufficient) from data + a page-level data-readiness rollup. No new
   analytics.
3. **Verdict derivation (UI layer):** per-mode verdict using exact metrics + the §3
   guardrails (estimates → "Promising (estimate)" only; winner cost & drawdown gated).
4. **Zone 0 hero** with the three states.
5. **Zone A split** (A1/A2/A3) + slimmed comparison table + relabel "Winner Cost" →
   "Winners cut."
6. **Zone separation** B/C/D + demote what-if/queue/workbench + readability pass + label
   index-paired panels.
7. **Tier-3 explainability cards** last, on the finished structure.

Steps 1–2 are the integrity backbone and must land before any verdict UI (step 3+) so the
verdict is never built on unverified signs, overstated coverage, or estimate/exact
conflation.

---

### Why this design satisfies the integrity contract

Estimate-only modes can never be ranked against, or mistaken for, exact results because
they live in a separate zone (A2), cannot earn an exact verdict, and carry an explicit
"optimistic" label; the hero's "Use it" is reachable only from data-derived **Exact**
confidence; "Winner Cost" is corrected to a count with R-cost gated on its fields; and
drawdown is excluded from the verdict until its sign is verified. Implementation can
proceed from this document without another redesign pass.

*Plan only. No code, no implementation. This document is the deliverable.*
