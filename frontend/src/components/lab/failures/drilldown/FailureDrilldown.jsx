// ── FailureDrilldown.jsx ─────────────────────────────────────────────────────
// Phase 1: Searchable failure trade table with per-trade detail panel.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, Pill, ColoredR } from "@/components/lab/DataTable";
import { NeonInput } from "@/components/lab/controls";
import { ChevronRight, ChevronDown } from "lucide-react";
import { buildDrilldownRows } from "../shared/failuresAnalytics";
import { archetypeLabel, archetypeTone } from "../shared/failuresRegistry";
import { severityLabel, severityTone, confidenceLabel, confidenceTone, fmtDuration } from "../shared/failuresFormatters";
import { durationMinutes } from "../shared/failuresUtils";

const DRILLDOWN_UI_KEY = "fxob_failures_drilldown_ui_v1";

function loadDrilldownUi() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DRILLDOWN_UI_KEY) || "{}");
        return {
            search: typeof parsed.search === "string" ? parsed.search : "",
            selectedId: typeof parsed.selectedId === "string" || typeof parsed.selectedId === "number" ? parsed.selectedId : null,
        };
    } catch {
        return { search: "", selectedId: null };
    }
}

function saveDrilldownUi(value) {
    try { localStorage.setItem(DRILLDOWN_UI_KEY, JSON.stringify(value)); } catch {}
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ row }) {
    if (!row) return null;
    const trade     = row._trade;
    const durMins   = durationMinutes(trade);
    const matchedCriteria = trade?.matchedCriteria ?? [];
    const sevComp   = trade?.severityComponents ?? null;
    const manualTag = trade?._manualArchetype ?? null;
    const manualNote= trade?._manualNote ?? null;

    return (
        <div className="mx-6 mb-4 border border-[hsl(var(--border-soft))] clip-bevel bg-[hsl(var(--panel-2))] p-4 space-y-3">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-muted-lab">
                Trade {String(row.id).slice(0, 16)} — Detail
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                    <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Archetype</div>
                    <Pill tone={archetypeTone(row.archetype)}>{archetypeLabel(row.archetype)}</Pill>
                </div>
                <div>
                    <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Classifier Confidence</div>
                    <Pill tone={confidenceTone(row.confidence)}>{confidenceLabel(row.confidence)}</Pill>
                </div>
                <div>
                    <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Severity</div>
                    {row.severity != null
                        ? <Pill tone={severityTone(row.severity)}>{severityLabel(row.severity)} · {row.severity.toFixed(1)}</Pill>
                        : <Pill tone="muted">—</Pill>
                    }
                </div>
                <div>
                    <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Duration</div>
                    <div className="text-[11px] font-mono text-white">{fmtDuration(durMins)}</div>
                </div>
                {matchedCriteria.length > 0 && (
                    <div className="col-span-2">
                        <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Matched Criteria</div>
                        <div className="text-[10.5px] font-mono text-[hsl(var(--text-2))]">{matchedCriteria.join(", ")}</div>
                    </div>
                )}
                {manualTag && (
                    <div>
                        <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Manual Tag</div>
                        <Pill tone="secondary">{manualTag}</Pill>
                    </div>
                )}
            </div>

            {/* Severity breakdown */}
            {sevComp && (
                <div>
                    <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1.5">Severity Components</div>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(sevComp).map(([k, v]) => (
                            <span key={k} className="text-[9.5px] font-mono px-2 py-0.5 border border-[hsl(var(--border-soft))] clip-bevel-sm text-[hsl(var(--text-2))] bg-[hsl(var(--panel))]">
                                {k}: <span className="text-white font-semibold">{v}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual note */}
            {manualNote && (
                <div>
                    <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider mb-1">Note</div>
                    <p className="text-[10.5px] font-mono text-[hsl(var(--text-2))] leading-relaxed">{manualNote}</p>
                </div>
            )}
        </div>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function FailureDrilldown({ losers = [], allLosers = [] }) {
    const source = losers.length ? losers : allLosers;
    const [ui, setUi] = useState(loadDrilldownUi);
    const search = ui.search;
    const selectedId = ui.selectedId;
    const setSearch = (value) => setUi((prev) => {
        const next = { ...prev, search: value };
        saveDrilldownUi(next);
        return next;
    });
    const setSelectedId = (patch) => setUi((prev) => {
        const next = { ...prev, selectedId: typeof patch === "function" ? patch(prev.selectedId) : patch };
        saveDrilldownUi(next);
        return next;
    });

    const rows = useMemo(() => buildDrilldownRows(source), [source]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r =>
            String(r.id).toLowerCase().includes(q) ||
            r.direction.includes(q) ||
            r.session.toLowerCase().includes(q) ||
            archetypeLabel(r.archetype).toLowerCase().includes(q) ||
            r.datetime.includes(q),
        );
    }, [rows, search]);

    const selectedRow = selectedId != null ? filtered.find(r => r.id === selectedId) ?? null : null;

    const columns = [
        {
            key: "id", label: "ID", sortable: false,
            render: r => <span className="font-mono text-[9.5px] text-muted-lab">{String(r.id).slice(0, 12)}</span>,
        },
        { key: "datetime", label: "Date / Time", sortable: false },
        {
            key: "direction", label: "Dir", sortable: false,
            render: r => (
                <Pill tone={r.direction === "long" ? "success" : r.direction === "short" ? "danger" : "muted"}>
                    {r.direction.toUpperCase()}
                </Pill>
            ),
        },
        {
            key: "session", label: "Session", sortable: false,
            render: r => <Pill tone="muted">{r.session}</Pill>,
        },
        {
            key: "r", label: "R", sortable: true,
            render: r => <ColoredR value={r.r} />,
            sortValue: r => r.r,
        },
        {
            key: "archetype", label: "Archetype", sortable: false,
            render: r => <Pill tone={archetypeTone(r.archetype)}>{archetypeLabel(r.archetype)}</Pill>,
        },
        {
            key: "severity", label: "Sev", sortable: true,
            render: r => r.severity != null
                ? <Pill tone={severityTone(r.severity)}>{r.severity.toFixed(1)}</Pill>
                : <Pill tone="muted">—</Pill>,
            sortValue: r => r.severity ?? -1,
        },
        {
            key: "_expand", label: "", sortable: false,
            render: r => (
                <button
                    type="button"
                    onClick={e => {
                        e.stopPropagation();
                        setSelectedId(prev => prev === r.id ? null : r.id);
                    }}
                    className="p-0.5 text-[hsl(var(--text-2))] hover:text-white transition-colors"
                    aria-label="Toggle detail"
                >
                    {selectedId === r.id
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />
                    }
                </button>
            ),
        },
    ];

    return (
        <div className="p-6 space-y-4">
            {/* Search bar */}
            <div className="flex items-center gap-3">
                <NeonInput
                    placeholder="Search by ID, direction, session, archetype, date…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 max-w-md"
                />
                <span className="text-[10px] font-mono text-muted-lab shrink-0">
                    {filtered.length} / {rows.length} trades
                </span>
            </div>

            {/* Trade table */}
            <NeonPanel title="Failure Trade Table">
                <DataTable
                    columns={columns}
                    rows={filtered}
                    rowKey="id"
                    onRowClick={row => setSelectedId(prev => prev === row.id ? null : row.id)}
                    selectedKey={selectedId}
                    defaultSortKey="severity"
                    defaultSortDir="desc"
                    maxHeight="500px"
                    compact
                />
            </NeonPanel>

            {/* Detail panel */}
            {selectedRow && <DetailPanel row={selectedRow} />}
        </div>
    );
}
