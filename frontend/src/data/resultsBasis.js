// ─────────────────────────────────────────────────────────────────────────────
// resultsBasis.js — Results Basis foundation (Phase RB-1)
//
//   Trade Universe  = "Which trades am I looking at?"   (data/tradeUniverse.js)
//   Results Basis   = "How am I measuring them?"        (THIS MODULE)
//
// This is the single, pure, framework-free calculation layer that every
// analytics surface will eventually route through. Phase RB-1 ships the
// infrastructure ONLY — no page consumes it yet, and no visible analytics
// change. See RESULTS_BASIS_IMPLEMENTATION_ROADMAP.md.
//
// Design rules honoured here:
//   • Pure & framework-free — no React, no store import. Safe to unit-test and
//     to call from a web worker.
//   • No new formulas. Raw R routes through `summarizeTradeSanity`
//     (data/tradeClassification.js). Current Equity delegates to the existing
//     compounding engine (components/lab/account/accountEquity.js).
//   • Stable, documented return shapes (see typedefs below).
//   • Raw R output is a faithful superset of `summarizeTradeSanity` — every
//     field of that roll-up is spread through unchanged, so Raw R numbers stay
//     byte/number-equivalent to the current app.
//
// Supported basis values:  "raw_r" | "current_equity"
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: explicit .js extensions keep this pure module runnable under raw Node
// ESM (validation script / web worker) as well as webpack. The rest of the app
// uses extensionless imports; webpack resolves both identically.
import { summarizeTradeSanity } from "./tradeClassification.js";
import {
    normalizeAccountSettings,
    buildAccountEquityCurve,
    summarizeAccountEquity,
    tradeRValue,
    formatAccountValue,
} from "../components/lab/account/accountEquity.js";

// ── Basis constants ──────────────────────────────────────────────────────────

export const BASIS = Object.freeze({
    RAW_R: "raw_r",
    CURRENT_EQUITY: "current_equity",
});

export const RESULTS_BASES = Object.freeze([BASIS.RAW_R, BASIS.CURRENT_EQUITY]);

/** Coerce an arbitrary value to a valid basis string (defaults to raw_r). */
export function normalizeBasis(basis) {
    return basis === BASIS.CURRENT_EQUITY ? BASIS.CURRENT_EQUITY : BASIS.RAW_R;
}

/**
 * Is this basis sensitive to trade ordering?
 *   Raw R          → false (every trade weighted equally; reorder-safe)
 *   Current Equity → true  (compounding depends on account size at each point)
 */
export function isSequenceDependent(basis) {
    return normalizeBasis(basis) === BASIS.CURRENT_EQUITY;
}

/**
 * One-line human label for a basis (+ account config when current_equity).
 *   describeBasis("raw_r")                               → "Raw R"
 *   describeBasis("current_equity", { startingBalance:10000, riskPct:1,
 *                 mode:"current_equity_pct", currency:"USD" })
 *                                                        → "Current Equity · $10,000 · 1%/curr"
 */
export function describeBasis(basis, account = null) {
    if (normalizeBasis(basis) === BASIS.RAW_R) return "Raw R";
    const cfg = normalizeAccountSettings(account || {});
    const bal = formatAccountValue(cfg.startingBalance, cfg.currency);
    const sizing = cfg.mode === "fixed_dollar"
        ? `${formatAccountValue(cfg.fixedRiskAmount, cfg.currency)}/trade`
        : cfg.mode === "initial_equity_pct"
            ? `${cfg.riskPct}%/init`
            : cfg.mode === "current_equity_pct"
                ? `${cfg.riskPct}%/curr`
                : "1R";
    return `Current Equity · ${bal} · ${sizing}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. summarizeTrades — the canonical roll-up over a single trade list.
//
// @param {Array<object>} trades
// @param {object} [options]
//   @param {"raw_r"|"current_equity"} [options.basis="raw_r"]
//   @param {object} [options.account]   account config (current_equity only)
//   @param {"wins_plus_losses"|"performance"} [options.winRateDenominator]
//
// Return shape — ResultSummary:
//   {
//     basis,
//     // ── always present (Raw-R view; spread verbatim from summarizeTradeSanity) ──
//     ...sanity,                       // total, wins, losses, flats, winRate,
//                                      // netR, netRPerformance, profitFactor,
//                                      // expectancy, maxDrawdownR, byCategory, …
//     count,                           // alias of sanity.total
//     // ── present only when basis === "current_equity" ──
//     account,                         // normalized account config used
//     netAmount, expectancyAmount,
//     maxDrawdownAmount, maxDrawdownPct,
//     startingBalance, endingBalance, currency,
//     sequenceUsed,                    // true when ordering was applied
//   }
//
// Raw-R parity guarantee: for basis "raw_r" this returns the full
// summarizeTradeSanity object unchanged, plus `basis` and `count`.
// ─────────────────────────────────────────────────────────────────────────────
export function summarizeTrades(trades, options = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const basis = normalizeBasis(options.basis);

    // Raw-R view is always computed: it carries the basis-invariant metrics
    // (winRate, profitFactor, counts) that Current Equity does not redefine.
    const sanity = summarizeTradeSanity(list, {
        winRateDenominator: options.winRateDenominator,
    });

    if (basis === BASIS.RAW_R) {
        return {
            basis: BASIS.RAW_R,
            ...sanity,
            count: sanity.total,
            sequenceUsed: false,
        };
    }

    // current_equity — delegate to the existing compounding engine.
    const account = normalizeAccountSettings(options.account || {});
    const acct = summarizeAccountEquity(list, account);

    return {
        basis: BASIS.CURRENT_EQUITY,
        // Basis-invariant + Raw-R view (winRate, PF, counts, netR, expectancy-R…)
        ...sanity,
        count: sanity.total,
        sequenceUsed: account.mode !== "r_only",
        // Account / currency view from accountEquity.summarizeAccountEquity
        account,
        currency: acct.currency,
        startingBalance: acct.startingBalance ?? account.startingBalance,
        endingBalance: acct.endingBalance ?? null,
        netAmount: acct.netPnlAmount ?? null,
        expectancyAmount: acct.expectancyAmount ?? null,
        maxDrawdownAmount: acct.maxDrawdownAmount ?? null,
        maxDrawdownPct: acct.maxDrawdownPct ?? null,
        // R-denominated account-engine echoes (equal to sanity within rounding)
        totalRByAccount: acct.totalR,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. summarizeBuckets — group a trade list and roll up each bucket.
//
// @param {Array<object>} trades
// @param {object} options
//   @param {(trade)=>string} options.keyOf   REQUIRED grouping function
//   @param {"raw_r"|"current_equity"} [options.basis="raw_r"]
//   @param {object} [options.account]
//   @param {"contribution"|"isolated"} [options.bucketMode="contribution"]
//        Only meaningful for current_equity:
//          • contribution — bucket's currency P&L *in place* within the full
//            ordered sequence (path-dependent; the natural "where did my
//            account growth come from?" view).
//          • isolated — re-run the equity engine on the bucket's trades ALONE
//            from startingBalance (separable; comparable across buckets).
//
// @returns {Map<string, BucketSummary>}  keyed by bucketKey, where
//   BucketSummary extends ResultSummary with { bucketKey, bucketMode } and,
//   in contribution mode, { contributionAmount, contributionPctOfNet }.
//
// NOTE (RB-1): no page consumes this yet. Contribution/isolated correctness is
// covered conceptually in TABLE_COMPARE_BASIS_AUDIT.md; the meaningfulness
// gating (suppress path-dependent deltas etc.) is a UI concern for a later
// phase, not enforced here.
// ─────────────────────────────────────────────────────────────────────────────
export function summarizeBuckets(trades, options = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const basis = normalizeBasis(options.basis);
    const keyOf = typeof options.keyOf === "function" ? options.keyOf : () => "all";
    const out = new Map();

    // Group trades by bucket key (preserve input order within each bucket).
    const groups = new Map();
    for (const trade of list) {
        const key = String(keyOf(trade));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(trade);
    }

    if (basis === BASIS.RAW_R) {
        for (const [key, groupTrades] of groups) {
            out.set(key, {
                ...summarizeTrades(groupTrades, { basis: BASIS.RAW_R }),
                bucketKey: key,
                bucketMode: null,
            });
        }
        return out;
    }

    // current_equity
    const account = normalizeAccountSettings(options.account || {});
    const bucketMode = options.bucketMode === "isolated" ? "isolated" : "contribution";

    if (bucketMode === "isolated") {
        for (const [key, groupTrades] of groups) {
            out.set(key, {
                ...summarizeTrades(groupTrades, { basis: BASIS.CURRENT_EQUITY, account }),
                bucketKey: key,
                bucketMode: "isolated",
            });
        }
        return out;
    }

    // contribution — derive per-bucket currency P&L from ONE full-sequence curve.
    const curve = buildAccountEquityCurve(list, account);
    const contributionByKey = new Map();
    let netAmountTotal = 0;
    for (const point of curve) {
        const key = String(keyOf(point.trade));
        const pnl = account.mode === "r_only"
            ? Number(point.tradeR) || 0
            : Number(point.pnlAmount) || 0;
        contributionByKey.set(key, (contributionByKey.get(key) || 0) + pnl);
        netAmountTotal += pnl;
    }

    for (const [key, groupTrades] of groups) {
        const sanity = summarizeTradeSanity(groupTrades);
        const contributionAmount = contributionByKey.get(key) || 0;
        out.set(key, {
            basis: BASIS.CURRENT_EQUITY,
            ...sanity,
            count: sanity.total,
            bucketKey: key,
            bucketMode: "contribution",
            account,
            currency: account.currency,
            contributionAmount: round2(contributionAmount),
            contributionPctOfNet: netAmountTotal !== 0
                ? round2((contributionAmount / netAmountTotal) * 100)
                : null,
            sequenceUsed: account.mode !== "r_only",
        });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. buildCurve — equity curve in the requested basis.
//
// Delegates entirely to buildAccountEquityCurve (no new formula):
//   • raw_r          → forced r_only mode → point.netR = cumulative raw R.
//   • current_equity → uses the supplied account config.
//
// @returns {Array<CurvePoint>}  the accountEquity curve points (see
//   accountEquity.buildAccountEquityCurve for per-point fields). Each point
//   carries `netR` (the plotted line value) so existing recharts code that
//   reads `netR` keeps working.
// ─────────────────────────────────────────────────────────────────────────────
export function buildCurve(trades, options = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const basis = normalizeBasis(options.basis);
    if (basis === BASIS.RAW_R) {
        return buildAccountEquityCurve(list, { mode: "r_only" });
    }
    return buildAccountEquityCurve(list, normalizeAccountSettings(options.account || {}));
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical bucket helpers (Phase RB-4) — implement the frozen RB-3.2 contract.
//
//   toCanonicalBucketRow  — normalize any bucket summary (summarizeBuckets output
//                           OR a legacy finalizeBucket-style row) to the frozen
//                           CanonicalBucketRow shape. Win rate is ALWAYS the
//                           canonical decided-trade rate wins/(wins+losses).
//   formatBasisValue      — R-vs-$ formatting rule (Pure R renders as R).
//   bucketDisplaySchema   — DATA-ONLY column descriptors per basis (no JSX).
//
// These are pure. The rendering layer (components/lab/CanonicalBucketTable.jsx)
// maps `kind` → cell renderers.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Normalize a bucket summary to the frozen CanonicalBucketRow shape (RB-3.2 §4).
 *
 * Accepts either:
 *   • a `summarizeBuckets()` value (bucketKey, total, wins, losses, flats,
 *     excludedSetups, winRate, profitFactor, expectancy, netRPerformance,
 *     contributionAmount, contributionPctOfNet, …), or
 *   • a legacy finalizeBucket row (label, count, wins, losses, netR,
 *     expectancy, profitFactor, ciLo, ciHi, tradeRefs).
 *
 * WIN RATE IS ALWAYS RECOMPUTED CANONICALLY = wins / (wins + losses). All other
 * metrics (netR, expectancy, profitFactor) are preserved from the source so Raw
 * R parity is maintained — only WR changes, exactly as RB-3.2 approved.
 *
 * @param {object} src
 * @param {object} [opts] { basis, bucketMode, account, currency }
 * @returns {object} CanonicalBucketRow (+ passthrough extras: label, count, ciLo, ciHi, tradeRefs)
 */
export function toCanonicalBucketRow(src = {}, opts = {}) {
    const basis = normalizeBasis(opts.basis);
    const account = opts.account ? normalizeAccountSettings(opts.account) : null;
    const wins = num(src.wins);
    const losses = num(src.losses);
    const decided = wins + losses;
    const winRate = decided > 0 ? (wins / decided) * 100 : null; // CANONICAL rule

    const rows = src.rows != null ? num(src.rows)
        : src.total != null ? num(src.total)
        : num(src.count);
    const flats = src.flats != null ? num(src.flats) : Math.max(0, rows - wins - losses);
    const excluded = src.excluded != null ? num(src.excluded)
        : src.excludedSetups != null ? num(src.excludedSetups) : 0;
    const performanceTrades = src.performanceTrades != null
        ? num(src.performanceTrades) : (wins + losses + flats);

    const profitFactor = src.profitFactor !== undefined ? src.profitFactor : null;
    const expectancy = src.expectancy !== undefined ? src.expectancy : null;
    const netR = src.netR != null ? Number(src.netR)
        : src.netRPerformance != null ? Number(src.netRPerformance) : null;

    return {
        key: src.key ?? src.bucketKey ?? src.label ?? "—",
        label: src.label ?? src.key ?? src.bucketKey ?? "—",
        // counts (basis-invariant)
        rows,
        count: rows, // alias for legacy consumers (tier badges, drill)
        performanceTrades,
        wins,
        losses,
        flats,
        excluded,
        // R metrics (basis-invariant; preserved)
        winRate,
        profitFactor,
        expectancy,
        netR,
        // Current-Equity (only meaningful when basis === current_equity)
        contributionAmount: src.contributionAmount != null ? Number(src.contributionAmount) : null,
        contributionPct: src.contributionPct != null ? Number(src.contributionPct)
            : src.contributionPctOfNet != null ? Number(src.contributionPctOfNet) : null,
        netAmount: src.netAmount != null ? Number(src.netAmount) : null,
        expectancyAmount: src.expectancyAmount != null ? Number(src.expectancyAmount) : null,
        endingBalance: src.endingBalance != null ? Number(src.endingBalance) : null,
        maxDrawdownAmount: src.maxDrawdownAmount != null ? Number(src.maxDrawdownAmount) : null,
        maxDrawdownPct: src.maxDrawdownPct != null ? Number(src.maxDrawdownPct) : null,
        // meta
        basis,
        bucketMode: opts.bucketMode ?? src.bucketMode ?? null,
        currency: (account && account.currency) || src.currency || opts.currency || "USD",
        // passthrough UI extras (optional)
        ciLo: src.ciLo ?? null,
        ciHi: src.ciHi ?? null,
        tradeRefs: Array.isArray(src.tradeRefs) ? src.tradeRefs : undefined,
    };
}

/**
 * Format a value per basis (RB-3.2 §6). The key rule: under Current Equity with
 * a Pure-R account model, money renders as R — never a misleading dollar figure.
 *
 * @param {string} basis
 * @param {object|null} account
 * @param {number|null} value
 * @param {object} [opts] { kind: "r"|"money"|"pct"|"int", digits }
 * @returns {string}
 */
export function formatBasisValue(basis, account, value, opts = {}) {
    const kind = opts.kind || "r";
    if (value == null || !Number.isFinite(Number(value))) {
        return kind === "money" || kind === "r" ? "—" : "—";
    }
    const n = Number(value);
    const sign = n >= 0 ? "+" : "";
    if (kind === "int") return String(Math.round(n));
    if (kind === "pct") return `${n.toFixed(opts.digits ?? 1)}%`;
    if (kind === "r") return `${sign}${n.toFixed(opts.digits ?? 1)}R`;
    if (kind === "money") {
        const cfg = normalizeAccountSettings(account || {});
        const pureR = normalizeBasis(basis) === BASIS.RAW_R || cfg.mode === "r_only";
        if (pureR) return `${sign}${n.toFixed(opts.digits ?? 1)}R`;
        return formatAccountValue(n, cfg.currency);
    }
    return String(n);
}

/**
 * Column descriptors for a bucket table, per basis (RB-3.2 §6). DATA ONLY — the
 * table component maps each `kind` to a renderer. `key` points at the numeric
 * field so DataTable heatmap/sort works.
 *
 * @param {string} basis
 * @param {object|null} account   (reserved; currency drives money label downstream)
 * @returns {Array<{key,label,align,kind,heatmap,invariant,sortable}>}
 */
export function bucketDisplaySchema(basis /* , account */) {
    if (normalizeBasis(basis) === BASIS.CURRENT_EQUITY) {
        return [
            { key: "label",              label: "Bucket",       kind: "label",   sortable: false },
            { key: "rows",               label: "N",            align: "right", kind: "int", tip: "stat_n" },
            { key: "winRate",            label: "WR",           align: "right", kind: "pct",   invariant: true },
            { key: "contributionAmount", label: "Contribution", align: "right", kind: "money", heatmap: true },
            { key: "contributionPct",    label: "Contrib %",    align: "right", kind: "moneyPct" },
        ];
    }
    return [
        { key: "label",        label: "Bucket", kind: "label",  sortable: false },
        { key: "rows",         label: "N",      align: "right", kind: "int", tip: "stat_n" },
        { key: "wins",         label: "Wins",   align: "right", kind: "int" },
        { key: "losses",       label: "Losses", align: "right", kind: "int" },
        { key: "winRate",      label: "WR",     align: "right", kind: "pct",  invariant: true },
        { key: "netR",         label: "Net R",  align: "right", kind: "rNet", heatmap: true, tip: "stat_net_r" },
        { key: "expectancy",   label: "Exp",    align: "right", kind: "expR", heatmap: true, tip: "stat_exp" },
        { key: "profitFactor", label: "PF",     align: "right", kind: "pf", tip: "stat_pf" },
        { key: "ci",           label: "95% CI", align: "right", kind: "ci", sortable: false, heatmap: false, tip: "ci_95" },
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary helpers (Phase RB-8a) — for whole-strategy / per-model / per-run rows
// (NOT attribute buckets). These power EntriesLab (per-model), ComparisonLab
// (per-run), Overview/RunDetail KPI strips, and HypothesisLab. Pure.
//
//   toCanonicalSummaryRow — normalize a trades list OR a backend summary object
//                           to the frozen summary shape. WR is the canonical
//                           wins/(wins+losses) when derivable; otherwise it
//                           falls back to the backend value and flags the source.
//   summaryDisplaySchema  — DATA-ONLY column descriptors per basis.
//   formatSummaryValue    — thin alias of formatBasisValue for summary surfaces.
// ─────────────────────────────────────────────────────────────────────────────

const firstNum = (obj, ...keys) => {
    for (const k of keys) {
        if (obj && obj[k] != null && Number.isFinite(Number(obj[k]))) return Number(obj[k]);
    }
    return null;
};

/**
 * Normalize a summary row to the frozen canonical shape.
 *
 * @param {Array<object>|object} input
 *        • Array → treated as a trades list (routed through summarizeTrades).
 *        • object → a backend/summary-derived row (entryResults, per-run, …).
 * @param {object} [options] { basis, account, label, key, winRateDenominator, isTrades }
 * @returns {object} CanonicalSummaryRow (superset of the bucket-row count/R block)
 */
export function toCanonicalSummaryRow(input, options = {}) {
    const basis = normalizeBasis(options.basis);
    const account = options.account ? normalizeAccountSettings(options.account) : null;
    const isTrades = options.isTrades || Array.isArray(input);

    if (isTrades) {
        const s = summarizeTrades(Array.isArray(input) ? input : [], {
            basis,
            account: account || undefined,
            winRateDenominator: options.winRateDenominator,
        });
        return {
            key: options.key ?? options.label ?? null,
            label: options.label ?? options.key ?? null,
            rows: s.total,
            count: s.total,
            performanceTrades: s.performanceTrades,
            wins: s.wins,
            losses: s.losses,
            flats: s.flats,
            excluded: s.excludedSetups ?? 0,
            winRate: s.winRate,                  // canonical wins/(wins+losses)
            winRateSource: "canonical",
            profitFactor: s.profitFactor ?? null,
            expectancy: s.expectancy ?? null,
            netR: s.netRPerformance ?? null,
            maxDrawdownR: s.maxDrawdownR ?? null,
            // Current-Equity (whole-entity → its own net is its "contribution")
            netAmount: s.netAmount ?? null,
            expectancyAmount: s.expectancyAmount ?? null,
            endingBalance: s.endingBalance ?? null,
            maxDrawdownAmount: s.maxDrawdownAmount ?? null,
            maxDrawdownPct: s.maxDrawdownPct ?? null,
            currency: s.currency ?? (account && account.currency) ?? "USD",
            basis,
            account,
            source: "trades",
        };
    }

    // Backend / summary-derived object.
    const o = input || {};
    const wins = firstNum(o, "wins", "win_count", "winCount");
    const losses = firstNum(o, "losses", "loss_count", "lossCount");
    const decided = (wins ?? 0) + (losses ?? 0);
    const backendWr = firstNum(o, "winRate", "win_rate", "wr");
    const canonicalWr = (wins != null && losses != null && decided > 0)
        ? (wins / decided) * 100
        : null;
    const rows = firstNum(o, "rows", "trades", "total", "fills", "eligible", "count");

    return {
        key: options.key ?? o.key ?? o.mode ?? o.label ?? null,
        label: options.label ?? o.label ?? o.mode ?? null,
        rows,
        count: rows,
        performanceTrades: firstNum(o, "performanceTrades", "performance_trades") ?? (wins != null && losses != null ? decided : null),
        wins,
        losses,
        flats: firstNum(o, "flats", "breakeven"),
        excluded: firstNum(o, "excluded", "excludedSetups") ?? 0,
        winRate: canonicalWr != null ? canonicalWr : backendWr,
        winRateSource: canonicalWr != null ? "canonical" : (backendWr != null ? "backend" : "missing"),
        profitFactor: firstNum(o, "profitFactor", "profit_factor", "pf"),
        expectancy: firstNum(o, "expectancy", "expectancyR", "avgR", "avg_r"),
        netR: firstNum(o, "netR", "net_r", "netRPerformance"),
        maxDrawdownR: firstNum(o, "maxDrawdownR", "maxDD", "max_dd", "max_drawdown_r"),
        netAmount: firstNum(o, "netAmount", "net_amount", "netPnlAmount"),
        expectancyAmount: firstNum(o, "expectancyAmount", "expectancy_amount"),
        endingBalance: firstNum(o, "endingBalance", "ending_balance"),
        maxDrawdownAmount: firstNum(o, "maxDrawdownAmount"),
        maxDrawdownPct: firstNum(o, "maxDrawdownPct"),
        currency: (account && account.currency) || o.currency || "USD",
        basis,
        account,
        source: "summary",
    };
}

/**
 * Column descriptors for a summary table, per basis. DATA ONLY.
 * @param {string} basis
 * @param {object|null} account
 * @param {object} [options] { includeCols?: string[] }  filter to a subset by key
 */
export function summaryDisplaySchema(basis, account = null, options = {}) {
    const ce = normalizeBasis(basis) === BASIS.CURRENT_EQUITY;
    const full = ce
        ? [
            { key: "label",            label: "Name",   kind: "label", sortable: false },
            { key: "rows",             label: "Trades", align: "right", kind: "int", tip: "stat_n" },
            { key: "winRate",          label: "WR",     align: "right", kind: "pct", invariant: true },
            { key: "netAmount",        label: "Net",    align: "right", kind: "money" },
            { key: "expectancyAmount", label: "Exp",    align: "right", kind: "money", tip: "stat_exp" },
            { key: "maxDrawdownPct",   label: "Max DD", align: "right", kind: "moneyPct", tip: "max_drawdown" },
        ]
        : [
            { key: "label",        label: "Name",   kind: "label", sortable: false },
            { key: "rows",         label: "Trades", align: "right", kind: "int", tip: "stat_n" },
            { key: "winRate",      label: "WR",     align: "right", kind: "pct", invariant: true },
            { key: "netR",         label: "Net R",  align: "right", kind: "rNet", tip: "stat_net_r" },
            { key: "expectancy",   label: "Exp",    align: "right", kind: "expR", tip: "stat_exp" },
            { key: "profitFactor", label: "PF",     align: "right", kind: "pf", tip: "stat_pf" },
            { key: "maxDrawdownR", label: "Max DD", align: "right", kind: "rNet", tip: "max_drawdown" },
        ];
    if (Array.isArray(options.includeCols)) {
        const set = new Set(options.includeCols);
        return full.filter((c) => c.key === "label" || set.has(c.key));
    }
    return full;
}

/** Summary surfaces' value formatter — currently a thin alias of formatBasisValue. */
export function formatSummaryValue(basis, account, value, opts = {}) {
    return formatBasisValue(basis, account, value, opts);
}

/**
 * Max drawdown computed from an EQUITY CURVE's `netR` points (RB-8d).
 *
 * Byte-for-byte the legacy `lib/metrics.computeMaxDrawdown` so ComparisonLab's
 * Pareto / KPI drawdown stays identical when `lib/metrics` is retired. This is
 * intentionally CURVE-based (uses the backend equity curve), NOT the trades-
 * based `summarizeTrades().maxDrawdownR`, which can differ. Returns ≤ 0, or
 * null when the curve is empty.
 */
export function maxDrawdownFromCurve(equityCurve) {
    if (!Array.isArray(equityCurve) || equityCurve.length === 0) return null;
    let peak = -Infinity;
    let maxDd = 0;
    for (const p of equityCurve) {
        const v = Number(p.netR);
        if (!isFinite(v)) continue;
        if (v > peak) peak = v;
        const dd = v - peak; // ≤ 0
        if (dd < maxDd) maxDd = dd;
    }
    return maxDd;
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity / memo helpers (Phase RB-8a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic, mode-aware hash of an account config. Two configs hash equal
 * iff they would produce the same Current-Equity sizing. Stable regardless of
 * input key order; handles null/missing gracefully. Used for memo keys and the
 * compare guard's equal-config gate.
 */
export function accountConfigHash(accountSettings) {
    const c = normalizeAccountSettings(accountSettings || {});
    if (c.mode === "r_only") return "r_only";
    if (c.mode === "fixed_dollar") return `fixed_dollar|${c.fixedRiskAmount}|${c.currency}`;
    if (c.mode === "initial_equity_pct") return `initial_equity_pct|${c.startingBalance}|${c.riskPct}|${c.currency}`;
    if (c.mode === "current_equity_pct") return `current_equity_pct|${c.startingBalance}|${c.riskPct}|${c.currency}`;
    return `${c.mode}|${c.startingBalance}|${c.riskPct}|${c.fixedRiskAmount}|${c.currency}`;
}

/**
 * Canonical comparison-cell identity = (runId, universeKey, basis, accountHash).
 * EntriesLab varies universeKey (fixed run); ComparisonLab varies runId (fixed
 * universe); Phase 3C varies both. One identity → one delta engine.
 */
export function comparisonCellKey({ runId = null, universeKey = null, basis, accountSettings } = {}) {
    return [
        runId ?? "—",
        universeKey ?? "baseline",
        normalizeBasis(basis),
        accountConfigHash(accountSettings),
    ].join("::");
}

// ── Internal ─────────────────────────────────────────────────────────────────

function round2(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Re-export the R extractor so consumers needn't reach into accountEquity.
export { tradeRValue };

export default {
    BASIS,
    RESULTS_BASES,
    normalizeBasis,
    isSequenceDependent,
    describeBasis,
    summarizeTrades,
    summarizeBuckets,
    buildCurve,
    toCanonicalBucketRow,
    formatBasisValue,
    bucketDisplaySchema,
    toCanonicalSummaryRow,
    summaryDisplaySchema,
    formatSummaryValue,
    maxDrawdownFromCurve,
    accountConfigHash,
    comparisonCellKey,
};
