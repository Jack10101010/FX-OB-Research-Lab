// BeAffectedTradesCard — shared "Trades affected by BE" list card.
//
// Used by Protection Lab → Break-even AND Strategy Map (BE verification). Rows
// come from buildBeAffectedTrades() (data/protectionTimeline.js): BE-triggered
// trades classified loss_saved / winner_cut / neutral be_exit, sorted by |ΔR|.
// The row action is caller-defined ("View on Map" jump on the BE page; in-place
// "Inspect" selection on the Strategy Map).
import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";

const AFFECTED_CLASS = {
    loss_saved: { label: "Loss Saved", tone: "success" },
    winner_cut: { label: "Winner Cut", tone: "danger" },
    be_exit:    { label: "BE Exit",    tone: "muted" },
};

function fmtTimeShort(t) {
    if (!t) return "—";
    const s = String(t).replace("T", " ").replace(/\+00:00$|Z$/, "");
    return s.length > 16 ? s.slice(5, 16) : s;
}

function buildAffectedColumns(actionLabel, onAction) {
    return [
        {
            key: "classification", label: "Result", sortable: false, width: "92px",
            render: (row) => {
                const c = AFFECTED_CLASS[row.classification] || AFFECTED_CLASS.be_exit;
                return <Pill tone={c.tone}>{c.label}</Pill>;
            },
        },
        { key: "id", label: "Trade", render: (row) => <span className="font-code text-[11px] text-[hsl(var(--text-1))]">{row.id || "—"}</span> },
        { key: "obId", label: "OB", render: (row) => <span className="font-code text-[11px] text-[hsl(var(--text-2))]">{row.obId || "—"}</span> },
        { key: "direction", label: "Dir", render: (row) => <span className="font-ui text-[11px] text-[hsl(var(--text-2))]">{row.direction || "—"}</span> },
        { key: "structure", label: "Struct", render: (row) => <span className="font-ui text-[11px] text-[hsl(var(--text-2))]">{row.structure || "—"}</span> },
        { key: "session", label: "Session", render: (row) => <span className="font-ui text-[11px] text-[hsl(var(--text-2))]">{row.session || "—"}</span> },
        { key: "entryTime", label: "Entry", render: (row) => <span className="font-code text-[10.5px] text-[hsl(var(--text-2))]">{fmtTimeShort(row.entryTime)}</span> },
        { key: "originalR", label: "Orig R", align: "right", render: (row) => row.originalR != null ? <ColoredR value={row.originalR} /> : <span className="text-[hsl(var(--text-2))]">—</span> },
        { key: "beR", label: "BE R", align: "right", render: (row) => row.beR != null ? <ColoredR value={row.beR} /> : <span className="text-[hsl(var(--text-2))]">—</span> },
        { key: "deltaR", label: "Δ R", align: "right", render: (row) => row.deltaR != null ? <ColoredR value={row.deltaR} /> : <span className="text-[hsl(var(--text-2))]">—</span> },
        ...(onAction ? [{
            key: "action", label: "", sortable: false, width: "96px",
            render: (row) => (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAction(row); }}
                    className="row-chip row-chip-muted text-[10.5px]"
                    title={actionLabel}
                >
                    {actionLabel}
                </button>
            ),
        }] : []),
    ];
}

export function BeAffectedTradesCard({
    rows = [],
    title = "Trades affected by BE",
    headerRight = null,
    actionLabel = "View on Map",
    onAction,
    note,
    scenarioSuffix = "",
    // STABILITY-FIX: opt-in fixed-height scrolling body so the card keeps a
    // constant height as the row count changes (prevents page jump when
    // switching filters). Off by default → Strategy Map usage unchanged.
    scrollBody = false,
}) {
    const [filter, setFilter] = React.useState("all"); // all | loss_saved | winner_cut
    const counts = React.useMemo(() => ({
        all: rows.length,
        loss_saved: rows.filter((r) => r.classification === "loss_saved").length,
        winner_cut: rows.filter((r) => r.classification === "winner_cut").length,
    }), [rows]);
    const filtered = React.useMemo(() => (
        filter === "all" ? rows : rows.filter((r) => r.classification === filter)
    ), [rows, filter]);
    const columns = React.useMemo(() => buildAffectedColumns(actionLabel, onAction), [actionLabel, onAction]);

    return (
        <NeonPanel title={title} action={headerRight}>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {[
                        { key: "all", label: `All affected (${counts.all})` },
                        { key: "loss_saved", label: `Loss Saved (${counts.loss_saved})` },
                        { key: "winner_cut", label: `Winner Cut (${counts.winner_cut})` },
                    ].map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setFilter(t.key)}
                            className={cn(
                                "px-3 py-1.5 rounded-[4px] border text-[11px] font-ui font-semibold transition-colors",
                                filter === t.key
                                    ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                    : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className={cn(scrollBody && "min-h-[360px] max-h-[420px] overflow-y-auto")}>
                    {filtered.length ? (
                        <DataTable
                            columns={columns}
                            rows={filtered}
                            rowKey="id"
                            onRowClick={onAction ? (row) => onAction(row) : undefined}
                            defaultSortKey={null}
                        />
                    ) : (
                        <div className="py-3 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                            No {filter === "all" ? "BE-affected" : filter === "loss_saved" ? "loss-saved" : "winner-cut"} trades{scenarioSuffix}.
                        </div>
                    )}
                </div>
                {note ? (
                    <div className="mt-1 text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{note}</div>
                ) : null}
            </div>
        </NeonPanel>
    );
}
