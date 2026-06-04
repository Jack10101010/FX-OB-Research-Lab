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

// ── SessionLabWorkspace ───────────────────────────────────────────────────────

export function SessionLabWorkspace({ trades, bundle }) {
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
