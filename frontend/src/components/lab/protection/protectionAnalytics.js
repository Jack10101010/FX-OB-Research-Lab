// ── protectionAnalytics.js ────────────────────────────────────────────────────
// Pure analytics functions for Protection Lab (Phase 1–3 upgrades).
// No React, no side-effects. Safe inside useMemo hooks.
// Helpers are self-contained copies so this module has zero imports from
// ProtectionLab.jsx (avoids any circular dependency risk).

// ── Local shared helpers ──────────────────────────────────────────────────────

function _parseDate(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}

function _parseLikelyDate(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === "number") return null;
    const text = String(value).trim();
    if (!/[T:\-\/]/.test(text)) return null;
    return _parseDate(text);
}

function _normalizeSession(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("lull")) return "London Lull";
    if (lower.includes("london")) return "London";
    if (lower.includes("new") || lower === "ny") return "New York";
    if (lower.includes("asia") || lower.includes("tokyo")) return "Asia";
    if (lower.includes("outside")) return "Outside";
    return text;
}

function _deriveSession(value) {
    const d = value instanceof Date ? value : _parseDate(value);
    if (!d) return null;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7) return "Asia";
    if (hour >= 7 && hour < 10) return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

function _rMulti(t) {
    if (Number.isFinite(Number(t?.r))) return Number(t.r);
    if (Number.isFinite(Number(t?.pnl_r))) return Number(t.pnl_r);
    return 0;
}

function _isFullBreach(t) {
    return t?.ob_fully_breached === true ||
        (Number.isFinite(Number(t?.max_ob_penetration_pct)) && Number(t.max_ob_penetration_pct) >= 100);
}

function _fillDate(t) {
    return _parseLikelyDate(
        t?.fill_time ?? t?.entry_time ?? t?.entryTimestamp ?? t?.entryTime ?? t?.time
    );
}

function _fillSession(t) {
    return _normalizeSession(t?.fillSession) ||
        _deriveSession(_fillDate(t)) ||
        "Unknown";
}

function _direction(t) {
    const v = String(t?.direction || t?.side || "").toLowerCase();
    if (v.includes("short") || v.includes("sell") || v.includes("bear")) return "short";
    if (v.includes("long") || v.includes("buy") || v.includes("bull")) return "long";
    return "unknown";
}

function _structure(t) {
    const v = String(t?.structureTag || t?.structure_tag || t?.structure || "").toLowerCase();
    if (v.includes("choch") || v.includes("change")) return "choch";
    if (v.includes("bos") || v.includes("break")) return "bos";
    return "unknown";
}

function _ageBucket(t) {
    const fill = _fillDate(t);
    const origin = _parseLikelyDate(t?.obDetectionTime ?? t?.obOriginTime);
    if (!fill || !origin) return "Unknown";
    const hours = (fill.getTime() - origin.getTime()) / 36e5;
    if (!Number.isFinite(hours) || hours < 0) return "Unknown";
    if (hours < 4) return "<4h";
    if (hours < 12) return "4–12h";
    if (hours < 24) return "12–24h";
    if (hours < 72) return "1–3d";
    if (hours < 168) return "3–7d";
    if (hours < 336) return "7–14d";
    return "14d+";
}

function _fin(v) {
    return v != null && Number.isFinite(Number(v));
}

function _round1(v) {
    return Number(Number(v).toFixed(1));
}

function _round2(v) {
    return Number(Number(v).toFixed(2));
}

function _maxDD(trades) {
    let equity = 0, peak = 0, maxDD = 0;
    (Array.isArray(trades) ? trades : []).forEach((t) => {
        equity += _rMulti(t);
        peak = Math.max(peak, equity);
        maxDD = Math.min(maxDD, equity - peak);
    });
    return _round1(maxDD);
}

// ── prettyModeName ────────────────────────────────────────────────────────────

export function prettyModeName(mode) {
    if (String(mode || "").toLowerCase() === "baseline") return "Unprotected";
    return String(mode || "unknown")
        .replace(/^trades_(single_position|allow_multi_position|one_per_direction)__/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── buildDataQuality ──────────────────────────────────────────────────────────
// Returns field-level coverage statistics for the current trade dataset.

const DATA_QUALITY_FIELDS = [
    { key: "ob_fully_breached",         label: "Hard Invalidation Flag",    desc: "Panels B & C — Research Estimate models", special: "bool" },
    { key: "max_ob_penetration_pct",    label: "Max OB Penetration %",      desc: "Panel D + penetration sensitivity curve", special: "num" },
    { key: "close_confirmed_ob_breach", label: "Close-Confirmed Invalidation", desc: "Close-confirmed invalidation heatmap", special: "bool" },
    { key: "close_breach_time",         label: "Invalidation Close Timestamp", desc: "Close-confirmed invalidation timing" },
    { key: "minutes_to_exit",           label: "Minutes to Exit",           desc: "Panel E — fast stopout analysis", special: "num" },
    { key: "same_candle_exit",          label: "Same-Candle Exit Flag",     desc: "Panel E — same-candle exits", special: "bool" },
    { key: "obWidthPips",               label: "OB Width (pips)",           desc: "OB characteristic breakdown — width", special: "num" },
    { key: "obOriginSession",           label: "OB Origin Session",         desc: "Origin × invalidation session matrix" },
    { key: "direction",                 label: "Trade Direction",           desc: "Direction breakdown" },
    { key: "structureTag",              label: "Structure Tag (BOS/CHoCH)", desc: "Structure breakdown" },
];

export function buildDataQuality(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const n = list.length;

    if (!n) {
        return {
            n: 0,
            fields: DATA_QUALITY_FIELDS.map((f) => ({ ...f, present: 0, pct: 0, status: "missing" })),
            goodCount: 0,
        };
    }

    const fields = DATA_QUALITY_FIELDS.map((f) => {
        // Honest presence-based coverage (matches the documented spec:
        // count(field present) / n). Booleans count true/false; numeric fields
        // require a finite number so junk strings aren't counted as data; all
        // other fields count any non-empty value.
        // (Previous logic used `Number.isFinite(Number(v) || 0)`, which is always
        // true for any non-empty value — it silently overstated numeric coverage.)
        let present;
        if (f.special === "bool") {
            present = list.filter((t) => t?.[f.key] === true || t?.[f.key] === false).length;
        } else if (f.special === "num") {
            present = list.filter((t) => {
                const v = t?.[f.key];
                return v != null && v !== "" && Number.isFinite(Number(v));
            }).length;
        } else {
            present = list.filter((t) => {
                const v = t?.[f.key];
                return v != null && v !== "";
            }).length;
        }
        const pct = Math.round((present / n) * 100);
        const status = pct >= 80 ? "good" : pct >= 40 ? "partial" : pct > 0 ? "limited" : "missing";
        return { ...f, present, pct, status };
    });

    const goodCount = fields.filter((f) => f.status === "good").length;
    return { n, fields, goodCount };
}

// ── buildObBreakdown ──────────────────────────────────────────────────────────
// Groups trades by OB characteristics for the breakdown tabs.

function _groupBy(list, keyFn, labels) {
    const map = {};
    labels.forEach((l) => {
        map[l] = { label: l, count: 0, winR: 0, lossR: 0, netR: 0, wins: 0, losses: 0, breach: 0 };
    });

    list.forEach((t) => {
        const key = keyFn(t);
        if (!map[key]) map[key] = { label: key, count: 0, winR: 0, lossR: 0, netR: 0, wins: 0, losses: 0, breach: 0 };
        const r = _rMulti(t);
        map[key].count++;
        map[key].netR += r;
        if (r > 0) { map[key].wins++; map[key].winR += r; }
        if (r < 0) { map[key].losses++; map[key].lossR += r; }
        if (_isFullBreach(t)) map[key].breach++;
    });

    return Object.values(map)
        .filter((g) => g.count > 0)
        .map((g) => ({
            label: g.label,
            count: g.count,
            netR: _round1(g.netR),
            winRate: g.count ? _round1((g.wins / g.count) * 100) : 0,
            expectancy: g.count ? _round2(g.netR / g.count) : 0,
            breachRate: g.count ? _round1((g.breach / g.count) * 100) : 0,
            avgWin:  g.wins   ? _round2(g.winR / g.wins)   : null,
            avgLoss: g.losses ? _round2(g.lossR / g.losses) : null,
        }));
}

const OB_WIDTH_LABELS = ["0–3 pips", "3–6 pips", "6–10 pips", "10–15 pips", ">15 pips", "Unknown"];
const OB_AGE_LABELS   = ["<4h", "4–12h", "12–24h", "1–3d", "3–7d", "7–14d", "14d+", "Unknown"];
const OB_DEPTH_LABELS = ["0–25%", "25–50%", "50–75%", "75–100%", ">100% (invalidation)", "Unknown"];
const STRUCTURE_LABELS = ["bos", "choch", "unknown"];
const DIRECTION_LABELS = ["long", "short", "unknown"];

function _widthBucket(t) {
    const w = Number(t?.obWidthPips);
    if (!Number.isFinite(w)) return "Unknown";
    if (w <= 3) return "0–3 pips";
    if (w <= 6) return "3–6 pips";
    if (w <= 10) return "6–10 pips";
    if (w <= 15) return "10–15 pips";
    return ">15 pips";
}

function _depthBucket(t) {
    const d = Number(t?.max_ob_penetration_pct);
    if (!Number.isFinite(d)) return "Unknown";
    if (d <= 25) return "0–25%";
    if (d <= 50) return "25–50%";
    if (d <= 75) return "50–75%";
    if (d < 100) return "75–100%";
    return ">100% (invalidation)";
}

export function buildObBreakdown(trades) {
    const list = Array.isArray(trades) ? trades : [];

    const hasWidth  = list.some((t) => Number.isFinite(Number(t?.obWidthPips)));
    const hasAge    = list.some((t) => _ageBucket(t) !== "Unknown");
    const hasDepth  = list.some((t) => Number.isFinite(Number(t?.max_ob_penetration_pct)));
    const hasStruct = list.some((t) => _structure(t) !== "unknown");
    const hasDir    = list.some((t) => _direction(t) !== "unknown");

    return {
        byWidth:     _groupBy(list, _widthBucket,              OB_WIDTH_LABELS),
        byAge:       _groupBy(list, _ageBucket,                OB_AGE_LABELS),
        byDepth:     _groupBy(list, _depthBucket,              OB_DEPTH_LABELS),
        byStructure: _groupBy(list, _structure,                STRUCTURE_LABELS),
        byDirection: _groupBy(list, _direction,                DIRECTION_LABELS),
        hasWidth, hasAge, hasDepth, hasStruct, hasDir,
    };
}

// RB-6B — expose the per-tab grouping functions so the canonical bucket table
// can recompute Current-Equity contribution over the same baseline trades and
// grouping the Raw R breakdown uses. Order is derived from the visible rows at
// the call site so CE and Raw R show an identical bucket set.
export const OB_BREAKDOWN_LABEL_FNS = {
    byWidth:     _widthBucket,
    byAge:       _ageBucket,
    byDepth:     _depthBucket,
    byStructure: _structure,
    byDirection: _direction,
};

// ── buildEquityCurveOverlayData ───────────────────────────────────────────────
// Builds equity curve data for baseline vs selected protection mode.
// Returns [{i, label, netR, netRB}] where netRB is the protected mode's cumulative R.

export function buildEquityCurveOverlayData(baselineTrades, tradesByMode, selectedMode) {
    const baseline = Array.isArray(baselineTrades) ? baselineTrades : [];
    const protectedTrades = (selectedMode && tradesByMode?.[selectedMode]) || [];

    let bCum = 0, pCum = 0;
    const maxLen = Math.max(baseline.length, protectedTrades.length);
    const data = [];

    for (let i = 0; i < maxLen; i++) {
        const bt = baseline[i];
        const pt = protectedTrades[i]; // index-aligned

        if (bt) bCum += _rMulti(bt);
        if (pt) pCum += _rMulti(pt);

        const refTrade = bt ?? pt;
        const d = _parseLikelyDate(
            refTrade?.fill_time ?? refTrade?.entry_time ?? refTrade?.entryTimestamp ?? refTrade?.time
        );
        const label = d ? d.toLocaleString("en", { month: "short", year: "2-digit" }) : `T${i + 1}`;

        data.push({
            i,
            label,
            netR: bt ? _round2(bCum) : null,
            netRB: pt ? _round2(pCum) : null,
        });
    }

    return {
        data,
        hasProtected: protectedTrades.length > 0,
        baselineFinal: _round2(bCum),
        protectedFinal: protectedTrades.length ? _round2(pCum) : null,
    };
}

// ── buildPairedTrades ─────────────────────────────────────────────────────────
// Pairs baseline trades with protected trades by ID (primary) or index (fallback).

export function buildPairedTrades(baselineTrades, tradesByMode, selectedMode) {
    const baseline = Array.isArray(baselineTrades) ? baselineTrades : [];
    if (!selectedMode || !tradesByMode) {
        return { pairs: [], pairingMethod: "none", pairRate: 0, pairedCount: 0 };
    }
    const protected_ = Array.isArray(tradesByMode[selectedMode]) ? tradesByMode[selectedMode] : [];
    if (!protected_.length) {
        return { pairs: [], pairingMethod: "none", pairRate: 0, pairedCount: 0 };
    }

    // Try ID-based pairing
    const protectedById = new Map();
    protected_.forEach((t) => {
        const id = t?.id ?? t?.trade_id ?? t?.tradeId;
        if (id != null) protectedById.set(String(id), t);
    });
    const idMatchCount = baseline.filter((t) => {
        const id = t?.id ?? t?.trade_id ?? t?.tradeId;
        return id != null && protectedById.has(String(id));
    }).length;

    const pairingMethod = (baseline.length > 0 && idMatchCount >= baseline.length * 0.5) ? "id" : "index";

    const pairs = baseline.map((bt, idx) => {
        let pt = null;
        if (pairingMethod === "id") {
            const id = bt?.id ?? bt?.trade_id ?? bt?.tradeId;
            pt = id != null ? (protectedById.get(String(id)) ?? null) : null;
        } else {
            pt = protected_[idx] ?? null;
        }

        const baselineR   = _rMulti(bt);
        const protectedR  = pt != null ? _rMulti(pt) : null;
        const deltaR      = protectedR != null ? _round2(protectedR - baselineR) : null;
        const triggerRaw  = String(pt?.protection_exit_reason ?? "").trim();
        const protectionFired = !!triggerRaw;
        const triggerReason   = triggerRaw || null;

        return {
            tradeId:       String(bt?.id ?? bt?.trade_id ?? bt?.tradeId ?? idx + 1),
            displayIndex:  idx + 1,
            direction:     _direction(bt),
            session:       _fillSession(bt),
            structure:     _structure(bt),
            obWidthPips:   bt?.obWidthPips != null ? Number(bt.obWidthPips) : null,
            maxPenPct:     bt?.max_ob_penetration_pct != null ? Number(bt.max_ob_penetration_pct) : null,
            ageBucket:     _ageBucket(bt),
            hardInval:     _isFullBreach(bt),
            fillTime:      bt?.fill_time ?? bt?.entry_time ?? bt?.entryTimestamp ?? null,
            baselineR,
            protectedR,
            deltaR,
            protectionFired,
            triggerReason,
            _baseline:  bt,
            _protected: pt,
        };
    });

    const pairedCount = pairs.filter((p) => p.protectedR != null).length;
    const pairRate    = baseline.length ? pairedCount / baseline.length : 0;

    return { pairs, pairingMethod, pairRate, pairedCount };
}

// ── buildRBins ────────────────────────────────────────────────────────────────

const R_BINS = [
    { label: "< -2R",      test: (r) => r < -2 },
    { label: "-2 to -1R",  test: (r) => r >= -2 && r < -1 },
    { label: "-1 to 0R",   test: (r) => r >= -1 && r < -0.01 },
    { label: "0R",         test: (r) => Math.abs(r) <= 0.01 },
    { label: "0 to +1R",   test: (r) => r > 0.01 && r <= 1 },
    { label: "+1 to +2R",  test: (r) => r > 1 && r <= 2 },
    { label: "> +2R",      test: (r) => r > 2 },
];

export function buildRBins(baselineTrades, protectedTrades) {
    const base = Array.isArray(baselineTrades) ? baselineTrades : [];
    const prot = Array.isArray(protectedTrades) ? protectedTrades : [];
    const hasProtected = prot.length > 0;

    const bins = R_BINS.map((bin) => ({
        label:     bin.label,
        baseline:  base.filter((t) => bin.test(_rMulti(t))).length,
        protected: hasProtected ? prot.filter((t) => bin.test(_rMulti(t))).length : 0,
    }));

    return { bins, hasProtected };
}

// ── buildStreakData ───────────────────────────────────────────────────────────

export function buildStreakData(trades) {
    const list = Array.isArray(trades) ? trades : [];
    if (!list.length) return { points: [], maxConsecutiveLoss: 0, maxConsecutiveWin: 0, currentStreak: 0 };

    let maxLoss = 0, maxWin = 0, curRun = 0, curType = null;
    const runStart = []; // will track streak start indices

    const points = list.map((t, i) => {
        const r = _rMulti(t);
        const outcome = r > 0.005 ? "win" : r < -0.005 ? "loss" : "be";

        if (outcome === "win") {
            if (curType === "win") curRun++;
            else { curRun = 1; curType = "win"; }
            maxWin = Math.max(maxWin, curRun);
        } else if (outcome === "loss") {
            if (curType === "loss") curRun++;
            else { curRun = 1; curType = "loss"; }
            maxLoss = Math.max(maxLoss, curRun);
        } else {
            curRun = 0; curType = null;
        }

        const d = _parseLikelyDate(t?.fill_time ?? t?.entry_time ?? t?.entryTimestamp ?? t?.time);
        return {
            i,
            outcome,
            r: _round2(r),
            session:       _fillSession(t),
            date:          d ? d.toISOString().slice(0, 10) : null,
            hardInval:     _isFullBreach(t),
            protFired:     !!String(t?.protection_exit_reason ?? "").trim(),
            streakLen:     curRun,
            streakType:    curType,
        };
    });

    const lastPt = points[points.length - 1];
    const currentStreak = lastPt
        ? (lastPt.outcome === "win" ? curRun : lastPt.outcome === "loss" ? -curRun : 0)
        : 0;

    return { points, maxConsecutiveLoss: maxLoss, maxConsecutiveWin: maxWin, currentStreak };
}

// ── buildPenetrationSweep ─────────────────────────────────────────────────────

export function buildPenetrationSweep(trades, minPct = 50, maxPct = 100, step = 5) {
    const list = Array.isArray(trades) ? trades : [];
    const baselineNet = list.reduce((s, t) => s + _rMulti(t), 0);
    const hasPenData  = list.some((t) => Number.isFinite(Number(t?.max_ob_penetration_pct)));

    if (!hasPenData) return { results: [], baselineNet: _round2(baselineNet), hasPenData: false };

    const clampedMin  = Math.max(0, Math.min(minPct, maxPct));
    const clampedMax  = Math.min(200, Math.max(minPct, maxPct));
    const clampedStep = Math.max(1, Math.min(25, step));

    const results = [];
    for (let thresh = clampedMin; thresh <= clampedMax + 0.001; thresh += clampedStep) {
        const affected = list.filter(
            (t) => Number.isFinite(Number(t?.max_ob_penetration_pct)) && Number(t.max_ob_penetration_pct) >= thresh
        );
        const savedR = affected.reduce((s, t) => {
            const r = _rMulti(t);
            return s + (r < 0 ? -r : 0);
        }, 0);
        const projectedNet = _round2(baselineNet + savedR);
        const affectedLosers  = affected.filter((t) => _rMulti(t) < 0).length;
        const affectedWinners = affected.filter((t) => _rMulti(t) > 0).length;

        results.push({
            threshold:       Math.round(thresh * 10) / 10,
            count:           affected.length,
            savedR:          _round2(savedR),
            projectedNet,
            deltaVsBaseline: _round2(projectedNet - baselineNet),
            affectedLosers,
            affectedWinners,
        });
    }

    return { results, baselineNet: _round2(baselineNet), hasPenData: true };
}

// ── buildDrawdownCurves ───────────────────────────────────────────────────────

export function buildDrawdownCurves(baselineTrades, tradesByMode, selectedModes) {
    const baseline  = Array.isArray(baselineTrades) ? baselineTrades : [];
    const modesToUse = (Array.isArray(selectedModes) ? selectedModes : Object.keys(tradesByMode || {}))
        .filter((m) => m !== "baseline")
        .slice(0, 3);

    const MODE_COLORS = [
        "hsl(var(--accent-secondary))",
        "hsl(var(--success))",
        "hsl(var(--warning))",
    ];

    function calcDDSeries(trades) {
        let equity = 0, peak = 0;
        return (Array.isArray(trades) ? trades : []).map((t, i) => {
            equity += _rMulti(t);
            peak = Math.max(peak, equity);
            return { i, dd: _round2(equity - peak) };
        });
    }

    const curves = [
        { mode: "baseline", label: "Unprotected", data: calcDDSeries(baseline), color: "hsl(var(--accent-primary))", isBaseline: true },
        ...modesToUse.map((mode, idx) => ({
            mode,
            label: prettyModeName(mode),
            data: calcDDSeries((tradesByMode || {})[mode] || []),
            color: MODE_COLORS[idx] || MODE_COLORS[0],
            isBaseline: false,
        })),
    ];

    // Align all curves to max baseline length for x-axis
    const maxLen = Math.max(...curves.map((c) => c.data.length), 0);

    // Build merged data: [{i, baseline, mode1, mode2, ...}]
    const merged = Array.from({ length: maxLen }, (_, i) => {
        const pt = { i };
        curves.forEach((c) => {
            const v = c.data[i];
            pt[c.mode] = v ? v.dd : null;
        });
        return pt;
    });

    return { curves, merged, hasModes: modesToUse.length > 0 };
}

// ── buildTradeLifecycleFlow ───────────────────────────────────────────────────
// Simplified trade lifecycle / flow data for the "Sankey-style" flow diagram.

export function buildTradeLifecycleFlow(trades, tradesByMode, selectedMode) {
    const list = Array.isArray(trades) ? trades : [];
    const n = list.length;
    if (!n) return null;

    const protected_ = (selectedMode && tradesByMode?.[selectedMode]) ? tradesByMode[selectedMode] : [];
    const hasProtection = protected_.length > 0;

    // Baseline breakdown
    const wins     = list.filter((t) => _rMulti(t) > 0.005).length;
    const losses   = list.filter((t) => _rMulti(t) < -0.005).length;
    const breakeven = n - wins - losses;
    const hardInvals       = list.filter(_isFullBreach).length;
    const hardInvalLosses  = list.filter((t) => _isFullBreach(t) && _rMulti(t) < -0.005).length;
    const hardInvalWins    = list.filter((t) => _isFullBreach(t) && _rMulti(t) > 0.005).length;
    const normalLosses     = losses - hardInvalLosses;
    const normalWins       = wins   - hardInvalWins;

    // Protection breakdown
    let protectionExits = 0, savedFromLoss = 0, winnersCut = 0;
    if (hasProtection) {
        protected_.forEach((pt, i) => {
            const protFired = !!String(pt?.protection_exit_reason ?? "").trim();
            if (!protFired) return;
            protectionExits++;
            const bt = list[i]; // index-aligned
            if (bt) {
                if (_rMulti(bt) < -0.005) savedFromLoss++;
                else if (_rMulti(bt) > 0.005) winnersCut++;
            }
        });
    }

    return {
        n, wins, losses, breakeven,
        hardInvals, hardInvalLosses, hardInvalWins,
        normalLosses, normalWins,
        hasProtection,
        protectionExits, savedFromLoss, winnersCut,
        selectedMode,
    };
}

// ── calcEfficiencyRatio ───────────────────────────────────────────────────────
// Loser R Saved / |Winner R Cost|
// > 1 = saves more than it costs; < 1 = costs more than it saves; null = insufficient data.

export function calcEfficiencyRatio(row) {
    if (!row) return null;
    const loserRSaved  = row.loserRSaved;
    const netVsBaseline = row.netVsBaseline;
    if (!_fin(loserRSaved) || !_fin(netVsBaseline)) return null;
    if (Number(loserRSaved) <= 0) return null;
    const winnerRCost = Number(netVsBaseline) - Number(loserRSaved); // negative = cost
    if (winnerRCost >= -0.001) return null; // no meaningful winner cost — could be Infinity
    return _round2(Number(loserRSaved) / Math.abs(winnerRCost));
}

// ── calcRobustnessScore ───────────────────────────────────────────────────────
// Composite 0–100 score per protection mode.

export function calcRobustnessScore(row, baselineMaxDD) {
    if (!row || row.isBaseline) return null;
    if (!_fin(row.netVsBaseline)) return null;

    // Component 1: net R delta vs baseline (±40 pts)
    const netDelta = Math.max(-40, Math.min(40, Number(row.netVsBaseline) * 8));

    // Component 2: drawdown improvement (±20 pts)
    // maxDD values are negative numbers (e.g. -3.5). Higher (less negative) is better.
    let ddDelta = 0;
    if (_fin(row.maxDD) && _fin(baselineMaxDD)) {
        const improvement = Number(row.maxDD) - Number(baselineMaxDD); // positive = mode is better
        ddDelta = Math.max(-20, Math.min(20, improvement * 4));
    }

    // Component 3: efficiency tier (−10 to +15 pts)
    const eff = calcEfficiencyRatio(row);
    let effComp = 0;
    if (eff === null) effComp = 0;
    else if (eff >= 1.5) effComp = 15;
    else if (eff >= 1.0) effComp = 8;
    else if (eff >= 0.5) effComp = 0;
    else effComp = -10;

    // Component 4: sample size penalty (−15 to 0 pts)
    let samplePenalty = 0;
    if (_fin(row.trades)) {
        samplePenalty = Math.max(-15, Math.min(0, (Number(row.trades) - 20) * 0.5));
    }

    const raw = 50 + netDelta + ddDelta + effComp + samplePenalty;
    return Math.round(Math.max(0, Math.min(100, raw)));
}

// ── computeProfitFactor ───────────────────────────────────────────────────────
// Exported helper used in buildProtection expansion in ProtectionLab.jsx.

export function computeProfitFactor(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const grossWins   = list.filter((t) => _rMulti(t) > 0).reduce((s, t) => s + _rMulti(t), 0);
    const grossLosses = list.filter((t) => _rMulti(t) < 0).reduce((s, t) => s + Math.abs(_rMulti(t)), 0);
    if (grossLosses <= 0) return null;
    return _round2(grossWins / grossLosses);
}

// ── computeEquityPoints ───────────────────────────────────────────────────────
// Rolling cumulative R array — used for the Net R MetricChip sparkline.

export function computeEquityPoints(trades) {
    let cum = 0;
    return (Array.isArray(trades) ? trades : []).map((t) => {
        cum += _rMulti(t);
        return _round2(cum);
    });
}

// ── Data-derived confidence layer (Restructure Plan · Step 2) ─────────────────
// A reusable, presentation-layer classification of how trustworthy each
// protection approach's evidence is — derived from ACTUAL data presence, NOT from
// the static per-panel ConfidenceTag labels. This is the foundation a future
// verdict UI will consume; it intentionally produces NO verdicts, rankings, or
// recommendations.
//
//   exact        — an exporter-backed protection backtest exists for the mode.
//   estimate     — only a directional research estimate is possible (its required
//                  fields are present) and there is no exact backtest.
//   insufficient — required exporter field(s) are missing; cannot evaluate.
//
// Pure: no React, no side-effects.

// The research-estimate approaches the page can model from raw trade fields, and
// the exporter field each one requires. (These mirror Panels B/C/D in the UI.)
export const ESTIMATE_APPROACHES = [
    { key: "break_even_escape",  label: "Break-even escape",                requires: ["ob_fully_breached"] },
    { key: "immediate_exit",     label: "Immediate hard-invalidation exit", requires: ["ob_fully_breached"] },
    { key: "penetration_defense", label: "OB penetration defense",          requires: ["max_ob_penetration_pct"] },
];

/**
 * Pure 3-state classifier. No data access — just the two booleans a caller has
 * already derived from real data.
 * @returns {"exact"|"estimate"|"insufficient"}
 */
export function classifyConfidence({ hasExact, estimateAvailable }) {
    if (hasExact) return "exact";
    if (estimateAvailable) return "estimate";
    return "insufficient";
}

/**
 * Build the per-mode + page-level confidence source.
 * @param {object} opts
 * @param {Array}  opts.exactRows   exactProtectionRows (exporter-backed; may include baseline)
 * @param {object} opts.dataQuality output of buildDataQuality(trades)
 * @returns {{
 *   pageBasis: "exact"|"estimate"|"insufficient",
 *   exactModes: Array<{key,label,basis:"exact",reason}>,
 *   estimates:  Array<{key,label,basis:"estimate"|"insufficient",requires,missing,reason}>,
 *   hasExact: boolean,
 *   anyEstimate: boolean
 * }}
 */
export function buildProtectionConfidence({ exactRows = [], dataQuality = null } = {}) {
    // Exact modes = non-baseline exporter rows. These are EXACT by definition.
    const exactModes = (Array.isArray(exactRows) ? exactRows : [])
        .filter((r) => r && !r.isBaseline && r.mode)
        .map((r) => ({
            key: r.mode,
            label: prettyModeName(r.mode),
            basis: "exact",
            reason: "Exporter-backed protection backtest",
        }));

    // Field coverage lookup from the (now-honest) data-quality output.
    const coverage = {};
    if (dataQuality && Array.isArray(dataQuality.fields)) {
        dataQuality.fields.forEach((f) => { coverage[f.key] = f; });
    }
    const fieldPresent = (key) => {
        const f = coverage[key];
        return !!f && Number(f.present) > 0;
    };

    // Estimate approaches: estimable only if every required field is present.
    const estimates = ESTIMATE_APPROACHES.map((a) => {
        const missing = a.requires.filter((k) => !fieldPresent(k));
        const ok = missing.length === 0;
        return {
            key: a.key,
            label: a.label,
            basis: ok ? "estimate" : "insufficient",
            requires: a.requires,
            missing,
            reason: ok
                ? "Directional research estimate (optimistic; unproven)"
                : `Missing required field(s): ${missing.join(", ")}`,
        };
    });

    const hasExact = exactModes.length > 0;
    const anyEstimate = estimates.some((e) => e.basis === "estimate");
    const pageBasis = classifyConfidence({ hasExact, estimateAvailable: anyEstimate });

    return { pageBasis, exactModes, estimates, hasExact, anyEstimate };
}
