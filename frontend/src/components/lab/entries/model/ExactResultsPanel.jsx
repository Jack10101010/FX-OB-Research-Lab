import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { ColoredR, Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { ENTRY_FAMILIES, sampleConfidence, PROFILE_KEYS } from "../analytics/entryRegistry";
import {
    fmtMaybePct, fmtMaybeR, fmtMaybeExp, fmtCount, isFiniteNumber, num,
} from "../analytics/entryFormatters";
import { entryResultsToCsv, downloadCsv } from "../analytics/entryAnalytics";
import { useLocalStorageState } from "../shared/useEntryWorkspace";

// ── Phase 3: Profile badge labels ────────────────────────────────────────────
// Shown on each row when multiple metricsProfiles are present in the loaded dataset.
// Helps users mentally model why fill%, trigger%, and funnel metrics differ.
const PROFILE_BADGE_LABEL = {
    [PROFILE_KEYS.STANDARD]:       "UNIVERSAL",
    [PROFILE_KEYS.PENETRATION]:    "PENETRATION",
    [PROFILE_KEYS.TRIGGERED_EDGE]: "LIFECYCLE",
    [PROFILE_KEYS.CONFIRMATION]:   "CONFIRMATION",
};

function DeltaCell({ row }) {
    if (row.isBaseline) return <span className="font-ui text-[hsl(var(--accent-secondary))]">BASELINE</span>;
    if (!isFiniteNumber(row.deltaVsBaseline)) return <span className="text-muted-lab">—</span>;
    const pos = row.deltaVsBaseline >= 0;
    return (
        <span className={cn("font-num font-semibold tabular-nums", pos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
            {pos ? "+" : ""}{num(row.deltaVsBaseline).toFixed(1)}R
        </span>
    );
}

// V2 CHANGE: RowTags now uses family-aware highlight flags.
// isBestNetRInFamily / isBestExpectancyInFamily / isLowestDDInFamily /
// isBestFillPctInFamily / isBestPFInFamily replace the previous global flags.
//
// BEST FILL is now only shown when isBestFillPctInFamily is set — meaning
// the model is the best fill-rate within its own family. Cross-family fill%
// comparison is intentionally removed (fill% denominators are incompatible).
//
// isBestNetR backward-compat alias is still set by markHighlights() for row
// background highlighting below — do not remove that usage.

// Phase 3: showProfileBadge is true when multiple metricsProfiles are loaded.
// The profile badge is intentionally rendered as a plain <span> (not a Pill)
// so it reads as metadata rather than a quality signal.
function RowTags({ row, showProfileBadge }) {
    const tags = [];
    if (row.isBaseline)                tags.push(<Pill key="bl"   tone="secondary">REF MODEL</Pill>);
    // V2: use per-family flags. isBestNetRInFamily = best Net R within family.
    if (row.isBestNetRInFamily)        tags.push(<Pill key="nr"   tone="success">BEST R</Pill>);
    if (row.isBestExpectancyInFamily)  tags.push(<Pill key="exp"  tone="primary">BEST EXP</Pill>);
    if (row.isLowestDDInFamily)        tags.push(<Pill key="dd"   tone="muted">LOW DD</Pill>);
    // BEST FILL is within-family only — fill% denominators differ across families.
    if (row.isBestFillPctInFamily)     tags.push(<Pill key="fill" tone="secondary">BEST FILL</Pill>);
    if (row.isBestPFInFamily)          tags.push(<Pill key="pf"   tone="success">BEST PF</Pill>);
    if (!row.exact && !row.isBaseline) tags.push(<Pill key="pend" tone="warning">PENDING</Pill>);
    const conf = sampleConfidence(row.fills);
    if (!row.isBaseline && row.exact && conf.tone !== "success") {
        tags.push(<Pill key="conf" tone={conf.tone}>{conf.label}</Pill>);
    }
    // Phase 3: metrics-profile badge — shown when multiple families are loaded.
    // Placed last so it doesn't compete visually with functional quality tags.
    if (showProfileBadge && row.metricsProfile) {
        const badgeLabel = PROFILE_BADGE_LABEL[row.metricsProfile];
        if (badgeLabel) {
            tags.push(
                <span key="profile"
                    className="text-[7.5px] font-ui px-1 py-px border border-[hsl(var(--border-soft)/0.45)] text-muted-lab uppercase tracking-[0.12em] opacity-70">
                    {badgeLabel}
                </span>
            );
        }
    }
    return tags.length ? (
        <div className="flex max-w-[210px] flex-wrap items-center gap-1 leading-none [&_.row-chip]:whitespace-nowrap">
            {tags}
        </div>
    ) : <span className="text-muted-lab">—</span>;
}

const SORT_STORAGE_KEY = "fxob_entries_workspace_exact_sort_v1";
const FAMILY_STORAGE_KEY = "fxob_entries_workspace_family_groups_v1";

function formatMinutes(value) {
    if (!isFiniteNumber(value)) return "—";
    const minutes = num(value);
    if (minutes < 60) return `${minutes.toFixed(minutes % 1 ? 1 : 0)}m`;
    const hours = minutes / 60;
    return `${hours.toFixed(hours % 1 ? 1 : 0)}h`;
}

function gridTemplate(colVis, hasTrigEdge = false) {
    return "minmax(190px,2fr) minmax(190px,1.35fr) 64px 62px 62px 66px 58px 58px 62px 72px 72px 72px 78px"
        + (colVis.profitFactor ? " 54px" : "")
        + (colVis.avgMAE ? " 62px" : "")
        + (colVis.avgMFE ? " 62px" : "")
        + (colVis.avgTimeToTP ? " 86px" : "")
        + (colVis.avgTimeToSL ? " 86px" : "")
        // triggered-edge columns: Trig%, Fill/Trig, T→Fill, Same/Next
        + (colVis.triggeredEdge && hasTrigEdge ? " 62px 68px 72px 64px" : "");
}

// Phase 3: isFirst suppresses the top border on the first family section.
// showProfileBadge flows down to ResultRow → RowTags and also controls whether
// the fill description sub-line is shown in the header.
function FamilySection({ family, rows, colVis, hasTrigEdge, open, onToggle, isFirst, showProfileBadge, selectedModelKey, setSelectedModelKey }) {
    const familyMeta    = ENTRY_FAMILIES.find(f => f.key === family);
    const familyColor   = familyMeta?.color || "hsl(var(--text-2))";
    const fillDesc      = showProfileBadge ? familyMeta?.fillDescription : null;

    return (
        <div className={cn(!isFirst && "mt-2 border-t border-[hsl(var(--border-soft)/0.45)] pt-1.5")}>
            <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[hsl(var(--panel-2)/0.4)] transition-colors select-none"
                onClick={onToggle}
            >
                {open ? <ChevronDown className="w-3 h-3 text-muted-lab" /> : <ChevronRight className="w-3 h-3 text-muted-lab" />}
                <span className="text-[9.5px] font-ui font-semibold uppercase tracking-[0.14em]" style={{ color: familyColor }}>
                    {family}
                </span>
                <span className="text-[9px] font-ui text-muted-lab">
                    {rows.length} model{rows.length !== 1 ? "s" : ""}
                </span>
                {fillDesc && (
                    <span className="text-[9px] font-ui text-muted-lab opacity-55 truncate">
                        · {fillDesc}
                    </span>
                )}
            </div>
            {open && rows.map(row => (
                <ResultRow key={row.mode} row={row} colVis={colVis} hasTrigEdge={hasTrigEdge} showProfileBadge={showProfileBadge} selectedModelKey={selectedModelKey} setSelectedModelKey={setSelectedModelKey} />
            ))}
        </div>
    );
}

function ResultRow({ row, colVis, hasTrigEdge, showProfileBadge, selectedModelKey, setSelectedModelKey }) {
    // V2: use metricsProfile / requiresLifecycleFunnel — not a mode string check.
    const isTrigRow = row.metricsProfile === PROFILE_KEYS.TRIGGERED_EDGE || row.requiresLifecycleFunnel === true;
    const isSelected = !row.isBaseline && row.mode === selectedModelKey;
    const handleClick = () => {
        if (!row.isBaseline && setSelectedModelKey) {
            setSelectedModelKey(isSelected ? null : row.mode);
        }
    };
    return (
        <div
            className={cn(
                "grid min-h-[38px] items-center gap-2 border-b border-[hsl(var(--border-soft)/0.3)] px-3 py-2 text-[12px] font-display tabular-nums transition-colors",
                !row.isBaseline && "cursor-pointer",
                // Selected state takes visual priority over best-R highlight.
                isSelected
                    ? "bg-[hsl(var(--accent-primary)/0.12)] border-[hsl(var(--accent-primary)/0.5)] shadow-[inset_3px_0_0_hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.18)]"
                    : row.isBestNetRInFamily && !row.isBaseline
                        ? "bg-[hsl(var(--success)/0.08)] border-[hsl(var(--success)/0.4)] shadow-[inset_3px_0_0_hsl(var(--success))] hover:bg-[hsl(var(--panel-2)/0.5)]"
                        : row.isBaseline
                            ? "bg-[hsl(var(--accent-secondary)/0.08)] border-dashed border-[hsl(var(--accent-secondary)/0.45)] shadow-[inset_3px_0_0_hsl(var(--accent-secondary)/0.6)]"
                            : "hover:bg-[hsl(var(--panel-2)/0.5)]",
            )}
            style={{ gridTemplateColumns: gridTemplate(colVis, hasTrigEdge) }}
            onClick={handleClick}
        >
            <div className={cn(
                "truncate pr-1 font-medium",
                row.isBaseline
                    ? "text-[hsl(var(--accent-secondary))] font-semibold"
                    : isSelected
                        ? "text-[hsl(var(--accent-primary))] font-semibold"
                        : row.isBestNetRInFamily
                            ? "text-[hsl(var(--success))] font-semibold"
                            : "text-white",
            )}>
                {row.label}
            </div>
            <div className="min-w-0"><RowTags row={row} showProfileBadge={showProfileBadge} /></div>
            <div className="text-right text-[hsl(var(--text-2))]">{row.threshold || "—"}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.eligible ?? row.trades)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.fills)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybePct(row.fillPct)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.wins)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtCount(row.losses)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybePct(row.winRate)}</div>
            <div className="text-right">{row.netR == null ? <span className="text-muted-lab">—</span> : <ColoredR value={row.netR} />}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeExp(row.expectancy)}</div>
            <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.maxDD)}</div>
            <div className="text-right"><DeltaCell row={row} /></div>
            {colVis.profitFactor && <div className="text-right text-[hsl(var(--text-2))]">{isFiniteNumber(row.profitFactor) ? num(row.profitFactor).toFixed(1) : "—"}</div>}
            {colVis.avgMAE && <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.avgMAE)}</div>}
            {colVis.avgMFE && <div className="text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.avgMFE)}</div>}
            {colVis.avgTimeToTP && <div className="text-right text-[hsl(var(--text-2))]">{formatMinutes(row.avgTimeToTP)}</div>}
            {colVis.avgTimeToSL && <div className="text-right text-[hsl(var(--text-2))]">{formatMinutes(row.avgTimeToSL)}</div>}
            {/* triggered-edge funnel columns — blank dash for non-triggered-edge rows */}
            {colVis.triggeredEdge && hasTrigEdge && (
                <>
                    <div className="text-right text-[hsl(var(--text-2))]">
                        {isTrigRow ? fmtMaybePct(row.triggerRate) : <span className="text-muted-lab">—</span>}
                    </div>
                    <div className="text-right text-[hsl(var(--text-2))]">
                        {isTrigRow ? fmtMaybePct(row.fillAfterTriggerRate) : <span className="text-muted-lab">—</span>}
                    </div>
                    <div className="text-right text-[hsl(var(--text-2))]">
                        {isTrigRow ? formatMinutes(row.avgTriggerToEntry) : <span className="text-muted-lab">—</span>}
                    </div>
                    <div className="text-right text-[hsl(var(--text-2))]">
                        {isTrigRow && (row.sameCandleCount != null || row.nextCandleCount != null)
                            ? `${row.sameCandleCount ?? "—"}/${row.nextCandleCount ?? "—"}`
                            : <span className="text-muted-lab">—</span>}
                    </div>
                </>
            )}
        </div>
    );
}

function TableHeader({ colVis, hasTrigEdge, sortState, onSort }) {
    const headers = [
        { key: "label", label: "Model", align: "left" },
        { key: "tags", label: "Tags", align: "left", sortable: false },
        { key: "threshold", label: "Thresh" },
        { key: "eligible", label: "Setups" },
        { key: "fills", label: "Filled" },
        { key: "fillPct", label: "Fill%" },
        { key: "wins", label: "Wins" },
        { key: "losses", label: "Loss" },
        { key: "winRate", label: "WR" },
        { key: "netR", label: "Net R" },
        { key: "expectancy", label: "Exp" },
        { key: "maxDD", label: "Max DD" },
        { key: "deltaVsBaseline", label: "Δ Base" },
        ...(colVis.profitFactor ? [{ key: "profitFactor", label: "PF" }] : []),
        ...(colVis.avgMAE ? [{ key: "avgMAE", label: "MAE" }] : []),
        ...(colVis.avgMFE ? [{ key: "avgMFE", label: "MFE" }] : []),
        ...(colVis.avgTimeToTP ? [{ key: "avgTimeToTP", label: "Avg TP Time" }] : []),
        ...(colVis.avgTimeToSL ? [{ key: "avgTimeToSL", label: "Avg SL Time" }] : []),
        ...(colVis.triggeredEdge && hasTrigEdge ? [
            { key: "triggerRate",          label: "Trig%" },
            { key: "fillAfterTriggerRate", label: "Fill/Trig" },
            { key: "avgTriggerToEntry",    label: "T→Fill" },
            { key: "sameCandleCount",      label: "Same/Next", sortable: false },
        ] : []),
    ];
    return (
        <div className="sticky top-0 z-10 grid gap-2 border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-3 backdrop-blur"
            style={{ display: "grid", gridTemplateColumns: gridTemplate(colVis, hasTrigEdge) }}
        >
            {headers.map((h, i) => (
                <button
                    key={h.key}
                    type="button"
                    disabled={h.sortable === false}
                    onClick={() => onSort(h.key)}
                    className={cn(
                        "py-2 text-[10.5px] font-display font-semibold uppercase leading-tight tracking-[0.06em] text-title-lab disabled:cursor-default",
                        i > 1 ? "text-right" : "text-left",
                        h.sortable === false ? "" : "hover:text-white transition-colors",
                    )}
                >
                    {h.label}{sortState.key === h.key ? (sortState.dir === "asc" ? " ↑" : " ↓") : ""}
                </button>
            ))}
        </div>
    );
}

export function ExactResultsPanel({ exactRows, colVis, setColVis, selectedModelKey, setSelectedModelKey }) {
    const [sortState, setSortState] = useLocalStorageState(SORT_STORAGE_KEY, { key: "netR", dir: "desc" });
    const [familyOpen, setFamilyOpen] = useLocalStorageState(FAMILY_STORAGE_KEY, {});
    const hasExact    = exactRows.some(r => r.exact && !r.isBaseline);
    // V2: use metricsProfile / requiresLifecycleFunnel — not a mode string check.
    const hasTrigEdge = exactRows.some(r =>
        r.exact && (r.metricsProfile === PROFILE_KEYS.TRIGGERED_EDGE || r.requiresLifecycleFunnel === true)
    );

    const sortedRows = useMemo(() => sortRows(exactRows, sortState), [exactRows, sortState]);
    const families = [...new Set(sortedRows.map(r => r.family).filter(Boolean))];
    // Phase 3: multi-family awareness — controls disclaimer banner, section dividers,
    // fill-description sub-lines, and per-row profile badges.
    const hasMultipleFamilies = families.length > 1;

    const extCols = [
        { key: "profitFactor",  label: "Profit Factor" },
        { key: "avgMAE",        label: "Avg MAE" },
        { key: "avgMFE",        label: "Avg MFE" },
        { key: "avgTimeToTP",   label: "Time to TP" },
        { key: "avgTimeToSL",   label: "Time to SL" },
        ...(hasTrigEdge ? [{ key: "triggeredEdge", label: "Triggered Edge" }] : []),
    ];

    const handleExport = () => {
        const csv = entryResultsToCsv(exactRows);
        const ts  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        downloadCsv(`entries_results_${ts}.csv`, csv);
    };

    const handleSort = (key) => {
        setSortState(prev => ({
            key,
            dir: prev?.key === key && prev?.dir === "desc" ? "asc" : "desc",
        }));
    };

    const toggleFamily = (family) => {
        setFamilyOpen(prev => ({ ...prev, [family]: prev?.[family] === false }));
    };

    return (
        <NeonPanel
            title="Exact Entry Simulation Results"
            className="xl:col-span-3"
            action={
                <div className="flex items-center gap-2 flex-wrap">
                    {extCols.map(col => (
                        <button key={col.key} type="button"
                            onClick={() => setColVis(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                            className={cn(
                                "px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors",
                                colVis[col.key]
                                    ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-white"
                                    : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white",
                            )}
                        >
                            {col.label}
                        </button>
                    ))}
                    <button type="button" onClick={handleExport} disabled={!exactRows.length}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-40 clip-bevel-sm"
                    >
                        <Download className="w-3 h-3" />
                        Export CSV
                    </button>
                    <Pill tone={hasExact ? "success" : "warning"}>{hasExact ? "EXACT DATA" : "BASELINE ONLY"}</Pill>
                </div>
            }
        >
            {/* Phase 3: Cross-family disclaimer — only when multiple families are loaded.
                Not a warning; a factual note that fill metrics use different denominators. */}
            {hasMultipleFamilies && (
                <div className="mb-3 flex items-start gap-2.5 px-3 py-2.5 border border-[hsl(var(--warning)/0.18)] bg-[hsl(var(--warning)/0.035)]">
                    <span className="shrink-0 text-[8.5px] font-ui uppercase tracking-[0.18em] text-[hsl(var(--warning)/0.55)] mt-0.5">
                        NOTE
                    </span>
                    <p className="text-[10px] font-ui leading-relaxed text-[hsl(var(--text-2))]">
                        Cross-family metrics are not directly equivalent. Fill&nbsp;%, trigger&nbsp;%, and funnel efficiency use different denominators across entry families.
                    </p>
                </div>
            )}

            <div className="overflow-x-auto scrollbar-thin">
                <div className="min-w-[1280px]">
                    <TableHeader colVis={colVis} hasTrigEdge={hasTrigEdge} sortState={sortState} onSort={handleSort} />
                    {families.map((family, idx) => (
                        <FamilySection
                            key={family}
                            family={family}
                            rows={sortedRows.filter(r => r.family === family)}
                            colVis={colVis}
                            hasTrigEdge={hasTrigEdge}
                            open={familyOpen[family] !== false}
                            onToggle={() => toggleFamily(family)}
                            isFirst={idx === 0}
                            showProfileBadge={hasMultipleFamilies}
                            selectedModelKey={selectedModelKey}
                            setSelectedModelKey={setSelectedModelKey}
                        />
                    ))}
                </div>
            </div>
        </NeonPanel>
    );
}

function sortValue(row, key) {
    if (key === "label") return String(row.label || row.mode || "");
    if (key === "family") return String(row.family || "");
    if (key === "threshold") return String(row.threshold || "");
    if (key === "eligible") return row.eligible ?? row.trades;
    return row[key];
}

function sortRows(rows, sortState) {
    const key = sortState?.key || "netR";
    const dir = sortState?.dir === "asc" ? 1 : -1;
    return [...(rows || [])].sort((a, b) => {
        const av = sortValue(a, key);
        const bv = sortValue(b, key);
        const aNum = isFiniteNumber(av);
        const bNum = isFiniteNumber(bv);
        if (aNum && bNum) return (num(av) - num(bv)) * dir;
        if (aNum) return -1;
        if (bNum) return 1;
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
}
