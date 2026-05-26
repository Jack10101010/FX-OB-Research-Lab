// ── entryRegistry.js ────────────────────────────────────────────────────────
// Single source of truth for all planned, in-development, and tested entry
// models. Extend this registry — never hard-code model lists in components.

export const PLANNED_ENTRY_MODES = [
    { mode: "baseline",                label: "Baseline · Edge Touch",           family: "Baseline",     threshold: "Edge",         status: "tested" },
    { mode: "entry_penetration_10p0",  label: "Penetration 10%",                 family: "Penetration",  threshold: "10%",          status: "tested" },
    { mode: "entry_penetration_25p0",  label: "Penetration 25%",                 family: "Penetration",  threshold: "25%",          status: "tested" },
    { mode: "entry_penetration_50p0",  label: "Penetration 50%",                 family: "Penetration",  threshold: "50%",          status: "tested" },
    { mode: "entry_penetration_75p0",  label: "Penetration 75%",                 family: "Penetration",  threshold: "75%",          status: "tested" },
    { mode: "close_inside_edge",       label: "1m Close Inside → Edge Order",    family: "Confirmation", threshold: "Close inside",  status: "planned" },
    { mode: "wick_reclaim",            label: "Wick Reclaim Confirmation",        family: "Confirmation", threshold: "Reclaim",       status: "planned" },
    { mode: "sweep_reclaim",           label: "Sweep + Reclaim",                  family: "Confirmation", threshold: "Sweep",         status: "planned" },
    { mode: "delayed_confirmation",    label: "Delayed Confirmation Entry",       family: "Confirmation", threshold: "Delay",         status: "planned" },
];

export const ENTRY_FAMILIES = [
    { key: "Baseline",     label: "Baseline",     color: "hsl(var(--accent-secondary))" },
    { key: "Penetration",  label: "Penetration",  color: "hsl(var(--accent-primary))" },
    { key: "Confirmation", label: "Confirmation", color: "hsl(var(--warning))" },
    { key: "Reclaim",      label: "Reclaim",       color: "hsl(var(--success))" },
    { key: "Lifecycle",    label: "Lifecycle",    color: "hsl(var(--danger))" },
    { key: "Session",      label: "Session",      color: "hsl(var(--accent-glow))" },
];

export const FAMILY_TONE = {
    Baseline:     "secondary",
    Penetration:  "primary",
    Confirmation: "warning",
    Reclaim:      "success",
    Lifecycle:    "danger",
    Session:      "muted",
};

export const ENTRY_BACKLOG = [
    { title: "Spread / Slippage Modelling",  status: "Future execution realism",   body: "Model realistic spread, slippage, and missed fills around reactive confirmation entries." },
    { title: "Stop-Entry Confirmation Models", status: "Future exporter fields",    body: "Compare close-inside followed by stop/trigger entry instead of passive edge retest." },
    { title: "Liquidity Confirmation",        status: "Future derived feature",     body: "Require sweep/reclaim or liquidity event tags before activating an entry model." },
    { title: "HTF Confirmation",              status: "Future context tagging",     body: "Split entry performance by higher-timeframe alignment and structure state." },
    { title: "News-Aware Entries",            status: "Future external data",       body: "Suppress or alter entries near high-impact news windows." },
    { title: "Session-Aware Entries",         status: "Research hook",              body: "Enable model selection by Asia, London, London Lull, New York, and Outside sessions." },
    { title: "Regime-Aware Entries",          status: "Future regime tagging",      body: "Compare entry models during trending, ranging, and volatility expansion regimes." },
    { title: "Broker Execution Realism",      status: "Future execution model",     body: "Account for order queueing, partial fills, latency, and broker-specific fill behavior." },
];

export const LIFECYCLE_IDEAS = [
    { title: "Cancel if structurally invalidated before fill",  status: "Pending lifecycle",    body: "Requires pending-order exporter state" },
    { title: "Cancel if excessive penetration pre-fill",         status: "Pending lifecycle",    body: "Requires pre-fill penetration trail" },
    { title: "Cancel after X time decay",                        status: "Pending lifecycle",    body: "Requires pending age / expiry simulation" },
    { title: "Reverse touch invalidation",                       status: "Invalidation",         body: "Requires reverse-side touch tracking" },
    { title: "Displacement-through cancel",                      status: "Invalidation",         body: "Requires candle displacement tags" },
];

export const LOW_SAMPLE_N = 10;
export const MODERATE_SAMPLE_N = 30;
export const ROBUST_SAMPLE_N = 50;

export function sampleConfidence(n) {
    if (!n || n < LOW_SAMPLE_N)     return { label: "INSUFFICIENT", tone: "danger" };
    if (n < MODERATE_SAMPLE_N)      return { label: "LOW N",        tone: "warning" };
    if (n < ROBUST_SAMPLE_N)        return { label: "MODERATE N",   tone: "secondary" };
    return                                  { label: "ROBUST",       tone: "success" };
}

export function familyModels(family) {
    return PLANNED_ENTRY_MODES.filter(m => m.family === family);
}

export function modelByMode(mode) {
    const norm = String(mode || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return PLANNED_ENTRY_MODES.find(m => m.mode === norm) || null;
}
