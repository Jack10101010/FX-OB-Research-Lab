import React, { useCallback, useRef, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Trash2, Layers, X, ImageOff } from "lucide-react";
import { ingestRunBundle } from "@/data/importer";
import { addRunBundle, removeRunBundle, clearAllRuns, useDataset } from "@/data/store";
import { cn } from "@/lib/utils";

const KIND_LABEL = {
    config: "config.json",
    summary: "summary.json",
    candles: "candles.csv",
    order_blocks: "order_blocks.csv",
    trades_single_position: "trades_single",
    trades_allow_multi_position: "trades_multi",
    trades_one_per_direction: "trades_per_dir",
    trades_unknown: "trades.csv",
    json_unknown: "json",
    unknown: "unknown",
};

export function ImportZone() {
    const inputRef = useRef(null);
    const ds = useDataset();
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState([]); // recent ingest results
    const [error, setError] = useState(null);

    const importedRuns = Object.values(ds.runs)
        .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""));

    const handleFiles = useCallback(async (list) => {
        if (!list?.length) return;
        setBusy(true); setError(null);
        try {
            const result = await ingestRunBundle(list);
            if (!result.ok) {
                setError({
                    title: "Bundle incomplete",
                    missing: result.missing,
                    recognized: result.recognized,
                    unrecognized: result.unrecognized,
                });
                setBusy(false);
                return;
            }
            addRunBundle(result.bundle);
            setHistory((h) => [{
                ok: true,
                runId: result.bundle.id,
                trades: result.bundle.trades.length,
                obs: result.bundle.orderBlocks.length,
                candles: result.bundle.hasCandles ? result.bundle.candles.length : 0,
                variant: result.bundle.primaryVariant,
                hasCandles: result.bundle.hasCandles,
                recognized: result.recognized,
            }, ...h].slice(0, 12));
        } catch (e) {
            setError({ title: "Ingest failed", message: String(e.message || e) });
        } finally {
            setBusy(false);
        }
    }, []);

    return (
        <div className="space-y-3">
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
                data-testid="import-dropzone"
                className={cn(
                    "relative cursor-pointer border border-dashed clip-bevel-sm px-6 py-7 text-center transition-colors",
                    dragOver
                        ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.07)]"
                        : "border-[hsl(var(--border-mid))] hover:border-[hsl(var(--accent-secondary))] bg-[hsl(var(--panel-2)/0.4)]",
                    busy && "opacity-60 pointer-events-none",
                )}
            >
                <Upload className="w-6 h-6 mx-auto text-[hsl(var(--accent-primary))]" style={{ filter: "drop-shadow(0 0 8px hsl(var(--accent-primary)))" }} />
                <div className="font-display text-[14px] mt-2 text-white">
                    {busy ? "Importing…" : "Drop a full run bundle here or click to browse"}
                </div>
                <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-lab mt-1">
                    REQUIRED · config.json · summary.json · order_blocks.csv · trades_*.csv
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-lab mt-0.5">
                    OPTIONAL · candles.csv · alternative trades variants
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".json,.csv"
                    className="hidden"
                    data-testid="import-file-input"
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {/* Persist warning (size budget) */}
            {ds.persistWarning && (
                <div className="flex items-start gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm" data-testid="import-persist-warning">
                    <ImageOff className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    <span className="text-[11px] font-mono text-[hsl(var(--warning))]">{ds.persistWarning}</span>
                </div>
            )}

            {/* Validation failure card */}
            {error && (
                <div className="px-3 py-2 border border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.08)] clip-bevel-sm" data-testid="import-error">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--danger))]" />
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--danger))]">{error.title}</span>
                        <button onClick={() => setError(null)} className="ml-auto text-[hsl(var(--danger))] hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {error.missing && (
                        <div className="mt-1.5 text-[11px] font-mono text-[hsl(var(--text-2))]">
                            Missing required: <span className="text-[hsl(var(--danger))]">{error.missing.join(", ")}</span>
                        </div>
                    )}
                    {error.message && <div className="mt-1.5 text-[11px] font-mono text-[hsl(var(--text-2))]">{error.message}</div>}
                    {error.recognized?.length > 0 && (
                        <div className="mt-1 text-[10.5px] font-mono text-muted-lab">
                            Recognized: {error.recognized.map((r) => KIND_LABEL[r.kind] || r.kind).join(" · ")}
                        </div>
                    )}
                </div>
            )}

            {/* Recent import history */}
            {history.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-lab">Recent imports</div>
                    {history.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]" data-testid="import-history-item">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                            <span className="font-mono text-[11px] text-white">{h.runId}</span>
                            <span className="font-mono text-[10px] text-muted-lab">
                                · {h.trades} trades · {h.obs} OBs {h.hasCandles ? `· ${h.candles} candles` : "· no candles"}
                            </span>
                            <span className="ml-auto inline-flex items-center text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-[1px] border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] clip-bevel-sm">
                                {h.variant}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Persisted runs list */}
            <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-lab">
                        Imported runs ({importedRuns.length})
                    </div>
                    {importedRuns.length > 0 && (
                        <button
                            data-testid="import-clear-all"
                            onClick={() => { if (window.confirm("Remove all imported runs?")) clearAllRuns(); }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] hover:border-[hsl(var(--danger))] hover:text-[hsl(var(--danger))] clip-bevel-sm"
                        >
                            <Trash2 className="w-3 h-3" /> Clear all
                        </button>
                    )}
                </div>
                {importedRuns.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] font-mono text-muted-lab border border-dashed border-[hsl(var(--border-soft))] clip-bevel-sm">
                        No imported runs yet — drop a bundle above to begin.
                    </div>
                ) : (
                    <div className="space-y-1 max-h-[260px] overflow-y-auto scrollbar-thin">
                        {importedRuns.map((r) => {
                            const isActive = r.id === ds.activeRunId;
                            return (
                                <div key={r.id} className={cn(
                                    "flex items-center gap-2 px-2.5 py-1.5 border clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]",
                                    isActive ? "border-[hsl(var(--accent-primary)/0.6)]" : "border-[hsl(var(--border-soft))]",
                                )}>
                                    <Layers className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))] shrink-0" />
                                    <span className="font-mono text-[11px] text-white truncate">{r.id}</span>
                                    <span className="font-mono text-[10px] text-muted-lab whitespace-nowrap">
                                        · {r.summary.trades} trades · RR {r.summary.rr}
                                    </span>
                                    {r.candlesDroppedForStorage && (
                                        <span className="font-mono text-[9.5px] text-[hsl(var(--warning))] uppercase tracking-wider">candles · session-only</span>
                                    )}
                                    {isActive && (
                                        <span className="inline-flex items-center text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-[1px] border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] clip-bevel-sm">
                                            Active
                                        </span>
                                    )}
                                    <button
                                        onClick={() => removeRunBundle(r.id)}
                                        data-testid={`import-remove-${r.id}`}
                                        className="ml-auto text-muted-lab hover:text-[hsl(var(--danger))]"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
