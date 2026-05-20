// Mock research data for FX-OB Research Lab
// Realistic densities; structured to be replaceable with Python CSV/JSON outputs

const seedRng = (s) => {
    let x = s >>> 0;
    return () => {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        return ((x >>> 0) % 100000) / 100000;
    };
};

// ─────────────── Active validated run summary ───────────────
export const ACTIVE_RUN = {
    id: "EURUSD_M15_RR3.3",
    symbol: "EURUSD",
    detectionTf: "M15",
    executionTf: "1m",
    dateFrom: "2025-05-18",
    dateTo: "2026-05-18",
    rr: 3.3,
    stopBuffer: 1,
    entryBuffer: 0,
    verifyTicks: 0,
    trades: 137,
    wins: 41,
    losses: 96,
    winRate: 29.9,
    netR: 39.3,
    expectancy: 0.287,
    profitFactor: 1.49,
    maxDrawdown: -8.2,
    reverseCancels: 2,
    reverseCancelsPct: 1.5,
    validation: 98.2,
    executionMode: "single_position",
    direction: "Both",
    structureType: "Both",
    swingLength: 7,
    obFilter: "ATR",
    sessions: ["London", "New York"],
};

// ─────────────── Runs inventory (24 runs) ───────────────
const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"];
const TFS = ["M5", "M15", "M30", "H1"];

export const RUNS = (() => {
    const rng = seedRng(42);
    const list = [];
    const seeds = [
        ["EURUSD","M15",3.3,137,29.9,39.3,98.2],
        ["EURUSD","M15",2.5,137,34.3,27.5,97.9],
        ["EURUSD","M15",3.0,137,32.1,39.0,98.0],
        ["EURUSD","M15",4.0,135,28.1,55.0,98.4],
        ["EURUSD","M15",2.0,139,39.6,26.0,96.8],
        ["GBPUSD","M15",3.3,142,28.2,31.7,97.1],
        ["GBPUSD","M15",2.5,148,32.4,28.4,96.3],
        ["GBPUSD","H1",3.3, 88,33.0,26.1,95.4],
        ["EURUSD","H1", 3.3, 66,32.4,22.1,94.8],
        ["EURUSD","M5", 2.5,210,33.8,41.2,96.0],
        ["EURUSD","M5", 3.0,205,31.2,46.7,96.2],
        ["USDJPY","M15",3.0,124,30.6,28.9,95.7],
        ["USDJPY","M15",3.3,121,28.9,31.4,96.0],
        ["USDJPY","H1", 3.3, 71,29.6,19.4,94.1],
        ["XAUUSD","M15",3.0, 96,34.4,33.8,93.7],
        ["XAUUSD","M15",3.3, 92,31.5,38.2,93.9],
        ["XAUUSD","M30",3.3, 58,36.2,22.6,92.5],
        ["AUDUSD","M15",3.3,118,27.1,24.2,95.0],
        ["AUDUSD","M15",2.5,125,32.0,21.4,94.6],
        ["EURUSD","M30",3.3, 84,30.9,28.7,96.9],
        ["EURUSD","M30",4.0, 82,27.4,38.1,97.0],
        ["GBPUSD","M30",3.3, 92,29.3,26.5,95.8],
        ["GBPUSD","M5", 3.0,232,30.7,52.1,95.0],
        ["EURUSD","M15",3.5,136,29.1,42.7,98.0],
    ];
    seeds.forEach((s, i) => {
        const [sym, tf, rr, trades, wr, netR, val] = s;
        const stopBuffer = [0.5, 1.0, 1.5, 2.0][Math.floor(rng() * 4)];
        const verify = [0, 1, 2, 3][Math.floor(rng() * 4)];
        const date = new Date(2025, 4 + (i % 6), 12 + (i % 14));
        list.push({
            id: `${sym}_${tf}_RR${rr}${i > 4 ? `_v${i}` : ""}`,
            symbol: sym,
            detectionTf: tf,
            executionTf: tf === "H1" ? "5m" : "1m",
            dateRange: "2025-05-18 → 2026-05-18",
            rr,
            stopBuffer,
            verifyTicks: verify,
            trades,
            wins: Math.round((trades * wr) / 100),
            losses: trades - Math.round((trades * wr) / 100),
            winRate: wr,
            netR,
            validation: val,
            executionMode: i % 3 === 0 ? "single_position" : i % 3 === 1 ? "one_per_direction" : "allow_multi_position",
            date: date.toISOString().slice(0, 10),
        });
    });
    return list;
})();

// ─────────────── Equity curve (latest run) ───────────────
export const EQUITY_CURVE = (() => {
    const rng = seedRng(7);
    const points = 260;
    const arr = [];
    let val = 0;
    const startDate = new Date(2025, 4, 18);
    // Deliberately seed a few realistic drawdown periods so visual + Max DD
    // calculations tell a believable story.
    const dipZones = [
        { start: 55,  len: 18, intensity: 0.32 },
        { start: 110, len: 14, intensity: 0.38 },
        { start: 175, len: 22, intensity: 0.42 },
        { start: 225, len: 10, intensity: 0.30 },
    ];
    for (let i = 0; i < points; i++) {
        const inDip = dipZones.find((d) => i >= d.start && i < d.start + d.len);
        const trend = inDip ? -inDip.intensity : 0.24;
        const noise = (rng() - 0.42) * 1.3;
        val += trend + noise;
        const d = new Date(startDate.getTime() + i * 36 * 3600 * 1000);
        arr.push({
            i,
            date: d.toISOString().slice(0, 10),
            label: d.toLocaleString("en", { month: "short", year: "2-digit" }),
            netR: Number(val.toFixed(2)),
        });
    }
    // Anchor the final value to the published +39.3R while preserving the dip shape.
    const last = arr[arr.length - 1].netR || 1;
    const factor = 39.3 / last;
    return arr.map((p) => ({ ...p, netR: Number((p.netR * factor).toFixed(2)) }));
})();

// ─────────────── Trades for active run (137 trades) ───────────────
export const TRADES = (() => {
    const rng = seedRng(99);
    const out = [];
    const structures = ["BOS", "CHoCH"];
    const sessions = ["London", "London Lull", "New York", "Asia", "Outside"];
    let dt = new Date(2025, 4, 19, 8, 30);
    for (let i = 0; i < 137; i++) {
        const direction = rng() > 0.48 ? "Long" : "Short";
        const win = rng() < 0.299;
        const structure = structures[Math.floor(rng() * 2)];
        const session = sessions[Math.floor(rng() * sessions.length)];
        const entryPrice = 1.07 + rng() * 0.06;
        const r = win ? 3.3 : -1.0;
        const reverseConflict = rng() < 0.04;
        const obWidth = Number((6 + rng() * 22).toFixed(1));
        dt = new Date(dt.getTime() + (8 + Math.floor(rng() * 90)) * 3600 * 1000);
        out.push({
            id: `T-${String(i + 1).padStart(3, "0")}`,
            num: i + 1,
            direction,
            structure,
            session,
            obOrigin: new Date(dt.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "),
            detected: new Date(dt.getTime() - 2 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "),
            entry: dt.toISOString().slice(0, 16).replace("T", " "),
            exit: new Date(dt.getTime() + (1 + Math.floor(rng() * 30)) * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "),
            entryPrice: Number(entryPrice.toFixed(5)),
            stop: Number((entryPrice - (direction === "Long" ? 0.0023 : -0.0023)).toFixed(5)),
            tp: Number((entryPrice + (direction === "Long" ? 0.0076 : -0.0076)).toFixed(5)),
            r,
            outcome: win ? "Win" : "Loss",
            obWidth,
            reverseConflict,
        });
    }
    return out;
})();

// ─────────────── R distribution histogram ───────────────
export const R_DIST = [
    { bucket: "-3R", count: 4 },
    { bucket: "-2R", count: 9 },
    { bucket: "-1R", count: 83 },
    { bucket: "0R",  count: 0 },
    { bucket: "1R",  count: 0 },
    { bucket: "2R",  count: 0 },
    { bucket: "3R",  count: 38 },
    { bucket: "4R+", count: 3 },
];

// ─────────────── Monthly performance ───────────────
export const MONTHLY = [
    { m: "May", v:  2.4 },
    { m: "Jun", v:  6.1 },
    { m: "Jul", v: -1.2 },
    { m: "Aug", v:  4.8 },
    { m: "Sep", v:  3.6 },
    { m: "Oct", v: -2.0 },
    { m: "Nov", v:  5.4 },
    { m: "Dec", v:  7.2 },
    { m: "Jan", v:  4.0 },
    { m: "Feb", v:  3.1 },
    { m: "Mar", v:  4.5 },
    { m: "Apr", v:  1.4 },
];

// ─────────────── Sweep data ───────────────
export const SWEEP_RR = [
    { rr: 2.0, trades: 139, winRate: 39.6, netR: 26.0, expectancy: 0.187, pf: 1.19 },
    { rr: 2.5, trades: 137, winRate: 34.3, netR: 27.5, expectancy: 0.201, pf: 1.28 },
    { rr: 3.0, trades: 137, winRate: 32.1, netR: 39.0, expectancy: 0.285, pf: 1.44 },
    { rr: 3.3, trades: 137, winRate: 29.9, netR: 39.3, expectancy: 0.287, pf: 1.49 },
    { rr: 3.5, trades: 136, winRate: 29.1, netR: 42.7, expectancy: 0.314, pf: 1.52 },
    { rr: 4.0, trades: 135, winRate: 28.1, netR: 55.0, expectancy: 0.407, pf: 1.62 },
    { rr: 5.0, trades: 132, winRate: 24.2, netR: 49.2, expectancy: 0.373, pf: 1.41 },
];

export const SWEEP_STOP_BUFFER = [
    { sb: 0.5, trades: 142, winRate: 31.0, netR: 32.1, expectancy: 0.226 },
    { sb: 1.0, trades: 137, winRate: 29.9, netR: 39.3, expectancy: 0.287 },
    { sb: 1.5, trades: 130, winRate: 28.5, netR: 42.0, expectancy: 0.323 },
    { sb: 2.0, trades: 121, winRate: 27.3, netR: 38.4, expectancy: 0.317 },
    { sb: 2.5, trades: 114, winRate: 26.3, netR: 31.9, expectancy: 0.280 },
    { sb: 3.0, trades: 104, winRate: 25.0, netR: 24.1, expectancy: 0.232 },
];

export const SWEEP_ENTRY_BUFFER = [
    { eb: 0.0, trades: 137, winRate: 29.9, netR: 39.3 },
    { eb: 0.5, trades: 131, winRate: 28.2, netR: 34.6 },
    { eb: 1.0, trades: 122, winRate: 27.0, netR: 26.4 },
    { eb: 1.5, trades: 110, winRate: 25.4, netR: 18.0 },
    { eb: 2.0, trades:  96, winRate: 24.0, netR: 11.5 },
];

export const SWEEP_VERIFY = [
    { vt: 0, trades: 137, winRate: 29.9, netR: 39.3 },
    { vt: 1, trades: 134, winRate: 30.6, netR: 41.2 },
    { vt: 2, trades: 128, winRate: 31.2, netR: 42.5 },
    { vt: 3, trades: 119, winRate: 32.7, netR: 38.0 },
];

export const SWEEP_TF = [
    { tf: "M5",  trades: 210, winRate: 33.8, netR: 41.2 },
    { tf: "M15", trades: 137, winRate: 29.9, netR: 39.3 },
    { tf: "M30", trades:  84, winRate: 30.9, netR: 28.7 },
    { tf: "H1",  trades:  66, winRate: 32.4, netR: 22.1 },
    { tf: "H4",  trades:  28, winRate: 35.7, netR: 14.6 },
];

export const SWEEP_PAIR = [
    { pair: "EURUSD", trades: 137, winRate: 29.9, netR: 39.3 },
    { pair: "GBPUSD", trades: 142, winRate: 28.2, netR: 31.7 },
    { pair: "USDJPY", trades: 121, winRate: 28.9, netR: 31.4 },
    { pair: "XAUUSD", trades:  92, winRate: 31.5, netR: 38.2 },
    { pair: "AUDUSD", trades: 118, winRate: 27.1, netR: 24.2 },
    { pair: "NZDUSD", trades: 106, winRate: 28.4, netR: 22.0 },
];

export const SWEEP_SESSION = [
    { session: "London",      trades: 58, winRate: 32.8, netR: 19.6 },
    { session: "London Lull", trades: 14, winRate: 21.4, netR: -1.8 },
    { session: "New York",    trades: 46, winRate: 30.4, netR: 16.4 },
    { session: "Asia",        trades: 12, winRate: 25.0, netR:  1.4 },
    { session: "Outside",     trades:  7, winRate: 28.5, netR:  3.7 },
];

export const SWEEP_HEATMAP = (() => {
    const rrs = [2.0, 2.5, 3.0, 3.3, 4.0];
    const sbs = [0.5, 1.0, 1.5, 2.0, 2.5];
    const cells = [];
    const rng = seedRng(13);
    rrs.forEach((rr) => sbs.forEach((sb) => {
        const base = 12 + rr * sb * 4 + (3.3 - Math.abs(rr - 3.3)) * 6;
        cells.push({ rr, sb, netR: Number((base + (rng() - 0.5) * 6).toFixed(1)) });
    }));
    return { rrs, sbs, cells };
})();

// ─────────────── Parity Debugger ───────────────
export const PARITY = {
    tvTrades: 137,
    pyTrades: 137,
    matched: 130,
    outcomeMatch: 126,
    unmatchedTv: 7,
    extraPy: 7,
    outcomeMismatch: 4,
    score: 98.2,
};

export const PARITY_MISMATCHES = (() => {
    const rng = seedRng(55);
    const types = ["Outcome Mismatch", "Entry Time Diff", "Entry Price Diff", "Unmatched TV", "Extra Python"];
    const out = [];
    for (let i = 0; i < 31; i++) {
        const t = types[i % types.length];
        const dir = rng() > 0.5 ? "Long" : "Short";
        const tvOut = rng() > 0.5 ? "Win" : "Loss";
        const pyOut = t === "Outcome Mismatch" ? (tvOut === "Win" ? "Loss" : "Win") : tvOut;
        out.push({
            id: i + 1,
            type: t,
            tvTrade: t === "Extra Python" ? "—" : `#${60 + i}`,
            pyTrade: t === "Unmatched TV" ? "—" : `PY #${60 + i}`,
            direction: dir,
            tvOutcome: t === "Extra Python" ? "—" : tvOut,
            pyOutcome: t === "Unmatched TV" ? "—" : pyOut,
            entryTimeDiff: t === "Entry Time Diff" ? `${(rng() * 30) | 0}m` : "0m",
            entryPriceDiff: t === "Entry Price Diff" ? `${(rng() * 0.6 - 0.3).toFixed(2)} pip` : "0.0 pip",
            exitPriceDiff: `${(rng() * 0.4 - 0.2).toFixed(2)} pip`,
        });
    }
    return out;
})();

// ─────────────── Candles + OB rectangles for Strategy Map ───────────────
export const CANDLES = (() => {
    const rng = seedRng(123);
    const N = 220;
    const candles = [];
    let p = 1.084;
    const start = new Date(2025, 4, 20).getTime();
    for (let i = 0; i < N; i++) {
        const drift = (rng() - 0.49) * 0.0014;
        const open = p;
        const close = open + drift;
        const range = 0.0009 + rng() * 0.0024;
        const high = Math.max(open, close) + rng() * range;
        const low = Math.min(open, close) - rng() * range;
        candles.push({
            i,
            t: new Date(start + i * 4 * 3600 * 1000).toISOString().slice(0, 10),
            o: Number(open.toFixed(5)),
            h: Number(high.toFixed(5)),
            l: Number(low.toFixed(5)),
            c: Number(close.toFixed(5)),
        });
        p = close;
    }
    return candles;
})();

// OB boxes are derived from real candle highs/lows so they always sit within the visible chart range.
export const OB_BOXES = (() => {
    const ranges = [[12, 28], [40, 58], [68, 86], [96, 116], [128, 148], [156, 178], [188, 210]];
    return ranges.map((r, idx) => {
        const seg = CANDLES.slice(r[0], r[1] + 1);
        const hi = Math.max(...seg.map((c) => c.h));
        const lo = Math.min(...seg.map((c) => c.l));
        const mid = (hi + lo) / 2;
        const side = idx % 2 === 0 ? "bull" : "bear";
        const top = side === "bull" ? mid + 0.0006 : hi - 0.0002;
        const bot = side === "bull" ? lo + 0.0002 : mid - 0.0006;
        return { i0: r[0], i1: r[1], top: Number(top.toFixed(5)), bot: Number(bot.toFixed(5)), side, id: `OB-00${idx + 1}` };
    });
})();

export const TRADE_MARKERS = (() => {
    const rng = seedRng(7);
    const out = [];
    OB_BOXES.forEach((b, idx) => {
        for (let k = 0; k < 2 + (idx % 2); k++) {
            const i = b.i1 + 1 + k * 3;
            const win = rng() > 0.6;
            out.push({
                i,
                price: b.side === "bull" ? b.top : b.bot,
                direction: b.side === "bull" ? "Long" : "Short",
                win,
                obId: b.id,
            });
        }
    });
    return out;
})();

// ─────────────── Comparison runs ───────────────
export const COMPARISON_DELTAS = [
    { metric: "Net R",          a: "+39.3R", b: "+31.7R", diff: "+7.6R",  pos: true },
    { metric: "Trades",         a: "137",    b: "142",    diff: "-5",     pos: false },
    { metric: "Win Rate",       a: "29.9%",  b: "28.2%",  diff: "+1.7%",  pos: true },
    { metric: "Expectancy",     a: "0.287R", b: "0.223R", diff: "+0.064R", pos: true },
    { metric: "Profit Factor",  a: "1.49",   b: "1.32",   diff: "+0.17",  pos: true },
    { metric: "Max Drawdown",   a: "-8.2R",  b: "-9.6R",  diff: "+1.4R",  pos: true },
    { metric: "Avg Win",        a: "2.06R",  b: "1.96R",  diff: "+0.10R", pos: true },
    { metric: "Avg Loss",       a: "-1.00R", b: "-1.00R", diff: "0.00",   pos: null },
    { metric: "Reverse Cancels",a: "2",      b: "5",      diff: "-3",     pos: true },
];

// ─────────────── Monte Carlo (placeholder mock) ───────────────
export const MC_DRAWDOWN_DIST = (() => {
    const rng = seedRng(31);
    const out = [];
    for (let i = -25; i <= -2; i++) {
        out.push({ dd: i, count: Math.max(0, Math.round(120 * Math.exp(-Math.pow((i + 9) / 4, 2)) + rng() * 6)) });
    }
    return out;
})();

export const MC_EQUITY_BANDS = (() => {
    const rng = seedRng(41);
    const N = 200;
    const out = [];
    let mid = 0, low = 0, high = 0, worst = 0;
    for (let i = 0; i < N; i++) {
        mid   += 0.20 + (rng() - 0.5) * 0.5;
        low   += 0.06 + (rng() - 0.5) * 0.7;
        high  += 0.34 + (rng() - 0.5) * 0.5;
        worst += -0.04 + (rng() - 0.5) * 0.4;
        out.push({ i, low: Number(low.toFixed(2)), mid: Number(mid.toFixed(2)), high: Number(high.toFixed(2)), worst: Number(worst.toFixed(2)) });
    }
    return out;
})();
