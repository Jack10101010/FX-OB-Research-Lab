import { buildAccountEquityCurve, normalizeAccountSettings } from "./accountEquity";

export const DEFAULT_FUNDING_CHALLENGE_SETTINGS = {
    preset: "ftmo_2_step",
    enabled: false,
    phase1TargetPct: 10,
    phase2TargetPct: 5,
    maxOverallLossPct: 10,
    maxDailyLossPct: 5,
    minTradingDays: 4,
};

export function normalizeFundingChallengeSettings(settings = {}) {
    return {
        preset: settings.preset === "ftmo_2_step" ? "ftmo_2_step" : DEFAULT_FUNDING_CHALLENGE_SETTINGS.preset,
        enabled: Boolean(settings.enabled),
        phase1TargetPct: positiveNumber(settings.phase1TargetPct, DEFAULT_FUNDING_CHALLENGE_SETTINGS.phase1TargetPct),
        phase2TargetPct: positiveNumber(settings.phase2TargetPct, DEFAULT_FUNDING_CHALLENGE_SETTINGS.phase2TargetPct),
        maxOverallLossPct: positiveNumber(settings.maxOverallLossPct, DEFAULT_FUNDING_CHALLENGE_SETTINGS.maxOverallLossPct),
        maxDailyLossPct: positiveNumber(settings.maxDailyLossPct, DEFAULT_FUNDING_CHALLENGE_SETTINGS.maxDailyLossPct),
        minTradingDays: Math.max(0, Math.trunc(positiveNumber(settings.minTradingDays, DEFAULT_FUNDING_CHALLENGE_SETTINGS.minTradingDays))),
    };
}

export function simulateFundingChallenge(trades, accountSettings = {}, challengeSettings = {}) {
    const settings = normalizeFundingChallengeSettings(challengeSettings);
    const account = normalizeAccountSettings(accountSettings);
    const list = sortTradesChronologically(trades);
    if (!settings.enabled) {
        return { enabled: false, reason: "disabled", settings, account };
    }
    if (account.mode === "r_only") {
        return { enabled: true, status: "unavailable", reason: "account_mode_required", settings, account };
    }
    const startingBalance = account.startingBalance;
    const lossFloor = startingBalance * (1 - settings.maxOverallLossPct / 100);
    const phase1 = evaluatePhase({
        trades: list,
        account,
        targetPct: settings.phase1TargetPct,
        lossFloor,
        minTradingDays: settings.minTradingDays,
        offset: 0,
        phase: "phase1",
    });
    const phase2StartIndex = phase1.status === "passed" ? phase1.tradeIndex + 1 : list.length;
    const phase2 = phase1.status === "passed"
        ? evaluatePhase({
            trades: list.slice(phase2StartIndex),
            account,
            targetPct: settings.phase2TargetPct,
            lossFloor,
            minTradingDays: settings.minTradingDays,
            offset: phase2StartIndex,
            phase: "phase2",
        })
        : {
            phase: "phase2",
            status: "not_started",
            targetEquity: round(startingBalance * (1 + settings.phase2TargetPct / 100), 2),
            lossFloor: round(lossFloor, 2),
            tradeIndex: null,
            tradeNumber: null,
            equity: null,
            date: "",
            tradingDays: 0,
            minTradingDaysMet: false,
            tradesEvaluated: 0,
        };
    const phase2Start = phase1.status === "passed"
        ? boundaryForTrade(list, phase2StartIndex, "phase_2_start")
        : null;
    const fundedStartIndex = phase2.status === "passed" ? phase2.tradeIndex + 1 : null;
    return {
        enabled: true,
        status: phase1.status === "failed" || phase2.status === "failed"
            ? "failed"
            : phase1.status === "passed" && phase2.status === "passed"
                ? "funded"
                : "in_progress",
        settings,
        account,
        startingBalance,
        phase1,
        phase2,
        phase1Points: buildPhasePoints(list.slice(0, phase1.status === "passed" || phase1.status === "failed" ? phase1.tradeIndex + 1 : list.length), account, "Challenge", 0),
        phase2Points: phase1.status === "passed"
            ? buildPhasePoints(list.slice(phase2StartIndex, phase2.status === "passed" || phase2.status === "failed" ? phase2.tradeIndex + 1 : list.length), account, "Verification", phase2StartIndex)
            : [],
        fundedPoints: phase2.status === "passed"
            ? buildPhasePoints(list.slice(fundedStartIndex), account, "Funded", fundedStartIndex)
            : [],
        boundaries: {
            phase1Pass: phase1.status === "passed" ? phaseBoundary(phase1, "phase_1_pass") : null,
            phase2Start,
            phase2Pass: phase2.status === "passed" ? phaseBoundary(phase2, "phase_2_pass") : null,
            fundedStart: fundedStartIndex != null ? boundaryForTrade(list, fundedStartIndex, "funded_start") : null,
        },
        fundedStart: fundedStartIndex != null
            ? boundaryForTrade(list, fundedStartIndex, "funded_start")
            : null,
        dailyLoss: {
            implemented: false,
            status: "not_simulated",
            label: "Daily loss rule not simulated yet",
        },
    };
}

export function buildFundingChallengeEquityCurve(trades, accountSettings = {}, challengeSettings = {}) {
    const result = simulateFundingChallenge(trades, accountSettings, { ...challengeSettings, enabled: true });
    if (result.reason === "account_mode_required") return [];
    const points = [
        ...withPhaseStart(result.phase1Points, "Challenge", 0),
        ...withPhaseStart(result.phase2Points, "Verification", result.boundaries?.phase2Start?.tradeIndex ?? null),
        ...withPhaseStart(result.fundedPoints, "Funded", result.boundaries?.fundedStart?.tradeIndex ?? null),
    ];
    return points.map((point, index) => {
        const marker = markerForPoint(point, result.boundaries);
        return {
            ...point,
            i: index,
            displayTradeId: marker?.label || point.displayTradeId,
            // news_action is NOT overwritten with the phase marker label —
            // phase boundaries are identified by fundingMarker only.
            fundingMarker: marker?.type || point.fundingMarker || "",
            fundingPhase: point.phase,
        };
    });
}

function evaluatePhase({ trades, account, targetPct, lossFloor, minTradingDays, offset, phase }) {
    const targetEquity = account.startingBalance * (1 + targetPct / 100);
    const curve = buildAccountEquityCurve(trades, account);
    let event = null;
    for (let index = 0; index < curve.length; index += 1) {
        const point = curve[index];
        const equityAfter = Number(point.equityAfter);
        if (!Number.isFinite(equityAfter)) continue;
        if (equityAfter <= lossFloor) {
            event = { status: "failed", point, index };
            break;
        }
        if (equityAfter >= targetEquity) {
            event = { status: "passed", point, index };
            break;
        }
    }
    const eventIndex = event ? event.index : curve.length - 1;
    const phaseTrades = eventIndex >= 0 ? trades.slice(0, eventIndex + 1) : trades;
    const tradingDays = uniqueTradingDays(phaseTrades);
    const point = event?.point || curve[curve.length - 1] || null;
    return {
        phase,
        status: event?.status || "in_progress",
        targetEquity: round(targetEquity, 2),
        lossFloor: round(lossFloor, 2),
        tradeIndex: event ? offset + event.index : null,
        tradeNumber: event ? offset + event.index + 1 : null,
        equity: point?.equityAfter == null ? null : round(point.equityAfter, 2),
        date: event ? tradeDate(point.trade) : "",
        tradingDays,
        minTradingDaysMet: tradingDays >= minTradingDays,
        tradesEvaluated: curve.length,
    };
}

function buildPhasePoints(trades, account, phase, offset) {
    return buildAccountEquityCurve(trades, account).map((point, index) => ({
        ...point,
        phase,
        sourceTradeIndex: offset + index,
        tradeNumber: offset + index + 1,
        displayTradeId: point.trade?.displayTradeId || point.trade?.id || `${phase} ${index + 1}`,
        entryTime: point.trade?.entry || point.trade?.fill_time || point.trade?.fillTime || "",
        outcome: point.trade?.outcome || "",
        direction: point.trade?.direction || "",
        structure: point.trade?.structure || "",
        session: point.trade?.fillSession || point.trade?.session || "",
        date: tradeDate(point.trade),
        label: phase,
        netR: point.equityAfter,
        drawdown: point.accountDrawdownAmount,
        isAtHigh: Number(point.accountDrawdownAmount) >= 0,
    }));
}

function withPhaseStart(points, phase, sourceIndex) {
    if (!points.length) return [];
    const firstTrade = points[0]?.trade;
    const phaseStartIndex = sourceIndex == null ? null : sourceIndex - 0.5;
    return [
        {
            i: 0,
            phase,
            sourceTradeIndex: phaseStartIndex,
            tradeNumber: sourceIndex == null ? null : sourceIndex + 1,
            trade: null,
            tradeR: 0,
            netR: points[0].equityBefore,
            equityAfter: points[0].equityBefore,
            drawdown: 0,
            isAtHigh: true,
            label: phase,
            displayTradeId: `${phase} Start`,
            entryTime: firstTrade?.entry || firstTrade?.fill_time || firstTrade?.fillTime || "",
            isStart: false,
            fundingMarker: phase === "Verification" ? "phase_2_start" : phase === "Funded" ? "funded_start" : "",
            // news_action intentionally absent — phase boundaries use fundingMarker only
        },
        ...points,
    ];
}

function phaseBoundary(phase, type) {
    return {
        type,
        tradeIndex: phase.tradeIndex,
        tradeNumber: phase.tradeNumber,
        date: phase.date,
        equity: phase.equity,
    };
}

function boundaryForTrade(list, index, type) {
    if (index == null || index >= list.length) return null;
    return {
        type,
        tradeIndex: index,
        tradeNumber: index + 1,
        date: tradeDate(list[index]),
        equity: null,
    };
}

function markerForPoint(point, boundaries = {}) {
    if (point?.fundingMarker) {
        const labels = {
            phase_2_start: "Verification Start",
            funded_start: "Funded Start",
        };
        return { type: point.fundingMarker, label: labels[point.fundingMarker] || point.displayTradeId || "" };
    }
    const markers = [
        { boundary: boundaries.phase1Pass, type: "phase_1_pass", label: "Phase 1 Pass" },
        { boundary: boundaries.phase2Start, type: "phase_2_start", label: "Verification Start" },
        { boundary: boundaries.phase2Pass, type: "phase_2_pass", label: "Phase 2 Pass" },
        { boundary: boundaries.fundedStart, type: "funded_start", label: "Funded Start" },
    ];
    return markers.find(({ boundary }) => boundary && boundary.tradeIndex === point.sourceTradeIndex) || null;
}

function uniqueTradingDays(trades) {
    const dates = new Set();
    (trades || []).forEach((trade) => {
        const date = tradeDate(trade);
        if (date) dates.add(date);
    });
    return dates.size;
}

function tradeDate(trade) {
    const value = trade?.fill_time || trade?.fillTime || trade?.entry_time || trade?.entryTime || trade?.entry;
    if (!value) return "";
    let text = String(value).trim();
    if (!text) return "";
    text = text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text = `${text}Z`;
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function sortTradesChronologically(trades) {
    const list = Array.isArray(trades) ? trades : [];
    return list
        .map((trade, index) => ({
            trade,
            index,
            time: tradeTimeMs(
                trade?.fill_time,
                trade?.fillTime,
                trade?.entry_time,
                trade?.entryTime,
                trade?.entry,
            ),
            exitTime: tradeTimeMs(trade?.exit_time, trade?.exitTime, trade?.exit),
        }))
        .sort((a, b) => (
            compareNullableTime(a.time, b.time)
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
