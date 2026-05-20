// Run bundle ingestion for FX-OB-Backtester output.
// A bundle = config.json + summary.json + order_blocks.csv + trades_*.csv (+ optional candles.csv).

// ─────────────────────── CSV utilities ───────────────────────

export function parseCSV(text) {
    const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (!rows.length) return { headers: [], rows: [] };
    const split = (line) => {
        const out = []; let cur = ""; let q = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
            if (c === '"') { q = !q; continue; }
            if (c === "," && !q) { out.push(cur); cur = ""; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    };
    const headers = split(rows[0]).map((h) => h.trim().toLowerCase());
    const data = rows.slice(1).map((r) => {
        const cells = split(r);
        const obj = {};
        headers.forEach((h, i) => {
            const v = (cells[i] ?? "").trim();
            obj[h] = v === "" ? null : isFinite(Number(v)) ? Number(v) : v;
        });
        return obj;
    });
    return { headers, rows: data };
}

function pick(row, ...names) {
    for (const n of names) {
        const key = n.toLowerCase();
        if (row[key] != null) return row[key];
    }
    return null;
}

const cap = (s) => (s == null ? "" : String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase());
const isNum = (v) => v != null && isFinite(Number(v));
const numOrNull = (v) => (isNum(v) ? Number(v) : null);

function pickFrom(obj, ...names) {
    if (!obj) return null;
    for (const n of names) {
        if (obj[n] != null) return obj[n];
    }
    return null;
}

function normalizeTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

// ─────────────────────── Parsers ───────────────────────

export function parseCandlesCSV(text) {
    const { rows } = parseCSV(text);
    return rows.map((r, i) => {
        const t = String(pick(r, "time", "timestamp", "datetime", "date") || "");
        return {
            i,
            t,
            time: normalizeTimestamp(t),
            o: Number(pick(r, "open", "o") ?? 0),
            h: Number(pick(r, "high", "h") ?? 0),
            l: Number(pick(r, "low", "l") ?? 0),
            c: Number(pick(r, "close", "c") ?? 0),
        };
    });
}

export function parseOrderBlocksCSV(text) {
    const { rows } = parseCSV(text);
    return rows.map((r, i) => ({
        id: String(pick(r, "id", "ob_id") || `OB-${String(i + 1).padStart(3, "0")}`),
        i0: pick(r, "i0", "start_index", "origin_index"),
        i1: pick(r, "i1", "end_index", "detection_index"),
        originTime: pick(r, "origin_time", "start_time"),
        endTime:    pick(r, "end_time", "detection_time"),
        top:  Number(pick(r, "top", "high") ?? 0),
        bot:  Number(pick(r, "bot", "bottom", "low") ?? 0),
        side: String(pick(r, "side", "direction", "type") || "bull").toLowerCase().startsWith("b")
            ? (String(pick(r, "side", "direction", "type") || "").toLowerCase().includes("bear") ? "bear" : "bull")
            : "bear",
    }));
}

export function parseTradesCSV(text) {
    const { rows } = parseCSV(text);
    return rows.map((r, i) => {
        const directionRaw = pick(r, "direction", "side", "dir") || "Long";
        const directionText = String(directionRaw).toLowerCase();
        const direction = directionText.startsWith("bear") || directionText.startsWith("s") || directionText === "sell"
            ? "Short"
            : "Long";
        const outcomeRaw = pick(r, "outcome", "result");
        const rVal = Number(pick(r, "pnl_r", "r", "r_result", "rresult") ?? 0);
        const outcome = outcomeRaw ? cap(outcomeRaw) : (rVal >= 0 ? "Win" : "Loss");
        const structRaw = pick(r, "structure_tag", "structure", "structure_type", "type") || "BOS";
        return {
            id: String(pick(r, "id", "trade_id") || `T-${String(i + 1).padStart(3, "0")}`),
            obId: pick(r, "ob_id"),
            num: i + 1,
            direction,
            structure: String(structRaw).toUpperCase().includes("CHOCH") ? "CHoCH" : "BOS",
            session: String(pick(r, "session") || "—"),
            obOrigin:   String(pick(r, "ob_origin", "origin_time") || ""),
            detected:   String(pick(r, "detected", "detection_time") || ""),
            entry:      String(pick(r, "fill_time", "entry_time") || ""),
            exit:       String(pick(r, "exit_time", "exit") || ""),
            entryPrice: Number(pick(r, "entry", "entry_price", "entryprice") ?? 0),
            stop:       Number(pick(r, "stop", "stop_loss", "sl") ?? 0),
            tp:         Number(pick(r, "tp", "take_profit") ?? 0),
            r: rVal,
            outcome,
            obWidth:        Number(pick(r, "ob_width", "obwidth") ?? 0),
            reverseConflict: Boolean(pick(r, "reverse_conflict", "reverse_cancel")),
        };
    });
}

// ─────────────────────── Helpers ───────────────────────

function computeEquityCurve(trades) {
    let cum = 0;
    return trades.map((t, i) => {
        cum += Number(t.r) || 0;
        const ref = t.entry ? new Date(t.entry) : new Date(Date.now() - (trades.length - i) * 86400000);
        return {
            i,
            date: isFinite(ref.getTime()) ? ref.toISOString().slice(0, 10) : "",
            label: isFinite(ref.getTime()) ? ref.toLocaleString("en", { month: "short", year: "2-digit" }) : "",
            netR: Number(cum.toFixed(2)),
        };
    });
}

function computeTradeMarkers(trades, candleIdx) {
    return trades.map((t, idx) => {
        const mapped = candleIdx ? timeToCandleIndex(t.entry, candleIdx) : { i: -1, quality: "missing", time: null };
        return {
            i: mapped.i >= 0 ? mapped.i : idx * Math.max(1, Math.floor(220 / Math.max(1, trades.length))),
            time: mapped.time,
            mappingQuality: mapped.quality,
            price: t.entryPrice,
            direction: t.direction,
            win: t.outcome === "Win",
            id: t.id,
        };
    });
}

// Build a fast index lookup from a candle array.
function buildCandleIndex(candles) {
    const byTime = new Map();
    const ordered = [];
    candles.forEach((c, i) => {
        const time = c.time ?? normalizeTimestamp(c.t);
        if (time == null) return;
        byTime.set(time, i);
        ordered.push({ time, i });
    });
    ordered.sort((a, b) => a.time - b.time);
    const gaps = [];
    for (let i = 1; i < ordered.length; i++) {
        const gap = ordered[i].time - ordered[i - 1].time;
        if (gap > 0) gaps.push(gap);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3600;
    return { byTime, ordered, toleranceSec: Math.max(60, Math.floor(medianGap * 1.5)) };
}

function timeToCandleIndex(time, idx) {
    const target = normalizeTimestamp(time);
    if (target == null || !idx) return { i: -1, quality: "missing", time: null };
    if (idx.byTime.has(target)) {
        const i = idx.byTime.get(target);
        return { i, quality: "exact", time: idx.ordered.find((c) => c.i === i)?.time ?? target };
    }
    let lo = 0;
    let hi = idx.ordered.length - 1;
    let best = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (idx.ordered[mid].time <= target) {
            best = idx.ordered[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (best && target - best.time <= idx.toleranceSec) {
        return { i: best.i, quality: "nearest_prior", time: best.time };
    }
    return { i: -1, quality: "missing", time: null };
}

function detectFileKind(name) {
    const n = name.toLowerCase();
    if (n.endsWith(".json")) {
        if (n.includes("config")) return "config";
        if (n.includes("summary")) return "summary";
        return "json_unknown";
    }
    if (n.endsWith(".csv")) {
        if (n.includes("candle"))                            return "candles";
        if (n.includes("order_block") || n.includes("ob_"))  return "order_blocks";
        if (n.includes("trades_single_position"))            return "trades_single_position";
        if (n.includes("trades_allow_multi_position"))       return "trades_allow_multi_position";
        if (n.includes("trades_one_per_direction"))          return "trades_one_per_direction";
        if (n.includes("trade"))                             return "trades_unknown";
        if (n.includes("mismatch") || n.includes("parity"))  return "mismatches";
        if (n.includes("rr_sweep"))                          return "rr_sweep";
    }
    return "unknown";
}

function checkStatus(ok, missingValue = false) {
    if (missingValue) return "WARNING";
    return ok ? "PASS" : "FAIL";
}

function buildIntegrity({ collected, primaryTrades, netR, primaryVariant }) {
    const sm = collected.summary || {};
    const cfg = collected.config || {};
    const summaryTradeCount = numOrNull(pickFrom(sm, "trades", "tradeCount", "trade_count", "total_trades", "n_trades"));
    const summaryNetR = numOrNull(pickFrom(sm, "net_r", "netR"));
    const summaryObCount = numOrNull(pickFrom(sm, "obCount", "ob_count", "orderBlockCount", "order_block_count", "order_blocks_count", "order_blocks", "obs", "total_obs"));
    const parityValue = numOrNull(pickFrom(sm, "parity", "parity_score", "validation", "validation_score") ?? pickFrom(cfg, "parity", "parity_score", "validation", "validation_score"));
    const missingRequired = [];
    if (!collected.config) missingRequired.push("config.json");
    if (!collected.summary) missingRequired.push("summary.json");
    if (!collected.orderBlocks) missingRequired.push("order_blocks.csv");
    if (!Object.keys(collected.tradesByVariant).length) missingRequired.push("trades_*.csv");

    const netRTolerance = 0.01;
    const checks = {
        tradeCount: {
            status: checkStatus(summaryTradeCount === primaryTrades.length, summaryTradeCount == null),
            summary: summaryTradeCount,
            parsed: primaryTrades.length,
            variant: primaryVariant,
        },
        netR: {
            status: checkStatus(summaryNetR != null && Math.abs(summaryNetR - netR) <= netRTolerance, summaryNetR == null),
            summary: summaryNetR,
            computed: Number(netR.toFixed(4)),
            tolerance: netRTolerance,
        },
        obCount: {
            status: checkStatus(summaryObCount === collected.orderBlocks.length, summaryObCount == null),
            summary: summaryObCount,
            parsed: collected.orderBlocks.length,
        },
        requiredFiles: {
            status: missingRequired.length ? "FAIL" : "PASS",
            missing: missingRequired,
            present: collected.recognized.map((f) => f.name),
        },
        candles: {
            status: collected.candles?.length ? "PASS" : "WARNING",
            imported: !!collected.candles?.length,
            count: collected.candles?.length || 0,
            droppedForStorage: false,
        },
        parity: {
            status: parityValue == null ? "WARNING" : "PASS",
            available: parityValue != null,
            value: parityValue,
        },
    };
    const statuses = Object.values(checks).map((c) => c.status);
    return {
        status: statuses.includes("FAIL") ? "FAIL" : statuses.includes("WARNING") ? "WARNING" : "PASS",
        checks,
    };
}

// ─────────────────────── Bundle ingestion ───────────────────────

export async function ingestRunBundle(fileList) {
    const files = Array.from(fileList);
    const collected = {
        config: null, summary: null, orderBlocks: null, candles: null,
        tradesByVariant: {},
        readErrors: [],
        recognized: [],
        unrecognized: [],
    };

    for (const f of files) {
        const kind = detectFileKind(f.name);
        let text;
        try { text = await f.text(); } catch (e) {
            collected.readErrors.push({ name: f.name, error: String(e.message || e) });
            continue;
        }
        try {
            switch (kind) {
                case "config":  collected.config  = JSON.parse(text); collected.recognized.push({ name: f.name, kind }); break;
                case "summary": collected.summary = JSON.parse(text); collected.recognized.push({ name: f.name, kind }); break;
                case "candles": collected.candles = parseCandlesCSV(text); collected.recognized.push({ name: f.name, kind, rows: collected.candles.length }); break;
                case "order_blocks": collected.orderBlocks = parseOrderBlocksCSV(text); collected.recognized.push({ name: f.name, kind, rows: collected.orderBlocks.length }); break;
                case "trades_single_position":
                case "trades_allow_multi_position":
                case "trades_one_per_direction":
                case "trades_unknown": {
                    const t = parseTradesCSV(text);
                    const variantKey = kind.replace(/^trades_/, "");
                    collected.tradesByVariant[variantKey] = t;
                    collected.recognized.push({ name: f.name, kind, rows: t.length });
                    break;
                }
                default:
                    collected.unrecognized.push({ name: f.name, kind });
            }
        } catch (e) {
            collected.readErrors.push({ name: f.name, error: String(e.message || e) });
        }
    }

    // Validate required artifacts
    const missing = [];
    if (!collected.config)                            missing.push("config.json");
    if (!collected.summary)                           missing.push("summary.json");
    if (!collected.orderBlocks)                       missing.push("order_blocks.csv");
    if (!Object.keys(collected.tradesByVariant).length) missing.push("trades_*.csv");

    if (missing.length) {
        return { ok: false, missing, errors: collected.readErrors, recognized: collected.recognized, unrecognized: collected.unrecognized };
    }

    // Pick primary trades variant
    const variantPriority = ["single_position", "one_per_direction", "allow_multi_position", "unknown"];
    const primaryVariant = variantPriority.find((v) => collected.tradesByVariant[v]) || Object.keys(collected.tradesByVariant)[0];
    const primaryTrades = collected.tradesByVariant[primaryVariant];

    // Map order blocks and trades onto candle indices when possible
    const hasCandles = !!collected.candles?.length;
    const candleIdx = hasCandles ? buildCandleIndex(collected.candles) : null;
    const equityCurveByVariant = Object.fromEntries(
        Object.entries(collected.tradesByVariant).map(([variant, trades]) => [variant, computeEquityCurve(trades)]),
    );
    const tradeMarkersByVariant = Object.fromEntries(
        Object.entries(collected.tradesByVariant).map(([variant, trades]) => [variant, computeTradeMarkers(trades, candleIdx)]),
    );
    const equityCurve = equityCurveByVariant[primaryVariant] || [];

    const mappedOBs = collected.orderBlocks.map((b, idx) => {
        const explicitI0 = b.i0 != null ? Number(b.i0) : null;
        const explicitI1 = b.i1 != null ? Number(b.i1) : null;
        const mapped0 = explicitI0 != null && explicitI0 >= 0
            ? { i: explicitI0, quality: "exact", time: collected.candles?.[explicitI0]?.time ?? null }
            : (candleIdx ? timeToCandleIndex(b.originTime, candleIdx) : { i: -1, quality: "missing", time: null });
        const mapped1 = explicitI1 != null && explicitI1 >= 0
            ? { i: explicitI1, quality: "exact", time: collected.candles?.[explicitI1]?.time ?? null }
            : (candleIdx ? timeToCandleIndex(b.endTime, candleIdx) : { i: -1, quality: "missing", time: null });
        // Fallback synthetic spacing if neither indices nor candle mapping worked
        const fallbackI0 = idx * 24;
        const fallbackI1 = idx * 24 + 18;
        const mappingQuality = mapped0.quality === "missing" || mapped1.quality === "missing"
            ? "missing"
            : (mapped0.quality === "nearest_prior" || mapped1.quality === "nearest_prior" ? "nearest_prior" : "exact");
        return {
            id: b.id,
            i0: mapped0.i >= 0 ? mapped0.i : fallbackI0,
            i1: mapped1.i >= 0 ? mapped1.i : fallbackI1,
            time0: mapped0.time,
            time1: mapped1.time,
            mappingQuality,
            top: b.top,
            bot: b.bot,
            side: b.side,
        };
    });

    const tradeMarkers = tradeMarkersByVariant[primaryVariant] || [];

    // Build run id and summary
    const cfg = collected.config;
    const sm  = collected.summary;
    const id = String(sm.id || cfg.id || sm.run_id || cfg.run_id || `imported_${Date.now()}`);
    const wins = primaryTrades.filter((t) => t.outcome === "Win").length;
    const losses = primaryTrades.length - wins;
    const netR = primaryTrades.reduce((s, t) => s + (Number(t.r) || 0), 0);
    const integrity = buildIntegrity({ collected, primaryTrades, netR, primaryVariant });

    const runSummary = {
        id,
        symbol:       sm.symbol || cfg.symbol,
        detectionTf:  sm.detection_tf || cfg.detection_tf,
        executionTf:  sm.execution_tf || cfg.execution_tf || "1m",
        dateRange:    `${sm.date_from || cfg.date_from || "?"} → ${sm.date_to || cfg.date_to || "?"}`,
        rr:           Number(sm.rr ?? cfg.rr ?? 0),
        stopBuffer:   Number(sm.stop_buffer ?? cfg.stop_buffer ?? 0),
        verifyTicks:  Number(sm.verify_ticks ?? cfg.verify_ticks ?? 0),
        entryBuffer:  Number(sm.entry_buffer ?? cfg.entry_buffer ?? 0),
        trades:       primaryTrades.length,
        wins,
        losses,
        winRate:      Number((sm.win_rate ?? sm.winRate ?? (primaryTrades.length ? (wins / primaryTrades.length) * 100 : 0)).toFixed(1)),
        netR:         Number((sm.net_r ?? sm.netR ?? netR).toFixed(1)),
        validation:   Number(sm.validation ?? 100),
        integrity,
        executionMode:sm.execution_mode || cfg.execution_mode || primaryVariant,
        reverseCancels: Number(sm.reverse_cancels ?? sm.reverseCancels ?? 0),
        date:         (sm.completed_at || new Date().toISOString()).slice(0, 10),
    };

    const bundle = {
        id,
        config: cfg,
        summary: runSummary,
        trades: primaryTrades,
        tradesByVariant: collected.tradesByVariant,
        primaryVariant,
        tradeMarkers,
        tradeMarkersByVariant,
        equityCurve,
        equityCurveByVariant,
        orderBlocks: mappedOBs,
        candles: hasCandles ? collected.candles : null,
        hasCandles,
        integrity,
        importedAt: new Date().toISOString(),
    };

    return {
        ok: true,
        bundle,
        recognized: collected.recognized,
        unrecognized: collected.unrecognized,
        readErrors: collected.readErrors,
    };
}
