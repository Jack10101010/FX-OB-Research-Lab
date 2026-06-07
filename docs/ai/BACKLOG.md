# BACKLOG.md — prioritized, not yet scheduled

Groomed by ChatGPT. Priority: P1 (next up) · P2 (soon) · P3 (later).

> **BACKLOG vs ROADMAP:** this is the **unscheduled queue**. When an item is committed to a
> sequence it moves to `ROADMAP.md` (use `/promote`); not-yet-ready thoughts live in
> `IDEA_CAPTURE.md`. Don't list the same item as "active" in both backlog and roadmap.

*Last updated: 2026-06-07.*

## P1

- **Research Signals engine + Confidence layer** — `researchSignals.js`, `ConfidenceChip.jsx`,
  glossary keys, RunDetail section. (Designed; this is the active next build.)
- **Distance importer mapping** — map `price_distance_from_ob_at_arm_pips` in `importer.js`
  (Codex). Unblocks the distance breakdown.

## P2

- **Distance breakdown section** — bands 0–2 / 2–5 / 5–10 / 10+ pips; flag the <2 pip danger.
  Blocked on the importer mapping.
- **`sumR2` in accumulators** — enables true effect-SE confidence (upgrades the heuristic).
- **TE variant naming cleanup** — consistent naming for TE Same/Next/D2/D3 across UI + glossary.
- **Confirm "Outside" session availability** — verify backend emits it, or derive from fill hour
  (reuse SessionLab `SESSION_DEFINITIONS`).

## P3

- **Model family comparison** — TE delays vs penetration vs baseline, side by side.
- **Save findings / research library** — persist named findings, revisit/compare over runs.
- **Confidence column in breakdown tables** (Phase 2b) — needs a re-grid.
- **Click-a-signal-card-to-filter** the ledger/sections.
- **Low-n indicator** on noisy breakdown rows.

## Notes

- Anything UI/UX/research → Claude. Anything data/importer/test/refactor → Codex.
- Keep each item shippable in a single scoped commit where possible.
