// fftDisplay.js — shared, DISPLAY-ONLY FFT helpers + constants.
//
// FFT-IA Phase 1: these are copied VERBATIM from the inline definitions in
// pages/RunDetail.jsx so the new Protection Lab FFT tab renders and reconciles
// identically. No analytics/pairing/formula changes — every function here is a
// pure display helper. RunDetail still keeps its own inline copies in Phase 1;
// Phase 2 will switch RunDetail to import from here and delete the duplicates.

import {
    isPerformanceTrade,
    isWinTrade,
    isLossTrade,
    buildDirStructMatrix,
} from "@/data/tradeClassification";
import { obSizeBucket } from "@/data/obRetestResearch";
import { summarizeAccountEquity } from "@/components/lab/account/accountEquity";

// ── R parsing (copied from RunDetail numericTradeR / parseNumericValue) ────────
export function parseNumericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(String(value ?? "").replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

export function numericTradeR(trade) {
    const raw = trade?.r ?? trade?.net_r ?? trade?.netR ?? trade?.pnl_r ?? trade?.pnlR ?? trade?.resultR ?? trade?.news_flatten_r;
    return parseNumericValue(raw);
}

// Real-entry performance trade (mirrors RunDetail.isValidExecutedTrade).
export const isValidExecutedTrade = isPerformanceTrade;

// +1 win / -1 loss / 0 flat (mirrors RunDetail.tradeResultSign).
export function tradeResultSign(trade) {
    if (isWinTrade(trade)) return 1;
    if (isLossTrade(trade)) return -1;
    return 0;
}

// ── computeStripMetrics — DISPLAY ONLY (copied from RunDetail) ─────────────────
// Mirrors the selected-scenario KPI math (valid trades → Net R / win rate / PF /
// max DD, plus the account summary) so OFF/ON mini-strips use identical logic.
export function computeStripMetrics(trades, accountSettings) {
    const valid = Array.isArray(trades) ? trades.filter(isValidExecutedTrade) : [];
    let netR = 0, grossWins = 0, grossLosses = 0, wins = 0, losses = 0;
    let cumR = 0, peak = 0, worst = 0;
    for (const t of valid) {
        const r = numericTradeR(t) ?? 0;
        netR += r;
        if (r > 0) grossWins += r; else if (r < 0) grossLosses += Math.abs(r);
        const sign = tradeResultSign(t);
        if (sign > 0) wins += 1; else if (sign < 0) losses += 1;
        cumR += r;
        if (cumR > peak) peak = cumR;
        const dd = cumR - peak;
        if (dd < worst) worst = dd;
    }
    return {
        tradeCount: valid.length,
        netR,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        pf: grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? Infinity : null),
        maxDdR: valid.length ? Math.abs(worst) : null,
        account: summarizeAccountEquity(valid, accountSettings),
    };
}

// ── dirStructSanityRows — DISPLAY ONLY (copied from RunDetail) ─────────────────
export function dirStructSanityRows(trades) {
    const m = buildDirStructMatrix(trades);
    const find = (dir, struct) => m.rows.find((r) => r.dir === dir && r.struct === struct) || { win: 0, loss: 0, flat: 0 };
    return [
        { label: "L · BOS",   ...find("long", "BOS") },
        { label: "L · CHoCH", ...find("long", "CHoCH") },
        { label: "S · BOS",   ...find("short", "BOS") },
        { label: "S · CHoCH", ...find("short", "CHoCH") },
    ];
}

// ── FFT tooltip copy (copied from RunDetail FFT_TIPS) ──────────────────────────
export const FFT_TIPS = {
    cancels:       "Number of OBs removed by First Failed Visit before the trigger was reached.",
    winsRemoved:   "Cancelled OBs that became winners in the matching FFT-OFF control. This is the cost side of FFT protection.",
    lossesAvoided: "Cancelled OBs that became losers in the matching FFT-OFF control. This is the benefit side of FFT protection.",
    netR:          "High-confidence attributed impact: net R from HIGH-confidence paired cancels only (losses avoided minus winners removed). This may differ from the whole-strategy delta (FFT ON − FFT OFF) in the verdict above, which counts every cancelled setup.",
    known:         "Cancelled OBs with a trustworthy paired FFT-OFF result. These are the rows counted in Wins Removed, Losses Avoided, and Net R Impact.",
    unknown:       "Cancelled OBs not counted in Net R Impact, split by reason below. Most are informative, not noise — see the breakdown.",
    moveAway:      "Average distance price moved away from the OB before FFT cancelled it.",
    badge:         "This run includes its own FFT-OFF control CSV. Paired metrics are using that automatic control, not ghost simulation.",
};

// ── Net-R-impact loss outcomes (copied from RunDetail FFT_LOSS_OUTCOMES) ───────
export const FFT_LOSS_OUTCOMES = new Set(["LOSS", "NEWS_FLATTEN", "PROTECTION_EXIT"]);

// ── Width buckets (copied from RunDetail FFT-WIDTH helpers) ────────────────────
export const FFT_WIDTH_CANON = [
    { key: "small",   label: "Small",   range: "< 10p" },
    { key: "medium",  label: "Medium",  range: "10–20p" },
    { key: "large",   label: "Large",   range: "> 20p" },
    { key: "unknown", label: "Unknown", range: "no width" },
];
export const FFT_WIDTH_FINE = [
    { key: "0-5",   label: "0–5p",   lo: 0,  hi: 5 },
    { key: "5-10",  label: "5–10p",  lo: 5,  hi: 10 },
    { key: "10-15", label: "10–15p", lo: 10, hi: 15 },
    { key: "15-20", label: "15–20p", lo: 15, hi: 20 },
    { key: "20-25", label: "20–25p", lo: 20, hi: 25 },
    { key: "25-30", label: "25–30p", lo: 25, hi: 30 },
    { key: "30+",   label: "30p+",   lo: 30, hi: Infinity },
];

export function fftWidthCanonKey(pips) {
    const lbl = String(obSizeBucket(pips) || "");
    if (lbl.startsWith("small"))  return "small";
    if (lbl.startsWith("medium")) return "medium";
    if (lbl.startsWith("large"))  return "large";
    return "unknown";
}
export function fftWidthFineKey(pips) {
    if (pips == null || pips === "" || !Number.isFinite(Number(pips))) return "unknown";
    const x = Number(pips);
    for (const b of FFT_WIDTH_FINE) { if (x >= b.lo && x < b.hi) return b.key; }
    return "30+";
}

// Aggregate one bucketing scheme. Pure. `pairs` = computePairedFftAnalytics().pairs;
// onPerf/offPerf = already performance-filtered ON / control trade arrays.
export function aggregateFftWidth(pairs, onPerf, offPerf, keyOf, defs) {
    const blank = () => ({ cancels: 0, high: 0, winsRemoved: 0, lossesAvoided: 0, highImpact: 0, onR: 0, onN: 0, offR: 0, offN: 0 });
    const map = new Map(defs.map((d) => [d.key, blank()]));
    const get = (k) => { if (!map.has(k)) map.set(k, blank()); return map.get(k); };
    for (const p of (Array.isArray(pairs) ? pairs : [])) {
        const g = get(keyOf(p?.cancelTrade?.obWidthPips));
        g.cancels += 1;
        if (p.confidence === "HIGH") {
            g.high += 1;
            const oc = p.pairedOffOutcome;
            if (oc === "WIN") { g.winsRemoved += 1; if (p.pairedOffR != null) g.highImpact -= p.pairedOffR; }
            else if (FFT_LOSS_OUTCOMES.has(oc)) { g.lossesAvoided += 1; if (p.pairedOffR != null) g.highImpact -= p.pairedOffR; }
        }
    }
    for (const t of (Array.isArray(onPerf)  ? onPerf  : [])) { const g = get(keyOf(t?.obWidthPips)); g.onR  += numericTradeR(t) ?? 0; g.onN += 1; }
    for (const t of (Array.isArray(offPerf) ? offPerf : [])) { const g = get(keyOf(t?.obWidthPips)); g.offR += numericTradeR(t) ?? 0; g.offN += 1; }
    const rows = defs.map((d) => { const g = get(d.key); return { ...d, ...g, strategyDelta: g.onR - g.offR }; });
    if (!defs.some((d) => d.key === "unknown")) {
        const u = map.get("unknown");
        if (u && (u.cancels || u.onN || u.offN)) rows.push({ key: "unknown", label: "Unknown", range: "no width", ...u, strategyDelta: u.onR - u.offR });
    }
    return rows.filter((r) => r.cancels > 0 || r.onN > 0 || r.offN > 0);
}

// Per-bucket verdict with a min-sample guard (audit rule: ≥10 cancels & ≥5 HIGH).
export function fftWidthVerdict(row) {
    if (row.cancels < 10 || row.high < 5) return { tone: "muted", text: "low N" };
    if (row.highImpact > 0.05)  return { tone: "success", text: "FFT helps" };
    if (row.highImpact < -0.05) return { tone: "danger",  text: "FFT hurts" };
    return { tone: "muted", text: "neutral" };
}

export const fftWidthTone = (t) => t === "success" ? "text-[hsl(var(--success))]" : t === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]";
export const fftSignR = (v, d = 1) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(d)}R`;
