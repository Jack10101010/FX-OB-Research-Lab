import React from "react";
import { SectionLabel } from "./primitives";
import OverviewTab from "./tabs/OverviewTab";
import DirectionLab from "./tabs/DirectionLab";
import StructureLab from "./tabs/StructureLab";
import EntryModelLab from "./tabs/EntryModelLab";
import TimeAnalysis from "./tabs/TimeAnalysis";
import OrderBlockLab from "./tabs/OrderBlockLab";
import FailureAnalysis from "./tabs/FailureAnalysis";
import StreaksLab from "./tabs/StreaksLab";
import {
  LayoutGrid, ArrowLeftRight, Layers, Crosshair, Clock, Boxes,
  AlertTriangle, ListOrdered,
} from "lucide-react";

const TABS = [
  { key: "overview",    label: "Overview",       icon: LayoutGrid },
  { key: "direction",   label: "Direction Lab",  icon: ArrowLeftRight },
  { key: "structure",   label: "Structure Lab",  icon: Layers },
  { key: "entry",       label: "Entry Model Lab", icon: Crosshair },
  { key: "time",        label: "Time Analysis",  icon: Clock },
  { key: "ob",          label: "Order Block Lab",icon: Boxes },
  { key: "failure",     label: "Failure Analysis", icon: AlertTriangle },
  { key: "streaks",     label: "Streaks",        icon: ListOrdered },
];

export default function DeepDive({ session, activeTab, setActiveTab, overviewData, directionData, structureData }) {
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-5 md:p-6" data-testid="session-deep-dive">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-3">
          <SectionLabel>Session Deep Dive</SectionLabel>
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--text))]">
            {session.name}{" "}
            <span className="text-sm text-muted-lab font-num font-normal">({session.range})</span>
          </h2>
        </div>
        <div className="text-[10px] text-muted-lab font-num uppercase tracking-wider">
          Switch tab to drill into a specific lab
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex flex-wrap items-center gap-1 mb-5 border-b border-[hsl(var(--border-soft))] -mx-1 pb-0">
        {TABS.map((t) => {
          const active = activeTab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              data-testid={`deep-dive-tab-${t.key}`}
              className={[
                "relative inline-flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-all",
                active
                  ? "text-[hsl(var(--accent-primary))]"
                  : "text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
              ].join(" ")}
            >
              <Icon size={13} />
              {t.label}
              {active && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[hsl(var(--accent-primary))] shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="min-h-[480px]">
        {activeTab === "overview" && <OverviewTab session={session} overviewData={overviewData} />}
        {activeTab === "direction" && <DirectionLab directionData={directionData} />}
        {activeTab === "structure" && <StructureLab structureData={structureData} />}
        {activeTab === "entry" && <EntryModelLab />}
        {activeTab === "time" && <TimeAnalysis />}
        {activeTab === "ob" && <OrderBlockLab />}
        {activeTab === "failure" && <FailureAnalysis />}
        {activeTab === "streaks" && <StreaksLab />}
      </div>
    </div>
  );
}
