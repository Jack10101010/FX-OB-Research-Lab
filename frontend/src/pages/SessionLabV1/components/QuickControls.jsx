import React, { useState } from "react";
import { SectionLabel } from "./primitives";
import { RotateCcw, Sparkles, BookmarkPlus } from "lucide-react";

function MiniToggle({ active, onChange, color = "#22C55E", testId }) {
  return (
    <button
      onClick={onChange}
      data-testid={testId}
      className="relative inline-flex h-5 w-9 items-center rounded-full border transition-all"
      style={{
        backgroundColor: active ? `${color}33` : "rgba(34,49,66,0.5)",
        borderColor: active ? color : "#223142",
      }}
    >
      <span
        className="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all"
        style={{
          left: active ? "calc(100% - 18px)" : "2px",
          backgroundColor: active ? color : "#64748B",
          boxShadow: active ? `0 0 8px ${color}` : "none",
        }}
      />
    </button>
  );
}

function Row({ label, active, onChange, hot, color = "#22C55E", testId }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={`text-xs ${active ? "text-[hsl(var(--text))]" : "text-muted-lab"}`}>{label}</span>
      <div className="flex items-center gap-2">
        {hot && (
          <span className="font-num text-[10px] uppercase tracking-wider text-[hsl(var(--accent-primary))]">
            {hot}
          </span>
        )}
        <MiniToggle active={active} onChange={onChange} color={color} testId={testId} />
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="border-t border-[hsl(var(--border-soft))] pt-3 first:border-t-0 first:pt-0">
      <SectionLabel className="mb-2">{title}</SectionLabel>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function QuickControls({ session, onToggle }) {
  const [models, setModels] = useState({
    base: false,
    pen10: false,
    pen25: false,
    teSame: true,
    teNext: true,
    teD2: true,
    teD3: true,
  });
  const [delays, setDelays] = useState({ same: false, next: false, d2: true, d3: true, d1: false });
  const flip = (key, setter) => setter((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-4" data-testid="quick-controls">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="font-display text-base font-bold text-[hsl(var(--text))]">Quick Controls</span>
          <span className="text-[10px] text-[hsl(var(--accent-primary))] font-num uppercase tracking-wider">Affects Preview</span>
        </div>
        <span className="rounded-full bg-[#22C55E]/10 text-[#22C55E] text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[#22C55E]/30">
          {session.name}
        </span>
      </div>

      <div className="space-y-3">
        <Group title="Direction">
          <Row label="Longs"  active={session.longs}  onChange={() => onToggle(session.key, "longs")}  color="#22C55E" testId="qc-longs" />
          <Row label="Shorts" active={session.shorts} onChange={() => onToggle(session.key, "shorts")} color="#EF4444" testId="qc-shorts" />
        </Group>

        <Group title="Structure">
          <Row label="BOS"   active={session.bos}   onChange={() => onToggle(session.key, "bos")}   color="#3B82F6" testId="qc-bos" />
          <Row label="CHoCH" active={session.choch} onChange={() => onToggle(session.key, "choch")} color="#A855F7" testId="qc-choch" />
        </Group>

        <Group title="Entry Model">
          <Row label="Baseline"        active={models.base}   onChange={() => flip("base", setModels)}   color="#64748B" testId="qc-base" />
          <Row label="Penetration 10%" active={models.pen10}  onChange={() => flip("pen10", setModels)}  color="#94A3B8" testId="qc-pen10" />
          <Row label="Penetration 25%" active={models.pen25}  onChange={() => flip("pen25", setModels)}  color="#94A3B8" testId="qc-pen25" />
          <Row label="TE Same"         active={models.teSame} onChange={() => flip("teSame", setModels)} color="#22D3EE" testId="qc-tesame" />
          <Row label="TE Next"         active={models.teNext} onChange={() => flip("teNext", setModels)} color="#22D3EE" testId="qc-tenext" />
          <Row label="TE Delay +2"     active={models.teD2}   onChange={() => flip("teD2", setModels)}   color="#22D3EE" testId="qc-ted2" />
          <Row label="TE Delay +3"     active={models.teD3}   onChange={() => flip("teD3", setModels)}   color="#22D3EE" testId="qc-ted3" />
        </Group>

        <Group title="Trigger Delay">
          <Row label="Same"     active={delays.same} onChange={() => flip("same", setDelays)} color="#64748B" testId="qc-d-same" />
          <Row label="Next"     active={delays.next} onChange={() => flip("next", setDelays)} color="#94A3B8" testId="qc-d-next" hot="Delay 1" />
          <Row label="Delay +2" active={delays.d2}   onChange={() => flip("d2", setDelays)}   color="#22D3EE" testId="qc-d-d2" />
          <Row label="Delay +3" active={delays.d3}   onChange={() => flip("d3", setDelays)}   color="#22D3EE" testId="qc-d-d3" />
        </Group>
      </div>

      <div className="mt-4 pt-4 border-t border-[hsl(var(--border-soft))] grid grid-cols-1 gap-2">
        <button
          data-testid="qc-reset-session"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#EF4444]/40 bg-transparent text-[#F87171] py-2 text-xs font-medium hover:bg-[#EF4444]/10"
        >
          <RotateCcw size={12} />
          Reset This Session
        </button>
        <button
          data-testid="qc-apply-rule"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))] border border-[hsl(var(--accent-primary))]/40 py-2 text-xs font-medium hover:bg-[hsl(var(--accent-primary))]/20"
        >
          <Sparkles size={12} />
          Apply as Candidate Rule
        </button>
        <button
          data-testid="qc-save-view"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[hsl(var(--accent-primary))] text-[hsl(var(--bg))] py-2 text-xs font-medium hover:opacity-90"
        >
          <BookmarkPlus size={12} />
          Save View
        </button>
      </div>
    </div>
  );
}
