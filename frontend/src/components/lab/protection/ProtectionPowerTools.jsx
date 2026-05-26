import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, ChevronRight, Plus, Trash2, Download, BookMarked, CheckCircle, XCircle, Clock, Pause } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, Pill, ColoredR } from "@/components/lab/DataTable";
import {
    buildPairedTrades,
    calcEfficiencyRatio,
    calcRobustnessScore,
    prettyModeName,
} from "./protectionAnalytics";
import {
    loadHypotheses, saveHypotheses, addHypothesis, updateHypothesis, deleteHypothesis,
    exportHypothesesAsCSV, triggerCSVDownload,
} from "./ProtectionWhatIfStorage";

const PAIR_FILTER_LABELS = {
    all: "All",
    improved: "Improved",
    reduced: "Reduced",
    unchanged: "Unchanged",
};

const STATUS_LABELS = {
    all: "All",
    open: "Open",
    confirmed: "Confirmed",
    refuted: "Refuted",
    deferred: "Deferred",
};

// ── Shared tokens ─────────────────────────────────────────────────────────────
function EmptyState({ message }) {
    return (
        <div className="flex items-center justify-center py-10 text-[11px] font-mono text-[hsl(var(--text-3))] text-center px-4">
            {message}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. PAIRED TRADE TABLE
// ──────────────────────────────────────────────────────────────────────────────
const PAIRED_COLS = [
    { key: "tradeNum",  label: "#",       width: "5%", align: "right", sortable: false },
    { key: "id",        label: "ID",      width: "12%", render: row => <span className="text-[hsl(var(--text-3))] text-[10px]">{row.id ?? "—"}</span> },
    { key: "baselineR", label: "Unprotected R",  width: "13%", align: "right",
      sortValue: r => Number(r.baselineR),
      render: row => <ColoredR value={row.baselineR ?? 0} /> },
    { key: "protectedR", label: "Protected R", width: "13%", align: "right",
      sortValue: r => Number(r.protectedR),
      render: row => row.protectedR != null ? <ColoredR value={row.protectedR} /> : <span className="text-[hsl(var(--text-3))]">—</span> },
    { key: "delta",     label: "Δ R",     width: "13%", align: "right",
      sortValue: r => Number(r.delta),
      render: row => {
          const d = row.delta ?? 0;
          return <span className={cn("font-mono tabular-nums text-[11px]", d > 0 ? "text-[hsl(var(--success))]" : d < 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-3))]")}>{d >= 0 ? "+" : ""}{Number(d).toFixed(2)}R</span>;
      }},
    { key: "exitReason", label: "Exit",   width: "20%",
      render: row => row.exitReason
          ? <span className="text-[10px] font-mono text-[hsl(var(--text-2))] truncate max-w-[120px] block">{row.exitReason}</span>
          : <span className="text-[hsl(var(--text-3))]">—</span> },
    { key: "outcome",   label: "Outcome", width: "14%",
      render: row => {
          const o = row.outcome ?? "unknown";
          const tone = o === "win" ? "success" : o === "loss" ? "danger" : o === "breakeven" ? "warning" : "muted";
          return <Pill tone={tone}>{o}</Pill>;
      }},
];

export function PairedTradeTable({ baselineTrades, tradesByMode, selectedMode, onSelectTrade }) {
    const [filter, setFilter] = React.useState("all"); // all | improved | reduced | unchanged

    const { pairs, pairingMethod, pairRate, pairedCount } = React.useMemo(
        () => buildPairedTrades(baselineTrades, tradesByMode, selectedMode),
        [baselineTrades, tradesByMode, selectedMode],
    );

    const filtered = React.useMemo(() => {
        return pairs.filter(p => {
            if (filter === "improved") return (p.delta ?? 0) > 0.02;
            if (filter === "reduced")  return (p.delta ?? 0) < -0.02;
            if (filter === "unchanged") return Math.abs(p.delta ?? 0) <= 0.02;
            return true;
        });
    }, [pairs, filter]);

    if (!baselineTrades?.length) {
        return <EmptyState message="No Unprotected Baseline trades loaded." />;
    }

    if (!selectedMode) {
        return <EmptyState message="Select a protection result to audit trade-level impact." />;
    }

    if (!pairs.length) {
        return <EmptyState message="No paired trade data available. The selected protection mode did not return compatible per-trade results." />;
    }

    const pairRatePct = Math.round((pairRate ?? 0) * 100);
    const pairingWarning = pairingMethod === "index" && pairRatePct < 100;

    return (
        <div>
            {/* Pairing method info */}
            <div className={cn(
                "flex flex-wrap items-center gap-3 mb-3 px-1 py-2 border-b border-[hsl(var(--border-soft)/0.4)]",
            )}>
                <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">
                    Pairing method: <span className="text-[hsl(var(--text-2))]">{pairingMethod === "id" ? "Trade ID matched" : pairingMethod === "index" ? "Index matched fallback" : "None"}</span>
                </span>
                <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">
                    Matched: <span className="text-[hsl(var(--text-2))]">{pairedCount} / {pairs.length}</span>
                    {pairRatePct < 100 && <span className="ml-1 text-[hsl(var(--warning))]">({pairRatePct}%)</span>}
                </span>
                {pairingWarning && (
                    <span className="text-[10px] font-mono text-[hsl(var(--warning))]">
                        Low ID match rate. Positional fallback is active; treat deltas as approximate.
                    </span>
                )}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-1.5 mb-3 px-1">
                {["all", "improved", "reduced", "unchanged"].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "px-2.5 py-0.5 clip-bevel-sm border text-[10px] font-mono uppercase tracking-[0.12em] transition-colors",
                            filter === f
                                ? "border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.1)]"
                                : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]",
                        )}
                    >
                        {PAIR_FILTER_LABELS[f] || f} {f === "all" ? `(${pairs.length})` : f === "improved" ? `(${pairs.filter(p => (p.delta ?? 0) > 0.02).length})` : f === "reduced" ? `(${pairs.filter(p => (p.delta ?? 0) < -0.02).length})` : `(${pairs.filter(p => Math.abs(p.delta ?? 0) <= 0.02).length})`}
                    </button>
                ))}
            </div>

            {filtered.length > 0 ? (
                <DataTable
                    columns={PAIRED_COLS}
                    rows={filtered.map((p, i) => ({ ...p, tradeNum: i + 1 }))}
                    rowKey="tradeNum"
                    onRowClick={onSelectTrade}
                    compact
                    defaultSortKey="delta"
                    defaultSortDir="desc"
                    maxHeight="400px"
                />
            ) : (
                <EmptyState message={`No trades match "${PAIR_FILTER_LABELS[filter] || filter}" filter.`} />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. TRADE DRILLDOWN DRAWER
// ──────────────────────────────────────────────────────────────────────────────
export function TradeDrilldownDrawer({ trade, onClose }) {
    // Trap focus and close on Escape
    React.useEffect(() => {
        if (!trade) return;
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [trade, onClose]);

    if (!trade) return null;

    const content = (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Drawer panel */}
            <div className="fixed top-0 right-0 z-[9999] h-full w-full max-w-md bg-[hsl(var(--panel))] border-l border-[hsl(var(--border-soft))] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border-soft))]">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--accent-secondary))]">Protection Trade Detail</div>
                        <div className="mt-0.5 text-lg font-display text-[hsl(var(--text-1))]">
                            {trade.id ?? `Trade #${trade.tradeNum ?? "?"}`}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-1))] transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* R outcomes */}
                    <DrawerSection label="R Impact">
                        <DrawerRow label="Unprotected R" value={<ColoredR value={trade.baselineR ?? 0} />} />
                        {trade.protectedR != null && (
                            <DrawerRow label="Protected R" value={<ColoredR value={trade.protectedR} />} />
                        )}
                        {trade.delta != null && (
                            <DrawerRow
                                label="Protection Delta"
                                value={
                                    <span className={cn("font-mono tabular-nums text-[12px]", (trade.delta ?? 0) >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                        {(trade.delta ?? 0) >= 0 ? "+" : ""}{Number(trade.delta).toFixed(2)}R
                                    </span>
                                }
                            />
                        )}
                    </DrawerSection>

                    {/* Trade attributes */}
                    <DrawerSection label="Trade Attributes">
                        {[
                            ["Direction",    trade.direction],
                            ["Symbol",       trade.symbol],
                            ["Timeframe",    trade.timeframe || trade.detection_tf],
                            ["Session",      trade.session || trade.obOriginSession],
                            ["Structure",    trade.structureTag || trade.structure_tag],
                            ["Exit Reason",  trade.exitReason || trade.exit_reason || trade.protection_exit_reason],
                            ["Outcome",      trade.outcome],
                        ].map(([label, val]) =>
                            val != null && val !== "" ? (
                                <DrawerRow key={label} label={label} value={String(val)} />
                            ) : null
                        )}
                    </DrawerSection>

                    {/* OB fields */}
                    <DrawerSection label="Order Block Risk Data">
                        {[
                            ["OB Width (pips)",   trade.obWidthPips ?? trade.ob_width_pips],
                            ["OB Penetration %",  trade.max_ob_penetration_pct != null ? `${Number(trade.max_ob_penetration_pct).toFixed(1)}%` : null],
                            ["Hard Invalidation", trade.ob_fully_breached != null ? String(trade.ob_fully_breached) : null],
                            ["Close-Confirmed Invalidation", trade.close_confirmed_ob_breach != null ? String(trade.close_confirmed_ob_breach) : null],
                            ["Same-Candle Exit",  trade.same_candle_exit != null ? String(trade.same_candle_exit) : null],
                            ["Mins to Exit",      trade.minutes_to_exit != null ? `${trade.minutes_to_exit} min` : null],
                            ["Invalidation Time", trade.close_breach_time ?? trade.breach_time],
                        ].map(([label, val]) =>
                            val != null && val !== "" && val !== "null" ? (
                                <DrawerRow key={label} label={label} value={String(val)} />
                            ) : null
                        )}
                    </DrawerSection>

                    {/* All raw fields */}
                    <DrawerSection label="Source Fields" collapsible defaultCollapsed>
                        <div className="space-y-0.5 max-h-64 overflow-y-auto">
                            {Object.entries(trade).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                                <DrawerRow key={k} label={k} value={v == null ? "—" : String(v)} mono />
                            ))}
                        </div>
                    </DrawerSection>
                </div>
            </div>
        </>
    );

    return createPortal(content, document.body);
}

function DrawerSection({ label, children, collapsible = false, defaultCollapsed = false }) {
    const [open, setOpen] = React.useState(!defaultCollapsed);
    return (
        <div>
            <button
                className={cn(
                    "flex items-center gap-2 w-full text-left mb-1.5",
                    collapsible && "cursor-pointer hover:opacity-80",
                )}
                onClick={collapsible ? () => setOpen(p => !p) : undefined}
            >
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--accent-secondary))]">{label}</span>
                {collapsible && (
                    <ChevronRight className={cn("w-3 h-3 text-[hsl(var(--text-3))] transition-transform", open && "rotate-90")} />
                )}
                <div className="flex-1 h-px bg-[hsl(var(--border-soft)/0.4)]" />
            </button>
            {open && <div>{children}</div>}
        </div>
    );
}

function DrawerRow({ label, value, mono = false }) {
    return (
        <div className="flex items-start justify-between gap-3 py-0.5 text-[11px] border-b border-[hsl(var(--border-soft)/0.2)] last:border-0">
            <span className="text-[hsl(var(--text-3))] shrink-0 font-mono">{label}</span>
            <span className={cn("text-right break-all", mono ? "font-mono text-[10px]" : "font-mono")}>
                {value}
            </span>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. PROTECTION MODE COMPARISON MATRIX
// ──────────────────────────────────────────────────────────────────────────────
const MATRIX_METRICS = [
    { key: "netVsBaseline",  label: "Net vs Unprotected",  fmt: v => `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`, higher: true },
    { key: "loserRSaved",    label: "Loss R Saved",    fmt: v => `+${Number(v).toFixed(2)}R`, higher: true },
    { key: "winnerRCost",    label: "Winner R Cost",    fmt: v => `${Number(v).toFixed(2)}R`, higher: false },
    { key: "winRateDelta",   label: "Win Rate Δ",       fmt: v => `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`, higher: true },
    { key: "triggerRate",    label: "Trigger Rate",     fmt: v => `${Number(v).toFixed(1)}%`, higher: false },
    { key: "efficiencyRatio",label: "Efficiency",       fmt: v => isFinite(v) ? Number(v).toFixed(2) : "∞", higher: true },
    { key: "robustnessScore",label: "Robustness",       fmt: v => `${Math.round(v)}/100`, higher: true },
];

function matrixCellColor(value, metric, allValues) {
    const vals = allValues.filter(Number.isFinite);
    if (!vals.length) return "";
    const min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) return "";
    const norm = (value - min) / (max - min); // 0→min, 1→max
    const intensity = metric.higher ? norm : 1 - norm;
    if (intensity >= 0.75) return "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]";
    if (intensity <= 0.25) return "bg-[hsl(var(--danger)/0.12)]  text-[hsl(var(--danger))]";
    return "text-[hsl(var(--text-2))]";
}

export function ProtectionModeMatrix({ exactRows, baselineMaxDD }) {
    if (!exactRows?.length) {
        return <EmptyState message="Requires exact protection backtest data." />;
    }

    // Augment with computed fields
    const augmented = exactRows.map(row => {
        const efficiencyRatio = calcEfficiencyRatio(row);
        const robustnessScore = calcRobustnessScore(row, baselineMaxDD);
        const winnerRCost = (row.netVsBaseline ?? 0) - (row.loserRSaved ?? 0);
        return { ...row, efficiencyRatio, robustnessScore, winnerRCost };
    });

    return (
        <div className="overflow-auto">
            <table className="w-full text-[11px] font-mono border-collapse">
                <thead>
                    <tr className="bg-[hsl(var(--panel-2))]">
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--text-3))] font-medium sticky left-0 bg-[hsl(var(--panel-2))]">
                            Protection Result
                        </th>
                        {MATRIX_METRICS.map(m => (
                            <th key={m.key} className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--text-3))] font-medium whitespace-nowrap">
                                {m.label}
                            </th>
                        ))}
                    </tr>
                    <tr><td colSpan={MATRIX_METRICS.length + 1} className="p-0 h-px bg-[hsl(var(--border-soft))]" /></tr>
                </thead>
                <tbody>
                    {augmented.map((row, ri) => (
                        <tr
                            key={row.mode ?? ri}
                            className="border-b border-[hsl(var(--border-soft)/0.3)] hover:bg-[hsl(var(--panel-2)/0.5)] transition-colors"
                        >
                            <td className="px-3 py-2 text-[hsl(var(--text-1))] font-medium sticky left-0 bg-[hsl(var(--panel))]">
                                {prettyModeName(row.mode)}
                            </td>
                            {MATRIX_METRICS.map(m => {
                                const allVals = augmented.map(r => Number(r[m.key]));
                                const val = Number(row[m.key]);
                                const cellClass = Number.isFinite(val) ? matrixCellColor(val, m, allVals) : "";
                                return (
                                    <td key={m.key} className={cn("px-3 py-2 text-right tabular-nums", cellClass)}>
                                        {Number.isFinite(val) ? m.fmt(val) : "—"}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. HYPOTHESIS WORKBENCH
// ──────────────────────────────────────────────────────────────────────────────
const STATUS_ICONS = {
    open:      <Clock className="w-3 h-3" />,
    confirmed: <CheckCircle className="w-3 h-3" />,
    refuted:   <XCircle className="w-3 h-3" />,
    deferred:  <Pause className="w-3 h-3" />,
};

const STATUS_STYLES = {
    open:      "border-[hsl(var(--accent-primary)/0.45)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]",
    confirmed: "border-[hsl(var(--success)/0.45)]        text-[hsl(var(--success))]        bg-[hsl(var(--success)/0.08)]",
    refuted:   "border-[hsl(var(--danger)/0.45)]         text-[hsl(var(--danger))]         bg-[hsl(var(--danger)/0.08)]",
    deferred:  "border-[hsl(var(--warning)/0.45)]        text-[hsl(var(--warning))]        bg-[hsl(var(--warning)/0.08)]",
};

const STATUS_OPTIONS = ["open", "confirmed", "refuted", "deferred"];

function HypothesisCard({ hypo, onUpdate, onDelete }) {
    const [editing, setEditing] = React.useState(false);
    const [title, setTitle] = React.useState(hypo.title ?? "");
    const [notes, setNotes] = React.useState(hypo.notes ?? "");

    const handleSave = () => {
        onUpdate({ title: title.trim() || "Untitled", notes });
        setEditing(false);
    };

    return (
        <div className="border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.4)] clip-bevel-sm p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
                {editing ? (
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        className="flex-1 bg-transparent border-b border-[hsl(var(--border-soft))] text-[12px] font-mono text-[hsl(var(--text-1))] focus:outline-none focus:border-[hsl(var(--accent-primary))]"
                        placeholder="Protection hypothesis title…"
                    />
                ) : (
                    <div
                        className="flex-1 text-[12px] font-mono text-[hsl(var(--text-1))] cursor-pointer hover:text-white transition-colors"
                        onClick={() => setEditing(true)}
                    >
                        {hypo.title}
                    </div>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Status select */}
                    <select
                        value={hypo.status}
                        onChange={e => onUpdate({ status: e.target.value })}
                        className={cn(
                            "appearance-none bg-transparent border px-1.5 py-0.5 clip-bevel-sm text-[9px] font-mono uppercase tracking-[0.14em] cursor-pointer focus:outline-none",
                            STATUS_STYLES[hypo.status] ?? STATUS_STYLES.open,
                        )}
                    >
                        {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <button onClick={onDelete} className="p-0.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--danger))] transition-colors">
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {editing ? (
                <div className="space-y-2">
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={3}
                        className="w-full bg-[hsl(var(--panel)/0.8)] border border-[hsl(var(--border-soft)/0.5)] text-[11px] font-mono text-[hsl(var(--text-2))] px-2 py-1.5 focus:outline-none focus:border-[hsl(var(--accent-primary))] resize-none"
                        placeholder="Evidence, trade pattern, conclusion…"
                    />
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="px-2.5 py-1 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)] text-[10px] font-mono uppercase tracking-[0.14em] hover:bg-[hsl(var(--accent-primary)/0.16)] transition-colors">
                            Save
                        </button>
                        <button onClick={() => { setTitle(hypo.title); setNotes(hypo.notes); setEditing(false); }} className="px-2.5 py-1 clip-bevel-sm border border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] text-[10px] font-mono uppercase tracking-[0.14em] hover:text-[hsl(var(--text-1))] transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                hypo.notes && (
                    <div className="text-[10px] font-mono text-[hsl(var(--text-3))] leading-relaxed line-clamp-3 cursor-pointer hover:line-clamp-none" onClick={() => setEditing(true)}>
                        {hypo.notes}
                    </div>
                )
            )}

            <div className="text-[9px] font-mono text-[hsl(var(--text-3))] tabular-nums">
                {new Date(hypo.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {hypo.updatedAt !== hypo.createdAt && ` · updated ${new Date(hypo.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
            </div>
        </div>
    );
}

export function HypothesisWorkbench({ activeRunId }) {
    const [hypotheses, setHypotheses] = React.useState(() => loadHypotheses(activeRunId));
    const [newTitle, setNewTitle] = React.useState("");
    const [filterStatus, setFilterStatus] = React.useState("all");

    // Sync to storage whenever hypotheses change
    React.useEffect(() => {
        saveHypotheses(activeRunId, hypotheses);
    }, [hypotheses, activeRunId]);

    // Reload when runId changes
    React.useEffect(() => {
        setHypotheses(loadHypotheses(activeRunId));
    }, [activeRunId]);

    const handleAdd = () => {
        if (!newTitle.trim()) return;
        const entry = addHypothesis(activeRunId, { title: newTitle.trim() });
        setHypotheses(prev => [entry, ...prev]);
        setNewTitle("");
    };

    const handleUpdate = (id, patch) => {
        updateHypothesis(activeRunId, id, patch);
        setHypotheses(prev => prev.map(h => h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h));
    };

    const handleDelete = (id) => {
        deleteHypothesis(activeRunId, id);
        setHypotheses(prev => prev.filter(h => h.id !== id));
    };

    const handleExport = () => {
        const csv = exportHypothesesAsCSV(hypotheses);
        triggerCSVDownload(csv, `hypotheses_${activeRunId ?? "run"}.csv`);
    };

    const filtered = filterStatus === "all" ? hypotheses : hypotheses.filter(h => h.status === filterStatus);

    return (
        <div>
            {/* Add new */}
            <div className="flex gap-2 mb-4">
                <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAdd()}
                    placeholder="Add protection hypothesis…"
                    className="flex-1 bg-[hsl(var(--panel-2)/0.6)] border border-[hsl(var(--border-soft)/0.5)] px-3 py-1.5 text-[11px] font-mono text-[hsl(var(--text-1))] placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent-primary)/0.6)] clip-bevel-sm"
                />
                <button
                    onClick={handleAdd}
                    disabled={!newTitle.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)] text-[10px] font-mono uppercase tracking-[0.14em] hover:bg-[hsl(var(--accent-primary)/0.16)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <Plus className="w-3 h-3" />
                    Add Hypothesis
                </button>
            </div>

            {/* Filter + export */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex flex-wrap gap-1">
                    {["all", ...STATUS_OPTIONS].map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 clip-bevel-sm border text-[9px] font-mono uppercase tracking-[0.14em] transition-colors",
                                filterStatus === s
                                    ? "border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.1)]"
                                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]",
                            )}
                        >
                            {s !== "all" && STATUS_ICONS[s]}
                            {STATUS_LABELS[s] || s}
                        </button>
                    ))}
                </div>
                {hypotheses.length > 0 && (
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center gap-1.5 px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] text-[10px] font-mono uppercase tracking-[0.12em] hover:text-[hsl(var(--text-1))] transition-colors"
                    >
                        <Download className="w-3 h-3" />
                        Export CSV
                    </button>
                )}
            </div>

            {/* Cards */}
            {filtered.length === 0 ? (
                <EmptyState message={hypotheses.length === 0 ? "Add your first protection hypothesis above. Notes are persisted per run." : `No hypotheses with status "${STATUS_LABELS[filterStatus] || filterStatus}".`} />
            ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {filtered.map(h => (
                        <HypothesisCard
                            key={h.id}
                            hypo={h}
                            onUpdate={patch => handleUpdate(h.id, patch)}
                            onDelete={() => handleDelete(h.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL WRAPPER  — ProtectionPowerTools
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ProtectionPowerTools
 * ────────────────────
 * Renders all Phase 3 power-tools panels.
 *
 * Props
 * ─────
 * baselineTrades   — trade array (baseline variant)
 * tradesByMode     — { [modeKey]: tradeArray }
 * selectedMode     — string
 * onModeChange     — (modeKey) => void
 * exactRows        — array from buildExactProtectionRows
 * baselineMaxDD    — number (negative, e.g. -3.5)
 * activeRunId      — string | null
 */
export function ProtectionPowerTools({
    baselineTrades = [],
    tradesByMode = {},
    selectedMode = null,
    onModeChange = null,
    exactRows = [],
    baselineMaxDD = null,
    activeRunId = null,
}) {
    const [selectedTrade, setSelectedTrade] = React.useState(null);
    const modeKeys = Object.keys(tradesByMode);

    return (
        <div className="space-y-4">
            {/* Mode selector */}
            {modeKeys.length > 0 && onModeChange && (
                <div className="mx-6 flex flex-wrap gap-2">
                    <span className="self-center text-[10px] font-mono uppercase tracking-[0.16em] text-[hsl(var(--text-3))] mr-1">Protection Result</span>
                    {modeKeys.map(m => (
                        <button
                            key={m}
                            onClick={() => onModeChange(m)}
                            className={cn(
                                "px-3 py-1 clip-bevel-sm border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors",
                                selectedMode === m
                                    ? "border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.1)]"
                                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]",
                            )}
                        >
                            {prettyModeName(m)}
                        </button>
                    ))}
                </div>
            )}

            {/* Paired trade table */}
            <div className="mx-6">
                <NeonPanel
                    title="Unprotected ↔ Protected Trade Audit"
                    collapsible
                    defaultCollapsed={false}
                    action={
                        selectedMode ? (
                            <span className="text-[10px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[0.12em]">
                                {prettyModeName(selectedMode)}
                            </span>
                        ) : null
                    }
                >
                    <div className="px-3 pb-3">
                        <PairedTradeTable
                            baselineTrades={baselineTrades}
                            tradesByMode={tradesByMode}
                            selectedMode={selectedMode}
                            onSelectTrade={setSelectedTrade}
                        />
                    </div>
                </NeonPanel>
            </div>

            {/* Mode comparison matrix */}
            <div className="mx-6">
                <NeonPanel title="Protection Decision Matrix" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <ProtectionModeMatrix exactRows={exactRows} baselineMaxDD={baselineMaxDD} />
                    </div>
                </NeonPanel>
            </div>

            {/* Hypothesis workbench */}
            <div className="mx-6">
                <NeonPanel title="Protection Hypothesis Workbench" collapsible defaultCollapsed={false}
                    action={
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--text-3))]">
                            <BookMarked className="w-3 h-3" />
                            Persisted per run
                        </span>
                    }
                >
                    <div className="px-3 pb-3">
                        <HypothesisWorkbench activeRunId={activeRunId} />
                    </div>
                </NeonPanel>
            </div>

            {/* Trade drilldown drawer (portal) */}
            <TradeDrilldownDrawer
                trade={selectedTrade}
                onClose={() => setSelectedTrade(null)}
            />
        </div>
    );
}
