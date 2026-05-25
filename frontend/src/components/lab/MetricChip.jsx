import React from "react";
import { cn } from "@/lib/utils";

// Premium beveled/octagonal KPI chip — the design primitive of FX-OB Research Lab.
// Outer accent border + inner panel via stacked clip-paths. Glowing value text.
export function MetricChip({
    label,
    value,
    sub,
    tone = "primary",        // primary | secondary | success | danger | warning | muted
    icon: Icon,
    sparkline,               // optional array of numbers
    selected = false,
    onClick,
    className,
    valueClassName,
    testId,
}) {
    const valueColor = {
        primary:   "text-[hsl(var(--accent-primary))] text-glow-primary",
        secondary: "text-[hsl(var(--accent-secondary))] text-glow-secondary",
        success:   "text-[hsl(var(--success))] text-glow-success",
        danger:    "text-[hsl(var(--danger))]",
        warning:   "text-[hsl(var(--warning))]",
        muted:     "text-[hsl(var(--text))]",
    }[tone];

    return (
        <div
            data-testid={testId}
            onClick={onClick}
            className={cn(
                "relative isolate group",
                onClick && "cursor-pointer",
                className,
            )}
        >
            {/* Outer beveled border layer */}
            <div
                className={cn(
                    "clip-bevel p-[1px] transition-all duration-300",
                    "bg-gradient-to-br from-[hsl(var(--accent-border)/0.9)] via-[hsl(var(--border-mid))] to-[hsl(var(--accent-secondary)/0.55)]",
                    selected && "from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]",
                    "group-hover:from-[hsl(var(--accent-primary))] group-hover:to-[hsl(var(--accent-secondary))]",
                )}
            >
                {/* Inner panel */}
                <div className="clip-bevel relative overflow-hidden bg-[hsl(var(--panel))]">
                    <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--accent-primary)/0.06)] via-transparent to-[hsl(var(--accent-secondary)/0.04)] pointer-events-none" />
                    <div className="relative px-4 pt-3 pb-3.5 min-h-[96px] flex flex-col justify-between">
                        <div className="flex items-center gap-2">
                            {Icon && <Icon className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))]" />}
                            <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-[hsl(var(--accent-primary))]">
                                {label}
                            </span>
                        </div>
                        <div className="flex items-end justify-between gap-2 mt-1">
                            <div className={cn("font-display font-semibold leading-none text-[28px] tabular-nums", valueColor, valueClassName)}>
                                {value}
                            </div>
                            {sparkline && <MiniSpark data={sparkline} tone={tone} />}
                        </div>
                        {sub && (
                            <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-lab mt-1">
                                {sub}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MiniSpark({ data, tone = "primary" }) {
    if (!data || data.length < 2) return null;
    const w = 64, h = 22;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data
        .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
        .join(" ");
    const stroke = tone === "secondary" ? "hsl(var(--accent-secondary))" : "hsl(var(--accent-primary))";
    return (
        <svg width={w} height={h} className="opacity-90 shrink-0">
            <polyline
                fill="none"
                stroke={stroke}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
                style={{ filter: `drop-shadow(0 0 4px ${stroke})` }}
            />
        </svg>
    );
}
