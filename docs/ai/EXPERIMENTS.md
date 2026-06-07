# Experiments / Run Log

Tracks backtest runs and the analysis built on them, so every entry in `FINDINGS.md` is
traceable to a concrete run. Added in AI-OS-REFINEMENT-1 to close the **experiment-tracking
gap** — findings previously cited run IDs with nowhere to record run parameters or link them.

Append-only. Newest at top. Reference experiments from `FINDINGS.md` (e.g. "see E-001").

Each entry:
- **Run / ID** — the backtest run bundle or analysis ID.
- **Params** — instrument, timeframe, RR, stop buffer, period, key config.
- **Purpose** — what question it was meant to answer.
- **Result** — headline numbers / what it showed.
- **Findings produced** — `F-###` IDs.
- **Date**.

---

## E-001 — Full-history fill-state characterization
- **Run / ID:** `20260605_163857_EURUSD_15min_RR4_SB0`
- **Params:** EURUSD · 15min · RR 4 · stop buffer 0 · 2021-01-01 → 2026-05-18 · Triggered Edge
  threshold 25%; delays same/next/d2/d3.
- **Purpose:** characterize fill-state behavior (occupied vs vacant vs AAE), session effects,
  and distance effects across the full history.
- **Result:** Occupied ≈ +0.08R; **Vacant ≈ +0.89R (primary)**; AAE ≈ +0.59R (child of Vacant);
  Outside session ≈ −1.0R / ~0% WR; distance <2 pips weak/negative; ~100% of AAE fills within
  ~4 min of OB exit.
- **Findings produced:** F-001, F-002, F-003, F-004 (provisional), F-005.
- **Date:** 2026-06-05 (run) / 2026-06-07 (logged). See `AAE-DEEP-ANALYSIS-1/2.md` for detail.

---

*Template for new entries:*
```
## E-### — <title>
- Run / ID:
- Params:
- Purpose:
- Result:
- Findings produced:
- Date:
```
