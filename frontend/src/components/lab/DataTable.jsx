import React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// Premium dense data table styled for research dashboards.
// v2: adds column sorting + heatmap mode.
export function DataTable({
    columns,
    rows,
    rowKey = "id",
    onRowClick,
    selectedKey,
    compact = true,
    testId,
    maxHeight,
    // v2 additions
    heatmap = false,           // shade numeric cells by intensity (green/red)
    defaultSortKey = null,     // column key to sort by on mount
    defaultSortDir = "desc",   // "asc" | "desc"
}) {
    const [sortKey, setSortKey] = React.useState(defaultSortKey);
    const [sortDir, setSortDir] = React.useState(defaultSortDir);

    const handleHeaderClick = (col) => {
        if (col.sortable === false) return;
        if (sortKey === col.key) {
            setSortDir(d => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(col.key);
            setSortDir("desc");
        }
    };

    const sortedRows = React.useMemo(() => {
        if (!sortKey) return rows;
        const col = columns.find(c => c.key === sortKey);
        if (!col) return rows;
        return [...rows].sort((a, b) => {
            const av = col.sortValue ? col.sortValue(a) : a[sortKey];
            const bv = col.sortValue ? col.sortValue(b) : b[sortKey];
            const an = Number(av), bn = Number(bv);
            if (Number.isFinite(an) && Number.isFinite(bn)) {
                return sortDir === "asc" ? an - bn : bn - an;
            }
            return sortDir === "asc"
                ? String(av ?? "").localeCompare(String(bv ?? ""))
                : String(bv ?? "").localeCompare(String(av ?? ""));
        });
    }, [rows, sortKey, sortDir, columns]);

    // Compute per-column max absolute value for heatmap scaling
    const heatRanges = React.useMemo(() => {
        if (!heatmap) return {};
        const out = {};
        columns.forEach(col => {
            if (col.heatmap === false) return;
            const vals = sortedRows.map(r => Number(r[col.key])).filter(Number.isFinite);
            if (!vals.length) return;
            out[col.key] = { maxAbs: Math.max(...vals.map(Math.abs)) || 1 };
        });
        return out;
    }, [heatmap, sortedRows, columns]);

    return (
        <div
            data-testid={testId}
            className="relative overflow-auto scrollbar-thin"
            style={maxHeight ? { maxHeight } : undefined}
        >
            <table className="w-full text-[12px] font-mono border-collapse">
                <thead className="sticky top-0 z-10 bg-[hsl(var(--panel-2))] backdrop-blur">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                onClick={() => handleHeaderClick(col)}
                                className={cn(
                                    "text-left text-[10px] font-mono uppercase tracking-[0.18em] text-title-lab font-medium",
                                    compact ? "px-3 py-2" : "px-4 py-2.5",
                                    col.align === "right" && "text-right",
                                    col.align === "center" && "text-center",
                                    col.sortable !== false && "cursor-pointer hover:text-white transition-colors select-none",
                                )}
                                style={col.width ? { width: col.width } : undefined}
                            >
                                <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                                    {col.label}
                                    {col.sortable !== false && <SortIcon active={sortKey === col.key} dir={sortDir} />}
                                </span>
                            </th>
                        ))}
                    </tr>
                    <tr><td colSpan={columns.length} className="p-0 h-px bg-[hsl(var(--border-soft))]" /></tr>
                </thead>
                <tbody>
                    {sortedRows.map((row, idx) => {
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
                                {columns.map((col) => {
                                    let cellStyle = {};
                                    if (heatmap && col.heatmap !== false && heatRanges[col.key]) {
                                        const val = Number(row[col.key]);
                                        if (Number.isFinite(val)) {
                                            const alpha = (0.06 + 0.3 * (Math.abs(val) / heatRanges[col.key].maxAbs)).toFixed(3);
                                            cellStyle = {
                                                background: val >= 0
                                                    ? `hsl(var(--success) / ${alpha})`
                                                    : `hsl(var(--danger) / ${alpha})`,
                                            };
                                        }
                                    }
                                    return (
                                        <td
                                            key={col.key}
                                            style={cellStyle}
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
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function SortIcon({ active, dir }) {
    if (!active) return <ChevronsUpDown className="w-2.5 h-2.5 opacity-30 shrink-0" />;
    return dir === "asc"
        ? <ChevronUp className="w-2.5 h-2.5 text-[hsl(var(--accent-primary))] shrink-0" />
        : <ChevronDown className="w-2.5 h-2.5 text-[hsl(var(--accent-primary))] shrink-0" />;
}

export function Pill({ children, tone = "muted", className }) {
    const toneClass = {
        muted:     "row-chip-muted",
        primary:   "row-chip-primary",
        secondary: "row-chip-secondary",
        info:      "row-chip-info",
        success:   "row-chip-success",
        danger:    "row-chip-danger",
        warning:   "row-chip-warning",
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
