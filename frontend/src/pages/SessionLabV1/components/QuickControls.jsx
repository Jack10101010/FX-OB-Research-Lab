import React from "react";
import { SectionLabel } from "./primitives";

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
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-4" data-testid="quick-controls">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="font-display text-base font-bold text-[hsl(var(--text))]">Quick Controls</span>
          <span className="text-[10px] text-[hsl(var(--accent-primary))] font-num uppercase tracking-wider">Filters Deep Dive + Run Impact</span>
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
      </div>
    </div>
  );
}
