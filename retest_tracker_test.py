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


# ════════════════════════════════════════════════════════════════════════════════
# ENGINE v2 — CONTINUOUS INVALIDATION (fixtures mirror obRetest.logictest.cjs V2-*)
# ════════════════════════════════════════════════════════════════════════════════

# ── Test V2-A: INSIDE breach after a held window (zombie prevention) ───────────────
print("\nTest V2-A — between-window breach after held window (no zombie retest)")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),   # first touch
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),   # leave -> armed
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),   # retest 1 entry
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),   # reaction up (window)
    mk(4, 1.1008, 1.1010, 1.1005, 1.1009),   # window end (2) -> survived
    mk(5, 1.0992, 1.0993, 1.0980, 1.0985),   # INSIDE: intersects, close < bot -> BREACH
    mk(6, 1.0986, 1.0995, 1.0984, 1.0993),   # zombie bait: re-enters dead zone
    mk(7, 1.0994, 1.0999, 1.0992, 1.0996),
    mk(8, 1.0995, 1.0998, 1.0992, 1.0995),
    mk(9, 1.0996, 1.0999, 1.0993, 1.0997),
    mk(10, 1.0995, 1.0998, 1.0992, 1.0996),
]
rA = run(bull_ob(), c, config={"reaction_window_candles": 2})
pA = rA["per_ob"]["1"]
check("previous survived event preserved", len(rA["events"]) == 1 and rA["events"][0]["outcome"] == "survived")
check("NO zombie retest counted (total 1)", rA["summary"]["total_retests"] == 1, str(rA["summary"]["total_retests"]))
check("final_outcome invalidated_between_windows", pA["final_outcome"] == "invalidated_between_windows", str(pA["final_outcome"]))
check("invalidated_after_retest_index 1", pA["invalidated_after_retest_index"] == 1)
check("invalidated_at_candle_index 5", pA["invalidated_at_candle_index"] == 5)
check("invalidated_at_time == candle-5 time", pA["invalidated_at_time"] == T0 + 5 * 60)
check("invalidation_mode close_breach", pA["invalidation_mode"] == "close_breach", str(pA["invalidation_mode"]))
check("time_to_invalidation_minutes 5", pA["time_to_invalidation_minutes"] == 5, str(pA["time_to_invalidation_minutes"]))
check("legacy invalidated_on_retest_index stays None", pA["invalidated_on_retest_index"] is None)
olA = rA["summary"]["ob_level"]
check("ob_level present", olA is not None)
check("ob_level eventual_failure_rate 1.0, delayed count/share 1", olA and olA["eventual_failure_rate"] == 1.0
      and olA["delayed_failure_count"] == 1 and olA["delayed_failure_share"] == 1.0)
check("ob_level median_time_to_invalidation_minutes 5", olA and olA["median_time_to_invalidation_minutes"] == 5)
check("meta engine_version 2 + semantics", rA["meta"]["engine_version"] == 2
      and rA["meta"]["semantics"] == "continuous_invalidation")

# ── Test V2-B: INSIDE breach before the first retest ───────────────────────────────
print("\nTest V2-B — breach before first retest (zero events)")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),   # first touch
    mk(1, 1.0995, 1.0996, 1.0982, 1.0985),   # INSIDE: intersects, close < bot -> BREACH
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),   # zombie bait re-entry
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
]
rB = run(bull_ob(), c)
pB = rB["per_ob"]["1"]
check("zero events", rB["summary"]["total_retests"] == 0)
check("final_outcome invalidated_between_windows", pB["final_outcome"] == "invalidated_between_windows", str(pB["final_outcome"]))
check("invalidated_after_retest_index 0", pB["invalidated_after_retest_index"] == 0)
check("time_to_invalidation_minutes 1", pB["time_to_invalidation_minutes"] == 1)

# ── Test V2-C: ARMED gap-breach (no intersect, no event) ───────────────────────────
print("\nTest V2-C — armed gap-breach")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),   # first touch
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),   # leave -> armed
    mk(2, 1.0985, 1.0989, 1.0980, 1.0982),   # gap below zone: no intersect, close < bot -> BREACH
    mk(3, 1.1001, 1.1004, 1.0996, 1.1001),   # zombie bait
]
rC = run(bull_ob(), c)
pC = rC["per_ob"]["1"]
check("zero events (gap breach is not a retest)", rC["summary"]["total_retests"] == 0)
check("final_outcome invalidated_between_windows", pC["final_outcome"] == "invalidated_between_windows", str(pC["final_outcome"]))
check("invalidated_at_candle_index 2", pC["invalidated_at_candle_index"] == 2)

# ── Test V2-D: ARMED ordering — re-entry that closes beyond stays a failed event ───
print("\nTest V2-D — armed re-entry instant fail (ordering guard)")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.0995, 1.0998, 1.0985, 1.0985),   # re-enters (h >= bot) AND closes < bot
    mk(3, 1.0984, 1.0986, 1.0975, 1.0978),
]
rD = run(bull_ob(), c)
eD = rD["events"][0] if rD["events"] else None
pD = rD["per_ob"]["1"]
check("exactly 1 failed event", rD["summary"]["total_retests"] == 1 and eD and eD["outcome"] == "failed")
check("candles_to_failure 0 (entry candle)", eD and eD["candles_to_failure"] == 0)
check("final_outcome invalidated_in_window (not between_windows)", pD["final_outcome"] == "invalidated_in_window", str(pD["final_outcome"]))
check("invalidated_after_retest_index 1 (the failing k)", pD["invalidated_after_retest_index"] == 1)
check("legacy invalidated_on_retest_index 1", pD["invalidated_on_retest_index"] == 1)

# ── Test V2-E/F/G: first-touch breach · never touched · alive at data end ──────────
print("\nTest V2-E/F/G — terminal statuses")
rE = run(bull_ob(), [mk(0, 1.0995, 1.0998, 1.0985, 1.0985), mk(1, 1.0984, 1.0986, 1.0975, 1.0978)])
pE = rE["per_ob"]["1"]
check("E: final_outcome invalidated_on_first_touch", pE["final_outcome"] == "invalidated_on_first_touch", str(pE["final_outcome"]))
check("E: legacy invalidated_on_retest_index 0", pE["invalidated_on_retest_index"] == 0)
check("E: time_to_invalidation_minutes 0", pE["time_to_invalidation_minutes"] == 0)
rF = run(bull_ob(), [mk(0, 1.1006, 1.1010, 1.1003, 1.1008), mk(1, 1.1007, 1.1011, 1.1004, 1.1009)])
check("F: final_outcome never_touched", rF["per_ob"]["1"]["final_outcome"] == "never_touched", str(rF["per_ob"]["1"]["final_outcome"]))
check("F: no invalidation fields", rF["per_ob"]["1"]["invalidated_at_time"] is None and rF["per_ob"]["1"]["invalidation_mode"] is None)
pG = r1["per_ob"]["1"]  # Test-1 survived run, recomputed under v2
check("G: survived-to-end OB is alive_at_data_end", pG["final_outcome"] == "alive_at_data_end", str(pG["final_outcome"]))
check("G: ob_level eventual_failure_rate 0, censored 1", r1["summary"]["ob_level"]["eventual_failure_rate"] == 0.0
      and r1["summary"]["ob_level"]["obs_alive_at_data_end"] == 1)

# ── Test V2-H: cap ─────────────────────────────────────────────────────────────────
print("\nTest V2-H — capped")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
    mk(4, 1.1008, 1.1010, 1.1005, 1.1009),
    mk(5, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(6, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(7, 1.1004, 1.1009, 1.1001, 1.1007),
]
rH = run(bull_ob(), c, config={"reaction_window_candles": 2, "max_retests_per_ob": 1})
check("exactly 1 retest (cap respected)", rH["summary"]["total_retests"] == 1)
check("final_outcome capped", rH["per_ob"]["1"]["final_outcome"] == "capped", str(rH["per_ob"]["1"]["final_outcome"]))

# ── Test V2-I: bear mirror between-window breach ───────────────────────────────────
print("\nTest V2-I — bear between-window breach")
c = [
    mk(0, 1.1005, 1.1005, 1.0998, 1.1002),
    mk(1, 1.0996, 1.0997, 1.0990, 1.0994),
    mk(2, 1.1001, 1.1004, 1.0999, 1.1001),
    mk(3, 1.0996, 1.0999, 1.0991, 1.0993),
    mk(4, 1.0994, 1.0998, 1.0990, 1.0992),
    mk(5, 1.1008, 1.1020, 1.1005, 1.1015),   # close 1.1015 > top 1.1010 -> BREACH
    mk(6, 1.1009, 1.1012, 1.1002, 1.1005),   # zombie bait
]
rI = run(bear_ob(), c, config={"reaction_window_candles": 2})
pI = rI["per_ob"]["2"]
check("1 survived event, no zombie", rI["summary"]["total_retests"] == 1 and rI["events"][0]["outcome"] == "survived")
check("final_outcome invalidated_between_windows", pI["final_outcome"] == "invalidated_between_windows", str(pI["final_outcome"]))
check("invalidated_at_candle_index 5", pI["invalidated_at_candle_index"] == 5)

# ── Test V2-J: wick-threshold variant ──────────────────────────────────────────────
print("\nTest V2-J — wick-mode between-window invalidation")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
    mk(4, 1.1008, 1.1010, 1.1005, 1.1009),
    mk(5, 1.0998, 1.0999, 1.0985, 1.0995),   # wick 1.0985 < bot, close back inside
    mk(6, 1.0996, 1.0999, 1.0993, 1.0997),
]
rJc = run(bull_ob(), c, config={"reaction_window_candles": 2})
check("close-mode ignores the wick (alive_at_data_end)", rJc["per_ob"]["1"]["final_outcome"] == "alive_at_data_end",
      str(rJc["per_ob"]["1"]["final_outcome"]))
rJw = run(bull_ob(), c, config={"reaction_window_candles": 2, "failure_threshold": "wick_beyond_ob"})
pJ = rJw["per_ob"]["1"]
check("wick-mode invalidates between windows", pJ["final_outcome"] == "invalidated_between_windows", str(pJ["final_outcome"]))
check("invalidation_mode wick_breach", pJ["invalidation_mode"] == "wick_breach", str(pJ["invalidation_mode"]))

# ── Test V2-K: summary CSV columns + summary_fields v2 keys ────────────────────────
print("\nTest V2-K — v2 artifact columns + summary_fields keys")
sfA = summary_fields(rA)
check("summary_fields retest_engine_version == 2", sfA["retest_engine_version"] == 2)
for key in ("retest_obs_invalidated", "retest_obs_invalidated_between_windows",
            "retest_obs_invalidated_in_window", "retest_obs_invalidated_on_first_touch",
            "retest_obs_alive_at_data_end", "retest_eventual_failure_rate",
            "retest_delayed_failure_count", "retest_delayed_failure_share",
            "retest_median_time_to_invalidation_minutes"):
    check(f"summary_fields has '{key}'", key in sfA)
check("summary_fields eventual failure 1.0 / delayed 1", sfA["retest_eventual_failure_rate"] == 1.0
      and sfA["retest_delayed_failure_count"] == 1)
with tempfile.TemporaryDirectory() as d:
    p2 = write_ob_retest_summary_csv(rA, d)
    with open(p2) as fh:
        header2 = fh.readline().strip()
        row2 = fh.readline().strip()
    for col_name in ("final_outcome", "invalidated_at_time", "invalidated_at_candle_index",
                     "invalidation_mode", "invalidated_after_retest_index", "time_to_invalidation_minutes"):
        check(f"ob_retest_summary.csv header has '{col_name}' (v2 fingerprint)", col_name in header2)
    check("summary row carries invalidated_between_windows", "invalidated_between_windows" in row2)
    p1 = write_ob_retests_csv(rA, d)
    with open(p1) as fh:
        header1 = fh.readline().strip()
    check("ob_retests.csv event columns UNCHANGED (no invalidation columns)",
          "invalidation_mode" not in header1 and "final_outcome" not in header1)

# ════════════════════════════════════════════════════════════════════════════════
# ENGINE v2.1 — KILL MARGIN · CONFIRM-TF · RE-HELD · MFE FAMILY
# (fixtures mirror obRetest.logictest.cjs V21-*)
# ════════════════════════════════════════════════════════════════════════════════

# ── Test V21-A: canonical combined fixture (JS↔Python parity fixture) ──────────────
print("\nTest V21-A — combined: margin, unconfirmed kill, re-held, MFE family")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),   # ft               fav 5
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),   # leave -> armed   fav 10
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),   # R1 entry         fav 4
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),   # window           fav 9
    mk(4, 1.1008, 1.1012, 1.1005, 1.1009),   # window end -> survived  fav 12
    mk(5, 1.0992, 1.0993, 1.0980, 1.0985),   # INSIDE close-breach -> KILL (margin 5.0)
    mk(6, 1.0986, 1.0998, 1.0984, 1.0993),   # close inside -> re-held
    mk(7, 1.0994, 1.1025, 1.0992, 1.0996),   # post-death +25p spike — ignored
]
for i in range(8, 15):
    c.append(mk(i, 1.0994, 1.0997, 1.0992, 1.0995))  # 15m bucket closes inside
rA21 = run(bull_ob(), c, config={"reaction_window_candles": 2})
pA21 = rA21["per_ob"]["1"]
check("1 survived event, between-window kill",
      rA21["summary"]["total_retests"] == 1 and pA21["final_outcome"] == "invalidated_between_windows")
check("kill_margin_pips 5 (bull close-beyond)", pA21["kill_margin_pips"] == 5, str(pA21["kill_margin_pips"]))
check("kill_confirmed_tf False (bucket closes back inside)", pA21["kill_confirmed_tf"] is False, str(pA21["kill_confirmed_tf"]))
check("reheld_after_kill True", pA21["reheld_after_kill"] is True)
check("mfe_before_death_pips 12 (post-death spike ignored)", pA21["mfe_before_death_pips"] == 12, str(pA21["mfe_before_death_pips"]))
check("mfe_after_r1_pips 12", pA21["mfe_after_r1_pips"] == 12)
check("missing R2/R3 anchors -> None", pA21["mfe_after_r2_pips"] is None and pA21["mfe_after_r3_pips"] is None)
check("meta schema_version 2.1, engine_version 2",
      rA21["meta"]["schema_version"] == "2.1" and rA21["meta"]["engine_version"] == 2)
olA21 = rA21["summary"]["ob_level"]
check("ob_level confirmed share 0.0, reheld share 1.0, median margin 5",
      olA21 and olA21["kill_confirmed_share"] == 0.0 and olA21["reheld_after_kill_share"] == 1.0
      and olA21["median_kill_margin_pips"] == 5)

# ── Test V21-B: bear in-window instant fail — confirmed kill, never re-held ────────
print("\nTest V21-B — bear margin + confirmed kill")
c = [
    mk(0, 1.1005, 1.1005, 1.0998, 1.1002),   # ft (bear fav = bot - low = 2)
    mk(1, 1.0996, 1.0997, 1.0990, 1.0994),   # leave -> armed  fav 10
    mk(2, 1.1012, 1.1015, 1.1008, 1.1013),   # re-enters AND closes 3p above top -> instant fail
]
for i in range(3, 15):
    c.append(mk(i, 1.1014, 1.1018, 1.1012, 1.1016))  # stays beyond
rB21 = run(bear_ob(), c)
pB21 = rB21["per_ob"]["2"]
check("failed event ctf 0, invalidated_in_window",
      rB21["events"][0]["candles_to_failure"] == 0 and pB21["final_outcome"] == "invalidated_in_window")
check("kill_margin_pips 3 (bear close-beyond)", pB21["kill_margin_pips"] == 3, str(pB21["kill_margin_pips"]))
check("kill_confirmed_tf True (bucket close beyond)", pB21["kill_confirmed_tf"] is True)
check("reheld_after_kill False", pB21["reheld_after_kill"] is False)
check("mfe_before_death_pips 10", pB21["mfe_before_death_pips"] == 10, str(pB21["mfe_before_death_pips"]))
check("mfe_after_r1_pips 0 (entry candle had no favorable move)", pB21["mfe_after_r1_pips"] == 0)

# ── Test V21-C: wick-beyond mode margin uses the wick; confirm stays close-based ───
print("\nTest V21-C — wick-mode kill margin")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.0998, 1.0999, 1.0980, 1.0995),   # wick 10p below bot, close inside -> wick KILL
    mk(2, 1.0996, 1.0998, 1.0993, 1.0995),
    mk(3, 1.0995, 1.0997, 1.0992, 1.0994),
]
rC21 = run(bull_ob(), c, config={"failure_threshold": "wick_beyond_ob"})
pC21 = rC21["per_ob"]["1"]
check("between-window wick kill", pC21["final_outcome"] == "invalidated_between_windows"
      and pC21["invalidation_mode"] == "wick_breach")
check("kill_margin_pips 10 (wick extreme)", pC21["kill_margin_pips"] == 10, str(pC21["kill_margin_pips"]))
check("kill_confirmed_tf False (close-based confirmation)", pC21["kill_confirmed_tf"] is False)

# ── Test V21-D: armed gap-breach + partial final bucket (deterministic) ────────────
print("\nTest V21-D — partial final bucket confirmation")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.0985, 1.0988, 1.0980, 1.0982),   # gap below -> KILL (margin 8.0)
    mk(3, 1.0983, 1.0986, 1.0978, 1.0980),   # still beyond; DATA END mid-bucket
]
rD21 = run(bull_ob(), c)
pD21 = rD21["per_ob"]["1"]
check("zero events, kill_margin_pips 8", rD21["summary"]["total_retests"] == 0 and pD21["kill_margin_pips"] == 8)
check("kill_confirmed_tf True (last available close beyond)", pD21["kill_confirmed_tf"] is True)
check("reheld_after_kill False", pD21["reheld_after_kill"] is False)

# ── Test V21-E: re-held window is time-bounded (60m) ───────────────────────────────
print("\nTest V21-E — re-held deadline")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
    mk(4, 1.1008, 1.1012, 1.1005, 1.1009),
    mk(5, 1.0992, 1.0993, 1.0980, 1.0985),   # KILL at minute 5
]
for i in range(6, 67):
    c.append(mk(i, 1.0985, 1.0987, 1.0982, 1.0984))  # 61m beyond
c.append(mk(67, 1.0993, 1.0996, 1.0992, 1.0995))     # back inside at +62m — too late
rE21 = run(bull_ob(), c, config={"reaction_window_candles": 2})
check("reheld_after_kill False (inside close after deadline)",
      rE21["per_ob"]["1"]["reheld_after_kill"] is False)

# ── Test V21-F: censored OB — MFE to data end; kill fields None ────────────────────
print("\nTest V21-F — censored MFE")
c = [
    mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
    mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
    mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
    mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
]
for i in range(4, 13):
    c.append(mk(i, 1.1010, 1.1013, 1.1006, 1.1011))  # fav 13 to data end
rF21 = run(bull_ob(), c)
pF21 = rF21["per_ob"]["1"]
check("alive_at_data_end", pF21["final_outcome"] == "alive_at_data_end")
check("mfe_before_death_pips 13 (runs to data end)", pF21["mfe_before_death_pips"] == 13)
check("mfe_after_r1_pips 13", pF21["mfe_after_r1_pips"] == 13)
check("kill fields None when never invalidated",
      pF21["kill_margin_pips"] is None and pF21["kill_confirmed_tf"] is None and pF21["reheld_after_kill"] is None)

# ── Test V21-G: R1/R2/R3 anchors (window 1) ────────────────────────────────────────
print("\nTest V21-G — MFE anchors R1/R2/R3")
c = [
    mk(0, 1.0998, 1.1000, 1.0995, 1.0998),   # ft          fav 0
    mk(1, 1.1001, 1.1003, 1.1001, 1.1002),   # out -> armed fav 3
    mk(2, 1.1000, 1.1001, 1.0997, 1.0999),   # R1 entry    fav 1
    mk(3, 1.1002, 1.1006, 1.1001, 1.1004),   # survived    fav 6
    mk(4, 1.1001, 1.1003, 1.1001, 1.1002),   # out -> armed fav 3
    mk(5, 1.1000, 1.1001, 1.0996, 1.0999),   # R2 entry    fav 1
    mk(6, 1.1002, 1.1004, 1.1001, 1.1003),   # survived    fav 4
    mk(7, 1.1001, 1.1003, 1.1001, 1.1002),   # out -> armed fav 3
    mk(8, 1.1000, 1.1001, 1.0995, 1.0998),   # R3 entry    fav 1
    mk(9, 1.1001, 1.1002, 1.1000, 1.1001),   # survived    fav 2
    mk(10, 1.1001, 1.1002, 1.1001, 1.1001),  # data end    fav 2
]
rG21 = run(bull_ob(), c, config={"reaction_window_candles": 1})
pG21 = rG21["per_ob"]["1"]
check("three survived retests", rG21["summary"]["total_retests"] == 3 and rG21["summary"]["survived"] == 3)
check("mfe_before_death_pips 6", pG21["mfe_before_death_pips"] == 6, str(pG21["mfe_before_death_pips"]))
check("mfe_after_r1_pips 6", pG21["mfe_after_r1_pips"] == 6)
check("mfe_after_r2_pips 4", pG21["mfe_after_r2_pips"] == 4, str(pG21["mfe_after_r2_pips"]))
check("mfe_after_r3_pips 2", pG21["mfe_after_r3_pips"] == 2, str(pG21["mfe_after_r3_pips"]))
check("invariant R3 <= R2 <= R1 <= BD",
      pG21["mfe_after_r3_pips"] <= pG21["mfe_after_r2_pips"] <= pG21["mfe_after_r1_pips"] <= pG21["mfe_before_death_pips"])

# ── Test V21-H: artifact columns + summary_fields v2.1 keys ────────────────────────
print("\nTest V21-H — v2.1 schema surfaces")
sf21 = summary_fields(rA21)
check("retest_schema_version == '2.1'", sf21["retest_schema_version"] == "2.1")
check("retest_confirm_timeframe_minutes == 15", sf21["retest_confirm_timeframe_minutes"] == 15)
check("retest_kill_confirmed_share 0.0", sf21["retest_kill_confirmed_share"] == 0.0)
check("retest_reheld_after_kill_share 1.0", sf21["retest_reheld_after_kill_share"] == 1.0)
check("retest_median_kill_margin_pips 5", sf21["retest_median_kill_margin_pips"] == 5)
with tempfile.TemporaryDirectory() as d21:
    ps21 = write_ob_retest_summary_csv(rA21, d21)
    with open(ps21) as fh:
        header21 = fh.readline().strip()
    for col_name in ("kill_margin_pips", "kill_confirmed_tf", "reheld_after_kill",
                     "mfe_before_death_pips", "mfe_after_r1_pips", "mfe_after_r2_pips", "mfe_after_r3_pips"):
        check(f"summary csv has '{col_name}' (v2.1)", col_name in header21)
    pe21 = write_ob_retests_csv(rA21, d21)
    with open(pe21) as fh:
        ev_header21 = fh.readline().strip()
    check("ob_retests.csv columns UNCHANGED (no v2.1 columns)",
          "kill_margin_pips" not in ev_header21 and "mfe_before_death_pips" not in ev_header21)

# ── Summary ───────────────────────────────────────────────────────────────────────
print(f"\n{'=' * 52}")
print(f"Results: {PASS} passed, {FAIL} failed")
if FAIL == 0:
    print("ALL TESTS PASSED ✓")
else:
    print(f"FAILURES: {FAIL}")
    sys.exit(1)
