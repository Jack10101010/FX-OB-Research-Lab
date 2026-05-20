import React, { useCallback, useRef, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { detectAndIngest } from "@/data/importer";
import { setDataset, resetDataset } from "@/data/store";
import { cn } from "@/lib/utils";

const KIND_LABELS = {
    summary: "Run Summary",
    config: "Config",
    trades: "Trades",
    order_blocks: "Order Blocks",
    rr_sweep: "RR Sweep",
    mismatches: "Parity Mismatches",
    unknown: "Unknown",
};

export function ImportZone() {
    const inputRef = useRef(null);
    const [files, setFiles] = useState([]);
    const [dragOver, setDragOver] = useState(false);

    const handleFiles = useCallback(async (list) => {
        const arr = Array.from(list);
        const results = [];
        for (const f of arr) {
            try {
                const text = await f.text();
                const { kind, patch } = detectAndIngest(f, text);
                if (patch && kind !== "config") {
                    setDataset(patch);
                }
                results.push({
                    name: f.name,
                    size: f.size,
                    kind,
                    ok: kind !== "unknown",
                    keys: patch ? Object.keys(patch).filter((k) => !k.startsWith("_")) : [],
                });
            } catch (e) {
                results.push({ name: f.name, size: f.size, kind: "error", ok: false, error: String(e.message || e) });
            }
        }
        setFiles((prev) => [...results, ...prev].slice(0, 24));
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
                    "relative cursor-pointer border border-dashed clip-bevel-sm px-6 py-8 text-center transition-colors",
                    dragOver
                        ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.07)]"
                        : "border-[hsl(var(--border-mid))] hover:border-[hsl(var(--accent-secondary))] bg-[hsl(var(--panel-2)/0.4)]",
                )}
            >
                <Upload className="w-6 h-6 mx-auto text-[hsl(var(--accent-primary))]" style={{ filter: "drop-shadow(0 0 8px hsl(var(--accent-primary)))" }} />
                <div className="font-display text-[14px] mt-2 text-white">Drop files here or click to browse</div>
                <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-lab mt-1">
                    summary.json · config.json · trades.csv · order_blocks.csv · rr_sweep.csv · mismatches.csv
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

            <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-lab">
                    Imported · {files.length} file{files.length === 1 ? "" : "s"}
                </div>
                <button
                    onClick={() => { resetDataset(); setFiles([]); }}
                    data-testid="import-reset"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] hover:border-[hsl(var(--danger))] hover:text-[hsl(var(--danger))] clip-bevel-sm"
                >
                    <Trash2 className="w-3 h-3" /> Reset to mock data
                </button>
            </div>

            {files.length > 0 && (
                <div className="space-y-1 max-h-[180px] overflow-y-auto scrollbar-thin">
                    {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]">
                            {f.ok
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))] shrink-0" />
                                : <AlertCircle  className="w-3.5 h-3.5 text-[hsl(var(--danger))] shrink-0" />}
                            <FileText className="w-3.5 h-3.5 text-muted-lab shrink-0" />
                            <div className="font-mono text-[11px] text-white truncate">{f.name}</div>
                            <div className="font-mono text-[10px] text-muted-lab ml-auto">{(f.size / 1024).toFixed(1)} KB</div>
                            <span className={cn(
                                "text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-[1px] clip-bevel-sm border",
                                f.ok
                                    ? "border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                    : "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]",
                            )}>
                                {KIND_LABELS[f.kind] || f.kind}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
