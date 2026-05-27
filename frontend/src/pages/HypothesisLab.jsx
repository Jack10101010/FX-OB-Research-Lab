import React from "react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { ColoredR, Pill } from "@/components/lab/DataTable";
import { HeroBadge } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import {
    FlaskConical, TrendingUp, TrendingDown, Target, AlertTriangle,
    ChevronDown, ChevronUp, Copy, Check,
    Trash2, Pencil, BookMarked, Layers, Save, Zap,
} from "lucide-react";

// ── Hypothesis Lab ──────────────────────────────────────────────────────────
// Frontend-only exploratory simulation page. No Python, no backend, no store
// mutation. Results are frontend estimates for deciding what deserves a full
// Python backtest. All frontend estimates are clearly labelled.

const EMPTY_TRADES = [];

const SIM_FILTERS = [
    // SESSION
    { key: "excl_asia",        group: "Session",     label: "Exclude Asia",               matches: (t) => sessionOf(t.entry) === "Asia" },
    { key: "excl_london",      group: "Session",     label: "Exclude London",             matches: (t) => sessionOf(t.entry) === "London" },
    { key: "excl_lull",        group: "Session",     label: "Exclude London Lull",        matches: (t) => sessionOf(t.entry) === "London Lull" },
    { key: "excl_ny",          group: "Session",     label: "Exclude New York",           matches: (t) => sessionOf(t.entry) === "New York" },
    { key: "excl_outside",     group: "Session",     label: "Exclude Outside",            matches: (t) => sessionOf(t.entry) === "Outside" },
    // TIME
    { key: "excl_mon",         group: "Time",        label: "Exclude Monday",             matches: (t) => dayOf(t) === 1 },
    { key: "excl_tue",         group: "Time",        label: "Exclude Tuesday",            matches: (t) => dayOf(t) === 2 },
    { key: "excl_wed",         group: "Time",        label: "Exclude Wednesday",          matches: (t) => dayOf(t) === 3 },
    { key: "excl_thu",         group: "Time",        label: "Exclude Thursday",           matches: (t) => dayOf(t) === 4 },
    { key: "excl_fri",         group: "Time",        label: "Exclude Friday",             matches: (t) => dayOf(t) === 5 },
    { key: "excl_hr_15",       group: "Time",        label: "Toxic hour (15:00 UTC)",     matches: (t) => hourOf(t) === 15 },
    { key: "excl_hr_12",       group: "Time",        label: "Exclude 12:00 UTC",          matches: (t) => hourOf(t) === 12 },
    // STRUCTURE
    { key: "excl_bos",         group: "Structure",   label: "Exclude BOS",                matches: (t) => structureOf(t) === "bos" },
    { key: "excl_choch",       group: "Structure",   label: "Exclude CHoCH",              matches: (t) => structureOf(t) === "choch" },
    { key: "excl_long",        group: "Structure",   label: "Exclude Longs",              matches: (t) => directionOf(t) === "long" },
    { key: "excl_short",       group: "Structure",   label: "Exclude Shorts",             matches: (t) => directionOf(t) === "short" },
    { key: "excl_bull",        group: "Structure",   label: "Exclude Bullish OB",         matches: (t) => biasOf(t) === "bullish" },
    { key: "excl_bear",        group: "Structure",   label: "Exclude Bearish OB",         matches: (t) => biasOf(t) === "bearish" },
    // ORDER BLOCK
    { key: "excl_ob_ny",       group: "Order Block", label: "OB origin: New York",        matches: (t) => originSessionOf(t) === "New York" },
    { key: "excl_ob_outside",  group: "Order Block", label: "OB origin: Outside",         matches: (t) => originSessionOf(t) === "Outside" },
    { key: "excl_ob_asia",     group: "Order Block", label: "OB origin: Asia",            matches: (t) => originSessionOf(t) === "Asia" },
    { key: "excl_age_0_3",     group: "Order Block", label: "Exclude OB age: 0–3d",       matches: (t) => ageBucketOf(t) === "0–3d" },
    { key: "excl_age_3_7",     group: "Order Block", label: "Exclude OB age: 3–7d",       matches: (t) => ageBucketOf(t) === "3–7d" },
    { key: "excl_age_7_14",    group: "Order Block", label: "Exclude OB age: 7–14d",      matches: (t) => ageBucketOf(t) === "7–14d" },
    { key: "excl_age_14p",     group: "Order Block", label: "Exclude OB age: 14d+",       matches: (t) => ageBucketOf(t) === "14d+" },
    { key: "excl_width_nar",   group: "Order Block", label: "Exclude width: 0–5 pips",    matches: (t) => widthBucketOf(t) === "0–5p" },
    { key: "excl_width_wid",   group: "Order Block", label: "Exclude width: >10 pips",    matches: (t) => Number(t?.obWidthPips ?? t?.ob_width_pips) > 10 },
    { key: "excl_full_br",     group: "Order Block", label: "Exclude hard invalidation losses", matches: isFullBreach },
    { key: "excl_close_br",    group: "Order Block", label: "Exclude close-conf. invalidation", matches: isCloseBreach },
    { key: "excl_pen_high",    group: "Order Block", label: "Exclude pen. > 75%",         matches: (t) => penBucketOf(t) === ">75%" },
    { key: "excl_dist_far",    group: "Order Block", label: "Exclude distance > 20 pips", matches: (t) => Number(t?.distanceBeforeFill ?? t?.distance_before_fill_pips) > 20 },
];

const SIM_FILTER_GROUPS = ["Session", "Time", "Structure", "Order Block"];

const ENTRY_MODES = [
    { mode: "baseline",               label: "Baseline · Edge Touch", threshold: "Edge" },
    { mode: "entry_penetration_10p0", label: "Penetration 10%",       threshold: "10%" },
    { mode: "entry_penetration_25p0", label: "Penetration 25%",       threshold: "25%" },
    { mode: "entry_penetration_50p0", label: "Penetration 50%",       threshold: "50%" },
    { mode: "entry_penetration_75p0", label: "Penetration 75%",       threshold: "75%" },
];

const PROTECTION_MODES = [
    { mode: "baseline",          label: "Baseline (no protection)" },
    { mode: "full_breach_exit",  label: "Hard Invalidation Exit" },
    { mode: "penetration_exits", label: "Penetration Exits" },
    { mode: "close_confirmed",   label: "Close-Confirmed Exits" },
];

const PRESETS = [
    { label: "Avoid New York",       filters: ["excl_ny"],                                   entry: null,                    protection: null },
    { label: "Avoid toxic hour",     filters: ["excl_hr_15"],                                entry: null,                    protection: null },
    { label: "Avoid hard invalidation losses", filters: ["excl_full_br"],                              entry: null,                    protection: null },
    { label: "Use best entry model", filters: [],                                            entry: "BEST",                  protection: null },
    { label: "Entry 25% only",       filters: [],                                            entry: "entry_penetration_25p0",protection: null },
    { label: "Conservative filter",  filters: ["excl_ny", "excl_hr_15", "excl_full_br"],    entry: null,                    protection: null },
    { label: "Clear all",            filters: [],                                            entry: "baseline",              protection: "baseline", clear: true },
];

// ── Main Page ───────────────────────────────────────────────────────────────

export default function HypothesisLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs } = useDataset();
    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const activeRun = activeRunId ? runs?.[activeRunId] : null;

    const [activeFilters, setActiveFilters]   = React.useState(new Set());
    const [selectedEntry, setSelectedEntry]   = React.useState("baseline");
    const [selectedProtection, setSelectedProtection] = React.useState("baseline");
    const [savedHypotheses, setSavedHypotheses] = React.useState([]);
    const [editingName, setEditingName]       = React.useState(null);
    const [editNameValue, setEditNameValue]   = React.useState("");
    const [copied, setCopied]                 = React.useState(false);
    const [collapsed, setCollapsed]           = React.useState({ summary: false, simulator: false, saved: false, promote: false });
    const simCount = React.useRef(0);

    const baseline         = React.useMemo(() => computeStats(trades), [trades]);
    const exactEntryRows   = React.useMemo(() => buildExactEntryRows(activeRun, trades, ACTIVE_TRADE_VARIANT), [activeRun, trades, ACTIVE_TRADE_VARIANT]);
    const exactProtRows    = React.useMemo(() => buildExactProtectionRows(activeRun), [activeRun]);
    const insights         = React.useMemo(() => buildInsights(trades, exactEntryRows, exactProtRows), [trades, exactEntryRows, exactProtRows]);

    const filteredTrades   = React.useMemo(() => applyFilters(trades, activeFilters, SIM_FILTERS), [trades, activeFilters]);
    const simStats         = React.useMemo(() => computeStats(filteredTrades), [filteredTrades]);
    const removedCount     = trades.length - filteredTrades.length;

    const entryOverride = React.useMemo(() => {
        if (selectedEntry === "baseline") return null;
        return exactEntryRows.find((r) => normalizeMode(r.mode) === normalizeMode(selectedEntry)) || null;
    }, [exactEntryRows, selectedEntry]);

    const protectionOverride = React.useMemo(() => {
        if (selectedProtection === "baseline") return null;
        return exactProtRows.find((r) => normalizeMode(r.mode) === normalizeMode(selectedProtection)) || null;
    }, [exactProtRows, selectedProtection]);

    const hasActiveFilters = activeFilters.size > 0 || selectedEntry !== "baseline" || selectedProtection !== "baseline";

    const currentSimRow = React.useMemo(() => {
        if (!hasActiveFilters) return null;
        const stats = entryOverride
            ? { trades: entryOverride.fills ?? entryOverride.eligible, removed: null, winRate: entryOverride.winRate, netR: entryOverride.netR, expectancy: entryOverride.expectancy, maxDD: entryOverride.maxDD, exact: true }
            : { ...simStats, removed: removedCount, exact: false };
        return {
            ...stats,
            filters: Array.from(activeFilters),
            entry: selectedEntry,
            protection: selectedProtection,
            deltaNetR: isFiniteNum(stats.netR) && isFiniteNum(baseline.netR) ? round2(stats.netR - baseline.netR) : null,
            deltaWR:   isFiniteNum(stats.winRate) && isFiniteNum(baseline.winRate) ? round2(stats.winRate - baseline.winRate) : null,
        };
    }, [hasActiveFilters, entryOverride, simStats, removedCount, activeFilters, selectedEntry, selectedProtection, baseline]);

    const toggleFilter = (key) =>
        setActiveFilters((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

    const applyPreset = (preset) => {
        if (preset.clear) { setActiveFilters(new Set()); setSelectedEntry("baseline"); setSelectedProtection("baseline"); return; }
        setActiveFilters(new Set(preset.filters));
        if (preset.entry === "BEST") {
            const best = exactEntryRows.filter((r) => !r.isBaseline && isFiniteNum(r.netR)).sort((a, b) => b.netR - a.netR)[0];
            setSelectedEntry(best ? best.mode : "baseline");
        } else if (preset.entry) {
            setSelectedEntry(preset.entry);
        }
        if (preset.protection) setSelectedProtection(preset.protection);
    };

    const saveHypothesis = () => {
        if (!currentSimRow) return;
        simCount.current += 1;
        setSavedHypotheses((prev) => [...prev, { id: Date.now(), name: `Simulation ${simCount.current}`, ...currentSimRow, savedAt: new Date().toISOString() }]);
    };

    const deleteSaved   = (id) => setSavedHypotheses((prev) => prev.filter((h) => h.id !== id));
    const restoreSaved  = (h)  => { setActiveFilters(new Set(h.filters || [])); setSelectedEntry(h.entry || "baseline"); setSelectedProtection(h.protection || "baseline"); };
    const startRename   = (h)  => { setEditingName(h.id); setEditNameValue(h.name); };
    const commitRename  = (id) => { setSavedHypotheses((prev) => prev.map((h) => h.id === id ? { ...h, name: editNameValue || h.name } : h)); setEditingName(null); };

    const promotePayload = React.useMemo(() => JSON.stringify({
        hypothesis_label: "Hypothesis Lab Export",
        generated: new Date().toISOString(),
        note: "Frontend exploratory estimate — requires exact Python backtest to validate.",
        filters: {
            exclude_sessions: SIM_FILTERS.filter((f) => f.group === "Session"     && activeFilters.has(f.key)).map((f) => f.label),
            exclude_time:     SIM_FILTERS.filter((f) => f.group === "Time"        && activeFilters.has(f.key)).map((f) => f.label),
            exclude_structure:SIM_FILTERS.filter((f) => f.group === "Structure"   && activeFilters.has(f.key)).map((f) => f.label),
            exclude_ob:       SIM_FILTERS.filter((f) => f.group === "Order Block" && activeFilters.has(f.key)).map((f) => f.label),
        },
        entry_model:      selectedEntry,
        protection_mode:  selectedProtection,
        frontend_estimate: currentSimRow ? {
            trades:     isFiniteNum(currentSimRow.trades)     ? Math.round(currentSimRow.trades) : null,
            win_rate:   isFiniteNum(currentSimRow.winRate)    ? round2(currentSimRow.winRate)    : null,
            net_r:      isFiniteNum(currentSimRow.netR)       ? round2(currentSimRow.netR)       : null,
            expectancy: isFiniteNum(currentSimRow.expectancy) ? round4(currentSimRow.expectancy) : null,
            max_dd:     isFiniteNum(currentSimRow.maxDD)      ? round2(currentSimRow.maxDD)      : null,
        } : null,
    }, null, 2), [activeFilters, selectedEntry, selectedProtection, currentSimRow]);

    const handleCopy = async () => {
        try { await navigator.clipboard.writeText(promotePayload); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
    };
    const exportHypothesesCsv = () => {
        const rowFor = (name, row, options = {}) => ({
            name,
            trades: row?.trades,
            removed: row?.removed,
            win_rate: row?.winRate,
            net_r: row?.netR,
            expectancy: row?.expectancy,
            max_dd: row?.maxDD,
            delta_net_r: row?.deltaNetR,
            delta_wr: row?.deltaWR,
            entry_model: modelLabel(ENTRY_MODES, row?.entry || options.entry || "baseline"),
            protection_model: modelLabel(PROTECTION_MODES, row?.protection || options.protection || "baseline"),
            active_filters_summary: filterSummary(row?.filters || []),
        });
        const rows = [
            rowFor("Baseline", { ...baseline, removed: 0, deltaNetR: 0, deltaWR: 0 }, { entry: "baseline", protection: "baseline" }),
            ...(currentSimRow ? [rowFor("Current Simulation", currentSimRow)] : []),
            ...savedHypotheses.map((hypothesis) => rowFor(hypothesis.name, hypothesis)),
        ];
        downloadCsv(`hypothesis_lab_${fileSafe(ACTIVE_RUN?.id || activeRunId || "run")}_${csvTimestamp()}.csv`, rows);
    };

    const toggleSection = (key) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Hypothesis Lab"
                title={ACTIVE_RUN?.id || "No active run"}
                runLine={`${ACTIVE_RUN?.symbol || "Symbol"} · ${ACTIVE_RUN?.detectionTf || "TF"} · ${variantLabel(ACTIVE_TRADE_VARIANT)}`}
                description="Combine imported run insights into quick research estimates before promoting them to exact Python tests."
                actions={(
                    <div className="flex items-center gap-2">
                        <HeroBadge tone={activeRunId ? "primary" : "muted"}>{activeRunId ? "Imported" : "No Run"}</HeroBadge>
                        <HeroBadge tone="secondary">{trades.length} trades</HeroBadge>
                        <HeroBadge tone="warning">Frontend Estimates</HeroBadge>
                    </div>
                )}
            />

            {/* Baseline KPIs */}
            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Baseline Trades" value={String(baseline.trades)}       sub="active variant"                tone="primary"                                    icon={Layers} />
                <MetricChip label="Win Rate"        value={fmtPct(baseline.winRate)}      sub={`${baseline.wins}W / ${baseline.losses}L`} tone="secondary"                    icon={Target} />
                <MetricChip label="Net R"           value={fmtR(baseline.netR)}           sub="cumulative"                    tone={num(baseline.netR) >= 0 ? "primary" : "danger"} icon={TrendingUp} />
                <MetricChip label="Expectancy"      value={fmtExp(baseline.expectancy)}   sub="per trade"                     tone="primary"                                    icon={FlaskConical} />
                <MetricChip label="Max DD"          value={fmtR(baseline.maxDD)}          sub="baseline"                      tone="danger"                                     icon={TrendingDown} />
                <MetricChip label="Saved Hypo."     value={String(savedHypotheses.length)} sub="this session"                 tone={savedHypotheses.length ? "success" : "muted"} icon={BookMarked} />
            </div>

            <div className="px-6 mt-5 space-y-3">

                {/* ── Section 2: Research Summary ── */}
                <Section
                    title="Research Summary · What Stands Out"
                    action={<Pill tone="muted">INSIGHTS</Pill>}
                    collapsed={collapsed.summary}
                    onToggle={() => toggleSection("summary")}
                >
                    <div className="text-[10.5px] font-mono text-[hsl(var(--warning))] mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Frontend estimates derived from imported trades — not candle-level simulations.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <InsightGroup title="Entry"       items={insights.entry} />
                        <InsightGroup title="Protection"  items={insights.protection} />
                        <InsightGroup title="Timing"      items={insights.timing} />
                        <InsightGroup title="Order Block" items={insights.ob} />
                        <InsightGroup title="Loss Behavior" items={insights.breach} />
                    </div>
                </Section>

                {/* ── Section 3+5: Hypothesis Simulator + Presets ── */}
                <Section
                    title="Hypothesis Simulator"
                    action={<div className="flex items-center gap-1.5"><Pill tone={hasActiveFilters ? "primary" : "muted"}>{activeFilters.size} FILTERS</Pill><Pill tone="warning">EXPLORATORY</Pill></div>}
                    collapsed={collapsed.simulator}
                    onToggle={() => toggleSection("simulator")}
                >
                    <p className="text-[10.5px] font-mono text-muted-lab mb-4">
                        Toggle exclusion filters, then select entry / protection models. Entry and protection model selectors show exact imported metrics when available. All other results are frontend estimates.
                    </p>

                    {/* Presets */}
                    <div className="mb-4">
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-muted-lab mb-1.5">Quick Presets</div>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map((p) => (
                                <button
                                    key={p.label}
                                    onClick={() => applyPreset(p)}
                                    className={[
                                        "text-[11px] font-mono px-2.5 py-1 clip-bevel-sm border transition-colors",
                                        p.clear
                                            ? "border-[hsl(var(--border-mid))] text-muted-lab hover:text-white hover:border-[hsl(var(--border-soft))]"
                                            : "border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)] hover:bg-[hsl(var(--accent-primary)/0.16)]",
                                    ].join(" ")}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Filter groups */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                        {SIM_FILTER_GROUPS.map((group) => (
                            <FilterGroup
                                key={group}
                                group={group}
                                filters={SIM_FILTERS.filter((f) => f.group === group)}
                                activeFilters={activeFilters}
                                onToggle={toggleFilter}
                            />
                        ))}
                    </div>

                    {/* Entry / Protection selectors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <ModelSelector
                            title="Entry Model"
                            options={ENTRY_MODES}
                            selected={selectedEntry}
                            onSelect={setSelectedEntry}
                            exactRows={exactEntryRows}
                            override={entryOverride}
                        />
                        <ModelSelector
                            title="Protection Mode"
                            options={PROTECTION_MODES}
                            selected={selectedProtection}
                            onSelect={setSelectedProtection}
                            exactRows={exactProtRows}
                            override={protectionOverride}
                        />
                    </div>

                    {/* Simulation result */}
                    <SimResultPanel
                        baseline={baseline}
                        simStats={simStats}
                        removedCount={removedCount}
                        entryOverride={entryOverride}
                        hasActiveFilters={hasActiveFilters}
                        activeFilters={activeFilters}
                        onSave={saveHypothesis}
                    />
                </Section>

                {/* ── Section 4: Saved Hypotheses ── */}
                <Section
                    title="Saved Hypotheses"
                    action={<Pill tone={savedHypotheses.length ? "success" : "muted"}>{savedHypotheses.length} SAVED</Pill>}
                    collapsed={collapsed.saved}
                    onToggle={() => toggleSection("saved")}
                >
                    <div className="mb-3 flex justify-end">
                        <button
                            type="button"
                            onClick={exportHypothesesCsv}
                            className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] clip-bevel-sm"
                        >
                            Export Hypotheses CSV
                        </button>
                    </div>
                    <SavedTable
                        baseline={baseline}
                        currentSimRow={currentSimRow}
                        saved={savedHypotheses}
                        onDelete={deleteSaved}
                        onRestore={restoreSaved}
                        onStartRename={startRename}
                        editingName={editingName}
                        editNameValue={editNameValue}
                        setEditNameValue={setEditNameValue}
                        onCommitRename={commitRename}
                    />
                </Section>

                {/* ── Section 6: Promote to Exact Backtest ── */}
                <Section
                    title="Promote to Exact Backtest"
                    action={<Pill tone="muted">EXPORT</Pill>}
                    collapsed={collapsed.promote}
                    onToggle={() => toggleSection("promote")}
                >
                    <div className="text-[11px] font-mono text-muted-lab mb-3 flex items-start gap-1.5">
                        <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[hsl(var(--accent-secondary))]" />
                        Creates a copyable hypothesis/config idea for the Python backtester. It does not run the engine.
                        This is a frontend estimate — use it to decide what deserves an exact Python test.
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 text-[11.5px] font-mono px-3 py-1.5 clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.6)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.08)] hover:bg-[hsl(var(--accent-secondary)/0.16)] transition-colors"
                        >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? "Copied!" : "Copy to Clipboard"}
                        </button>
                        <span className="text-[10.5px] font-mono text-muted-lab">Hypothesis JSON payload</span>
                    </div>
                    <pre className="text-[10.5px] font-mono text-[hsl(var(--text-2))] bg-[hsl(var(--panel-2)/0.5)] border border-[hsl(var(--border-soft))] clip-bevel-sm p-3 overflow-x-auto scrollbar-thin max-h-[240px]">
                        {promotePayload}
                    </pre>
                </Section>

            </div>
        </div>
    );
}

// ── Sub-Components ──────────────────────────────────────────────────────────

function Section({ title, action, collapsed, onToggle, children }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.7)]">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[hsl(var(--panel-2)/0.4)] transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    <span className="text-[12.5px] font-display font-semibold text-white tracking-tight">{title}</span>
                    {action}
                </div>
                {collapsed
                    ? <ChevronDown className="w-4 h-4 text-muted-lab" />
                    : <ChevronUp   className="w-4 h-4 text-muted-lab" />}
            </button>
            {!collapsed && <div className="px-4 pb-4 pt-1">{children}</div>}
        </div>
    );
}

function InsightGroup({ title, items }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm p-3">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--accent-secondary))] mb-2">{title}</div>
            <div className="space-y-1.5">
                {items.map((item, i) => (
                    <div key={i} className="flex items-start justify-between gap-2">
                        <span className="text-[10px] text-muted-lab leading-tight shrink-0 max-w-[45%]">{item.label}</span>
                        {item.available
                            ? <span className="text-[10.5px] font-mono text-white text-right leading-tight break-all">{item.value}</span>
                            : <span className="text-[10px] font-mono text-muted-lab italic">Limited Data</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

function FilterGroup({ group, filters, activeFilters, onToggle }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))] mb-2">{group}</div>
            <div className="flex flex-wrap gap-1">
                {filters.map((f) => {
                    const active = activeFilters.has(f.key);
                    return (
                        <button
                            key={f.key}
                            onClick={() => onToggle(f.key)}
                            className={[
                                "text-[10px] font-mono px-2 py-0.5 clip-bevel-sm border transition-colors",
                                active
                                    ? "border-[hsl(var(--danger)/0.7)] bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]"
                                    : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--border-soft))] hover:text-white",
                            ].join(" ")}
                        >
                            {active && "✕ "}{f.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ModelSelector({ title, options, selected, onSelect, exactRows, override }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--accent-secondary))] mb-2">{title}</div>
            <div className="flex flex-wrap gap-1 mb-2.5">
                {options.map((opt) => {
                    const isActive   = selected === opt.mode;
                    const hasExact   = exactRows.some((r) => normalizeMode(r.mode) === normalizeMode(opt.mode) && r.exact && normalizeMode(r.mode) !== "baseline");
                    return (
                        <button
                            key={opt.mode}
                            onClick={() => onSelect(opt.mode)}
                            title={opt.threshold || ""}
                            className={[
                                "text-[10px] font-mono px-2 py-0.5 clip-bevel-sm border transition-colors",
                                isActive
                                    ? "border-[hsl(var(--accent-secondary)/0.7)] bg-[hsl(var(--accent-secondary)/0.15)] text-[hsl(var(--accent-secondary))]"
                                    : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white",
                            ].join(" ")}
                        >
                            {opt.label}{hasExact && <span className="ml-1 text-[hsl(var(--success))]">·</span>}
                        </button>
                    );
                })}
            </div>
            {override ? (
                <div className="text-[10.5px] font-mono space-y-1">
                    <div className="text-[9px] uppercase tracking-wider text-[hsl(var(--success))] mb-1">Exact imported data</div>
                    <div className="flex gap-3 flex-wrap">
                        {isFiniteNum(override.netR)       && <span className="text-white">Net R: <ColoredR value={override.netR} /></span>}
                        {isFiniteNum(override.winRate)    && <span className="text-muted-lab">WR: {fmtPct(override.winRate)}</span>}
                        {isFiniteNum(override.expectancy) && <span className="text-muted-lab">Exp: {fmtExp(override.expectancy)}</span>}
                        {isFiniteNum(override.maxDD)      && <span className="text-muted-lab">Max DD: {fmtR(override.maxDD)}</span>}
                    </div>
                </div>
            ) : (
                <div className="text-[10px] font-mono text-muted-lab italic">
                    {selected === "baseline" ? "Baseline — all trades" : "Limited Data · no exact import for this mode"}
                </div>
            )}
        </div>
    );
}

function SimResultPanel({ baseline, simStats, removedCount, entryOverride, hasActiveFilters, activeFilters, onSave }) {
    if (!hasActiveFilters) {
        return (
            <div className="border border-dashed border-[hsl(var(--border-mid))] clip-bevel-sm p-4 text-[11px] font-mono text-muted-lab text-center">
                Activate filters or select a non-baseline model above to see simulation results.
            </div>
        );
    }

    const stats = entryOverride
        ? { trades: entryOverride.fills ?? entryOverride.eligible, winRate: entryOverride.winRate, netR: entryOverride.netR, expectancy: entryOverride.expectancy, maxDD: entryOverride.maxDD, exact: true }
        : { ...simStats, exact: false };

    const deltaNetR = isFiniteNum(stats.netR) && isFiniteNum(baseline.netR) ? round2(stats.netR - baseline.netR) : null;
    const deltaWR   = isFiniteNum(stats.winRate) && isFiniteNum(baseline.winRate) ? round2(stats.winRate - baseline.winRate) : null;

    return (
        <div className="border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.05)] clip-bevel-sm p-3">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-display font-semibold text-white">Current Simulation</span>
                    <Pill tone={stats.exact ? "success" : "warning"}>{stats.exact ? "EXACT DATA" : "FRONTEND ESTIMATE"}</Pill>
                </div>
                <button
                    onClick={onSave}
                    className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 clip-bevel-sm border border-[hsl(var(--success)/0.6)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)] hover:bg-[hsl(var(--success)/0.16)] transition-colors"
                >
                    <Save className="w-3 h-3" />
                    Save Simulation
                </button>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3 text-[10.5px] font-mono">
                <StatCell label="Trades"     value={isFiniteNum(stats.trades) ? String(Math.round(stats.trades)) : "—"} />
                {!stats.exact && <StatCell label="Removed"  value={String(removedCount)} tone="danger" />}
                <StatCell label="Win Rate"   value={fmtPct(stats.winRate)} />
                <StatCell label="Net R"      value={fmtR(stats.netR)}        tone={num(stats.netR) >= 0 ? "success" : "danger"} />
                <StatCell label="Expectancy" value={fmtExp(stats.expectancy)} />
                <StatCell label="Max DD"     value={fmtR(stats.maxDD)}        tone="danger" />
                {isFiniteNum(deltaNetR) && <StatCell label="Δ Net R" value={`${deltaNetR >= 0 ? "+" : ""}${deltaNetR.toFixed(1)}R`} tone={deltaNetR >= 0 ? "success" : "danger"} />}
                {isFiniteNum(deltaWR)   && <StatCell label="Δ WR"    value={`${deltaWR >= 0 ? "+" : ""}${deltaWR.toFixed(1)}%`}    tone={deltaWR   >= 0 ? "success" : "danger"} />}
            </div>
            {activeFilters.size > 0 && (
                <div className="mt-2 text-[10px] font-mono text-muted-lab leading-relaxed">
                    <span className="text-[hsl(var(--text-2))]">Active exclusions: </span>
                    {Array.from(activeFilters).map((k) => SIM_FILTERS.find((f) => f.key === k)?.label || k).join(" · ")}
                </div>
            )}
        </div>
    );
}

function StatCell({ label, value, tone }) {
    const colorMap = { success: "text-[hsl(var(--success))]", danger: "text-[hsl(var(--danger))]" };
    return (
        <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-lab mb-0.5">{label}</div>
            <div className={`font-mono tabular-nums ${colorMap[tone] || "text-white"}`}>{value || "—"}</div>
        </div>
    );
}

function SavedTable({ baseline, currentSimRow, saved, onDelete, onRestore, onStartRename, editingName, editNameValue, setEditNameValue, onCommitRename }) {
    const baseRow = { id: "baseline", name: "Baseline", isBaseline: true, ...baseline, removed: 0, deltaNetR: 0, deltaWR: 0 };
    const currRow = currentSimRow ? { id: "current", name: "Current Simulation", isCurrent: true, ...currentSimRow } : null;
    const allRows = [baseRow, ...(currRow ? [currRow] : []), ...saved.map((h) => ({ ...h, isSaved: true }))];

    const COLS = [
        { label: "Name",       w: "min-w-[140px]" },
        { label: "Trades",     w: "" },
        { label: "Removed",    w: "" },
        { label: "Win Rate",   w: "" },
        { label: "Net R",      w: "" },
        { label: "Expectancy", w: "" },
        { label: "Max DD",     w: "" },
        { label: "Δ Net R",    w: "" },
        { label: "Δ WR",       w: "" },
        { label: "",           w: "w-[80px]" },
    ];

    return (
        <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[800px] font-mono text-[10.5px] border-separate border-spacing-0">
                <thead>
                    <tr>
                        {COLS.map((c) => (
                            <th key={c.label} className={`${c.w} px-3 py-1.5 text-left text-[9.5px] uppercase tracking-wider text-muted-lab border-b border-[hsl(var(--border-soft))] whitespace-nowrap`}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {allRows.map((row, i) => (
                        <tr key={row.id} className={i % 2 === 0 ? "bg-[hsl(var(--panel-2)/0.25)]" : ""}>
                            {/* Name */}
                            <td className="px-3 py-2 whitespace-nowrap">
                                {row.isSaved && editingName === row.id ? (
                                    <input
                                        className="bg-[hsl(var(--panel))] border border-[hsl(var(--accent-primary)/0.5)] text-white text-[10.5px] font-mono px-1.5 py-0.5 clip-bevel-sm outline-none w-[160px]"
                                        value={editNameValue}
                                        onChange={(e) => setEditNameValue(e.target.value)}
                                        onBlur={() => onCommitRename(row.id)}
                                        onKeyDown={(e) => e.key === "Enter" && onCommitRename(row.id)}
                                        autoFocus
                                    />
                                ) : (
                                    <span className={[
                                        "font-semibold",
                                        row.isBaseline  ? "text-[hsl(var(--accent-secondary))]"  : "",
                                        row.isCurrent   ? "text-[hsl(var(--accent-primary))]"    : "",
                                        row.isSaved     ? "text-white"                            : "",
                                    ].join(" ")}>{row.name}</span>
                                )}
                            </td>
                            {/* Stats */}
                            <td className="px-3 py-2 tabular-nums text-right">{isFiniteNum(row.trades) ? Math.round(row.trades) : "—"}</td>
                            <td className="px-3 py-2 tabular-nums text-right text-muted-lab">{isFiniteNum(row.removed) ? row.removed : "—"}</td>
                            <td className="px-3 py-2 tabular-nums text-right">{fmtPct(row.winRate)}</td>
                            <td className="px-3 py-2 tabular-nums text-right">
                                {isFiniteNum(row.netR) ? <ColoredR value={row.netR} /> : <span className="text-muted-lab">—</span>}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-right">{fmtExp(row.expectancy)}</td>
                            <td className="px-3 py-2 tabular-nums text-right text-[hsl(var(--danger))]">{fmtR(row.maxDD)}</td>
                            <td className="px-3 py-2 tabular-nums text-right">
                                <DeltaVal value={row.deltaNetR} isBaseline={row.isBaseline} suffix="R" />
                            </td>
                            <td className="px-3 py-2 tabular-nums text-right">
                                <DeltaVal value={row.deltaWR} isBaseline={row.isBaseline} suffix="%" />
                            </td>
                            {/* Actions */}
                            <td className="px-3 py-2">
                                {row.isSaved && (
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => onRestore(row)}       title="Restore filters" className="text-[hsl(var(--accent-primary))] hover:text-white transition-colors"><Layers className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => onStartRename(row)}   title="Rename"          className="text-muted-lab hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => onDelete(row.id)}     title="Delete"          className="text-muted-lab hover:text-[hsl(var(--danger))] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                )}
                                {row.isCurrent && <span className="text-[9.5px] uppercase tracking-wider text-[hsl(var(--accent-primary))]">Active</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {allRows.length === 1 && (
                <div className="text-[10.5px] font-mono text-muted-lab text-center py-4">
                    No active simulation. Configure filters above and click Save Simulation.
                </div>
            )}
        </div>
    );
}

function DeltaVal({ value, isBaseline, suffix }) {
    if (isBaseline)         return <span className="text-[hsl(var(--accent-secondary))]">BASE</span>;
    if (!isFiniteNum(value)) return <span className="text-muted-lab">—</span>;
    const n = num(value);
    const color = n >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    const formatted = suffix === "R" ? `${n.toFixed(1)}R` : `${n.toFixed(1)}%`;
    return <span className={`font-semibold tabular-nums ${color}`}>{n >= 0 ? "+" : ""}{formatted}</span>;
}

// ── Data helpers ────────────────────────────────────────────────────────────

function computeStats(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const wins   = list.filter((t) => rOf(t) > 0).length;
    const losses = list.filter((t) => rOf(t) < 0).length;
    const netR   = list.reduce((s, t) => s + rOf(t), 0);
    return {
        trades:     list.length,
        wins,
        losses,
        winRate:    list.length ? (wins / list.length) * 100 : 0,
        netR:       round2(netR),
        expectancy: list.length ? netR / list.length : 0,
        maxDD:      calcMaxDD(list),
    };
}

function applyFilters(trades, activeFilters, filterDefs) {
    if (!activeFilters.size) return trades;
    const active = filterDefs.filter((f) => activeFilters.has(f.key));
    return trades.filter((t) => !active.some((f) => f.matches(t)));
}

// ── Entry / Protection row builders ────────────────────────────────────────
// Mirror EntriesLab's flattenEntrySummary: handle variant nesting and all
// field name variants. Normalize every row to consistent camelCase fields so
// buildInsights can read them without guessing.

function buildExactEntryRows(run, _trades, activeVariant) {
    const variant = activeVariant || run?.primaryVariant || run?.summary?.executionMode || "single_position";
    const entryResults = run?.entryResults || {};
    const raw = entryResults.summary || run?.summary?.entry_results || {};
    const rows = flattenEntrySummary(raw, variant);
    return rows.map(normalizeRow);
}

function buildExactProtectionRows(run) {
    const protectionResults = run?.protectionResults || {};
    const raw = protectionResults.summary || run?.summary?.protection_results || {};
    const rows = flattenProtectionSummary(raw);
    return rows.map(normalizeRow);
}

// Mirrors EntriesLab's flattenEntrySummary exactly, including variant nesting.
function flattenEntrySummary(summary, activeVariant) {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap((item) => flattenEntrySummary(item, activeVariant));
    // Leaf row: has a mode discriminator field
    if (summary.mode || summary.entry_mode || summary.entry_model) {
        return [{ ...summary, mode: normalizeMode(summary.mode || summary.entry_mode || summary.entry_model), exact: true }];
    }
    const rows = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        // Variant nesting: only descend into the active variant bucket
        if (key === "single_position" || key === "allow_multi_position" || key === "one_per_direction") {
            if (key === activeVariant) rows.push(...flattenEntrySummary(value, activeVariant));
        } else {
            rows.push({ ...value, mode: normalizeMode(value.mode || value.entry_mode || value.entry_model || key), exact: true });
        }
    });
    return rows;
}

// Protection summary: same structure but uses protection_mode discriminator.
function flattenProtectionSummary(summary) {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap(flattenProtectionSummary);
    if (summary.mode || summary.protection_mode || summary.entry_mode) {
        return [{ ...summary, mode: normalizeMode(summary.mode || summary.protection_mode || summary.entry_mode), exact: true }];
    }
    const rows = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        rows.push({ ...value, mode: normalizeMode(value.mode || value.protection_mode || key), exact: true });
    });
    return rows;
}

// Normalize raw snake_case summary fields to camelCase so the rest of the
// page can read r.netR / r.winRate / r.expectancy / r.maxDD uniformly.
function normalizeRow(r) {
    const netR       = rowNum(r, "netR","net_r","net","net_r_total");
    const winRate    = normPct(rowNum(r, "winRate","win_rate","wr"));
    const expectancy = rowNum(r, "expectancy","avg_r","expectancy_r");
    const maxDD      = rowNum(r, "maxDD","max_dd","max_drawdown","max_drawdown_r");
    const fills      = rowNum(r, "fills","filled","filled_trades","fill_count");
    const eligible   = rowNum(r, "eligible","eligible_setups","setups","trades","trade_count","total_trades");
    const label      = r.label || r.entry_model || r.protection_mode || prettyMode(r.mode) || r.mode || "";
    return { ...r, netR, winRate, expectancy, maxDD, fills, eligible, label, exact: true };
}

// Read the first finite number from a set of key names on an object.
function rowNum(obj, ...keys) {
    for (const k of keys) {
        const v = obj?.[k];
        if (v != null && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
}
// Normalise a win-rate that might be a fraction (0–1) or percentage (0–100).
function normPct(v) {
    if (v == null || !Number.isFinite(v)) return null;
    return v > 1 ? v : v * 100;
}
function prettyMode(v) {
    return String(v || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildInsights(trades, entryRows, protRows) {
    const list = Array.isArray(trades) ? trades : [];

    // Entry — rows are already normalized by normalizeRow(), so r.netR etc. are reliable.
    const exactE    = entryRows.filter((r) => isFiniteNum(r.netR));
    const bestNetR  = exactE.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const bestExp   = exactE.filter((r) => isFiniteNum(r.expectancy)).reduce((b, r) => !b || r.expectancy > b.expectancy ? r : b, null);
    // lowestDD: maxDD is negative; higher value (closer to 0) = smaller drawdown.
    const lowestDD  = exactE.filter((r) => isFiniteNum(r.maxDD)).reduce((b, r) => !b || r.maxDD > b.maxDD ? r : b, null);
    const worstE    = exactE.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);

    // Protection — identify baseline row, then compute deltas for non-baseline rows.
    const exactP       = protRows.filter((r) => isFiniteNum(r.netR));
    const protBaseline = exactP.find((r) => normalizeMode(r.mode) === "baseline") || null;
    const baselineNetR = protBaseline ? protBaseline.netR : null;
    // Non-baseline rows get a delta vs baseline attached
    const nonBaseProt  = exactP
        .filter((r) => normalizeMode(r.mode) !== "baseline")
        .map((r) => ({ ...r, _delta: isFiniteNum(baselineNetR) ? round2(r.netR - baselineNetR) : null }));
    const bestProt  = exactP.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstProt = exactP.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    // "Biggest net R damage vs baseline": non-baseline row with the most negative delta
    const biggestDmg = nonBaseProt.filter((r) => isFiniteNum(r._delta)).reduce((b, r) => !b || r._delta < b._delta ? r : b, null);
    // Baseline vs best conclusion
    const bestNonBase = nonBaseProt.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const protConclusion = (() => {
        if (!bestNonBase || !isFiniteNum(baselineNetR)) return null;
        const delta = round2(bestNonBase.netR - baselineNetR);
        if (delta > 0) return `${bestNonBase.label || bestNonBase.mode} beats baseline by ${fmtR(delta)}`;
        if (delta < 0) return `No mode beats baseline (best delta ${fmtR(delta)})`;
        return `${bestNonBase.label || bestNonBase.mode} matches baseline`;
    })();

    // Timing
    const byDay     = groupBy(list, dayName);
    const dayStats  = Object.entries(byDay).map(([d, ts]) => ({ label: d, netR: sumR(ts) }));
    const bestDay   = dayStats.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstDay  = dayStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const byHour    = groupBy(list, (t) => hourOf(t));
    const hourStats = Object.entries(byHour).map(([h, ts]) => ({ label: `${h}:00 UTC`, netR: sumR(ts) }));
    const bestHour  = hourStats.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstHour = hourStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const bySess    = groupBy(list, (t) => sessionOf(t.entry));
    const sessStats = Object.entries(bySess).map(([s, ts]) => ({ label: s, netR: sumR(ts), count: ts.length }));
    const toxicSess = sessStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);

    // OB
    const byStruct  = groupBy(list, (t) => structureOf(t) || "Unknown");
    const strStats  = Object.entries(byStruct).map(([s, ts]) => ({ label: s.toUpperCase() || "Unknown", netR: sumR(ts) }));
    const bestStr   = strStats.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstStr  = strStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const byAge     = groupBy(list, ageBucketOf);
    const ageStats  = Object.entries(byAge).map(([a, ts]) => ({ label: a, netR: sumR(ts) }));
    const bestAge   = ageStats.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstAge  = ageStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const byOrig    = groupBy(list, originSessionOf);
    const origStats = Object.entries(byOrig).map(([o, ts]) => ({ label: o, netR: sumR(ts) }));
    const bestOrig  = origStats.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstOrig = origStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const byWidth   = groupBy(list, widthBucketOf);
    const widStats  = Object.entries(byWidth).map(([w, ts]) => ({ label: w, netR: sumR(ts) }));
    const bestWid   = widStats.reduce((b, r) => !b || r.netR > b.netR ? r : b, null);
    const worstWid  = widStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);

    // Breach
    const breached    = list.filter(isFullBreach);
    const bBySession  = groupBy(breached, (t) => sessionOf(t.entry));
    const bSessStats  = Object.entries(bBySession).map(([s, ts]) => ({ label: s, count: ts.length, netR: sumR(ts) }));
    const mostBrSess  = bSessStats.reduce((b, r) => !b || r.count > b.count ? r : b, null);
    const worstBrSess = bSessStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const bByHour     = groupBy(breached, (t) => hourOf(t));
    const bHourStats  = Object.entries(bByHour).map(([h, ts]) => ({ label: `${h}:00`, netR: sumR(ts) }));
    const worstBrHr   = bHourStats.reduce((b, r) => !b || r.netR < b.netR ? r : b, null);
    const brWinners   = breached.filter((t) => rOf(t) > 0).length;
    const brWinPct    = breached.length ? round1((brWinners / breached.length) * 100) : null;

    const hasData = list.length > 0;
    const hasBreach = breached.length > 0;
    const ins = (label, value, avail) => ({ label, value: value ?? "—", available: !!avail && value != null });

    return {
        entry: [
            ins("Best Net R",      bestNetR  ? `${bestNetR.label  || bestNetR.mode}  (${fmtR(bestNetR.netR)})`               : null, !!bestNetR),
            ins("Best Expectancy", bestExp   ? `${bestExp.label   || bestExp.mode}   (${fmtExp(bestExp.expectancy)})`         : null, !!bestExp),
            ins("Lowest DD",       lowestDD  ? `${lowestDD.label  || lowestDD.mode}  (${fmtR(lowestDD.maxDD)})`              : null, !!lowestDD),
            ins("Worst Net R",     worstE    ? `${worstE.label    || worstE.mode}    (${fmtR(worstE.netR)})`                  : null, !!worstE),
        ],
        protection: [
            ins("Best Mode",       bestProt  ? `${bestProt.label  || bestProt.mode}  (${fmtR(bestProt.netR)})`               : null, !!bestProt),
            ins("Worst Mode",      worstProt ? `${worstProt.label || worstProt.mode} (${fmtR(worstProt.netR)})`              : null, !!worstProt),
            ins("Baseline vs Best",protConclusion,                                                                               !!protConclusion),
            ins("Biggest Damage",  biggestDmg ? `${biggestDmg.label || biggestDmg.mode} (${fmtR(biggestDmg._delta)} vs base)`: null, !!biggestDmg),
        ],
        timing: [
            ins("Best Day",        bestDay   ? `${bestDay.label}  (${fmtR(bestDay.netR)})`   : null, hasData),
            ins("Worst Day",       worstDay  ? `${worstDay.label} (${fmtR(worstDay.netR)})`  : null, hasData),
            ins("Best Hour",       bestHour  ? `${bestHour.label} (${fmtR(bestHour.netR)})` : null, hasData),
            ins("Worst Hour",      worstHour ? `${worstHour.label}(${fmtR(worstHour.netR)})`  : null, hasData),
            ins("Toxic Session",   toxicSess ? `${toxicSess.label}(${fmtR(toxicSess.netR)})` : null, hasData),
        ],
        ob: [
            ins("Best Structure",  bestStr   ? `${bestStr.label}  (${fmtR(bestStr.netR)})`   : null, hasData),
            ins("Worst Structure", worstStr  ? `${worstStr.label} (${fmtR(worstStr.netR)})`  : null, hasData),
            ins("Best OB Age",     bestAge   ? `${bestAge.label}  (${fmtR(bestAge.netR)})`   : null, hasData),
            ins("Worst OB Age",    worstAge  ? `${worstAge.label} (${fmtR(worstAge.netR)})`  : null, hasData),
            ins("Best Origin",     bestOrig  ? `${bestOrig.label} (${fmtR(bestOrig.netR)})`  : null, hasData),
            ins("Worst Origin",    worstOrig ? `${worstOrig.label}(${fmtR(worstOrig.netR)})` : null, hasData),
            ins("Best Width",      bestWid   ? `${bestWid.label}  (${fmtR(bestWid.netR)})`   : null, hasData),
            ins("Worst Width",     worstWid  ? `${worstWid.label} (${fmtR(worstWid.netR)})`  : null, hasData),
        ],
        breach: [
            ins("Most Invalidated Sess.", mostBrSess  ? `${mostBrSess.label}  (n=${mostBrSess.count})`       : null, hasBreach),
            ins("Worst Loss Sess.",worstBrSess ? `${worstBrSess.label} (${fmtR(worstBrSess.netR)})`   : null, hasBreach),
            ins("Worst Loss Hour",   worstBrHr   ? `${worstBrHr.label}   (${fmtR(worstBrHr.netR)})`    : null, hasBreach),
            ins("Invalidated Winners %",  brWinPct != null ? `${brWinPct}%`                                  : null, hasBreach),
        ],
    };
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function rOf(t)             { return Number.isFinite(Number(t?.r)) ? Number(t.r) : 0; }
function sumR(arr)          { return arr.reduce((s, t) => s + rOf(t), 0); }

function sessionOf(value) {
    const d = parseDate(value);
    if (!d) return "Unknown";
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (h < 7)  return "Asia";
    if (h < 10) return "London";
    if (h < 12) return "London Lull";
    if (h < 17) return "New York";
    return "Outside";
}
function dayOf(t)           { const d = parseDate(t?.entry); return d ? d.getUTCDay() : -1; }
function hourOf(t)          { const d = parseDate(t?.entry); return d ? d.getUTCHours() : -1; }
function dayName(t)         { return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOf(t)] || "Unknown"; }
function structureOf(t)     { return String(t?.structure     || t?.ob_structure   || "").toLowerCase(); }
function directionOf(t)     { return String(t?.direction     || t?.side           || "").toLowerCase(); }
function biasOf(t)          { return String(t?.obBias        || t?.ob_bias        || "").toLowerCase(); }
function originSessionOf(t) { return t?.obOriginSession || t?.ob_origin_session   || "Unknown"; }
function isFullBreach(t)    { return t?.obFullyBreached === true || t?.ob_fully_breached === true; }
function isCloseBreach(t)   { return t?.obCloseBreached === true || t?.ob_close_breached === true; }

function ageBucketOf(t) {
    const age = Number(t?.obAgeAtFillDays || t?.ob_age_at_fill_days || t?.obAgeDays);
    if (!Number.isFinite(age)) return "Unknown";
    if (age < 3)  return "0–3d";
    if (age < 7)  return "3–7d";
    if (age < 14) return "7–14d";
    return "14d+";
}
function widthBucketOf(t) {
    const w = Number(t?.obWidthPips || t?.ob_width_pips);
    if (!Number.isFinite(w)) return "Unknown";
    if (w <= 5)  return "0–5p";
    if (w <= 10) return "5–10p";
    return ">10p";
}
function penBucketOf(t) {
    const p = Number(t?.obPenetrationPct || t?.ob_penetration_pct);
    if (!Number.isFinite(p)) return "Unknown";
    if (p <= 25) return "≤25%";
    if (p <= 50) return "25–50%";
    if (p <= 75) return "50–75%";
    return ">75%";
}
function calcMaxDD(trades) {
    let equity = 0, peak = 0, dd = 0;
    trades.forEach((t) => { equity += rOf(t); peak = Math.max(peak, equity); dd = Math.min(dd, equity - peak); });
    return round2(dd);
}
function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}
function groupBy(arr, fn) {
    const map = {};
    arr.forEach((item) => { const k = fn(item); if (!map[k]) map[k] = []; map[k].push(item); });
    return map;
}
function normalizeMode(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function variantLabel(v) {
    return { single_position: "Single position", allow_multi_position: "Allow multi", one_per_direction: "One per direction" }[v] || v || "N/A";
}
function modelLabel(options, mode) {
    return options.find((option) => normalizeMode(option.mode) === normalizeMode(mode))?.label || mode || "baseline";
}
function filterSummary(keys) {
    return (Array.from(keys || [])
        .map((key) => SIM_FILTERS.find((filter) => filter.key === key)?.label || key)
        .join(" · "));
}
function downloadCsv(filename, rows) {
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
function rowsToCsv(rows) {
    if (!rows.length) return "";
    const columns = Object.keys(rows[0]);
    return [
        columns.join(","),
        ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\n");
}
function csvCell(value) {
    if (value == null) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function csvTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function fileSafe(value) {
    return String(value || "run").replace(/[^a-z0-9_-]+/gi, "_");
}

function isFiniteNum(value) { return value != null && Number.isFinite(Number(value)); }
const num    = (v) => isFiniteNum(v) ? Number(v) : 0;
const round1 = (v) => Number(num(v).toFixed(1));
const round2 = (v) => Number(num(v).toFixed(2));
const round4 = (v) => Number(num(v).toFixed(4));
const fmtPct = (v) => isFiniteNum(v) ? `${round1(v).toFixed(1)}%` : "—";
const fmtR   = (v) => isFiniteNum(v) ? `${num(v) >= 0 ? "+" : ""}${round1(v).toFixed(1)}R` : "—";
const fmtExp = (v) => isFiniteNum(v) ? `${num(v) >= 0 ? "+" : ""}${num(v).toFixed(3)}R` : "—";
