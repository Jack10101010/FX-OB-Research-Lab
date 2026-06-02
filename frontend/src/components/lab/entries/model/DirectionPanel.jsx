// ── DirectionPanel.jsx ───────────────────────────────────────────────────────
// Long / short direction asymmetry analysis across all entry models.
//
// V2 CHANGES (Phase 1):
//   - Added BestDirectionCard: shows best long model and best short model
//     above the direction table, with sample confidence badge.
//   - Asymmetry warning threshold raised from 15% to 20% (matches audit spec).
//   - ⚠ icon added to rows where |WR Δ| > 20%.
//   - Low-N badge shown per direction in the new "Conf" column.
//   - bestModelByDirection() from analytics provides the synthesis layer.
//
// Phase 4 additions:
//   - Mixed Model Simulation section added below BestDirectionCards.
//   - buildMixedDirectionSimulation() computes combined stats when longs come
//     from Model A and shorts from Model B.
//   - Long / short model selectors default to bestLong / bestShort.
//   - Low-N warning fires when either side has < MIN_DIRECTION_N filled trades.
//   - Clearly labelled EXPLORATORY / IN-SAMPLE — no predictive claims.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { buildDirectionSplit, bestModelByDirection, buildMixedDirectionSimulation } from "../analytics/entryAnalytics";
import { sampleConfidence, MIN_DIRECTION_N } from "../analytics/entryRegistry";
import { fmtMaybePct, fmtMaybeR, isFiniteNumber, num } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";

// ── Best Direction Card ───────────────────────────────────────────────────────

function BestDirectionCard({ label, result, direction }) {
    if (!result) return (
        <div className="flex-1 min-w-0 px-3 py-3 border border-[hsl(var(--border-soft)/0.35)] bg-[hsl(var(--panel-2)/0.25)] rounded-[1px]">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.18em] text-muted-lab mb-1">{label}</div>
            <div className="text-[10.5px] font-ui text-muted-lab opacity-70">
                Insufficient data — need ≥{result?.minDirN ?? 15} trades per direction
            </div>
        </div>
    );

    const row     = result.row;
    const isLong  = direction === "long";
    const netR    = isLong ? result.longNetR  : result.shortNetR;
    const exp     = isLong ? result.longExp   : result.shortExp;
    const wr      = isLong ? result.longWR    : result.shortWR;
    const n       = isLong ? result.longN     : result.shortN;
    const conf    = sampleConfidence(n);
    const netRPos = isFiniteNumber(netR) && num(netR) >= 0;
    // Direction indicator character
    const dirChar = isLong ? "▲" : "▼";
    const dirColor = isLong ? "hsl(var(--success)/0.7)" : "hsl(var(--accent-primary)/0.7)";

    return (
        <div className="flex-1 min-w-0 px-3 py-3 border border-[hsl(var(--border-soft)/0.6)] bg-[hsl(var(--panel-2)/0.45)] rounded-[1px] shadow-[inset_3px_0_0_hsl(var(--accent-primary)/0.25)]">
            <div className="flex items-center gap-2 mb-2">
                <span style={{ color: dirColor }} className="text-[10px] font-ui tabular-nums">
                    {dirChar}
                </span>
                <span className="text-[9.5px] font-ui uppercase tracking-[0.18em] text-muted-lab">{label}</span>
                <Pill tone={conf.tone}>{conf.label}</Pill>
            </div>
            <div className="text-[12.5px] font-ui font-semibold text-white truncate mb-2">
                {row.label}
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
                <span className={cn("text-[14px] font-num font-semibold tabular-nums", netRPos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                    {isFiniteNumber(netR) ? `${num(netR) >= 0 ? "+" : ""}${num(netR).toFixed(1)}R` : "—"}
                    <span className="text-[9.5px] font-normal text-muted-lab ml-1 opacity-70">net</span>
                </span>
                <span className="text-[11px] font-num text-[hsl(var(--text-2))]">
                    {isFiniteNumber(wr) ? `${num(wr).toFixed(1)}% WR` : "—"}
                </span>
                <span className="text-[11px] font-num text-[hsl(var(--text-2))]">
                    {isFiniteNumber(exp) ? `${num(exp) >= 0 ? "+" : ""}${num(exp).toFixed(3)}R` : "—"}
                    <span className="text-[9px] ml-0.5 opacity-60">exp</span>
                </span>
                <span className="text-[9.5px] font-num text-muted-lab">n={n}</span>
            </div>
            {row.family && (
                <div className="mt-1.5 text-[9px] font-ui text-muted-lab uppercase tracking-wider opacity-55">
                    {row.family}
                </div>
            )}
        </div>
    );
}

// ── SimStat ───────────────────────────────────────────────────────────────────
// Single stat chip for the mixed simulation results row.

function SimStat({ label, value, tone }) {
    const toneClass = {
        success: "text-[hsl(var(--success))]",
        danger:  "text-[hsl(var(--danger))]",
        warning: "text-[hsl(var(--warning))]",
        default: "text-white",
    }[tone || "default"];

    return (
        <div className="flex flex-col items-center gap-0.5 px-3 py-2 border border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.3)] rounded-[1px] min-w-[68px]">
            <span className={cn("text-[12px] font-num font-semibold tabular-nums", toneClass)}>
                {value}
            </span>
            <span className="text-[8px] font-ui uppercase tracking-[0.12em] text-muted-lab whitespace-nowrap">
                {label}
            </span>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNetRSim(v) {
    if (!isFiniteNumber(v)) return "—";
    const n = num(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DirectionPanel({ exactRows, tradesByMode, activeVariant, trades }) {

    // Per-model direction splits (existing logic, unchanged)
    const rows = useMemo(() => {
        return exactRows.filter(r => r.exact).map(row => {
            const modeKey    = String(row.mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
            const modeTrades = row.isBaseline
                ? trades
                : tradesByMode?.[`${activeVariant}__${modeKey}`] || tradesByMode?.[modeKey] || null;
            const split = modeTrades ? buildDirectionSplit(modeTrades) : null;
            return { ...row, split };
        });
    }, [exactRows, tradesByMode, activeVariant, trades]);

    // V2: direction synthesis — best long model and best short model.
    const dirBestOf = useMemo(() => {
        return bestModelByDirection(exactRows, tradesByMode, activeVariant);
    }, [exactRows, tradesByMode, activeVariant]);

    // Phase 4: model options — non-baseline exactRows that have trade data.
    const modelOptions = useMemo(() => {
        return (exactRows || []).filter(r => r.exact).map(row => {
            const modeKey = String(row.mode || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
            const hasTrades = !!(
                tradesByMode?.[`${activeVariant}__${modeKey}`]?.length ||
                tradesByMode?.[modeKey]?.length
            );
            return hasTrades ? row : null;
        }).filter(Boolean);
    }, [exactRows, tradesByMode, activeVariant]);

    // Phase 4: model selector state — null means "use default".
    const [longModelKey,  setLongModelKey]  = useState(null);
    const [shortModelKey, setShortModelKey] = useState(null);

    // Phase 4: effective keys — explicit state → bestOf default → first available.
    const effectiveLongKey  = longModelKey
        ?? dirBestOf.bestLongModel?.row?.mode
        ?? modelOptions[0]?.mode
        ?? null;
    const effectiveShortKey = shortModelKey
        ?? dirBestOf.bestShortModel?.row?.mode
        ?? modelOptions[0]?.mode
        ?? null;

    // Phase 4: mixed simulation result.
    const mixedSim = useMemo(() => {
        if (!effectiveLongKey || !effectiveShortKey || !tradesByMode) return null;
        return buildMixedDirectionSimulation({
            longModelKey:  effectiveLongKey,
            shortModelKey: effectiveShortKey,
            tradesByMode,
            activeVariant,
        });
    }, [effectiveLongKey, effectiveShortKey, tradesByMode, activeVariant]);

    const hasData        = rows.some(r => r.split && r.split.total > 0);
    const hasDir         = rows.some(r => r.split && (r.split.longs.count > 0 || r.split.shorts.count > 0));
    const hasModelRows   = rows.some(r => !r.isBaseline);
    const hasModelTradeData = rows.some(r => !r.isBaseline && r.split);
    const hasBestOf      = dirBestOf.bestLongModel || dirBestOf.bestShortModel;

    // ── Table columns ─────────────────────────────────────────────────────────
    const ASYM_THRESHOLD = 20; // % WR delta above which asymmetry warning fires

    // Phase 5 UX: detect whether any model actually shows high asymmetry.
    // Used to decide between a plain note and a prominent callout.
    const hasHighAsymmetry = rows.some(r =>
        r.split &&
        isFiniteNumber(r.split.longs.winRate) &&
        isFiniteNumber(r.split.shorts.winRate) &&
        Math.abs(r.split.longs.winRate - r.split.shorts.winRate) > ASYM_THRESHOLD
    );

    const cols = [
        {
            key: "label",
            label: "Model",
            render: r => (
                <span className={r.isBaseline ? "text-[hsl(var(--accent-secondary))]" : "text-white"}>
                    {r.label}
                </span>
            ),
        },
        {
            key: "lWR",
            label: "Long WR",
            align: "right",
            render: r => r.split ? fmtMaybePct(r.split.longs.winRate) : "—",
        },
        {
            key: "lNetR",
            label: "Long R",
            align: "right",
            render: r => r.split && r.split.longs.count
                ? <ColoredR value={r.split.longs.netR} />
                : <span className="text-muted-lab">—</span>,
        },
        {
            key: "lExp",
            label: "Long Exp",
            align: "right",
            render: r => r.split ? fmtMaybeR(r.split.longs.expectancy) : "—",
        },
        {
            key: "lN",
            label: "L Trades",
            align: "right",
            render: r => {
                if (!r.split) return "—";
                const conf = sampleConfidence(r.split.longs.count);
                return (
                    <span className="flex items-center justify-end gap-1">
                        <span>{r.split.longs.count}</span>
                        {!r.isBaseline && conf.tone !== "success" && (
                            <span className={cn(
                                "text-[8.5px] font-ui px-1 border rounded-[1px]",
                                conf.tone === "danger"  && "text-[hsl(var(--danger))]  border-[hsl(var(--danger)/0.4)]",
                                conf.tone === "warning" && "text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.4)]",
                                conf.tone === "secondary" && "text-[hsl(var(--text-2))] border-[hsl(var(--border-soft))]",
                            )}>
                                {conf.label}
                            </span>
                        )}
                    </span>
                );
            },
        },
        {
            key: "div",
            label: "",
            render: () => <span className="text-muted-lab text-[9px]">|</span>,
        },
        {
            key: "sWR",
            label: "Short WR",
            align: "right",
            render: r => r.split ? fmtMaybePct(r.split.shorts.winRate) : "—",
        },
        {
            key: "sNetR",
            label: "Short R",
            align: "right",
            render: r => r.split && r.split.shorts.count
                ? <ColoredR value={r.split.shorts.netR} />
                : <span className="text-muted-lab">—</span>,
        },
        {
            key: "sExp",
            label: "Short Exp",
            align: "right",
            render: r => r.split ? fmtMaybeR(r.split.shorts.expectancy) : "—",
        },
        {
            key: "sN",
            label: "S Trades",
            align: "right",
            render: r => {
                if (!r.split) return "—";
                const conf = sampleConfidence(r.split.shorts.count);
                return (
                    <span className="flex items-center justify-end gap-1">
                        <span>{r.split.shorts.count}</span>
                        {!r.isBaseline && conf.tone !== "success" && (
                            <span className={cn(
                                "text-[8.5px] font-ui px-1 border rounded-[1px]",
                                conf.tone === "danger"  && "text-[hsl(var(--danger))]  border-[hsl(var(--danger)/0.4)]",
                                conf.tone === "warning" && "text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.4)]",
                                conf.tone === "secondary" && "text-[hsl(var(--text-2))] border-[hsl(var(--border-soft))]",
                            )}>
                                {conf.label}
                            </span>
                        )}
                    </span>
                );
            },
        },
        {
            key: "asymm",
            label: "WR Δ",
            align: "right",
            render: r => {
                if (!r.split) return <span className="text-muted-lab">—</span>;
                const d = r.split.longs.winRate - r.split.shorts.winRate;
                if (!isFiniteNumber(d)) return <span className="text-muted-lab">—</span>;
                // V2: asymmetry threshold raised to 20% and ⚠ icon added.
                const isAsymm = Math.abs(d) > ASYM_THRESHOLD;
                const color   = isAsymm ? "hsl(var(--warning))" : "hsl(var(--text-2))";
                return (
                    <span className="flex items-center justify-end gap-1 font-num tabular-nums" style={{ color }}>
                        {isAsymm && (
                            <span title={`High directional asymmetry: WR delta ${num(d).toFixed(1)}%`}>⚠</span>
                        )}
                        <span>{d >= 0 ? "+" : ""}{num(d).toFixed(1)}%</span>
                    </span>
                );
            },
        },
    ];

    return (
        <NeonPanel
            title="Direction Asymmetry"
            className="xl:col-span-3"
            action={<Pill tone={hasDir ? "success" : hasData ? "secondary" : "warning"}>{hasDir ? "DIRECTION DATA" : "LIMITED"}</Pill>}
        >
            {/* ── Direction Synthesis ──────────────────────────────────────── */}
            {/* Shows best long / short model based on per-direction expectancy.
                Minimum n=15 per direction required. Both sides shown regardless
                of whether sufficient data exists — missing side shows a note. */}
            {hasDir && (
                <div className="mb-4">
                    {/* Framing header */}
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-[8.5px] font-ui uppercase tracking-[0.28em] text-muted-lab opacity-60">
                            Direction Synthesis
                        </span>
                        <div className="flex-1 border-t border-[hsl(var(--border-soft)/0.22)]" />
                        {dirBestOf.bestLongModel && dirBestOf.bestShortModel && (
                            <span className="text-[8px] font-ui uppercase tracking-[0.18em] text-[hsl(var(--success)/0.65)]">
                                Both sides covered
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        <BestDirectionCard
                            label="Best Long Model"
                            result={dirBestOf.bestLongModel}
                            direction="long"
                        />
                        <BestDirectionCard
                            label="Best Short Model"
                            result={dirBestOf.bestShortModel}
                            direction="short"
                        />
                    </div>
                </div>
            )}

            {/* ── Phase 4: Mixed Model Simulation ─────────────────────────── */}
            {/* Shown when 2+ models have resolved trade data.
                Exploratory research view — in-sample, not a deployment recommendation.
                Routes long trades through Model A, short trades through Model B,
                merges, and computes combined stats. */}
            {modelOptions.length >= 2 && (
                <>
                    <div className="border-t border-[hsl(var(--border-soft)/0.25)] my-4" />

                    {/* Section header */}
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                            Mixed Model Simulation
                        </span>
                        <Pill tone="secondary">EXPLORATORY</Pill>
                        <Pill tone="warning">IN-SAMPLE</Pill>
                    </div>
                    <p className="mb-3 text-[9.5px] font-ui text-muted-lab opacity-75 leading-relaxed">
                        What if long setups used one model and short setups used another?
                        In-sample simulation only — treat as a research tool, not a live recommendation.
                    </p>

                    {/* Model selectors */}
                    <div className="flex gap-5 mb-4 flex-wrap">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-ui uppercase tracking-[0.14em] text-muted-lab">
                                Long Model
                            </span>
                            <select
                                value={effectiveLongKey || ""}
                                onChange={e => setLongModelKey(e.target.value || null)}
                                className="font-ui text-[10px] bg-[hsl(var(--panel-2)/0.6)] border border-[hsl(var(--border-soft)/0.5)] text-white px-2 py-1 rounded-[1px] min-w-[160px] max-w-[260px] cursor-pointer"
                            >
                                {modelOptions.map(r => (
                                    <option key={r.mode} value={r.mode}>
                                        {r.label || r.mode}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-ui uppercase tracking-[0.14em] text-muted-lab">
                                Short Model
                            </span>
                            <select
                                value={effectiveShortKey || ""}
                                onChange={e => setShortModelKey(e.target.value || null)}
                                className="font-ui text-[10px] bg-[hsl(var(--panel-2)/0.6)] border border-[hsl(var(--border-soft)/0.5)] text-white px-2 py-1 rounded-[1px] min-w-[160px] max-w-[260px] cursor-pointer"
                            >
                                {modelOptions.map(r => (
                                    <option key={r.mode} value={r.mode}>
                                        {r.label || r.mode}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Results — shown when stats are available */}
                    {mixedSim?.stats && (
                        <>
                            {/* Low-N warning */}
                            {mixedSim.lowN && (
                                <div className="mb-3 flex items-start gap-2 px-2.5 py-1.5 border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.04)] rounded-[1px]">
                                    <span className="text-[hsl(var(--warning))] text-[11px] mt-px shrink-0">⚠</span>
                                    <span className="text-[9.5px] font-ui text-[hsl(var(--warning))] leading-relaxed">
                                        One or both sides have fewer than {MIN_DIRECTION_N} filled trades.
                                        Sample size is too small for reliable conclusions.
                                    </span>
                                </div>
                            )}

                            {/* Stat chips */}
                            <div className="flex gap-2 flex-wrap mb-3">
                                <SimStat
                                    label="Net R"
                                    value={fmtNetRSim(mixedSim.stats.netR)}
                                    tone={num(mixedSim.stats.netR) >= 0 ? "success" : "danger"}
                                />
                                <SimStat
                                    label="Exp / Trade"
                                    value={isFiniteNumber(mixedSim.stats.expectancy)
                                        ? `${num(mixedSim.stats.expectancy) >= 0 ? "+" : ""}${num(mixedSim.stats.expectancy).toFixed(3)}R`
                                        : "—"
                                    }
                                    tone={num(mixedSim.stats.expectancy) >= 0 ? "success" : "danger"}
                                />
                                <SimStat
                                    label="Win Rate"
                                    value={isFiniteNumber(mixedSim.stats.winRate)
                                        ? `${num(mixedSim.stats.winRate).toFixed(1)}%`
                                        : "—"
                                    }
                                />
                                <SimStat
                                    label="Max DD"
                                    value={isFiniteNumber(mixedSim.stats.maxDD) && num(mixedSim.stats.maxDD) > 0
                                        ? `-${num(mixedSim.stats.maxDD).toFixed(1)}R`
                                        : "0.0R"
                                    }
                                    tone="warning"
                                />
                                <SimStat
                                    label="Trades"
                                    value={String(mixedSim.totalN)}
                                />
                                <SimStat
                                    label="Prof Factor"
                                    value={isFiniteNumber(mixedSim.stats.profitFactor)
                                        ? num(mixedSim.stats.profitFactor).toFixed(2)
                                        : "—"
                                    }
                                />
                            </div>

                            {/* Component breakdown */}
                            <div className="flex gap-3 flex-wrap">
                                <div className="flex-1 min-w-[140px] px-3 py-2 border border-[hsl(var(--border-soft)/0.35)] bg-[hsl(var(--panel-2)/0.25)] rounded-[1px]">
                                    <div className="text-[8.5px] font-ui uppercase tracking-[0.14em] text-muted-lab mb-1">
                                        Long Component
                                    </div>
                                    <div className="text-[10.5px] font-ui text-white truncate mb-0.5">
                                        {modelOptions.find(r => r.mode === effectiveLongKey)?.label || effectiveLongKey}
                                    </div>
                                    <div className="flex gap-2 text-[10px] font-num">
                                        <span className={num(mixedSim.longNetR) >= 0
                                            ? "text-[hsl(var(--success))]"
                                            : "text-[hsl(var(--danger))]"
                                        }>
                                            {fmtNetRSim(mixedSim.longNetR)}
                                        </span>
                                        <span className="text-muted-lab">
                                            n={mixedSim.longN}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-[140px] px-3 py-2 border border-[hsl(var(--border-soft)/0.35)] bg-[hsl(var(--panel-2)/0.25)] rounded-[1px]">
                                    <div className="text-[8.5px] font-ui uppercase tracking-[0.14em] text-muted-lab mb-1">
                                        Short Component
                                    </div>
                                    <div className="text-[10.5px] font-ui text-white truncate mb-0.5">
                                        {modelOptions.find(r => r.mode === effectiveShortKey)?.label || effectiveShortKey}
                                    </div>
                                    <div className="flex gap-2 text-[10px] font-num">
                                        <span className={num(mixedSim.shortNetR) >= 0
                                            ? "text-[hsl(var(--success))]"
                                            : "text-[hsl(var(--danger))]"
                                        }>
                                            {fmtNetRSim(mixedSim.shortNetR)}
                                        </span>
                                        <span className="text-muted-lab">
                                            n={mixedSim.shortN}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* No-data fallback (totalN === 0) */}
                    {mixedSim && !mixedSim.stats && (
                        <p className="text-[10px] font-ui text-muted-lab py-2">
                            No filled trades found for this model combination in the selected direction splits.
                            Try a different pair or verify that per-model trade exports are loaded.
                        </p>
                    )}
                </>
            )}

            {/* ── Asymmetry callout ────────────────────────────────────────── */}
            {/* Show a prominent callout when high asymmetry is actually detected,
                a quiet note otherwise — avoid visual noise when data is balanced. */}
            {hasDir && hasHighAsymmetry && (
                <div className="mt-4 mb-2 flex items-start gap-2 px-2.5 py-2 border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.04)]">
                    <span className="text-[hsl(var(--warning))] text-[11px] mt-px shrink-0">⚠</span>
                    <p className="text-[9.5px] font-ui text-[hsl(var(--warning))] leading-relaxed">
                        High directional asymmetry detected. WR delta exceeds {ASYM_THRESHOLD}% for at least one model — direction-specific model routing may improve performance.
                        See mixed simulation below. Low-N directions also flagged inline.
                    </p>
                </div>
            )}
            {hasDir && !hasHighAsymmetry && (
                <p className="mt-4 mb-2 text-[10px] font-ui text-muted-lab">
                    WR Δ &gt;{ASYM_THRESHOLD}% signals meaningful directional asymmetry (⚠).
                    Low-N directions flagged inline — avoid conclusions below n=15.
                </p>
            )}

            {/* ── Missing trade data warning ───────────────────────────────── */}
            {hasModelRows && !hasModelTradeData && (
                <p className="mb-3 text-[10.5px] font-ui text-[hsl(var(--warning))]">
                    Requires per-model entry trade exports (<span className="text-white">trades_*__entry_*.csv</span>).
                    Summary entry results are loaded, but trade-level model lists are missing.
                </p>
            )}
            {!hasDir && !(hasModelRows && !hasModelTradeData) && (
                <p className="mb-3 text-[10.5px] font-ui text-[hsl(var(--warning))]">
                    Requires <span className="text-white">direction</span> field on trade objects.
                </p>
            )}

            <DataTable testId="entry-direction" columns={cols} rows={rows} maxHeight={280} />
        </NeonPanel>
    );
}
