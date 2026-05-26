import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { buildDirectionSplit } from "../analytics/entryAnalytics";
import { fmtMaybePct, fmtMaybeR, isFiniteNumber, num } from "../analytics/entryFormatters";

export function DirectionPanel({ exactRows, tradesByMode, activeVariant, trades }) {
    const rows = useMemo(() => {
        return exactRows.filter(r => r.exact).map(row => {
            const modeKey    = String(row.mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
            const modeTrades = row.isBaseline
                ? trades
                : tradesByMode?.[`${activeVariant}__${modeKey}`] || tradesByMode?.[modeKey] || null;
            const split = modeTrades ? buildDirectionSplit(modeTrades) : null;
            return { ...row, split };
        });
    }, [exactRows, tradesByMode, activeVariant, trades]);

    const hasData = rows.some(r => r.split && r.split.total > 0);
    const hasDir  = rows.some(r => r.split && (r.split.longs.count > 0 || r.split.shorts.count > 0));
    const hasModelRows = rows.some(r => !r.isBaseline);
    const hasModelTradeData = rows.some(r => !r.isBaseline && r.split);

    const cols = [
        { key: "label",     label: "Model",       render: r => <span className={r.isBaseline ? "text-[hsl(var(--accent-secondary))]" : "text-white"}>{r.label}</span> },
        { key: "lWR",       label: "Long WR",     align: "right", render: r => r.split ? fmtMaybePct(r.split.longs.winRate)  : "—" },
        { key: "lNetR",     label: "Long R",      align: "right", render: r => r.split && r.split.longs.count  ? <ColoredR value={r.split.longs.netR}  /> : <span className="text-muted-lab">—</span> },
        { key: "lExp",      label: "Long Exp",    align: "right", render: r => r.split ? fmtMaybeR(r.split.longs.expectancy)  : "—" },
        { key: "lN",        label: "L Trades",    align: "right", render: r => r.split ? r.split.longs.count  : "—" },
        { key: "div",       label: "",            render: () => <span className="text-muted-lab text-[9px]">|</span> },
        { key: "sWR",       label: "Short WR",    align: "right", render: r => r.split ? fmtMaybePct(r.split.shorts.winRate) : "—" },
        { key: "sNetR",     label: "Short R",     align: "right", render: r => r.split && r.split.shorts.count ? <ColoredR value={r.split.shorts.netR} /> : <span className="text-muted-lab">—</span> },
        { key: "sExp",      label: "Short Exp",   align: "right", render: r => r.split ? fmtMaybeR(r.split.shorts.expectancy) : "—" },
        { key: "sN",        label: "S Trades",    align: "right", render: r => r.split ? r.split.shorts.count : "—" },
        { key: "asymm",     label: "WR Δ",        align: "right", render: r => {
            if (!r.split) return <span className="text-muted-lab">—</span>;
            const d = r.split.longs.winRate - r.split.shorts.winRate;
            if (!isFiniteNumber(d)) return <span className="text-muted-lab">—</span>;
            const color = Math.abs(d) > 15 ? "hsl(var(--warning))" : "hsl(var(--text-2))";
            return <span className="font-mono tabular-nums" style={{ color }}>{d >= 0 ? "+" : ""}{num(d).toFixed(1)}%</span>;
        }},
    ];

    return (
        <NeonPanel title="Direction Asymmetry" className="xl:col-span-3"
            action={<Pill tone={hasDir ? "success" : hasData ? "secondary" : "warning"}>{hasDir ? "DIRECTION DATA" : "LIMITED"}</Pill>}
        >
            {hasModelRows && !hasModelTradeData && (
                <p className="mb-3 text-[10.5px] font-mono text-[hsl(var(--warning))]">
                    Requires per-model entry trade exports (<span className="text-white">trades_*__entry_*.csv</span>).
                    Summary entry results are loaded, but trade-level model lists are missing.
                </p>
            )}
            {!hasDir && !(hasModelRows && !hasModelTradeData) && (
                <p className="mb-3 text-[10.5px] font-mono text-[hsl(var(--warning))]">
                    Requires <span className="text-white">direction</span> field on trade objects. WR Δ &gt;15% signals meaningful asymmetry.
                </p>
            )}
            <DataTable testId="entry-direction" columns={cols} rows={rows} maxHeight={280} />
        </NeonPanel>
    );
}
