import React, { useState } from "react";
import { Pill }      from "@/components/lab/DataTable";
import { cn }        from "@/lib/utils";
import { isFiniteNumber, num, fmtMaybePct, fmtMaybeR } from "../analytics/entryFormatters";

const DECISION_META = {
    pending:   { label: "Pending",   tone: "default",  btnLabel: null },
    approved:  { label: "Approved",  tone: "success",  btnLabel: "✓ Approved" },
    rejected:  { label: "Rejected",  tone: "danger",   btnLabel: "✗ Rejected" },
    watchlist: { label: "Watchlist", tone: "warning",  btnLabel: "◎ Watchlist" },
};

function MetricPair({ label, value, tone }) {
    const color = tone === "success" ? "text-[hsl(var(--success))]"
                : tone === "danger"  ? "text-[hsl(var(--danger))]"
                : tone === "warning" ? "text-[hsl(var(--warning))]"
                : "text-white";
    return (
        <div className="flex flex-col items-center px-2.5 py-1.5 border border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.3)] rounded-[1px] min-w-[60px]">
            <span className={cn("text-[11.5px] font-num font-semibold tabular-nums", color)}>{value}</span>
            <span className="text-[8.5px] font-ui text-muted-lab uppercase tracking-wider mt-0.5">{label}</span>
        </div>
    );
}

export function PromotionCard({ candidate, onDecision, onRemove, onNoteChange }) {
    const [showNote, setShowNote]   = useState(false);
    const [noteText, setNoteText]   = useState(candidate.note || "");
    const dm   = DECISION_META[candidate.decision] || DECISION_META.pending;
    const row  = candidate.row || {};

    const netRTone   = isFiniteNumber(row.netR)        ? (num(row.netR) >= 0 ? "success" : "danger") : "default";
    const expTone    = isFiniteNumber(row.expectancy)   ? (num(row.expectancy) >= 0 ? "success" : "danger") : "default";
    const pfTone     = isFiniteNumber(row.profitFactor) ? (num(row.profitFactor) >= 1 ? "success" : "danger") : "default";
    const ddTone     = isFiniteNumber(row.maxDD)        ? (num(row.maxDD) >= -2 ? "success" : "warning") : "default";

    function saveNote() {
        onNoteChange(candidate.mode, noteText);
        setShowNote(false);
    }

    return (
        <div className={cn(
            "border rounded-[1px] bg-[hsl(var(--panel-2)/0.25)] transition-colors",
            candidate.decision === "approved"  ? "border-[hsl(var(--success)/0.35)]"
            : candidate.decision === "rejected"  ? "border-[hsl(var(--danger)/0.3)]"
            : candidate.decision === "watchlist" ? "border-[hsl(var(--warning)/0.3)]"
            : "border-[hsl(var(--border-soft)/0.5)]"
        )}>
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3 py-2">
                <Pill tone={dm.tone}>{dm.label.toUpperCase()}</Pill>
                <span className="flex-1 text-[11px] font-ui font-semibold text-white">{candidate.label}</span>
                <span className="text-[9px] font-ui text-muted-lab">{candidate.family}</span>
                {candidate.addedAt && (
                    <span className="text-[9px] font-ui text-muted-lab" title={candidate.addedAt}>
                        {new Date(candidate.addedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                )}
            </div>

            {/* Metrics */}
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                <MetricPair label="Net R"   value={isFiniteNumber(row.netR) ? `${num(row.netR) >= 0 ? "+" : ""}${num(row.netR).toFixed(1)}R` : "—"} tone={netRTone} />
                <MetricPair label="Exp"     value={isFiniteNumber(row.expectancy) ? `${num(row.expectancy) >= 0 ? "+" : ""}${num(row.expectancy).toFixed(3)}` : "—"} tone={expTone} />
                <MetricPair label="WR"      value={fmtMaybePct(row.winRate)} tone="default" />
                <MetricPair label="PF"      value={isFiniteNumber(row.profitFactor) ? num(row.profitFactor).toFixed(2) : "—"} tone={pfTone} />
                <MetricPair label="Fill %"  value={fmtMaybePct(row.fillPct)} tone="default" />
                <MetricPair label="Max DD"  value={fmtMaybeR(row.maxDD)} tone={ddTone} />
                <MetricPair label="Trades"  value={isFiniteNumber(row.trades) ? String(Math.round(num(row.trades))) : "—"} tone="default" />
                {isFiniteNumber(row.deltaVsBaseline) && (
                    <MetricPair label="Δ Base" value={`${num(row.deltaVsBaseline) >= 0 ? "+" : ""}${num(row.deltaVsBaseline).toFixed(1)}R`} tone={num(row.deltaVsBaseline) >= 0 ? "success" : "danger"} />
                )}
            </div>

            {/* Note */}
            {candidate.note && !showNote && (
                <div className="px-3 pb-2">
                    <p className="text-[9.5px] font-ui text-muted-lab italic">&ldquo;{candidate.note}&rdquo;</p>
                </div>
            )}
            {showNote && (
                <div className="px-3 pb-2 space-y-1.5">
                    <textarea
                        className="w-full px-2 py-1.5 text-[10px] font-ui bg-[hsl(var(--panel-2)/0.6)] border border-[hsl(var(--border-soft)/0.7)] text-white placeholder:text-muted-lab focus:outline-none rounded-[1px] resize-y min-h-[48px]"
                        placeholder="Add a promotion note or rationale…"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        rows={2}
                    />
                    <div className="flex gap-1.5">
                        <button type="button" onClick={saveNote}
                            className="px-2 py-0.5 text-[9px] font-ui border border-[hsl(var(--accent-primary)/0.5)] text-white hover:bg-[hsl(var(--accent-primary)/0.1)] rounded-[1px]"
                        >Save</button>
                        <button type="button" onClick={() => { setNoteText(candidate.note || ""); setShowNote(false); }}
                            className="px-2 py-0.5 text-[9px] font-ui border border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white rounded-[1px]"
                        >Cancel</button>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5 px-3 pb-2.5 border-t border-[hsl(var(--border-soft)/0.2)] pt-2">
                {["approved", "watchlist", "rejected"].map(d => (
                    <button key={d} type="button"
                        onClick={() => onDecision(candidate.mode, candidate.decision === d ? "pending" : d)}
                        className={cn(
                            "px-2 py-0.5 text-[9px] font-ui uppercase tracking-wider border rounded-[1px] transition-colors",
                            candidate.decision === d
                                ? d === "approved"  ? "border-[hsl(var(--success)/0.5)]  bg-[hsl(var(--success)/0.12)]  text-[hsl(var(--success))]"
                                : d === "rejected"  ? "border-[hsl(var(--danger)/0.5)]   bg-[hsl(var(--danger)/0.12)]   text-[hsl(var(--danger))]"
                                :                     "border-[hsl(var(--warning)/0.5)]  bg-[hsl(var(--warning)/0.12)]  text-[hsl(var(--warning))]"
                                : "border-[hsl(var(--border-soft)/0.4)] text-muted-lab hover:text-white"
                        )}
                    >
                        {d}
                    </button>
                ))}
                <button type="button" onClick={() => setShowNote(s => !s)}
                    className="ml-1 text-[9px] font-ui text-muted-lab hover:text-white transition-colors"
                >
                    {showNote ? "cancel note" : candidate.note ? "edit note" : "+ note"}
                </button>
                <button type="button" onClick={() => onRemove(candidate.mode)}
                    className="ml-auto text-[9px] font-ui text-[hsl(var(--danger)/0.5)] hover:text-[hsl(var(--danger))] transition-colors"
                >
                    remove
                </button>
            </div>
        </div>
    );
}
