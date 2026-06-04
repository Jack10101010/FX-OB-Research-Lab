import React, { useState, useMemo } from "react";
import Header from "./components/Header";
import RunImpactSummary from "./components/RunImpactSummary";
import SessionControlCenter from "./components/SessionControlCenter";
import VisualSummaryStrip from "./components/VisualSummaryStrip";
import DeepDive from "./components/DeepDive";
import QuickControls from "./components/QuickControls";
import ImpactOnRun from "./components/ImpactOnRun";
import HelpLegend from "./components/HelpLegend";
import SessionSettingsModal from "./components/SessionSettingsModal";
import { SESSION_LIST } from "./mockData";
import { useDataset } from "../../data/store";
import { useTradeUniverse } from "../../data/useTradeUniverse";
import { derivePrimaryResultView } from "../../data/tradeUniverse";
import {
  buildDefaultSessionRules,
  applySessionRules,
  resolveSession,
} from "../../components/lab/session/analytics/sessionAnalytics";
import { SESSION_KEYS } from "../../components/lab/session/config/sessionConfig";
import {
  buildSessionListFromTrades,
  buildImpactSummaryFromTrades,
  buildVisualSummaryFromTrades,
  buildOverviewDataFromSessionTrades,
  buildDirectionLabData,
  buildStructureLabData,
  buildTimeAnalysisData,
  buildEntryModelLabData,
  buildOrderBlockLabData,
  buildFailureAnalysisData,
  buildImpactOnRunData,
} from "./data/sessionLabV1Adapter";

/** Maps V1 lowercase keys → canonical session names used by sessionRules. */
const V1_TO_CANONICAL = {
  asia:    "Asia",
  london:  "London",
  lull:    "London Lull",
  ny:      "New York",
  nypm:    "NY PM",
  outside: "Outside",
};

export default function SessionLabPage() {
  // Phase D: derive trades from the run's primary result view, not global SCENARIO.
  const dataset = useDataset();
  const runId = dataset.ACTIVE_RUN?.id ?? null;
  const bundle = runId ? dataset.getRunData(runId) : null;
  const primaryScenario = useMemo(() => derivePrimaryResultView(bundle), [bundle]);
  const { trades: allTrades = [] } = useTradeUniverse(runId, primaryScenario);
  const hasRealData = Array.isArray(allTrades) && allTrades.length > 0;

  // Rule state for real data (keyed by canonical session name)
  const [sessionRules, setSessionRules] = useState(() =>
    buildDefaultSessionRules(SESSION_KEYS)
  );

  // Mock fallback state
  const [mockSessions, setMockSessions] = useState(SESSION_LIST);

  const [selectedKey, setSelectedKey]   = useState("london");
  const [direction, setDirection]       = useState("both");
  const [previewMode, setPreviewMode]   = useState("filtered");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab]       = useState("overview");

  // Apply session rules to get filtered trades
  const { includedTrades: filteredTrades = [] } = useMemo(
    () =>
      hasRealData
        ? applySessionRules(allTrades, sessionRules)
        : { includedTrades: [] },
    [allTrades, sessionRules, hasRealData]
  );

  // Adapter-derived data (null when no run loaded)
  const realSessionList = useMemo(
    () =>
      hasRealData ? buildSessionListFromTrades(allTrades, sessionRules) : null,
    [allTrades, sessionRules, hasRealData]
  );

  const impactSummary = useMemo(
    () =>
      hasRealData
        ? buildImpactSummaryFromTrades(allTrades, filteredTrades)
        : null,
    [allTrades, filteredTrades, hasRealData]
  );

  const visualData = useMemo(
    () => (hasRealData ? buildVisualSummaryFromTrades(allTrades) : null),
    [allTrades, hasRealData]
  );

  const sessions = hasRealData && realSessionList ? realSessionList : mockSessions;
  const selected = sessions.find((s) => s.key === selectedKey) || sessions[0];

  // Session-specific trades for deep dive tabs (Phase B)
  const canonicalSelectedKey = V1_TO_CANONICAL[selectedKey];
  const selectedSessionTrades = useMemo(
    () =>
      hasRealData && canonicalSelectedKey
        ? allTrades.filter((t) => resolveSession(t) === canonicalSelectedKey)
        : [],
    [allTrades, canonicalSelectedKey, hasRealData]
  );

  const overviewData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildOverviewDataFromSessionTrades(selectedSessionTrades)
        : null,
    [selectedSessionTrades]
  );

  const directionData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildDirectionLabData(selectedSessionTrades)
        : null,
    [selectedSessionTrades]
  );

  const structureData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildStructureLabData(selectedSessionTrades)
        : null,
    [selectedSessionTrades]
  );

  const timeAnalysisData = useMemo(
    () =>
      selectedSessionTrades.length > 0 && canonicalSelectedKey
        ? buildTimeAnalysisData(selectedSessionTrades, canonicalSelectedKey)
        : null,
    [selectedSessionTrades, canonicalSelectedKey]
  );

  const entryModelData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildEntryModelLabData(selectedSessionTrades)
        : null,
    [selectedSessionTrades]
  );

  const orderBlockData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildOrderBlockLabData(selectedSessionTrades)
        : null,
    [selectedSessionTrades]
  );

  const failureData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildFailureAnalysisData(selectedSessionTrades)
        : null,
    [selectedSessionTrades]
  );

  const impactOnRunData = useMemo(
    () =>
      hasRealData && canonicalSelectedKey
        ? buildImpactOnRunData(canonicalSelectedKey, allTrades)
        : null,
    [allTrades, canonicalSelectedKey, hasRealData]
  );

  const toggleSessionField = (v1Key, field) => {
    if (hasRealData) {
      const canonicalKey = V1_TO_CANONICAL[v1Key];
      if (!canonicalKey) return;
      setSessionRules((prev) => {
        const rule = prev[canonicalKey] ?? {
          enabled:   true,
          direction: { long: true, short: true },
          structure: { BOS: true, CHoCH: true },
        };
        if (field === "enabled")
          return { ...prev, [canonicalKey]: { ...rule, enabled: !rule.enabled } };
        if (field === "longs")
          return { ...prev, [canonicalKey]: { ...rule, direction: { ...rule.direction, long: !rule.direction.long } } };
        if (field === "shorts")
          return { ...prev, [canonicalKey]: { ...rule, direction: { ...rule.direction, short: !rule.direction.short } } };
        if (field === "bos")
          return { ...prev, [canonicalKey]: { ...rule, structure: { ...rule.structure, BOS: !rule.structure.BOS } } };
        if (field === "choch")
          return { ...prev, [canonicalKey]: { ...rule, structure: { ...rule.structure, CHoCH: !rule.structure.CHoCH } } };
        return prev;
      });
    } else {
      setMockSessions((prev) =>
        prev.map((s) => (s.key === v1Key ? { ...s, [field]: !s[field] } : s))
      );
    }
  };

  const resetAllRules = () => {
    if (hasRealData) {
      setSessionRules(buildDefaultSessionRules(SESSION_KEYS));
    } else {
      setMockSessions(SESSION_LIST);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#050A12] text-[#E5EDF7]"
      data-testid="session-lab-page"
    >
      {/* Background grid pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Radial glow */}
      <div
        className="pointer-events-none fixed -top-40 left-1/4 h-[600px] w-[800px] rounded-full opacity-[0.07]"
        style={{
          background:
            "radial-gradient(circle, rgba(34,211,238,0.6) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-[2200px] px-3 md:px-4 lg:px-4 xl:px-6 2xl:px-8 py-5 md:py-6 space-y-5 md:space-y-6">
        <Header
          direction={direction}
          setDirection={setDirection}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          onOpenSettings={() => setSettingsOpen(true)}
          onResetAll={resetAllRules}
        />

        {/* Data mode badge */}
        <div className="flex items-center">
          {hasRealData ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--success)/0.30)] bg-[hsl(var(--success)/0.08)] px-2.5 py-1 text-[10px] font-ui font-medium text-[hsl(var(--success))] uppercase tracking-wider"
              data-testid="data-mode-badge"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]"
                style={{ boxShadow: "0 0 6px hsl(var(--success))" }}
              />
              Live Data · {allTrades.length} trades
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-[#F59E0B]/30 bg-[#F59E0B08] px-2.5 py-1 text-[10px] font-ui font-medium text-[#F59E0B] uppercase tracking-wider"
              data-testid="data-mode-badge"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              Mock Data · Load a run to see live analysis
            </span>
          )}
        </div>

        <RunImpactSummary
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          impactSummary={impactSummary}
        />

        <SessionControlCenter
          sessions={sessions}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onToggle={toggleSessionField}
        />

        <VisualSummaryStrip visualData={visualData} />

        {/* Deep Dive: top row = Deep Dive + Quick Controls; Impact full width below */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_264px] 2xl:grid-cols-[minmax(0,1fr)_300px] gap-6">
            <DeepDive
              session={selected}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              overviewData={overviewData}
              directionData={directionData}
              structureData={structureData}
              timeAnalysisData={timeAnalysisData}
              entryModelData={entryModelData}
              orderBlockData={orderBlockData}
              failureData={failureData}
            />
            <div className="xl:sticky xl:top-6 xl:self-start">
              <QuickControls session={selected} onToggle={toggleSessionField} />
            </div>
          </div>
          <ImpactOnRun impactOnRunData={impactOnRunData} />
        </div>

        <HelpLegend />
      </div>

      <SessionSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sessions={sessions}
      />
    </div>
  );
}
