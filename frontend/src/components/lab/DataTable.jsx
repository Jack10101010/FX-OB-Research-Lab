import React from "react";
import { cn } from "@/lib/utils";

// Premium dense data table styled for research dashboards.
export function DataTable({
    columns,
    rows,
    rowKey = "id",
    onRowClick,
    selectedKey,
    compact = true,
    testId,
    maxHeight,
}) {
    return (
        <div data-testid={testId} className={cn("relative overflow-auto scrollbar-thin", maxHeight ? "" : "")} style={maxHeight ? { maxHeight } : undefined}>
            <table className="w-full text-[12px] font-mono border-collapse">
                <thead className="sticky top-0 z-10 bg-[hsl(var(--panel-2))] backdrop-blur">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={cn(
                                    "text-left text-[10px] font-mono uppercase tracking-[0.18em] text-title-lab font-medium",
                                    compact ? "px-3 py-2" : "px-4 py-2.5",
                                    col.align === "right" && "text-right",
                                    col.align === "center" && "text-center",
                                )}
                                style={col.width ? { width: col.width } : undefined}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                    <tr><td colSpan={columns.length} className="p-0 h-px bg-[hsl(var(--border-soft))]" /></tr>
                </thead>
                <tbody>
                    {rows.map((row, idx) => {
                        const k = row[rowKey] ?? idx;
                        const selected = selectedKey != null && k === selectedKey;
                        return (
                            <tr
                                key={k}
                                onClick={() => onRowClick && onRowClick(row)}
                                className={cn(
                                    "border-b border-[hsl(var(--border-soft)/0.4)] transition-colors",
                                    onRowClick && "cursor-pointer",
                                    selected
                                        ? "bg-[hsl(var(--accent-primary)/0.10)]"
                                        : "hover:bg-[hsl(var(--panel-2)/0.6)]",
                                )}
                            >
                                {columns.map((col) => (
                                    <td
                                        key={col.key}
                                        className={cn(
                                            compact ? "px-3 py-1.5" : "px-4 py-2.5",
                                            col.align === "right" && "text-right",
                                            col.align === "center" && "text-center",
                                            col.mono === false ? "font-sans" : "font-mono",
                                            "text-[hsl(var(--text-2))]",
                                            selected && "text-white",
                                        )}
                                    >
                                        {col.render ? col.render(row, idx) : row[col.key]}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function Pill({ children, tone = "muted", className }) {
    const toneClass = {
        muted: "row-chip-muted",
        primary: "row-chip-primary",
        secondary: "row-chip-secondary",
        info: "row-chip-info",
        success: "row-chip-success",
        danger: "row-chip-danger",
        warning: "row-chip-warning",
    }[tone] || "row-chip-muted";

    return (
        <span className={cn("row-chip", toneClass, className)}>
            {children}
        </span>
    );
}

export function ColoredR({ value }) {
    const positive = value >= 0;
    return (
        <span className={cn("font-mono tabular-nums", positive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
            {positive ? "+" : ""}{Number(value).toFixed(1)}R
        </span>
    );
}
