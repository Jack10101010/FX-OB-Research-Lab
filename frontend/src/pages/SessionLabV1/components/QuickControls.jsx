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

export default function QuickControls({
  session,
  onToggle,
  deepDiveFilters,
  onDeepDiveFilterChange,
  deepDiveFilterMeta,
  sessionTradeCount,
  defaultDeepDiveFilters,
}) {
  const flipFilter = (group, key) => {
    onDeepDiveFilterChange((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: !prev[group][key] },
    }));
  };

  const isFiltered = deepDiveFilterMeta?.isFiltered ?? false;
  const deepDiveTrades = deepDiveFilterMeta?.includedTrades?.length ?? sessionTradeCount ?? 0;

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

        {/* Deep Dive-only section separator */}
        <div className="border-t border-[hsl(var(--border-soft))] pt-3">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--accent-primary))]">Deep Dive Only</span>
          </div>
          <p className="text-[10px] text-muted-lab font-num mb-3">Filters the selected-session analytics below.</p>

          <div className="space-y-3">
            <div>
              <SectionLabel className="mb-2">Entry Model</SectionLabel>
              <div className="space-y-0.5">
                <Row
                  label="Baseline"
                  active={deepDiveFilters.entryModel.baseline}
                  onChange={() => flipFilter("entryModel", "baseline")}
                  color="#64748B"
                  testId="qc-em-baseline"
                />
                <Row
                  label="Penetration"
                  active={deepDiveFilters.entryModel.penetration}
                  onChange={() => flipFilter("entryModel", "penetration")}
                  color="#94A3B8"
                  testId="qc-em-penetration"
                />
                <Row
                  label="Triggered Edge"
                  active={deepDiveFilters.entryModel.triggeredEdge}
                  onChange={() => flipFilter("entryModel", "triggeredEdge")}
                  color="#22D3EE"
                  testId="qc-em-te"
                />
              </div>
            </div>

            <div className="border-t border-[hsl(var(--border-soft))] pt-3">
              <SectionLabel className="mb-2">Trigger Delay</SectionLabel>
              <div className="space-y-0.5">
                <Row
                  label="Same Candle"
                  active={deepDiveFilters.teDelay.same}
                  onChange={() => flipFilter("teDelay", "same")}
                  color="#64748B"
                  testId="qc-td-same"
                />
                <Row
                  label="Next Candle"
                  active={deepDiveFilters.teDelay.next}
                  onChange={() => flipFilter("teDelay", "next")}
                  color="#94A3B8"
                  testId="qc-td-next"
                />
                <Row
                  label="Delay +2"
                  active={deepDiveFilters.teDelay.d2}
                  onChange={() => flipFilter("teDelay", "d2")}
                  color="#22D3EE"
                  testId="qc-td-d2"
                />
                <Row
                  label="Delay +3"
                  active={deepDiveFilters.teDelay.d3}
                  onChange={() => flipFilter("teDelay", "d3")}
                  color="#22D3EE"
                  testId="qc-td-d3"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Conditional footer when Deep Dive filters are active */}
        {isFiltered && (
          <div className="border-t border-[hsl(var(--border-soft))] pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-lab font-num">Deep Dive trades</span>
              <span className="font-num text-[10px] font-bold text-[hsl(var(--accent-primary))]">
                {deepDiveTrades} / {sessionTradeCount}
              </span>
            </div>
            <button
              onClick={() => onDeepDiveFilterChange(defaultDeepDiveFilters)}
              className="w-full rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-2 py-1.5 text-[10px] font-ui font-medium uppercase tracking-wider text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary))]/50 hover:text-[hsl(var(--accent-primary))] transition-colors"
              data-testid="qc-reset-deep-dive"
            >
              Reset Deep Dive Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
