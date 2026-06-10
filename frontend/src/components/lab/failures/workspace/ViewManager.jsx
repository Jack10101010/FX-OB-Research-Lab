// ── ViewManager.jsx ──────────────────────────────────────────────────────────
// Phase 2: CSV export, saved forensic views, false loser candidate detection.

import React, { useState, useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { NeonInput } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { Download, Save, Trash2, Eye, Info, AlertTriangle } from "lucide-react";
import { buildCSV, downloadCSV } from "../shared/failuresExporter";
import { archetypeLabel } from "../shared/failuresRegistry";
import { computeFalseLosserCandidates } from "../shared/failuresAnalytics";

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

// ── False loser signal type labels ────────────────────────────────────────────

const SIGNAL_TYPE_LABELS = {
    fast_stopout:         "Fast Stopout",
    low_conf_timing:      "Low-Conf Timing",
    marginal_breach:      "Marginal Breach",
    close_conf_no_breach: "Stop Too Tight",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ViewManager({ losers = [], allLosers = [], filters = {} }) {
    const source = losers.length ? losers : allLosers;

    const [views, setViews]         = useState(loadViews);
    const [viewName, setViewName]   = useState("");
    const [exportMsg, setExportMsg] = useState(null);

    // False loser candidates — computed from full (unfiltered) loser set
    const falseLosserCandidates = useMemo(
        () => computeFalseLosserCandidates(allLosers),
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

            {/* ── False Loser Candidates ────────────────────────────────────── */}
            <NeonPanel title="False Loser Detection" tone="secondary">
                <div className="p-4 space-y-3">
                    {/* Honesty banner */}
                    <div className="border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.04)] clip-bevel p-2.5 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                        <p className="text-[10px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            <span className="text-[hsl(var(--warning))] font-semibold">Candidates only — not confirmed false losers.</span>{" "}
                            Definitive detection requires post-stop continuation data
                            (<code className="text-[hsl(var(--accent-secondary))]">mae</code>,{" "}
                            <code className="text-[hsl(var(--accent-secondary))]">mfe</code>,{" "}
                            <code className="text-[hsl(var(--accent-secondary))]">post_stop_mfe_r</code>).
                            These trades have signals consistent with false losers using currently-available fields only.
                        </p>
                    </div>

                    {falseLosserCandidates.length === 0 ? (
                        <p className="text-[10px] font-ui text-muted-lab">
                            No candidates detected in current data. Candidates require: fast stopout (&lt;10 min),
                            marginal OB breach (100–110%), or close-confirmed without full breach.
                        </p>
                    ) : (
                        <>
                            <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                                {falseLosserCandidates.length} trade{falseLosserCandidates.length !== 1 ? "s" : ""} with false loser signals
                                detected from {allLosers.length} total losses.
                            </p>

                            <div className="space-y-2 max-h-72 overflow-y-auto">
                                {falseLosserCandidates.map((c, i) => (
                                    <div
                                        key={c.id ?? i}
                                        className="px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))] space-y-1.5"
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <AlertTriangle className="w-3 h-3 text-[hsl(var(--warning))] shrink-0" />
                                            <span className="text-[10.5px] font-code text-white">
                                                {c.entry ? String(c.entry).slice(0, 16) : "—"}
                                            </span>
                                            <Pill tone={c.direction === "long" ? "success" : c.direction === "short" ? "danger" : "muted"}>
                                                {c.direction.toUpperCase()}
                                            </Pill>
                                            <Pill tone="muted">{c.session}</Pill>
                                            <span className="text-[10px] font-num text-[hsl(var(--danger))]">{c.r.toFixed(2)}R</span>
                                            {c.severity != null && (
                                                <span className="text-[9px] font-num text-muted-lab">sev {c.severity.toFixed(1)}</span>
                                            )}
                                        </div>

                                        <div className="space-y-0.5">
                                            {c.signals.map((sig, si) => (
                                                <div key={si} className="flex items-start gap-1.5 text-[9.5px] font-ui">
                                                    <span className="text-[hsl(var(--accent-secondary))] shrink-0">
                                                        {SIGNAL_TYPE_LABELS[sig.type] ?? sig.type}:
                                                    </span>
                                                    <span className="text-[hsl(var(--text-2))]">{sig.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </NeonPanel>
        </div>
    );
}
