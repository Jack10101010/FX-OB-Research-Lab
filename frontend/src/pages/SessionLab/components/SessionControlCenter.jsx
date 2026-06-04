import React from "react";
import {
  Panel,
  SectionLabel,
  VerdictPill,
  ToggleChip,
  Sparkline,
  SplitBar,
  fmtR,
} from "./primitives";
import { Moon, Building2, Coffee, Building, Sparkles, Globe, MoreHorizontal, BarChart2 } from "lucide-react";

const ICONS = {
  asia: Moon,
  london: Building2,
  lull: Coffee,
  ny: Building,
  nypm: Sparkles,
  outside: Globe,
};

const ICON_COLORS = {
  asia: "#A855F7",
  london: "#22C55E",
  lull: "#F59E0B",
  ny: "#3B82F6",
  nypm: "#C084FC",
  outside: "#64748B",
};

function SessionCard({ session, selected, onSelect, onToggle }) {
  const Icon = ICONS[session.key] || Building2;
  const iconColor = ICON_COLORS[session.key];
  const positive = session.netR >= 0;
  const dimmed = !session.enabled;
  // Partial = any of long/short/bos/choch off but session enabled
  const partial =
    session.enabled &&
    (!session.longs || !session.shorts || !session.bos || !session.choch);

  return (
    <div
      onClick={() => onSelect(session.key)}
      data-testid={`session-card-${session.key}`}
      className={[
        "relative rounded-xl border bg-[#121C29] p-4 cursor-pointer transition-all overflow-hidden",
        selected
          ? "border-[#22D3EE] card-glow"
          : "border-[#223142] hover:border-[#2E4358]",
        dimmed ? "opacity-50 grayscale-[40%]" : "",
      ].join(" ")}
    >
      {/* Status dot */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          data-testid={`session-card-${session.key}-options`}
          onClick={(e) => e.stopPropagation()}
          className="text-[#64748B] hover:text-[#E5EDF7] p-1 rounded"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Title row */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
          style={{
            backgroundColor: `${iconColor}1A`,
            border: `1px solid ${iconColor}40`,
            color: iconColor,
          }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-base font-semibold tracking-tight uppercase text-[#E5EDF7]">
              {session.name}
            </h3>
            <VerdictPill verdict={session.verdict} />
          </div>
          <div className="text-[10px] text-[#64748B] font-mono mt-0.5">{session.range}</div>
        </div>
      </div>

      {/* Big metric + sparkline */}
      <div className="flex items-center justify-between mb-3">
        <div
          className={[
            "font-display font-bold tabular text-3xl leading-none",
            positive ? "text-[#22C55E]" : "text-[#EF4444]",
          ].join(" ")}
        >
          {fmtR(session.netR)}
        </div>
        <Sparkline
          data={session.spark}
          color={positive ? "#22C55E" : "#EF4444"}
          width={90}
          height={32}
        />
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-[10px]">
        <Cell label="PF" value={session.pf} />
        <Cell label="WR" value={`${session.wr}%`} />
        <Cell label="DD" value={`${session.dd}R`} tone="neg" />
        <Cell label="Trades" value={session.trades} tone="cyan" />
      </div>

      {/* Splits */}
      <div className="space-y-2 mb-4">
        <SplitBar
          leftLabel="L"
          leftPct={session.longShortSplit.long}
          leftColor="#22C55E"
          rightLabel="S"
          rightPct={session.longShortSplit.short}
          rightColor="#EF4444"
          height={4}
        />
        <SplitBar
          leftLabel="BOS"
          leftPct={session.bosChochSplit.bos}
          leftColor="#3B82F6"
          rightLabel="CH"
          rightPct={session.bosChochSplit.choch}
          rightColor="#A855F7"
          height={4}
        />
      </div>

      {/* Best / Worst */}
      <div className="space-y-1 mb-4 text-[10px]">
        <Row label="Best" value={session.bestStructure} tone="pos" />
        <Row label="Worst" value={session.worstStructure} tone="neg" />
        <Row label="Entry" value={session.bestEntry} tone="cyan" />
        <Row label="Delay" value={session.bestDelay} tone="cyan" />
      </div>

      {/* Toggles */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#223142]">
        <ToggleChip
          label="LONG"
          active={session.longs}
          onClick={(e) => {
            e?.stopPropagation?.();
            onToggle(session.key, "longs");
          }}
          color="green"
          testId={`toggle-${session.key}-long`}
        />
        <ToggleChip
          label="SHORT"
          active={session.shorts}
          onClick={(e) => {
            e?.stopPropagation?.();
            onToggle(session.key, "shorts");
          }}
          color="red"
          testId={`toggle-${session.key}-short`}
        />
        <ToggleChip
          label="BOS"
          active={session.bos}
          onClick={(e) => {
            e?.stopPropagation?.();
            onToggle(session.key, "bos");
          }}
          color="blue"
          testId={`toggle-${session.key}-bos`}
        />
        <ToggleChip
          label="CHoCH"
          active={session.choch}
          onClick={(e) => {
            e?.stopPropagation?.();
            onToggle(session.key, "choch");
          }}
          color="purple"
          testId={`toggle-${session.key}-choch`}
        />
      </div>

      {/* Analyze button */}
      <button
        data-testid={`session-card-${session.key}-analyze`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(session.key);
          window.scrollTo({
            top: document.body.scrollHeight * 0.55,
            behavior: "smooth",
          });
        }}
        className={[
          "mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md border py-2 text-xs font-medium transition-all",
          selected
            ? "bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]"
            : "bg-[#0D1520] border-[#223142] text-[#94A3B8] hover:border-[#22D3EE] hover:text-[#22D3EE]",
        ].join(" ")}
      >
        <BarChart2 size={12} />
        Analyze
      </button>

      {/* Status indicator bottom-left */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: dimmed ? "#EF4444" : partial ? "#F59E0B" : "#22C55E",
            boxShadow: `0 0 6px ${dimmed ? "#EF4444" : partial ? "#F59E0B" : "#22C55E"}`,
          }}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, tone = "default" }) {
  const cls =
    tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : tone === "cyan" ? "text-[#22D3EE]" : "text-[#E5EDF7]";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-[#64748B] font-mono">{label}</span>
      <span className={`font-mono tabular text-xs font-semibold ${cls}`}>{value}</span>
    </div>
  );
}

function Row({ label, value, tone = "default" }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : tone === "cyan" ? "text-[#22D3EE]" : "text-[#E5EDF7]";
  return (
    <div className="flex items-baseline gap-2 leading-tight">
      <span className="text-[#64748B] uppercase tracking-wider font-mono w-10">{label}</span>
      <span className={`font-mono truncate text-[10.5px] ${cls}`}>{value}</span>
    </div>
  );
}

export default function SessionControlCenter({ sessions, selectedKey, onSelect, onToggle }) {
  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <SectionLabel>Session Control Center</SectionLabel>
          <span className="text-[10px] text-[#64748B]">
            Toggle sessions, directions and structures — preview updates instantly.
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-wider">
          <LegendDot color="#22C55E" label="Enabled" />
          <LegendDot color="#EF4444" label="Disabled" />
          <LegendDot color="#F59E0B" label="Partially Disabled" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {sessions.map((s) => (
          <SessionCard
            key={s.key}
            session={s}
            selected={s.key === selectedKey}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </div>
    </Panel>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
    </span>
  );
}
