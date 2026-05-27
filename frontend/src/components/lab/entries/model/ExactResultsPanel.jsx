import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { ColoredR, Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { ENTRY_FAMILIES, sampleConfidence } from "../analytics/entryRegistry";
import {
    fmtMaybePct, fmtMaybeR, fmtMaybeExp, fmtCount, isFiniteNumber, num,
} from "../analytics/entryFormatters";
import { entryResultsToCsv, downloadCsv } from "../analytics/entryAnalytics";
import { useLocalStorageState } from "../shared/useEntryWorkspace";

function DeltaCell({ row }) {
    if (row.isBaseline) return <span className="font-mono text-[hsl(var(--accent-secondary))]">BASELINE</span>;
    if (!isFiniteNumber(row.deltaVsBaseline)) return <span className="text-muted-lab">—</span>;
    const pos = row.deltaVsBaseline >= 0;
    return (
        <span className={cn("font-mono font-semibold tabular-nums", pos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
            {pos ? "+" : ""}{num(row.deltaVsBaseline).toFixed(1)}R
        </span>
    );
}

function RowTags({ row }) {
    const tags = [];
    if (row.isBaseline)      tags.push(<Pill key="bl"   tone="secondary">BASELINE</Pill>);
    if (row.isBestNetR)      tags.push(<Pill key="nr"   tone="success">BEST R</Pill>);
    if (row.isBestExpectancy) tags.push(<Pill key="exp" tone="primary">BEST EXP</Pill>);
    if (row.isLowestDD)      tags.push(<Pill key="dd"   tone="muted">LOW DD</Pill>);
    if (row.isBestFillPct)   tags.push(<Pill key="fill" tone="secondary">BEST FILL</Pill>);
    if (row.isBestPF)        tags.push(<Pill key="pf"   tone="success">BEST PF</Pill>);
    if (!row.exact && !row.isBaseline) tags.push(<Pill key="pend" tone="warning">PENDING</Pill>);
    const conf = sampleConfidence(row.fills);
    if (!row.isBaseline && row.exact && conf.tone !== "success") {
        tags.push(<Pill key="conf" tone={conf.tone}>{conf.label}</Pill>);
    }
    return tags.length ? (
        <div className="flex max-w-[210px] flex-wrap items-center gap-1 leading-none [&_.row-chip]:whitespace-nowrap">
            {tags}
        </div>
    ) : <span className="text-muted-lab">—</span>;
}

const SORT_STORAGE_KEY = "fxob_entries_workspace_exact_sort_v1";
const FAMILY_STORAGE_KEY = "fxob_entries_workspace_family_groups_v1";

function formatMinutes(value) {
    if (!isFiniteNumber(value)) return "—";
    const minutes = num(value);
    if (minutes < 60) return `${minutes.toFixed(minutes % 1 ? 1 : 0)}m`;
    const hours = minutes / 60;
    return `${hours.toFixed(hours % 1 ? 1 : 0)}h`;
}

function gridTemplate(colVis) {
    return "minmax(190px,2fr) minmax(190px,1.35fr) 64px 62px 62px 66px 58px 58px 62px 72px 72px 72px 78px"
        + (colVis.profitFactor ? " 54px" : "")
        + (colVis.avgMAE ? " 62px" : "")
        + (colVis.avgMFE ? " 62px" : "")
        + (colVis.avgTimeToTP ? " 86px" : "")
        + (colVis.avgTimeToSL ? " 86px" : "");
}

function FamilySection({ family, rows, colVis, open, onToggle }) {
    const familyColor = ENTRY_FAMILIES.find(f => f.key === family)?.color || "hsl(var(--text-2))";
    return (
        <div className="mb-1">
            <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[hsl(var(--panel-2)/0.4)] transition-colors select-none"
                onClick={onToggle}
            >
                {open ? <ChevronDown className="w-3 h-3 text-muted-lab" /> : <ChevronRight className="w-3 h-3 text-muted-lab" />}
                <span className="text-[9.5px] font-mono uppercase tracking-[0.22em]" style={{ color: familyColor }}>{family}</span>
                <span className="text-[9px] font-mono text-muted-lab">({rows.length})</span>
            </div>
            {open && rows.map(row => <ResultRow key={row.mode} row={row} colVis={colVis} />)}
        </div>
    );
}

function ResultRow({ row, colVis }) {
    return (
        <div className={cn(
            "grid min-h-[38px] items-center gap-2 border-b border-[hsl(var(--border-soft)/0.3)] px-3 py-2 text-[12px] font-display tabular-nums transition-colors",
            "hover:bg-[hsl(var(--panel-2)/0.5)]",
            row.isBestNetR && !row.isBaseline
                ? "bg-[hsl(var(--success)/0.08)] border-[hsl(var(--success)/0.4)] shadow-[inset_3px_0_0_hsl(var(--success))]"
                : row.isBaseline
                    ? "bg-[hsl(var(--accent-secondary)/0.04)] border-dashed border-[hsl(var(--accent-secondary)/0.3)]"
                    : "",
        )}
            style={{ gridTemplateColumns: gridTemplate(colVis) }}
        >
            <div className={cn("truncate pr-1 font-medium", row.isBaseline ? "text-[hsl(var(--accent-secondary))] font-semibold" : row.isBestNetR ? "text-[hsl(var(--success))] font-semibold" : "text-white")}>
                {row.label}
            </div>
            <div className="min-w-0"><RowTags row={row} /></div>
            <div className="text-right text-[hsl(var(--text-2))]">{row.threshold || "—"}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.eligible ?? row.trades)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.fills)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybePct(row.fillPct)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.wins)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.losses)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybePct(row.winRate)}</div>
            <div className="text-right">{row.netR == null ? <span className="text-muted-lab">—</span> : <ColoredR value={row.netR} />}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeExp(row.expectancy)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.maxDD)}</div>
            <div className="text-right"><DeltaCell row={row} /></div>
            {colVis.profitFactor && <div className="text-right text-[hsl(var(--text-2))]">{isFiniteNumber(row.profitFactor) ? num(row.profitFactor).toFixed(1) : "—"}</div>}
            {colVis.avgMAE && <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.avgMAE)}</div>}
            {colVis.avgMFE && <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.avgMFE)}</div>}
            {colVis.avgTimeToTP && <div className="text-right text-[hsl(var(--text-2))]">{formatMinutes(row.avgTimeToTP)}</div>}
            {colVis.avgTimeToSL && <div className="text-right text-[hsl(var(--text-2))]">{formatMinutes(row.avgTimeToSL)}</div>}
        </div>
    );
}

function TableHeader({ colVis, sortState, onSort }) {
    const headers = [
        { key: "label", label: "Model", align: "left" },
        { key: "tags", label: "Tags", align: "left", sortable: false },
        { key: "threshold", label: "Thresh" },
        { key: "eligible", label: "Setups" },
        { key: "fills", label: "Filled" },
        { key: "fillPct", label: "Fill%" },
        { key: "wins", label: "Wins" },
        { key: "losses", label: "Loss" },
        { key: "winRate", label: "WR" },
        { key: "netR", label: "Net R" },
        { key: "expectancy", label: "Exp" },
        { key: "maxDD", label: "Max DD" },
        { key: "deltaVsBaseline", label: "Δ Base" },
        ...(colVis.profitFactor ? [{ key: "profitFactor", label: "PF" }] : []),
        ...(colVis.avgMAE ? [{ key: "avgMAE", label: "MAE" }] : []),
        ...(colVis.avgMFE ? [{ key: "avgMFE", label: "MFE" }] : []),
        ...(colVis.avgTimeToTP ? [{ key: "avgTimeToTP", label: "Avg TP Time" }] : []),
        ...(colVis.avgTimeToSL ? [{ key: "avgTimeToSL", label: "Avg SL Time" }] : []),
    ];
    return (
        <div className="sticky top-0 z-10 grid gap-2 border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-3 backdrop-blur"
            style={{ display: "grid", gridTemplateColumns: gridTemplate(colVis) }}
        >
            {headers.map((h, i) => (
                <button
                    key={h.key}
                    type="button"
                    disabled={h.sortable === false}
                    onClick={() => onSort(h.key)}
                    className={cn(
                        "py-2 text-[10.5px] font-display font-semibold uppercase leading-tight tracking-[0.06em] text-title-lab disabled:cursor-default",
                        i > 1 ? "text-right" : "text-left",
                        h.sortable === false ? "" : "hover:text-white transition-colors",
                    )}
                >
                    {h.label}{sortState.key === h.key ? (sortState.dir === "asc" ? " ↑" : " ↓") : ""}
                </button>
            ))}
        </div>
    );
}

export function ExactResultsPanel({ exactRows, colVis, setColVis }) {
    const [sortState, setSortState] = useLocalStorageState(SORT_STORAGE_KEY, { key: "netR", dir: "desc" });
    const [familyOpen, setFamilyOpen] = useLocalStorageState(FAMILY_STORAGE_KEY, {});
    const hasExact = exactRows.some(r => r.exact && !r.isBaseline);

    const sortedRows = useMemo(() => sortRows(exactRows, sortState), [exactRows, sortState]);
    const families = [...new Set(sortedRows.map(r => r.family).filter(Boolean))];

    const extCols = [
        { key: "profitFactor", label: "Profit Factor" },
        { key: "avgMAE",       label: "Avg MAE" },
        { key: "avgMFE",       label: "Avg MFE" },
        { key: "avgTimeToTP",  label: "Time to TP" },
        { key: "avgTimeToSL",  label: "Time to SL" },
    ];

    const handleExport = () => {
        const csv = entryResultsToCsv(exactRows);
        const ts  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        downloadCsv(`entries_results_${ts}.csv`, csv);
    };

    const handleSort = (key) => {
        setSortState(prev => ({
            key,
            dir: prev?.key === key && prev?.dir === "desc" ? "asc" : "desc",
        }));
    };

    const toggleFamily = (family) => {
        setFamilyOpen(prev => ({ ...prev, [family]: prev?.[family] === false }));
    };

    return (
        <NeonPanel
            title="Exact Entry Simulation Results"
            className="xl:col-span-3"
            action={
                <div className="flex items-center gap-2 flex-wrap">
                    {extCols.map(col => (
                        <button key={col.key} type="button"
                            onClick={() => setColVis(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                            className={cn(
                                "px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-wider clip-bevel-sm border transition-colors",
                                colVis[col.key]
                                    ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-white"
                                    : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white",
                            )}
                        >
                            {col.label}
                        </button>
                    ))}
                    <button type="button" onClick={handleExport} disabled={!exactRows.length}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-40 clip-bevel-sm"
                    >
                        <Download className="w-3 h-3" />
                        Export CSV
                    </button>
                    <Pill tone={hasExact ? "success" : "warning"}>{hasExact ? "EXACT DATA" : "BASELINE ONLY"}</Pill>
                </div>
            }
        >
            <div className="overflow-x-auto scrollbar-thin">
                <div className="min-w-[1280px]">
                    <TableHeader colVis={colVis} sortState={sortState} onSort={handleSort} />
                    {families.map(family => (
                        <FamilySection
                            key={family}
                            family={family}
                            rows={sortedRows.filter(r => r.family === family)}
                            colVis={colVis}
                            open={familyOpen[family] !== false}
                            onToggle={() => toggleFamily(family)}
                        />
                    ))}
                </div>
            </div>
        </NeonPanel>
    );
}

function sortValue(row, key) {
    if (key === "label") return String(row.label || row.mode || "");
    if (key === "family") return String(row.family || "");
    if (key === "threshold") return String(row.threshold || "");
    if (key === "eligible") return row.eligible ?? row.trades;
    return row[key];
}

function sortRows(rows, sortState) {
    const key = sortState?.key || "netR";
    const dir = sortState?.dir === "asc" ? 1 : -1;
    return [...(rows || [])].sort((a, b) => {
        const av = sortValue(a, key);
        const bv = sortValue(b, key);
        const aNum = isFiniteNumber(av);
        const bNum = isFiniteNumber(bv);
        if (aNum && bNum) return (num(av) - num(bv)) * dir;
        if (aNum) return -1;
        if (bNum) return 1;
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
}
