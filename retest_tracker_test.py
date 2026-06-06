"""
retest_tracker_test.py — Verification tests for retest_tracker.py
================================================================
Pure stdlib. Run with:
    python retest_tracker_test.py

Mirrors ghost_tracker_test.py style. Ports the validated frontend scenarios from
frontend/src/data/__validation__/obRetest.logictest.cjs.

Tests cover:
    1. Bull OB — survived (window completes, no breach, reaction met)
    2. Bull OB — failed (close below distal within window)
    3. Bull OB — open (reaction window extends past available candles)
    4. Bull OB — debounce (slow grind inside zone = exactly 1 retest)
    5. Bear OB — survived (mirror, direction sign preserved)
    6. Bear OB — failed (mirror)
    7. Bear OB — open (mirror)
    8. Invariant: survived + failed + open == total_retests (every scenario)
    9. Rates exclude open retests (open scenario -> survival/failure rate 0)
   10. reaction_met is INDEPENDENT of survived (high threshold -> survived but not met)
   11. first_touch_time and first_fill_time stay SEPARATE (not conflated)
   12. summary_fields() exposes additive ob_retest_* keys; CSV writers run
"""

import os
import sys
import tempfile

sys.path.insert(0, ".")
from retest_tracker import (
    compute_ob_retests,
    summary_fields,
    write_ob_retests_csv,
    write_ob_retest_summary_csv,
)

T0 = 1_700_000_000  # epoch seconds


def mk(i, o, h, l, c):
    return {"time": T0 + i * 60, "open": o, "high": h, "low": l, "close": c}


def bull_ob(ob_id="1", **extra):
    d = {"ob_id": ob_id, "direction": "bullish", "structure_tag": "BOS",
         "top": 1.1000, "bottom": 1.0990, "detection_time": T0}
    d.update(extra)
    return d


def bear_ob(ob_id="2", **extra):
    d = {"ob_id": ob_id, "direction": "bearish", "structure_tag": "CHoCH",
         "top": 1.1010, "bottom": 1.1000, "detection_time": T0}
    d.update(extra)
    return d


PASS = 0
FAIL = 0


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  ✓  {name}")
        PASS += 1
    else:
        print(f"  ✗  {name}  {detail}")
        FAIL += 1


def run(ob, candles, trades=None, config=None):
    res = compute_ob_retests([ob], candles, trades=trades, config=config)
    s = res["summary"]
    # universal invariant in every scenario
    check(f"invariant survived+failed+open == total ({s['survived']}+{s['failed']}+{s['open']}=={s['total_retests']})",
          s["survived"] + s["failed"] + s["open"] == s["total_retests"])
    return res


# ── Test 1: Bull survived ─────────────────────────────────────────────────────────
print("\nTest 1 — Bull OB survived")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),  # first touch
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),  # leaves (low > top) -> armed
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),  # retest entry
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),  # reaction +9 pips above top
]
for i in range(4, 13):
    c.append(mk(i, 1.1010, 1.1013, 1.1006, 1.1011))  # stay above, no breach
r1 = run(bull_ob(), c)
e1 = r1["events"][0] if r1["events"] else None
check("exactly 1 retest", r1["summary"]["total_retests"] == 1)
check("outcome survived", e1 and e1["outcome"] == "survived", e1 and e1["outcome"])
check("direction bullish", e1 and e1["direction"] == "bullish")
check("reaction_met True", e1 and e1["reaction_met"] is True, e1 and str(e1["reaction_max_pips"]))
check("survival_rate == 1.0", r1["summary"]["survival_rate"] == 1.0)


# ── Test 2: Bull failed ───────────────────────────────────────────────────────────
print("\nTest 2 — Bull OB failed")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.0995, 1.0998, 1.0980, 1.0985),  # close 1.0985 < bot 1.0990 -> breach
    mk(4, 1.0984, 1.0986, 1.0975, 1.0978),
    mk(5, 1.0978, 1.0980, 1.0970, 1.0974),
]
r2 = run(bull_ob(), c)
e2 = r2["events"][0] if r2["events"] else None
check("outcome failed", e2 and e2["outcome"] == "failed", e2 and e2["outcome"])
check("failure_mode close_breach", e2 and e2["failure_mode"] == "close_breach")
check("candles_to_failure == 1", e2 and e2["candles_to_failure"] == 1, e2 and str(e2["candles_to_failure"]))
check("failure_rate == 1.0", r2["summary"]["failure_rate"] == 1.0)


# ── Test 3: Bull open ─────────────────────────────────────────────────────────────
print("\nTest 3 — Bull OB open (right-censored)")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),  # retest; window would need candle 12
    mk(3, 1.1000, 1.1003, 1.0996, 1.0998),
    mk(4, 1.0999, 1.1002, 1.0995, 1.0997),
    mk(5, 1.0998, 1.1001, 1.0994, 1.0996),
]
r3 = run(bull_ob(), c)
e3 = r3["events"][0] if r3["events"] else None
check("outcome open", e3 and e3["outcome"] == "open", e3 and e3["outcome"])
check("open excluded from rates (survival 0, failure 0)",
      r3["summary"]["survival_rate"] == 0.0 and r3["summary"]["failure_rate"] == 0.0)


# ── Test 4: Bull debounce ─────────────────────────────────────────────────────────
print("\nTest 4 — Bull OB debounce (slow grind = 1 retest)")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),  # retest entry (k=1)
    mk(3, 1.1001, 1.1003, 1.0997, 1.0999),  # window (reaction_window_candles=2)
    mk(4, 1.0999, 1.1002, 1.0996, 1.0998),  # window end -> survived
]
for i in range(5, 10):
    c.append(mk(i, 1.0998, 1.1001, 1.0995, 1.0997))  # grind inside, never leaves/breaches
r4 = run(bull_ob(), c, config={"reaction_window_candles": 2})
check("grind inside = exactly 1 retest", r4["summary"]["total_retests"] == 1, str(r4["summary"]["total_retests"]))
check("that retest survived", r4["events"] and r4["events"][0]["outcome"] == "survived")


# ── Test 5: Bear survived ─────────────────────────────────────────────────────────
print("\nTest 5 — Bear OB survived (mirror)")
c = [
    mk(0, 1.1005, 1.1005, 1.0998, 1.1002),  # first touch (high into zone)
    mk(1, 1.0996, 1.0997, 1.0990, 1.0994),  # leave (high < bot) -> armed
    mk(2, 1.1001, 1.1004, 1.0999, 1.1001),  # retest entry
    mk(3, 1.0996, 1.0999, 1.0991, 1.0993),  # reaction -9 pips below bottom
]
for i in range(4, 13):
    c.append(mk(i, 1.0990, 1.0996, 1.0988, 1.0990))
r5 = run(bear_ob(), c)
e5 = r5["events"][0] if r5["events"] else None
check("outcome survived", e5 and e5["outcome"] == "survived", e5 and e5["outcome"])
check("direction bearish", e5 and e5["direction"] == "bearish")
check("reaction_met True", e5 and e5["reaction_met"] is True, e5 and str(e5["reaction_max_pips"]))


# ── Test 6: Bear failed ───────────────────────────────────────────────────────────
print("\nTest 6 — Bear OB failed (mirror)")
c = [
    mk(0, 1.1005, 1.1005, 1.0998, 1.1002),
    mk(1, 1.0996, 1.0997, 1.0990, 1.0994),
    mk(2, 1.1001, 1.1004, 1.0999, 1.1001),
    mk(3, 1.1012, 1.1020, 1.1008, 1.1015),  # close 1.1015 > top 1.1010 -> breach
    mk(4, 1.1016, 1.1025, 1.1012, 1.1020),
]
r6 = run(bear_ob(), c)
e6 = r6["events"][0] if r6["events"] else None
check("outcome failed", e6 and e6["outcome"] == "failed", e6 and e6["outcome"])
check("candles_to_failure == 1", e6 and e6["candles_to_failure"] == 1, e6 and str(e6["candles_to_failure"]))


# ── Test 7: Bear open ─────────────────────────────────────────────────────────────
print("\nTest 7 — Bear OB open (mirror)")
c = [
    mk(0, 1.1005, 1.1005, 1.0998, 1.1002),
    mk(1, 1.0996, 1.0997, 1.0990, 1.0994),
    mk(2, 1.1001, 1.1004, 1.0999, 1.1001),
    mk(3, 1.1002, 1.1005, 1.0999, 1.1003),
    mk(4, 1.1003, 1.1006, 1.0999, 1.1004),
]
r7 = run(bear_ob(), c)
check("outcome open", r7["events"] and r7["events"][0]["outcome"] == "open",
      r7["events"] and r7["events"][0]["outcome"])


# ── Test 10: reaction_met independent of survived ─────────────────────────────────
print("\nTest 10 — reaction_met is independent of survived")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
]
for i in range(4, 13):
    c.append(mk(i, 1.1010, 1.1013, 1.1006, 1.1011))
r10 = compute_ob_retests([bull_ob()], c, config={"reaction_min_pips": 50.0})
e10 = r10["events"][0] if r10["events"] else None
check("survived despite reaction below threshold", e10 and e10["outcome"] == "survived", e10 and e10["outcome"])
check("reaction_met False (50-pip threshold not met)", e10 and e10["reaction_met"] is False,
      e10 and str(e10["reaction_max_pips"]))


# ── Test 11: first_touch_time vs first_fill_time separate ─────────────────────────
print("\nTest 11 — first_touch_time and first_fill_time stay separate")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
]
for i in range(4, 13):
    c.append(mk(i, 1.1010, 1.1013, 1.1006, 1.1011))
trade = {"ob_id": "1", "fill_time": T0 + 30, "outcome": "Win"}  # fill 30s after detection, != first touch
r11 = compute_ob_retests([bull_ob()], c, trades=[trade])
e11 = r11["events"][0] if r11["events"] else None
check("first_touch_time == candle-0 time (raw touch)", e11 and e11["first_touch_time"] == T0,
      e11 and str(e11["first_touch_time"]))
check("first_fill_time == trade fill_time (annotation)", e11 and e11["first_fill_time"] == T0 + 30,
      e11 and str(e11["first_fill_time"]))
check("first_touch_time != first_fill_time (not conflated)",
      e11 and e11["first_touch_time"] != e11["first_fill_time"])
check("first_touch_was_traded True", e11 and e11["first_touch_was_traded"] is True)
check("first_touch_outcome from trade ('win')", e11 and e11["first_touch_outcome"] == "win",
      e11 and e11["first_touch_outcome"])


# ── Test 12: summary_fields + CSV writers ─────────────────────────────────────────
print("\nTest 12 — summary_fields() keys + CSV writers run")
sf = summary_fields(r1)
for key in ("ob_retest_total", "ob_with_retest_count", "retest_rate", "retest_survival_rate",
            "retest_failure_rate", "retest_open_count", "avg_reaction_pips_on_retest",
            "avg_candles_to_failure"):
    check(f"summary_fields has '{key}'", key in sf)
check("ob_retest_total == total_retests", sf["ob_retest_total"] == r1["summary"]["total_retests"])
with tempfile.TemporaryDirectory() as d:
    p1 = write_ob_retests_csv(r1, d)
    p2 = write_ob_retest_summary_csv(r1, d)
    check("ob_retests.csv written + non-empty", os.path.exists(p1) and os.path.getsize(p1) > 0)
    check("ob_retest_summary.csv written + non-empty", os.path.exists(p2) and os.path.getsize(p2) > 0)
    with open(p1) as fh:
        header = fh.readline().strip()
    check("ob_retests.csv header has first_touch_time & first_fill_time (separate)",
          "first_touch_time" in header and "first_fill_time" in header)


# ── Summary ───────────────────────────────────────────────────────────────────────
print(f"\n{'=' * 52}")
print(f"Results: {PASS} passed, {FAIL} failed")
if FAIL == 0:
    print("ALL TESTS PASSED ✓")
else:
    print(f"FAILURES: {FAIL}")
    sys.exit(1)
