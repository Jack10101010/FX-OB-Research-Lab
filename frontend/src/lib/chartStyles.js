// Chart typography constants — import from "@/lib/chartStyles"
// Keeps chart font behavior consistent across Recharts components.
//
// Rule:
//   CHART_NUM_FONT — axis ticks, tooltip content, numeric bar labels (data values)
//   CHART_UI_FONT  — legends, category axis labels, prose descriptions (readable text)

export const CHART_UI_FONT  = "IBM Plex Sans, Inter, system-ui, sans-serif";
export const CHART_NUM_FONT = "JetBrains Mono, ui-monospace, monospace";

// Convenience preset: Recharts Legend wrapperStyle
export const LEGEND_STYLE = {
    fontSize: 10,
    fontFamily: CHART_UI_FONT,
};

// ── Market State / Regime Gate palette ──────────────────────────────────────
// Two hues (Bull=green family, Bear=red family) × three intensities
// (Expand=saturated, Compress=muted, Chop=grey-tinted). Used by the Strategy Map
// state strip / shading and the TradeInspector badge. `fill` is a low-opacity
// background for the thin state strip; `stroke`/`text` are the solid accents.
export const MARKET_STATE_COLORS = Object.freeze({
    "Bull/Expand":   { text: "#22c55e", stroke: "#22c55e", fill: "rgba(34,197,94,0.28)" },
    "Bull/Compress": { text: "#4ade80", stroke: "#4ade80", fill: "rgba(74,222,128,0.16)" },
    "Bull/Chop":     { text: "#84cc9f", stroke: "#84cc9f", fill: "rgba(132,204,159,0.10)" },
    "Bear/Expand":   { text: "#ef4444", stroke: "#ef4444", fill: "rgba(239,68,68,0.28)" },
    "Bear/Compress": { text: "#f87171", stroke: "#f87171", fill: "rgba(248,113,113,0.16)" },
    "Bear/Chop":     { text: "#c98a8a", stroke: "#c98a8a", fill: "rgba(201,138,138,0.10)" },
});

// Neutral fallback for unknown / warmup-window states.
export const MARKET_STATE_UNKNOWN_COLOR = Object.freeze({
    text: "#94a3b8", stroke: "#94a3b8", fill: "rgba(148,163,184,0.10)",
});

export function marketStateColor(state) {
    return MARKET_STATE_COLORS[state] ?? MARKET_STATE_UNKNOWN_COLOR;
}
