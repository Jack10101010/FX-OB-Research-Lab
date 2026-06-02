/**
 * CanonicalBucketTable — shared, basis-aware bucket table (Phase RB-4).
 *
 * Implements the frozen RB-3.2 contract so pages stop hand-rolling bucket
 * columns. Given the legacy bucket rows + the raw trades + a bucket definition
 * ({ labelFn, order }), it:
 *   • Raw R          → normalizes the legacy rows via toCanonicalBucketRow
 *                      (preserving Net R / Exp / PF / counts; WR recomputed to
 *                      the canonical wins/(wins+losses)).
 *   • Current Equity → recomputes contribution rows via
 *                      resultsBasis.summarizeBuckets() and normalizes them.
 *
 * Columns come from bucketDisplaySchema(basis); each schema `kind` maps to a
 * cell renderer. Pages may inject styled renderers (label/pf/ci) via `renderers`
 * to preserve their exact look; everything else uses built-ins.
 *
 * Props
 *   title       string
 *   rawRows     legacy bucket rows (finalizeBucket output) — used for Raw R
 *   trades      raw trade list for this scope — used for Current Equity recompute
 *   def         { labelFn, order }  bucket grouping definition
 *   onDrill     (canonicalRow) => void   (row carries tradeRefs)
 *   renderers   optional { label, pf, ci } JSX overrides
 *   compact     boolean
 *   testId      string
 */

import React from "react";
import { Layers } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { HeroBadge } from "@/components/lab/controls";
import { useResultsLens } from "@/data/useResultsLens";
import {
    summarizeBuckets,
    toCanonicalBucketRow,
    bucketDisplaySchema,
    formatBasisValue,
} from "@/data/resultsBasis";

const round1 = (v) => Number((Number(v) || 0).toFixed(1));

// Built-in cell renderers per schema `kind`. Pages can override label/pf/ci.
function buildColumns(schema, { basis, account, renderers }) {
    return schema.map((col) => {
        const base = {
            key: col.key,
            label: col.label,
            align: col.align,
            sortable: col.sortable,
            heatmap: col.heatmap === true ? undefined : false, // enable heatmap only where requested
            mono: col.kind === "ci",
        };
        switch (col.kind) {
            case "label":
                return { ...base, render: renderers?.label ? (r) => renderers.label(r) : (r) => r.label };
            case "int":
                return { ...base, render: (r) => (r[col.key] == null ? "—" : Math.round(Number(r[col.key]))) };
            case "pct":
                return { ...base, render: (r) => (r[col.key] == null ? "—" : `${round1(r[col.key]).toFixed(1)}%`) };
            case "moneyPct":
                return { ...base, render: (r) => (r[col.key] == null ? "—" : `${round1(r[col.key])}%`) };
            case "rNet":
                return { ...base, render: (r) => (r[col.key] == null ? <span className="text-muted-lab">—</span> : <ColoredR value={round1(r[col.key])} />) };
            case "expR":
                return {
                    ...base,
                    render: (r) => {
                        if (r[col.key] == null) return <span className="text-muted-lab">—</span>;
                        const v = Number(r[col.key]) || 0;
                        return <span className={v >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{`${v >= 0 ? "+" : ""}${v.toFixed(3)}R`}</span>;
                    },
                };
            case "money":
                return {
                    ...base,
                    render: (r) => {
                        const v = r[col.key];
                        const str = formatBasisValue(basis, account, v, { kind: "money" });
                        const positive = Number(v) >= 0;
                        return <span className={v == null ? "text-muted-lab" : positive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{str}</span>;
                    },
                };
            case "pf":
                return { ...base, render: renderers?.pf ? (r) => renderers.pf(r) : (r) => defaultPF(r.profitFactor) };
            case "ci":
                return { ...base, render: renderers?.ci ? (r) => renderers.ci(r) : (r) => defaultCI(r.ciLo, r.ciHi) };
            default:
                return { ...base, render: (r) => r[col.key] };
        }
    });
}

function defaultPF(value) {
    if (value == null) return <span className="text-[hsl(var(--success))]">∞</span>;
    if (!Number.isFinite(value)) return <span className="text-muted-lab">—</span>;
    const cls = value >= 1.5 ? "text-[hsl(var(--success))]" : value < 1 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]";
    return <span className={cls}>{value.toFixed(2)}</span>;
}

function defaultCI(lo, hi) {
    if (lo == null || hi == null) return <span className="text-muted-lab opacity-50">—</span>;
    const cls = lo > 0 ? "text-[hsl(var(--success)/0.8)]" : hi < 0 ? "text-[hsl(var(--danger)/0.8)]" : "text-muted-lab";
    return <span className={`text-[10px] ${cls}`}>[{lo > 0 ? "+" : ""}{lo.toFixed(2)}, {hi > 0 ? "+" : ""}{hi.toFixed(2)}]</span>;
}

export function CanonicalBucketTable({
    title,
    rawRows = [],
    trades = [],
    def = {},
    onDrill,
    renderers,
    compact = false,
    testId,
    // Additive opts (RB-5): defaults preserve RB-4 OrderBlockLab behavior.
    bare = false,            // render just the DataTable (no panel/chip/toggle/caveat)
    bareHeatmap = false,     // enable static heatmap in bare mode (no toggle button)
    schema: schemaOverride = null, // { raw?, ce? } column-set overrides
    restrictToOrder = false, // CE: only build def.order keys (no extras appended)
    defaultSortKey,          // override DataTable sort (pass null to keep given order)
    headerAction = null,     // TC-1: optional JSX injected into the panel header (e.g. compare control)
}) {
    const lens = useResultsLens();
    const [heatmap, setHeatmap] = React.useState(false);
    const basis = lens.basis;
    const account = lens.accountSettings;

    const rows = React.useMemo(() => {
        if (lens.isRawR) {
            return rawRows.map((r) => toCanonicalBucketRow(r, { basis: "raw_r" }));
        }
        // Current Equity — recompute contribution from the canonical calculator.
        const labelFn = typeof def.labelFn === "function" ? def.labelFn : () => "All";
        const map = summarizeBuckets(trades, {
            basis: "current_equity",
            account,
            bucketMode: "contribution",
            keyOf: labelFn,
        });
        const refsByKey = {};
        trades.forEach((t) => {
            const k = String(labelFn(t));
            (refsByKey[k] || (refsByKey[k] = [])).push(t);
        });
        const toRow = (key) => {
            const summary = map.get(key);
            const canon = toCanonicalBucketRow(
                summary || { bucketKey: key, wins: 0, losses: 0, total: 0, contributionAmount: 0, contributionPctOfNet: null },
                { basis: "current_equity", bucketMode: "contribution", account },
            );
            canon.label = key;
            canon.tradeRefs = refsByKey[key] || [];
            return canon;
        };
        const order = Array.isArray(def.order) ? def.order : null;
        const seen = new Set();
        const ordered = (order || []).map((k) => { seen.add(k); return toRow(k); });
        if (restrictToOrder && order) return ordered;
        const extras = [...map.keys()].filter((k) => !seen.has(k)).map((k) => toRow(k));
        return order ? [...ordered, ...extras] : extras.sort((a, b) => b.contributionAmount - a.contributionAmount);
    }, [lens.isRawR, rawRows, trades, def, account, restrictToOrder]);

    const schema = React.useMemo(() => {
        const override = lens.isCurrentEquity ? schemaOverride?.ce : schemaOverride?.raw;
        return override || bucketDisplaySchema(basis, account);
    }, [basis, account, lens.isCurrentEquity, schemaOverride]);
    const columns = React.useMemo(() => buildColumns(schema, { basis, account, renderers }), [schema, basis, account, renderers]);
    const bucketCount = rows.filter((r) => (r.rows ?? 0) > 0).length;
    const isPureR = (account?.mode || "r_only") === "r_only";
    const sortKey = defaultSortKey !== undefined ? defaultSortKey : (lens.isCurrentEquity ? "contributionAmount" : "expectancy");

    // Bare mode: just the table, for embedding in compact grids (the parent
    // surfaces a single section-level basis chip + caveat).
    if (bare) {
        return (
            <DataTable
                testId={testId}
                maxHeight={compact ? 220 : 300}
                columns={columns}
                rows={rows}
                onRowClick={onDrill ? (row) => row?.tradeRefs?.length && onDrill(row) : undefined}
                heatmap={bareHeatmap}
                defaultSortKey={sortKey}
                defaultSortDir="desc"
            />
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">Results Basis</span>
                <HeroBadge tone={lens.isCurrentEquity ? "secondary" : "muted"}>{lens.isCurrentEquity ? "Current Equity" : "Raw R"}</HeroBadge>
            </div>
            <NeonPanel
                collapsible
                title={title}
                action={(
                    <div className="flex items-center gap-2">
                        {headerAction && (
                            // Stop clicks on the compare control from toggling the
                            // collapsible panel header it lives in.
                            <span onClick={(e) => e.stopPropagation()}>{headerAction}</span>
                        )}
                        <button
                            type="button"
                            title={heatmap ? "Disable heatmap" : "Enable heatmap"}
                            onClick={() => setHeatmap((h) => !h)}
                            className={`clip-bevel-sm border px-2 py-1 text-[10px] inline-flex items-center gap-1 transition-colors ${heatmap ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.15)] text-[hsl(var(--accent-primary))]" : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"}`}
                        >
                            <Layers className="w-3 h-3" />
                        </button>
                        {lens.isCurrentEquity && <Pill tone="secondary">CURRENT EQUITY</Pill>}
                        <Pill tone="muted">{bucketCount} BUCKETS</Pill>
                    </div>
                )}
            >
                {lens.isCurrentEquity && (
                    <div className="mb-2 flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-2.5 py-1.5">
                        <span className="text-[10.5px] leading-relaxed text-[hsl(var(--text-2))]">
                            Current Equity bucket values are sequence-dependent contribution, not isolated edge.
                            {isPureR && " Account model is Pure R — set an account mode in Settings → Results Basis for dollar contribution."}
                        </span>
                    </div>
                )}
                <DataTable
                    testId={testId}
                    maxHeight={compact ? 260 : 320}
                    columns={columns}
                    rows={rows}
                    onRowClick={onDrill ? (row) => row?.tradeRefs?.length && onDrill(row) : undefined}
                    heatmap={heatmap}
                    defaultSortKey={sortKey}
                    defaultSortDir="desc"
                />
            </NeonPanel>
        </div>
    );
}

export default CanonicalBucketTable;
