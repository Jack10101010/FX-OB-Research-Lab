import React from "react";
import { useRunVariant } from "@/data/useRunVariant";
import { collectAllEntryKeys, buildAvailableOptions, buildCanonicalKey } from "@/data/tradeUniverse";

// ── EntryVariantSelector ──────────────────────────────────────────────────────
// Searchable dropdown over the DISCOVERED entry-variant universe (collectAllEntryKeys
// → buildAvailableOptions), labelled the SAME way RunDetail's result-view selector
// labels them ("Triggered Edge 25% · Arm C40"). Picking an option drives the shared
// store scenario via useRunVariant().setResultView, so the existing lazy loader
// (useLazyEntryVariant) fetches ONLY that one variant's CSV on demand — never all
// variants — and RunDetail + Entries Lab agree on the selection. A status chip shows
// summary-only / loading / loaded so trade panels never fabricate 0R KPIs.

const BASELINE_OPT = { key: "baseline", label: "Baseline · Edge Touch", family: "baseline", threshold: null, fillMode: null };

function buildVariantOptions(runData, trades) {
    const allKeys = collectAllEntryKeys(runData || {}, trades || []);
    const { availableFamilies = [], thresholdsByFamily = {}, fillModesByFamilyThreshold = {} } =
        buildAvailableOptions(allKeys);
    const views = [];
    availableFamilies.filter((f) => f !== "baseline").forEach((family) => {
        const familyLabel = family === "triggered_edge" ? "Triggered Edge"
            : family === "penetration" ? "Penetration"
            : String(family).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        (thresholdsByFamily[family] || []).forEach((threshold) => {
            const threshStr = threshold != null ? ` ${threshold}%` : "";
            if (family === "penetration") {
                views.push({ key: `${family}_${threshold}_nofill`, label: `${familyLabel}${threshStr}`, family, threshold, fillMode: null });
                return;
            }
            const ftKey = `${family}::${threshold}`;
            (fillModesByFamilyThreshold[ftKey] || []).forEach((fillMode) => {
                const dm = typeof fillMode === "string" ? fillMode.match(/^d(\d+)$/) : null;
                const fillStr = fillMode === "same" ? " · Arm C0"
                    : fillMode === "next" ? " · Arm C1"
                    : fillMode === "both" ? " · Both"
                    : dm ? ` · Arm C${dm[1]}` : "";
                views.push({
                    key: `${family}_${threshold}_${fillMode ?? "both"}`,
                    label: `${familyLabel}${threshStr}${fillStr}`,
                    family, threshold,
                    fillMode: fillMode === "both" ? null : (fillMode || null),
                });
            });
        });
    });
    return views;
}

export function EntryVariantSelector({ runId, runData, trades, setSelectedModelKey, addVariantKey }) {
    const { resultView, setResultView, universe, lazyStatus } = useRunVariant(runId);
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const ref = React.useRef(null);

    const variantOptions = React.useMemo(() => buildVariantOptions(runData, trades), [runData, trades]);
    const options = React.useMemo(() => [BASELINE_OPT, ...variantOptions], [variantOptions]);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Baseline-only run → nothing to choose; keep the page baseline-only (render nothing).
    if (variantOptions.length === 0) return null;

    const selectedKey = (resultView?.family && resultView.family !== "baseline")
        ? `${resultView.family}_${resultView.threshold}_${resultView.fillMode ?? "both"}`
        : "baseline";
    const selectedOpt = options.find((o) => o.key === selectedKey) || BASELINE_OPT;

    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

    const onPick = (opt) => {
        // Drive the SHARED store scenario — this is what RunDetail uses, and it triggers
        // the existing single-CSV lazy load for this one variant.
        setResultView({ family: opt.family, threshold: opt.threshold, fillMode: opt.fillMode });
        const canonicalKey = opt.family === "baseline"
            ? null
            : buildCanonicalKey(opt.family, opt.threshold, opt.fillMode);
        if (typeof setSelectedModelKey === "function") {
            setSelectedModelKey(canonicalKey);
        }
        // PHASE 2 — pin the picked variant to the comparison set (de-duped in the hook).
        if (canonicalKey && typeof addVariantKey === "function") {
            addVariantKey(canonicalKey);
        }
        setOpen(false);
        setQuery("");
    };

    // Status chip — reflects whether the SELECTED variant's rows are resident yet.
    const rowsResident = Array.isArray(universe?.trades) && universe.trades.length > 0;
    const status = selectedOpt.key === "baseline" ? { label: "Rows loaded", cls: "border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))]" }
        : lazyStatus?.loading ? { label: "Loading rows…", cls: "border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]" }
        : lazyStatus?.error ? { label: "Load error", cls: "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]" }
        : rowsResident ? { label: "Rows loaded", cls: "border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))]" }
        : { label: "Summary only", cls: "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]" };

    return (
        <div className="mt-2 flex items-center gap-2 px-6" ref={ref}>
            <span className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2))]">Entry variant</span>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((p) => !p)}
                    className="clip-bevel-sm border border-[hsl(var(--border-mid))] px-3 py-1.5 text-[11px] font-ui text-[hsl(var(--text-1))] hover:border-[hsl(var(--accent-secondary))] inline-flex items-center gap-2 min-w-[240px] justify-between transition-colors"
                >
                    <span className="truncate">{selectedOpt.label}</span>
                    <span className="text-[hsl(var(--text-2))]">▾</span>
                </button>
                {open && (
                    <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[320px] max-h-[360px] overflow-auto bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] shadow-[0_4px_24px_hsl(0,0%,0%,0.35)] clip-bevel-sm p-2">
                        <input
                            autoFocus
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search ${variantOptions.length} variants…`}
                            className="w-full mb-2 px-2 py-1.5 text-[11px] font-ui bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-soft))] text-[hsl(var(--text-1))] outline-none focus:border-[hsl(var(--accent-secondary))]"
                        />
                        <div className="flex flex-col">
                            {filtered.length === 0 && (
                                <div className="px-2 py-1.5 text-[11px] text-[hsl(var(--text-2))]">No match</div>
                            )}
                            {filtered.map((o) => (
                                <button
                                    key={o.key}
                                    type="button"
                                    onClick={() => onPick(o)}
                                    className={`text-left px-2 py-1.5 text-[11px] font-ui rounded-[3px] transition-colors ${
                                        o.key === selectedKey
                                            ? "bg-[hsl(var(--accent-secondary)/0.18)] text-[hsl(var(--accent-secondary))]"
                                            : "text-[hsl(var(--text-1))] hover:bg-[hsl(var(--panel-2)/0.5)]"
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <span className={`clip-bevel-sm border px-2 py-1 text-[10px] font-ui ${status.cls}`}>{status.label}</span>
        </div>
    );
}

export default EntryVariantSelector;
