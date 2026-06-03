/**
 * SessionCard — compact, clickable summary card for a single trading session.
 *
 * Props:
 *   session       string  — session key (e.g. "London")
 *   metrics       object  — from computeSessionMetrics()
 *   sessionTrades object[]
 *   onSelect      (session) => void
 *   isSelected    boolean
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ColoredR } from "@/components/lab/DataTable";
import { formatSessionTimeRange, SESSION_COLOR_ROLES, getSessionDef } from "./config/sessionConfig";
import { buildSessionEquityCurve } from "./analytics/sessionAnalytics";

// ── Verdict styling ───────────────────────────────────────────────────────────

const VERDICT_STYLES = {
    Strong:     { pill: "border-[hsl(var(--success)/0.6)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.10)]", dot: "bg-[hsl(var(--success))]" },
    Selective:  { pill: "border-[hsl(var(--warning)/0.6)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.10)]", dot: "bg-[hsl(var(--warning))]" },
    Avoid:      { pill: "border-[hsl(var(--danger)/0.6)]  text-[hsl(var(--danger))]  bg-[hsl(var(--danger)/0.10)]",  dot: "bg-[hsl(var(--danger))]" },
    "No Data":  { pill: "border-[hsl(var(--border-mid))]  text-muted-lab             bg-transparent",                dot: "bg-[hsl(var(--border-mid))]" },
};

function VerdictPill({ verdict }) {
    const styles = VERDICT_STYLES[verdict] || VERDICT_STYLES["No Data"];
    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[9.5px] font-ui font-semibold uppercase tracking-[0.08em] border clip-bevel-sm",
            styles.pill,
        )}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", styles.dot)} />
            {verdict}
        </span>
    );
}

// ── Mini sparkline (SVG, no recharts overhead) ────────────────────────────────

function MiniSparkline({ data }) {
    if (!data || data.length < 2) {
        return <div className="w-full h-10 opacity-30 border-b border-[hsl(var(--border-soft))]" />;
    }
    const w = 120;
    const h = 40;
    const values = data.map((d) => d.netR ?? d.v ?? 0);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    const toY = (v) => h - ((v - min) / range) * (h - 4) - 2;
    const points = values
        .map((v, i) => `${(i / (values.length - 1)) * w},${toY(v)}`)
        .join(" ");
    const finalR = values[values.length - 1];
    const stroke = finalR >= 0 ? "hsl(var(--success))" : "hsl(var(--danger))";
    const zeroY = toY(0);

    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
            <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="hsl(var(--border-mid))" strokeWidth="0.5" strokeDasharray="2 3" />
            <polyline
                fill="none"
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                style={{ filter: `drop-shadow(0 0 3px ${stroke})` }}
            />
        </svg>
    );
}

// ── Metric row item ───────────────────────────────────────────────────────────

function MetricItem({ label, value, className }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab leading-none">
                {label}
            </span>
            <span className={cn("text-[13px] font-num tabular-nums leading-none", className)}>
                {value}
            </span>
        </div>
    );
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtR(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}

function fmtPct(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n.toFixed(1)}%`;
}

function fmtNum(v, decimals = 2) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return n.toFixed(decimals);
}

// ── SessionCard ───────────────────────────────────────────────────────────────

export function SessionCard({ session, metrics, sessionTrades, onSelect, isSelected }) {
    const timeRange = formatSessionTimeRange(session);
    const def = getSessionDef(session);
    const colorClass = SESSION_COLOR_ROLES[def?.colorRole || "muted"];

    const equityCurve = useMemo(
        () => buildSessionEquityCurve(sessionTrades || []),
        [sessionTrades],
    );

    const noData = !metrics || metrics.tradeCount === 0;

    const netRColor = !noData && metrics.netR > 0
        ? "text-[hsl(var(--success))]"
        : !noData && metrics.netR < 0
            ? "text-[hsl(var(--danger))]"
            : "text-muted-lab";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect && onSelect(session)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect && onSelect(session)}
            data-testid={`session-card-${session.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn(
                "relative cursor-pointer group transition-all duration-200",
                "clip-bevel p-[1px]",
                isSelected
                    ? "bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]"
                    : "bg-gradient-to-br from-[hsl(var(--accent-border)/0.8)] via-[hsl(var(--border-mid))] to-[hsl(var(--accent-secondary)/0.4)]",
                "hover:from-[hsl(var(--accent-primary)/0.8)] hover:to-[hsl(var(--accent-secondary)/0.6)]",
            )}
        >
            <div className={cn(
                "clip-bevel bg-[hsl(var(--panel))] relative overflow-hidden",
                isSelected && "bg-[hsl(var(--panel-2))]",
            )}>
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--accent-primary)/0.04)] via-transparent to-[hsl(var(--accent-secondary)/0.03)] pointer-events-none" />

                <div className="relative p-4 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                            <span className={cn(
                                "text-[11px] font-ui font-semibold uppercase tracking-[0.10em] leading-none",
                                colorClass,
                            )}>
                                {session}
                            </span>
                            {timeRange && (
                                <span className="text-[9.5px] font-ui text-muted-lab leading-none mt-0.5">
                                    {timeRange}
                                </span>
                            )}
                        </div>
                        <VerdictPill verdict={metrics?.verdict || "No Data"} />
                    </div>

                    {/* Sparkline */}
                    <div className="h-10 w-full">
                        <MiniSparkline data={equityCurve} />
                    </div>

                    {/* P0 Metrics grid */}
                    {noData ? (
                        <div className="text-[11px] font-ui text-muted-lab">No trades in this session</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-4 gap-x-3 gap-y-2">
                                <MetricItem
                                    label="Net R"
                                    value={fmtR(metrics.netR)}
                                    className={netRColor}
                                />
                                <MetricItem
                                    label="Win Rate"
                                    value={fmtPct(metrics.winRate)}
                                    className="text-[hsl(var(--text))]"
                                />
                                <MetricItem
                                    label="Exp"
                                    value={fmtNum(metrics.expectancy, 3)}
                                    className={metrics.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}
                                />
                                <MetricItem
                                    label="PF"
                                    value={fmtNum(metrics.profitFactor, 2)}
                                    className={
                                        metrics.profitFactor == null ? "text-muted-lab"
                                        : metrics.profitFactor >= 1.5 ? "text-[hsl(var(--success))]"
                                        : metrics.profitFactor < 1 ? "text-[hsl(var(--danger))]"
                                        : "text-[hsl(var(--text-2))]"
                                    }
                                />
                                <MetricItem
                                    label="Max DD"
                                    value={fmtR(metrics.maxDD)}
                                    className="text-[hsl(var(--danger))]"
                                />
                                <MetricItem
                                    label="Trades"
                                    value={metrics.tradeCount}
                                    className="text-[hsl(var(--text))]"
                                />
                                <MetricItem
                                    label="Streak"
                                    value={metrics.longestStreak}
                                    className={metrics.longestStreak >= 5 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]"}
                                />
                            </div>

                            {/* Direction chips */}
                            <div className="flex items-center gap-2 pt-0.5 border-t border-[hsl(var(--border-soft)/0.4)]">
                                <span className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Dir</span>
                                <span className={cn(
                                    "text-[10.5px] font-num tabular-nums",
                                    metrics.longNetR != null && metrics.longNetR >= 0
                                        ? "text-[hsl(var(--success))]"
                                        : "text-[hsl(var(--danger))]",
                                )}>
                                    L: {metrics.longNetR != null ? fmtR(metrics.longNetR) : "—"}
                                </span>
                                <span className={cn(
                                    "text-[10.5px] font-num tabular-nums",
                                    metrics.shortNetR != null && metrics.shortNetR >= 0
                                        ? "text-[hsl(var(--success))]"
                                        : "text-[hsl(var(--danger))]",
                                )}>
                                    S: {metrics.shortNetR != null ? fmtR(metrics.shortNetR) : "—"}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SessionCard;
