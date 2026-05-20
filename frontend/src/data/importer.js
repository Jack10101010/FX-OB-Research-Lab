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

// ─────────────────────── Parsers ───────────────────────

export function parseCandlesCSV(text) {
    const { rows } = parseCSV(text);
    return rows.map((r, i) => ({
        i,
        t: String(pick(r, "time", "timestamp", "datetime", "date") || ""),
        o: Number(pick(r, "open", "o") ?? 0),
        h: Number(pick(r, "high", "h") ?? 0),
        l: Number(pick(r, "low", "l") ?? 0),
        c: Number(pick(r, "close", "c") ?? 0),
    }));
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
        const direction = String(directionRaw).toLowerCase().startsWith("s") ? "Short" : "Long";
        const outcomeRaw = pick(r, "outcome", "result");
        const rVal = Number(pick(r, "r", "r_result", "rresult") ?? 0);
        const outcome = outcomeRaw ? cap(outcomeRaw) : (rVal >= 0 ? "Win" : "Loss");
        const structRaw = pick(r, "structure", "structure_type", "type") || "BOS";
        return {
            id: String(pick(r, "id", "trade_id") || `T-${String(i + 1).padStart(3, "0")}`),
            num: i + 1,
            direction,
            structure: String(structRaw).toUpperCase().includes("CHOCH") ? "CHoCH" : "BOS",
            session: String(pick(r, "session") || "—"),
            obOrigin:   String(pick(r, "ob_origin", "origin_time") || ""),
            detected:   String(pick(r, "detected", "detection_time") || ""),
            entry:      String(pick(r, "entry", "entry_time") || ""),
            exit:       String(pick(r, "exit", "exit_time") || ""),
            entryPrice: Number(pick(r, "entry_price", "entryprice") ?? 0),
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

// Build a fast index lookup from a candle array.
// Returns ts→index map keyed by ISO YYYY-MM-DD or full timestamp.
function buildCandleIndex(candles) {
    const byExact = new Map();
    const byDay = new Map();
    candles.forEach((c, i) => {
        if (!c.t) return;
        byExact.set(String(c.t), i);
        byDay.set(String(c.t).slice(0, 10), i);
    });
    return { byExact, byDay };
}

function timeToCandleIndex(time, idx) {
    if (!time || !idx) return -1;
    const s = String(time);
    if (idx.byExact.has(s)) return idx.byExact.get(s);
    const day = s.slice(0, 10);
    if (idx.byDay.has(day)) return idx.byDay.get(day);
    return -1;
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

    // Compute equity curve from primary trades
    const equityCurve = computeEquityCurve(primaryTrades);

    // Map order blocks and trades onto candle indices when possible
    const hasCandles = !!collected.candles?.length;
    const candleIdx = hasCandles ? buildCandleIndex(collected.candles) : null;

    const mappedOBs = collected.orderBlocks.map((b, idx) => {
        const i0 = b.i0 != null ? Number(b.i0) : timeToCandleIndex(b.originTime, candleIdx);
        const i1 = b.i1 != null ? Number(b.i1) : timeToCandleIndex(b.endTime,    candleIdx);
        // Fallback synthetic spacing if neither indices nor candle mapping worked
        const fallbackI0 = idx * 24;
        const fallbackI1 = idx * 24 + 18;
        return {
            id: b.id,
            i0: i0 != null && i0 >= 0 ? i0 : fallbackI0,
            i1: i1 != null && i1 >= 0 ? i1 : fallbackI1,
            top: b.top,
            bot: b.bot,
            side: b.side,
        };
    });

    const tradeMarkers = primaryTrades.map((t, idx) => {
        const i = candleIdx ? timeToCandleIndex(t.entry, candleIdx) : -1;
        return {
            i: i >= 0 ? i : idx * Math.max(1, Math.floor(220 / Math.max(1, primaryTrades.length))),
            price: t.entryPrice,
            direction: t.direction,
            win: t.outcome === "Win",
            id: t.id,
        };
    });

    // Build run id and summary
    const cfg = collected.config;
    const sm  = collected.summary;
    const id = String(sm.id || cfg.id || sm.run_id || cfg.run_id || `imported_${Date.now()}`);
    const wins = primaryTrades.filter((t) => t.outcome === "Win").length;
    const losses = primaryTrades.length - wins;
    const netR = primaryTrades.reduce((s, t) => s + (Number(t.r) || 0), 0);

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
        equityCurve,
        orderBlocks: mappedOBs,
        candles: hasCandles ? collected.candles : null,
        hasCandles,
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
