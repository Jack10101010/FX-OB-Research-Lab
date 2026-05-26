import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, Pill } from "@/components/lab/DataTable";
import { fmtMaybeR, isFiniteNumber, num } from "../analytics/entryFormatters";

function EfficiencyScore({ mae, mfe }) {
    if (!isFiniteNumber(mae) || !isFiniteNumber(mfe)) return <span className="text-muted-lab">—</span>;
    const absMae = Math.abs(num(mae));
    const absMfe = Math.abs(num(mfe));
    if (absMae + absMfe === 0) return <span className="text-muted-lab">—</span>;
    const score = absMfe / (absMae + absMfe);
    const pct   = (score * 100).toFixed(0);
    const color = score >= 0.65 ? "hsl(var(--success))" : score >= 0.45 ? "hsl(var(--accent-secondary))" : "hsl(var(--danger))";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums" style={{ color }}>{pct}%</span>
        </div>
    );
}

export function MaeAnalyticsPanel({ exactRows }) {
    const rows    = exactRows.filter(r => r.exact);
    const hasData = rows.some(r => isFiniteNumber(r.avgMAE) || isFiniteNumber(r.avgMFE));

    const columns = [
        { key: "label",      label: "Model",       render: r => <span className={r.isBaseline ? "text-[hsl(var(--accent-secondary))]" : "text-white"}>{r.label}</span> },
        { key: "fills",      label: "Fills",       align: "right", render: r => <span className="text-[hsl(var(--text-2))]">{r.fills ?? "—"}</span> },
        { key: "avgMAE",     label: "Avg MAE",     align: "right", render: r => <span className={isFiniteNumber(r.avgMAE) ? "text-[hsl(var(--danger))]" : "text-muted-lab"}>{fmtMaybeR(r.avgMAE)}</span> },
        { key: "avgMFE",     label: "Avg MFE",     align: "right", render: r => <span className={isFiniteNumber(r.avgMFE) ? "text-[hsl(var(--success))]" : "text-muted-lab"}>{fmtMaybeR(r.avgMFE)}</span> },
        { key: "efficiency", label: "Fill Efficiency", render: r => <EfficiencyScore mae={r.avgMAE} mfe={r.avgMFE} /> },
        { key: "avgTimeToTP",label: "Avg TP Time", align: "right", render: r => <span className="text-[hsl(var(--text-2))]">{r.avgTimeToTP ?? "—"}</span> },
        { key: "avgTimeToSL",label: "Avg SL Time", align: "right", render: r => <span className="text-[hsl(var(--text-2))]">{r.avgTimeToSL ?? "—"}</span> },
    ];

    return (
        <NeonPanel
            title="MAE / MFE Analytics"
            className="xl:col-span-2"
            action={<Pill tone={hasData ? "success" : "warning"}>{hasData ? "EXACT" : "AWAITING DATA"}</Pill>}
        >
            {!hasData && (
                <p className="mb-3 text-[10.5px] font-mono text-[hsl(var(--warning))]">
                    Export <span className="text-white">avg_mae, avg_mfe, avg_time_to_tp, avg_time_to_sl</span> fields from Python to populate this panel.
                </p>
            )}
            <DataTable testId="entry-mae" columns={columns} rows={rows} maxHeight={260} />
        </NeonPanel>
    );
}
