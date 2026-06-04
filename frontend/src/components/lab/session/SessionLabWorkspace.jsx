/**
 * SessionLabWorkspace — top-level layout for Session Lab.
 *
 * Owns:
 *   - Global direction toggle (Both / Long Only / Short Only)
 *   - Session rules state (per-session enable/disable, direction, structure)
 *   - Filtered preview comparison (rules applied to dirTrades)
 *   - Session card grid (3-col desktop)
 *   - Inline drilldown below the selected card
 *   - Session comparison table at the bottom
 *
 * Props:
 *   trades   object[]  — canonical trade list from useTradeUniverse()
 *   bundle   object    — active run bundle (for metadata display)
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Clock, Settings2, RotateCcw, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
import { Segment } from "@/components/lab/controls";
import { SessionCard } from "./SessionCard";
import { SessionDrilldown } from "./SessionDrilldown";
import {
    buildSessionProfiles,
    buildSessionComparisonRows,
    buildCardSnapshot,
    buildDefaultSessionRules,
    hasActiveRules,
    applySessionRules,
    computePreviewComparison,
    resolveSession,
    filterByDirection,
} from "./analytics/sessionAnalytics";
import { SESSION_KEYS, SESSION_DEFINITIONS, SESSION_COLOR_ROLES, getSessionDef } from "./config/sessionConfig";
import { buildMixedDirectionSimulation } from "../entries/analytics/entryAnalytics";
import { entryTradesByMode } from "../../../data/tradeUniverse";
import { formatDirectionalScenarioLabel } from "../entries/analytics/entryFormatters";

// ── Constants ─────────────────────────────────────────────────────────────────

const DIRECTION_LS_KEY = "fxob_session_lab_direction_v1";
const RULES_LS_KEY     = "fxob_session_lab_rules_v1";

const DIRECTION_OPTIONS = [
    { label: "Both",       value: "both"  },
    { label: "Long Only",  value: "long"  },
    { label: "Short Only", value: "short" },
];

function fmtR(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

// ── Direction Banner ──────────────────────────────────────────────────────────

function DirectionBanner({ direction }) {
    if (direction === "both") return null;
    const label = direction === "long"
        ? "Long Only — Shorts hidden from all metrics"
        : "Short Only — Longs hidden from all metrics";
    return (
        <div className="flex items-center gap-2 px-4 py-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm text-[11px] font-ui text-[hsl(var(--warning))]">
            <span className="uppercase tracking-wider">Viewing:</span>
            <span>{label}</span>
        </div>
    );
}

// ── Session Settings Popover ──────────────────────────────────────────────────

function SessionSettingsButton() {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] font-ui uppercase tracking-wider border clip-bevel-sm transition-colors",
                    open
                        ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
                        : "border-[hsl(var(--border-mid))] text-muted-lab hover:text-white",
                )}
                data-testid="session-settings-placeholder"
            >
                <Settings2 className="w-3 h-3" />
                Session Settings
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[280px] bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] shadow-[0_4px_24px_hsl(0,0%,0%,0.35)] clip-bevel-sm p-4">
                    <div className="text-[10px] font-ui uppercase tracking-widest text-[hsl(var(--accent-primary))] mb-3">
                        Session Windows
                    </div>
                    <div className="flex flex-col divide-y divide-[hsl(var(--border-soft)/0.4)]">
                        {SESSION_DEFINITIONS.filter((d) => d.startUtc && d.endUtc).map((def) => (
                            <div key={def.key} className="flex items-center justify-between py-2">
                                <span className={cn("text-[11px] font-ui", SESSION_COLOR_ROLES[def.colorRole] || "text-muted-lab")}>
                                    {def.label}
                                </span>
                                <span className="text-[11px] font-num text-[hsl(var(--text-2))]">
                                    {def.startUtc}–{def.endUtc} UTC
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[10px] font-ui text-muted-lab leading-relaxed border-t border-[hsl(var(--border-soft)/0.4)] pt-2.5">
                        Custom session times and DST-aware timezone conversion coming soon.
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Filtered Preview Panel ────────────────────────────────────────────────────

function PreviewPanel({ comparison, onReset }) {
    if (!comparison.hasChanges) return null;
    const { original, filtered, removed, delta } = comparison;

    const deltaRClass = delta.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    const ddClass     = delta.maxDD >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";

    return (
        <div className="border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.04)] clip-bevel-sm px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-widest text-[hsl(var(--accent-primary))]">
                        Filtered Preview
                    </span>
                    <span className="text-[10px] font-ui text-muted-lab">
                        {removed.count} trade{removed.count !== 1 ? "s" : ""} excluded
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center gap-1 text-[9.5px] font-ui uppercase tracking-wider text-muted-lab hover:text-white border border-[hsl(var(--border-soft))] px-2 py-1 clip-bevel-sm transition-colors"
                >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Reset
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: "Orig Net R",    value: fmtR(original.netR), cls: original.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]" },
                    { label: "Filter Net R",  value: fmtR(filtered.netR), cls: filtered.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]" },
                    { label: "Δ Net R",       value: fmtR(delta.netR),    cls: deltaRClass, bold: true },
                    { label: "Trades",        value: `${original.tradeCount} → ${filtered.tradeCount}`, cls: "text-[hsl(var(--text))]" },
                    { label: "Removed W / L", value: null,
                      custom: (
                          <span className="text-[12px] font-num leading-tight">
                              <span className="text-[hsl(var(--success))]">W:{removed.wins}</span>
                              <span className="text-muted-lab mx-0.5">/</span>
                              <span className="text-[hsl(var(--danger))]">L:{removed.losses}</span>
                          </span>
                      ),
                    },
                    { label: "Δ Max DD",      value: `${delta.maxDD >= 0 ? "+" : ""}${delta.maxDD.toFixed(2)}R`, cls: ddClass },
                ].map(({ label, value, cls, bold, custom }) => (
                    <div key={label} className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-ui uppercase tracking-wider text-muted-lab">{label}</span>
                        {custom ?? (
                            <span className={cn("text-[13px] font-num tabular-nums leading-tight", bold && "font-semibold", cls)}>
                                {value}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Asymmetric Entry Preview ──────────────────────────────────────────────────

const MIN_DIRECTION_N_PREVIEW = 15;

/** Compute key stats inline from a directional trade list. */
function computeDirectionalStats(trades) {
    if (!trades || !trades.length) return { netR: 0, tradeCount: 0, winRate: null, profitFactor: null, maxDD: null };
    let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0, peak = 0, maxDD = 0, equity = 0;
    for (const t of trades) {
        const r = Number(t.r_multiple ?? t.rMultiple ?? 0);
        equity += r;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDD) maxDD = dd;
        if (r > 0) { wins++; grossProfit += r; }
        else if (r < 0) { losses++; grossLoss += Math.abs(r); }
    }
    const total = wins + losses;
    return {
        netR: equity,
        tradeCount: trades.length,
        winRate: total > 0 ? (wins / total) * 100 : null,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
        maxDD: maxDD > 0 ? maxDD : null,
    };
}

function formatEntryModelKey(key) {
    if (!key || key === "baseline" || key === "entry_baseline") return "Baseline";

    const threshMatch = key.match(/entry_(?:triggered_edge|penetration)_(\d+p\d+)/i);
    const threshold = threshMatch
        ? threshMatch[1].replace("p", ".").replace(/\.0$/, "") + "%"
        : null;

    if (key.startsWith("entry_penetration")) {
        return threshold ? `Penetration ${threshold}` : "Penetration";
    }
    if (key.startsWith("entry_triggered_edge")) {
        const base = threshold ? `TE ${threshold}` : "TE";
        if (/_same$/i.test(key)) return `${base} · Same`;
        if (/_next$/i.test(key)) return `${base} · Next`;
        const dm = key.match(/_d(\d+)$/i);
        if (dm) return `${base} · Delay +${dm[1]}`;
        return base;
    }
    // Fallback: readable-ize
    return key
        .replace(/^entry_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AsymmetricEntryPreview({ bundle, activeVariant }) {
    const tradesByMode = useMemo(() => entryTradesByMode(bundle), [bundle]);

    // Collect backend directional scenarios from bundle.directionalResults
    const directionalScenarios = useMemo(() => {
        const dr = bundle?.directionalResults;
        if (!dr?.tradesByScenario || !dr?.scenarioMeta) return [];
        return Object.entries(dr.scenarioMeta)
            .map(([storageKey, meta]) => {
                const trades = dr.tradesByScenario[storageKey] || [];
                const stats = computeDirectionalStats(trades);
                return { storageKey, meta, stats };
            })
            .sort((a, b) => b.stats.netR - a.stats.netR);
    }, [bundle]);

    const availableKeys = useMemo(() => {
        if (!tradesByMode) return [];
        const prefix = `${activeVariant}__`;
        const keys = new Set();
        Object.keys(tradesByMode).forEach((k) => {
            if (k.startsWith(prefix)) {
                // Filter out full directional scenario keys — those belong in the
                // Backend Directional Scenarios section, not the approximate dropdowns.
                const stripped = k.slice(prefix.length);
                if (!stripped.startsWith("dir_")) keys.add(stripped);
            } else if (k.startsWith("entry_") || k === "baseline" || k === "entry_baseline") {
                keys.add(k);
            }
        });
        return [...keys].sort();
    }, [tradesByMode, activeVariant]);

    const defaultLongKey = useMemo(
        () => availableKeys.find((k) => /entry_triggered_edge.*_d2$/.test(k))
              || availableKeys[0]
              || "entry_baseline",
        [availableKeys],
    );

    const defaultShortKey = useMemo(
        () => availableKeys.find((k) => /entry_triggered_edge.*_next$/.test(k))
              || availableKeys[0]
              || "entry_baseline",
        [availableKeys],
    );

    const [show, setShow]         = useState(false);
    const [longKey, setLongKey]   = useState(defaultLongKey);
    const [shortKey, setShortKey] = useState(defaultShortKey);

    // Sync selections when availableKeys loads or activeVariant changes
    useEffect(() => {
        setLongKey((prev) => (availableKeys.includes(prev) ? prev : defaultLongKey));
        setShortKey((prev) => (availableKeys.includes(prev) ? prev : defaultShortKey));
    }, [availableKeys, defaultLongKey, defaultShortKey]);

    const preview = useMemo(() => {
        if (!show || !longKey || !shortKey) return null;
        return buildMixedDirectionSimulation({
            longModelKey:  longKey,
            shortModelKey: shortKey,
            tradesByMode,
            activeVariant,
        });
    }, [show, longKey, shortKey, tradesByMode, activeVariant]);

    const isOnePD  = activeVariant === "one_per_direction";
    const hasKeys  = availableKeys.length > 0;

    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
            {/* Toggle header */}
            <button
                type="button"
                onClick={() => setShow((p) => !p)}
                className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors",
                    show
                        ? "bg-[hsl(var(--accent-primary)/0.07)] border-b border-[hsl(var(--border-soft))]"
                        : "hover:bg-[hsl(var(--surface-1)/0.5)]",
                )}
            >
                <Power className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    show ? "text-[hsl(var(--accent-primary))]" : "text-muted-lab",
                )} />
                <span className={cn(
                    "text-[10.5px] font-ui uppercase tracking-wider",
                    show ? "text-[hsl(var(--accent-primary))]" : "text-muted-lab",
                )}>
                    Asymmetric Entry Preview
                </span>
                <span className="text-[10px] font-ui text-muted-lab ml-0.5">
                    — preview longs &amp; shorts with different entry models
                </span>
                <span className={cn(
                    "ml-auto text-[9px] font-ui uppercase tracking-wider",
                    show ? "text-[hsl(var(--accent-primary))]" : "text-muted-lab",
                )}>
                    {show ? "Hide" : "Show"}
                </span>
            </button>

            {show && (
                <div className="px-4 py-3 space-y-3">
                    {/* Caveat banner */}
                    <div className="px-3 py-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm text-[10px] font-ui text-[hsl(var(--warning))] leading-relaxed">
                        <span className="font-semibold uppercase tracking-wider">Approximate</span>
                        {" — post-hoc merge, not a true backtest. Conflict rules may differ for single-position / multi-position modes."}
                        {isOnePD && (
                            <span className="ml-2 text-[hsl(var(--success))] font-semibold">
                                ✓ Exact for one-per-direction mode.
                            </span>
                        )}
                    </div>

                    {!hasKeys ? (
                        <p className="text-[11px] font-ui text-muted-lab">
                            No entry scenario CSVs found in this run. Import a run with entry model scenarios to use this feature.
                        </p>
                    ) : (
                        <>
                            {/* Model selectors */}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: "long",  label: "Longs use",  value: longKey,  onChange: setLongKey },
                                    { id: "short", label: "Shorts use", value: shortKey, onChange: setShortKey },
                                ].map(({ id, label, value, onChange }) => (
                                    <div key={id} className="flex flex-col gap-1">
                                        <span className="text-[9px] font-ui uppercase tracking-wider text-muted-lab">
                                            {label}
                                        </span>
                                        <select
                                            value={value}
                                            onChange={(e) => onChange(e.target.value)}
                                            className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border-mid))] text-[11px] font-ui text-[hsl(var(--text))] px-2 py-1.5 clip-bevel-sm focus:outline-none focus:border-[hsl(var(--accent-primary)/0.6)]"
                                        >
                                            {availableKeys.map((k) => (
                                                <option key={k} value={k}>
                                                    {formatEntryModelKey(k)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>

                            {/* Results */}
                            {preview && (
                                preview.totalN === 0 ? (
                                    <p className="text-[11px] font-ui text-muted-lab">
                                        No matching trades found for this combination.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Low-N warning */}
                                        {preview.lowN && (
                                            <div className="px-3 py-1.5 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm">
                                                <span className="text-[10px] font-ui text-[hsl(var(--warning))]">
                                                    Low sample size — one side has fewer than {MIN_DIRECTION_N_PREVIEW} trades. Stats unreliable.
                                                </span>
                                            </div>
                                        )}

                                        {/* Metrics grid */}
                                        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-3">
                                            {[
                                                {
                                                    label: "Combined Net R",
                                                    value: fmtR(preview.stats.netR),
                                                    cls: preview.stats.netR >= 0
                                                        ? "text-[hsl(var(--success))]"
                                                        : "text-[hsl(var(--danger))]",
                                                    bold: true,
                                                },
                                                {
                                                    label: "Long Net R",
                                                    value: fmtR(preview.longNetR),
                                                    cls: preview.longNetR >= 0
                                                        ? "text-[hsl(var(--success))]"
                                                        : "text-[hsl(var(--danger))]",
                                                },
                                                {
                                                    label: "Short Net R",
                                                    value: fmtR(preview.shortNetR),
                                                    cls: preview.shortNetR >= 0
                                                        ? "text-[hsl(var(--success))]"
                                                        : "text-[hsl(var(--danger))]",
                                                },
                                                {
                                                    label: "Trades",
                                                    value: `${preview.totalN}`,
                                                    cls: "text-[hsl(var(--text))]",
                                                },
                                                {
                                                    label: "Long N",
                                                    value: `${preview.longN}`,
                                                    cls: preview.longN >= MIN_DIRECTION_N_PREVIEW
                                                        ? "text-[hsl(var(--text))]"
                                                        : "text-[hsl(var(--warning))]",
                                                },
                                                {
                                                    label: "Short N",
                                                    value: `${preview.shortN}`,
                                                    cls: preview.shortN >= MIN_DIRECTION_N_PREVIEW
                                                        ? "text-[hsl(var(--text))]"
                                                        : "text-[hsl(var(--warning))]",
                                                },
                                                {
                                                    label: "Win Rate",
                                                    value: preview.stats.winRate != null
                                                        ? `${Number(preview.stats.winRate).toFixed(1)}%`
                                                        : "—",
                                                    cls: "text-[hsl(var(--text))]",
                                                },
                                                {
                                                    label: "Expectancy",
                                                    value: preview.stats.expectancy != null
                                                        ? `${Number(preview.stats.expectancy).toFixed(2)}R`
                                                        : "—",
                                                    cls: preview.stats.expectancy >= 0
                                                        ? "text-[hsl(var(--success))]"
                                                        : "text-[hsl(var(--danger))]",
                                                },
                                                {
                                                    label: "Profit Factor",
                                                    value: preview.stats.profitFactor != null
                                                        ? Number(preview.stats.profitFactor).toFixed(2)
                                                        : "—",
                                                    cls: "text-[hsl(var(--text))]",
                                                },
                                                {
                                                    label: "Max DD",
                                                    value: preview.stats.maxDD != null
                                                        ? `${Number(preview.stats.maxDD).toFixed(2)}R`
                                                        : "—",
                                                    cls: "text-[hsl(var(--danger))]",
                                                },
                                            ].map(({ label, value, cls, bold }) => (
                                                <div key={label} className="flex flex-col gap-0.5">
                                                    <span className="text-[9px] font-ui uppercase tracking-wider text-muted-lab">
                                                        {label}
                                                    </span>
                                                    <span className={cn(
                                                        "text-[13px] font-num tabular-nums leading-tight",
                                                        bold && "font-semibold",
                                                        cls,
                                                    )}>
                                                        {value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}
                        </>
                    )}

                    {/* ── Backend Directional Scenarios ───────────────────────────────────────
                        Distinct from the approximate preview above. These are true split-pass
                        scenarios generated by the backtester and imported from directional CSVs.
                        They are NOT post-hoc frontend merges. */}
                    {directionalScenarios.length > 0 && (
                        <div className="border-t border-[hsl(var(--border-soft)/0.6)] pt-3 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-ui uppercase tracking-widest text-[hsl(var(--accent-primary))]">
                                    Backend Directional Scenarios
                                </span>
                                <span className="px-1.5 py-0.5 text-[8.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] clip-bevel-sm">
                                    Backend
                                </span>
                                <span className="px-1.5 py-0.5 text-[8.5px] font-ui uppercase tracking-wider border border-[hsl(var(--text-2)/0.4)] text-[hsl(var(--text-2))] clip-bevel-sm">
                                    Split-pass
                                </span>
                            </div>
                            <p className="text-[10px] font-ui text-muted-lab leading-relaxed">
                                True exported directional scenarios from the backtester. Split-pass directional simulation — not an approximate frontend merge.
                            </p>
                            <div className="space-y-2">
                                {directionalScenarios.map(({ storageKey, meta, stats }) => {
                                    const { scenarioId, executionMode } = meta;
                                    const isSupported = executionMode === "one_per_direction"
                                        || executionMode === "allow_multi_position";
                                    const modeLabel = executionMode === "one_per_direction" ? "One/dir"
                                        : executionMode === "allow_multi_position" ? "Multi"
                                        : executionMode === "single_position" ? "Single" : executionMode;
                                    return (
                                        <div key={storageKey} className="border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2 space-y-2">
                                            {/* Label + badge row */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[11px] font-ui text-[hsl(var(--text))]">
                                                    {formatDirectionalScenarioLabel(scenarioId)}
                                                </span>
                                                <span className="px-1.5 py-0.5 text-[8px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.45)] text-[hsl(var(--accent-primary))] clip-bevel-sm">
                                                    Backend
                                                </span>
                                                <span className="px-1.5 py-0.5 text-[8px] font-ui uppercase tracking-wider border border-[hsl(var(--text-2)/0.4)] text-[hsl(var(--text-2))] clip-bevel-sm">
                                                    Split-pass
                                                </span>
                                                <span className="px-1.5 py-0.5 text-[8px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-muted-lab clip-bevel-sm">
                                                    {modeLabel}
                                                </span>
                                                {isSupported ? (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-ui uppercase tracking-wider border border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))] clip-bevel-sm">
                                                        Supported ✓
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-ui uppercase tracking-wider border border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))] clip-bevel-sm">
                                                        ⚠ Unsupported mode
                                                    </span>
                                                )}
                                            </div>
                                            {/* Stats row */}
                                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                                {[
                                                    {
                                                        label: "Net R",
                                                        value: fmtR(stats.netR),
                                                        cls: stats.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]",
                                                        bold: true,
                                                    },
                                                    {
                                                        label: "Trades",
                                                        value: String(stats.tradeCount),
                                                        cls: "text-[hsl(var(--text))]",
                                                    },
                                                    {
                                                        label: "Win Rate",
                                                        value: stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—",
                                                        cls: "text-[hsl(var(--text))]",
                                                    },
                                                    {
                                                        label: "Profit Factor",
                                                        value: stats.profitFactor != null ? stats.profitFactor.toFixed(2) : "—",
                                                        cls: "text-[hsl(var(--text))]",
                                                    },
                                                    {
                                                        label: "Max DD",
                                                        value: stats.maxDD != null ? `${stats.maxDD.toFixed(2)}R` : "—",
                                                        cls: "text-[hsl(var(--danger))]",
                                                    },
                                                ].map(({ label, value, cls, bold }) => (
                                                    <div key={label} className="flex flex-col gap-0.5">
                                                        <span className="text-[9px] font-ui uppercase tracking-wider text-muted-lab">
                                                            {label}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[12px] font-num tabular-nums leading-tight",
                                                            bold && "font-semibold",
                                                            cls,
                                                        )}>
                                                            {value}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── SessionLabWorkspace ───────────────────────────────────────────────────────

export function SessionLabWorkspace({ trades, bundle }) {
    // ── Active variant (for asymmetric preview) ──────────────────────────────
    const activeVariant = bundle?.primaryVariant
        || bundle?.activeVariant
        || "single_position";

    // ── Global direction toggle ──────────────────────────────────────────────
    const [direction, setDirection] = useState(() => {
        try {
            const s = localStorage.getItem(DIRECTION_LS_KEY);
            if (s === "long" || s === "short" || s === "both") return s;
        } catch { /* noop */ }
        return "both";
    });

    // ── Session rules ────────────────────────────────────────────────────────
    const [sessionRules, setSessionRules] = useState(() => {
        try {
            const s = localStorage.getItem(RULES_LS_KEY);
            if (s) {
                const parsed = JSON.parse(s);
                // Merge with defaults to handle new session keys
                const defaults = buildDefaultSessionRules();
                return { ...defaults, ...parsed };
            }
        } catch { /* noop */ }
        return buildDefaultSessionRules();
    });

    const [selectedSession, setSelectedSession] = useState(null);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleDirectionChange = useCallback((val) => {
        setDirection(val);
        try { localStorage.setItem(DIRECTION_LS_KEY, val); } catch { /* noop */ }
    }, []);

    const handleSelectSession = useCallback((session) => {
        setSelectedSession((prev) => (prev === session ? null : session));
    }, []);

    const updateSessionRule = useCallback((sessionKey, updater) => {
        setSessionRules((prev) => {
            const current = prev[sessionKey] ?? buildDefaultSessionRules([sessionKey])[sessionKey];
            const next = { ...prev, [sessionKey]: updater(current) };
            try { localStorage.setItem(RULES_LS_KEY, JSON.stringify(next)); } catch { /* noop */ }
            return next;
        });
    }, []);

    const toggleSessionEnabled = useCallback((sessionKey) => {
        updateSessionRule(sessionKey, (r) => ({ ...r, enabled: !r.enabled }));
    }, [updateSessionRule]);

    const toggleSessionLong = useCallback((sessionKey) => {
        updateSessionRule(sessionKey, (r) => ({
            ...r,
            direction: { ...r.direction, long: !r.direction.long },
        }));
    }, [updateSessionRule]);

    const toggleSessionShort = useCallback((sessionKey) => {
        updateSessionRule(sessionKey, (r) => ({
            ...r,
            direction: { ...r.direction, short: !r.direction.short },
        }));
    }, [updateSessionRule]);

    const resetRules = useCallback(() => {
        const defaults = buildDefaultSessionRules();
        setSessionRules(defaults);
        try { localStorage.removeItem(RULES_LS_KEY); } catch { /* noop */ }
    }, []);

    // ── Derived data ─────────────────────────────────────────────────────────

    // Direction-filtered trades (global toggle, before session rules)
    const dirTrades = useMemo(() => filterByDirection(trades || [], direction), [trades, direction]);

    // Apply session rules on top of direction filter
    const { includedTrades } = useMemo(
        () => applySessionRules(dirTrades, sessionRules),
        [dirTrades, sessionRules],
    );

    // Preview comparison (only meaningful when rules are active)
    const previewComparison = useMemo(
        () => computePreviewComparison(dirTrades, includedTrades),
        [dirTrades, includedTrades],
    );

    const rulesActive = useMemo(() => hasActiveRules(sessionRules), [sessionRules]);

    // Profiles computed from ORIGINAL dirTrades (cards always show true metrics)
    const profiles = useMemo(
        () => buildSessionProfiles(trades || [], direction),
        [trades, direction],
    );

    // Comparison table rows (based on filtered trades)
    const comparisonRows = useMemo(
        () => buildSessionComparisonRows(buildSessionProfiles(includedTrades, direction)),
        [includedTrades, direction],
    );

    // Snapshots for all sessions (lazy per-session)
    const snapshots = useMemo(() => {
        const map = {};
        for (const p of profiles) {
            if (p.metrics.tradeCount > 0) map[p.session] = buildCardSnapshot(p.sessionTrades);
        }
        return map;
    }, [profiles]);

    // Active session profile for drilldown
    const activeProfile = selectedSession
        ? profiles.find((p) => p.session === selectedSession) || null
        : null;

    const hasAnyTrades = profiles.some((p) => p.metrics.tradeCount > 0);

    return (
        <div className="space-y-5">
            {/* Top controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-[0.12em] text-muted-lab">Direction</span>
                    <Segment
                        options={DIRECTION_OPTIONS}
                        value={direction}
                        onChange={handleDirectionChange}
                        testId="session-direction-toggle"
                    />
                </div>
                {rulesActive && (
                    <button
                        type="button"
                        onClick={resetRules}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--warning)/0.45)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm hover:bg-[hsl(var(--warning)/0.12)] transition-colors"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Reset Session Rules
                    </button>
                )}
                <div className="ml-auto">
                    <SessionSettingsButton />
                </div>
            </div>

            {/* Direction banner */}
            <DirectionBanner direction={direction} />

            {/* Filtered preview panel */}
            {rulesActive && (
                <PreviewPanel comparison={previewComparison} onReset={resetRules} />
            )}

            {/* Asymmetric entry preview */}
            <AsymmetricEntryPreview bundle={bundle} activeVariant={activeVariant} />

            {/* Session card grid */}
            {!hasAnyTrades ? (
                <div className="text-[12px] font-ui text-muted-lab border border-dashed border-[hsl(var(--border-soft))] clip-bevel-sm px-6 py-8 text-center">
                    No trades found in the active run for this direction filter.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {profiles
                            .filter((p) => p.metrics.tradeCount > 0)
                            .map((profile) => (
                                <SessionCard
                                    key={profile.session}
                                    session={profile.session}
                                    metrics={profile.metrics}
                                    sessionTrades={profile.sessionTrades}
                                    onSelect={handleSelectSession}
                                    isSelected={selectedSession === profile.session}
                                    rule={sessionRules[profile.session] ?? null}
                                    snapshot={snapshots[profile.session] ?? null}
                                    onToggleEnabled={toggleSessionEnabled}
                                    onToggleLong={toggleSessionLong}
                                    onToggleShort={toggleSessionShort}
                                />
                            ))}
                    </div>

                    {/* Inline drilldown */}
                    {activeProfile && (
                        <SessionDrilldown
                            session={activeProfile.session}
                            metrics={activeProfile.metrics}
                            sessionTrades={activeProfile.sessionTrades}
                            allTrades={trades || []}
                            direction={direction}
                        />
                    )}
                </>
            )}

            {/* Session Comparison Table */}
            {comparisonRows.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-ui uppercase tracking-[0.12em] text-muted-lab">
                            Session Comparison
                        </span>
                        {direction !== "both" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))] clip-bevel-sm">
                                {direction === "long" ? "Longs" : "Shorts"}
                            </span>
                        )}
                        {rulesActive && (
                            <span className="px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] clip-bevel-sm">
                                Filtered
                            </span>
                        )}
                    </div>
                    <CanonicalBucketTable
                        title="All Sessions"
                        rawRows={comparisonRows}
                        trades={includedTrades}
                        def={{
                            labelFn: (t) => resolveSession(t),
                            order: SESSION_KEYS,
                        }}
                        basisFooter
                        controlsPopover
                        defaultSortKey="netR"
                    />
                </div>
            )}
        </div>
    );
}

export default SessionLabWorkspace;
