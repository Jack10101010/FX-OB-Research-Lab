import React, { useState } from "react";
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

export default function SessionLabPage() {
  const [sessions, setSessions] = useState(SESSION_LIST);
  const [selectedKey, setSelectedKey] = useState("london");
  const [direction, setDirection] = useState("both"); // both | long | short
  const [previewMode, setPreviewMode] = useState("filtered"); // original | filtered
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const selected = sessions.find((s) => s.key === selectedKey) || sessions[1];

  const toggleSessionField = (key, field) => {
    setSessions((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [field]: !s[field] } : s))
    );
  };

  const resetAllRules = () => {
    setSessions(SESSION_LIST);
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

      <div className="relative mx-auto max-w-[2200px] px-4 md:px-6 lg:px-6 xl:px-8 2xl:px-10 py-6 md:py-8 space-y-6 md:space-y-8">
        <Header
          direction={direction}
          setDirection={setDirection}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          onOpenSettings={() => setSettingsOpen(true)}
          onResetAll={resetAllRules}
        />

        <RunImpactSummary previewMode={previewMode} setPreviewMode={setPreviewMode} />

        <SessionControlCenter
          sessions={sessions}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onToggle={toggleSessionField}
        />

        <VisualSummaryStrip />

        {/* Deep Dive area: 3-column layout — content / quick controls / impact */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_240px_300px] 2xl:grid-cols-[minmax(0,1fr)_280px_360px] gap-6">
          <DeepDive
            session={selected}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <div className="xl:sticky xl:top-6 xl:self-start">
            <QuickControls session={selected} onToggle={toggleSessionField} />
          </div>
          <div className="xl:sticky xl:top-6 xl:self-start">
            <ImpactOnRun />
          </div>
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
