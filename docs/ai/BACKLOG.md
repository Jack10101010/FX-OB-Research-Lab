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

## Master Controls

> From Phase 7A live browser QA (2026-06-07, run `imported_1780733962068`). The cost-rescore
> feature PASSed; these are the open issues it surfaced. Owner: Claude (UI) / Codex (data).

- **(RESOLVED 2026-06-07) Sidecar preview import "hang"** — diagnosed via timing logs as a
  **self-cancelling import effect**, not a perf issue (total import ~117 ms: fetch ~24 / ingest
  ~85). The effect was keyed on `preview.status`; its `completed → importing` write re-ran the
  effect and tripped the old `cancelled` cleanup before the async import resolved, skipping the
  `status:"done"` transition. Fixed in `MasterControlsContext.jsx` with a job-id ref guard
  (`importJobRef`). Live QA passed (preview reaches "Preview ready"; Results + compare render;
  Save As Run + Clear work). Fix is implemented, commit pending.
- **(P2) Investigate cost-rescore Active baseline mismatch** *(still open)* — the panel's Active column
  (~+9.8R / 33.3% / 35 trades) ≠ the page Trade Sanity (~+8.44R / 38%); likely a variant/basis
  mismatch (`extractPreviewMetrics` uses `primaryVariant` + raw R). Internally consistent, but
  reconcile so the panel's "Active" matches the rest of the run view.
- **(P3) Decide whether full-backtest-tier (T3) fields stay read-only in Master Controls** —
  symbol / detection tf / dates can't be edited from the drawer, so the "Run Full Backtest"
  affordance is unreachable there. Likely acceptable; confirm intent.

## Notes

- Anything UI/UX/research → Claude. Anything data/importer/test/refactor → Codex.
- Keep each item shippable in a single scoped commit where possible.
