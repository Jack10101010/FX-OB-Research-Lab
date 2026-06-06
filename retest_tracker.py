"""
retest_tracker.py — OB Retest Analysis (Phase 2.1, backend post-processor)
==========================================================================
PURPOSE
    Authoritative, exporter-ready Python port of the frontend retest engine
    (frontend/src/data/obRetest.js). For every detected order block, replay the
    execution-timeframe candle series from detection forward, and after the
    FIRST touch resolves, detect every later RETEST and classify it as
    survived / failed / open.

    This is a PURE POST-PROCESSOR (see OB-RETEST-ANALYSIS-3-PHASE-2-EXPORTER-AUDIT.md
    §10): it reads finished run-bundle data (order blocks, candles, trades) and
    produces NEW artifacts. It does NOT touch trade logic, equity, or any
    existing output — running it cannot change a backtest result.

STAGING NOTE
    Mirrors the ghost_tracker.py pattern: authored + tested standalone in the
    FX-OB-Research-Lab repo first, with NO integration wiring. The real exporter
    lives in the separate lux-ob-backtester repo; this module is intended to be
    dropped in there later (next to ghost_tracker.py) and called from the
    run_backtest.py export step behind an `emit_ob_retests` config flag.

SEMANTICS (must match Phase 1 — frontend obRetest.js)
    first touch  : first candle whose range intersects the OB after detection.
    first fill   : trade fill_time — ANNOTATION ONLY, never conflated with touch.
    retest       : a later re-entry, counted only after price has LEFT the zone
                   (debounce) and while the OB is not yet invalidated.
    survived     : reaction window completed with no breach.
    failed       : breach (close beyond the distal edge by default) within window.
    open         : reaction window extends beyond available candles (right-censored).
    reaction_met : SEPARATE quality flag (reaction_max_pips >= reaction_min_pips);
                   it does NOT gate the outcome.
    Rates        : survival/failure computed over CLOSED retests only (exclude open).
    Invariant    : survived + failed + open == total retests.

stdlib only. No pandas / numpy.
"""

from __future__ import annotations

import bisect
import csv
import os
import time as _time
from datetime import datetime, timezone


# ── Default config ──────────────────────────────────────────────────────────────
DEFAULT_RETEST_CONFIG = {
    "reaction_window_candles": 10,        # candles after entry used to judge survive/fail
    "reaction_min_pips": 8.0,             # favorable move (pips) that qualifies as a reaction
    "failure_threshold": "close_beyond_ob",  # "close_beyond_ob" | "wick_beyond_ob"
    "failure_buffer_pips": 0.0,           # extra pips beyond distal edge before breach counts
    "retest_entry_threshold_pct": 0.0,    # penetration % that counts as "re-entered"
    "retest_exit_threshold_pct": 0.0,     # must drop to/below this to re-arm (debounce)
    "touch_epsilon_pips": 0.0,            # tolerance for first-touch detection
    "count_first_touch_as_retest": False,
    "pip_size": 0.0001,
    "max_retests_per_ob": 50,             # safety cap against pathological grinds
}

# Canonical column order for ob_retests.csv (OB-RETEST-3 §5).
OB_RETESTS_COLUMNS = [
    "ob_id", "direction", "structure", "detection_time",
    "first_touch_time", "first_fill_time", "first_touch_outcome", "first_touch_was_traded",
    "retest_index", "retest_time", "retest_candle_index", "retest_type",
    "entry_penetration_pct", "max_penetration_pct",
    "reaction_max_pips", "reaction_met",
    "outcome", "failure_mode", "candles_to_failure",
    "session", "minutes_since_first_touch",
]

# Canonical column order for ob_retest_summary.csv (OB-RETEST-3 §6, sidecar form).
OB_RETEST_SUMMARY_COLUMNS = [
    "ob_id", "direction", "structure", "ob_touch_count", "retest_count",
    "retests_survived", "retests_failed", "retests_open",
    "first_retest_outcome", "final_outcome", "invalidated_on_retest_index",
    "max_reaction_pips_any_retest", "time_to_invalidation_minutes",
]

# UTC-hour session bands — mirror ghost_tracker.py _SESSION_BOUNDARIES.
_SESSION_BANDS = [
    (0, 3, "Asia"),
    (3, 8, "London"),
    (8, 10, "London Lull"),
    (10, 17, "New York"),
    (17, 24, "Outside"),
]


# ── Small helpers ────────────────────────────────────────────────────────────────
def _session_of(epoch):
    if epoch is None:
        return "Unknown"
    h = datetime.fromtimestamp(epoch, timezone.utc).hour
    for s, e, label in _SESSION_BANDS:
        if s <= h < e:
            return label
    return "Outside"


def _norm_time(value):
    """Coerce a timestamp (epoch number / ISO string / datetime) to epoch SECONDS."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        v = float(value)
        return v / 1000.0 if v > 1e11 else v
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    s = str(value).strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    if len(s) >= 11 and s[10] == " ":  # "YYYY-MM-DD HH:MM..." -> ISO 'T'
        s = s[:10] + "T" + s[11:]
    if len(s) == 10:  # date only
        s = s + "T00:00:00+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _f(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _get(d, *keys, default=None):
    if not isinstance(d, dict):
        return default
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def _ob_key(value):
    """Normalize an ob_id to a join key (numeric -> canonical int string), like obRetest.js."""
    if value is None or value == "":
        return None
    text = str(value).strip().lower()
    digits = "".join(ch for ch in text if ch.isdigit())
    return str(int(digits)) if digits else text


def _round2(v):
    if v is None:
        return None
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return v


def _normalize_direction(ob, trade):
    raw = str(_get(ob, "direction", "side", "type") or _get(trade or {}, "direction") or "").lower()
    if "bear" in raw or raw in ("short", "sell"):
        return "bearish", False
    return "bullish", True


def _normalize_structure(ob, trade):
    raw = str(_get(ob, "structure_tag", "structure") or _get(trade or {}, "structure_tag", "structure") or "").upper()
    if "CHOCH" in raw or "CHOC" in raw:
        return "CHoCH"
    if "BOS" in raw:
        return "BOS"
    return raw or ""


# ── Candle columns ───────────────────────────────────────────────────────────────
def _build_candle_columns(candles):
    """Build sorted parallel lists (time/o/h/l/c) once for the whole run."""
    rows = []
    for c in (candles or []):
        t = _norm_time(_get(c, "time", "t", "timestamp", "datetime", "date"))
        o = _f(_get(c, "open", "o"))
        h = _f(_get(c, "high", "h"))
        lo = _f(_get(c, "low", "l"))
        cl = _f(_get(c, "close", "c"))
        if t is None or None in (o, h, lo, cl):
            continue
        rows.append((t, o, h, lo, cl))
    rows.sort(key=lambda r: r[0])
    times = [r[0] for r in rows]
    return rows, times


def _build_trades_lookup(trades):
    """Accept either a list of trade dicts or an already-built {ob_key: trade} mapping."""
    if trades is None:
        return {}
    if isinstance(trades, dict):
        out = {}
        for k, v in trades.items():
            key = _ob_key(k)
            if key is not None and key not in out:
                out[key] = v
        return out
    out = {}
    for tr in trades:
        key = _ob_key(_get(tr, "ob_id", "order_block_id", "obId"))
        if key is not None and key not in out:
            out[key] = tr
    return out


# ── Core ─────────────────────────────────────────────────────────────────────────
def compute_ob_retests(order_blocks, candles, trades=None, config=None):
    """
    Compute OB retest events + per-OB aggregates + run summary.

    Parameters
    ----------
    order_blocks : list[dict]   order_blocks.csv rows (ob_id, direction, structure_tag,
                                detection_time, top, bottom, ...).
    candles      : list[dict]   candles.csv rows (time/open/high/low/close or t/o/h/l/c).
    trades       : list[dict] | dict | None   trades keyed by ob_id (for first-fill /
                                first-touch-outcome annotation only).
    config       : dict | None  partial config merged over DEFAULT_RETEST_CONFIG.

    Returns
    -------
    { "events": [...], "per_ob": {ob_id: {...}}, "summary": {...}, "meta": {...} }
    """
    t0 = _time.perf_counter()
    cfg = dict(DEFAULT_RETEST_CONFIG)
    if config:
        cfg.update(config)

    pip = _f(cfg.get("pip_size")) or 0.0001
    eps_price = (_f(cfg.get("touch_epsilon_pips")) or 0.0) * pip
    buf_price = (_f(cfg.get("failure_buffer_pips")) or 0.0) * pip
    reaction_min_pips = _f(cfg.get("reaction_min_pips")) or 0.0
    entry_thr = _f(cfg.get("retest_entry_threshold_pct")) or 0.0
    exit_thr = _f(cfg.get("retest_exit_threshold_pct")) or 0.0
    failure_threshold = cfg.get("failure_threshold", "close_beyond_ob")
    max_retests = int(cfg.get("max_retests_per_ob", 50))
    N = max(1, int(cfg.get("reaction_window_candles", 10)))

    rows, times = _build_candle_columns(candles)
    n = len(rows)
    trades_lookup = _build_trades_lookup(trades)

    events = []
    per_ob = {}

    for ob in (order_blocks or []):
        ob_id = _get(ob, "ob_id", "id")
        trade = trades_lookup.get(_ob_key(ob_id))
        direction, is_bull = _normalize_direction(ob, trade)
        structure = _normalize_structure(ob, trade)

        rec = {
            "ob_id": ob_id,
            "direction": direction,
            "structure": structure,
            "ob_touch_count": 0,
            "retest_count": 0,
            "retests_survived": 0,
            "retests_failed": 0,
            "retests_open": 0,
            "first_retest_outcome": None,
            "final_outcome": None,
            "invalidated_on_retest_index": None,
            "max_reaction_pips_any_retest": 0.0,
            "time_to_invalidation_minutes": None,
        }

        top_raw = _f(_get(ob, "top", "high"))
        bot_raw = _f(_get(ob, "bottom", "bot", "low"))
        if top_raw is None or bot_raw is None:
            per_ob[ob_id] = rec
            continue
        top = max(top_raw, bot_raw)
        bot = min(top_raw, bot_raw)
        height = top - bot
        if height <= 0 or n == 0:
            per_ob[ob_id] = rec
            continue

        proximal = top if is_bull else bot
        detection_time = _norm_time(_get(ob, "detection_time", "end_time", "origin_time", "start_time"))
        first_fill_time = _norm_time(_get(trade or {}, "fill_time", "fillTime", "entry")) if trade else None
        first_touch_was_traded = trade is not None
        if trade is not None:
            first_touch_outcome = str(_get(trade, "outcome", "result") or "unknown").lower()
        else:
            first_touch_outcome = "untraded"

        # ── geometry closures bound to this OB ──────────────────────────────────
        def intersects(i):
            return rows[i][2] >= bot - eps_price and rows[i][3] <= top + eps_price

        def pen_pct(i):
            depth = (top - rows[i][3]) if is_bull else (rows[i][2] - bot)
            return max(0.0, (depth / height) * 100.0)

        def is_breach(i):
            c = rows[i][4]
            if failure_threshold == "wick_beyond_ob":
                return (rows[i][3] < bot - buf_price) if is_bull else (rows[i][2] > top + buf_price)
            return (c < bot - buf_price) if is_bull else (c > top + buf_price)

        def favorable_pips(i):
            fav = (rows[i][2] - proximal) if is_bull else (proximal - rows[i][3])
            return max(0.0, fav) / pip

        def closes_inside(i):
            return bot <= rows[i][4] <= top

        def closes_beyond_proximal(i):
            return (rows[i][4] > top) if is_bull else (rows[i][4] < bot)

        # ── seek first touch ────────────────────────────────────────────────────
        start = bisect.bisect_left(times, detection_time) if detection_time is not None else 0
        first_touch_index = -1
        first_touch_time = None
        i = start
        while i < n:
            if intersects(i):
                first_touch_index = i
                first_touch_time = times[i]
                rec["ob_touch_count"] = 1
                if is_breach(i):
                    rec["invalidated_on_retest_index"] = 0  # invalidated on first touch
                break
            i += 1
        if first_touch_index < 0 or rec["invalidated_on_retest_index"] == 0:
            per_ob[ob_id] = rec
            continue

        # ── state machine after first touch (INSIDE -> ARMED -> window) ──────────
        STATE_INSIDE, STATE_ARMED = 0, 1
        state = STATE_INSIDE
        j = first_touch_index + 1
        terminated = False

        def has_left(idx):
            pen = pen_pct(idx) if intersects(idx) else 0.0
            return pen <= exit_thr

        while j < n and not terminated and rec["retest_count"] < max_retests:
            if state == STATE_INSIDE:
                if has_left(j):
                    state = STATE_ARMED
                j += 1
                continue

            reentered = intersects(j) and pen_pct(j) >= entry_thr
            if not reentered:
                j += 1
                continue

            # ── retest k begins at candle j ─────────────────────────────────────
            k = rec["retest_count"] + 1
            retest_index = j
            retest_time = times[j]
            max_pen = pen_pct(j)
            reaction_max_pips = favorable_pips(j)
            any_close_inside = closes_inside(j)
            any_close_beyond_proximal = closes_beyond_proximal(j)
            reached_distal = pen_pct(j) >= 100.0

            breach_at = -1
            window_end = retest_index + N
            w = retest_index
            while w <= window_end:
                if w >= n:
                    break
                if w > retest_index:
                    max_pen = max(max_pen, pen_pct(w))
                    reaction_max_pips = max(reaction_max_pips, favorable_pips(w))
                    if closes_inside(w):
                        any_close_inside = True
                    if closes_beyond_proximal(w):
                        any_close_beyond_proximal = True
                    if pen_pct(w) >= 100.0:
                        reached_distal = True
                if is_breach(w):
                    breach_at = w
                    break
                w += 1

            if breach_at >= 0:
                outcome = "failed"
                failure_mode = "wick_breach" if failure_threshold == "wick_beyond_ob" else "close_breach"
                candles_to_failure = breach_at - retest_index
            elif window_end >= n:
                outcome = "open"          # right-censored
                failure_mode = "none"
                candles_to_failure = None
            else:
                outcome = "survived"
                failure_mode = "none"
                candles_to_failure = None

            # retest-type classification (deterministic)
            if any_close_inside:
                retest_type = "close_inside"
            elif reached_distal and outcome != "failed":
                retest_type = "full_penetration_no_invalidation"
            elif any_close_beyond_proximal and 0.0 < max_pen <= 33.0:
                retest_type = "wick_only"
            elif max_pen <= 33.0:
                retest_type = "clean"
            else:
                retest_type = "deep"

            reaction_met = reaction_max_pips >= reaction_min_pips

            # per-OB aggregates
            rec["retest_count"] = k
            rec["ob_touch_count"] += 1
            rec["final_outcome"] = outcome
            if k == 1:
                rec["first_retest_outcome"] = outcome
            rec["max_reaction_pips_any_retest"] = max(rec["max_reaction_pips_any_retest"], reaction_max_pips)
            if outcome == "survived":
                rec["retests_survived"] += 1
            elif outcome == "failed":
                rec["retests_failed"] += 1
                rec["invalidated_on_retest_index"] = k
                if first_touch_time is not None and breach_at >= 0:
                    rec["time_to_invalidation_minutes"] = round((times[breach_at] - first_touch_time) / 60.0)
            else:
                rec["retests_open"] += 1

            events.append({
                "ob_id": ob_id,
                "direction": direction,
                "structure": structure,
                "detection_time": int(detection_time) if detection_time is not None else None,
                "first_touch_time": int(first_touch_time) if first_touch_time is not None else None,
                "first_fill_time": int(first_fill_time) if first_fill_time is not None else None,
                "first_touch_outcome": first_touch_outcome,
                "first_touch_was_traded": first_touch_was_traded,
                "retest_index": k,
                "retest_time": int(retest_time),
                "retest_candle_index": retest_index,
                "retest_type": retest_type,
                "entry_penetration_pct": _round2(pen_pct(retest_index)),
                "max_penetration_pct": _round2(min(100.0, max_pen)),
                "reaction_max_pips": _round2(reaction_max_pips),
                "reaction_met": reaction_met,
                "outcome": outcome,
                "failure_mode": failure_mode,
                "candles_to_failure": candles_to_failure,
                "session": _session_of(retest_time),
                "minutes_since_first_touch": (
                    round((retest_time - first_touch_time) / 60.0) if first_touch_time is not None else None
                ),
            })

            if outcome in ("failed", "open"):
                terminated = True
                break
            # survived -> resume after the window for the next retest
            state = STATE_INSIDE
            j = window_end + 1

        rec["max_reaction_pips_any_retest"] = _round2(rec["max_reaction_pips_any_retest"])
        per_ob[ob_id] = rec

    summary = _build_summary(events, per_ob, len(order_blocks or []))
    meta = {
        "candle_count": n,
        "compute_ms": round((_time.perf_counter() - t0) * 1000.0, 2),
        "config": cfg,
        "data_basis": "backend_postprocess",
    }
    return {"events": events, "per_ob": per_ob, "summary": summary, "meta": meta}


def _build_summary(events, per_ob, obs_total):
    obs_with_first_touch = sum(1 for r in per_ob.values() if r["ob_touch_count"] > 0)
    obs_retested = sum(1 for r in per_ob.values() if r["retest_count"] > 0)
    survived = failed = open_ = 0
    reaction_sum = reaction_n = 0
    fail_candle_sum = fail_n = 0
    by_session, by_structure, by_direction = {}, {}, {}

    def _bucket(d, key, outcome):
        b = d.setdefault(key or "Unknown", {"n": 0, "survived": 0, "failed": 0, "open": 0})
        b["n"] += 1
        b[outcome] += 1

    for e in events:
        oc = e["outcome"]
        if oc == "survived":
            survived += 1
        elif oc == "failed":
            failed += 1
        else:
            open_ += 1
        if oc != "open" and e["reaction_max_pips"] is not None:
            reaction_sum += e["reaction_max_pips"]
            reaction_n += 1
        if oc == "failed" and e["candles_to_failure"] is not None:
            fail_candle_sum += e["candles_to_failure"]
            fail_n += 1
        _bucket(by_session, e["session"], oc)
        _bucket(by_structure, e["structure"], oc)
        _bucket(by_direction, e["direction"], oc)

    total = survived + failed + open_
    closed = survived + failed
    return {
        "obs_total": obs_total,
        "obs_with_first_touch": obs_with_first_touch,
        "obs_retested": obs_retested,
        "total_retests": total,
        "survived": survived,
        "failed": failed,
        "open": open_,
        "retest_rate": (obs_retested / obs_with_first_touch) if obs_with_first_touch else 0.0,
        "survival_rate": (survived / closed) if closed else 0.0,
        "failure_rate": (failed / closed) if closed else 0.0,
        "avg_reaction_pips": (reaction_sum / reaction_n) if reaction_n else 0.0,
        "avg_candles_to_failure": (fail_candle_sum / fail_n) if fail_n else 0.0,
        "breakdown_by_session": by_session,
        "breakdown_by_structure": by_structure,
        "breakdown_by_direction": by_direction,
    }


# ── Export helpers ───────────────────────────────────────────────────────────────
def summary_fields(result):
    """Return additive summary.json keys (OB-RETEST-3 §7), mirroring the ghost_* pattern."""
    s = result["summary"]
    return {
        "ob_retest_total": s["total_retests"],
        "ob_with_retest_count": s["obs_retested"],
        "retest_rate": round(s["retest_rate"], 4),
        "retest_survival_rate": round(s["survival_rate"], 4),
        "retest_failure_rate": round(s["failure_rate"], 4),
        "retest_open_count": s["open"],
        "avg_reaction_pips_on_retest": round(s["avg_reaction_pips"], 4),
        "avg_candles_to_failure": round(s["avg_candles_to_failure"], 4),
        "retest_breakdown_by_session": s["breakdown_by_session"],
        "retest_breakdown_by_structure": s["breakdown_by_structure"],
        "retest_breakdown_by_direction": s["breakdown_by_direction"],
    }


def _csv_cell(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"  # lowercase — frontend boolOrNull() expects this
    return v


def write_ob_retests_csv(result, out_dir, filename="ob_retests.csv"):
    """Write the primary ob_retests.csv artifact. Returns the path written."""
    path = os.path.join(out_dir, filename)
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(OB_RETESTS_COLUMNS)
        for e in result["events"]:
            writer.writerow([_csv_cell(e.get(col)) for col in OB_RETESTS_COLUMNS])
    return path


def write_ob_retest_summary_csv(result, out_dir, filename="ob_retest_summary.csv"):
    """Write the per-OB aggregate sidecar (keyed by ob_id). Returns the path written."""
    path = os.path.join(out_dir, filename)
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(OB_RETEST_SUMMARY_COLUMNS)
        for rec in result["per_ob"].values():
            writer.writerow([_csv_cell(rec.get(col)) for col in OB_RETEST_SUMMARY_COLUMNS])
    return path
