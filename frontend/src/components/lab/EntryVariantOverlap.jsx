// EntryVariantOverlap — DEEP-DELAY AUDIT panel (READ-ONLY).
//
// Compares two exported entry variants by which order blocks each one actually
// traded, answering: are deep delay arms (C20–C40) improving the SAME setups as
// shallow arms (C0/C6/C10), or selecting a different filtered subset? Pure read
// of bundle.entryResults.tradesByMode via buildEntryVariantOverlap. No backend,
// no writes, no charts.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { NeonSelect } from "@/components/lab/controls";
import { listEntryVariants, buildEntryVariantOverlap, entryVariantLabel } from "@/data/entryVariantOverlap";

const successTone = "text-[hsl(var(--success))]";
const dangerTone = "text-[hsl(var(--danger))]";
const cyan = "text-[hsl(var(--accent-secondary))]";
const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v > 0 ? successTone : v < 0 ? dangerTone : "text-[hsl(var(--text-2))]");
const pct = (p) => (p == null ? "—" : `${p}%`);
const shortOutcome = (c) => ({ WIN: "Win", LOSS: "Loss", BREAKEVEN: "BE", NEWS_FLATTEN_WIN: "NF+", NEWS_FLATTEN_LOSS: "NF−", NEWS_FLATTEN_FLAT: "NF0" }[c] || c || "—");
const obShort = (key) => String(key || "").replace(/^id:/, "").replace(/^k:/, "");
const MAX_ROWS = 20;

function Stat({ label, value, tone }) {
    return (
        <div>
            <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{label}</div>
            <div className={`text-[12px] font-num font-semibold ${tone || "text-[hsl(var(--text-1))]"}`}>{value}</div>
        </div>
    );
}

export default function EntryVariantOverlap({ bundle }) {
    const variants = useMemo(() => listEntryVariants(bundle), [bundle]);

    // Defaults: A = baseline (or shallowest), B = deepest available variant.
    const defaultA = useMemo(() => (variants.find((v) => v.key === "baseline") || variants[0])?.key, [variants]);
    const defaultB = useMemo(() => {
        const nonBase = variants.filter((v) => v.key !== "baseline");
        return (nonBase[nonBase.length - 1] || variants[variants.length - 1])?.key;
    }, [variants]);

    const [aKey, setAKey] = useState(defaultA);
    const [bKey, setBKey] = useState(defaultB);
    const a = aKey || defaultA;
    const b = bKey || defaultB;

    const data = useMemo(() => (a && b ? buildEntryVariantOverlap(bundle, a, b) : null), [bundle, a, b]);

    if (!variants.length) {
        return (
            <NeonPanel title="Entry Variant Overlap">
                <div className="text-[12px] font-ui text-muted-lab py-2">No exported entry variants in this run. Run with triggered-edge / penetration entry exports to compare arms.</div>
            </NeonPanel>
        );
    }

    const opts = variants.map((v) => ({ value: v.key, label: `${v.label} (${v.count})` }));
    const o = data?.overlap;
    const topImprove = data?.matchedRows.reduce((best, r) => (best == null || r.deltaR > best.deltaR ? r : best), null);
    const topWorsen = data?.matchedRows.reduce((worst, r) => (worst == null || r.deltaR < worst.deltaR ? r : worst), null);
    const shown = (data?.matchedRows || []).slice(0, MAX_ROWS);

    return (
        <NeonPanel title="Entry Variant Overlap">
            <p className="text-[10.5px] font-ui text-muted-lab italic mb-3">
                Do deep arms improve the same OBs, or select a different subset? Executed trades only — disabled / unfilled / cancelled rows excluded.
            </p>

            {/* Variant pickers */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <label className="flex items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Variant A</span>
                    <NeonSelect options={opts} value={a} onChange={setAKey} />
                </label>
                <span className="text-muted-lab text-[12px] font-ui">vs</span>
                <label className="flex items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Variant B</span>
                    <NeonSelect options={opts} value={b} onChange={setBKey} />
                </label>
            </div>

            {data && (
                <>
                    {/* Summary grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3 clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)] p-2.5">
                        <Stat label={`A · ${entryVariantLabel(a)}`} value={`${data.a.trades}T`} />
                        <Stat label="A Net R" value={fmtR(data.a.netR)} tone={rTone(data.a.netR)} />
                        <Stat label={`B · ${entryVariantLabel(b)}`} value={`${data.b.trades}T`} />
                        <Stat label="B Net R" value={fmtR(data.b.netR)} tone={rTone(data.b.netR)} />
                        <Stat label="Shared OBs" value={<span className={cyan}>{o.obCount}</span>} />
                        <Stat label="% of A · % of B" value={`${pct(o.pctOfA)} · ${pct(o.pctOfB)}`} />
                        <Stat label="Only A" value={`${data.onlyA.count} (${fmtR(data.onlyA.netR)})`} tone={rTone(data.onlyA.netR)} />
                        <Stat label="Only B" value={`${data.onlyB.count} (${fmtR(data.onlyB.netR)})`} tone={rTone(data.onlyB.netR)} />
                    </div>

                    {/* Shared-OB verdict line */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11.5px] font-ui">
                        <span className="text-muted-lab">Shared net: <span className={`font-num ${rTone(o.netRA)}`}>A {fmtR(o.netRA)}</span> → <span className={`font-num ${rTone(o.netRB)}`}>B {fmtR(o.netRB)}</span></span>
                        <span className="text-muted-lab">Improved: <span className={`font-num ${successTone}`}>{o.improvedCount}</span></span>
                        <span className="text-muted-lab">Worsened: <span className={`font-num ${dangerTone}`}>{o.worsenedCount}</span></span>
                        <span className="text-muted-lab">Same outcome: <span className="font-num text-[hsl(var(--text-1))]">{o.sameOutcomeCount}</span></span>
                    </div>

                    {/* Biggest movers */}
                    {(topImprove || topWorsen) && o.obCount > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {topImprove && topImprove.deltaR > 0 && (
                                <span className="clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border border-[hsl(var(--success)/0.5)] bg-[hsl(var(--success)/0.08)]">
                                    <span className="uppercase text-[9.5px] tracking-wider text-muted-lab mr-1.5">Biggest gain</span>
                                    <span className={cyan}>{obShort(topImprove.key)}</span> <span className={`font-num ${successTone}`}>{fmtR(topImprove.deltaR)}</span>
                                </span>
                            )}
                            {topWorsen && topWorsen.deltaR < 0 && (
                                <span className="clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.08)]">
                                    <span className="uppercase text-[9.5px] tracking-wider text-muted-lab mr-1.5">Biggest loss</span>
                                    <span className={cyan}>{obShort(topWorsen.key)}</span> <span className={`font-num ${dangerTone}`}>{fmtR(topWorsen.deltaR)}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {/* Matched table (top 20 by |ΔR|) */}
                    {o.obCount === 0 ? (
                        <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No shared order blocks between these variants — they trade different setups entirely.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px] border-collapse">
                                <thead>
                                    <tr className="text-left text-muted-lab font-ui border-b border-[hsl(var(--border-mid))]">
                                        <th className="py-1 pr-3 font-normal">OB</th>
                                        <th className="pr-3 font-normal">Session</th>
                                        <th className="pr-3 font-normal">Dir</th>
                                        <th className="pr-3 font-normal text-right">A</th>
                                        <th className="pr-3 font-normal text-right">B</th>
                                        <th className="font-normal text-right">ΔR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((r) => (
                                        <tr key={r.key} className="border-b border-[hsl(var(--border-mid)/0.4)]">
                                            <td className="py-1 pr-3 font-num text-[hsl(var(--accent-secondary))]">{obShort(r.key)}</td>
                                            <td className="pr-3 font-ui text-[hsl(var(--text-2))]">{r.session || "—"}</td>
                                            <td className="pr-3 font-ui text-[hsl(var(--text-2))]">{r.structure || ""} {r.direction || ""}</td>
                                            <td className={`pr-3 text-right font-num ${rTone(r.aR)}`}>{shortOutcome(r.aOutcome)} {fmtR(r.aR)}</td>
                                            <td className={`pr-3 text-right font-num ${rTone(r.bR)}`}>{shortOutcome(r.bOutcome)} {fmtR(r.bR)}</td>
                                            <td className={`text-right font-num font-semibold ${rTone(r.deltaR)}`}>{fmtR(r.deltaR)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {data.matchedRows.length > MAX_ROWS && (
                                <div className="text-[10px] font-ui text-muted-lab mt-1.5">Showing top {MAX_ROWS} of {data.matchedRows.length} shared OBs by |ΔR|.</div>
                            )}
                        </div>
                    )}
                </>
            )}
        </NeonPanel>
    );
}
