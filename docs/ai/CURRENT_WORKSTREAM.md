# CURRENT_WORKSTREAM.md

> The single active focus. Update this first when focus changes. Source for `/status`.

*Last updated: 2026-06-07.*

## Focus

**Trade Classification → Classification Tab V2 → Phase 2: Research Signals + Confidence Layer.**

## Where we are

Classification Tab V2 is **shipped and committed** (`4715513`): Signal Cards, Fill-State
Breakdown (parent/child tree), Session Breakdown, Entry Model Breakdown, glossary tooltips
(`TermTip`), and the pure `fillStateBreakdown.js` data layer. The Entry Context table was
removed (Fill State replaces it). Foundation (taxonomy, glossary, `deriveFillState`,
`muteAsBadge`, consumer migration) is complete and pushed.

## What's next (Phase 2 — designed, not yet built)

1. `frontend/src/data/researchSignals.js` — pure engine:
   - Assemble candidates from fill-state + session + entry-model breakdowns.
   - `effect = avgR`; confidence per candidate; suppress low-sample (`decided < 10`).
   - Dedup parent/child within fill state (emit child only if it diverges ≥ 0.30R).
   - Rank by `|effect| × levelWeight`; top 3 positives, top 3 negatives.
2. Confidence layer — `computeConfidence({count, wins, losses, avgR, rStdErr?})`:
   - `sampleScore` (saturating on decided) + `stabilityScore` (Wilson WR interval now;
     effect-SE later when `sumR2` exists) → score → {Very Low, Low, Medium, High}.
3. `frontend/src/components/lab/ConfidenceChip.jsx`.
4. `researchGlossary.js` additive keys: `research_signals`, `confidence`, `confidence_*`.
5. `RunDetail.jsx`: `researchSignals` memo + a "Research Signals" section at the top of the
   Classification panel (Strongest Edges / Key Risks); optional confidence chips on Signal Cards.

Full design: see the Phase-2 audit (chat) / `CLASSIFICATION-TAB-V2-PHASE-2-PLAN.md` if saved.

## Blockers / open questions

- **Distance work is blocked**: `price_distance_from_ob_at_arm_pips` is not mapped in
  `importer.js` (Codex task). Distance breakdown waits on it.
- **"Outside" session availability** is runtime-dependent — confirm a real run emits it, or
  reuse SessionLab hour-derivation. The Outside signal/card is rendered conditionally.
- **Confidence rigor**: RR ≠ 1:1, so WR-based stability is precision-of-WR, not effect
  significance. Adding `sumR2` to accumulators (Phase 2b) enables a true effect-SE test.

## Definition of done (Phase 2)

Research Signals section renders strongest +/- findings with confidence chips, dedups
parent/child, suppresses low-sample flukes, all from live tab data; assertions + host build pass;
`docs/ai/` synced; scoped commit handed to the user.
