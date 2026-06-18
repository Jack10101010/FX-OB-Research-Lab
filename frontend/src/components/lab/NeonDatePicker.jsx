import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// NeonDatePicker — theme-matched calendar popover replacing the native
// <input type="date">. Dependency-free; styled with the neon-lab tokens.
//
// The popover is rendered in a portal with fixed positioning so it escapes the
// clip-path / backdrop-blur stacking contexts of the surrounding NeonPanels
// (otherwise the card below paints over / clips it). It auto-flips upward when
// there isn't room below. Click the header to jump day → month → year for quick
// browsing.
//
// Props:
//   value     "YYYY-MM-DD" (controlled) | "" for empty
//   onChange  (iso: "YYYY-MM-DD") => void
//   min, max  optional "YYYY-MM-DD" bounds (out-of-range days/months/years disabled)
//   testId, className, disabled
//
// All date math uses integer y/m/d + UTC construction, and ISO strings compare
// lexicographically — so there are no timezone off-by-one pitfalls.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // Monday-first
const POP_W = 240;
const POP_H_EST = 300; // used only to decide flip direction

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

function firstWeekdayMonday(y, m) {
    const jsDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun … 6=Sat
    return (jsDay + 6) % 7; // 0=Mon … 6=Sun
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
    const [mode, setMode] = useState("day"); // day | month | year
    const [pos, setPos] = useState(null);    // { left, top?, bottom?, width }
    const initial = parseISO(value) || parseISO(max) || parseISO(todayISO());
    const [view, setView] = useState({ y: initial.y, m: initial.m }); // m is 1-based
    const triggerRef = useRef(null);
    const popRef = useRef(null);

    const today = todayISO();

    // Range helpers (no-op when the bound is absent).
    const dayOOR = (iso) => (min && iso < min) || (max && iso > max);
    const monthOOR = (y, m) => (min && toISO(y, m, daysInMonth(y, m)) < min) || (max && toISO(y, m, 1) > max);
    const yearOOR = (y) => (min && toISO(y, 12, 31) < min) || (max && toISO(y, 1, 1) > max);

    const computePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom;
        const openUp = spaceBelow < POP_H_EST && r.top > spaceBelow;
        const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - POP_W - 8));
        setPos(openUp
            ? { left, bottom: window.innerHeight - r.top + 4, width: POP_W }
            : { left, top: r.bottom + 4, width: POP_W });
    }, []);

    // On open: reset to day view centred on the selected month + position it.
    useEffect(() => {
        if (!open) return;
        setMode("day");
        const base = parseISO(value) || parseISO(max) || parseISO(todayISO());
        setView({ y: base.y, m: base.m });
        computePos();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reposition while open (scroll in any container / resize).
    useEffect(() => {
        if (!open) return undefined;
        const h = () => computePos();
        window.addEventListener("resize", h);
        window.addEventListener("scroll", h, true);
        return () => {
            window.removeEventListener("resize", h);
            window.removeEventListener("scroll", h, true);
        };
    }, [open, computePos]);

    // Close on outside click (trigger + portal popover) / Escape.
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (popRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const dayCells = useMemo(() => {
        const lead = firstWeekdayMonday(view.y, view.m);
        const total = daysInMonth(view.y, view.m);
        const out = [];
        for (let i = 0; i < lead; i += 1) out.push(null);
        for (let d = 1; d <= total; d += 1) out.push(d);
        return out;
    }, [view]);

    const yearGridStart = view.y - (((view.y % 12) + 12) % 12); // 12-year aligned page

    const stepMonth = (dir) => setView((v) => {
        let { y, m } = v; m += dir;
        if (m < 1) { m = 12; y -= 1; } if (m > 12) { m = 1; y += 1; }
        return { y, m };
    });
    const stepYear = (dir) => setView((v) => ({ ...v, y: v.y + dir }));
    const stepYearPage = (dir) => setView((v) => ({ ...v, y: v.y + dir * 12 }));

    const navBtn = (onClick, dis, Icon, label) => (
        <button
            type="button"
            onClick={() => !dis && onClick()}
            disabled={dis}
            aria-label={label}
            className={cn(
                "w-6 h-6 inline-flex items-center justify-center clip-bevel-sm border border-[hsl(var(--border-soft))]",
                "text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)] transition-colors",
                dis && "opacity-30 cursor-not-allowed hover:text-[hsl(var(--text-2))] hover:border-[hsl(var(--border-soft))]",
            )}
        >
            <Icon className="w-3.5 h-3.5" />
        </button>
    );

    const headerLabelBtn = (text, onClick) => (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                "font-ui text-[12px] text-white px-2 py-0.5 clip-bevel-sm transition-colors",
                onClick && "hover:bg-[hsl(var(--accent-primary)/0.14)] hover:text-white cursor-pointer",
            )}
        >
            {text}
        </button>
    );

    const popover = (
        <div
            ref={popRef}
            style={{ position: "fixed", left: pos?.left, top: pos?.top, bottom: pos?.bottom, width: pos?.width }}
            className={cn(
                "z-[200] p-2 clip-bevel-sm bg-[hsl(var(--panel))] border border-[hsl(var(--border-mid))]",
                "shadow-[0_10px_34px_-6px_rgba(0,0,0,0.85)]",
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                {mode === "day" && navBtn(() => stepMonth(-1),
                    Boolean(min) && toISO(view.m === 1 ? view.y - 1 : view.y, view.m === 1 ? 12 : view.m - 1,
                        daysInMonth(view.m === 1 ? view.y - 1 : view.y, view.m === 1 ? 12 : view.m - 1)) < min,
                    ChevronLeft, "Previous month")}
                {mode === "month" && navBtn(() => stepYear(-1), Boolean(min) && toISO(view.y - 1, 12, 31) < min, ChevronLeft, "Previous year")}
                {mode === "year" && navBtn(() => stepYearPage(-1), Boolean(min) && toISO(yearGridStart - 1, 12, 31) < min, ChevronLeft, "Previous years")}

                {mode === "day" && headerLabelBtn(`${MONTHS[view.m - 1]} ${view.y}`, () => setMode("month"))}
                {mode === "month" && headerLabelBtn(`${view.y}`, () => setMode("year"))}
                {mode === "year" && headerLabelBtn(`${yearGridStart} – ${yearGridStart + 11}`, null)}

                {mode === "day" && navBtn(() => stepMonth(1),
                    Boolean(max) && toISO(view.m === 12 ? view.y + 1 : view.y, view.m === 12 ? 1 : view.m + 1, 1) > max,
                    ChevronRight, "Next month")}
                {mode === "month" && navBtn(() => stepYear(1), Boolean(max) && toISO(view.y + 1, 1, 1) > max, ChevronRight, "Next year")}
                {mode === "year" && navBtn(() => stepYearPage(1), Boolean(max) && toISO(yearGridStart + 12, 1, 1) > max, ChevronRight, "Next years")}
            </div>

            {/* Day mode */}
            {mode === "day" && (
                <>
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {WEEKDAYS.map((w) => (
                            <span key={w} className="h-5 inline-flex items-center justify-center font-ui text-[9.5px] uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">{w}</span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                        {dayCells.map((d, i) => {
                            if (d == null) return <span key={`b${i}`} className="h-7" />;
                            const iso = toISO(view.y, view.m, d);
                            const isSelected = value && iso === value.slice(0, 10);
                            const isToday = iso === today;
                            const dis = dayOOR(iso);
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    onClick={() => { if (!dis) { onChange?.(iso); setOpen(false); } }}
                                    disabled={dis}
                                    className={cn(
                                        "h-7 inline-flex items-center justify-center font-num text-[11px] clip-bevel-sm border transition-colors",
                                        isSelected
                                            ? "bg-[hsl(var(--accent-primary)/0.25)] border-[hsl(var(--accent-primary))] text-white"
                                            : "border-transparent text-[hsl(var(--text-1))] hover:bg-[hsl(var(--accent-primary)/0.12)] hover:border-[hsl(var(--accent-primary)/0.4)]",
                                        !isSelected && isToday && "border-[hsl(var(--border-mid))]",
                                        dis && "opacity-25 cursor-not-allowed hover:bg-transparent hover:border-transparent",
                                    )}
                                >{d}</button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Month mode */}
            {mode === "month" && (
                <div className="grid grid-cols-3 gap-1">
                    {MONTHS.map((label, idx) => {
                        const m = idx + 1;
                        const isSelected = value && parseISO(value)?.y === view.y && parseISO(value)?.m === m;
                        const dis = monthOOR(view.y, m);
                        return (
                            <button
                                key={label}
                                type="button"
                                onClick={() => { if (!dis) { setView((v) => ({ ...v, m })); setMode("day"); } }}
                                disabled={dis}
                                className={cn(
                                    "h-9 inline-flex items-center justify-center font-ui text-[11px] clip-bevel-sm border transition-colors",
                                    isSelected
                                        ? "bg-[hsl(var(--accent-primary)/0.25)] border-[hsl(var(--accent-primary))] text-white"
                                        : "border-transparent text-[hsl(var(--text-1))] hover:bg-[hsl(var(--accent-primary)/0.12)] hover:border-[hsl(var(--accent-primary)/0.4)]",
                                    dis && "opacity-25 cursor-not-allowed hover:bg-transparent hover:border-transparent",
                                )}
                            >{label}</button>
                        );
                    })}
                </div>
            )}

            {/* Year mode */}
            {mode === "year" && (
                <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, i) => yearGridStart + i).map((y) => {
                        const isSelected = value && parseISO(value)?.y === y;
                        const dis = yearOOR(y);
                        return (
                            <button
                                key={y}
                                type="button"
                                onClick={() => { if (!dis) { setView((v) => ({ ...v, y })); setMode("month"); } }}
                                disabled={dis}
                                className={cn(
                                    "h-9 inline-flex items-center justify-center font-num text-[11px] clip-bevel-sm border transition-colors",
                                    isSelected
                                        ? "bg-[hsl(var(--accent-primary)/0.25)] border-[hsl(var(--accent-primary))] text-white"
                                        : "border-transparent text-[hsl(var(--text-1))] hover:bg-[hsl(var(--accent-primary)/0.12)] hover:border-[hsl(var(--accent-primary)/0.4)]",
                                    dis && "opacity-25 cursor-not-allowed hover:bg-transparent hover:border-transparent",
                                )}
                            >{y}</button>
                        );
                    })}
                </div>
            )}
        </div>
    );

    return (
        <div className={cn("relative", className)}>
            <button
                type="button"
                ref={triggerRef}
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

            {open && pos && createPortal(popover, document.body)}
        </div>
    );
}

export default NeonDatePicker;
