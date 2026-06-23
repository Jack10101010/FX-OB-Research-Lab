# Commit Plan — Separate Engine Fix vs Research Flags

**Repo:** Lux-OB-Backtester. **Audit + plan only — nothing edited, staged, committed, or pushed.**

---

## 0. Headline (read first)

- **Commit A (engine correctness fix) is ALREADY DONE.** `HEAD = dba2bb8 "fix(execution): require true
  post-arm touch for delayed entries"` already contains the `low ≤ entry ≤ high` fix **and**
  `tests/test_delayed_te_fill.py` (confirmed: `git ls-files` tracks it; `git show --stat dba2bb8` lists both
  files, +184). **No A commit to make.** If you expected A to be uncommitted, it isn't.
- So the working tree's `src/execution.py` diff (+92/−1) is **only flags B and C**, and there are **two**
  commits to make, not three.
- **B and C are logically independent but physically interleaved** in the same hunks. Plain
  `git add src/execution.py` cannot separate them; one of the two commits needs `git add -p` with a manual
  hunk edit. Details below.

---

## 1. What's in the working tree

```
 M data/candles/EURUSD_manifest.json   <- data artifact, UNRELATED → leave unstaged
 M data/candles/GBPUSD_manifest.json   <- data artifact, UNRELATED → leave unstaged
 M sidecar/server.py                   <- earlier task (OHLC aggregation), UNRELATED → leave unstaged
 M src/execution.py                    <- flags B + C interleaved  (the only file to commit here)
?? tests/test_cancel_exit_before_arm.py   <- commit with B
?? tests/test_confirmed_revisit.py         <- commit with C
?? outputs/sweeps/cr_run2y.py              <- SCRATCH, do NOT commit
?? outputs/sweeps/confirmed_revisit_ab.py  <- SCRATCH, do NOT commit
?? outputs/sweeps/_aggregate.py, _sweep_harness.py, bell_curve/, extended_curve/  <- pre-existing scratch, leave
?? MULTI-RUN-ARCHITECTURE-AUDIT.md, .claude/, configs/  <- pre-existing/unrelated, leave
```
(The research report `.md` files live in the **FX-OB-Research-Lab** repo, not here, so they don't appear in
this repo's status — nothing to exclude on that account.)

---

## 2. The `src/execution.py` diff — 4 hunks, mapped to B / C

| Hunk | Location | Belongs to | Separable by `git add -p`? |
|---|---|---|---|
| **1** `@@ -1788` | signature: two new kwargs | **B**: `…cancel_if_exits_ob_before_arm` (4 lines) · **C**: `…require_revisit_confirmation` (7 lines) | **MIXED** — all-additions, no interior context ⇒ **not auto-splittable; needs `e` (edit)** |
| **2** `@@ -1940` | pending-item dict | **B**: `"cancel_if_exits_ob_before_arm"` (1 line) · **C**: confirm state (10 lines) | **MIXED** — needs `e` |
| **3** `@@ -2097` | the two opt-in blocks | **B**: cancel block (`…EXITED_OB_BEFORE_ARM` … `continue`) · **C**: confirmation state machine | **MIXED** — two contiguous all-addition blocks ⇒ needs `e` |
| **4** `@@ -2141` | main fill condition | **C only**: appends `… and (not require_revisit_confirmation or revisit_confirmed)` | **CLEAN** — wholesale `y`/`n` |

**Independence check (committed-snapshot level):**
- **B alone compiles and is self-contained.** The cancel block references only `cancel_if_exits_ob_before_arm`,
  `_dw`, `trigger_candle_index`, `trigger_delay_candles`, and existing helpers. It does **not** reference any
  confirmation symbol.
- **C alone compiles and is self-contained.** The confirmation block + fill-gate reference only
  `require_revisit_confirmation`, `revisit_*`, `_cr_*`, `_dw_entry_side_exit`, and existing vars. It does
  **not** reference any cancel symbol.
- **No shared edited line.** The only modified (non-pure-addition) line is the fill condition (hunk 4) — and
  that belongs **entirely to C**. B adds nothing to it. So there is **no line both commits must touch** →
  separation is safe in principle; the only difficulty is mechanical (interleaved additions).

**Risk flags:**
- Hunks 1, 2, 3 are **all-addition with no interior unchanged line**, so `git add -p` shows each as one
  block and will **not** auto-split B from C. You must use `e` and delete the other flag's `+` lines from the
  edit buffer.
- Committing a partial file via the index means the **committed snapshot ≠ working tree** (which still holds
  both flags). Validating the *working tree* alone does **not** prove the B-only commit compiles. Use
  `git stash --keep-index` (below) to validate the actual staged snapshot.

---

## 3. Recommended sequence — B first, then C

### Pre-flight
```
cd Lux-OB-Backtester
git status
git log --oneline -1        # expect dba2bb8 (engine fix already here)
python -m py_compile src/execution.py
```

### Commit B — cancel-before-arm research flag
1. Stage **only** B's lines from `execution.py`:
   ```
   git add -p src/execution.py
   ```
   - **Hunk 1** (signature) → `e`; in the buffer **delete the 7 C lines** (the
     `# RESEARCH … Confirmed Revisit …` comment block + `triggered_edge_require_revisit_confirmation=False,`),
     keep the 4 cancel lines. Save.
   - **Hunk 2** (item dict) → `e`; **delete the 10 C lines** (the `# Confirmed Revisit … per-order state`
     comment + the 7 `revisit_*` / `require_revisit_confirmation` fields), keep the single
     `"cancel_if_exits_ob_before_arm": …` line. Save.
   - **Hunk 3** (blocks) → `e`; **delete the C confirmation block** (from
     `# RESEARCH (opt-in): Confirmed Revisit (Variant A) state machine.` through
     `item["revisit_confirm_candle_index"] = candle_index`), keep the cancel block (through `continue`). Save.
   - **Hunk 4** (fill gate) → `n` (C-only; do not stage).
2. Stage B's test and confirm the staged set:
   ```
   git add tests/test_cancel_exit_before_arm.py
   git diff --cached --stat        # expect: src/execution.py + tests/test_cancel_exit_before_arm.py only
   git diff --cached src/execution.py | grep -i revisit   # MUST be empty (no C leaked in)
   ```
3. **Validate the staged snapshot** (stash the unstaged C lines, keep index):
   ```
   git stash push --keep-index -m cBC
   python -m py_compile src/execution.py
   python tests/test_cancel_exit_before_arm.py     # expect 7 passed
   python tests/test_delayed_te_fill.py            # expect 10 passed (regression)
   git stash pop
   ```
4. Commit:
   ```
   git commit -m "feat(execution): add opt-in triggered_edge_cancel_if_exits_ob_before_arm research flag (default off)"
   ```

### Commit C — Confirmed Revisit (Variant A) research flag
All remaining `execution.py` changes are now exactly C.
1. Stage the remainder + C's test:
   ```
   git add src/execution.py tests/test_confirmed_revisit.py
   git diff --cached --stat
   git diff --cached src/execution.py | grep -i cancel_if_exits   # MUST be empty (B already committed)
   ```
2. **Validate** the full post-C tree:
   ```
   python -m py_compile src/execution.py
   python tests/test_confirmed_revisit.py          # expect 14 passed
   python tests/test_cancel_exit_before_arm.py     # expect 7 passed
   python tests/test_delayed_te_fill.py            # expect 10 passed
   python tests/test_be_replay.py                  # expect 74 passed
   python src/retest_tracker_test.py               # expect 178 passed
   ```
3. Commit:
   ```
   git commit -m "feat(execution): add opt-in triggered_edge_require_revisit_confirmation (Confirmed Revisit Variant A, default off)"
   ```

### Final check
```
git status                 # M sidecar/server.py + data manifests + scratch should REMAIN (unstaged/untracked)
git log --oneline -3       # dba2bb8 (A) → B → C
```
**Do not** `git add` `sidecar/server.py`, the data manifests, or anything under `outputs/sweeps/`.
**Do not** `git push`.

---

## 4. Files NOT to commit (confirmed)

- **Scratch (this task):** `outputs/sweeps/cr_run2y.py`, `outputs/sweeps/confirmed_revisit_ab.py`,
  and `/tmp/cr_*` artifacts. Optionally delete them: `rm outputs/sweeps/cr_run2y.py
  outputs/sweeps/confirmed_revisit_ab.py`.
- **Pre-existing / unrelated, leave as-is:** `sidecar/server.py` (earlier OHLC-aggregation task — **unrelated
  to these flags, keep unstaged**), `data/candles/EURUSD_manifest.json` &
  `data/candles/GBPUSD_manifest.json` (data regeneration artifacts — **unrelated, keep unstaged**),
  `outputs/sweeps/_aggregate.py`, `_sweep_harness.py`, `bell_curve/`, `extended_curve/`, `rr_sweep.csv`,
  `MULTI-RUN-ARCHITECTURE-AUDIT.md`, `.claude/`, `configs/`.

---

## 5. Alternatives if patch-editing feels risky

- **Reverse order (C then B):** stage C with `git add -p` editing out B's lines (and take hunk 4 with `y`),
  commit C; then `git add src/execution.py tests/test_cancel_exit_before_arm.py` for B. Symmetric; same
  number of edits. B-first is recommended only because B is the simpler/earlier change.
- **Single combined commit (fallback, NOT recommended — you asked for separation):**
  `git add src/execution.py tests/test_cancel_exit_before_arm.py tests/test_confirmed_revisit.py` then one
  commit `feat(execution): opt-in cancel-before-arm and Confirmed Revisit research flags (default off)`.
  Use only if the `git add -p` edit is impractical.

---

## 6. Summary

| Commit | Status | Files | Notes |
|---|---|---|---|
| **A** engine fix | **already at HEAD (dba2bb8)** | src/execution.py, tests/test_delayed_te_fill.py | no action |
| **B** cancel-before-arm | to make | src/execution.py (partial via `git add -p` edit), tests/test_cancel_exit_before_arm.py | self-contained; hunks 1–3 partial, hunk 4 excluded |
| **C** Confirmed Revisit | to make | src/execution.py (remainder), tests/test_confirmed_revisit.py | owns hunk 4 (fill gate) |

No shared edited line between B and C; the only mechanical hurdle is the three interleaved all-addition
hunks, handled by `git add -p` + `e`. Validate each staged snapshot with `git stash --keep-index` before
committing. Keep `sidecar/server.py`, data manifests, and `outputs/sweeps/` scratch out of both commits.

*Plan only. Nothing staged, committed, or pushed.*
