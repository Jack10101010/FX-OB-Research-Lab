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
