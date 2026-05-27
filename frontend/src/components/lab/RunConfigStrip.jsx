// ── RunConfigStrip.jsx ───────────────────────────────────────────────────────
// Thin, chip-based strip that displays the high-signal config that produced a
// run. Sits between the LabRunHero and the KPI strip on lab/run pages.
//
// Usage (single run):
//   <RunConfigStrip run={runData} />
//   <RunConfigStrip run={runData} dense />
//
// Usage (comparison — multiple selected runs):
//   <ComparisonConfigStrip runs={[run1, run2, run3]} />
//
// Safety:
//   • Null run → renders nothing.
//   • Index-only runs (no full config) → shows whatever summary fields exist.
//   • Missing fields → omitted (no "—" clutter), unless showMissing=true.
//   • 0 is a valid value and is shown, never suppressed.

import React from "react";
import { cn } from "@/lib/utils";
import {
    extractRunConfig,
    formatRunConfigValue,
    compareRunConfigs,
} from "./runConfigHelpers";
import { getRunDisplayName } from "@/data/store";

// ─────────────────────────────────────────────────────────────────────────────
// Internal chip
// ─────────────────────────────────────────────────────────────────────────────
function ConfigChip({ label, value, diff = false, className }) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 h-[22px] px-2 rounded-[3px]",
                "border text-[10px] font-mono leading-none shrink-0 transition-colors",
                diff
                    ? "border-[hsl(var(--warning)/0.55)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]"
                    : "border-[hsl(210_70%_55%/0.35)] bg-[hsl(210_70%_55%/0.06)] text-[hsl(210_80%_72%)]",
                className,
            )}
        >
            {label && (
                <span className="uppercase tracking-[0.07em] text-[hsl(var(--text-3))] text-[9px] font-semibold shrink-0">
                    {label}
                </span>
            )}
            {label && <span className="text-[hsl(var(--border-mid))] shrink-0">·</span>}
            <span className={cn("text-[hsl(var(--text-1))] tabular-nums", diff && "text-[hsl(var(--warning))] font-semibold")}>
                {value}
            </span>
            {diff && (
                <span className="ml-0.5 text-[8px] text-[hsl(var(--warning)/0.8)] font-bold uppercase tracking-wide shrink-0">
                    △
                </span>
            )}
        </div>
    );
}

// Visual group separator
function ChipDivider() {
    return <span className="w-px h-3.5 bg-[hsl(var(--border-soft)/0.7)] shrink-0 mx-0.5" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build chip list from an extracted config object.
// diffFields is a Set of fields that differ across selected runs (optional).
// ─────────────────────────────────────────────────────────────────────────────
function buildChips(config, diffFields = new Set()) {
    const chips = [];
    const hasDiff = diffFields.size > 0;

    const isDiff = (field) => hasDiff && diffFields.has(field);
    const fmt = (field, value) => {
        const formatted = formatRunConfigValue(field, value);
        return formatted != null ? { field, label: CHIP_META[field]?.label ?? field, value: formatted, diff: isDiff(field) } : null;
    };

    const push = (field, value) => {
        if (value == null) return;
        // 0 is valid — only skip actual null/undefined
        const chip = fmt(field, value);
        if (chip) chips.push(chip);
    };

    // ── Core group ───────────────────────────────────────────────────────────
    push("symbol",          config.symbol);
    push("detectionTf",     config.detectionTf);
    push("rr",              config.rr);
    push("structureFilter", config.structureFilter);
    push("tradeDirection",  config.tradeDirection);

    const coreEnd = chips.length;

    // ── Entry group ──────────────────────────────────────────────────────────
    push("entryDepthPct",         config.entryDepthPct);
    push("entryBuffer",           config.entryBuffer);
    push("stopBuffer",            config.stopBuffer);
    push("verifyTicks",           config.verifyTicks);
    push("entryExportMode",       config.entryExportMode);
    push("penetrationThresholds", config.penetrationThresholds);
    push("batchEntry",            config.batchEntry);

    const entryEnd = chips.length;

    // ── Filter group ─────────────────────────────────────────────────────────
    push("minObSize",       config.minObSize);
    push("maxObSize",       config.maxObSize);
    push("sessions",        config.sessions);

    const filterEnd = chips.length;

    // ── News group ───────────────────────────────────────────────────────────
    push("newsEnabled",        config.newsEnabled);
    push("newsBlackoutBefore", config.newsBlackoutBefore);
    push("newsBlackoutAfter",  config.newsBlackoutAfter);
    push("flattenOnNews",      config.flattenOnNews);

    return { chips, coreEnd, entryEnd, filterEnd };
}

// Chip metadata: short label text shown before the value
const CHIP_META = {
    symbol:                  { label: "sym"     },
    detectionTf:             { label: "tf"      },
    rr:                      { label: null       },   // value already includes "R"
    dateRange:               { label: null       },   // self-explanatory
    executionMode:           { label: "exec"    },
    tradeDirection:          { label: "dir"     },
    entryDepthPct:           { label: "depth"   },
    entryBuffer:             { label: "e.buf"   },
    stopBuffer:              { label: "s.buf"   },
    verifyTicks:             { label: "verify"  },
    entryExportMode:         { label: "export"  },
    penetrationThresholds:   { label: "pen"     },
    batchEntry:              { label: "batch"   },
    structureFilter:         { label: "struct"  },
    sessions:                { label: "sess"    },
    minObSize:               { label: "ob.min"  },
    maxObSize:               { label: "ob.max"  },
    newsEnabled:             { label: "news"    },
    newsBlackoutBefore:      { label: null       },   // formatRunConfigValue includes context
    newsBlackoutAfter:       { label: null       },
    flattenOnNews:           { label: "flatten" },
};

// ─────────────────────────────────────────────────────────────────────────────
// RunConfigStrip — single-run variant
// Props:
//   run        — the raw run bundle (or index-only run entry)
//   dense      — slightly smaller chip row (no vertical padding)
//   className  — wrapper override
// ─────────────────────────────────────────────────────────────────────────────
export function RunConfigStrip({ run, dense = false, className }) {
    const config = React.useMemo(() => extractRunConfig(run), [run]);

    const { chips, coreEnd, entryEnd, filterEnd } = React.useMemo(
        () => buildChips(config),
        [config],
    );

    if (!run || !chips.length) return null;

    return (
        <div
            className={cn(
                "mx-6 mb-4 flex items-center flex-wrap gap-1",
                dense ? "py-0" : "py-0.5",
                "relative",
                className,
            )}
            aria-label="Run configuration"
        >
            {chips.map((chip, i) => {
                const showDivider =
                    (i === coreEnd  && i < chips.length) ||
                    (i === entryEnd && i < chips.length) ||
                    (i === filterEnd && i < chips.length);
                return (
                    <React.Fragment key={chip.field}>
                        {showDivider && <ChipDivider />}
                        <ConfigChip label={chip.label} value={chip.value} />
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ComparisonConfigStrip — stacked strips for 2–4 selected runs.
// Highlights chips where values differ across runs.
//
// Props:
//   runs       — array of run bundles (2–4 recommended)
//   className  — wrapper override
// ─────────────────────────────────────────────────────────────────────────────
export function ComparisonConfigStrip({ runs, className }) {
    const { configs, diffFields } = React.useMemo(
        () => compareRunConfigs(runs),
        [runs],
    );

    if (!Array.isArray(runs) || !runs.length) return null;

    return (
        <div className={cn("mx-6 mb-4 space-y-2", className)} aria-label="Run config comparison">
            {/* Header bar */}
            {diffFields.size > 0 && (
                <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--warning)/0.9)]">
                    <span className="h-px w-6 bg-[hsl(var(--warning)/0.5)]" />
                    {diffFields.size} field{diffFields.size === 1 ? "" : "s"} differ — △ marks differences
                </div>
            )}

            {runs.map((run, idx) => {
                if (!run) return null;
                const config = configs[idx] || extractRunConfig(run);
                const { chips, coreEnd, entryEnd, filterEnd } = buildChips(config, diffFields);
                const displayName = getRunDisplayName(run);

                return (
                    <div key={run.id ?? idx} className="flex items-start gap-2 flex-wrap">
                        {/* Run label */}
                        <div className="flex items-center shrink-0 h-[22px]">
                            <span className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--text-3))] max-w-[120px] truncate">
                                {displayName}
                            </span>
                            <span className="ml-1.5 w-px h-3 bg-[hsl(var(--border-soft)/0.6)]" />
                        </div>

                        {/* Chips */}
                        <div className="flex items-center flex-wrap gap-1">
                            {chips.map((chip, i) => {
                                const showDivider =
                                    (i === coreEnd   && i < chips.length) ||
                                    (i === entryEnd  && i < chips.length) ||
                                    (i === filterEnd && i < chips.length);
                                return (
                                    <React.Fragment key={chip.field}>
                                        {showDivider && <ChipDivider />}
                                        <ConfigChip label={chip.label} value={chip.value} diff={chip.diff} />
                                    </React.Fragment>
                                );
                            })}
                            {!chips.length && (
                                <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">No config available</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
