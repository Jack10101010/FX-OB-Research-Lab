// ── ViewManager.jsx ──────────────────────────────────────────────────────────
// Views & Export: CSV export + saved forensic views. False-loser research now
// lives on the Overview tab (ConfirmedFalseLosersPanel) — V5 Phase 2B IA move;
// this tab keeps only a one-line pointer to it.

import React, { useState, useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { NeonInput } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { Download, Save, Trash2, Eye, Search } from "lucide-react";
import { buildCSV, downloadCSV } from "../shared/failuresExporter";
import { archetypeLabel } from "../shared/failuresRegistry";
import { buildConfirmedFalseLosers } from "../shared/failuresAnalytics";

// ── localStorage helpers (with migration safety) ──────────────────────────────

const VIEWS_KEY        = "fxob_failures_saved_views_v1";
const LEGACY_VIEWS_KEY = "fxob_failures_views_v1";

function loadViews() {
    try {
        const raw    = localStorage.getItem(VIEWS_KEY) || localStorage.getItem(LEGACY_VIEWS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        // Sanitise: reject any entry that isn't a valid view object
        return parsed.filter(v => v && typeof v === "object" && typeof v.id === "string");
    } catch {
        return [];
    }
}

function persistViews(views) {
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ViewManager({ losers = [], allLosers = [], filters = {} }) {
    const source = losers.length ? losers : allLosers;

    const [views, setViews]         = useState(loadViews);
    const [viewName, setViewName]   = useState("");
    const [exportMsg, setExportMsg] = useState(null);

    // Lightweight summary only — the full false-loser surface moved to Overview.
    const falseLosers = useMemo(
        () => buildConfirmedFalseLosers(allLosers),
        [allLosers],
    );

    // ── CSV export ────────────────────────────────────────────────────────────

    const handleExport = () => {
        if (!source.length) return;
        const csv      = buildCSV(source, null); // null → full forensic preset
        const filename = `failures_lab_${new Date().toISOString().slice(0, 10)}.csv`;
        downloadCSV(filename, csv);
        setExportMsg(`✓ Exported ${source.length} trades → ${filename}`);
        setTimeout(() => setExportMsg(null), 4000);
    };

    // ── Saved views ───────────────────────────────────────────────────────────

    const handleSave = () => {
        const name    = viewName.trim() || `View ${views.length + 1}`;
        const newView = {
            id:         `view_${Date.now()}`,
            name,
            filters:    filters || {},
            savedAt:    new Date().toISOString(),
            tradeCount: source.length,
        };
        const updated = [newView, ...views];
        setViews(updated);
        persistViews(updated);
        setViewName("");
    };

    const handleDelete = (id) => {
        const updated = views.filter(v => v.id !== id);
        setViews(updated);
        persistViews(updated);
    };

    // ── Active filter summary ─────────────────────────────────────────────────

    const activePills = [
        ...(filters?.sessions   ?? []).map(s => ({ key: `s:${s}`, label: `Session: ${s}` })),
        ...(filters?.directions ?? []).map(d => ({ key: `d:${d}`, label: `Dir: ${d}` })),
        ...(filters?.archetypes ?? []).map(a => ({ key: `a:${a}`, label: archetypeLabel(a) })),
        ...(filters?.severityMin != null ? [{ key: "sev", label: `Sev ≥ ${filters.severityMin}` }] : []),
    ];

    return (
        <div className="p-6 space-y-4">
            {/* ── CSV Export ─────────────────────────────────────────────────── */}
            <NeonPanel title="CSV Export">
                <div className="p-4 space-y-3">
                    <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        Exports the current cohort ({source.length} failing trades) using the Full Forensic preset —
                        all available columns including archetype, severity score, and severity breakdown.
                        Apply cohort filters before exporting to narrow to specific patterns.
                    </p>

                    {activePills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[9.5px] font-ui text-muted-lab">Active filters:</span>
                            {activePills.map(p => <Pill key={p.key} tone="primary">{p.label}</Pill>)}
                        </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={!source.length}
                            className="flex items-center gap-2 px-4 py-2 text-[11px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.08)] clip-bevel-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export {source.length} Losers → CSV
                        </button>
                        {exportMsg && (
                            <span className="text-[10px] font-ui text-[hsl(var(--success))]">{exportMsg}</span>
                        )}
                    </div>
                </div>
            </NeonPanel>

            {/* ── Saved forensic views ──────────────────────────────────────── */}
            <NeonPanel title="Saved Forensic Views">
                <div className="p-4 space-y-4">
                    <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        Snapshot the current cohort filter state as a named view. Views persist across
                        page refreshes and record which filters were active and how many trades were in scope.
                    </p>

                    {/* Save control */}
                    <div className="flex items-center gap-2">
                        <NeonInput
                            placeholder="View name (optional)…"
                            value={viewName}
                            onChange={e => setViewName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSave()}
                            className="flex-1 max-w-xs"
                        />
                        <button
                            type="button"
                            onClick={handleSave}
                            className="flex items-center gap-1.5 px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.4)] text-[hsl(var(--accent-secondary))] hover:border-[hsl(var(--accent-secondary))] hover:bg-[hsl(var(--accent-secondary)/0.08)] clip-bevel-sm transition-colors"
                        >
                            <Save className="w-3 h-3" />
                            Save View
                        </button>
                    </div>

                    {/* Saved view list */}
                    {views.length === 0 ? (
                        <p className="text-[10px] font-ui text-muted-lab">No saved views yet — apply filters and save a cohort above.</p>
                    ) : (
                        <div className="space-y-2">
                            {views.map(view => (
                                <div
                                    key={view.id}
                                    className="flex items-start gap-3 px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))]"
                                >
                                    <Eye className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="text-[11.5px] font-medium text-white truncate">{view.name}</div>
                                        <div className="text-[9.5px] font-ui text-muted-lab">
                                            {view.tradeCount} trades · saved {String(view.savedAt).slice(0, 10)}
                                        </div>
                                        {(() => {
                                            const pills = [
                                                ...(view.filters?.sessions   ?? []).map(s => ({ key: `s:${s}`, label: `Session: ${s}` })),
                                                ...(view.filters?.directions ?? []).map(d => ({ key: `d:${d}`, label: `Dir: ${d}` })),
                                                ...(view.filters?.archetypes ?? []).map(a => ({ key: `a:${a}`, label: archetypeLabel(a) })),
                                            ];
                                            return pills.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {pills.map(p => <Pill key={p.key} tone="muted">{p.label}</Pill>)}
                                                </div>
                                            ) : (
                                                <div className="text-[9.5px] font-ui text-muted-lab">No filters (all losers)</div>
                                            );
                                        })()}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(view.id)}
                                        className="p-1 text-muted-lab hover:text-[hsl(var(--danger))] transition-colors shrink-0"
                                        aria-label="Delete view"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </NeonPanel>

            {/* ── False-loser research moved to Overview (V5 Phase 2B IA) ────── */}
            <NeonPanel title="False Loser Detection" tone="secondary">
                <div className="p-4 flex items-start gap-3">
                    <Search className="w-4 h-4 text-[hsl(var(--accent-secondary))] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-[11px] font-ui text-[hsl(var(--text))]">
                            False-loser research now lives on the <span className="text-[hsl(var(--accent-secondary))] font-semibold">Overview</span> tab.
                        </p>
                        <p className="text-[10px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            {falseLosers.available
                                ? <>{falseLosers.counts.confirmed} confirmed false loser{falseLosers.counts.confirmed !== 1 ? "s" : ""} of {allLosers.length} losses
                                    (over {falseLosers.horizon ?? "—"} bars post-stop). See the Confirmed False Losers panel on Overview for the full breakdown.</>
                                : <>No post-stop continuation export on this run — candidate signals are shown on the Overview tab. Re-export with{" "}
                                    <code className="text-[hsl(var(--accent-secondary))]">post_stop_mfe_r</code> to confirm.</>}
                        </p>
                    </div>
                </div>
            </NeonPanel>
        </div>
    );
}
