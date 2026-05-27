const DEFAULT_ACCOUNT_SETTINGS = {
    mode: "r_only",
    startingBalance: 10000,
    fixedRiskAmount: 100,
    riskPct: 1,
    currency: "USD",
};

export function normalizeAccountSettings(settings = {}) {
    const mode = ["r_only", "fixed_dollar", "initial_equity_pct", "current_equity_pct"].includes(settings.mode)
        ? settings.mode
        : DEFAULT_ACCOUNT_SETTINGS.mode;
    return {
        mode,
        startingBalance: positiveNumber(settings.startingBalance, DEFAULT_ACCOUNT_SETTINGS.startingBalance),
        fixedRiskAmount: positiveNumber(settings.fixedRiskAmount, DEFAULT_ACCOUNT_SETTINGS.fixedRiskAmount),
        riskPct: positiveNumber(settings.riskPct, DEFAULT_ACCOUNT_SETTINGS.riskPct),
        currency: String(settings.currency || DEFAULT_ACCOUNT_SETTINGS.currency).trim().toUpperCase() || DEFAULT_ACCOUNT_SETTINGS.currency,
    };
}

export function tradeRValue(trade) {
    const raw = trade?.r ?? trade?.net_r ?? trade?.netR ?? trade?.pnl_r ?? trade?.pnlR ?? trade?.news_flatten_r;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

export function buildAccountEquityCurve(trades, settings = {}) {
    const cfg = normalizeAccountSettings(settings);
    const rOnly = cfg.mode === "r_only";
    const list = rOnly
        ? (Array.isArray(trades) ? trades : [])
        : sortTradesChronologically(trades);
    let cumulativeR = 0;
    let equity = cfg.startingBalance;
    let peak = rOnly ? 0 : cfg.startingBalance;
    let maxDrawdown = 0;

    return list.map((trade, index) => {
        const r = tradeRValue(trade);
        const equityBefore = equity;
        const riskAmount = riskForTrade(cfg, equityBefore);
        const pnlAmount = rOnly ? r : r * riskAmount;

        cumulativeR += r;
        if (!rOnly) equity += pnlAmount;

        const lineValue = rOnly ? cumulativeR : equity;
        if (lineValue > peak) peak = lineValue;
        const drawdown = lineValue - peak;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;

        return {
            i: index,
            trade,
            tradeR: r,
            cumulativeR: round(cumulativeR, 4),
            riskAmount: rOnly ? null : round(riskAmount, 2),
            pnlAmount: rOnly ? null : round(pnlAmount, 2),
            cumulativePnlAmount: rOnly ? null : round(equity - cfg.startingBalance, 2),
            equityBefore: rOnly ? null : round(equityBefore, 2),
            equityAfter: rOnly ? null : round(equity, 2),
            accountDrawdownAmount: rOnly ? null : round(drawdown, 2),
            accountDrawdownPct: rOnly ? null : (peak > 0 ? round((drawdown / peak) * 100, 2) : null),
            netR: round(lineValue, rOnly ? 2 : 2),
            drawdown: round(drawdown, 2),
            maxDrawdown,
        };
    });
}

export function summarizeAccountEquity(trades, settings = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const cfg = normalizeAccountSettings(settings);
    const curve = buildAccountEquityCurve(list, cfg);
    const totalR = list.reduce((sum, trade) => sum + tradeRValue(trade), 0);
    const expectancyR = list.length ? totalR / list.length : null;

    if (cfg.mode === "r_only") {
        const worstR = curve.reduce((worst, point) => Math.min(worst, Number(point.drawdown) || 0), 0);
        return {
            mode: cfg.mode,
            currency: cfg.currency,
            tradeCount: list.length,
            totalR: round(totalR, 4),
            expectancyR: expectancyR == null ? null : round(expectancyR, 6),
            maxDrawdownR: round(worstR, 4),
            curve,
        };
    }

    const endingBalance = curve.length ? curve[curve.length - 1].equityAfter : cfg.startingBalance;
    const netPnlAmount = endingBalance - cfg.startingBalance;
    const finalRiskAmount = riskForTrade(cfg, endingBalance);
    const maxDrawdownAmount = curve.reduce((worst, point) => Math.min(worst, Number(point.accountDrawdownAmount) || 0), 0);
    const maxDrawdownPct = curve.reduce((worst, point) => Math.min(worst, Number(point.accountDrawdownPct) || 0), 0);

    return {
        mode: cfg.mode,
        currency: cfg.currency,
        tradeCount: list.length,
        startingBalance: cfg.startingBalance,
        endingBalance: round(endingBalance, 2),
        finalRiskAmount: round(finalRiskAmount, 2),
        netPnlAmount: round(netPnlAmount, 2),
        expectancyAmount: list.length ? round(netPnlAmount / list.length, 2) : null,
        maxDrawdownAmount: round(maxDrawdownAmount, 2),
        maxDrawdownPct: round(maxDrawdownPct, 2),
        totalR: round(totalR, 4),
        expectancyR: expectancyR == null ? null : round(expectancyR, 6),
        curve,
    };
}

export function formatAccountValue(value, currency = "USD") {
    if (value == null || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: String(currency || "USD").toUpperCase(),
            maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2,
        }).format(number);
    } catch {
        return `${String(currency || "USD").toUpperCase()} ${number.toLocaleString("en-US", {
            maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2,
        })}`;
    }
}

function riskForTrade(settings, equityBefore) {
    if (settings.mode === "fixed_dollar") return settings.fixedRiskAmount;
    if (settings.mode === "initial_equity_pct") return settings.startingBalance * settings.riskPct / 100;
    if (settings.mode === "current_equity_pct") return Math.max(0, equityBefore) * settings.riskPct / 100;
    return 1;
}

function sortTradesChronologically(trades) {
    const list = Array.isArray(trades) ? trades : [];
    return list
        .map((trade, index) => ({
            trade,
            index,
            primaryTime: tradeTimeMs(
                trade?.fill_time,
                trade?.fillTime,
                trade?.entry_time,
                trade?.entryTime,
                trade?.entry,
            ),
            exitTime: tradeTimeMs(
                trade?.exit_time,
                trade?.exitTime,
                trade?.exit,
            ),
        }))
        .sort((a, b) => (
            compareNullableTime(a.primaryTime, b.primaryTime)
            || compareNullableTime(a.exitTime, b.exitTime)
            || a.index - b.index
        ))
        .map((item) => item.trade);
}

function tradeTimeMs(...values) {
    for (const value of values) {
        if (value == null || value === "") continue;
        if (typeof value === "number" && Number.isFinite(value)) {
            return value > 100000000000 ? value : value * 1000;
        }
        let text = String(value).trim();
        if (!text) continue;
        text = text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text = `${text}T00:00:00Z`;
        if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text = `${text}Z`;
        const parsed = Date.parse(text);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function compareNullableTime(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a - b;
}

function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
