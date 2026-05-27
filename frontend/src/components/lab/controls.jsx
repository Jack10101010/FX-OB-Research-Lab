import React from "react";
import { cn } from "@/lib/utils";

// Segmented control / chip toggle group used across builder + filter UIs.
export function Segment({ options, value, onChange, className, testId }) {
    return (
        <div data-testid={testId} className={cn("inline-flex p-0.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] clip-bevel-sm", className)}>
            {options.map((opt) => {
                const val = typeof opt === "string" ? opt : opt.value;
                const label = typeof opt === "string" ? opt : opt.label;
                const active = value === val;
                return (
                    <button
                        key={val}
                        onClick={() => onChange(val)}
                        data-testid={`seg-${String(val).toLowerCase().replace(/\s+/g, "-")}`}
                        className={cn(
                            "px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors clip-bevel-sm",
                            active
                                ? "bg-[hsl(var(--accent-primary)/0.18)] text-white"
                                : "text-[hsl(var(--text-2))] hover:text-white",
                        )}
                        style={active ? { boxShadow: "inset 0 0 0 1px hsl(var(--accent-primary) / 0.6)" } : undefined}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export function Field({ label, hint, children, className }) {
    return (
        <label className={cn("flex flex-col gap-1.5", className)}>
            <span className="control-label uppercase">{label}</span>
            {children}
            {hint && <span className="text-[10px] text-muted-lab">{hint}</span>}
        </label>
    );
}

export function NeonInput({ className, ...props }) {
    return (
        <input
            {...props}
            className={cn(
                "control-value-font bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-3 py-2 text-[12px] text-white",
                "outline-none transition-colors clip-bevel-sm",
                "focus:border-[hsl(var(--accent-primary))] focus:shadow-[0_0_0_1px_hsl(var(--accent-primary)),_0_0_18px_-4px_hsl(var(--accent-primary))]",
                className,
            )}
        />
    );
}

export function NeonSelect({ options, value, onChange, className, testId }) {
    return (
        <select
            data-testid={testId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
                "control-value-font bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-3 py-2 text-[12px] text-white",
                "outline-none transition-colors clip-bevel-sm appearance-none pr-8",
                "focus:border-[hsl(var(--accent-primary))]",
                className,
            )}
            style={{
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23d946ef' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
            }}
        >
            {options.map((o) => {
                const v = typeof o === "string" ? o : o.value;
                const l = typeof o === "string" ? o : o.label;
                return <option key={v} value={v}>{l}</option>;
            })}
        </select>
    );
}

export function NeonToggle({ checked, onChange, label, testId }) {
    return (
        <button
            data-testid={testId}
            onClick={() => onChange(!checked)}
            className="flex items-center gap-2 group"
        >
            <span
                className={cn(
                    "relative w-9 h-5 border transition-colors clip-bevel-sm",
                    checked
                        ? "bg-[hsl(var(--accent-primary)/0.25)] border-[hsl(var(--accent-primary))]"
                        : "bg-[hsl(var(--panel-2))] border-[hsl(var(--border-mid))]",
                )}
            >
                <span
                    className={cn(
                        "absolute top-0.5 w-3.5 h-3.5 transition-all",
                        checked ? "left-[18px] bg-[hsl(var(--accent-primary))]" : "left-0.5 bg-[hsl(var(--muted))]",
                    )}
                    style={checked ? { boxShadow: "0 0 10px hsl(var(--accent-primary))" } : undefined}
                />
            </span>
            {label && <span className="text-[12px] font-medium text-[hsl(var(--text-2))] group-hover:text-white">{label}</span>}
        </button>
    );
}

/** Status pill for lab run heroes (Run Detail, Protection, OBL pattern). */
export function HeroBadge({ tone = "muted", children, className }) {
    const toneClass = {
        primary:   "border-[hsl(var(--accent-primary)/0.42)] bg-[hsl(var(--accent-primary)/0.07)] text-[hsl(var(--accent-primary))]",
        secondary: "border-[hsl(var(--accent-secondary)/0.42)] bg-[hsl(var(--accent-secondary)/0.07)] text-[hsl(var(--accent-secondary))]",
        success:   "border-[hsl(var(--success)/0.42)] bg-[hsl(var(--success)/0.07)] text-[hsl(var(--success))]",
        warning:   "border-[hsl(var(--warning)/0.42)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]",
        danger:    "border-[hsl(var(--danger)/0.42)] bg-[hsl(var(--danger)/0.07)] text-[hsl(var(--danger))]",
        muted:     "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.54)] text-[hsl(var(--text-2))]",
    }[tone] || "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.54)] text-[hsl(var(--text-2))]";

    return (
        <span className={cn("inline-flex items-center rounded-[3px] border px-2.5 py-1 text-[11px] font-medium font-display", toneClass, className)}>
            {children}
        </span>
    );
}

const FILTER_TOGGLE_SIZE = {
    default: "px-2.5 py-1 text-[10px]",
    compact: "px-2 py-0.5 text-[10px]",
};

const FILTER_TOGGLE_ACTIVE = {
    primary: "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]",
    success: "border-[hsl(var(--success)/0.9)] bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
    danger: "border-[hsl(var(--danger)/0.9)] bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]",
    warning: "border-[hsl(var(--warning)/0.9)] bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
    muted: "border-[hsl(var(--text-2)/0.9)] bg-[hsl(var(--text-2)/0.12)] text-[hsl(var(--text))]",
};

const FILTER_TOGGLE_INACTIVE = {
    soft: "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary)/0.4)] hover:text-[hsl(var(--text))]",
    mid: "border-[hsl(var(--border-mid))] text-muted-lab hover:border-[hsl(var(--accent-primary)/0.4)] hover:text-[hsl(var(--text))]",
};

const FILTER_TOGGLE_DOT = {
    primary: "hsl(var(--accent-primary))",
    secondary: "hsl(var(--accent-secondary))",
    success: "hsl(var(--success))",
    danger: "hsl(var(--danger))",
    warning: "hsl(var(--warning))",
};

/** Toggle chip for filter bars and panel controls (GlobalFilterBar / Run Detail pattern). */
export function FilterToggle({
    active = false,
    onClick,
    children,
    className,
    testId,
    type = "button",
    disabled,
    title,
    size = "default",
    tone = "primary",
    inactiveBorder = "soft",
    dot,
}) {
    const dotColor = dot ? FILTER_TOGGLE_DOT[dot] || FILTER_TOGGLE_DOT.primary : null;
    const activeClass = FILTER_TOGGLE_ACTIVE[tone] || FILTER_TOGGLE_ACTIVE.primary;
    const inactiveClass = FILTER_TOGGLE_INACTIVE[inactiveBorder] || FILTER_TOGGLE_INACTIVE.soft;
    const layerActive = dot && active
        ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--panel-2))] text-[hsl(var(--text))]"
        : activeClass;

    return (
        <button
            type={type}
            data-testid={testId}
            disabled={disabled}
            title={title}
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 clip-bevel-sm border font-display font-medium uppercase tracking-[0.08em] transition-colors select-none",
                FILTER_TOGGLE_SIZE[size] || FILTER_TOGGLE_SIZE.default,
                active ? (dot ? layerActive : activeClass) : inactiveClass,
                !active && dot && "opacity-60",
                disabled && "opacity-40 cursor-not-allowed",
                className,
            )}
        >
            {dotColor && (
                <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                        background: dotColor,
                        opacity: active ? 1 : 0.45,
                        boxShadow: active ? `0 0 6px ${dotColor}` : undefined,
                    }}
                />
            )}
            {children}
        </button>
    );
}

export function NeonButton({ children, tone = "primary", className, icon: Icon, ...props }) {
    const map = {
        primary:   "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.10)] hover:bg-[hsl(var(--accent-primary)/0.22)]",
        secondary: "border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.10)] hover:bg-[hsl(var(--accent-secondary)/0.22)]",
        ghost:     "border-[hsl(var(--border-mid))] hover:border-[hsl(var(--accent-primary))]",
        success:   "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.10)] hover:bg-[hsl(var(--success)/0.22)]",
        danger:    "border-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.10)] hover:bg-[hsl(var(--danger)/0.22)]",
    };
    return (
        <button
            {...props}
            className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] border clip-bevel-sm text-white transition-colors",
                map[tone],
                className,
            )}
        >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {children}
        </button>
    );
}
