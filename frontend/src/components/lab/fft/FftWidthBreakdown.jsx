// FftWidthBreakdown — OB-width slice of the paired FFT data (canonical + fine).
// FFT-IA Phase 1: copied VERBATIM from RunDetail's inline width-breakdown
// components. Display-only; all math lives in fftDisplay.aggregateFftWidth.
import React from "react";
import {
    aggregateFftWidth,
    fftWidthCanonKey,
    fftWidthFineKey,
    fftWidthVerdict,
    fftWidthTone,
    fftSignR,
    FFT_WIDTH_CANON,
    FFT_WIDTH_FINE,
} from "./fftDisplay";

function FftWidthRow({ row, total }) {
    const v = fftWidthVerdict(row);
    const labelCell = total
        ? <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">Total</span>
        : (<span className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-ui text-[hsl(var(--text-1))]">{row.label}</span>
                <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">{row.range}</span>
           </span>);
    const num = "text-[12.5px] font-num tabular-nums text-right text-[hsl(var(--text-1))]";
    return (
        <>
            <div className="py-1.5">{labelCell}</div>
            <div className={num}>{row.cancels}</div>
            <div className={num}>{row.high}</div>
            <div className={`${num} text-[hsl(var(--danger))]`}>{row.winsRemoved}</div>
            <div className={`${num} text-[hsl(var(--success))]`}>{row.lossesAvoided}</div>
            <div className={`text-[12.5px] font-num font-semibold tabular-nums text-right ${fftWidthTone(row.highImpact > 0.05 ? "success" : row.highImpact < -0.05 ? "danger" : "muted")}`}>{fftSignR(row.highImpact, 2)}</div>
            <div className={`text-[12.5px] font-num tabular-nums text-right ${fftWidthTone(row.strategyDelta > 0.05 ? "success" : row.strategyDelta < -0.05 ? "danger" : "muted")}`}>{fftSignR(row.strategyDelta, 1)}</div>
            <div className="text-right">{total ? null : <span className={`text-[10.5px] font-ui font-medium ${fftWidthTone(v.tone)}`}>{v.text}</span>}</div>
        </>
    );
}

function FftWidthTable({ rows }) {
    const t = rows.reduce((a, r) => ({
        cancels: a.cancels + r.cancels, high: a.high + r.high, winsRemoved: a.winsRemoved + r.winsRemoved,
        lossesAvoided: a.lossesAvoided + r.lossesAvoided, highImpact: a.highImpact + r.highImpact, strategyDelta: a.strategyDelta + r.strategyDelta,
        onR: 0, offR: 0,
    }), { cancels: 0, high: 0, winsRemoved: 0, lossesAvoided: 0, highImpact: 0, strategyDelta: 0, onR: 0, offR: 0 });
    const hdr = "text-[10px] font-ui font-medium uppercase tracking-[0.03em] text-[hsl(var(--text-2))]";
    return (
        <div className="grid grid-cols-[1.4fr_repeat(6,_minmax(0,1fr))_0.9fr] gap-x-3 items-baseline">
            <div className={hdr}>OB Width</div>
            <div className={`${hdr} text-right`}>Cancels</div>
            <div className={`${hdr} text-right`}>HIGH</div>
            <div className={`${hdr} text-right`}>Win Rem</div>
            <div className={`${hdr} text-right`}>Loss Avo</div>
            <div className={`${hdr} text-right`}>Impact</div>
            <div className={`${hdr} text-right`}>Strat Δ</div>
            <div className={`${hdr} text-right`}>Verdict</div>
            <div className="col-span-8 h-px bg-[hsl(var(--border-soft))] my-0.5" />
            {rows.map((r) => <FftWidthRow key={r.key} row={r} />)}
            <div className="col-span-8 h-px bg-[hsl(var(--border-soft))] my-0.5" />
            <FftWidthRow row={t} total />
        </div>
    );
}

export function FftWidthBreakdown({ pairs, onPerf, offPerf }) {
    const [showFine, setShowFine] = React.useState(false);
    const canon = React.useMemo(() => aggregateFftWidth(pairs, onPerf, offPerf, fftWidthCanonKey, FFT_WIDTH_CANON), [pairs, onPerf, offPerf]);
    const fine  = React.useMemo(() => aggregateFftWidth(pairs, onPerf, offPerf, fftWidthFineKey, FFT_WIDTH_FINE),  [pairs, onPerf, offPerf]);
    const totalCancels = canon.reduce((s, r) => s + r.cancels, 0);
    if (!totalCancels) return null;
    return (
        <div className="rounded-[6px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-4 py-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))]">FFT Width Breakdown</h3>
                <button
                    type="button"
                    onClick={() => setShowFine((s) => !s)}
                    className="text-[11px] font-ui font-medium text-[hsl(var(--accent-primary))] hover:underline"
                >
                    {showFine ? "Hide fine detail" : "Show fine detail"}
                </button>
            </div>
            <p className="mt-1 text-[11px] font-ui text-[hsl(var(--text-2))] leading-snug">
                Width buckets test whether FFT behaves differently on small vs large order blocks. Impact here is high-confidence attributed impact unless explicitly labelled strategy delta.
            </p>
            <div className="mt-1.5 mb-3 text-[10.5px] font-ui text-[hsl(var(--warning))] leading-snug">
                Single run / single symbol-timeframe. Treat width thresholds as hypotheses until reproduced.
            </div>
            <FftWidthTable rows={canon} />
            {showFine && (
                <div className="mt-3 pt-3 border-t border-[hsl(var(--border-soft)/0.6)]">
                    <div className="text-[10.5px] font-ui font-medium uppercase tracking-[0.03em] text-[hsl(var(--text-2))] mb-1.5">Fine detail</div>
                    <FftWidthTable rows={fine} />
                </div>
            )}
        </div>
    );
}
