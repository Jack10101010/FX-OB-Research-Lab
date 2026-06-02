/**
 * EdgeExplorerPanel — Edge Explorer (Layer 3).
 *
 * Given a drill payload (data/drillContract.js) it shows the exact trades that
 * produced a bucket, a basis-agnostic summary header, and — when the run is
 * linked to a project — a "Save as Finding" action that plugs straight into the
 * existing findings/Insights loop via addProjectFinding (no second findings
 * system). Trade-table only: NO charts, replay, MAE/MFE, AI, comparison, or
 * export (later phases).
 *
 * EDGE-2: trade columns now match/exceed the legacy BucketDrillModal
 * (Trade # · Direction · Structure · Origin Session · Width · Age · Fill ·
 * Result R · Entry · Exit) so Edge Explorer is a strict superset on the pilot
 * table. Display-only fields (session/fill/age/times) are read from the trade,
 * with fallbacks, and may be pre-enriched by the caller (OrderBlockLab does).
 *
 * The trade list comes straight from `payload.tradeRefs` — this panel never
 * re-resolves or fabricates trades.
 *
 * Props
 *   payload   drill payload (from createDrillPayload / normalizeDrillPayload)
 *   onClose   () => void
 *   columns   optional column override (defaults to the full EDGE-2 set)
 */

import React from "react";
import { X, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { useDataset, addProjectFinding } from "@/data/store";
import { buildResearchFindingPayload } from "@/data/projectWorkflow";
import { normalizeDrillPayload, isDrillable } from "@/data/drillContract";

// ── tiny local formatters (codebase convention: per-file helpers) ───────────────
const round1 = (v) => Number((Number(v) || 0).toFixed(1));
const round3 = (v) => Number((Number(v) || 0).toFixed(3));
const fmtPct = (v) => `${round1(v).toFixed(1)}%`;
const fmtSigned = (v) => `${v >= 0 ? "+" : ""}${round3(v)}`;
const fmtSignedR1 = (v) => `${v >= 0 ? "+" : ""}${round1(v)}R`;

function fmtTime(value) {
    if (value == null || value === "") return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    // compact, locale-stable: "YYYY-MM-DD HH:MM"
    const iso = d.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function rNum(t) {
    const r = Number(t?.r);
    return Number.isFinite(r) ? r : null;
}

function sessionOf(t) {
    return t?.originSession || t?.obOriginSession || t?.session || "—";
}
function fillOf(t) {
    return t?.fillSession || t?.fill_session || t?.fillSessionLabel || "—";
}
function ageOf(t) {
    return t?.ageLabel || t?.age || "—";
}
function entryOf(t) {
    return t?.entry ?? t?.entry_time ?? t?.entryTime ?? t?.obDetectionTime ?? null;
}
function exitOf(t) {
    return t?.exit ?? t?.exit_time ?? t?.exitTime ?? null;
}

// ── full trade columns (strict superset of legacy TRADE_DETAIL_COLS) ─────────────
// EDGE-4: Trade ID restored as the first column for parity with BucketDrillModal;
// the sequential Trade # is kept as the second column.
const DEFAULT_COLUMNS = [
    { key: "id", label: "Trade ID", mono: true, render: (r) => r.id ?? r.tradeId ?? r.trade_id ?? "—" },
    { key: "_num", label: "Trade #", mono: true, sortable: false, render: (r) => r._num },
    {
        key: "direction",
        label: "Direction",
        render: (r) => <Pill tone={String(r.direction).toLowerCase().startsWith("long") ? "primary" : "secondary"}>{r.direction || "—"}</Pill>,
    },
    { key: "structure", label: "Structure", render: (r) => r.structure || "—" },
    { key: "_session", label: "Origin", render: (r) => r._session },
    { key: "obWidthPips", label: "Width", align: "right", mono: true, render: (r) => (r.obWidthPips != null ? `${round1(r.obWidthPips)}p` : "—") },
    { key: "_age", label: "OB Age", render: (r) => r._age },
    { key: "_fill", label: "Fill", render: (r) => r._fill },
    {
        key: "r",
        label: "Result (R)",
        align: "right",
        sortValue: (r) => (rNum(r) == null ? -Infinity : rNum(r)),
        render: (r) => (rNum(r) == null ? <span className="text-muted-lab">—</span> : <ColoredR value={rNum(r)} />),
    },
    { key: "_entry", label: "Entry Time", mono: true, sortable: false, render: (r) => r._entry },
    { key: "_exit", label: "Exit Time", mono: true, sortable: false, render: (r) => r._exit },
];

export function EdgeExplorerPanel({ payload, onClose, columns = DEFAULT_COLUMNS }) {
    const { RUNS } = useDataset();
    const drill = React.useMemo(() => normalizeDrillPayload(payload), [payload]);

    // Decorate trades with the display-only fields the columns read. Never
    // mutates the source trades.
    const rows = React.useMemo(() => {
        const list = Array.isArray(drill.tradeRefs) ? drill.tradeRefs : [];
        return list.map((t, i) => ({
            ...t,
            _num: i + 1,
            _session: sessionOf(t),
            _fill: fillOf(t),
            _age: ageOf(t),
            _entry: fmtTime(entryOf(t)),
            _exit: fmtTime(exitOf(t)),
        }));
    }, [drill]);

    const summary = React.useMemo(() => {
        const total = rows.length;
        let wins = 0, losses = 0, sumR = 0;
        for (const t of rows) {
            const r = rNum(t);
            if (r == null) continue;
            if (r > 0) wins += 1; else if (r < 0) losses += 1;
            sumR += r;
        }
        const netR = round1(sumR);
        return {
            total,
            wins,
            losses,
            winRate: total ? (wins / total) * 100 : 0,     // wins/total — matches bucket row
            netR,
            expectancy: total ? round3(netR / total) : 0,
        };
    }, [rows]);

    // ── Finding capture (reuses addProjectFinding; no second findings system) ──
    const activeRun = React.useMemo(
        () => (Array.isArray(RUNS) ? RUNS.find((r) => r && r.id === drill.runId) || null : null),
        [RUNS, drill.runId],
    );
    const projectId = activeRun?.projectId || null;
    const hasTrades = isDrillable(drill);
    const canSaveFinding = Boolean(drill.runId && projectId && hasTrades);

    const [saved, setSaved] = React.useState(false);
    // Reset the saved marker whenever the drilled bucket/run changes.
    React.useEffect(() => { setSaved(false); }, [drill.runId, drill.bucketKey, drill.label]);

    const title = drill.label || drill.bucketKey || "Edge";
    // label is "<Dimension> · <Bucket>" (e.g. "Structure · BOS").
    const dimension = String(drill.label || "").split(" · ")[0] || "";
    const bucket = drill.bucketKey || String(drill.label || "").split(" · ").slice(1).join(" · ") || title;

    const handleSaveFinding = React.useCallback(() => {
        if (!canSaveFinding) return;
        const note =
            `Bucket "${bucket}" — n=${summary.total}, ` +
            `WR ${fmtPct(summary.winRate)}, Net ${fmtSignedR1(summary.netR)}, ` +
            `exp ${fmtSigned(summary.expectancy)}R` +
            (drill.universeKey ? ` · universe ${drill.universeKey}` : "") +
            (drill.basis ? ` · basis ${drill.basis}` : "") + ".";
        const entry = addProjectFinding(projectId, buildResearchFindingPayload({
            source: "edge_explorer",
            tag: "Edge Explorer",
            title: `Edge Explorer · ${title}`,
            note,
            runId: drill.runId,
            sourceRunId: drill.runId,
            table: dimension || undefined,
            bucket: bucket || undefined,
            universeKey: drill.universeKey || undefined,
            basis: drill.basis || undefined,
            account: drill.account || undefined,
            metaExtra: {
                n: summary.total,
                winRate: round1(summary.winRate),
                netR: summary.netR,
                expectancy: summary.expectancy,
            },
        }));
        if (entry) setSaved(true);
    }, [canSaveFinding, bucket, dimension, title, summary, projectId, drill.runId, drill.universeKey, drill.basis, drill.account]);

    if (!payload) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
            <div className="w-full max-w-5xl max-h-[88vh] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.98)] clip-bevel overflow-hidden shadow-2xl shadow-black/40 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[hsl(var(--border-soft))] px-4 py-3 shrink-0">
                    <div>
                        <div className="font-display text-sm text-white uppercase tracking-wider">Edge Explorer</div>
                        <div className="text-[11px] font-ui text-[hsl(var(--accent-primary))]">{title}</div>
                    </div>
                    <div className="flex items-center gap-4">
                        {hasTrades && (
                            <div className="flex items-center gap-3 text-[11px] font-num">
                                <span className="text-muted-lab">n={summary.total}</span>
                                <span className="text-[hsl(var(--success))]">{summary.wins}W</span>
                                <span className="text-[hsl(var(--danger))]">{summary.losses}L</span>
                                <span className="text-white">WR {fmtPct(summary.winRate)}</span>
                                <ColoredR value={summary.netR} />
                                <span className={summary.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>
                                    {fmtSigned(summary.expectancy)}R exp
                                </span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-muted-lab hover:text-white transition-colors inline-flex items-center gap-2"
                        >
                            <X className="w-4 h-4" />
                            Close
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="overflow-auto flex-1 scrollbar-thin">
                    {hasTrades ? (
                        <DataTable
                            testId="edge-explorer-trades"
                            columns={columns}
                            rows={rows}
                            rowKey="_num"
                            defaultSortKey="r"
                            defaultSortDir="asc"
                        />
                    ) : (
                        <div className={cn("flex items-center justify-center py-16 text-[12px] font-ui text-muted-lab")}>
                            No trades available
                        </div>
                    )}
                </div>

                {/* Action bar — Save as Finding (reuses the findings/Insights loop) */}
                {hasTrades && (
                    <div className="flex items-center justify-between gap-3 border-t border-[hsl(var(--border-soft))] px-4 py-2.5 shrink-0">
                        <div className="text-[10.5px] font-ui text-muted-lab">
                            {canSaveFinding
                                ? "Saves to the linked project · appears in Insights"
                                : "Link this run to a project to save findings."}
                        </div>
                        <button
                            type="button"
                            onClick={handleSaveFinding}
                            disabled={!canSaveFinding || saved}
                            className={cn(
                                "clip-bevel-sm border px-3 py-2 text-[11px] font-display uppercase tracking-wider inline-flex items-center gap-2 transition-colors",
                                !canSaveFinding
                                    ? "border-[hsl(var(--border-soft))] text-muted-lab opacity-50 cursor-not-allowed"
                                    : saved
                                        ? "border-[hsl(var(--success)/0.6)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] cursor-default"
                                        : "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.2)]",
                            )}
                        >
                            {saved ? <Check className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            {saved ? "Saved" : "Save as Finding"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default EdgeExplorerPanel;
