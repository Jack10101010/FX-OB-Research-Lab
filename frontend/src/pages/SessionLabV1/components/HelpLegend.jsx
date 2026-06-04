import React from "react";
import { SectionLabel } from "./primitives";
import { BookOpen, Info } from "lucide-react";

const STEPS = [
  "Enable / disable sessions, directions, structures, entry models and other criteria.",
  "See real-time impact on your overall run in the top preview panel.",
  "Drill down into any session using the tabs above.",
  "Iterate, test ideas and discover real edge.",
];

const COLOR_LEGEND = [
  { c: "#22C55E", label: "Positive" },
  { c: "#EF4444", label: "Negative" },
  { c: "#94A3B8", label: "Neutral" },
  { c: "#F59E0B", label: "Warning / Selective" },
  { c: "#3B82F6", label: "Info" },
];

export default function HelpLegend() {
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Steps */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={14} className="text-[hsl(var(--accent-primary))]" />
            <SectionLabel>How to use Session Lab</SectionLabel>
          </div>
          <ol className="space-y-2">
            {STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-xs">
                <span className="h-5 w-5 shrink-0 rounded-full bg-[hsl(var(--accent-primary)/0.12)] border border-[hsl(var(--accent-primary))]/40 text-[hsl(var(--accent-primary))] font-num text-[10px] flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <span className="text-[hsl(var(--text-2))]">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Right side */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-[hsl(var(--accent-primary))]" />
              <SectionLabel>Color Legend</SectionLabel>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_LEGEND.map((l) => (
                <span
                  key={l.label}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-2.5 py-1 text-[11px] text-[hsl(var(--text-2))]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: l.c, boxShadow: `0 0 6px ${l.c}` }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[#3B82F6]/30 bg-[#3B82F6]/8 p-3 text-[11px] flex items-start gap-2">
            <Info size={13} className="text-[#3B82F6] mt-0.5 shrink-0" />
            <div className="text-[hsl(var(--text-2))]">
              All times shown in <span className="text-[hsl(var(--accent-primary))] font-num">UTC</span>. Changes are not saved to your run.
              This is a research and analysis workspace.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[hsl(var(--border-soft))] text-center">
        <p className="text-[10px] text-muted-lab font-num">
          All R values are calculated using initial risk · Data is from 832 trades across all selected runs · Times shown in UTC
        </p>
      </div>
    </div>
  );
}
