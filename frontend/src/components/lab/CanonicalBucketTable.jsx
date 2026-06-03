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
import { Info, Layers, SlidersHorizontal } from "lucide-react";
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

// ── Column visibility ─────────────────────────────────────────────────────────
// Researcher preference: which optional columns are shown in Raw R mode.
// Global key — same preference applies across all bucket tables on all pages.
const COL_VIS_KEY = "fxob_bucket_col_vis_v2";
const COL_VIS_DEFAULTS = Object.freeze({ expectancy: true, profitFactor: true, ci: true, flats: true });
const COL_TOGGLES = [
    { key: "expectancy",   label: "Exp",    info: "Expectancy: average R per trade (Net R ÷ N). Positive = the edge pays on average." },
    { key: "profitFactor", label: "PF",     info: "Profit Factor: gross wins ÷ gross losses. >1.0 is profitable; >1.5 indicates strong edge." },
    { key: "ci",           label: "95% CI", info: "95% Confidence Interval on expectancy. When fully above zero, the edge is statistically separable from zero at p<0.05." },
    { key: "flats",        label: "B/E",    info: "Breakeven trades: closed at 0R without a Win or Loss outcome. These account for the gap between N and Wins+Losses." },
];

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
                return {
                    ...base,
                    render: (r) => r._isTotals
                        ? <span className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-1))]">Total</span>
                        : (renderers?.label ? renderers.label(r) : r.label),
                };
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
    // Compact header opts — all false by default so existing callers are unaffected.
    eyebrow = null,           // optional category label rendered above the title
    hideChip = false,         // suppress the "N BUCKETS" pill from the header
    hideResultsBasis = false, // suppress the "Results Basis" label above the panel
    basisFooter = false,      // show a muted basis line at the bottom of the panel
    controlsPopover = false,  // move heatmap + headerAction into a popover icon button
}) {
    const lens = useResultsLens();
    const [heatmap, setHeatmap] = React.useState(false);
    // Popover state — only used when controlsPopover is true.
    const [popOpen, setPopOpen] = React.useState(false);
    const popRef = React.useRef(null);
    // Column visibility — persisted globally; researcher toggles apply across all tables.
    const [colVisibility, setColVisibility] = React.useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(COL_VIS_KEY) || "{}");
            return { ...COL_VIS_DEFAULTS, ...stored };
        } catch { return { ...COL_VIS_DEFAULTS }; }
    });
    const toggleCol = React.useCallback((key) => {
        setColVisibility((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            try { localStorage.setItem(COL_VIS_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    React.useEffect(() => {
        if (!popOpen || !controlsPopover) return;
        function onMouseDown(e) {
            if (popRef.current && !popRef.current.contains(e.target)) setPopOpen(false);
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [popOpen, controlsPopover]);
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
        let base = override || bucketDisplaySchema(basis, account);

        if (!lens.isCurrentEquity) {
            // Inject B/E column after "losses" (so the researcher can see why N ≠ Wins+Losses)
            const lossIdx = base.findIndex((c) => c.key === "losses");
            if (lossIdx >= 0) {
                base = [
                    ...base.slice(0, lossIdx + 1),
                    { key: "flats", label: "B/E", align: "right", kind: "int" },
                    ...base.slice(lossIdx + 1),
                ];
            }
            // Filter optional columns by researcher's visibility preference
            return base.filter((col) => {
                if (col.key === "expectancy")   return colVisibility.expectancy;
                if (col.key === "profitFactor") return colVisibility.profitFactor;
                if (col.key === "ci")           return colVisibility.ci;
                if (col.key === "flats")        return colVisibility.flats;
                return true;
            });
        }
        return base;
    }, [basis, account, lens.isCurrentEquity, schemaOverride, colVisibility]);
    const columns = React.useMemo(() => buildColumns(schema, { basis, account, renderers }), [schema, basis, account, renderers]);
    // Strip "Limited Data" sentinel rows that have no actual trades — they add
    // visual noise when the data is complete and the bucket was never populated.
    const visibleRows = React.useMemo(
        () => rows.filter((r) => !(r.label === "Limited Data" && (r.rows ?? r.count ?? 0) === 0)),
        [rows],
    );
    const bucketCount = visibleRows.filter((r) => (r.rows ?? 0) > 0).length;
    const isPureR = (account?.mode || "r_only") === "r_only";
    const sortKey = defaultSortKey !== undefined ? defaultSortKey : (lens.isCurrentEquity ? "contributionAmount" : "expectancy");

    // Totals row — aggregates visible buckets. Non-additive columns get null (→ "—").
    const totalsRow = React.useMemo(() => {
        if (!visibleRows.length) return null;
        const totalN = visibleRows.reduce((s, r) => s + (r.rows ?? 0), 0);
        if (totalN === 0) return null;
        const totalWins   = visibleRows.reduce((s, r) => s + (r.wins ?? 0), 0);
        const totalLosses = visibleRows.reduce((s, r) => s + (r.losses ?? 0), 0);
        const totalFlats  = visibleRows.reduce((s, r) => s + (r.flats ?? 0), 0);
        const totalNetR   = visibleRows.reduce((s, r) => s + (Number(r.netR) || 0), 0);
        const decided     = totalWins + totalLosses;
        return {
            _isTotals: true,
            label: "Total",
            rows: totalN,
            count: totalN,
            wins: totalWins,
            losses: totalLosses,
            flats: totalFlats,
            netR: round1(totalNetR),
            winRate: decided > 0 ? (totalWins / decided) * 100 : null,
            expectancy: totalN > 0 ? totalNetR / totalN : null,
            // Current Equity contribution totals
            contributionAmount: visibleRows.reduce((s, r) => s + (Number(r.contributionAmount) || 0), 0),
            // Not aggregatable:
            profitFactor: null,
            ciLo: null,
            ciHi: null,
        };
    }, [visibleRows]);

    // Bare mode: just the table, for embedding in compact grids (the parent
    // surfaces a single section-level basis chip + caveat).
    if (bare) {
        return (
            <DataTable
                testId={testId}
                maxHeight={compact ? 220 : 300}
                columns={columns}
                rows={visibleRows}
                onRowClick={onDrill ? (row) => row?.tradeRefs?.length && onDrill(row) : undefined}
                heatmap={bareHeatmap}
                defaultSortKey={sortKey}
                defaultSortDir="desc"
                totalsRow={totalsRow}
            />
        );
    }

    // Build composite title node when an eyebrow category label is provided.
    // NeonPanel renders `{title}` as children of an h3 with `uppercase`, so the
    // eyebrow span uses `normal-case` to override that inherited transform.
    const titleNode = eyebrow ? (
        <span className="flex flex-col leading-none gap-0.5">
            <span className="text-[9px] font-ui tracking-widest text-[hsl(var(--text-muted))] normal-case opacity-75">{eyebrow}</span>
            <span>{title}</span>
        </span>
    ) : title;

    return (
        <div className="flex flex-col gap-1.5">
            {/* Results Basis label — suppressed when hideResultsBasis or basisFooter is used */}
            {!hideResultsBasis && !basisFooter && (
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">Results Basis</span>
                    <HeroBadge tone={lens.isCurrentEquity ? "secondary" : "muted"}>{lens.isCurrentEquity ? "Current Equity" : "Raw R"}</HeroBadge>
                </div>
            )}
            <NeonPanel
                title={titleNode}
                className={popOpen ? "z-50" : undefined}
                action={controlsPopover ? (
                    // ── Compact popover mode ───────────────────────────────────────
                    // All controls (heatmap, compare, bucket count) live inside a
                    // small popover triggered by a single icon button. CE pill stays
                    // visible as a status indicator.
                    <div className="flex items-center gap-1.5" ref={popRef}>
                        {lens.isCurrentEquity && <Pill tone="secondary">CE</Pill>}
                        <div className="relative">
                            <button
                                type="button"
                                title="Table options"
                                onClick={(e) => { e.stopPropagation(); setPopOpen((p) => !p); }}
                                className={`clip-bevel-sm border px-2 py-1 text-[10px] inline-flex items-center gap-1 transition-colors ${
                                    popOpen
                                        ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
                                        : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"
                                }`}
                            >
                                <SlidersHorizontal className="w-3 h-3" />
                            </button>
                            {popOpen && (
                                <div
                                    className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[200px] bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] shadow-[0_4px_24px_hsl(0,0%,0%,0.35)] clip-bevel-sm p-3 flex flex-col gap-3"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Heatmap row */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-ui uppercase tracking-widest text-muted-lab">Heatmap</span>
                                        <button
                                            type="button"
                                            onClick={() => setHeatmap((h) => !h)}
                                            className={`clip-bevel-sm border px-2 py-0.5 text-[10px] inline-flex items-center gap-1 transition-colors ${
                                                heatmap
                                                    ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
                                                    : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"
                                            }`}
                                        >
                                            <Layers className="w-3 h-3" />
                                            {heatmap ? "On" : "Off"}
                                        </button>
                                    </div>
                                    {/* Compare control (headerAction) */}
                                    {headerAction && (
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-ui uppercase tracking-widest text-muted-lab">Compare</span>
                                            <div>{headerAction}</div>
                                        </div>
                                    )}
                                    {/* Column visibility — Raw R only (CE schema is different) */}
                                    {!lens.isCurrentEquity && (
                                        <div className="flex flex-col gap-1.5 border-t border-[hsl(var(--border-soft)/0.4)] pt-2.5">
                                            <span className="text-[10px] font-ui uppercase tracking-widest text-muted-lab">Columns</span>
                                            {COL_TOGGLES.map(({ key, label, info }) => (
                                                <div key={key} className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] font-ui text-[hsl(var(--text-2))]">{label}</span>
                                                        <span title={info} className="cursor-help inline-flex items-center">
                                                            <Info className="w-2.5 h-2.5 text-muted-lab shrink-0" />
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCol(key)}
                                                        className={`clip-bevel-sm border px-2 py-0.5 text-[10px] inline-flex items-center gap-1 transition-colors ${
                                                            colVisibility[key]
                                                                ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
                                                                : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"
                                                        }`}
                                                    >
                                                        {colVisibility[key] ? "On" : "Off"}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Bucket count meta footer */}
                                    <div className="border-t border-[hsl(var(--border-soft)/0.4)] pt-2 text-[9.5px] font-ui text-muted-lab">
                                        {bucketCount} active bucket{bucketCount !== 1 ? "s" : ""}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // ── Standard inline controls (existing behaviour) ──────────────
                    <div className="flex items-center gap-2">
                        {headerAction && (
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
                        {!hideChip && <Pill tone="muted">{bucketCount} BUCKETS</Pill>}
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
                    rows={visibleRows}
                    onRowClick={onDrill ? (row) => row?.tradeRefs?.length && onDrill(row) : undefined}
                    heatmap={heatmap}
                    defaultSortKey={sortKey}
                    defaultSortDir="desc"
                    totalsRow={totalsRow}
                />
                {/* Basis footer — shown instead of the above-panel label */}
                {basisFooter && (
                    <div className="mt-2 pt-2 border-t border-[hsl(var(--border-soft)/0.35)] flex items-center gap-1.5 text-[10px] font-ui text-muted-lab">
                        <span className="uppercase tracking-widest">Basis</span>
                        <span className="text-[hsl(var(--text-2))]">{lens.isCurrentEquity ? "Current Equity" : "Raw R"}</span>
                    </div>
                )}
            </NeonPanel>
        </div>
    );
}

export default CanonicalBucketTable;
