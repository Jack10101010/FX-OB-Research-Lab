# BE-MATRIX-V2 — Phase 3C Pre-Audit: Fallback Frequency

> How often the Phase-3B active-wick path falls back to legacy on real EURUSD
> data. **Verdict: fallback is large, not tiny → Phase 3C is high-value / effectively required.**

## Method
`scripts/audit_be_fillcandle_fallback.py` on `configs/test_control_run.json`
(EURUSD, 15min detection/execution). Walks the natural path once, then per arm
counts filled trades whose BE arm price is reached **on their own fill candle**
(`_be_arm_hit(fill_candle, …)`) — the exact condition that forces the 3B fallback
(active-loop window starts at fill+1, so a fill-candle arm is missed).

## Results

### Wick · baseline (full 159,036 candles · 1,076 filled trades)
| arm | fallback | of filled | fallback % |
|----:|---------:|----------:|-----------:|
| 0.25 | 1043 | 1076 | **96.9%** |
| 0.50 | 944 | 1076 | 87.7% |
| 0.75 | 821 | 1076 | 76.3% |
| 1.00 | 691 | 1076 | 64.2% |
| 1.50 | 502 | 1076 | 46.7% |
| 2.00 | 373 | 1076 | 34.7% |
| 2.50 | 304 | 1076 | 28.3% |
| 3.00 | 242 | 1076 | 22.5% |
| 3.50 | 190 | 1076 | 17.7% |

Distinct trades hit by ≥1 arm: **1016 / 1076 (94.4%)**.

### Wick · triggered_edge_25p0_d3 (80,000 candles · 189 filled)
0.25R **80.4%** · 1.0R 52.9% · 2.0R 28.0% · 3.5R 13.2%. Distinct ≥1 arm: **80.4%**.

### Close · baseline (80,000 candles · 541 filled) — context for Phase 3D
0.25R **34.8%** · 1.0R 13.7% · 2.0R 6.1% · 3.5R 3.0%. Distinct ≥1 arm: **34.2%**.

## Interpretation
- **Wick fallback is pervasive.** On a 15m bar the entry candle's own wick routinely reaches low arm levels, so the trade arms the same candle it fills. At 0.25R that's ~80–97% of filled trades; even at 3.5R it's 13–18%.
- **Close fallback is much lower** (close must *close* beyond the arm) but still material at low arms (~35% at 0.25R). Relevant to Phase 3D, not 3B (3B is wick-only).
- **Critical consequence for the current code:** the 3B fallback is *per-arm at the dataset level* — a **single** fill-candle-arm trade forces the **whole arm** back to the legacy walk. Since 80–94% of trades trip it, **every arm in the ladder falls back today**. So on real data Phase 3B currently delivers **≈0 single-walk speedup**; it only proves the active-loop slice is correct.

## Verdict
Fallback frequency is **large**, the opposite of the "<1% → relax" case. The ~9× cube speedup the project targets is gated almost entirely on the fill-candle fork. **Phase 3C (in-loop fill-candle same-candle BE) is therefore high-value and effectively required** for the optimization to pay off — not an optional edge case. Correctness risk is also concentrated here: this is the same fork that produced the ob 56 `REVERSE_TOUCH_CANCEL` → `BE_EXIT` divergence, so 3C must be byte-gated (3E) before the flag flips.

Files added: `scripts/audit_be_fillcandle_fallback.py` (analysis only; no engine change, flag still OFF).
