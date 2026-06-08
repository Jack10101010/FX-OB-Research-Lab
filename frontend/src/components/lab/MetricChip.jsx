import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const SIZE_STYLES = {
    default: {
        body: "px-4 pt-3 pb-3.5 min-h-[96px]",
        label: "text-[10px] tracking-[0.1em]",
        value: "text-[28px]",
        sub: "text-[10.5px]",
        icon: "w-3.5 h-3.5",
    },
    compact: {
        body: "px-3 pt-2.5 pb-3 min-h-[72px]",
        label: "text-[9.5px] tracking-[0.08em]",
        value: "text-[22px]",
        sub: "text-[10px]",
        icon: "w-3 h-3",
    },
};

// Premium beveled KPI chip — canonical metric card for FX-OB Research Lab.
export function MetricChip({
    label,
    value,
    sub,
    tone = "primary",        // primary | secondary | success | danger | warning | muted
    size = "default",        // default | compact
    icon: Icon,
    sparkline,
    selected = false,
    onClick,
    className,
    valueClassName,
    subClassName,
    testId,
    infoLabel = "Click for breakdown",   // hover hint on the ⓘ when the chip is clickable
}) {
    const sz = SIZE_STYLES[size] || SIZE_STYLES.default;

    const valueColor = {
        primary:   "text-[hsl(var(--accent-primary))] text-glow-primary",
        secondary: "text-[hsl(var(--accent-secondary))] text-glow-secondary",
        success:   "text-[hsl(var(--success))] text-glow-success",
        danger:    "text-[hsl(var(--danger))]",
        warning:   "text-[hsl(var(--warning))]",
        muted:     "text-[hsl(var(--text))]",
        default:   "text-[hsl(var(--text))]",
    }[tone] || "text-[hsl(var(--text))]";

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
            {onClick && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="absolute top-1.5 right-1.5 z-10 w-3.5 h-3.5 rounded-full border border-[hsl(var(--accent-primary)/0.45)] text-[hsl(var(--accent-primary))] grid place-items-center text-[7px] font-bold leading-none select-none opacity-50 group-hover:opacity-100 transition-opacity duration-200 cursor-help">
                            i
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">{infoLabel}</TooltipContent>
                </Tooltip>
            )}
            <div
                className={cn(
                    "clip-bevel p-[1px] transition-all duration-300",
                    "bg-gradient-to-br from-[hsl(var(--accent-border)/0.9)] via-[hsl(var(--border-mid))] to-[hsl(var(--accent-secondary)/0.55)]",
                    selected && "from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]",
                    "group-hover:from-[hsl(var(--accent-primary))] group-hover:to-[hsl(var(--accent-secondary))]",
                )}
            >
                <div className="clip-bevel relative overflow-hidden bg-[hsl(var(--panel))]">
                    <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--accent-primary)/0.06)] via-transparent to-[hsl(var(--accent-secondary)/0.04)] pointer-events-none" />
                    <div className={cn("relative flex flex-col justify-between", sz.body)}>
                        <div className="flex items-center gap-2">
                            {Icon && <Icon className={cn(sz.icon, "text-[hsl(var(--accent-primary))] shrink-0")} />}
                            <span
                                className={cn(
                                    "font-display font-semibold uppercase text-[hsl(var(--accent-primary))]",
                                    sz.label,
                                )}
                            >
                                {label}
                            </span>
                        </div>
                        <div className="flex items-end justify-between gap-2 mt-1">
                            <div className={cn("font-display font-semibold leading-none tabular-nums", sz.value, valueColor, valueClassName)}>
                                {value}
                            </div>
                            {sparkline && <MiniSpark data={sparkline} tone={tone} size={size} />}
                        </div>
                        {sub && (
                            <div className={cn("font-display text-muted-lab mt-1 leading-snug", sz.sub, subClassName)}>
                                {sub}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MiniSpark({ data, tone = "primary", size = "default" }) {
    if (!data || data.length < 2) return null;
    const w = size === "compact" ? 52 : 64;
    const h = size === "compact" ? 18 : 22;
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
