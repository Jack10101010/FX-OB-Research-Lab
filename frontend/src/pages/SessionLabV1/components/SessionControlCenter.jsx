import React from "react";
import {
  SectionLabel,
  ToggleChip,
  fmtR,
} from "./primitives";
import { Moon, Building2, Coffee, Building, Sparkles, Globe } from "lucide-react";

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

  return (
    <div
      onClick={() => onSelect(session.key)}
      data-testid={`session-card-${session.key}`}
      className={[
        "relative rounded border bg-[hsl(var(--panel-2))] p-4 cursor-pointer transition-all overflow-hidden",
        selected
          ? "border-[hsl(var(--accent-primary))] card-glow"
          : "border-[hsl(var(--border-soft))] hover:border-[hsl(var(--border-mid))]",
        dimmed ? "opacity-50 grayscale-[40%]" : "",
      ].join(" ")}
    >
      {/* Title row */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded shrink-0"
          style={{
            backgroundColor: `${iconColor}1A`,
            border: `1px solid ${iconColor}40`,
            color: iconColor,
          }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold tracking-tight uppercase text-[hsl(var(--text))] truncate">
              {session.name}
            </h3>
          </div>
          <div className="text-[10px] text-muted-lab font-num mt-0.5">{session.range}</div>
        </div>
      </div>

      {/* Net R */}
      <div className="mb-3">
        <div
          className={[
            "font-num tabular-nums font-bold text-3xl leading-none",
            positive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]",
          ].join(" ")}
        >
          {fmtR(session.netR)}
        </div>
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
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[hsl(var(--border-soft))]">
        <ToggleChip
          label="LONG"
          active={session.longs}
          onClick={(e) => { e?.stopPropagation?.(); onToggle(session.key, "longs"); }}
          color="cyan"
          testId={`toggle-${session.key}-long`}
        />
        <ToggleChip
          label="SHORT"
          active={session.shorts}
          onClick={(e) => { e?.stopPropagation?.(); onToggle(session.key, "shorts"); }}
          color="cyan"
          testId={`toggle-${session.key}-short`}
        />
        <ToggleChip
          label="BOS"
          active={session.bos}
          onClick={(e) => { e?.stopPropagation?.(); onToggle(session.key, "bos"); }}
          color="cyan"
          testId={`toggle-${session.key}-bos`}
        />
        <ToggleChip
          label="CHoCH"
          active={session.choch}
          onClick={(e) => { e?.stopPropagation?.(); onToggle(session.key, "choch"); }}
          color="cyan"
          testId={`toggle-${session.key}-choch`}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, tone = "default" }) {
  const cls =
    tone === "pos"
      ? "text-[hsl(var(--success))]"
      : tone === "neg"
      ? "text-[hsl(var(--danger))]"
      : tone === "cyan"
      ? "text-[hsl(var(--accent-primary))]"
      : "text-[hsl(var(--text))]";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-lab font-ui">{label}</span>
      <span className={`font-num tabular-nums text-xs font-semibold ${cls}`}>{value}</span>
    </div>
  );
}

function Row({ label, value, tone = "default" }) {
  const cls =
    tone === "pos"
      ? "text-[hsl(var(--success))]"
      : tone === "neg"
      ? "text-[hsl(var(--danger))]"
      : tone === "cyan"
      ? "text-[hsl(var(--accent-primary))]"
      : "text-[hsl(var(--text))]";
  return (
    <div className="flex items-baseline gap-2 leading-tight">
      <span className="text-muted-lab uppercase tracking-wider font-ui w-10">{label}</span>
      <span className={`font-num truncate text-[10.5px] ${cls}`}>{value}</span>
    </div>
  );
}

function SplitBar({ leftLabel, leftPct, leftColor, rightLabel, rightPct, rightColor, height = 4 }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between text-[9.5px] text-muted-lab font-num">
        <span>{leftLabel} {leftPct}%</span>
        <span>{rightLabel} {rightPct}%</span>
      </div>
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        <div style={{ width: `${leftPct}%`, backgroundColor: leftColor }} />
        <div style={{ width: `${rightPct}%`, backgroundColor: rightColor }} />
      </div>
    </div>
  );
}

export default function SessionControlCenter({ sessions, selectedKey, onSelect, onToggle }) {
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SectionLabel>Session Control Center</SectionLabel>
        <span className="text-[10px] text-muted-lab font-ui">
          Select a session to drill in. Toggle rules to update the Run Impact Summary.
        </span>
      </div>

      <div className="overflow-x-auto session-cards-scroll pb-3 -mb-1">
        <div className="flex gap-4" style={{ minWidth: "max-content" }}>
          {sessions.map((s) => (
            <div key={s.key} className="w-[218px] shrink-0">
              <SessionCard
                session={s}
                selected={s.key === selectedKey}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[10px] text-muted-lab font-num">
        Session metrics are unfiltered. Toggle rules only affect the Run Impact Summary above.
      </p>
    </div>
  );
}
