# FFT-WIDTH-3-BACKEND-GATING-AUDIT

**Goal:** Determine whether the backend can run an FFT width-gated experiment, and scope the minimal work to enable it.

**Experiment to support:** EURUSD M15 RR3.3, 2022-05-18 → 2024-05-18, Triggered Edge 25% · Next, allow-multi, same sessions/news/risk as Run 17. Four arms:
A. FFT ON all OBs · B. FFT OFF all OBs · C. FFT ON only when `obWidthPips ≥ 10p` · D. FFT ON only when `obWidthPips ≥ 12p`.

**Status:** Audit only. No code changes.

### Access limitation (read this first)
The backend repo (`/Users/jack/Documents/Dev Projects/Lux-OB-Backtester`, per the sidecar's `/health`) is **not mounted in this session** and is unreachable from the sandbox. The sidecar's OpenAPI exposes only a free-form `RunRequest` (no enumerated config schema). So conclusions about backend *internals* below are **inferred from the authoritative frontend config contract** (`configRegistry.js`, `configTranslator.js` — these define exactly which `backendKey`s the backend accepts) plus the importer's output-file grammar. Items marked **[confirm in backend]** must be verified against the Python source before building.

---

## 1. Does the backend currently gate FFT cancel by `obWidthPips`?

**No — not by absolute width.** The accessible contract shows the backend accepts these FFT-related keys (subgroup "TE Protection"):

| backendKey | type | meaning |
|---|---|---|
| `triggered_edge_cancel_on_first_failed_tag` | bool | FFT on/off (global) |
| `triggered_edge_fft_move_away_pips` | number | only cancel if price moved ≥ N pips past OB edge |
| `triggered_edge_fft_move_away_ob_multiple` | number | same guard, expressed as a multiple of **OB width** |

Two important consequences:

- The FFT cancel decision is **already conditional on numeric guards**, and one of them (`move_away_ob_multiple = move_away ÷ ob_width`) is **already defined in terms of OB width** — so **OB width is already in scope at the exact code site** where the cancel is decided. Adding a `min_ob_width_pips` guard is a sibling of logic that already exists. **[confirm in backend]**
- The only *absolute-width* keys are `min_ob_size_pips` / `max_ob_size_pips` (subgroup "Detection"). These are an **OB universe filter** — they remove out-of-band OBs from trading entirely. They are **not** a substitute: the experiment needs sub-10p OBs to **still trade**, just without FFT cancellation. Using `min_ob_size_pips` would delete those trades, not preserve them. So a new, FFT-specific gate is required.

**Bottom line:** width-gated FFT is not currently expressible, but the backend already has the precise pattern (conditional FFT cancel using OB width) needed to add it cheaply.

---

## 2. Where should the minimal config flag live?

- **Backend [confirm]:** at the First-Failed-Tag cancel decision inside triggered-edge processing — the same branch guarded by `triggered_edge_cancel_on_first_failed_tag` and the existing `move_away_*` checks. Add one guard: only apply the cancel when `ob_width_pips >= threshold`. The width value is already available there (it powers `move_away_ob_multiple`). Default `0` ⇒ applies to all widths ⇒ behaviour identical to today.
- **Frontend:** `configRegistry.js`, "TE Protection" subgroup, immediately after `triggeredEdgeFftMoveAwayPips` (line ~410), plus the three matching hooks in `configTranslator.js` (label ~446, emit ~625, apply ~789). This makes the value round-trip and display in the run config strip.

---

## 3. Config name

The suggested `triggered_edge_cancel_on_first_failed_tag_min_ob_width_pips` is unambiguous but long (50 chars) and breaks the existing naming family.

**Recommended:** `triggered_edge_fft_min_ob_width_pips` — consistent with the existing siblings `triggered_edge_fft_move_away_pips` and `triggered_edge_fft_move_away_ob_multiple`.

| Layer | Name |
|---|---|
| Backend key | `triggered_edge_fft_min_ob_width_pips` |
| Frontend camelCase | `triggeredEdgeFftMinObWidthPips` |
| Default | `0` (= disabled; FFT applies to all widths) |
| Semantics | FFT cancel fires **only** when `obWidthPips ≥ value`; below it the OB trades normally |

(Whatever name is chosen, the backend Python param and the frontend `backendKey` must match exactly. Align them before coding.)

---

## 4. Can auto-control still generate FFT-OFF controls for arms C/D?

**Yes, and the control is the same for A/C/D — by design.** [confirm in backend]

The auto-control output is the **full FFT-OFF counterpart** (`…__control.csv`). Its job (per `fftPairingAnalytics.js`) is to give each cancelled OB the outcome it *would* have had with no FFT. Width-gating only changes **which** cancels fire on the ON side — it does not change the traded OB universe (all OBs still trade; FFT just may not cancel them). Therefore the correct counterfactual for arms A, C, and D is identical: "this config, FFT fully OFF."

Requirement to verify: the backend's control generator must disable FFT *before* the width check (i.e. FFT-OFF short-circuits, so the new key is a no-op on the control path). If it does — which is the natural implementation, since FFT-off ignores all FFT sub-params — then arms C/D get a valid `__control.csv` with no extra work. **[confirm in backend]**

Caveat on interpretation: in a gated ON arm, there are by construction **no sub-threshold cancels**, so the FFT Width Breakdown's small bucket will correctly read 0 cancels. Evaluate the gated arm by comparing its **overall** net R against arms A and B — not by the (empty) sub-threshold cancel rows.

---

## 5. Expected output CSV names

The importer's grammar (`importer.js`) recognises, per run bundle:

- ON trades: `trades_allow_multi_position__entry_triggered_edge_25p0_next.csv`
- FFT-OFF control: `trades_allow_multi_position__entry_triggered_edge_25p0_next__control.csv` (regex `^trades_(single_position|allow_multi_position|one_per_direction)__(.+)__control\.csv$`)
- `order_blocks.csv`, `summary.json`, candles.

**Key point:** the filenames do **not** encode the arm or the gate value — the scenario key stays `entry_triggered_edge_25p0_next` for every arm. So each arm (A/B/C/D) is a **separate run → separate bundle → separate import**, all with identical CSV names; the differentiator is `summary.json.config` (the FFT flag + the new gate value). No new file types are introduced. (Arm B is just a standalone FFT-OFF run.)

---

## 6. Frontend changes to display / import the gated arms

Import already works unchanged (same filenames, control detection, and `obWidthPips` enrichment all carry over). The only gap is **visibility** of the new gate value. Minimal set:

1. `configRegistry.js` — add `triggeredEdgeFftMinObWidthPips` entry (TE Protection, `inputType:"number"`, `defaultValue:0`, `backendKey:"triggered_edge_fft_min_ob_width_pips"`, `validation:{min:0,max:50,step:0.1}`, `advancedMode:true`), mirroring `triggeredEdgeFftMoveAwayPips`.
2. `configTranslator.js` — add (a) label (~line 446), (b) emit in the to-backend block (~625, gated on `teCancelOnFirstFailedTag` like the move-away vars), (c) `applyFirstPresent(... "triggeredEdgeFftMinObWidthPips", ["triggered_edge_fft_min_ob_width_pips","triggeredEdgeFftMinObWidthPips"], toNumber)` (~789).
3. **No** importer / pairing / analytics change. The existing **FFT Width Breakdown** (FFT-WIDTH-1) already handles gated arms correctly.
4. *Optional polish:* a small "FFT gated ≥ Xp" badge near the FFT Effect header and a line in `RunConfigStrip` so the arm is identifiable at a glance.

If the arms are launched via the frontend's run-starter (rather than backend CLI), the run-config builder also needs to pass the new key — but the registry/translator entries above already feed that path.

---

## 7. Minimal implementation plan

**Backend (Lux-OB-Backtester — not editable from this session):**
1. Add config param `triggered_edge_fft_min_ob_width_pips: float = 0.0` to the run-config dataclass/schema.
2. At the FFT cancel site (beside the existing `move_away_pips` / `move_away_ob_multiple` guards), add: cancel only if `ob_width_pips >= triggered_edge_fft_min_ob_width_pips`. Width is already in scope there.
3. Write the param through to `summary.json.config` so it round-trips to the UI.
4. Confirm the control generator disables FFT before the width check (control unaffected by the gate).
5. Regression guard: with the param `=0`, outputs must be byte-identical to a non-gated run.

**Frontend (this repo):** items 1–2 from §6 (registry + translator). Optional §6.4 polish.

**Experiment:** run A/B/C/D with identical config except the FFT flag/gate; import each as a separate run; compare net R and width breakdowns. (Reminder: 2022-05→2024-05 is out-of-sample vs Run 17 — the whole point of FFT-WIDTH-2.)

**Effort estimate:** backend ≈ a few lines at one decision site + config plumbing; frontend ≈ 2 small files (one registry entry, three translator lines). The dominant cost is backend verification + running the four backtests, not code.

---

## 8. No code changes were made. Recommendation

The experiment is **feasible with a small, low-risk change**, because the backend already conditions the FFT cancel on numeric guards and already uses OB width in that branch. The cleanest path is a new FFT-specific param `triggered_edge_fft_min_ob_width_pips` (default 0 = today's behaviour), a one-site backend guard, and two small frontend config-contract edits for display. Auto-control and CSV import need no structural change. Before building, confirm the three **[confirm in backend]** points against the Python source.
