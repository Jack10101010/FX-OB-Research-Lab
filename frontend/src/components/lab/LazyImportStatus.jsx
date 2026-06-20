/**
 * LazyImportStatus — trust/debug guardrail chip for the lazy/index-only import path.
 *
 * SINGLE SOURCE OF TRUTH: reads `ENABLE_LAZY_IMPORT` directly from data/importer.js.
 * Do NOT duplicate the boolean anywhere — import the flag, never re-declare it. This
 * exists because a hidden flag (reverse_touch_cancel_enabled) silently flipped back
 * to true once, so the lazy-import state must be visible wherever runs are imported.
 *
 * Behaviour:
 *   • Lazy import OFF (flag false, no lazy run, no forceLazy):
 *       compact calm green chip → "Lazy Import: OFF".  Deliberately small/quiet.
 *   • Lazy import ON in ANY form (flag true, OR an imported run.lazy === true,
 *     OR an explicit forceLazy option was used):
 *       loud red/orange banner → "LAZY IMPORT: ON" + "Rows may be deferred".
 *       Impossible to miss.
 *
 * Props:
 *   runLazy    boolean — a specific imported run came back with lazy === true.
 *   forceLazy  boolean — an explicit forceLazy caller option was used for this import.
 *   className  string  — optional layout passthrough.
 *   compact    boolean — render the OFF state as an inline mini-chip (default true).
 */

import React from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { ENABLE_LAZY_IMPORT } from "@/data/importer";

export default function LazyImportStatus({
    runLazy = false,
    forceLazy = false,
    lazyReason = "",
    className = "",
    compact = true,
}) {
    // ON if the global flag is on, OR this run imported lazily, OR an explicit
    // forceLazy opt-in was used. Any one of these must light up the loud warning.
    const flagOn = Boolean(ENABLE_LAZY_IMPORT);
    const isOn = flagOn || Boolean(runLazy) || Boolean(forceLazy);

    // Distinguish the EXPECTED large-run lazy fallback (a single run was too big for the
    // full /bundle import → loaded lazily) from the DANGEROUS global lazy mode (the
    // ENABLE_LAZY_IMPORT flag flipped on). The former is a calm amber chip; only the
    // global flag (or forceLazy) gets the loud red "global lazy mode" alarm.
    const largeRunOnly = isOn && !flagOn && !forceLazy && Boolean(runLazy);

    if (largeRunOnly) {
        return (
            <span
                data-testid="lazy-import-status"
                data-lazy-state="large-run"
                className={`inline-flex items-center gap-1 px-1.5 py-[1px] text-[9.5px] font-ui uppercase tracking-[0.08em] border border-[hsl(var(--warning)/0.55)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)] clip-bevel-sm ${className}`}
                title={`This run was too large for full import and was loaded lazily — trade & BE rows load on demand.${lazyReason === "bundle_413" ? " (bundle exceeded the size cap)" : ""} Global lazy import is still OFF.`}
            >
                <AlertTriangle className="w-3 h-3" />
                Lazy: Large run
            </span>
        );
    }

    if (!isOn) {
        // ── OFF: small, calm, green. Stays out of the way. ──────────────────────
        return (
            <span
                data-testid="lazy-import-status"
                data-lazy-state="off"
                className={`inline-flex items-center gap-1 px-1.5 py-[1px] text-[9.5px] font-ui uppercase tracking-[0.08em] border border-[hsl(var(--success)/0.45)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)] clip-bevel-sm ${className}`}
                title="Lazy/index-only import is disabled — runs import eagerly (all trade & BE rows parsed up front)."
            >
                <ShieldCheck className="w-3 h-3" />
                Lazy Import: OFF
            </span>
        );
    }

    // ── ON: loud, salient red/orange banner. Only reached for GLOBAL lazy mode
    // (the flag) or an explicit forceLazy — the large-run-only case is handled above. ──
    const reason = flagOn
        ? "ENABLE_LAZY_IMPORT is true in data/importer.js (global lazy mode)."
        : forceLazy
            ? "An explicit forceLazy option was used for this import."
            : "An imported run came back with lazy = true.";
    return (
        <div
            data-testid="lazy-import-status"
            data-lazy-state="on"
            role="alert"
            className={`flex items-start gap-2 px-3 py-2 border-2 border-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.14)] clip-bevel-sm animate-pulse ${className}`}
        >
            <AlertTriangle className="w-4 h-4 text-[hsl(var(--danger))] shrink-0 mt-0.5" />
            <div className="leading-tight">
                <div className="text-[12px] font-display font-bold uppercase tracking-[0.1em] text-[hsl(var(--danger))]">
                    Lazy Import: ON
                </div>
                <div className="text-[11px] font-ui text-[hsl(var(--warning))]">
                    Rows may be deferred — run/data identity is not guaranteed eager.
                </div>
                <div className="text-[10px] font-ui text-[hsl(var(--text-2))] mt-0.5">{reason}</div>
            </div>
        </div>
    );
}
