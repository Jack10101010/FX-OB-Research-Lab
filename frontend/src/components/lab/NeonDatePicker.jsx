import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// NeonDatePicker — theme-matched calendar popover replacing the native
// <input type="date">. Dependency-free; styled with the neon-lab tokens.
//
// Props:
//   value     "YYYY-MM-DD" (controlled) | "" for empty
//   onChange  (iso: "YYYY-MM-DD") => void
//   min, max  optional "YYYY-MM-DD" bounds (days outside are disabled)
//   testId, className, disabled
//
// All date math uses integer y/m/d + UTC construction, and ISO strings compare
// lexicographically — so there are no timezone off-by-one pitfalls.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // Monday-first

const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

function parseISO(value) {
    if (!value || typeof value !== "string") return null;
    const m = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based; day 0 of next month
}

// Monday-first weekday index (0=Mon … 6=Sun) of the 1st of the month.
function firstWeekdayMonday(y, m) {
    const jsDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun … 6=Sat
    return (jsDay + 6) % 7;
}

function todayISO() {
    const n = new Date();
    return toISO(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}

function formatDisplay(value) {
    const p = parseISO(value);
    if (!p) return "";
    return `${pad2(p.d)} ${MONTHS[p.m - 1]} ${p.y}`;
}

export function NeonDatePicker({ value, onChange, min, max, testId, className, disabled }) {
    const [open, setOpen] = useState(false);
    const selected = parseISO(value);
    const initial = selected || parseISO(max) || parseISO(todayISO());
    const [view, setView] = useState({ y: initial.y, m: initial.m }); // m is 1-based
    const rootRef = useRef(null);

    // Re-centre the view on the selected month whenever the popover opens.
    useEffect(() => {
        if (!open) return;
        const base = parseISO(value) || parseISO(max) || parseISO(todayISO());
        setView({ y: base.y, m: base.m });
    }, [open, value, max]);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const cells = useMemo(() => {
        const lead = firstWeekdayMonday(view.y, view.m);
        const total = daysInMonth(view.y, view.m);
        const out = [];
        for (let i = 0; i < lead; i += 1) out.push(null);
        for (let d = 1; d <= total; d += 1) out.push(d);
        return out;
    }, [view]);

    const today = todayISO();
    const outOfRange = (iso) => (min && iso < min) || (max && iso > max);

    // Disable month nav when the adjacent month is entirely outside the bounds.
    const prevDisabled = useMemo(() => {
        if (!min) return false;
        const py = view.m === 1 ? view.y - 1 : view.y;
        const pm = view.m === 1 ? 12 : view.m - 1;
        return toISO(py, pm, daysInMonth(py, pm)) < min;
    }, [view, min]);
    const nextDisabled = useMemo(() => {
        if (!max) return false;
        const ny = view.m === 12 ? view.y + 1 : view.y;
        const nm = view.m === 12 ? 1 : view.m + 1;
        return toISO(ny, nm, 1) > max;
    }, [view, max]);

    const step = (dir) => setView((v) => {
        let { y, m } = v;
        m += dir;
        if (m < 1) { m = 12; y -= 1; }
        if (m > 12) { m = 1; y += 1; }
        return { y, m };
    });

    const pick = (d) => {
        if (d == null) return;
        const iso = toISO(view.y, view.m, d);
        if (outOfRange(iso)) return;
        onChange?.(iso);
        setOpen(false);
    };

    return (
        <div ref={rootRef} className={cn("relative", className)}>
            <button
                type="button"
                data-testid={testId}
                disabled={disabled}
                onClick={() => !disabled && setOpen((o) => !o)}
                className={cn(
                    "w-full flex items-center justify-between gap-2 control-value-font bg-[hsl(var(--panel-2))]",
                    "border border-[hsl(var(--border-soft))] px-3 py-2 text-[12px] text-left clip-bevel-sm transition-colors",
                    "outline-none hover:border-[hsl(var(--accent-primary)/0.5)]",
                    open && "border-[hsl(var(--accent-primary))] shadow-[0_0_0_1px_hsl(var(--accent-primary)),_0_0_18px_-4px_hsl(var(--accent-primary))]",
                    disabled && "opacity-40 cursor-not-allowed",
                )}
            >
                <span className={value ? "text-white" : "text-[hsl(var(--text-2))]"}>
                    {value ? formatDisplay(value) : "Select date"}
                </span>
                <Calendar className="w-3.5 h-3.5 shrink-0 text-[hsl(var(--accent-primary))]" />
            </button>

            {open && (
                <div
                    className={cn(
                        "absolute z-50 mt-1 left-0 w-[15rem] p-2 clip-bevel-sm",
                        "bg-[hsl(var(--panel-1))] border border-[hsl(var(--border-mid))]",
                        "shadow-[0_8px_30px_-8px_rgba(0,0,0,0.7)]",
                    )}
                >
                    <div className="flex items-center justify-between mb-2">
                        <button
                            type="button"
                            onClick={() => !prevDisabled && step(-1)}
                            disabled={prevDisabled}
                            className={cn(
                                "w-6 h-6 inline-flex items-center justify-center clip-bevel-sm border border-[hsl(var(--border-soft))]",
                                "text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)] transition-colors",
                                prevDisabled && "opacity-30 cursor-not-allowed hover:text-[hsl(var(--text-2))] hover:border-[hsl(var(--border-soft))]",
                            )}
                            aria-label="Previous month"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-ui text-[12px] text-white tabular-nums">{MONTHS[view.m - 1]} {view.y}</span>
                        <button
                            type="button"
                            onClick={() => !nextDisabled && step(1)}
                            disabled={nextDisabled}
                            className={cn(
                                "w-6 h-6 inline-flex items-center justify-center clip-bevel-sm border border-[hsl(var(--border-soft))]",
                                "text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)] transition-colors",
                                nextDisabled && "opacity-30 cursor-not-allowed hover:text-[hsl(var(--text-2))] hover:border-[hsl(var(--border-soft))]",
                            )}
                            aria-label="Next month"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {WEEKDAYS.map((w) => (
                            <span key={w} className="h-5 inline-flex items-center justify-center font-ui text-[9.5px] uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">
                                {w}
                            </span>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-0.5">
                        {cells.map((d, i) => {
                            if (d == null) return <span key={`b${i}`} className="h-7" />;
                            const iso = toISO(view.y, view.m, d);
                            const isSelected = value && iso === value.slice(0, 10);
                            const isToday = iso === today;
                            const disabledDay = outOfRange(iso);
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    onClick={() => pick(d)}
                                    disabled={disabledDay}
                                    className={cn(
                                        "h-7 inline-flex items-center justify-center font-num text-[11px] clip-bevel-sm border transition-colors",
                                        isSelected
                                            ? "bg-[hsl(var(--accent-primary)/0.25)] border-[hsl(var(--accent-primary))] text-white"
                                            : "border-transparent text-[hsl(var(--text-1))] hover:bg-[hsl(var(--accent-primary)/0.12)] hover:border-[hsl(var(--accent-primary)/0.4)]",
                                        !isSelected && isToday && "border-[hsl(var(--border-mid))]",
                                        disabledDay && "opacity-25 cursor-not-allowed hover:bg-transparent hover:border-transparent",
                                    )}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default NeonDatePicker;
