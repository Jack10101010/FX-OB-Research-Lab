# Findings

Permanent storage for **validated research conclusions** — what the data says, not how we
build it. Append-only; deprecate (don't delete) when superseded. Add entries with `/finding`.

> **Boundary — FINDINGS vs DECISIONS:** a *finding* is a conclusion about the market/strategy
> drawn from data ("OB Vacant At Arm is the primary signal"). A *decision* (`DECISIONS.md`) is a
> build/design choice ("make Vacant the headline in the UI"). Findings justify decisions;
> decisions cite findings. Evidence/runs live in `EXPERIMENTS.md`.

Status values: **Validated** (multiple/strong evidence) · **Provisional** (single source or
partial pipeline) · **Investigating** · **Deprecated**.

---

## Active Findings

### F-001 — OB Vacant At Arm is the primary fill-state signal
- **Summary:** When price has already left the order block at the moment the order arms
  (`vacant_at_arm`), expectancy is far higher than the textbook still-in-block fill
  (`occupied_at_arm`). This — not AAE alone — is the headline edge.
- **Evidence:** Full-history run `20260605_163857_EURUSD_15min_RR4_SB0` (2021-01-01 → 2026-05-18):
  Vacant ≈ +0.89R avg vs Occupied ≈ +0.08R avg. See `EXPERIMENTS.md` E-001.
- **Status:** Validated
- **Date:** 2026-06-07

### F-002 — AAE is a child signal of Vacant At Arm
- **Summary:** "Armed After OB Exit" (price exits the OB then returns to fill) is a subtype of
  Vacant, not the primary signal. Vacant = AAE + Vacant-No-AAE.
- **Evidence:** Same run — AAE ≈ +0.59R avg; the broader Vacant cohort ≈ +0.89R. ~100% of AAE
  fills occur within ~4 min of OB exit.
- **Status:** Validated
- **Date:** 2026-06-07

### F-003 — Outside Session is a danger condition
- **Summary:** Trades filled outside defined session windows perform very poorly and should be
  filtered/flagged.
- **Evidence:** Same run — Outside ≈ −1.0R avg, ~0% WR. (Note: "Outside" availability in
  imported frontend data is runtime-dependent; confirm per run.)
- **Status:** Validated (backend analysis); frontend surfacing conditional.
- **Date:** 2026-06-07

### F-004 — Distance < 2 pips at arm is weak/negative
- **Summary:** When price is within ~2 pips of the OB at arm, edge is weak or negative — too
  close to count as a meaningful vacate.
- **Evidence:** Backend analysis. **Provisional in-app**: `price_distance_from_ob_at_arm_pips`
  is not yet mapped in `importer.js`, so the frontend cannot yet reproduce this.
- **Status:** Provisional (blocked on importer mapping — see `BACKLOG.md` P1).
- **Date:** 2026-06-07

### F-005 — Timing/expiry is currently low priority
- **Summary:** Expiry/timing protections are not where the edge is. AAE fills cluster within
  ~4 min of OB exit, so expiry windows have little to add right now.
- **Evidence:** Timing distribution from the full-history run (AAE-DEEP-ANALYSIS-2).
- **Status:** Validated (deprioritized)
- **Date:** 2026-06-07

---

## Deprecated Findings

*(none yet — when a finding is superseded, move it here with a note on what replaced it and why.)*
