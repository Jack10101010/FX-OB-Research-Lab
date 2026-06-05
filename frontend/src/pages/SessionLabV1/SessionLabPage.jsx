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
  normalizeDirection,
  normalizeStructure,
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
  buildSessionVisualData,
  buildStreaksData,
  applyDeepDiveFilters,
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

const DEFAULT_DEEP_DIVE_FILTERS = {
  entryModel: { baseline: true, penetration: true, triggeredEdge: true },
  teDelay:    { same: true, next: true, d2: true, d3: true },
};

export default function SessionLabPage() {
  // Phase D: derive trades from the run's primary result view, not global SCENARIO.
  const dataset = useDataset();
  const runId = dataset.ACTIVE_RUN?.id ?? null;
  const bundle = runId ? dataset.getRunData(runId) : null;
  const primaryScenario = useMemo(() => derivePrimaryResultView(bundle), [bundle]);
  const { trades: allTrades = [], label: resultViewLabel = "Baseline" } = useTradeUniverse(runId, primaryScenario);
  const hasRealData = Array.isArray(allTrades) && allTrades.length > 0;

  // Rule state for real data (keyed by canonical session name)
  const [sessionRules, setSessionRules] = useState(() =>
    buildDefaultSessionRules(SESSION_KEYS)
  );

  // Deep Dive exploration filters (Entry Model + TE Delay) — affect Deep Dive tabs only
  const [deepDiveFilters, setDeepDiveFilters] = useState(DEFAULT_DEEP_DIVE_FILTERS);

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
  // Filtered by the active sessionRules for the selected session so that
  // QuickControls + SessionCard toggles both affect Deep Dive tab data.
  const canonicalSelectedKey = V1_TO_CANONICAL[selectedKey];
  const selectedSessionTrades = useMemo(() => {
    if (!hasRealData || !canonicalSelectedKey) return [];
    const base = allTrades.filter((t) => resolveSession(t) === canonicalSelectedKey);
    const rule = sessionRules[canonicalSelectedKey];
    if (!rule) return base;
    return base.filter((t) => {
      const dir = normalizeDirection(t);
      if (dir === "Long"  && !rule.direction.long)  return false;
      if (dir === "Short" && !rule.direction.short) return false;
      const struct = normalizeStructure(t);
      if (struct === "BOS"   && !rule.structure.BOS)   return false;
      if (struct === "CHoCH" && !rule.structure.CHoCH) return false;
      return true;
    });
  }, [allTrades, canonicalSelectedKey, hasRealData, sessionRules]);

  // Apply Deep Dive exploration filters (Entry Model + TE Delay) — does NOT affect Run Impact
  const deepDiveFilterResult = useMemo(
    () => applyDeepDiveFilters(selectedSessionTrades, deepDiveFilters),
    [selectedSessionTrades, deepDiveFilters]
  );
  const deepDiveSessionTrades = deepDiveFilterResult.includedTrades;

  const overviewData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildOverviewDataFromSessionTrades(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
  );

  const directionData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildDirectionLabData(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
  );

  const structureData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildStructureLabData(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
  );

  const timeAnalysisData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0 && canonicalSelectedKey
        ? buildTimeAnalysisData(deepDiveSessionTrades, canonicalSelectedKey)
        : null,
    [deepDiveSessionTrades, canonicalSelectedKey]
  );

  const entryModelData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildEntryModelLabData(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
  );

  const orderBlockData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildOrderBlockLabData(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
  );

  const failureData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildFailureAnalysisData(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
  );

  const impactOnRunData = useMemo(
    () =>
      hasRealData && canonicalSelectedKey
        ? buildImpactOnRunData(canonicalSelectedKey, allTrades)
        : null,
    [allTrades, canonicalSelectedKey, hasRealData]
  );

  const sessionVisualData = useMemo(
    () =>
      selectedSessionTrades.length > 0
        ? buildSessionVisualData(selectedSessionTrades)
        : { tradesByDirection: [], tradesByStructure: [], topEntryModel: [] },
    [selectedSessionTrades]
  );

  const streaksData = useMemo(
    () =>
      deepDiveSessionTrades.length > 0
        ? buildStreaksData(deepDiveSessionTrades)
        : null,
    [deepDiveSessionTrades]
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
      className="min-h-screen w-full text-[#E5EDF7]"
      data-testid="session-lab-page"
    >

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
              Live Data · {resultViewLabel} · {allTrades.length} trades
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
          resultViewLabel={resultViewLabel}
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
              streaksData={streaksData}
            />
            <div className="xl:sticky xl:top-6 xl:self-start">
              <QuickControls
                session={selected}
                onToggle={toggleSessionField}
                deepDiveFilters={deepDiveFilters}
                onDeepDiveFilterChange={setDeepDiveFilters}
                deepDiveFilterMeta={deepDiveFilterResult}
                sessionTradeCount={selectedSessionTrades.length}
                defaultDeepDiveFilters={DEFAULT_DEEP_DIVE_FILTERS}
              />
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
