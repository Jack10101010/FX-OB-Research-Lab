// BeTradeExplorer — master BE trade table (one row per trade) for Protection
// Lab → Break-even. Shows the original result, BE lifecycle, and Max Arm reached
// for every trade in the current result view, and filters to the same cohort as
// the "Apply BE to Cohorts" cards so the table explains them. Rows come from
// buildBeTradeExplorerRows() (data/selectiveBeUniverse.js). Pure presentation.
import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";

// Display buckets (5 primary + a rare "Changed" for a genuine atypical Δ R). Internal
// classification keys are UNCHANGED — this is a display-only grouping. `reason` is the
// fine-grained internal label, surfaced in the BE Result tooltip.
const DISPLAY_BUCKET = {
    loss_saved:     { label: "Loss Saved",  tone: "success" },
    winner_cut:     { label: "Winner Cut",  tone: "danger" },
    tp_kept:        { label: "TP Kept",     tone: "muted" },
    news_flat:      { label: "No Change",   tone: "muted",     reason: "News flat" },
    same_loss:      { label: "No Change",   tone: "muted",     reason: "Same loss" },
    same_breakeven: { label: "No Change",   tone: "muted",     reason: "Same BE" },
    other_same:     { label: "No Change",   tone: "muted",     reason: "Other same" },
    other_changed:  { label: "Changed",     tone: "secondary", reason: "Δ R without a clean save/cut" },
    not_applied:    { label: "Not Applied", tone: "muted" },
};
// "No Change" groups the Δ≈0 neutral cases. EXCLUDES tp_kept (its own bucket) and
// other_changed (a genuine Δ R — kept as the rare "Changed" bucket so a non-zero-Δ row
// is never mislabelled "No Change", which would also contradict footer reconciliation).
const NO_CHANGE_CATS = new Set(["news_flat", "same_loss", "same_breakeven", "other_same"]);

function fmtTimeShort(t) {
    if (!t) return "—";
    const s = String(t).replace("T", " ").replace(/\+00:00$|Z$/, "");
    return s.length > 16 ? s.slice(5, 16) : s;
}
const dR = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}R`);

/** Displayed BE result for a row depends on scope: cohort uses selectiveApplied. */
function displayedClass(row, mode) {
    const applied = mode === "all" ? row.beApplied : row.selectiveApplied;
    return applied ? row.classification : "not_applied";
}

const SIMPLE_FILTERS = [
    { key: "all", label: "All" },
    { key: "loss_saved", label: "Loss Saved" },
    { key: "winner_cut", label: "Winner Cut" },
    { key: "tp_kept", label: "TP Kept" },
    { key: "no_change", label: "No Change" },
    { key: "not_applied", label: "Not Applied" },
];

const FRIENDLY = { long: "Long", short: "Short", choch: "CHoCH", bos: "BOS" };
const titleCase = (s) => FRIENDLY[String(s).toLowerCase()] || String(s).replace(/\b\w/g, (c) => c.toUpperCase());

export function BeTradeExplorer({
    rows = [],
    scenarioLabel = "",
    cohortActive = false,
    cohortDelta = null,
    globalDelta = null,
    filters = {},
    onViewOnMap,
}) {
    // Default scope: Current Cohort when cohort filters are active, else All Trades.
    const [mode, setMode] = React.useState(cohortActive ? "cohort" : "all");
    React.useEffect(() => { setMode(cohortActive ? "cohort" : "all"); }, [cohortActive]);
    const [filter, setFilter] = React.useState("all");

    // Scope → visible rows (preserve original order via index for stable sort).
    const scoped = React.useMemo(() => (
        (mode === "all" ? rows : rows.filter((r) => r.inCohort)).map((r, i) => ({ ...r, _i: i, _disp: displayedClass(r, mode) }))
    ), [rows, mode]);

    const filtered = React.useMemo(() => {
        if (filter === "all") return scoped;
        // "No Change" groups the Δ≈0 neutral categories (not tp_kept, not other_changed).
        if (filter === "no_change") return scoped.filter((r) => NO_CHANGE_CATS.has(r._disp));
        return scoped.filter((r) => r._disp === filter); // loss_saved · winner_cut · tp_kept · not_applied
    }, [scoped, filter, mode]);

    // Sort: non-zero Δ first, then Max Arm desc, then original order.
    const sorted = React.useMemo(() => [...filtered].sort((a, b) => {
        const ad = Math.abs(a.deltaR || 0) > 0.005 ? 1 : 0;
        const bd = Math.abs(b.deltaR || 0) > 0.005 ? 1 : 0;
        if (ad !== bd) return bd - ad;
        const am = a.maxArmReached ?? -1; const bm = b.maxArmReached ?? -1;
        if (am !== bm) return bm - am;
        return a._i - b._i;
    }), [filtered]);

    // Footer reconciliation.
    const footer = React.useMemo(() => {
        const appliedKey = mode === "all" ? "beApplied" : "selectiveApplied";
        const appliedRows = scoped.filter((r) => r[appliedKey]);
        const sum = appliedRows.reduce((s, r) => s + (r.deltaR || 0), 0);
        const deltaR = Math.round(sum * 100) / 100;
        const saved = scoped.filter((r) => r._disp === "loss_saved").length;
        const cut = scoped.filter((r) => r._disp === "winner_cut").length;
        const triggered = appliedRows.filter((r) => r.beTriggered).length;
        const expected = mode === "all" ? globalDelta : cohortDelta;
        const mismatch = expected != null && Math.abs(Number(expected) - deltaR) > 0.011;
        return { visible: scoped.length, applied: appliedRows.length, triggered, saved, cut, deltaR, expected, mismatch };
    }, [scoped, mode, globalDelta, cohortDelta]);

    // Column order is decision-first: BE Result + Δ R adjacent (verdict + impact), then
    // Orig R / Max Arm, then context dims, then MFE R / IDs. The Armed + BE Hit booleans
    // and arm/exit timestamps are folded into the BE Result cell's tooltip (redundant with
    // the result chip as columns). MFE R sits right of Max Arm (Max Arm is its bucketed form).
    // Compact "what am I looking at" context line.
    const filterContext = React.useMemo(() => {
        const scenarioPart = String(scenarioLabel || "").replace(/^EXACT\s·\s/, "");
        if (mode === "all") return `All Trades · Exact ${scenarioPart}`;
        const parts = [
            ...(filters.directions || []).map(titleCase),
            ...(filters.structures || []).map(titleCase),
            ...(filters.sessions || []).map(titleCase),
            ...(filters.armLevel != null ? [`${filters.armLevel}R reached`] : []),
        ];
        return parts.length
            ? `Current Cohort · ${parts.join(" · ")} · ${scenarioPart}`
            : `Current Cohort · No cohort filters active · ${scenarioPart}`;
    }, [mode, filters, scenarioLabel]);

    const columns = React.useMemo(() => [
        {
            key: "_disp", label: "BE Result", sortable: false, render: (r) => {
                const m = DISPLAY_BUCKET[r._disp] || DISPLAY_BUCKET.not_applied;
                const tip = [
                    m.reason || null,
                    r.beArmed ? "Armed ✓" : null,
                    r.beTriggered ? "BE Hit ✓" : null,
                    r.beArmTime ? `Armed: ${fmtTimeShort(r.beArmTime)}` : null,
                    r.beExitTime ? `BE Exit: ${fmtTimeShort(r.beExitTime)}` : null,
                ].filter(Boolean).join(" · ");
                return <span title={tip || undefined}><Pill tone={m.tone}>{m.label}</Pill></span>;
            },
        },
        { key: "deltaR", label: "Δ R", align: "right", render: (r) => (r.deltaR != null ? <ColoredR value={r.deltaR} /> : "—") },
        { key: "originalR", label: "Orig R", align: "right", render: (r) => (r.originalR != null ? <ColoredR value={r.originalR} /> : "—") },
        { key: "maxArmReached", label: "Max Arm", align: "right", render: (r) => <span className="font-num text-[11px] text-[hsl(var(--text-1))]">{r.maxArmReached != null ? `${r.maxArmReached}R` : "—"}</span> },
        { key: "session", label: "Session", render: (r) => <span className="font-ui text-[11px] text-[hsl(var(--text-2))]">{r.session || "—"}</span> },
        { key: "direction", label: "Dir", render: (r) => <span className="font-ui text-[11px] text-[hsl(var(--text-2))]">{r.direction || "—"}</span> },
        { key: "structure", label: "Struct", render: (r) => <span className="font-ui text-[11px] text-[hsl(var(--text-2))]">{r.structure || "—"}</span> },
        { key: "mfeR", label: "MFE R", align: "right", render: (r) => <span className="font-num text-[11px] text-[hsl(var(--text-2))]">{r.mfeR != null ? `${Number(r.mfeR).toFixed(2)}` : "—"}</span> },
        { key: "tradeId", label: "Trade", render: (r) => <span className="font-code text-[11px] text-[hsl(var(--text-1))]">{r.tradeId || "—"}</span> },
        { key: "obId", label: "OB", render: (r) => <span className="font-code text-[11px] text-[hsl(var(--text-2))]">{r.obId || "—"}</span> },
        ...(onViewOnMap ? [{
            key: "view", label: "", sortable: false, width: "92px",
            render: (r) => (
                <button type="button" onClick={(e) => { e.stopPropagation(); onViewOnMap(r); }} className="row-chip row-chip-muted text-[10.5px]" title="View on Map">View on Map</button>
            ),
        }] : []),
    ], [onViewOnMap]);

    return (
        <NeonPanel
            title="BE Trade Explorer"
            action={
                <div className="flex items-center gap-1.5 flex-wrap">
                    {["cohort", "all"].map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setMode(s)}
                            className={cn(
                                "px-2 py-0.5 rounded-[4px] border text-[10.5px] font-ui transition-colors",
                                mode === s
                                    ? "bg-[hsl(var(--accent-secondary)/0.16)] border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]"
                                    : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                            )}
                            title={s === "cohort" ? "Filter to the same cohort as the cards below." : "Show every trade in the current result view."}
                        >
                            {s === "cohort" ? "Current Cohort" : "All Trades"}
                        </button>
                    ))}
                    <Pill tone="success">{scenarioLabel}</Pill>
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-snug">
                    One row per trade. Shows original result, BE lifecycle, and max arm reached.
                    {" "}<span className="text-[hsl(var(--text-3))]">Max Arm is a derived MFE bucket (how far the trade ran), not the selected BE scenario.</span>
                </p>
                {/* Current cohort / filter context strip */}
                <div className="flex items-center gap-2 flex-wrap px-2.5 py-1.5 rounded-[4px] border border-[hsl(var(--accent-secondary)/0.4)] bg-[hsl(var(--accent-secondary)/0.07)]">
                    <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))]">Showing</span>
                    <span className="text-[11px] font-ui font-semibold text-[hsl(var(--text))]">{filterContext}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {SIMPLE_FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setFilter(f.key)}
                            className={cn(
                                "px-3 py-1.5 rounded-[4px] border text-[11px] font-ui font-semibold transition-colors",
                                filter === f.key
                                    ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                    : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="min-h-[360px] max-h-[460px] overflow-y-auto overflow-x-auto">
                    {/* Row click intentionally does NOT navigate — only the View on Map chip does. */}
                    {sorted.length ? (
                        <DataTable columns={columns} rows={sorted} rowKey="baseTradeId" defaultSortKey={null} />
                    ) : (
                        <div className="py-3 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No trades for this filter.</div>
                    )}
                </div>
                {/* Footer reconciliation */}
                <div className="flex items-center gap-3 flex-wrap text-[11px] font-ui border-t border-[hsl(var(--border-soft))] pt-2">
                    <span className="text-[hsl(var(--text-2))]">Visible <strong className="text-[hsl(var(--text))]">{footer.visible}</strong></span>
                    <span className="text-[hsl(var(--text-2))]">BE Applied <strong className="text-[hsl(var(--text))]">{footer.applied}</strong></span>
                    <span className="text-[hsl(var(--text-2))]" title="Trades where the BE stop was actually hit — a lifecycle metric, not a result bucket.">BE Hit <strong className="text-[hsl(var(--text))]">{footer.triggered}</strong></span>
                    <span className="text-[hsl(var(--accent-success))]">Saved {footer.saved}</span>
                    <span className="text-[hsl(var(--danger))]">Cut {footer.cut}</span>
                    <span className={cn(footer.deltaR > 0.005 ? "text-[hsl(var(--accent-success))]" : footer.deltaR < -0.005 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]")}>
                        Δ Net R {dR(footer.deltaR)}
                    </span>
                    {footer.expected != null && (
                        <span className={cn("text-[10px]", footer.mismatch ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-3))]")}>
                            {footer.mismatch
                                ? `⚠ ${dR(footer.deltaR)} ≠ ${mode === "all" ? "global" : "selective"} summary ${dR(footer.expected)}`
                                : `✓ matches ${mode === "all" ? "global" : "selective"} summary Δ`}
                        </span>
                    )}
                </div>
            </div>
        </NeonPanel>
    );
}

export default BeTradeExplorer;
