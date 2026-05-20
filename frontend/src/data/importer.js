// Pure-client parsers for the file importer (Settings → Data Sources).
// Supports: config.json, summary.json, trades.csv, order_blocks.csv,
//           rr_sweep.csv, mismatches.csv, sweep_*.csv.
//
// Each parser returns a partial dataset patch consumable by store.setDataset().

export function parseCSV(text) {
    const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (!rows.length) return { headers: [], rows: [] };
    const split = (line) => {
        // Minimal CSV split — supports quoted fields with commas
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
    const headers = split(rows[0]).map((h) => h.trim());
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
        if (row[n] != null) return row[n];
        const key = Object.keys(row).find((k) => k.toLowerCase() === n.toLowerCase());
        if (key) return row[key];
    }
    return null;
}

// ────────── Trades CSV → TRADES + EQUITY_CURVE ──────────
export function ingestTradesCSV(text) {
    const { rows } = parseCSV(text);
    if (!rows.length) return null;
    const trades = rows.map((r, i) => {
        const direction = String(pick(r, "direction", "side", "dir") || "Long").trim();
        const outcome = String(pick(r, "outcome", "result") || "Loss").trim();
        const rVal = Number(pick(r, "r", "rResult", "r_result") ?? (outcome === "Win" ? 3 : -1));
        return {
            id: String(pick(r, "id", "trade_id") || `T-${String(i + 1).padStart(3, "0")}`),
            num: i + 1,
            direction: direction[0].toUpperCase() + direction.slice(1).toLowerCase(),
            structure: String(pick(r, "structure", "type") || "BOS"),
            session: String(pick(r, "session") || "London"),
            obOrigin: String(pick(r, "ob_origin", "obOrigin", "origin_time") || ""),
            detected:  String(pick(r, "detected", "detection_time") || ""),
            entry:     String(pick(r, "entry", "entry_time") || ""),
            exit:      String(pick(r, "exit", "exit_time") || ""),
            entryPrice: Number(pick(r, "entry_price", "entryPrice") ?? 0),
            stop:       Number(pick(r, "stop", "sl") ?? 0),
            tp:         Number(pick(r, "tp", "take_profit") ?? 0),
            r: rVal,
            outcome: outcome[0].toUpperCase() + outcome.slice(1).toLowerCase(),
            obWidth: Number(pick(r, "ob_width", "obWidth") ?? 0),
            reverseConflict: Boolean(pick(r, "reverse_conflict", "reverseConflict")),
        };
    });

    // Equity curve from cumulative R
    let cum = 0;
    const equity = trades.map((t, i) => {
        cum += t.r;
        const d = t.entry ? new Date(t.entry) : new Date(Date.now() - (trades.length - i) * 86400000);
        return {
            i,
            date: d.toISOString().slice(0, 10),
            label: d.toLocaleString("en", { month: "short", year: "2-digit" }),
            netR: Number(cum.toFixed(2)),
        };
    });
    return { TRADES: trades, EQUITY_CURVE: equity };
}

// ────────── Order Blocks CSV → OB_BOXES ──────────
export function ingestOrderBlocksCSV(text) {
    const { rows } = parseCSV(text);
    if (!rows.length) return null;
    const boxes = rows.map((r, i) => ({
        id: String(pick(r, "id", "ob_id") || `OB-${String(i + 1).padStart(3, "0")}`),
        i0: Number(pick(r, "i0", "start_index", "origin_index") ?? i * 20),
        i1: Number(pick(r, "i1", "end_index", "detection_index") ?? i * 20 + 20),
        top: Number(pick(r, "top", "high") ?? 0),
        bot: Number(pick(r, "bot", "bottom", "low") ?? 0),
        side: String(pick(r, "side", "direction") || "bull").toLowerCase().startsWith("b") ? "bull" : "bear",
    }));
    return { OB_BOXES: boxes };
}

// ────────── RR Sweep CSV → SWEEP_RR ──────────
export function ingestRRSweepCSV(text) {
    const { rows } = parseCSV(text);
    if (!rows.length) return null;
    const sweep = rows.map((r) => ({
        rr: Number(pick(r, "rr", "RR")),
        trades: Number(pick(r, "trades")),
        winRate: Number(pick(r, "win_rate", "winRate", "wr")),
        netR: Number(pick(r, "net_r", "netR")),
        expectancy: Number(pick(r, "expectancy", "expectancy_r") ?? 0),
        pf: Number(pick(r, "pf", "profit_factor") ?? 1),
    }));
    return { SWEEP_RR: sweep };
}

// ────────── Mismatch CSV → PARITY_MISMATCHES ──────────
export function ingestMismatchesCSV(text) {
    const { rows } = parseCSV(text);
    if (!rows.length) return null;
    const out = rows.map((r, i) => ({
        id: i + 1,
        type: String(pick(r, "type", "mismatch_type") || "Outcome Mismatch"),
        tvTrade: String(pick(r, "tv_trade", "tvTrade") || "—"),
        pyTrade: String(pick(r, "py_trade", "pyTrade") || "—"),
        direction: String(pick(r, "direction", "dir") || "Long"),
        tvOutcome: String(pick(r, "tv_outcome", "tvOutcome") || "—"),
        pyOutcome: String(pick(r, "py_outcome", "pyOutcome") || "—"),
        entryTimeDiff: String(pick(r, "entry_time_diff", "entryTimeDiff") || "0m"),
        entryPriceDiff: String(pick(r, "entry_price_diff", "entryPriceDiff") || "0 pip"),
        exitPriceDiff: String(pick(r, "exit_price_diff", "exitPriceDiff") || "0 pip"),
    }));
    return { PARITY_MISMATCHES: out };
}

// ────────── Summary JSON → ACTIVE_RUN + RUNS append ──────────
export function ingestSummaryJSON(text) {
    const obj = JSON.parse(text);
    const run = {
        id: obj.id || `${obj.symbol}_${obj.detection_tf || obj.detectionTf}_RR${obj.rr}`,
        symbol: obj.symbol,
        detectionTf: obj.detection_tf || obj.detectionTf,
        executionTf: obj.execution_tf || obj.executionTf || "1m",
        dateRange: `${obj.date_from || obj.dateFrom} → ${obj.date_to || obj.dateTo}`,
        rr: Number(obj.rr),
        stopBuffer: Number(obj.stop_buffer ?? obj.stopBuffer ?? 1),
        verifyTicks: Number(obj.verify_ticks ?? obj.verifyTicks ?? 0),
        trades: Number(obj.trades ?? 0),
        wins: Number(obj.wins ?? 0),
        losses: Number(obj.losses ?? 0),
        winRate: Number(obj.win_rate ?? obj.winRate ?? 0),
        netR: Number(obj.net_r ?? obj.netR ?? 0),
        validation: Number(obj.validation ?? 0),
        executionMode: obj.execution_mode || obj.executionMode || "single_position",
        date: (obj.completed_at || new Date().toISOString()).slice(0, 10),
        entryBuffer: Number(obj.entry_buffer ?? obj.entryBuffer ?? 0),
        reverseCancels: Number(obj.reverse_cancels ?? obj.reverseCancels ?? 0),
    };
    return { ACTIVE_RUN: run };
}

// ────────── Config JSON → no-op metadata patch ──────────
export function ingestConfigJSON(text) {
    const obj = JSON.parse(text);
    return { __config: obj };
}

// ────────── Dispatch by filename ──────────
export function detectAndIngest(file, text) {
    const n = file.name.toLowerCase();
    if (n.endsWith(".json") && n.includes("summary"))      return { kind: "summary",   patch: ingestSummaryJSON(text) };
    if (n.endsWith(".json") && n.includes("config"))       return { kind: "config",    patch: ingestConfigJSON(text) };
    if (n.endsWith(".csv")  && n.includes("trade"))        return { kind: "trades",    patch: ingestTradesCSV(text) };
    if (n.endsWith(".csv")  && (n.includes("order_block") || n.includes("ob"))) return { kind: "order_blocks", patch: ingestOrderBlocksCSV(text) };
    if (n.endsWith(".csv")  && (n.includes("rr_sweep") || n.includes("rrsweep") || n.includes("sweep_rr"))) return { kind: "rr_sweep", patch: ingestRRSweepCSV(text) };
    if (n.endsWith(".csv")  && (n.includes("mismatch") || n.includes("parity"))) return { kind: "mismatches", patch: ingestMismatchesCSV(text) };
    // Fallback by content type — try to detect by header
    if (n.endsWith(".csv")) {
        const head = text.split(/\r?\n/, 1)[0].toLowerCase();
        if (head.includes("entry_price"))   return { kind: "trades",        patch: ingestTradesCSV(text) };
        if (head.includes("top") && head.includes("bot")) return { kind: "order_blocks", patch: ingestOrderBlocksCSV(text) };
        if (head.includes("rr") && head.includes("net_r")) return { kind: "rr_sweep",   patch: ingestRRSweepCSV(text) };
        if (head.includes("mismatch"))      return { kind: "mismatches",    patch: ingestMismatchesCSV(text) };
    }
    return { kind: "unknown", patch: null };
}
