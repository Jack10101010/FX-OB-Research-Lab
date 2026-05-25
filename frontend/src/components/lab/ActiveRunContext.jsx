import React from "react";
import { Link } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import { compactTimeframe, getRunDisplayName, useDataset } from "@/data/store";

/**
 * Prominent page context showing the active project and active run.
 * Self-contained — calls useDataset() internally.
 */
export function ActiveRunContext({ pageLabel = "Research Lab", compact = false, actions = null, description = "", className = "" }) {
    const { ACTIVE_PROJECT, RUNS, ACTIVE_RUN, activeRunId } = useDataset();
    const activeRun = RUNS.find((r) => r.id === activeRunId);
    const hasRun = !!activeRun;
    const runName = hasRun ? getRunDisplayName(activeRun) : "";
    const projectName = ACTIVE_PROJECT?.name || "";
    const projectId = ACTIVE_PROJECT?.id || null;
    const title = hasRun ? (projectName || runName || pageLabel) : pageLabel;
    const symbol = activeRun?.symbol || ACTIVE_RUN?.symbol || "—";
    const timeframe = compactTimeframe(activeRun?.detectionTf || ACTIVE_RUN?.detectionTf);
    const trades = Number(activeRun?.trades ?? ACTIVE_RUN?.trades ?? 0);
    const dateRange = formatDateRange(readDateRange(activeRun, ACTIVE_RUN));
    const subtitle = hasRun
        ? [
            projectName ? `Run: ${runName}` : `Unassigned run · ${runName}`,
            symbol,
            timeframe,
            `${trades} trades`,
            dateRange,
        ].filter(Boolean).join(" · ")
        : "No active run selected. Import or run a backtest to populate this page.";

    return (
        <div
            className={`mx-6 mb-4 clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.42)] via-[hsl(var(--border-soft))] to-[hsl(var(--accent-secondary)/0.32)] ${className}`}
        >
            <div className={`clip-bevel bg-[hsl(var(--panel)/0.96)] ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[hsl(var(--accent-secondary))]">
                            {pageLabel}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h1 className={`${compact ? "text-xl" : "text-2xl"} font-display text-[hsl(var(--text-1))] truncate`}>
                                {title}
                            </h1>
                            {projectId && (
                                <Link
                                    to={`/projects/${encodeURIComponent(projectId)}`}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.45)] bg-[hsl(var(--accent-secondary)/0.06)] text-[10px] font-mono uppercase tracking-[0.16em] text-[hsl(var(--accent-secondary))] hover:text-white transition-colors"
                                >
                                    <FolderOpen className="w-3 h-3" />
                                    Open Project
                                </Link>
                            )}
                        </div>
                        <div className="mt-1 text-[12px] font-mono text-[hsl(var(--accent-secondary)/0.86)]">
                            {subtitle}
                        </div>
                        {description && (
                            <div className="mt-1.5 max-w-4xl text-[12px] leading-relaxed text-[hsl(var(--text-2))]">
                                {description}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {hasRun && <ContextBadge tone="primary">Imported</ContextBadge>}
                        {hasRun && <ContextBadge tone="success">Active Run</ContextBadge>}
                        {projectId && <ContextBadge tone="secondary">Project Active</ContextBadge>}
                        {hasRun && <ContextBadge tone="muted">{trades} trades</ContextBadge>}
                        {actions}
                    </div>
                </div>
            </div>
        </div>
    );
}

function readDateRange(run, activeSummary) {
    const summary = run?.summary || {};
    const config = run?.config || {};
    const direct = run?.dateRange || summary.dateRange || summary.date_range || activeSummary?.dateRange;
    const from = run?.dateFrom || summary.date_from || summary.dateFrom || config.date_from || config.dateFrom || config.start_date || config.startDate;
    const to = run?.dateTo || summary.date_to || summary.dateTo || config.date_to || config.dateTo || config.end_date || config.endDate;
    if (from || to) return { from, to };
    return direct || null;
}

function formatDateRange(value) {
    if (!value) return "";
    if (typeof value === "object") {
        const from = formatHumanDate(value.from);
        const to = formatHumanDate(value.to);
        return from && to ? `${from} → ${to}` : from || to || "";
    }
    const parts = String(value).split("→").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
        const from = formatHumanDate(parts[0]);
        const to = formatHumanDate(parts[1]);
        return from && to ? `${from} → ${to}` : "";
    }
    return "";
}

function formatHumanDate(value) {
    if (!value || value === "?") return "";
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

function ContextBadge({ tone = "muted", children }) {
    const toneClass = {
        primary: "border-[hsl(var(--accent-primary)/0.45)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)]",
        secondary: "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)]",
        success: "border-[hsl(var(--success)/0.45)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)]",
        muted: "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] bg-[hsl(var(--panel-2)/0.45)]",
    }[tone];
    return (
        <span className={`inline-flex items-center px-2 py-1 clip-bevel-sm border text-[10px] font-mono uppercase tracking-[0.16em] ${toneClass}`}>
            {children}
        </span>
    );
}
