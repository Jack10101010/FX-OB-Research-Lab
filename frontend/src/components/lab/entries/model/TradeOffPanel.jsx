import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { buildTradeOffStats } from "../analytics/entryAnalytics";
import { fmtMaybePct, fmtMaybeR, isFiniteNumber, num } from "../analytics/entryFormatters";

export function TradeOffPanel({ exactRows, rawTrades, tradesByMode, activeVariant }) {
    const rows = useMemo(() => {
        return exactRows
            .filter(r => r.exact && !r.isBaseline)
            .map(row => {
                const modeKey    = String(row.mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
                const modeTrades = tradesByMode?.[`${activeVariant}__${modeKey}`] || tradesByMode?.[modeKey] || null;
                const stats      = modeTrades ? buildTradeOffStats(rawTrades, modeTrades) : null;
                return { ...row, stats };
            });
    }, [exactRows, rawTrades, tradesByMode, activeVariant]);

    const hasData = rows.some(r => r.stats);

    const columns = [
        { key: "label",           label: "Model",           render: r => <span className="text-white">{r.label}</span> },
        { key: "avoidedLosers",   label: "Avoided L",       align: "right", render: r => r.stats ? <span className="text-[hsl(var(--success))]">{r.stats.avoidedLosers}</span> : <span className="text-muted-lab">—</span> },
        { key: "avoidedLoserPct", label: "Avoid %",         align: "right", render: r => r.stats ? <span className="text-[hsl(var(--success))]">{fmtMaybePct(r.stats.avoidedLoserPct)}</span> : <span className="text-muted-lab">—</span> },
        { key: "avoidedLoserR",   label: "Saved R",         align: "right", render: r => r.stats ? <ColoredR value={r.stats.avoidedLoserR} /> : <span className="text-muted-lab">—</span> },
        { key: "missedWinners",   label: "Missed W",        align: "right", render: r => r.stats ? <span className="text-[hsl(var(--danger))]">{r.stats.missedWinners}</span> : <span className="text-muted-lab">—</span> },
        { key: "missedWinnerPct", label: "Miss %",          align: "right", render: r => r.stats ? <span className="text-[hsl(var(--danger))]">{fmtMaybePct(r.stats.missedWinnerPct)}</span> : <span className="text-muted-lab">—</span> },
        { key: "missedWinnerR",   label: "Lost R",          align: "right", render: r => r.stats ? <span className="text-[hsl(var(--danger))]">-{fmtMaybeR(r.stats.missedWinnerR)}</span> : <span className="text-muted-lab">—</span> },
        { key: "tradeOffRatio",   label: "Ratio",           align: "right", render: r => {
            if (!r.stats || !isFiniteNumber(r.stats.tradeOffRatio)) return <span className="text-muted-lab">—</span>;
            const v = r.stats.tradeOffRatio;
            return <span className={v >= 1.5 ? "text-[hsl(var(--success))] font-semibold" : v >= 1 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--danger))]"}>{num(v).toFixed(2)}×</span>;
        }},
        { key: "netRImpact",      label: "Net Impact",      align: "right", render: r => r.stats ? <ColoredR value={r.stats.netRImpact} /> : <span className="text-muted-lab">—</span> },
    ];

    return (
        <NeonPanel
            title="Missed Winners / Avoided Losers"
            className="xl:col-span-3"
            action={<Pill tone={hasData ? "success" : "warning"}>{hasData ? "EXACT" : "NEEDS ENTRY CSVS"}</Pill>}
        >
            {!hasData && (
                <div className="mb-3 text-[10.5px] font-ui text-[hsl(var(--warning))] leading-relaxed">
                    Requires per-model entry trade exports (<span className="text-white">trades_*__entry_*.csv</span>).
                    Summary entry results are loaded, but trade-level model lists are missing.
                    Ratio = % losers avoided ÷ % winners missed — &gt;1× is beneficial.
                </div>
            )}
            <DataTable testId="entry-tradeoff" columns={columns} rows={rows} maxHeight={260} />
        </NeonPanel>
    );
}
