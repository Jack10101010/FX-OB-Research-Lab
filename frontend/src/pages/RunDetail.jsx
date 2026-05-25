import React from "react";
import { Link, useParams } from "react-router-dom";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { EquityCurveV2, MiniLine } from "@/components/lab/EquityCurve";
import { DataTable, Pill } from "@/components/lab/DataTable";
import { NeonButton, NeonInput, NeonSelect } from "@/components/lab/controls";
import { compactTimeframe, formatRunDateRange, getRunDisplayName, updateRunBundle, useDataset } from "@/data/store";
import { setSelectedTradeVariant } from "@/data/store";
import { FolderKanban, Map as MapIcon, GitCompareArrows, TrendingUp, Hash, Activity, Target, AlertTriangle, ShieldCheck, Edit3 } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function isValidExecutedTrade(trade) {
    const outcome = String(trade?.outcome || trade?.result || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const missedReason = String(trade?.missed_reason || trade?.missedReason || "").trim();
    const entryTime = trade?.entry || trade?.fill_time || trade?.fillTime || trade?.entry_time || trade?.entryTime;
    if (!entryTime) return false;
    if (trade?.missed_trade || trade?.missedTrade || missedReason) return false;
    if (["SESSION_FILTERED", "NEWS_TOUCH_CANCEL", "NEWS_BLACKOUT", "UNFILLED", "INVALIDATED"].some((key) => outcome.includes(key))) return false;
    return true;
}

function tradeResultSign(trade) {
    const outcome = String(trade?.outcome || trade?.result || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (outcome === "WIN") return 1;
    if (outcome === "LOSS") return -1;
    const r = Number(trade?.r ?? trade?.pnl_r ?? trade?.news_flatten_r);
    if (!isFinite(r) || r === 0) return 0;
    return r > 0 ? 1 : -1;
}

export default function RunDetail() {
    const { ACTIVE_RUN, TRADES, RUNS, getRunData, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS } = useDataset();
    const params = useParams();
    const runId = params.runId === "active" ? ACTIVE_RUN.id : decodeURIComponent(params.runId || ACTIVE_RUN.id);
    const run = RUNS.find((r) => r.id === runId) || ACTIVE_RUN;
    // Per-run lookup: imported bundles carry their own trades + equity curve.
    const runData = getRunData(runId);
    const displayName = getRunDisplayName(runData || run);
    const projectId = runData?.projectId || runData?.summary?.projectId || run?.projectId || run?.summary?.projectId;
    const runSymbol = run.symbol || runData?.summary?.symbol || runData?.config?.symbol || "—";
    const runTf = compactTimeframe(run.detectionTf || runData?.summary?.detectionTf || runData?.summary?.detection_tf || runData?.config?.detection_timeframe || "—");
    const runRr = Number(run.rr ?? runData?.summary?.rr ?? runData?.config?.rr_multiple);
    const runDateRange = formatRunDateRange(run.dateRange || runData?.summary?.dateRange || "2025-05-18 → 2026-05-18");
    const [editingName, setEditingName] = React.useState(false);
    const [draftName, setDraftName] = React.useState(displayName);
    // ── Equity chart controls ────────────────────────────────────────────────
    const [showDots,     setShowDots]     = React.useState(true);
    const [showDrawdown, setShowDrawdown] = React.useState(true);
    const [showNews,     setShowNews]     = React.useState(true);
    // ── Equity research filters (affect chart only) ──────────────────────────
    const [equitySessionFilter,   setEquitySessionFilter]   = React.useState("All");
    const [equityDirectionFilter, setEquityDirectionFilter] = React.useState("All");
    const [equityStructureFilter, setEquityStructureFilter] = React.useState("All");
    const [equityExcludeNews,     setEquityExcludeNews]     = React.useState(false);
    const [equityExcludeMissed,   setEquityExcludeMissed]   = React.useState(false);
    const [ledgerResultFilter,    setLedgerResultFilter]    = React.useState("All");
    const [ledgerSessionFilter,   setLedgerSessionFilter]   = React.useState("All");
    const [ledgerDirectionFilter, setLedgerDirectionFilter] = React.useState("All");
    const [ledgerSearch,          setLedgerSearch]          = React.useState("");
    React.useEffect(() => {
        setDraftName(displayName);
        setEditingName(false);
    }, [displayName, runId]);
    const saveName = () => {
        const name = draftName.trim();
        if (!runData || !name) {
            setEditingName(false);
            setDraftName(displayName);
            return;
        }
        updateRunBundle(runId, { displayName: name, name, summary: { displayName: name, name } });
        setEditingName(false);
    };
    const isActiveRun = run.id === ACTIVE_RUN.id;
    const tradesForRun  = isActiveRun ? TRADES : (runData?.trades || null);
    const totalTradeRows = tradesForRun?.length || 0;
    const validTradesForRun = React.useMemo(
        () => (Array.isArray(tradesForRun) ? tradesForRun.filter(isValidExecutedTrade) : []),
        [tradesForRun],
    );
    const validTradeCount = validTradesForRun.length;
    const validNetR = validTradesForRun.reduce((sum, trade) => sum + (Number(trade.r) || 0), 0);
    const validWinsCount = validTradesForRun.filter((trade) => tradeResultSign(trade) > 0).length;
    const validLossesCount = validTradesForRun.filter((trade) => tradeResultSign(trade) < 0).length;
    const validWinRate = validWinsCount + validLossesCount > 0
        ? (validWinsCount / (validWinsCount + validLossesCount)) * 100
        : null;
    const expectancy = validTradeCount > 0 ? validNetR / validTradeCount : null;
    const grossWins = validTradesForRun.reduce((sum, trade) => {
        const r = Number(trade.r) || 0;
        return r > 0 ? sum + r : sum;
    }, 0);
    const grossLosses = validTradesForRun.reduce((sum, trade) => {
        const r = Number(trade.r) || 0;
        return r < 0 ? sum + Math.abs(r) : sum;
    }, 0);
    const pf = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? Infinity : null);
    const maxDd = validTradesForRun.length ? (() => {
        let cumR = 0;
        let peak = 0;
        let worst = 0;
        validTradesForRun.forEach((trade) => {
            cumR += Number(trade.r) || 0;
            if (cumR > peak) peak = cumR;
            const drawdown = cumR - peak;
            if (drawdown < worst) worst = drawdown;
        });
        return Math.abs(worst);
    })() : null;
    const tradeSubtext = totalTradeRows && totalTradeRows !== validTradeCount
        ? `${validTradeCount} valid · ${totalTradeRows} rows`
        : `${validTradeCount || Number(run.trades) || 0} valid trades`;
    const filteredLedgerRows = React.useMemo(() => {
        const rows = Array.isArray(tradesForRun) ? tradesForRun : [];
        const query = ledgerSearch.trim().toLowerCase();
        return rows.filter((trade) => {
            if (ledgerResultFilter !== "All" && !matchesLedgerResultFilter(trade, ledgerResultFilter, runRr)) return false;
            if (ledgerSessionFilter !== "All") {
                const session = displaySession(trade);
                if (ledgerSessionFilter === "Unassigned") {
                    if (session !== "—") return false;
                } else if (session !== ledgerSessionFilter) {
                    return false;
                }
            }
            if (ledgerDirectionFilter !== "All" && trade.direction !== ledgerDirectionFilter) return false;
            if (query) {
                const haystack = [
                    trade.displayTradeId,
                    trade.rawTradeId,
                    trade.id,
                    trade.displayObId,
                    trade.obId,
                    trade.outcome,
                    formatOutcome(trade),
                    displaySession(trade),
                    trade.direction,
                    trade.structure,
                ].join(" ").toLowerCase();
                if (!haystack.includes(query)) return false;
            }
            return true;
        });
    }, [tradesForRun, ledgerResultFilter, ledgerSessionFilter, ledgerDirectionFilter, ledgerSearch, runRr]);

    // ── Equity research filters: filtered subset of trades for chart ─────────
    const filteredTradesForEquity = React.useMemo(() => {
        if (!validTradesForRun.length) return [];
        return validTradesForRun.filter((trade) => {
            // Session
            if (equitySessionFilter !== "All") {
                const sess = fillSessionForTrade(trade);
                const isUnassigned = !sess || sess === "Unknown";
                const match = equitySessionFilter === "Unassigned"
                    ? isUnassigned
                    : sess === equitySessionFilter;
                if (!match) return false;
            }
            // Direction
            if (equityDirectionFilter !== "All") {
                if (String(trade.direction || "").trim() !== equityDirectionFilter) return false;
            }
            // Structure
            if (equityStructureFilter !== "All") {
                if (String(trade.structure || "").trim() !== equityStructureFilter) return false;
            }
            // Exclude news-affected
            if (equityExcludeNews) {
                const newsAction = String(trade.news_action || "").trim();
                const outcome    = String(trade.outcome || "").toUpperCase();
                const missedRsn  = String(trade.missed_reason || "").toLowerCase();
                if (newsAction || trade.news_blackout || outcome.includes("NEWS") || missedRsn.includes("news")) return false;
            }
            // Exclude missed / session-filtered
            if (equityExcludeMissed) {
                const missedRsn = String(trade.missed_reason || "").trim();
                const outcome   = String(trade.outcome || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
                if (trade.missed_trade || missedRsn || outcome.includes("SESSION_FILTERED") || outcome.includes("NEWS_TOUCH_CANCEL")) return false;
            }
            return true;
        });
    }, [validTradesForRun, equitySessionFilter, equityDirectionFilter, equityStructureFilter, equityExcludeNews, equityExcludeMissed]);

    // ── Equity chart data: synthetic START at 0R + recomputed from filtered trades ──
    const equityChartData = React.useMemo(() => {
        if (!filteredTradesForEquity.length) return [];
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        // Synthetic anchor — the curve starts at 0R before the first trade
        const startPoint = {
            i:                      0,
            date:                   "",
            label:                  "",      // no x-label; first real trade's month is the first tick
            netR:                   0,
            tradeR:                 0,
            outcome:                "",
            direction:              "",
            structure:              "",
            session:                "",
            displayTradeId:         "START",
            entryTime:              "",
            news_action:            "",
            news_flatten_r:         null,
            missed_reason:          "",
            protection_exit_reason: "",
            drawdown:               0,
            isAtHigh:               true,
            isStart:                true,
        };
        let cumR = 0;
        let peak = 0;
        const tradePoints = filteredTradesForEquity.map((trade, idx) => {
            cumR += Number(trade.r) || 0;
            const netR = Number(cumR.toFixed(2));
            if (netR > peak) peak = netR;
            const drawdown = Number((netR - peak).toFixed(2));
            let label = "";
            if (trade.entry) {
                const d = new Date(trade.entry);
                if (isFinite(d.getTime())) {
                    label = `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(-2)}`;
                }
            }
            return {
                i:                      idx + 1,  // 0 = START, trades start at 1
                date:                   trade.entry ? String(trade.entry).slice(0, 10) : "",
                label,
                netR,
                tradeR:                 Number(trade.r) || 0,
                outcome:                trade.outcome || "",
                direction:              trade.direction || "",
                structure:              trade.structure || "",
                session:                trade.fillSession || trade.session || "",
                displayTradeId:         trade.displayTradeId || trade.id || "",
                entryTime:              trade.entry || "",
                news_action:            trade.news_action || "",
                news_flatten_r:         trade.news_flatten_r ?? null,
                missed_reason:          trade.missed_reason || "",
                protection_exit_reason: trade.protection_exit_reason || "",
                drawdown,
                isAtHigh:               drawdown >= 0,
            };
        });
        return [startPoint, ...tradePoints];
    }, [filteredTradesForEquity]);

    // ── Per-run analytics — computed from this run's trades, not global store ──
    const MONTHLY = React.useMemo(() => {
        if (!tradesForRun?.length) return [];
        const map = {};
        tradesForRun.forEach((t) => {
            const date = t.entry ? new Date(t.entry) : null;
            if (!date || !isFinite(date.getTime())) return;
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            const key = `${year}-${String(month + 1).padStart(2, "0")}`;
            const m = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]} '${String(year).slice(-2)}`;
            if (!map[key]) map[key] = { key, m, v: 0 };
            map[key].v += Number(t.r) || 0;
        });
        return Object.values(map)
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((e) => ({ m: e.m, v: Number(e.v.toFixed(2)) }));
    }, [tradesForRun]);

    // ── OB stats derived from imported order blocks ──
    const obStats = React.useMemo(() => {
        const obs    = runData?.orderBlocks || [];
        const trades = runData?.trades      || [];
        const cfg    = runData?.config      || {};

        // ── Direction counts ──────────────────────────────────────────────────
        const bullish = obs.filter((ob) => {
            const side = String(ob.side ?? ob.direction ?? ob.type ?? "").toLowerCase();
            return side === "bull" || side === "bullish" || side === "long";
        }).length;
        const bearish = obs.filter((ob) => {
            const side = String(ob.side ?? ob.direction ?? ob.type ?? "").toLowerCase();
            return side === "bear" || side === "bearish" || side === "short";
        }).length;

        // ── Avg OB width ──────────────────────────────────────────────────────
        const avgWidthPips = obs.length > 0
            ? (obs.reduce((s, ob) => {
                const top = Number(ob.top ?? ob.obTop ?? 0);
                const bot = Number(ob.bot ?? ob.bottom ?? ob.obBottom ?? 0);
                return s + Math.abs(top - bot);
            }, 0) / obs.length * 10000)
            : null;

        // ── Lifecycle classification (strict priority order) ───────────────────
        let sessionFilteredCount  = 0;
        let newsCancelledCount    = 0;
        let reverseCancelledCount = 0;
        let invalidatedCount      = 0;
        let filledCount           = 0;
        let unfilledCount         = 0;

        // Trade lookup for win/loss join
        const tradeById = {};
        trades.forEach((t) => { if (t.id) tradeById[t.id] = t; });

        let filledWins     = 0;
        let filledLosses   = 0;
        let filledBE       = 0;
        let filledUnlinked = 0;

        obs.forEach((ob) => {
            const scTime   = ob.sessionCancelTime       ?? ob.session_cancel_time        ?? null;
            const nbTime   = ob.newsBlackoutTriggerTime ?? ob.news_blackout_trigger_time ?? null;
            const rvTime   = ob.reverseTouchTime        ?? ob.reverse_touch_time         ?? null;
            const invTime  = ob.invalidationTime        ?? ob.invalidation_time          ?? null;
            const fillTime = ob.fillTime                ?? ob.fill_time                  ?? null;
            const ltId     = String(ob.linkedTradeId    ?? ob.linked_trade_id            ?? "");

            if (scTime !== null && scTime !== "") {
                sessionFilteredCount++;
            } else if (nbTime !== null && nbTime !== "") {
                newsCancelledCount++;
            } else if (rvTime !== null && rvTime !== "") {
                reverseCancelledCount++;
            } else if (invTime !== null && invTime !== "") {
                invalidatedCount++;
            } else if ((fillTime !== null && fillTime !== "") || ltId !== "") {
                filledCount++;
                const linkedTrade = ltId ? tradeById[ltId] : null;
                if (linkedTrade) {
                    const r    = numericTradeR(linkedTrade);
                    const norm = normalizeOutcome(linkedTrade?.outcome);
                    if (norm === "WIN"  || (r != null && r >  0.005)) filledWins++;
                    else if (norm === "LOSS" || (r != null && r < -0.005)) filledLosses++;
                    else filledBE++;
                } else {
                    filledUnlinked++;
                }
            } else {
                unfilledCount++;
            }
        });

        const total         = obs.length;
        const eligibleCount = Math.max(0, total - sessionFilteredCount - newsCancelledCount - reverseCancelledCount - invalidatedCount);

        // ── Directional trade stats (executed trades only) ────────────────────
        const execTrades  = trades.filter(isValidExecutedTrade);
        const longTrades  = execTrades.filter((t) => !String(t.direction || "").toLowerCase().startsWith("short"));
        const shortTrades = execTrades.filter((t) =>  String(t.direction || "").toLowerCase().startsWith("short"));
        const sumNetR     = (arr) => Number(arr.reduce((s, t) => s + (numericTradeR(t) || 0), 0).toFixed(2));

        const dirStats = {
            long: {
                obCount: bullish,
                trades:  longTrades.length,
                wins:    longTrades.filter((t) => tradeResultSign(t) > 0).length,
                losses:  longTrades.filter((t) => tradeResultSign(t) < 0).length,
                be:      longTrades.filter((t) => tradeResultSign(t) === 0).length,
                netR:    sumNetR(longTrades),
            },
            short: {
                obCount: bearish,
                trades:  shortTrades.length,
                wins:    shortTrades.filter((t) => tradeResultSign(t) > 0).length,
                losses:  shortTrades.filter((t) => tradeResultSign(t) < 0).length,
                be:      shortTrades.filter((t) => tradeResultSign(t) === 0).length,
                netR:    sumNetR(shortTrades),
            },
        };
        dirStats.long.convPct  = bullish > 0 ? (dirStats.long.trades  / bullish) * 100 : null;
        dirStats.short.convPct = bearish > 0 ? (dirStats.short.trades / bearish) * 100 : null;

        // ── Integrity signals ─────────────────────────────────────────────────
        const sessionFilterEnabled = cfg.session_filter_enabled === true || String(cfg.session_filter_enabled) === "true";
        const newsEnabled          = !!(run?.news_blackout_enabled ?? cfg.news_blackout_enabled);
        const configDir            = String(cfg.trade_direction || "both").toLowerCase().trim();
        const directionRestricted  = configDir !== "both" && configDir !== "" && configDir !== "—";
        const directionRespected   = directionRestricted && execTrades.length > 0
            ? execTrades.every((t) => {
                const td = String(t.direction || "").toLowerCase();
                if (configDir === "long")  return td === "long"  || td === "bull" || td === "bullish";
                if (configDir === "short") return td === "short" || td === "bear" || td === "bearish";
                return true;
            })
            : false;

        return {
            total,
            bullish,
            bearish,
            avgWidthPips,
            // Lifecycle funnel
            sessionFilteredCount,
            newsCancelledCount,
            reverseCancelledCount,
            invalidatedCount,
            filledCount,
            unfilledCount,
            eligibleCount,
            // Filled breakdown
            filledWins,
            filledLosses,
            filledBE,
            filledUnlinked,
            // Direction stats
            dirStats,
            // Integrity
            sessionFilterEnabled,
            newsEnabled,
            directionRestricted,
            directionRespected,
        };
    }, [runData, run]);

    // ── Outcome summary ──────────────────────────────────────────────────────
    const outcomeSummary = React.useMemo(() => {
        if (!tradesForRun?.length) return null;
        let wins = 0, losses = 0, breakeven = 0, special = 0;
        let sumWin = 0, sumLoss = 0;
        let bestR = -Infinity, worstR = Infinity;
        let newsFlatten = 0, newsTouchCancel = 0, newsBlackout = 0;
        let sessionFiltered = 0, unfilled = 0, missed = 0;
        tradesForRun.forEach((t) => {
            const norm = normalizeOutcome(t?.outcome);
            const r = numericTradeR(t);
            if (norm === "NEWS_FLATTEN") newsFlatten++;
            if (norm === "NEWS_TOUCH_CANCEL" || norm === "NEWS_CANCEL") { newsTouchCancel++; special++; return; }
            if (norm === "NEWS_BLACKOUT") { newsBlackout++; special++; return; }
            if (norm === "SESSION_FILTERED") { sessionFiltered++; special++; return; }
            if (norm === "UNFILLED") { unfilled++; special++; return; }
            const missedReason = String(t?.missed_reason || t?.missedReason || "").trim();
            if (t?.missed_trade || t?.missedTrade || missedReason || norm === "MISSED") { missed++; special++; return; }
            if (!isValidExecutedTrade(t) || r == null) { special++; return; }
            if (r > 0.005) { wins++; sumWin += r; if (r > bestR) bestR = r; return; }
            if (r < -0.005) { losses++; sumLoss += r; if (r < worstR) worstR = r; return; }
            breakeven++;
        });
        const total    = wins + losses + breakeven + special;
        const winDenom = wins + losses;
        const winRate  = winDenom > 0 ? (wins / winDenom) * 100 : null;
        const avgWin   = wins   > 0  ? sumWin  / wins   : null;
        const avgLoss  = losses > 0  ? sumLoss / losses : null;
        const payoffRatio = avgWin != null && avgLoss != null && avgLoss !== 0
            ? Math.abs(avgWin / avgLoss)
            : null;
        return {
            wins, losses, breakeven, special, total,
            winRate, avgWin, avgLoss, payoffRatio,
            bestR:  bestR  === -Infinity ? null : bestR,
            worstR: worstR ===  Infinity ? null : worstR,
            newsFlatten, newsTouchCancel, newsBlackout, sessionFiltered, unfilled, missed,
        };
    }, [tradesForRun]);

    // ── Semantic R distribution ──────────────────────────────────────────────
    const R_DIST_V2 = React.useMemo(() => {
        if (!tradesForRun?.length) return [];
        const winTarget = Number.isFinite(Number(runRr)) ? Number(runRr) : 3.3;
        const winMidStart = Math.max(2, Math.floor(winTarget - 1));
        const BUCKETS = [
            { label: "≤ −1R",     test: (r) => r <= -0.95, color: "hsl(var(--bear))" },
            { label: "-1R → 0R",  test: (r) => r > -0.95 && r < -0.005, color: "hsl(var(--bear)/0.55)" },
            { label: "0R",        test: (r) => Math.abs(r) <= 0.005, color: "hsl(var(--muted))" },
            { label: "0R → +1R",  test: (r) => r > 0.005 && r < 1, color: "hsl(var(--accent-primary)/0.55)" },
            { label: "+1R → +2R", test: (r) => r >= 1 && r < 2, color: "hsl(var(--accent-primary)/0.75)" },
            { label: `+${winMidStart}R → +${formatBucketR(winTarget)}R`, test: (r) => r >= winMidStart && r < winTarget - 0.05, color: "hsl(var(--accent-primary))" },
            { label: `> +${formatBucketR(winTarget)}R`, test: (r) => r >= winTarget - 0.05, color: "hsl(var(--success))" },
        ];
        const counts = BUCKETS.map(() => 0);
        let valid = 0;
        tradesForRun.filter(isValidExecutedTrade).forEach((t) => {
            const r = numericTradeR(t);
            if (r == null) return;
            valid++;
            for (let i = 0; i < BUCKETS.length; i++) {
                if (BUCKETS[i].test(r)) { counts[i]++; break; }
            }
        });
        const maxCount = Math.max(...counts, 1);
        return BUCKETS.map((b, i) => ({
            label: b.label,
            count: counts[i],
            pct:   valid > 0 ? (counts[i] / valid) * 100 : 0,
            bar:   counts[i] / maxCount,
            color: b.color,
        }));
    }, [tradesForRun, runRr]);

    const directionalOutcomeStats = React.useMemo(() => {
        const stats = {
            Long: { side: "LONG", trades: 0, wins: 0, losses: 0, partial: 0, netR: 0 },
            Short: { side: "SHORT", trades: 0, wins: 0, losses: 0, partial: 0, netR: 0 },
        };
        validTradesForRun.forEach((trade) => {
            const side = String(trade.direction || "").toLowerCase().startsWith("short") ? "Short" : "Long";
            const r = numericTradeR(trade);
            if (r == null) return;
            const bucket = stats[side];
            bucket.trades++;
            bucket.netR += r;
            if (r > 0.005) bucket.wins++;
            else if (r < -0.005) bucket.losses++;
            if ((r > 0.005 && r < runRr - 0.05) || (r < -0.005 && r > -0.95)) bucket.partial++;
        });
        return Object.values(stats).map((stat) => ({
            ...stat,
            netR: Number(stat.netR.toFixed(2)),
            winRate: stat.wins + stat.losses > 0 ? (stat.wins / (stat.wins + stat.losses)) * 100 : null,
            avgR: stat.trades > 0 ? stat.netR / stat.trades : null,
        }));
    }, [validTradesForRun, runRr]);

    // ── Auto insights ────────────────────────────────────────────────────────
    const autoInsights = React.useMemo(() => {
        if (!outcomeSummary || !R_DIST_V2.length) return [];
        const insights = [];
        const { wins, losses, newsFlatten, newsBlackout, sessionFiltered, missed,
                avgWin, avgLoss, payoffRatio, bestR } = outcomeSummary;
        // Full-stop loss concentration
        const fullStop = R_DIST_V2.find((b) => b.label === "≤ −1R");
        if (fullStop && losses > 0) {
            const pct = Math.round((fullStop.count / losses) * 100);
            if (pct >= 75) insights.push(`${pct}% of losses are full −1R stop-outs`);
        }
        // Top win bucket
        const gt3 = R_DIST_V2[R_DIST_V2.length - 1];
        if (gt3 && wins > 0 && gt3.count > 0) {
            const pct = Math.round((gt3.count / wins) * 100);
            if (pct >= 40) insights.push(`${pct}% of wins exceed +3R`);
            else if (bestR != null && bestR > 3) insights.push(`Best trade reached +${bestR.toFixed(1)}R`);
        }
        // Payoff ratio
        if (payoffRatio != null && payoffRatio >= 2.5 && insights.length < 2) {
            insights.push(`Payoff ratio ${payoffRatio.toFixed(1)}× — wins dwarf losses`);
        }
        // News flatten
        if (newsFlatten > 0 && insights.length < 2) {
            insights.push(`News flatten early-exited ${newsFlatten} trade${newsFlatten > 1 ? "s" : ""}`);
        }
        // Session filter
        if (sessionFiltered > 0 && insights.length < 2) {
            insights.push(`Session filter removed ${sessionFiltered} setup${sessionFiltered > 1 ? "s" : ""}`);
        }
        // News blackout
        if (newsBlackout > 0 && insights.length < 2) {
            insights.push(`${newsBlackout} trade${newsBlackout > 1 ? "s" : ""} blocked by news blackout`);
        }
        // Missed
        if (missed > 0 && insights.length < 2) {
            insights.push(`${missed} missed trade${missed > 1 ? "s" : ""} not reflected in equity`);
        }
        const longStats = directionalOutcomeStats.find((stat) => stat.side === "LONG");
        const shortStats = directionalOutcomeStats.find((stat) => stat.side === "SHORT");
        if (longStats && shortStats && insights.length < 3) {
            const totalNet = longStats.netR + shortStats.netR;
            if (shortStats.trades > 0 && longStats.trades === 0) {
                insights.push("No long trades executed");
            } else if (longStats.trades > 0 && shortStats.trades === 0) {
                insights.push("No short trades executed");
            } else if (Math.abs(totalNet) > 0.5) {
                const leader = shortStats.netR >= longStats.netR ? shortStats : longStats;
                const share = Math.round((leader.netR / totalNet) * 100);
                if (share > 60) insights.push(`${leader.side === "SHORT" ? "Shorts" : "Longs"} produced ${share}% of net R`);
            } else if (longStats.avgR != null && shortStats.avgR != null && Math.abs(longStats.avgR - shortStats.avgR) >= 0.5) {
                const gap = Math.abs(longStats.avgR - shortStats.avgR);
                insights.push(`${longStats.avgR < shortStats.avgR ? "Longs" : "Shorts"} underperformed by ${gap.toFixed(1)}R avg`);
            }
        }
        return insights.slice(0, 3);
    }, [outcomeSummary, R_DIST_V2, directionalOutcomeStats]);

    return (
        <div className="pb-12">
            <div className="px-6 pt-6 pb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <div className="text-[10px] font-mono uppercase tracking-[0.32em] text-[hsl(var(--accent-primary))] mb-2">
                            <span className="inline-block w-6 h-px bg-[hsl(var(--accent-primary))] mr-2 align-middle" />
                            Run Detail
                        </div>
                        <h1 className="font-display text-[28px] sm:text-[34px] leading-tight font-semibold text-white tracking-tight truncate">
                            {displayName}
                        </h1>
                        <div className="mt-1.5 text-[12px] font-mono text-[hsl(var(--accent-primary))] truncate">
                            Run: {displayName} · {runSymbol} · {runTf} · {run.trades} trades
                        </div>
                        <div className="mt-1 text-[12px] text-muted-lab">
                            <div>{runSymbol} · {runTf} · RR {Number.isFinite(runRr) ? runRr.toFixed(1) : "—"}</div>
                            <div>{runDateRange}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Link to={projectId ? `/projects/${encodeURIComponent(projectId)}` : "/projects"}>
                            <NeonButton icon={FolderKanban} tone="ghost">Open Project</NeonButton>
                        </Link>
                        <Link to="/strategy-map"><NeonButton icon={MapIcon} tone="primary">Open Strategy Map</NeonButton></Link>
                        <Link to="/comparison"><NeonButton icon={GitCompareArrows} tone="ghost">Compare Run</NeonButton></Link>
                    </div>
                </div>
            </div>

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip
                    label="Net R"
                    value={`${validNetR >= 0 ? "+" : ""}${validNetR.toFixed(1)}R`}
                    sub={`${validTradeCount} valid trade${validTradeCount === 1 ? "" : "s"}`}
                    tone="primary"
                    icon={TrendingUp}
                    valueClassName={validNetR > 0 ? "!text-[hsl(var(--success))] text-glow-success" : validNetR < 0 ? "!text-[hsl(var(--danger))]" : "!text-[hsl(var(--text))]"}
                />
                <MetricChip
                    label="Win Rate"
                    value={validWinRate != null ? `${validWinRate.toFixed(1)}%` : "N/A"}
                    sub={<><span className="text-[hsl(var(--success))]">{validWinsCount}</span>{` / ${validLossesCount}`}</>}
                    tone="secondary"
                    icon={Target}
                />
                <MetricChip label="Trades"         value={String(validTradeCount)}                  sub={tradeSubtext}                    tone="muted"     icon={Hash} />
                <MetricChip label="Expectancy"     value={expectancy != null ? `${expectancy.toFixed(3)}R` : "N/A"}  sub={expectancy != null ? "PER TRADE" : "Limited Data"} tone="primary"   icon={Activity} />
                <MetricChip label="Profit Factor"  value={pf != null ? (isFinite(pf) ? pf.toFixed(2) : "∞") : "N/A"} sub={pf != null ? "Σ wins / |Σ losses|" : "Limited Data"}        tone="secondary" icon={ShieldCheck} />
                <MetricChip label="Max Drawdown"   value={maxDd != null ? `${maxDd.toFixed(1)}R` : "N/A"}            sub={maxDd != null ? "Worst equity dip" : "Limited Data"}            tone="danger"    icon={AlertTriangle} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel
                    className="xl:col-span-3"
                    title="Equity Curve"
                    action={<Pill tone="primary">CUMULATIVE R</Pill>}
                >
                    {/* Research filter row */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <NeonSelect
                            value={equitySessionFilter}
                            onChange={setEquitySessionFilter}
                            options={["All","Asia","London","London Lull","New York","Outside","Unassigned"].map((v) => ({ value: v, label: v === "All" ? "Session: All" : v }))}
                        />
                        <NeonSelect
                            value={equityDirectionFilter}
                            onChange={setEquityDirectionFilter}
                            options={["All","Long","Short"].map((v) => ({ value: v, label: v === "All" ? "Direction: All" : v }))}
                        />
                        <NeonSelect
                            value={equityStructureFilter}
                            onChange={setEquityStructureFilter}
                            options={["All","BOS","CHoCH"].map((v) => ({ value: v, label: v === "All" ? "Structure: All" : v }))}
                        />
                        {[
                            { label: "Excl. News",   active: equityExcludeNews,   set: setEquityExcludeNews   },
                            { label: "Excl. Missed", active: equityExcludeMissed, set: setEquityExcludeMissed },
                        ].map(({ label, active, set }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => set((v) => !v)}
                                className={[
                                    "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border transition-colors",
                                    active
                                        ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                                        : "border-[hsl(var(--border-mid))] text-muted-lab hover:text-white",
                                ].join(" ")}
                            >
                                {label}
                            </button>
                        ))}
                        <span className="ml-auto text-[9.5px] font-mono text-muted-lab opacity-60 italic">
                            Equity filters affect chart only
                        </span>
                    </div>
                    {/* Display toggles row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        {[
                            { label: "Trade Dots", active: showDots,     set: setShowDots     },
                            { label: "Drawdown",   active: showDrawdown, set: setShowDrawdown },
                            { label: "News",       active: showNews,     set: setShowNews     },
                        ].map(({ label, active, set }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => set((v) => !v)}
                                className={[
                                    "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border transition-colors",
                                    active
                                        ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                                        : "border-[hsl(var(--border-mid))] text-muted-lab hover:text-white",
                                ].join(" ")}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {equityChartData.length === 0 ? (
                        <div className="py-10 text-center font-mono text-[11px] text-muted-lab">
                            No trades match current equity filters.
                        </div>
                    ) : (
                        <EquityCurveV2
                            data={equityChartData}
                            height={340}
                            showDots={showDots}
                            showDrawdown={showDrawdown}
                            showNews={showNews}
                        />
                    )}
                </NeonPanel>

                <SessionSplit trades={tradesForRun} />

                <NeonPanel title="Configuration">
                    {/* ── Group A — Market / Detection ─────────────────────── */}
                    <div className="mb-4">
                        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-2 opacity-60">Market · Detection</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Symbol</div>
                            <div className="text-right text-white font-semibold">{runSymbol}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Detection TF</div>
                            <div className="text-right text-white">{runTf}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Execution TF</div>
                            <div className="text-right text-white">{compactTimeframe(run.executionTf || runData?.config?.execution_timeframe || "1m")}</div>
                            <div className="col-span-2 border-t border-[hsl(var(--border-soft)/0.4)] my-0.5" />
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Date Range</div>
                            <div className="text-right text-white">{runDateRange}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Structure</div>
                            <div className="text-right">
                                {(() => {
                                    const v = runData?.config?.structure_type;
                                    if (!v) return <span className="text-muted-lab">—</span>;
                                    return <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]">{v}</span>;
                                })()}
                            </div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Direction</div>
                            <div className="text-right">
                                {(() => {
                                    const v = runData?.config?.trade_direction;
                                    if (!v) return <span className="text-muted-lab">—</span>;
                                    const vl = v.toLowerCase();
                                    const cls = vl === "long"
                                        ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]"
                                        : vl === "short"
                                        ? "border-[hsl(var(--accent-secondary)/0.4)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.08)]"
                                        : "border-[hsl(var(--border-soft))] text-white";
                                    return <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border ${cls}`}>{v}</span>;
                                })()}
                            </div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Swing</div>
                            <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.swing_length ?? "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">OB Filter</div>
                            <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.ob_filter ?? "—"}</div>
                        </div>
                    </div>

                    {/* ── Group B — Execution / Risk ───────────────────────── */}
                    <div className="mb-4">
                        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-2 opacity-60">Execution · Risk</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">RR</div>
                            <div className="text-right text-[hsl(var(--accent-primary))] font-semibold">{Number.isFinite(runRr) ? `${runRr.toFixed(1)}×` : "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Entry Depth</div>
                            <div className="text-right text-white">
                                {(() => {
                                    const d = runData?.config?.ob_entry_depth_pct;
                                    if (d == null) return "—";
                                    return Number(d) === 0 ? "Edge" : `${d}%`;
                                })()}
                            </div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Entry Buffer</div>
                            <div className="text-right text-white">{run.entryBuffer != null ? `${run.entryBuffer} pip` : "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Stop Buffer</div>
                            <div className="text-right text-white">{run.stopBuffer != null ? `${run.stopBuffer} pip` : "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Verify Ticks</div>
                            <div className="text-right text-white">{run.verifyTicks ?? "—"}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Execution</div>
                            <div className="text-right text-white">{variantLabel(run.executionMode || runData?.config?.execution_mode)}</div>
                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Conflict</div>
                            <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.position_conflict ?? runData?.config?.conflict ?? "—"}</div>
                            {(runData?.config?.position_conflict === "block_opposite" || runData?.config?.conflict === "block_opposite") && (
                                <>
                                    <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Cancel Action</div>
                                    <div className="text-right text-muted-lab text-[10.5px]">{runData?.config?.cancel_action ?? "—"}</div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Group C — Filters (collapse when all permissive) ──── */}
                    {(() => {
                        const cfg = runData?.config || {};
                        const sfEnabled = cfg.session_filter_enabled === true || String(cfg.session_filter_enabled) === "true";
                        const allowedSessions = Array.isArray(cfg.allowed_sessions) ? cfg.allowed_sessions : [];
                        const originSession = cfg.ob_origin_session ?? cfg.origin_session ?? null;
                        const detectionSession = cfg.ob_detection_session ?? cfg.detection_session ?? null;
                        const allPermissive = !sfEnabled
                            && (!originSession    || ["any","Any",""].includes(String(originSession).trim()))
                            && (!detectionSession || ["any","Any",""].includes(String(detectionSession).trim()));
                        if (allPermissive) {
                            return (
                                <div className="mb-4">
                                    <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-1 opacity-60">Filters</div>
                                    <div className="font-mono text-[10px] text-muted-lab">Session filter: Off · All sessions eligible</div>
                                </div>
                            );
                        }
                        return (
                            <div className="mb-4">
                                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-2 opacity-60">Filters</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                                    <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Session Filter</div>
                                    <div className="text-right">
                                        <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border ${sfEnabled ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]" : "border-[hsl(var(--border-soft))] text-muted-lab"}`}>
                                            {sfEnabled ? "✓ Enabled" : "Off"}
                                        </span>
                                    </div>
                                    {sfEnabled && allowedSessions.length > 0 && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Allowed</div>
                                            <div className="text-right flex flex-wrap gap-1 justify-end">
                                                {allowedSessions.map((s) => (
                                                    <span key={s} className="px-1 py-0.5 text-[8.5px] font-mono uppercase border border-[hsl(var(--accent-primary)/0.3)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)]">{s}</span>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {originSession && !["any","Any",""].includes(String(originSession).trim()) && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">OB Origin</div>
                                            <div className="text-right text-white">{originSession}</div>
                                        </>
                                    )}
                                    {detectionSession && !["any","Any",""].includes(String(detectionSession).trim()) && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">OB Detection</div>
                                            <div className="text-right text-white">{detectionSession}</div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Group D — News / Costs (collapse when news off) ───── */}
                    {(() => {
                        const cfg = runData?.config || {};
                        const newsOn   = !!(run?.news_blackout_enabled ?? cfg.news_blackout_enabled);
                        const spread   = cfg.spread_pips ?? cfg.spread ?? null;
                        const slippage = cfg.slippage_pips ?? cfg.slippage ?? null;
                        const commission = cfg.commission_r_per_trade ?? cfg.commission ?? null;
                        const hasAnyCost = [spread, slippage, commission].some((v) => v != null && Number(v) !== 0);
                        if (!newsOn) {
                            return (
                                <div>
                                    <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-1 opacity-60">News · Costs</div>
                                    <div className="font-mono text-[10px] text-muted-lab">
                                        {"News protection: Off"}
                                        {hasAnyCost
                                            ? ` · Spread ${spread ?? "—"} · Slip ${slippage ?? "—"} · Comm ${commission != null ? `${commission}R` : "—"}`
                                            : " · No cost model applied"}
                                    </div>
                                </div>
                            );
                        }
                        const mBefore  = cfg.news_blackout_minutes_before;
                        const mAfter   = cfg.news_blackout_minutes_after;
                        const impacts  = Array.isArray(cfg.news_blackout_impacts)    ? cfg.news_blackout_impacts    : [];
                        const currs    = Array.isArray(cfg.news_blackout_currencies) ? cfg.news_blackout_currencies : [];
                        const cancelT  = cfg.news_cancel_if_touched_during_blackout;
                        const flatAct  = cfg.news_flatten_active_trades;
                        const flatLead = cfg.news_flatten_minutes_before_blackout;
                        return (
                            <div>
                                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-2 opacity-60">News · Costs</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                                    <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">News Blackout</div>
                                    <div className="text-right">
                                        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]">✓ On</span>
                                    </div>
                                    {(mBefore != null || mAfter != null) && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Window</div>
                                            <div className="text-right text-white">
                                                {[mBefore != null && `−${mBefore}m`, mAfter != null && `+${mAfter}m`].filter(Boolean).join(" / ")}
                                            </div>
                                        </>
                                    )}
                                    {impacts.length > 0 && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Impacts</div>
                                            <div className="text-right flex flex-wrap gap-1 justify-end">
                                                {impacts.map((imp) => (
                                                    <span key={imp} className="px-1 py-0.5 text-[8.5px] font-mono uppercase border border-[hsl(var(--warning)/0.3)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)]">{imp}</span>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {currs.length > 0 && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Currencies</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{currs.join(", ")}</div>
                                        </>
                                    )}
                                    {cancelT != null && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Cancel Touched</div>
                                            <div className="text-right">
                                                <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border ${cancelT ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]" : "border-[hsl(var(--border-soft))] text-muted-lab"}`}>
                                                    {cancelT ? "✓ On" : "Off"}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {flatAct != null && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Flatten Active</div>
                                            <div className="text-right">
                                                <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border ${flatAct ? "border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]" : "border-[hsl(var(--border-soft))] text-muted-lab"}`}>
                                                    {flatAct ? "✓ On" : "Off"}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {flatLead != null && flatAct && (
                                        <>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Flatten Lead</div>
                                            <div className="text-right text-white">{flatLead} min before</div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-3 pt-2.5 border-t border-[hsl(var(--border-soft)/0.4)]">
                                    {hasAnyCost ? (
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Spread</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{spread != null ? `${spread} pip` : "—"}</div>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Slippage</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{slippage != null ? `${slippage} pip` : "—"}</div>
                                            <div className="text-muted-lab uppercase tracking-wider text-[9.5px]">Commission</div>
                                            <div className="text-right text-muted-lab text-[10.5px]">{commission != null ? `${commission}R` : "—"}</div>
                                        </div>
                                    ) : (
                                        <div className="font-mono text-[10px] text-muted-lab">No cost model applied</div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </NeonPanel>

                <NeonPanel
                    className="xl:col-span-2"
                    title="Trade Ledger"
                    action={
                        <div className="flex items-center gap-2">
                            {isActiveRun && <VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />}
                            <Pill tone="secondary">{filteredLedgerRows.length} / {(tradesForRun || []).length} SHOWN</Pill>
                        </div>
                    }
                >
                    <div className="mb-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <NeonSelect
                            value={ledgerResultFilter}
                            onChange={setLedgerResultFilter}
                            options={["All", "Wins", "Losses", "Partial Wins", "Partial Losses", "Breakeven / Zero", "Special / Missed"]}
                        />
                        <NeonSelect
                            value={ledgerSessionFilter}
                            onChange={setLedgerSessionFilter}
                            options={["All", "London", "New York", "Asia", "London Lull", "Outside", "Unassigned"]}
                        />
                        <NeonSelect
                            value={ledgerDirectionFilter}
                            onChange={setLedgerDirectionFilter}
                            options={["All", "Long", "Short"]}
                        />
                        <NeonInput
                            placeholder="Search trade / OB / result…"
                            value={ledgerSearch}
                            onChange={(e) => setLedgerSearch(e.target.value)}
                        />
                    </div>
                    <DataTable
                        testId="run-detail-trades"
                        maxHeight={360}
                        columns={[
                            { key: "displayTradeId", label: "Trade ID", render: (r) => r.displayTradeId || r.id || "—" },
                            { key: "displayObId",    label: "OB ID",    render: (r) => r.displayObId || formatObId(r.obId) },
                            { key: "direction", label: "Dir", render: (r) => <Pill tone={r.direction === "Long" ? "success" : "danger"}>{r.direction}</Pill> },
                            { key: "structure", label: "Struct" },
                            { key: "fillSession", label: "Fill Session", render: displaySession },
                            { key: "entry",     label: "Entry Time", render: (r) => formatUtcDisplay(r.entry) },
                            { key: "exit",      label: "Exit Time",  render: (r) => formatUtcDisplay(r.exit) },
                            { key: "entryPrice",label: "Entry",   align: "right", render: (r) => formatPrice(r.entryPrice) },
                            { key: "stop",      label: "Stop",    align: "right", render: (r) => formatPrice(r.stop) },
                            { key: "tp",        label: "TP",      align: "right", render: (r) => formatPrice(r.tp) },
                            { key: "r",         label: "R",       align: "right", render: (r) => <LedgerR trade={r} value={r.r} /> },
                            { key: "outcome",   label: "Result",  render: (r) => <Pill tone={resultTone(r)}>{formatOutcome(r)}</Pill> },
                        ]}
                        rows={filteredLedgerRows}
                    />
                </NeonPanel>

                <NeonPanel title="Order Block Stats">
                    {obStats.total === 0 ? (
                        <div className="py-6 text-center font-mono text-[11px] text-muted-lab">
                            {runData ? "No order block data in this run." : "Import a run to see order block stats."}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3.5">

                            {/* ── Zone 1 — Execution Summary (3×2 compact grid) ── */}
                            <div className="grid grid-cols-3 gap-1.5">
                                {[
                                    { label: "Detected", value: obStats.total,         cls: "text-white" },
                                    { label: "Eligible",  value: obStats.eligibleCount, cls: "text-[hsl(var(--accent-secondary))]" },
                                    { label: "Executed",  value: obStats.filledCount,   cls: "text-[hsl(var(--accent-primary))]" },
                                    { label: "Wins",      value: validWinsCount,         cls: "text-[hsl(var(--success))]" },
                                    { label: "Losses",    value: validLossesCount,       cls: "text-[hsl(var(--danger))]" },
                                    { label: "Unfilled",  value: obStats.unfilledCount, cls: "text-muted-lab" },
                                ].map(({ label, value, cls }) => (
                                    <div key={label} className="flex flex-col items-center justify-center px-2 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm">
                                        <span className={`font-mono text-[14px] font-bold leading-none tabular-nums ${cls}`}>{value}</span>
                                        <span className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-muted-lab">{label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── Zone 2 — Integrity badges ───────────────────── */}
                            {(() => {
                                const { total, sessionFilteredCount, newsCancelledCount, reverseCancelledCount,
                                        invalidatedCount, filledCount, eligibleCount, bullish, bearish,
                                        sessionFilterEnabled, newsEnabled, directionRestricted, directionRespected } = obStats;
                                const badges = [];
                                if (sessionFilterEnabled && sessionFilteredCount > 0)
                                    badges.push({ text: "✓ Session filter", type: "success" });
                                if (newsEnabled && newsCancelledCount > 0)
                                    badges.push({ text: "✓ News blackout", type: "success" });
                                if (directionRestricted && directionRespected)
                                    badges.push({ text: "✓ Direction OK", type: "success" });
                                if (total > 0 && invalidatedCount / total > 0.20)
                                    badges.push({ text: `⚠ High invalidation ${Math.round(invalidatedCount / total * 100)}%`, type: "warning" });
                                if (eligibleCount > 0 && filledCount / eligibleCount < 0.30)
                                    badges.push({ text: `⚠ Low fill conv. ${Math.round(filledCount / eligibleCount * 100)}%`, type: "warning" });
                                if (total > 0 && sessionFilteredCount / total > 0.20)
                                    badges.push({ text: `⚠ Session filter ${Math.round(sessionFilteredCount / total * 100)}%`, type: "warning" });
                                if (total > 0 && newsCancelledCount / total > 0.10)
                                    badges.push({ text: `⚠ News cancel ${Math.round(newsCancelledCount / total * 100)}%`, type: "warning" });
                                if (total > 0 && (bullish / total > 0.70 || bearish / total > 0.70))
                                    badges.push({ text: `⚠ ${bullish > bearish ? "Bull" : "Bear"} skew ${Math.round(Math.max(bullish, bearish) / total * 100)}%`, type: "warning" });
                                if (!badges.length) return null;
                                return (
                                    <div className="flex flex-wrap gap-1">
                                        {badges.slice(0, 6).map((b, i) => (
                                            <span key={i} className={`px-1.5 py-0.5 font-mono text-[9px] border clip-bevel-sm ${b.type === "success" ? "border-[hsl(var(--success)/0.35)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)]" : "border-[hsl(var(--warning)/0.35)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)]"}`}>
                                                {b.text}
                                            </span>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* ── Zone 3 — Lifecycle Funnel ───────────────────── */}
                            {(() => {
                                const { total, eligibleCount, filledCount, unfilledCount,
                                        sessionFilteredCount, newsCancelledCount, reverseCancelledCount,
                                        invalidatedCount, filledWins, filledLosses, filledBE, filledUnlinked } = obStats;
                                const pct = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
                                const R = (key, indent, connector, label, count, denom, colorCls) => (
                                    <div key={key} className="flex items-baseline font-mono text-[10.5px]" style={{ paddingLeft: `${indent * 11}px` }}>
                                        {connector
                                            ? <span className="text-muted-lab mr-1 w-4 shrink-0 text-[9.5px]">{connector}</span>
                                            : indent > 0 ? <span className="w-4 mr-1 shrink-0" /> : null}
                                        <span className={`flex-1 ${colorCls}`}>{label}</span>
                                        <span className="tabular-nums text-white">{count}</span>
                                        <span className="tabular-nums text-muted-lab ml-1.5 w-8 text-right text-[9.5px]">{pct(count, denom)}</span>
                                    </div>
                                );
                                const rows = [
                                    R("det",  0, null, "Detected",         total,               total,         "text-white"),
                                    R("eli",  1, "├─", "Eligible",         eligibleCount,        total,         "text-[hsl(var(--accent-primary))]"),
                                    R("fil",  2, "├─", "Filled",           filledCount,          eligibleCount, "text-[hsl(var(--accent-primary))]"),
                                    ...(filledWins   > 0 ? [R("fw",  3, "├─", "Win",           filledWins,   filledCount, "text-[hsl(var(--success))]")] : []),
                                    ...(filledLosses > 0 ? [R("fl",  3, "├─", "Loss",          filledLosses, filledCount, "text-[hsl(var(--danger))]")]  : []),
                                    ...(filledBE     > 0 ? [R("fbe", 3, "└─", "BE / Partial",  filledBE,     filledCount, "text-muted-lab")]            : []),
                                    R("unf",  2, "└─", "Unfilled",         unfilledCount,        eligibleCount, "text-white"),
                                    ...(sessionFilteredCount  > 0 ? [R("sf",  1, "├─", "Session Filtered", sessionFilteredCount,  total, "text-[hsl(var(--warning))]")] : []),
                                    ...(newsCancelledCount    > 0 ? [R("nc",  1, "├─", "News Cancelled",   newsCancelledCount,    total, "text-[hsl(var(--warning))]")] : []),
                                    ...(invalidatedCount      > 0 ? [R("inv", 1, "├─", "Invalidated",      invalidatedCount,      total, "text-muted-lab")]             : []),
                                    ...(reverseCancelledCount > 0 ? [R("rc",  1, "└─", "Reverse Cancel",   reverseCancelledCount, total, "text-[hsl(var(--warning))]")] : []),
                                ];
                                return (
                                    <div>
                                        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-1.5 opacity-60">Lifecycle</div>
                                        <div className="flex flex-col gap-px">{rows}</div>
                                        {filledUnlinked > 0 && (
                                            <div className="mt-1.5 font-mono text-[9px] text-muted-lab italic">
                                                {filledUnlinked} OB{filledUnlinked !== 1 ? "s" : ""} filled but unlinked — W/L may be understated.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── Zone 4 — Directional Sanity (stacked) ───────── */}
                            {(obStats.dirStats.long.trades > 0 || obStats.dirStats.short.trades > 0) && (
                                <div>
                                    <div className="text-[9px] font-mono uppercase tracking-widest text-muted-lab mb-1.5 opacity-60">Directional</div>
                                    <div className="flex flex-col gap-1.5">
                                        {[
                                            { key: "long",  label: "Long",  accentCls: "text-[hsl(var(--accent-primary))]",   borderCls: "border-[hsl(var(--accent-primary)/0.2)]" },
                                            { key: "short", label: "Short", accentCls: "text-[hsl(var(--accent-secondary))]", borderCls: "border-[hsl(var(--accent-secondary)/0.2)]" },
                                        ].map(({ key, label, accentCls, borderCls }) => {
                                            const s = obStats.dirStats[key];
                                            const other = key === "long" ? obStats.dirStats.short : obStats.dirStats.long;
                                            const convGap = s.convPct != null && other.convPct != null ? Math.abs(s.convPct - other.convPct) : 0;
                                            const convAmber = convGap > 15 && s.convPct != null && s.convPct < (other.convPct ?? 0);
                                            return (
                                                <div key={key} className={`border ${borderCls} bg-[hsl(var(--panel-2)/0.4)] clip-bevel-sm px-2.5 py-2`}>
                                                    {/* Header row */}
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-mono text-[9px] uppercase tracking-wider font-semibold ${accentCls}`}>{label}</span>
                                                        <span className={`font-mono text-[11px] font-semibold tabular-nums ${s.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}`}>
                                                            {s.netR >= 0 ? "+" : ""}{s.netR.toFixed(1)}R
                                                        </span>
                                                    </div>
                                                    {/* Stats row */}
                                                    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-lab flex-wrap">
                                                        <span>{s.obCount} OBs</span>
                                                        <span className="opacity-40">·</span>
                                                        <span>{s.trades}T</span>
                                                        <span className="opacity-40">·</span>
                                                        <span><span className="text-[hsl(var(--success))]">{s.wins}W</span> <span className="text-[hsl(var(--danger))]">{s.losses}L</span> <span>{s.be}BE</span></span>
                                                        {s.convPct != null && (
                                                            <>
                                                                <span className="opacity-40">·</span>
                                                                <span className={convAmber ? "text-[hsl(var(--warning))]" : ""}>{s.convPct.toFixed(0)}% conv</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Zone 5 — Insight Lines ──────────────────────── */}
                            {(() => {
                                const { total, filledCount, eligibleCount, sessionFilteredCount,
                                        reverseCancelledCount, invalidatedCount, bullish, bearish, dirStats } = obStats;
                                const insights = [];
                                if (eligibleCount > 0 && filledCount / eligibleCount < 0.28)
                                    insights.push(`Only ${Math.round(filledCount / eligibleCount * 100)}% of eligible OBs filled — check entry depth or session timing.`);
                                if (total > 0 && sessionFilteredCount / total > 0.22)
                                    insights.push(`${Math.round(sessionFilteredCount / total * 100)}% of detected OBs were session-filtered before fill.`);
                                if (total > 0 && reverseCancelledCount / total > 0.08)
                                    insights.push(`Reverse conflict cancellations unusually high (${reverseCancelledCount}) — consider conflict settings.`);
                                if (total > 0 && bullish / total > 0.70)
                                    insights.push(`Strong bullish detection skew this run (${Math.round(bullish / total * 100)}% of OBs).`);
                                if (total > 0 && bearish / total > 0.70)
                                    insights.push(`Strong bearish detection skew this run (${Math.round(bearish / total * 100)}% of OBs).`);
                                if (invalidatedCount > filledCount && invalidatedCount > 10)
                                    insights.push(`More OBs invalidated (${invalidatedCount}) than filled (${filledCount}) — review swing/TF sensitivity.`);
                                if (dirStats.long.netR > 0 && dirStats.short.netR < 0 && Math.abs(dirStats.short.netR) > 2)
                                    insights.push("Long OBs are driving returns; Short OBs are net negative this run.");
                                if (!insights.length) return null;
                                return (
                                    <div className="flex flex-col gap-1">
                                        {insights.slice(0, 3).map((insight, i) => (
                                            <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 border-l-2 border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.05)]">
                                                <span className="font-mono text-[9.5px] text-[hsl(var(--accent-primary))] shrink-0 mt-px">→</span>
                                                <span className="font-mono text-[9.5px] text-[hsl(var(--text-2))] leading-snug">{insight}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* ── Zone 6 — OB Lab CTA ─────────────────────────── */}
                            <Link
                                to="/order-block-lab"
                                className="flex items-center justify-between gap-2 px-2.5 py-2 border border-[hsl(var(--accent-primary)/0.22)] bg-[hsl(var(--accent-primary)/0.04)] clip-bevel-sm hover:bg-[hsl(var(--accent-primary)/0.09)] hover:border-[hsl(var(--accent-primary)/0.4)] transition-colors"
                            >
                                <div>
                                    <div className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--accent-primary))]">→ Order Block Lab</div>
                                    <div className="font-mono text-[8.5px] text-muted-lab mt-0.5 leading-snug">Structure · Width · Penetration · Age · Session analysis</div>
                                </div>
                                <span className="text-[hsl(var(--accent-primary)/0.5)] text-[10px] shrink-0">↗</span>
                            </Link>

                        </div>
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Outcome Distribution">
                    {!outcomeSummary || outcomeSummary.total === 0 ? (
                        <div className="py-6 text-center font-mono text-[11px] text-muted-lab">
                            No trade outcome data available.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 2xl:grid-cols-[1.15fr_0.85fr] gap-5">
                            <div className="flex flex-col gap-4">
                            {/* Zone A — Outcome Summary chips */}
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: "Wins",      value: outcomeSummary.wins,      tone: "hsl(var(--success))" },
                                    { label: "Losses",    value: outcomeSummary.losses,    tone: "hsl(var(--bear))" },
                                    { label: "Breakeven", value: outcomeSummary.breakeven, tone: "hsl(var(--muted))" },
                                    { label: "Special",   value: outcomeSummary.special,   tone: "hsl(var(--warning))" },
                                ].map(({ label, value, tone }) => (
                                    <div
                                        key={label}
                                        className="flex flex-col items-center justify-center px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm min-w-[64px]"
                                    >
                                        <span className="text-[18px] font-semibold leading-none tabular-nums" style={{ color: tone }}>{value}</span>
                                        <span className="mt-1 text-[11px] font-medium text-muted-lab">{label}</span>
                                    </div>
                                ))}
                                <div className="flex flex-col items-center justify-center px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm min-w-[72px]">
                                    <span className="text-[18px] font-semibold leading-none tabular-nums text-[hsl(var(--accent-primary))]">
                                        {outcomeSummary.winRate != null ? `${outcomeSummary.winRate.toFixed(1)}%` : "—"}
                                    </span>
                                    <span className="mt-1 text-[11px] font-medium text-muted-lab">Win Rate</span>
                                </div>
                                {expectancy != null && (
                                    <div className="flex flex-col items-center justify-center px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm min-w-[72px]">
                                        <span className={`text-[18px] font-semibold leading-none tabular-nums ${expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--bear))]"}`}>
                                            {`${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(2)}R`}
                                        </span>
                                        <span className="mt-1 text-[11px] font-medium text-muted-lab">Expectancy</span>
                                    </div>
                                )}
                            </div>

                            {/* Zone B — R Distribution horizontal bars */}
                            {R_DIST_V2.some((b) => b.count > 0) && (
                                <div>
                                    <div className="flex items-end justify-between gap-3 mb-2">
                                        <SectionKicker>Executed R Distribution</SectionKicker>
                                        <div className="text-[11px] font-medium text-muted-lab">Valid executed trades only</div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {R_DIST_V2.map((bucket) => (
                                            <div key={bucket.label} className="flex items-center gap-2">
                                                <div className="w-[72px] shrink-0 text-[11px] text-right text-muted-lab">{bucket.label}</div>
                                                <div className="flex-1 h-[10px] rounded-sm bg-[hsl(var(--panel-2))] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-sm transition-all"
                                                        style={{ width: `${bucket.bar * 100}%`, background: bucket.color, minWidth: bucket.count > 0 ? "3px" : "0" }}
                                                    />
                                                </div>
                                                <div className="w-[52px] shrink-0 text-[11px] text-muted-lab text-right tabular-nums">
                                                    {bucket.count > 0 ? `${bucket.count} · ${bucket.pct.toFixed(0)}%` : "—"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Zone C — Trade quality */}
                            {(outcomeSummary.avgWin != null || outcomeSummary.avgLoss != null) && (
                                <div>
                                    <div className="mb-2"><SectionKicker>Trade Quality</SectionKicker></div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                        {[
                                            { label: "Avg Win",      value: outcomeSummary.avgWin  != null ? `+${outcomeSummary.avgWin.toFixed(2)}R`  : "—", tone: "hsl(var(--success))" },
                                            { label: "Avg Loss",     value: outcomeSummary.avgLoss != null ? `${outcomeSummary.avgLoss.toFixed(2)}R`    : "—", tone: "hsl(var(--bear))" },
                                            { label: "Payoff Ratio", value: outcomeSummary.payoffRatio != null ? `${outcomeSummary.payoffRatio.toFixed(2)}×` : "—", tone: "hsl(var(--accent-primary))" },
                                            { label: "Best Trade",   value: outcomeSummary.bestR  != null ? `+${outcomeSummary.bestR.toFixed(2)}R`  : "—", tone: "hsl(var(--success))" },
                                            { label: "Worst Trade",  value: outcomeSummary.worstR != null ? `${outcomeSummary.worstR.toFixed(2)}R`   : "—", tone: "hsl(var(--bear))" },
                                        ].map(({ label, value, tone }) => (
                                            <div key={label} className="flex flex-col border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-2.5 py-2 clip-bevel-sm">
                                                <span className="text-[13px] font-semibold leading-none tabular-nums" style={{ color: tone }}>{value}</span>
                                                <span className="mt-1 text-[11px] font-medium text-muted-lab">{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Zone D — Special outcomes */}
                            {outcomeSummary.special > 0 && (
                                <div>
                                    <div className="mb-2"><SectionKicker>Setup / Action Diagnostics</SectionKicker></div>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { label: "News Flatten",      value: outcomeSummary.newsFlatten     },
                                            { label: "News Touch Cancel", value: outcomeSummary.newsTouchCancel },
                                            { label: "News Blackout",     value: outcomeSummary.newsBlackout    },
                                            { label: "Session Filtered",  value: outcomeSummary.sessionFiltered },
                                            { label: "Unfilled",          value: outcomeSummary.unfilled        },
                                            { label: "Missed",            value: outcomeSummary.missed          },
                                        ].filter((s) => s.value > 0).map(({ label, value }) => (
                                            <div key={label} className="flex items-center gap-1.5 px-2 py-1 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm">
                                                <span className="text-[11px] font-semibold tabular-nums text-[hsl(var(--warning))]">{value}</span>
                                                <span className="text-[11px] font-medium text-muted-lab">{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            </div>

                            <div className="flex flex-col gap-4">
                            {/* Zone C — Directional outcome */}
                            {directionalOutcomeStats.some((s) => s.trades > 0) && (
                                <div>
                                    <div className="mb-2"><SectionKicker>Long / Short Outcomes</SectionKicker></div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {directionalOutcomeStats.map((stat) => (
                                            <DirectionalOutcomeCard key={stat.side} stat={stat} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Zone E — Auto insights */}
                            {autoInsights.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="mb-0.5"><SectionKicker>Insights</SectionKicker></div>
                                    {autoInsights.map((insight, i) => (
                                        <div key={i} className="flex items-start gap-2 px-3 py-2 border-l-2 border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.06)]">
                                            <span className="text-[12px] text-[hsl(var(--accent-primary))]">→</span>
                                            <span className="text-[12px] leading-5 text-[hsl(var(--text-2))]">{insight}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            </div>
                        </div>
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Monthly Performance (Net R)">
                    {MONTHLY.length > 0 ? (
                        <div style={{ width: "100%", height: 200 }}>
                            <ResponsiveContainer>
                                <BarChart data={MONTHLY} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                    <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                    <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                    <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                    <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                    <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                                        {MONTHLY.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.75)"} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="py-8 text-center font-mono text-[11px] text-muted-lab">
                            Monthly chart will populate when trades with entry timestamps are available.
                        </div>
                    )}
                </NeonPanel>

                <SessionMatrix trades={tradesForRun} />
                <TimeOfDayHeatmap trades={tradesForRun} />
            </div>
        </div>
    );
}

function VariantSelector({ variants, value }) {
    if (!variants?.length) return null;
    if (variants.length === 1) return <Pill tone="muted">{variantLabel(variants[0])}</Pill>;
    return (
        <NeonSelect
            testId="run-detail-variant"
            value={value || variants[0]}
            onChange={setSelectedTradeVariant}
            options={variants.map((v) => ({ value: v, label: variantLabel(v) }))}
        />
    );
}

function EditableTitle({ value, displayName, editing, canEdit, onEdit, onChange, onSave, onCancel }) {
    if (editing) {
        return (
            <NeonInput
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onSave}
                onKeyDown={(event) => {
                    if (event.key === "Enter") onSave();
                    if (event.key === "Escape") onCancel();
                }}
                className="min-w-[320px] text-[24px] md:text-[30px] font-display"
                autoFocus
            />
        );
    }
    return (
        <span className="group/title inline-flex items-center gap-2" title={displayName}>
            <span>{displayName}</span>
            {canEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="grid place-items-center w-7 h-7 opacity-0 group-hover/title:opacity-100 group-focus-within/title:opacity-100 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))] hover:text-white transition-opacity"
                    aria-label="Rename run"
                >
                    <Edit3 className="w-3.5 h-3.5" />
                </button>
            )}
        </span>
    );
}

function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v || "N/A";
}

function normalizeTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let text = String(value).trim();
    if (!text) return null;
    text = text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text = `${text}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text = `${text}Z`;
    const ms = Date.parse(text);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function formatUtcDisplay(value) {
    const ts = normalizeTimestamp(value);
    if (ts == null) return "—";
    const date = new Date(ts * 1000);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getUTCDate();
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

function formatPrice(value) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    return Number(value).toFixed(5).replace(/\.?0+$/, "");
}

function formatR(value) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    const n = Number(value);
    if (Math.abs(n) < 0.0001) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(/\.?0+$/, "")}R`;
}

function formatSignedR(value, digits = 1) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    const n = Number(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}R`;
}

function formatBucketR(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "3";
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function SectionKicker({ children }) {
    return (
        <div className="text-[12px] font-semibold tracking-[0.03em] text-[hsl(var(--accent-primary))]">
            <span className="inline-block w-4 h-px bg-[hsl(var(--accent-primary)/0.75)] mr-2 align-middle" />
            {children}
        </div>
    );
}

function DirectionalOutcomeCard({ stat }) {
    const netTone = stat.netR > 0 ? "text-[hsl(var(--success))]" : stat.netR < 0 ? "text-[hsl(var(--bear))]" : "text-muted-lab";
    const accent = stat.side === "LONG" ? "hsl(var(--accent-primary)/0.55)" : "hsl(var(--accent-secondary)/0.55)";
    return (
        <div className="border bg-[hsl(var(--panel-2))] clip-bevel-sm px-3 py-2.5" style={{ borderColor: accent }}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold text-white">{stat.side}</span>
                <span className={`text-[14px] font-semibold tabular-nums ${netTone}`}>{formatSignedR(stat.netR)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <OutcomeMiniStat label="Trades" value={stat.trades} />
                <OutcomeMiniStat label="W/L/P" value={`${stat.wins} / ${stat.losses} / ${stat.partial}`} />
                <OutcomeMiniStat label="WR" value={stat.winRate != null ? `${stat.winRate.toFixed(0)}%` : "—"} />
                <OutcomeMiniStat label="Avg" value={stat.avgR != null ? formatSignedR(stat.avgR) : "—"} />
            </div>
        </div>
    );
}

function OutcomeMiniStat({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.35)] px-2 py-1">
            <span className="font-medium text-muted-lab">{label}</span>
            <span className="text-[hsl(var(--text))] tabular-nums">{value}</span>
        </div>
    );
}

function LedgerR({ value, trade = null }) {
    const label = formatR(value);
    if (label === "—") return <span className="text-muted-lab">—</span>;
    const n = Number(value);
    const color = n > 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    const breakdown = trade ? rCostBreakdown(trade) : null;
    if (!breakdown?.show) return <span className={`${color} tabular-nums font-semibold`}>{label}</span>;
    return (
        <span
            className="inline-flex flex-col items-end leading-tight"
            title={`Gross ${formatSignedR(breakdown.gross, 2)} · Costs ${formatCostR(breakdown.cost)} · Net ${formatSignedR(breakdown.net, 2)}`}
        >
            <span className={`${color} tabular-nums font-semibold`}>{label}</span>
            <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted-lab">
                gross {formatSignedR(breakdown.gross, 2).replace("R", "")} · cost {formatCostR(breakdown.cost).replace("R", "")}
            </span>
        </span>
    );
}

function rCostBreakdown(trade) {
    const net = numericTradeR(trade);
    const gross = parseNumericValue(trade?.grossR ?? trade?.gross_r);
    const cost = parseNumericValue(trade?.totalCostR ?? trade?.total_cost_r);
    const show = net != null && (
        (cost != null && Math.abs(cost) > 0.000001) ||
        (gross != null && Math.abs(gross - net) > 0.000001)
    );
    return { show, net, gross: gross ?? net, cost: cost ?? Math.max(0, (gross ?? net) - net) };
}

function formatCostR(value) {
    const n = parseNumericValue(value);
    if (n == null || Math.abs(n) < 0.000001) return "—";
    return `${n > 0 ? "-" : ""}${Math.abs(n).toFixed(2)}R`;
}

function formatObId(value) {
    if (value == null || value === "") return "—";
    const match = String(value).match(/\d+/);
    return match ? `OB-${String(Number(match[0])).padStart(3, "0")}` : String(value);
}

function displaySession(row) {
    const value = row?.fillSession || row?.fill_session || row?.session || row?.trade_session || row?.entry_session;
    return value && value !== "—" ? value : "—";
}

function normalizeOutcome(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function numericTradeR(trade) {
    const raw = trade?.r ?? trade?.pnl_r ?? trade?.pnlR ?? trade?.resultR ?? trade?.news_flatten_r;
    return parseNumericValue(raw);
}

function parseNumericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(String(value ?? "").replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function hasRealTradeEntry(row) {
    return Boolean(row?.entry || row?.fill_time || row?.fillTime || row?.entry_time || row?.entryTime);
}

function ledgerResultBucket(row, rrTarget = 3.3) {
    const outcome = normalizeOutcome(row?.outcome);
    const missedReason = String(row?.missed_reason || row?.missedReason || "").trim();
    const r = numericTradeR(row);
    const target = Number.isFinite(Number(rrTarget)) ? Number(rrTarget) : 3.3;
    if (
        !hasRealTradeEntry(row)
        || row?.missed_trade
        || row?.missedTrade
        || (missedReason && r == null)
        || (r == null && ["SESSION_FILTERED", "UNFILLED", "NEWS_TOUCH_CANCEL", "NEWS_BLACKOUT"].some((key) => outcome.includes(key)))
    ) {
        return "Special / Missed";
    }
    if (!Number.isFinite(r) || Math.abs(r) < 0.005) return "Breakeven / Zero";
    if (r > 0.005 && r < target - 0.05) return "Partial Wins";
    if (r < -0.005 && r > -0.95) return "Partial Losses";
    if (r > 0.005) return "Wins";
    if (r < -0.005) return "Losses";
    return "Special / Missed";
}

function matchesLedgerResultFilter(row, filter, rrTarget = 3.3) {
    const bucket = ledgerResultBucket(row, rrTarget);
    if (filter === "Wins") return bucket === "Wins" || bucket === "Partial Wins";
    if (filter === "Losses") return bucket === "Losses" || bucket === "Partial Losses";
    return bucket === filter;
}

function resultTone(row) {
    const outcome = normalizeOutcome(row?.outcome);
    if (outcome === "WIN") return "success";
    if (outcome === "LOSS") return "danger";
    return "warning";
}

function sessionFilteredLabel(row) {
    const session = row?.missed_session
        || row?.blocked_session
        || row?.session_filtered_session
        || row?.fillSession
        || row?.fill_session
        || row?.session
        || row?.trade_session
        || row?.entry_session
        || row?.close_breach_session;
    return session && session !== "—" ? `SESSION FILTERED - ${session}` : "SESSION FILTERED";
}

function formatOutcome(row) {
    const outcome = row?.outcome;
    const normalized = normalizeOutcome(outcome);
    if (normalized === "SESSION_FILTERED") return sessionFilteredLabel(row);
    return outcome ? String(outcome).replace(/_/g, " ").toUpperCase() : "—";
}

function Stat({ label, value, tone }) {
    const color = { primary: "text-[hsl(var(--accent-primary))]", secondary: "text-[hsl(var(--accent-secondary))]", warning: "text-[hsl(var(--warning))]", muted: "text-white" }[tone];
    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2.5 bg-[hsl(var(--panel-2)/0.5)]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{label}</div>
            <div className={`text-[18px] font-display font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
        </div>
    );
}

const SESSION_COLUMNS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];

function deriveSessionFromTimestamp(value) {
    if (value == null || value === "") return "Unknown";
    const d = new Date(value);
    if (!isFinite(d.getTime())) return "Unknown";
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7) return "Asia";
    if (hour >= 7 && hour < 10) return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

function normalizeSession(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("lull")) return "London Lull";
    if (lower.includes("london")) return "London";
    if (lower.includes("new") || lower === "ny" || lower.includes("nyse")) return "New York";
    if (lower.includes("asia") || lower.includes("tokyo")) return "Asia";
    if (lower.includes("outside")) return "Outside";
    if (lower === "unknown" || lower === "—") return "Unknown";
    return text;
}

function originSessionForTrade(trade) {
    return normalizeSession(trade?.obOriginSession)
        || normalizeSession(trade?.originSession)
        || normalizeSession(trade?.obSession)
        || normalizeSession(trade?.obDirection)
        || normalizeSession(trade?.direction)
        || normalizeSession(trade?.session)
        || "Unknown";
}

function fillSessionForTrade(trade) {
    return normalizeSession(trade?.fillSession)
        || normalizeSession(trade?.fill_session)
        || normalizeSession(trade?.session)
        || normalizeSession(trade?.entrySession)
        || normalizeSession(trade?.entry_session)
        || normalizeSession(trade?.trade_session)
        || deriveSessionFromTimestamp(trade?.entry || trade?.fill_time || trade?.fillTime || trade?.entry_time || trade?.entryTime);
}

// ── Session Split ─────────────────────────────────────────────────────────────
// Static split: groups all run trades by fill session, computes an independent
// cumulative-R curve for each group. Unaffected by the main chart filters.

const SPLIT_SESSION_ORDER = ["Asia", "London", "London Lull", "New York", "Outside"];

function SessionSplit({ trades }) {
    const sessions = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades.filter(isValidExecutedTrade) : [];
        if (!list.length) return [];

        // Group by fill session; "Unknown" → "Unassigned"
        const groups = {};
        list.forEach((trade) => {
            const raw = fillSessionForTrade(trade);
            const key = !raw || raw === "Unknown" ? "Unassigned" : raw;
            if (!groups[key]) groups[key] = [];
            groups[key].push(trade);
        });

        const orderedKeys = [...SPLIT_SESSION_ORDER, "Unassigned"];
        const result = [];

        orderedKeys.forEach((key) => {
            const sessionTrades = groups[key];
            // Skip sessions with no trades; always skip empty Unassigned
            if (!sessionTrades?.length) return;

            let cumR   = 0;
            let peak   = 0;
            let maxDD  = 0;
            let wins   = 0;

            const sparkData = sessionTrades.map((trade) => {
                cumR  += Number(trade.r) || 0;
                const netR = Number(cumR.toFixed(2));
                if (netR > peak) peak = netR;
                const dd = netR - peak;
                if (dd < maxDD) maxDD = dd;
                const outcome = String(trade.outcome || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
                if (outcome === "WIN") wins++;
                return { v: netR };
            });

            result.push({
                name:     key,
                count:    sessionTrades.length,
                netR:     Number(cumR.toFixed(2)),
                winRate:  Number(((wins / sessionTrades.length) * 100).toFixed(1)),
                maxDD:    Number(maxDD.toFixed(2)),
                sparkData,
            });
        });

        return result;
    }, [trades]);

    // ── Collapse state — default closed, persisted to localStorage ───────────
    const [open, setOpen] = React.useState(() => {
        try {
            const v = localStorage.getItem("fxob_run_detail_session_split_open_v1");
            return v === null ? false : v === "true";
        } catch { return false; }
    });
    const toggle = () =>
        setOpen((v) => {
            const next = !v;
            try { localStorage.setItem("fxob_run_detail_session_split_open_v1", String(next)); } catch {}
            return next;
        });

    if (!sessions.length) {
        return (
            <NeonPanel className="xl:col-span-3" title="Session Split">
                <div className="py-6 text-center font-mono text-[11px] text-muted-lab">
                    No session split data available.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Session Split"
            action={
                <div className="flex items-center gap-2">
                    <Pill tone="muted">STATIC · ALL TRADES</Pill>
                    <button
                        type="button"
                        onClick={toggle}
                        className="px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-muted-lab hover:text-white transition-colors"
                    >
                        {open ? "▲ Collapse" : "▼ Expand"}
                    </button>
                </div>
            }
        >
            {open && <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sessions.map((sess) => {
                    const pos       = sess.netR >= 0;
                    const sparkColor = pos ? "hsl(var(--accent-primary))" : "hsl(var(--bear))";
                    const rColor     = pos
                        ? "text-[hsl(var(--accent-primary))]"
                        : "text-[hsl(var(--bear))]";
                    const rLabel = `${sess.netR >= 0 ? "+" : ""}${sess.netR.toFixed(2)}R`;
                    const ddColor = sess.maxDD < -0.005
                        ? "text-[hsl(var(--bear))]"
                        : "text-white";

                    return (
                        <div
                            key={sess.name}
                            className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.5)] clip-bevel-sm p-3 flex flex-col gap-2"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-lab">
                                    {sess.name}
                                </span>
                                <span className="font-mono text-[9px] text-muted-lab">
                                    {sess.count} trade{sess.count !== 1 ? "s" : ""}
                                </span>
                            </div>

                            {/* Net R */}
                            <div className={`font-display text-[22px] font-semibold tabular-nums leading-none ${rColor}`}>
                                {rLabel}
                            </div>

                            {/* Win rate + max DD */}
                            <div className="flex items-center gap-4 font-mono text-[10px]">
                                <span className="text-muted-lab">
                                    WR&nbsp;
                                    <span className="text-white">{sess.winRate.toFixed(0)}%</span>
                                </span>
                                <span className="text-muted-lab">
                                    DD&nbsp;
                                    <span className={ddColor}>
                                        {sess.maxDD < -0.005
                                            ? `${sess.maxDD.toFixed(1)}R`
                                            : "—"}
                                    </span>
                                </span>
                            </div>

                            {/* Sparkline */}
                            {sess.sparkData.length > 1 && (
                                <div style={{ width: "100%", height: 52 }}>
                                    <MiniLine data={sess.sparkData} dataKey="v" color={sparkColor} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>}
        </NeonPanel>
    );
}

function SessionMatrix({ trades }) {
    const data = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const rows = [];
        const rowSet = new Set();
        const cells = {};

        list.forEach((trade) => {
            const row = originSessionForTrade(trade);
            const col = fillSessionForTrade(trade);
            const key = `${row}|||${col}`;
            const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
            if (!rowSet.has(row)) {
                rowSet.add(row);
                rows.push(row);
            }
            if (!cells[key]) cells[key] = { netR: 0, count: 0, row, col };
            cells[key].netR += r;
            cells[key].count += 1;
        });

        const entries = Object.values(cells);
        const best = entries.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worst = entries.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const active = entries.reduce((acc, cur) => (!acc || cur.count > acc.count ? cur : acc), null);
        const maxAbs = entries.reduce((m, cur) => Math.max(m, Math.abs(cur.netR)), 0) || 1;
        return { rows: rows.length ? rows : ["Unknown"], cells, best, worst, active, maxAbs, count: list.length };
    }, [trades]);

    const fmtR = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`;
    const pairLabel = (cell) => cell ? `${cell.row} × ${cell.col}` : "—";

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Session Origin × Fill Session (Net R)"
            action={<Pill tone="muted">{data.count} TRADES</Pill>}
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" data-testid="session-matrix-summary">
                <MetricChip label="Best Pair" value={data.best ? fmtR(data.best.netR) : "—"} sub={pairLabel(data.best)} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Pair" value={data.worst ? fmtR(data.worst.netR) : "—"} sub={pairLabel(data.worst)} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Most Active" value={data.active ? `${data.active.count}` : "—"} sub={pairLabel(data.active)} tone="secondary" icon={Activity} />
            </div>

            <div className="overflow-x-auto scrollbar-thin" data-testid="session-matrix">
                <table className="w-full min-w-[720px] font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Origin / Fill</th>
                            {SESSION_COLUMNS.map((session) => (
                                <th key={session} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider">{session}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => (
                            <tr key={row}>
                                <td className="text-muted-lab px-2 py-1 whitespace-nowrap">{row}</td>
                                {SESSION_COLUMNS.map((col) => {
                                    const cell = data.cells[`${row}|||${col}`];
                                    if (!cell) {
                                        return (
                                            <td key={col}>
                                                <div className="clip-bevel-sm px-2 py-2 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.16 + 0.48 * (Math.abs(cell.netR) / data.maxAbs)).toFixed(3);
                                    const bg = cell.netR >= 0
                                        ? `hsl(var(--accent-primary) / ${alpha})`
                                        : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={col}>
                                            <div className="clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums" style={{ background: bg }}>
                                                <div>{fmtR(cell.netR)}</div>
                                                <div className="text-[9px] text-white/70">{cell.count} trade{cell.count === 1 ? "" : "s"}</div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

// ── Entry Time Heatmap · Day-of-week × Hour-of-day (Net R) ───────────
// Read-only: buckets the run's trades by their entry timestamp's weekday and
// hour, summing Net R per cell. Timestamp-safe (invalid/missing entries are
// skipped) and renders no NaN.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

function TimeOfDayHeatmap({ trades }) {
    const data = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const cells = {};        // `${day}-${hour}` -> { netR, count }
        const dayStats = {};     // day -> { netR, count }
        const hourStats = {};    // hour -> { netR, count }
        const hourCount = {};    // hour -> trade count
        const hourSet = new Set();
        let used = 0, skipped = 0;

        list.forEach((t) => {
            const d = t?.entry != null && t.entry !== "" ? new Date(t.entry) : null;
            if (!d || !isFinite(d.getTime())) { skipped++; return; }
            const day = d.getDay();
            const hour = d.getHours();
            const rv = Number.isFinite(Number(t?.r)) ? Number(t.r) : 0;
            const key = `${day}-${hour}`;
            if (!cells[key]) cells[key] = { netR: 0, count: 0 };
            cells[key].netR += rv;
            cells[key].count += 1;
            if (!dayStats[day]) dayStats[day] = { netR: 0, count: 0, day };
            dayStats[day].netR += rv;
            dayStats[day].count += 1;
            if (!hourStats[hour]) hourStats[hour] = { netR: 0, count: 0, hour };
            hourStats[hour].netR += rv;
            hourStats[hour].count += 1;
            hourSet.add(hour);
            hourCount[hour] = (hourCount[hour] || 0) + 1;
            used += 1;
        });

        const hours = [...hourSet].sort((a, b) => a - b);

        const days = Object.values(dayStats);
        const hourEntries = Object.values(hourStats);
        const bestDay = days.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worstDay = days.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const bestHour = hourEntries.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worstHour = hourEntries.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const activeDay = days.reduce((acc, cur) => (!acc || cur.count > acc.count ? cur : acc), null);
        const populatedSlots = Object.values(cells);
        const profitableSlots = populatedSlots.filter((c) => c.netR > 0).length;
        const profitableSlotPct = populatedSlots.length ? (profitableSlots / populatedSlots.length) * 100 : null;
        const maxAbs = Object.values(cells).reduce((m, v) => Math.max(m, Math.abs(v.netR)), 0) || 1;
        return { cells, hours, bestDay, worstDay, bestHour, worstHour, activeDay, profitableSlotPct, used, skipped, maxAbs };
    }, [trades]);

    const { cells, hours, bestDay, worstDay, bestHour, worstHour, activeDay, profitableSlotPct, used, skipped, maxAbs } = data;
    const fmtHour = (h) => `${String(h).padStart(2, "0")}:00`;
    const fmtR = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`;

    if (!used) {
        return (
            <NeonPanel className="xl:col-span-3" title="Entry Time Heatmap · All Trades by Weekday × Hour">
                <div data-testid="tod-heatmap-empty" className="py-8 text-center text-muted-lab font-mono text-[12px]">
                    No timestamped trades available to build the time-of-day heatmap.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Entry Time Heatmap · All Trades by Weekday × Hour"
            action={<Pill tone="muted">{used} trades{skipped ? ` · ${skipped} undated` : ""}</Pill>}
        >
            <div className="mb-3 text-[11px] font-mono text-muted-lab">
                Aggregates every trade in the selected run by entry weekday and hour.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4" data-testid="tod-summary">
                <MetricChip label="Best Day by Net R"    value={bestDay ? fmtR(bestDay.netR) : "—"}       sub={bestDay ? DOW[bestDay.day] : "—"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Day by Net R"   value={worstDay ? fmtR(worstDay.netR) : "—"}     sub={worstDay ? DOW[worstDay.day] : "—"} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Best Hour by Net R"   value={bestHour ? fmtR(bestHour.netR) : "—"}     sub={bestHour ? fmtHour(bestHour.hour) : "—"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Hour by Net R"  value={worstHour ? fmtR(worstHour.netR) : "—"}   sub={worstHour ? fmtHour(worstHour.hour) : "—"} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Most Active Day"      value={activeDay ? DOW[activeDay.day] : "—"}     sub={activeDay ? `${activeDay.count} trade${activeDay.count === 1 ? "" : "s"}` : "—"} tone="secondary" icon={Activity} />
                <MetricChip label="Profitable Slot %"    value={profitableSlotPct != null ? `${profitableSlotPct.toFixed(1)}%` : "—"} sub="positive Net R cells" tone="secondary" icon={Activity} />
            </div>

            <div className="overflow-x-auto scrollbar-thin" data-testid="tod-heatmap">
                <table className="font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Day / Hr</th>
                            {hours.map((h) => (
                                <th key={h} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider tabular-nums">{fmtHour(h)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {DOW_ORDER.map((day) => (
                            <tr key={day}>
                                <td className="text-muted-lab px-2 py-1">{DOW[day]}</td>
                                {hours.map((h) => {
                                    const c = cells[`${day}-${h}`];
                                    if (!c || c.count === 0) {
                                        return (
                                            <td key={h}>
                                                <div className="clip-bevel-sm px-2 py-1 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.15 + 0.5 * (Math.abs(c.netR) / maxAbs)).toFixed(3);
                                    const bg = c.netR >= 0
                                        ? `hsl(var(--accent-primary) / ${alpha})`
                                        : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={h}>
                                            <div
                                                className="clip-bevel-sm px-2 py-1 text-center text-white tabular-nums"
                                                style={{ background: bg }}
                                                title={`${DOW[day]} ${fmtHour(h)} · ${c.count} trade${c.count === 1 ? "" : "s"}`}
                                            >
                                                {fmtR(c.netR).replace("R", "")}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}
