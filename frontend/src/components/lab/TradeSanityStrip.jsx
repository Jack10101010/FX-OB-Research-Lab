/**
 * TradeSanityStrip — premium reusable trade roll-up strip.
 *
 * Drop-in summary chip strip for any page that lists trades. It runs the
 * canonical `summarizeTradeSanity` over the trades you pass in, then renders
 * a responsive row of dense stat tiles.
 *
 * Props
 * ─────
 *   trades         {Array}    Trade list to summarize. Required unless `stats`
 *                             is supplied.
 *   stats          {object}   Pre-computed sanity stats (output of
 *                             summarizeTradeSanity). When supplied, `trades`
 *                             is ignored. Useful when the parent already has
 *                             stats in scope.
 *   title          {string}   Optional small uppercase title above the strip.
 *   subtitle       {string}   Optional small muted line under the title.
 *   compact        {boolean}  Shorter set of tiles (Rows / Valid / W/L /
 *                             Net R / WR / DD / PF).
 *   showBreakdown  {boolean}  Default true. When false, omits Long/Short and
 *                             gross-R splits.
 *   className      {string}   Extra wrapper classes.
 *
 * Style language
 * ──────────────
 *   Borders + dark panel match the rest of the lab UI. R-positive values
 *   render in success green, R-negative in danger red, "protected" trades
 *   in violet/accent-secondary (matches the protection palette used on the
 *   chart overlays). Counts that are zero render muted so the eye skips over
 *   them.
 */

import React from "react";
import { summarizeTradeSanity } from "@/data/tradeClassification";

// ────────────────────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────────────────────

function fmtCount(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("en");
}

function fmtR(value, digits = 2) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(digits)}R`;
}

function fmtRSigned(value, digits = 2) {
    // For grossLossR (negative) we keep the leading minus from toFixed.
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return `${Number(value).toFixed(digits)}R`;
}

function fmtPct(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return `${Number(value).toFixed(digits)}%`;
}

function fmtPF(value) {
    if (value == null) return "—";
    if (!Number.isFinite(value)) return "∞";
    return value.toFixed(2);
}

// Tone palette — kept in one place so theming changes ripple through.
const TONES = {
    success:    "text-[hsl(var(--success))]",
    danger:     "text-[hsl(var(--danger))]",
    bear:       "text-[hsl(var(--bear))]",
    warning:    "text-[hsl(var(--warning))]",
    protected:  "text-[hsl(var(--accent-secondary))]", // violet — protection
    accent:     "text-[hsl(var(--accent-primary))]",
    muted:      "text-[hsl(var(--text-muted))]",
    base:       "text-[hsl(var(--text-base))]",
};

function StatTile({ label, value, tone = "base", hint, zero = false, title }) {
    const valueClass = zero ? TONES.muted : (TONES[tone] || TONES.base);
    return (
        <div
            className="flex flex-col gap-[2px] px-2.5 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.45)] clip-bevel-sm min-w-[58px]"
            title={title}
        >
            <span className="font-mono text-[9px] uppercase tracking-wider leading-none text-[hsl(var(--text-muted))]">
                {label}
            </span>
            <span className={`font-mono text-[12px] font-semibold tabular-nums leading-tight ${valueClass}`}>
                {value}
            </span>
            {hint && (
                <span className="font-mono text-[9px] leading-none text-[hsl(var(--text-3))]">
                    {hint}
                </span>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers used inside the strip
// ────────────────────────────────────────────────────────────────────────────

function netRTone(netR) {
    if (netR == null || !Number.isFinite(Number(netR))) return "base";
    if (netR > 0.005) return "success";
    if (netR < -0.005) return "danger";
    return "muted";
}

function pfTone(pf) {
    if (pf == null) return "muted";
    if (!Number.isFinite(pf)) return "success";
    if (pf >= 1.5) return "success";
    if (pf >= 1) return "accent";
    return "danger";
}

function wrTone(wr) {
    if (wr == null) return "muted";
    if (wr >= 50) return "success";
    if (wr >= 35) return "accent";
    return "danger";
}

// ────────────────────────────────────────────────────────────────────────────
// Strip
// ────────────────────────────────────────────────────────────────────────────

export function TradeSanityStrip({
    trades,
    stats,
    title,
    subtitle,
    compact = false,
    showBreakdown = true,
    className = "",
}) {
    const resolved = React.useMemo(() => {
        if (stats) return stats;
        return summarizeTradeSanity(trades || []);
    }, [stats, trades]);

    const {
        total = 0,
        performanceTrades = 0,
        wins = 0,
        losses = 0,
        flats = 0,
        winRate = null,
        netRPerformance = null,
        grossWinR = 0,
        grossLossR = 0,
        longCount = 0,
        shortCount = 0,
        invalidCancelled = 0, // Internal name kept; user-facing label is "Protected".
        unfilled = 0,
        excludedSetups = 0,
        sessionFiltered = 0,
        newsCancelled = 0,
        newsFlattenTotal = 0,
        profitFactor = null,
        expectancy = null,
        maxDrawdownR = null,
    } = resolved;

    // Compact mode: only the headline tiles, no direction/gross breakdown.
    // Used inside dense parent strips (ScenarioSelector, narrow side panels).
    const tilesCompact = [
        { key: "rows",   label: "Rows",  value: fmtCount(total) },
        { key: "valid",  label: "Valid", value: fmtCount(performanceTrades),
          hint: performanceTrades !== total ? `of ${fmtCount(total)}` : null },
        { key: "wl",     label: "W/L",   value: `${fmtCount(wins)} / ${fmtCount(losses)}`,
          tone: winRate != null ? wrTone(winRate) : "base" },
        { key: "netr",   label: "Net R", value: fmtR(netRPerformance), tone: netRTone(netRPerformance) },
        { key: "wr",     label: "WR",    value: fmtPct(winRate), tone: wrTone(winRate) },
        ...(maxDrawdownR != null
            ? [{ key: "dd", label: "DD",
                value: fmtRSigned(maxDrawdownR === 0 ? 0 : maxDrawdownR),
                tone: maxDrawdownR < -0.005 ? "warning" : "muted" }]
            : []),
        ...(profitFactor != null
            ? [{ key: "pf", label: "PF", value: fmtPF(profitFactor), tone: pfTone(profitFactor) }]
            : []),
    ];

    const tilesFull = [
        { key: "rows",  label: "Rows",  value: fmtCount(total) },
        { key: "valid", label: "Valid", value: fmtCount(performanceTrades),
          hint: performanceTrades !== total ? `of ${fmtCount(total)}` : null },
        { key: "wlf",   label: flats > 0 ? "W / L / F" : "W / L",
          value: flats > 0
              ? `${fmtCount(wins)} / ${fmtCount(losses)} / ${fmtCount(flats)}`
              : `${fmtCount(wins)} / ${fmtCount(losses)}`,
          tone: winRate != null ? wrTone(winRate) : "base" },
        ...(showBreakdown
            ? [{ key: "ls",    label: "L / S",
                value: `${fmtCount(longCount)} / ${fmtCount(shortCount)}`,
                zero: longCount + shortCount === 0,
                hint: longCount + shortCount === 0 ? "no direction" : null }]
            : []),
        ...(showBreakdown
            ? [{ key: "winr",  label: "Win R",  value: fmtR(grossWinR),
                tone: grossWinR > 0 ? "success" : "muted", zero: grossWinR === 0 }]
            : []),
        ...(showBreakdown
            ? [{ key: "lossr", label: "Loss R", value: fmtRSigned(grossLossR),
                tone: grossLossR < 0 ? "danger" : "muted", zero: grossLossR === 0 }]
            : []),
        { key: "netr",  label: "Net R", value: fmtR(netRPerformance), tone: netRTone(netRPerformance) },
        { key: "wr",    label: "WR",    value: fmtPct(winRate), tone: wrTone(winRate) },
        ...(maxDrawdownR != null
            ? [{ key: "dd", label: "DD",
                value: fmtRSigned(maxDrawdownR === 0 ? 0 : maxDrawdownR),
                tone: maxDrawdownR < -0.005 ? "warning" : "muted",
                zero: maxDrawdownR === 0 }]
            : []),
        ...(expectancy != null
            ? [{ key: "exp", label: "Exp",
                value: fmtR(expectancy, 3),
                tone: expectancy > 0 ? "success" : expectancy < 0 ? "danger" : "muted",
                zero: expectancy === 0 }]
            : []),
        ...(profitFactor != null
            ? [{ key: "pf", label: "PF", value: fmtPF(profitFactor), tone: pfTone(profitFactor) }]
            : []),
        // Violet "Protected" — these trades were saved from a bad fill by the
        // entry model. NOT losses. NOT in PF / WR / Net R. Kept visible so
        // the user can see how often the protection kicked in.
        { key: "prot", label: "Protected", value: fmtCount(invalidCancelled),
          tone: "protected", zero: invalidCancelled === 0,
          title: "Setups protected before edge entry (avoided bad fills)." },
        // "Excl." rolls UNFILLED + SESSION_FILTERED + NEWS_CANCELLED + OPEN +
        // UNKNOWN (everything that isn't a performance trade and isn't a
        // protected trade) into one tile so the strip stays compact.
        { key: "excl", label: "Excl.", value: fmtCount(Math.max(0, excludedSetups - invalidCancelled)),
          tone: "muted", zero: (excludedSetups - invalidCancelled) <= 0,
          title: `Excluded setups: ${fmtCount(unfilled)} unfilled · ${fmtCount(sessionFiltered)} session-filtered · ${fmtCount(newsCancelled)} news-cancelled` },
        ...(newsFlattenTotal > 0
            ? [{ key: "nf", label: "News flat",
                value: fmtCount(newsFlattenTotal),
                tone: "warning",
                title: "Trades flattened early by the news blackout. Counted in wins / losses by R sign." }]
            : []),
    ];

    const tiles = compact ? tilesCompact : tilesFull;

    return (
        <div
            className={`flex flex-wrap items-center gap-2 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2 ${className}`.trim()}
            data-testid="trade-sanity-strip"
        >
            {(title || subtitle) && (
                <div className="flex flex-col gap-[2px] mr-1 pr-2 border-r border-[hsl(var(--border-soft))]">
                    {title && (
                        <span className="font-mono text-[9.5px] uppercase tracking-widest text-[hsl(var(--accent-primary))]">
                            {title}
                        </span>
                    )}
                    {subtitle && (
                        <span className="font-mono text-[10px] text-[hsl(var(--text-2))]">
                            {subtitle}
                        </span>
                    )}
                </div>
            )}
            {tiles.map((tile) => (
                <StatTile
                    key={tile.key}
                    label={tile.label}
                    value={tile.value}
                    tone={tile.tone}
                    hint={tile.hint}
                    zero={tile.zero}
                    title={tile.title}
                />
            ))}
        </div>
    );
}

export default TradeSanityStrip;
