import React from "react";
import { SectionLabel } from "./primitives";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

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

function FieldNote({ children }) {
  return (
    <p className="text-[10px] text-muted-lab font-num italic mt-1 mb-1">{children}</p>
  );
}

/** Returns a colored dot + off-count badge, or null when all toggles are on. */
function filterBadge(groupFilters) {
  const offCount = Object.values(groupFilters ?? {}).filter((v) => !v).length;
  if (offCount === 0) return null;
  return (
    <span className="ml-auto flex items-center gap-1.5 font-num text-[10px] text-[hsl(var(--accent-primary))]">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-primary))]" />
      {offCount}
    </span>
  );
}

/** Combined badge across multiple filter groups (e.g. outcome + cancelReason). */
function combinedBadge(...groups) {
  const merged = Object.assign({}, ...groups);
  return filterBadge(merged);
}

export default function QuickControls({
  session,
  onToggle,
  deepDiveFilters,
  onDeepDiveFilterChange,
  deepDiveFilterMeta,
  sessionTradeCount,
  defaultDeepDiveFilters,
  obFieldMeta = { hasNews: true, hasAge: true, hasWidth: true },
}) {
  const flipFilter = (group, key) => {
    onDeepDiveFilterChange((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: !prev[group][key] },
    }));
  };

  const isFiltered       = deepDiveFilterMeta?.isFiltered ?? false;
  const excludedCount    = deepDiveFilterMeta?.excludedCount ?? 0;
  const deepDiveTrades   = (sessionTradeCount ?? 0) - excludedCount;
  const cancelledEnabled = deepDiveFilters?.outcome?.cancelled ?? true;

  const obHasNews  = obFieldMeta?.hasNews ?? true;
  const obHasAge   = obFieldMeta?.hasAge  ?? true;
  const anyObField = obHasNews || obHasAge;

  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-4" data-testid="quick-controls">
      {/* Header */}
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
        {/* Run Impact eyebrow */}
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-lab font-num mb-1">
          Run Impact
        </p>

        <Group title="Direction">
          <Row label="Longs"  active={session.longs}  onChange={() => onToggle(session.key, "longs")}  color="#22C55E" testId="qc-longs" />
          <Row label="Shorts" active={session.shorts} onChange={() => onToggle(session.key, "shorts")} color="#EF4444" testId="qc-shorts" />
        </Group>

        <Group title="Structure">
          <Row label="BOS"   active={session.bos}   onChange={() => onToggle(session.key, "bos")}   color="#3B82F6" testId="qc-bos" />
          <Row label="CHoCH" active={session.choch} onChange={() => onToggle(session.key, "choch")} color="#A855F7" testId="qc-choch" />
        </Group>

        {/* Deep Dive divider */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 border-t border-[hsl(var(--border-soft))]" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--accent-primary))] font-num shrink-0">Deep Dive</span>
          <div className="flex-1 border-t border-[hsl(var(--border-soft))]" />
        </div>
        <p className="text-[10px] text-muted-lab font-num -mt-1">Filters the selected-session analytics below.</p>

        {/* Deep Dive accordion groups */}
        <Accordion type="multiple" defaultValue={[]}>

          {/* Entry Model */}
          <AccordionItem value="entryModel" className="border-b-0 border-t border-[hsl(var(--border-soft))]">
            <AccordionTrigger className="flex items-center py-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:no-underline gap-2 [&>svg]:ml-0">
              <span className="flex-1 text-left">Entry Model</span>
              {filterBadge(deepDiveFilters.entryModel)}
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="space-y-0.5 pt-1 pb-3">
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
            </AccordionContent>
          </AccordionItem>

          {/* Trigger Delay */}
          <AccordionItem value="triggerDelay" className="border-b-0 border-t border-[hsl(var(--border-soft))]">
            <AccordionTrigger className="flex items-center py-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:no-underline gap-2 [&>svg]:ml-0">
              <span className="flex-1 text-left">Trigger Delay</span>
              {filterBadge(deepDiveFilters.teDelay)}
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="space-y-0.5 pt-1 pb-3">
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
            </AccordionContent>
          </AccordionItem>

          {/* Outcome + Cancel Reason */}
          <AccordionItem value="outcome" className="border-b-0 border-t border-[hsl(var(--border-soft))]">
            <AccordionTrigger className="flex items-center py-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:no-underline gap-2 [&>svg]:ml-0">
              <span className="flex-1 text-left">Outcome</span>
              {combinedBadge(deepDiveFilters.outcome, deepDiveFilters.cancelReason)}
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="space-y-0.5 pt-1 pb-3">
                <Row
                  label="Wins"
                  active={deepDiveFilters.outcome.win}
                  onChange={() => flipFilter("outcome", "win")}
                  color="#22C55E"
                  testId="qc-out-win"
                />
                <Row
                  label="Losses"
                  active={deepDiveFilters.outcome.loss}
                  onChange={() => flipFilter("outcome", "loss")}
                  color="#EF4444"
                  testId="qc-out-loss"
                />
                <Row
                  label="Breakeven"
                  active={deepDiveFilters.outcome.breakeven}
                  onChange={() => flipFilter("outcome", "breakeven")}
                  color="#64748B"
                  testId="qc-out-breakeven"
                />
                <Row
                  label="Cancelled"
                  active={deepDiveFilters.outcome.cancelled}
                  onChange={() => flipFilter("outcome", "cancelled")}
                  color="#F59E0B"
                  testId="qc-out-cancelled"
                />
                <Row
                  label="Unfilled"
                  active={deepDiveFilters.outcome.unfilled}
                  onChange={() => flipFilter("outcome", "unfilled")}
                  color="#94A3B8"
                  testId="qc-out-unfilled"
                />

                {/* Cancel Reason sub-section */}
                <div className="mt-2 pt-2 border-t border-[hsl(var(--border-soft))]">
                  <SectionLabel className="mb-1">Cancel Reason</SectionLabel>
                  {!cancelledEnabled && (
                    <p className="mb-1 text-[9px] text-muted-lab font-num italic">
                      Enable &quot;Cancelled&quot; above to sub-filter by reason.
                    </p>
                  )}
                  <div
                    className={`space-y-0.5 transition-opacity ${cancelledEnabled ? "" : "opacity-40 pointer-events-none"}`}
                  >
                    <Row
                      label="First Failed Tag"
                      active={deepDiveFilters.cancelReason.firstFailedTag}
                      onChange={() => flipFilter("cancelReason", "firstFailedTag")}
                      color="#22D3EE"
                      testId="qc-cr-fft"
                    />
                    <Row
                      label="Retrace"
                      active={deepDiveFilters.cancelReason.retrace}
                      onChange={() => flipFilter("cancelReason", "retrace")}
                      color="#A78BFA"
                      testId="qc-cr-retrace"
                    />
                    <Row
                      label="News"
                      active={deepDiveFilters.cancelReason.news}
                      onChange={() => flipFilter("cancelReason", "news")}
                      color="#F59E0B"
                      testId="qc-cr-news"
                    />
                    <Row
                      label="Session Filter"
                      active={deepDiveFilters.cancelReason.session}
                      onChange={() => flipFilter("cancelReason", "session")}
                      color="#64748B"
                      testId="qc-cr-session"
                    />
                    <Row
                      label="Other"
                      active={deepDiveFilters.cancelReason.other}
                      onChange={() => flipFilter("cancelReason", "other")}
                      color="#94A3B8"
                      testId="qc-cr-other"
                    />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* OB Quality + OB Age — only rendered when run has OB fields */}
          {anyObField && (
            <AccordionItem value="obQuality" className="border-b-0 border-t border-[hsl(var(--border-soft))]">
              <AccordionTrigger className="flex items-center py-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:no-underline gap-2 [&>svg]:ml-0">
                <span className="flex-1 text-left">OB Quality</span>
                {combinedBadge(deepDiveFilters.obQuality, deepDiveFilters.obAge)}
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <div className="space-y-0.5 pt-1 pb-3">
                  {obHasNews ? (
                    <>
                      <Row
                        label="News OB"
                        active={deepDiveFilters.obQuality.news}
                        onChange={() => flipFilter("obQuality", "news")}
                        color="#F59E0B"
                        testId="qc-ob-news"
                      />
                      <Row
                        label="Clean OB"
                        active={deepDiveFilters.obQuality.clean}
                        onChange={() => flipFilter("obQuality", "clean")}
                        color="#22C55E"
                        testId="qc-ob-clean"
                      />
                    </>
                  ) : (
                    <FieldNote>No news window data in this run.</FieldNote>
                  )}

                  {obHasAge ? (
                    <div className={obHasNews ? "border-t border-[hsl(var(--border-soft))] pt-2 mt-2" : ""}>
                      <SectionLabel className="mb-2">OB Age</SectionLabel>
                      <div className="space-y-0.5">
                        <Row
                          label="Fresh (0–4)"
                          active={deepDiveFilters.obAge.fresh}
                          onChange={() => flipFilter("obAge", "fresh")}
                          color="#22C55E"
                          testId="qc-oa-fresh"
                        />
                        <Row
                          label="Normal (5–10)"
                          active={deepDiveFilters.obAge.normal}
                          onChange={() => flipFilter("obAge", "normal")}
                          color="#94A3B8"
                          testId="qc-oa-normal"
                        />
                        <Row
                          label="Old (10+)"
                          active={deepDiveFilters.obAge.old}
                          onChange={() => flipFilter("obAge", "old")}
                          color="#EF4444"
                          testId="qc-oa-old"
                        />
                      </div>
                    </div>
                  ) : (
                    <FieldNote>bars_to_fill not available in this run.</FieldNote>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

        </Accordion>

        {/* Footer — always visible */}
        <div className="border-t border-[hsl(var(--border-soft))] pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-lab font-num">Deep Dive trades</span>
            <span className="font-num text-[10px] font-bold text-[hsl(var(--accent-primary))]">
              {deepDiveTrades} / {sessionTradeCount}
            </span>
          </div>
          {isFiltered && (
            <button
              onClick={() => onDeepDiveFilterChange(defaultDeepDiveFilters)}
              className="w-full rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-2 py-1.5 text-[10px] font-ui font-medium uppercase tracking-wider text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary))]/50 hover:text-[hsl(var(--accent-primary))] transition-colors"
              data-testid="qc-reset-deep-dive"
            >
              Reset Deep Dive Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
