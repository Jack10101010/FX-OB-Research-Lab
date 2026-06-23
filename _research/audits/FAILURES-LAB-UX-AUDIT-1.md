# Failures Lab — Deep UX / Product Audit

**Mode:** AUDIT ONLY — nothing implemented, no code. Research & design audit.
**Date:** 2026-06-08 · **Branch:** `codex-dev`
**Files read:** `pages/FailuresLab.jsx`, `components/lab/failures/FailuresWorkspace.jsx`,
`shared/useFailuresWorkspace.js`, `overview/FailuresOverview.jsx`,
`prevention/PreventionEngine.jsx`, `archetypes/FailureDNA.jsx`,
`shared/archetypeClassifier.js`, `shared/severityScorer.js`, `shared/failuresRegistry.js`
(+ structural map of all 26 files / 5,703 lines in `components/lab/failures/`).

## Headline

Failures Lab is the **most architecturally mature** of the three labs — it is already a
9-tab forensics workbench with a global cohort filter, a transparent archetype taxonomy,
severity scoring, and a genuine action layer (Prevention → HypothesisLab). It does **not**
have the panel-sprawl problem Robustness/Protection had. Its gap is different and more
subtle: **it never synthesises an answer.** It can tell you *why* you're losing (Archetypes,
tab 2) and *what would have prevented it* (Prevention, tab 7), but the user must assemble
"what do I fix first?" themselves by hopping across tabs. It is **analysis-first, not
verdict-first**, and it carries real **explainability debt** (three different "confidence"
scales; a radar "fingerprint" that is authored, not measured).

---

## 1. Current purpose

A failure-forensics workbench over the losing trades of the active run. Pipeline
(`FailuresWorkspace.jsx`): `trades → filterLosers → classifyAll (archetype) → scoreAll
(severity) → applyFilter (cohort)` → 9 tabs sharing one prop shape. Tabs: **Overview ·
DNA & Archetypes · Temporal · Direction · Sessions · Streaks · Prevention · Drilldown ·
Views & Export**. A global **cohort filter** (session/direction/archetype/severityMin) and
a **data-quality banner** sit above all tabs.

## 2. Core user question

> **"Why am I losing — and what should I fix first?"**

A secondary, equally valid framing the page supports: *"Which prevention rule removes the
most loss-R without sacrificing too many winners?"* (Prevention tab) and *"Which failure
archetype is my biggest loss driver?"* (Archetypes tab). The page has the data to answer
all three; it just doesn't **lead** with the answer.

**Does it answer it, and how fast?** Slowly. The verdict-equivalent ("fix X first") lives
implicitly in tab 7 (Prevention's ranked table) and tab 2 (top archetype). Overview leads
with KPIs and distributions, not a ranked recommendation. Time-to-answer: 30s+ of tab
hopping and cross-referencing.

## 3. Current strengths

- **Already tabbed** — no equal-weight panel sprawl. IA is fundamentally sounder than
  pre-refactor Robustness/Protection.
- **Transparent archetype taxonomy** (`failuresRegistry.js`): 5 archetypes (Hard
  Invalidation, Close-Confirmed, Fast Stopout, Slow Bleed, Standard Loss) each with a
  plain-language `description`, severity weight, and suggested hypotheses — descriptions
  already written (cheap to surface as explainability).
- **Honest severity scoring** (`severityScorer.js`): 0–10 from transparent components
  (magnitude/streak/drawdown/structural).
- **Genuine action layer** (`PreventionEngine.jsx`): rules ranked by **actual matched-trade
  Net R delta** (not population averages), with confidence tiers, false-positive (>15%)
  warnings, severity-weighted ranking, explicit in-sample caveats, and a **Promote →
  HypothesisLab** bridge. This is the best decision-support of any lab — it just isn't
  surfaced.
- **Global cohort filter** persists across tabs — powerful for slicing.
- **Classification honesty:** `UNCLASSIFIED` is used instead of forcing a `LOW` match.

## 4. Current weaknesses

- **No verdict / answer-first layer.** Overview is stats-first; "Top Archetype" KPI +
  "Quick Insights" bullets are the closest thing to a recommendation.
- **The action layer is buried at tab 7 of 9.** The ranked prevention table — the literal
  "what to fix" — is near the end.
- **Decision-support is fragmented:** archetypes (why) in tab 2, prevention (what to do) in
  tab 7, severity scattered. Nothing ties "biggest loss driver → the rule that catches it →
  promote it" together.
- **Three different "confidence" scales** rendered as near-identical Pills — a real
  comprehension hazard (see §8).
- **A hidden assumption presented as data:** the archetype **radar "fingerprint"** axes are
  **hardcoded constants** in the registry (`radarProfile`), not computed from the trades
  (see §6/§9).
- **9 tabs** is a lot; four of them (Temporal/Direction/Sessions/Streaks) are all
  "where/when do losses cluster" and could group.

## 5. User-journey findings

1. **First attention:** the Overview KPI strip (Total Losses, Avg/Worst Loss, Longest
   Streak, Top Archetype, Sev Score) — counts, not a recommendation.
2. **Appears important:** the big red loss numbers + the distribution bars.
3. **Actually important:** the **top archetype** (biggest loss driver) and the **top
   prevention rule** (best fix) — neither is the visual lead; the latter is 6 tabs away.
4. **Easy conclusions:** "I lose most in session X / on weekday Y / from archetype Z" (the
   Overview distributions make these quick).
5. **Hard conclusions:** "What single change reduces my losses the most, and is it
   trustworthy?" — requires Prevention tab + reading confidence tiers + weighing FP%.
6. **Obvious actions:** filter by cohort; promote an archetype/rule to HypothesisLab.
7. **Unclear actions:** which archetype to act on first; whether a SPECULATIVE rule is
   noise; how the three confidence scales relate; what the radar axes mean.

## 6. Information-architecture findings

Per-tab classification:

| Tab | Class | Note |
|---|---|---|
| (missing) verdict / "fix-first" | **Verdict — absent, should add** | synthesise from archetype distribution + top prevention rule |
| Overview | Primary evidence | stats-first; should host the verdict |
| Prevention | **Primary evidence / action** | the real decision surface — surface it in Overview |
| DNA & Archetypes | Primary evidence | the "why"; cards are good, radar is suspect |
| Drilldown | Supporting detail | trade-level inspection |
| Temporal / Direction / Sessions / Streaks | **Secondary evidence** | four separate "where/when losses cluster" tabs → candidates to merge into one "Patterns" tab |
| Views & Export | Research/utility | saved views + CSV export |
| Archetype radar fingerprint | **Candidate for removal/relabel** | hardcoded, not data-derived |

Issues: the **answer is buried** (Prevention at tab 7); **decision-support fragmented**
across tabs; **tab count high** with four overlapping "clustering" tabs; the radar is a
**buried hidden-assumption**. Compared to Robustness/Protection, the fix is *lighter*
(structure is already tabbed) but the **verdict-first synthesis is entirely missing**.

## 7. Readability findings (with severity)

- **High:** pervasive tiny text — archetype-card metric labels at **8.5px**
  (`FailureDNA.jsx`), prevention-table sub-rows at **9px**, many **9–9.5px** labels.
  `SectionTitle` in Overview is `10px` `tracking-[0.18em]` **`text-muted-lab`** (dim + tiny
  + over-tracked). Forces squinting.
- **High:** dim `text-muted-lab` (52%) used for **descriptions and helper copy** (archetype
  descriptions, insights, prevention caveats) — important explanatory text on the dimmest token.
- **Medium:** the Prevention table is dense (7 columns incl. stacked sub-values) and uses
  9px secondary lines.
- **Medium:** archetype cards pack header + description + 3-metric grid + conf row +
  hypothesis + button into a small card — high density per card.
- **Low:** Overview distribution bars are clean and scannable (a good pattern to keep).

## 8. Explainability findings (ranked by debt)

1. **Three different "confidence" scales — highest debt.** Classification confidence
   (`HIGH/MEDIUM/LOW/BORDERLINE/UNCLASSIFIED`, `archetypeClassifier.js`), **sample**
   confidence (from `entryRegistry.sampleConfidence`), and **prevention** confidence
   (`SPECULATIVE/WEAK/MODERATE/STRONG`, `PreventionEngine.jsx`) are all rendered as similar
   Pills. A user cannot tell they measure different things. Needs explicit disambiguation +
   Tier-3 cards.
2. **Archetype radar "fingerprint" — high debt + integrity flag.** The 6 axes (Timing Risk,
   News Risk, Direction, Session Risk, OB Quality, Pre-Entry) are **authored 0–1 constants
   per archetype** in `failuresRegistry.js`, not computed from the run's trades. Presented
   as a "fingerprint," it reads like a finding but is an assumption. Must be relabeled as
   "reference profile" or removed; a verdict must never treat it as evidence.
3. **"Severity" (0–10).** Decision-grade and used for ranking, but the 4-component recipe
   (magnitude/streak/drawdown/structural) is invisible to the user — needs a Tier-3 card.
4. **Archetype names** (Hard Invalidation, Close-Confirmed, Fast Stopout, Slow Bleed,
   Standard Loss) — descriptions exist in the registry; surface them on hover/Tier-3.
5. **"DNA"** — metaphor for the archetype distribution + radar; harmless but undefined.
6. **Prevention metrics:** "FP %" (false-positive = winners removed), "Sev Net R", "Net R
   Δ", "losers caught", "winners removed" — terse, decision-grade, need definition.
7. **Tier-2 (compact):** Avg R, Avg Sev, loss rate, streak. (No "toxicity" terminology
   exists in Failures — that lives in Entries.)

## 9. Decision-support findings — ideal outcome

The page should produce, up front, a **ranked "fix-first" recommendation** that fuses the
two halves it already computes:

> **Biggest loss driver: Hard Invalidation — 38% of losses, −X.XR total (avg sev 6.2).**
> **Best prevention candidate: [rule] catches Y% of these, +Z.ZR net (FP W%), confidence
> MODERATE.** → *Promote to HypothesisLab · validate out-of-sample.*

Outcomes the page should be able to recommend per archetype/rule: **Fix first** (strong,
high-net-R prevention) · **Research further** (promising but WEAK/SPECULATIVE) · **Ignore /
noise** (SPECULATIVE, <5 caught) · **Accept** (low-severity, low-frequency). The ingredients
exist (`computePreventionRules`, archetype distribution, severity) — they are **not
synthesised or surfaced**. That synthesis, with the **prevention confidence inherited** so a
SPECULATIVE rule never reads as "fix this," is the core missing piece.

## 10. Product-value assessment

- **Mission critical:** Prevention Engine (the action); Archetype classification +
  distribution (the why); Severity scoring (prioritisation); the HypothesisLab promotion
  bridge (the pipeline out).
- **High:** Overview KPIs + distributions; global cohort filter; Drilldown.
- **Nice-to-have:** Temporal, Sessions, Direction, Streaks — useful "where/when" detail, but
  four separate tabs for one question; group them.
- **Lowest value / highest misleading-risk:** the archetype **radar fingerprint**
  (hardcoded, not measured) — impressive-looking but not research-grade.

## 11. Proposed future architecture

Verdict-first + tab consolidation (9 → ~5):

```
Failures Lab — Why am I losing, and what should I fix first?

OVERVIEW (Decision)
  • Verdict hero: biggest loss driver + best prevention candidate + recommended action
  • KPI strip (keep)
  • Loss drivers — archetypes ranked by total loss-R / severity (click → Patterns)
  • Top prevention candidates (the top 2–3 rules, surfaced from the Prevention tab)

PATTERNS (Deep dive)   ← merge Archetypes + Temporal + Direction + Sessions + Streaks
  • DNA & archetype cards (radar relabeled "reference profile" or dropped)
  • where/when sub-sections: temporal heatmap · sessions · direction · streaks

PREVENTION (Action)
  • the full ranked rule table (unchanged logic) + promote bridge

DRILLDOWN
  • trade-level forensics

VIEWS & EXPORT
  • saved views + CSV
```

This keeps every existing capability, surfaces the answer first, and collapses the four
"clustering" tabs into one — the same answer-first / deep-dive / action shape now shared by
Robustness and Protection.

## 12. Top 10 improvement opportunities

1. **Add a verdict hero to Overview** synthesising biggest loss driver + best prevention
   candidate + action (no new analytics — reuse archetype distribution + prevention rules).
2. **Surface the top 2–3 prevention rules in Overview** so the action isn't 6 tabs away.
3. **Rank archetypes by total loss-R / severity** (not just count) and lead Overview with it.
4. **Disambiguate the three confidence scales** (rename/legend + Tier-3 cards) — highest
   explainability win.
5. **Relabel or remove the archetype radar** (hardcoded ≠ measured) — integrity fix.
6. **Consolidate Temporal/Direction/Sessions/Streaks into one "Patterns" tab** (9→~5 tabs).
7. **Readability pass:** lift 8.5–9.5px labels to ≥10–11px; move descriptions/helper copy
   off `text-muted-lab` to `text-2`; de-track the Overview `SectionTitle`.
8. **Tier-3 explainability cards** for Severity, the archetypes, and the prevention metrics
   (FP%, Net R Δ) — descriptions already exist in the registry.
9. **Inherit prevention confidence into any "fix-first" recommendation** so SPECULATIVE
   never reads as actionable (the Protection guardrail pattern).
10. **Make Prevention's in-sample caveat a first-class confidence chip**, consistent with
    the exact/estimate honesty pattern used elsewhere.

## 13. Risk assessment

- **Ownership:** `components/lab/failures/*` is **not** a claimed active workstream in
  `WORKSTREAMS.md` — safe to clean.
- **Shared dependencies (do NOT modify):** it imports `WorkspaceTabBar` and
  `entryFormatters`/`entryRegistry` (`sessionOf`, `sampleConfidence`) from
  `components/lab/entries/*`, which is owned by the **Entry/FFT/Paired-Runs** active
  workstream. Reuse them read-only; don't edit them. It also writes to **HypothesisLab**
  storage via `failuresExporter` — keep that contract stable.
- **Integrity item before any verdict:** the radar profiles are authored constants — a
  verdict/decision layer must not consume them as data (mirrors the Protection static-tag
  finding).
- **Three-confidence-scale conflation** is a correctness/clarity risk that should be
  resolved before adding a synthesised recommendation on top.
- **Severity / prevention thresholds** (fast-stopout mins, FP>15%, <5-caught SPECULATIVE)
  are presentation/heuristic thresholds — fine to keep, but document them.
- Scope: ~5,700 lines across 26 files — but presentation-only changes are contained and the
  tab architecture already exists, so the lift is smaller than Protection's.

## 14. Recommended implementation sequence

1. **Integrity-first (read-only/tiny):** confirm the radar profiles are static and decide
   relabel-vs-remove; inventory the three confidence scales. (No analytics change.)
2. **Verdict synthesis (presentation layer):** derive the "biggest loss driver + best
   prevention candidate" from existing `computePreventionRules` + archetype distribution;
   no new statistics.
3. **Overview verdict hero + top-prevention surfacing.**
4. **Tab consolidation** (Patterns) + rank archetypes by loss-R.
5. **Readability pass** (sizes/contrast, local only — don't touch shared entries components
   or global tokens).
6. **Explainability (Tier-3 cards)** last — disambiguate the three confidences, define
   archetypes/severity/prevention metrics, relabel the radar.

Sequence rationale: resolve the integrity/clarity hazards (radar, triple-confidence) before
synthesising a recommendation on top of them, exactly as the Protection chain sequenced
integrity → verdict → IA → polish.

*Audit only. No files changed, nothing implemented. This document is the deliverable.*
