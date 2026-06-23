# BE-MATRIX-V2 — Reverse-Conflict Impact Audit (read-only)

> How many trades the reverse-conflict gate affects across the dataset, what
> they're worth, and what disabling it would do. **No engine code changed** —
> read-only diagnostic `scripts/audit_reverse_conflict_impact.py`.

**Dataset:** `EURUSD_15min_FROM_1m.csv` — full ~4.5-year history, 159,036 15m bars,
1,123 detected order-blocks. (The true 1m file, 2021–2026, is ~2.4M candles —
too large to walk in this audit; the 15m series is the representative full set.)
**Walk:** no-BE (reverse-conflict is a strategy property, independent of BE).
**rr = 4** (win ≈ +4R, loss ≈ −1R).

## Results

| metric | baseline | TE25 (triggered-edge, C3) |
|---|---:|---:|
| total orders | 1,123 | 1,123 |
| filled trades | 1,076 | 360 |
| filled win rate (net_r>0) | 24.0% | 41.7% |
| filled net R | +214.0 | +390.0 |
| filled expectancy | +0.199 R | +1.083 R |
| **REVERSE_TOUCH_CANCEL count** | **20** | **5** |
| — % of all orders | 1.78% | 0.45% |
| — % of filled trades | 1.86% | 1.39% |
| blocked counterfactual win rate | 20.0% | 40.0% |
| **blocked net R forgone** | **+0.0** | **+5.0** |
| blocked expectancy | +0.000 R | +1.000 R |

"Counterfactual" = if the blocked order had been allowed to fill: filled at plan
entry on its touch candle, replayed forward to the first TP/SL (same-candle
TP&SL resolved conservatively as a loss). All blocked orders resolved (0 undecided).

## What happens if reverse-conflict is disabled (naive estimate)

| | baseline | TE25 (C3) |
|---|---|---|
| trades | 1,076 → 1,096 (+20) | 360 → 365 (+5) |
| net R | +214.0 → +214.0 (Δ **+0.0**) | +390.0 → +395.0 (Δ **+5.0**) |
| blended expectancy | 0.199 → 0.195 R | 1.083 → 1.082 R |

## Reading
- **Reverse-conflict is a tiny, economically marginal filter.** It cancels only **0.45–1.78% of orders**. The trades it blocks are roughly **break-even** (baseline: 20% win rate → 0.0 R expectancy at rr=4; TE25: 40% → +1.0 R on just 5 trades).
- **Disabling it barely moves the strategy.** Baseline net R is unchanged (the blocked set is a wash) and per-trade expectancy *dilutes* slightly (0.199 → 0.195) because the added trades are below the strategy's average edge. TE25 gains a negligible +5 R over 4.5 years. In neither case does it change the strategy's character.
- **Caveats.** The disabled estimate is *naive*: it adds the blocked orders' standalone outcomes but does **not** model the cascade (a new fill changes other orders' conflicts — could add or remove a few more) or BE interaction. The win-rate figures come from candle replay, not the engine's exact intrabar exit convention, so treat them as ±a trade or two. An exact figure needs a gate-off re-simulation (a code change, out of scope for this audit).

## Implication for Phase 3C
This sharpens the cost/benefit of 3C′. The BE coupling that breaks the fast single-walk lives **entirely inside this gate**, and the gate:
1. touches **≤20 orders total** (and the BE-coupled *flips* are a subset — 0–7 per arm, 0 at high arms, per the prior scope audit), and
2. is **economically near-neutral** (the blocked trades are break-even to marginal).

So there are two defensible paths, and the choice is yours because option B changes strategy semantics:

- **A — Build 3C′** (lightweight per-arm reverse-conflict resolver): preserves exact current strategy semantics *and* the single-walk speedup; ~150–250 lines, parity-gated. Correct but you're engineering byte-parity around a ~break-even, <2%-of-orders feature.
- **B — Disable reverse-conflict for the cube** (config/flagged, not a silent change): removes the only coupling channel, so the **existing fast derive becomes byte-identical** → the full ~9× speedup with **no 3C′ build**. Cost: the strategy permanently includes ~5–20 extra break-even trades. The audit says that cost is economically negligible — but it *is* a strategy-definition change, so it needs your sign-off.

Recommendation: given the gate's marginal value, **B is worth seriously considering** before investing in 3C′ — but only if you're comfortable changing the strategy definition. If exact current semantics must be preserved, **A** is the path. Either way, no flag flips until real-data byte-parity is proven.
