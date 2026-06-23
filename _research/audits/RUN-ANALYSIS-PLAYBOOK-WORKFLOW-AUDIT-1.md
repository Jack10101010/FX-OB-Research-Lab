# RUN-ANALYSIS-PLAYBOOK — WORKFLOW AUDIT (research rigor)

**Type:** content/product audit (NO implementation)
**Owner:** Claude (research + product)
**Date:** 2026-06-10
**Subject:** the v1 decision tree in `data/playbookTemplate.js` (7 sections / 36 steps), judged
as a quantitative research workflow — not as code.

---

## A. Workflow weaknesses

1. **Yes/No framing invites box-ticking, not investigation.** Almost every step is a closed question ("Is Net R positive?", "Losses concentrated in a session?"). A closed question is answered by a glance and a tick; it never forces the researcher to *record what they saw*. The checklist measures "I looked" rather than "here's the finding." A research workflow should extract an **observation** at each meaningful step.

2. **Weakness Discovery and Segmentation are duplicative parallel lists, not a funnel.** Both ask the same dimensions (session, direction, structure, model). §3 ("Losses concentrated in a session?") and §4 ("Check session performance") are the same investigation done twice. There's no causal chaining: a weakness found in §3 doesn't *drive* a targeted segmentation in §4, which doesn't *drive* a specific hypothesis in §5. The funnel — **symptom → locate → isolate → fix** — is implied but not enforced.

3. **Protection Lab is nearly absent.** It appears as a single shortcut in §5 (`improvement.protection_idea`). Yet Protection Lab is where the most actionable loss-mitigation research lives (break-even replay, hard-invalidation timing, distance-to-stop, what-if filters). A loss-heavy run's natural next question — *"are these losses recoverable / cappable?"* — has no home in the weakness phase. (See §D.)

4. **No finding capture during the flow.** Findings only happen at the very end ("Add Insight", Phase 2B). Insight is generated *at the moment of discovery* (mid-§3/§4), not retrospectively after 30 ticks. By the decision step the researcher is reconstructing from memory. This is the single biggest rigor gap.

5. **Improvement step is a prompt, not a captured artifact.** "What filter might remove bad trades?" is a great question with nowhere to put the answer. The hypothesis the researcher forms is the *output* of the whole workflow and currently evaporates.

6. **Decision Outcome floats free of evidence.** The 6 outcomes (Promote / Reject / Create filter hypothesis…) are picked without the checklist linking them to what was found. "Create filter hypothesis" should be pre-populated from the improvement note; "Promote" should be gated on robustness being checked.

7. **Section names are passive nouns.** "High-Level Performance Check", "Segmentation / Pattern Discovery" describe a topic, not an action. Passive labels reinforce passive ticking (see §E).

8. **Robustness sits at the end but is the gate for "Promote."** It's correctly last, but nothing stops a user promoting a candidate having ticked zero robustness steps. The branch logic (`branchHint`) is advisory only.

---

## B. Missing research paths

- **Loss recoverability (Protection):** are losers hard-invalidated vs slow bleeds? Would a break-even / 0R-exit rule turn losers into scratches? What's the efficiency ratio (R saved per R cost)? → Protection Lab. *Currently unreachable from weakness discovery.*
- **Winner quality / MFE give-back:** are winners giving back open profit (MFE → exit gap)? Is the RR target leaving money? → Failures Lab MFE / Excursion. *Only "losers" are interrogated; winners are ignored.*
- **Cost / fill realism:** is the edge surviving spread/slippage? Is fill mode (Arm C0/C1) materially changing the result? → the Result View axis + cost rescore. *Touched obliquely ("losses by fill mode") but not as a cost-realism check.*
- **Concentration / dependence:** is Net R driven by a handful of trades or one month? (top-N trade contribution, monthly dispersion). *No "is this edge concentrated?" path — a classic overfit tell.*
- **Sample sufficiency per segment:** §1 asks if the *whole run* has enough trades, but segmentation conclusions (e.g. "London is great") are drawn on sub-samples with no n-check. *Missing the per-segment small-sample guard.*
- **News / regime exposure:** how much of the edge depends on news windows or a single regime? → News Lab (not referenced anywhere) + regime step.
- **OB lifecycle / quality as a *filter input*:** §4 has "Check OB quality" but never connects it to "exclude low-quality OBs" as a hypothesis.

---

## C. Suggested new / reworded questions (investigation-forcing)

Replace closed yes/no prompts with **"find the X"** prompts that demand an observation:

| Phase | v1 (tick) | v2 (investigate) |
|---|---|---|
| Performance | "Is win rate healthy?" | "Record headline: Net R, WR (decided), PF, Max DD, expectancy, n. Is it tradeable at a glance?" |
| Weakness | "Losses concentrated in a session?" | "**Which** session/hour bleeds the most R? By how much?" → Session Lab |
| Weakness | "Losses concentrated in CHoCH or BOS?" | "Which structure (BOS/CHoCH) underperforms, and is the gap significant?" → Strategy Map |
| Weakness | "Are fast stop-outs common?" | "What share of losers stop out fast (low MAE)? Are they recoverable?" → Failures |
| Weakness *(new)* | — | "Are losers **hard-invalidated** or slow bleeds? Would a break-even/0R rule cap them?" → **Protection Lab** |
| Weakness *(new)* | — | "Are winners giving back MFE? Is the RR target leaving R on the table?" → Failures/Excursion |
| Concentration *(new)* | — | "Is Net R concentrated in a few trades or one month? (top-N / monthly dispersion)" |
| Segmentation | "Check session performance" | "Isolate the strongest & weakest **slice** of the dimension flagged above. Enough trades in each slice to trust it?" |
| Hypothesis | "What filter might remove bad trades?" | "State ONE testable change: *exclude/require X* → expected effect on Net R/WR. What does it cost in trade count?" → Hypothesis Lab |
| Hypothesis | "What protection rule…?" | "State the protection rule + arm level and its modelled Δ Net R / efficiency." → Protection Lab |
| Robustness | "Does it hold across date ranges?" | "Does the edge survive out-of-sample / walk-forward / a worse regime? Note the weakest fold." |
| Robustness *(new)* | — | "Does the per-segment conclusion survive its own small sample?" |

Principle: every step yields **a value or a sentence**, captured inline (see §F).

---

## D. Suggested Protection Lab placement

Protection deserves **two** touchpoints, not one:

1. **In Weakness Discovery (diagnose):** a step — *"Are losers hard-invalidated or slow bleeds? Are they recoverable?"* → Protection Lab. This is where you discover whether protection is even relevant (if losers are clean fast stops, BE won't help; if they bleed after invalidation, it will).
2. **In Improvement / Fix (prescribe):** keep the existing *"What protection rule reduces damage?"* → Protection Lab, now pre-loaded by the diagnosis above (arm level + modelled Δ Net R / efficiency ratio).

Plus surface **Protection** as a first-class **Decision Outcome** path ("Create protection hypothesis" already exists — good; wire it to the §5 protection note).

---

## E. Suggested section renames (action-oriented imperatives)

| v1 (passive) | v2 (action) |
|---|---|
| Confirm Data Context | **Verify the setup** (am I judging the right data?) |
| High-Level Performance Check | **Judge the headline** (is it tradeable at a glance?) |
| Trade Quality / Weakness Discovery | **Find where it bleeds** (locate the loss/cost) |
| Segmentation / Pattern Discovery | **Isolate the pattern** (drill the flagged dimension) |
| Improvement Hypothesis | **Form the fix** (one testable change) |
| Robustness / Validation | **Stress-test it** (does the edge survive?) |
| Decision Outcome | **Decide & log** |

Imperatives tell the researcher to *do* something; they also read better in the Current Stage card ("Stage 3 — Find where it bleeds").

---

## F. Suggested finding-capture UX (the key upgrade)

Capture insight **at the moment of discovery**, then promote at the end:

1. **Per-step quick-note (lightweight):** each investigation step gets an optional inline note affordance — a "＋ note" pill that expands a one-line input. Notes attach to `{ runId, stepId }`. This is the heart of "investigate, don't tick." Persist alongside the checklist (extend the per-run state with a `notes: { [stepId]: string }` map — additive to the existing store; doesn't affect progress %).
2. **Section-level "key finding"** (optional): one summary line per section (e.g. "Worst: London Lull −12R, 18 trades").
3. **Running findings tray:** a small count in the footer ("3 findings captured") so the researcher sees evidence accumulating.
4. **Decision pre-fill:** the chosen Decision Outcome pulls the relevant captured notes into the eventual insight payload — e.g. "Create filter hypothesis" seeds the insight body with the §5 improvement note + the §3/§4 weakness notes that motivated it.
5. **Phase 2B handoff:** "Add Insight" then becomes *"Save review"* — it bundles the decision + captured notes into one finding via `addProjectFinding` (the existing store path), rather than a blank textarea. Findings carry `runId` + Result View context.

This keeps the workflow manual/checklist-first (no AI), but turns it from a checklist into a **research log**. Storage stays per-run localStorage; `notes` is an additive field — no breaking change to Phase-1 persistence.

---

## G. Revised v2 workflow (proposed)

```
1 · VERIFY THE SETUP            (am I judging the right data?)
   ☐ Right run, Result View, Position Variant, date range
   ☐ Enough trades overall to trust the headline?

2 · JUDGE THE HEADLINE          (tradeable at a glance?)
   ☐ Record Net R · WR(decided) · PF · Max DD · Expectancy · n   [note]
   → branch hint: weak → §3 · strong → §6 · mixed → §4

3 · FIND WHERE IT BLEEDS        (locate the loss/cost)
   ☐ Which session/hour bleeds most R?                 [note] → Session Lab
   ☐ Which structure (BOS/CHoCH) underperforms?        [note] → Strategy Map
   ☐ Which direction is weaker?                        [note]
   ☐ Are losers hard-invalidated or slow bleeds — recoverable?  [note] → Protection Lab   (NEW)
   ☐ Share of fast stop-outs / false losers?           [note] → Failures Lab
   ☐ Are winners giving back MFE (RR leaving R)?        [note] → Failures/Excursion         (NEW)
   ☐ Is Net R concentrated in few trades / one month?  [note]                               (NEW)

4 · ISOLATE THE PATTERN         (drill the flagged dimension)
   ☐ Strongest & weakest slice of the flagged dimension [note]
   ☐ Cross-cut: session × direction × structure × model [note] → Session / Strategy / Entries
   ☐ Result View / fill-mode sensitivity (cost realism) [note]
   ☐ OB quality / lifecycle as a filter input          [note] → Order Block Lab
   ☐ Enough trades in each slice to trust it? (per-segment n)                               (NEW)

5 · FORM THE FIX                (one testable change each)
   ☐ Filter: exclude/require X → expected Δ, trade-count cost   [note] → Hypothesis Lab
   ☐ Protection: rule + arm level → modelled Δ Net R / efficiency [note] → Protection Lab   (promoted)
   ☐ Entry/timing change                                [note]
   ☐ What needs a NEW backtest to test?                 [note]

6 · STRESS-TEST IT              (does the edge survive?)
   ☐ Holds across date ranges / out-of-sample?          [note]
   ☐ Holds across runs?                                 [note] → Comparison Lab
   ☐ Holds in walk-forward (weakest fold)?              [note] → Walk-Forward
   ☐ Monte Carlo ruin risk?                             [note] → Monte Carlo
   ☐ Regime-dependent? Per-segment sample sufficient?   [note]

7 · DECIDE & LOG
   ○ Promote   ○ Needs validation   ○ Filter hypothesis   ○ Protection hypothesis
   ○ Retest with modified config   ○ Reject / archive
   → Save Review (bundles decision + captured notes into an Insight — Phase 2B)
```

**Net effect:** a true funnel (symptom → locate → isolate → fix → validate → decide), Protection
integrated at both diagnosis and prescription, winners/cost/concentration paths added, every step
yields a captured observation, and the decision is evidence-linked.

---

## Implementation note (for when approved — NOT now)
All of the above is **template + light store change**, not new analytics:
- Rewrite `playbookTemplate.js` (rename sections, reword/add steps, add Protection diagnosis step, add winners/concentration/per-segment-n steps). Stable IDs preserved where they exist; new IDs added.
- Additive `notes: { [stepId]: string }` in `playbookStore.js` / `usePlaybook.js` (does not affect progress math).
- Drawer: per-step "＋ note" affordance + a findings count (Phase 2A.1).
- "Save Review" → `addProjectFinding` (Phase 2B).
No analytics, importer, Master Controls, or backend changes.

*End — workflow audit. No source files edited.*
