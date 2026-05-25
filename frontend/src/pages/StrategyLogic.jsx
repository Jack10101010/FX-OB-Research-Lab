import React from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel, SectionTitle } from "@/components/lab/NeonPanel";
import { NeonButton } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { ArrowRight, Crosshair, Map, Wrench } from "lucide-react";

const flow = [
    "CSV candles",
    "Detection TF resample",
    "OB detection",
    "Execution simulation",
    "CSV / JSON export",
    "Frontend import",
    "Strategy Map / Trade Inspector",
];

const outcomes = [
    ["WIN", "Target was reached before the stop."],
    ["LOSS", "Stop was reached before the target."],
    ["UNFILLED", "The setup never filled before the run ended."],
    ["INVALIDATED", "Price broke through the OB before a usable fill."],
    ["SESSION_FILTERED", "The setup touched entry during a disabled fill session."],
    ["NEWS_BLACKOUT", "The setup was blocked by the current news blackout filter."],
    ["NEWS_TOUCH_CANCEL", "Planned: a paused setup was touched during blackout and cancelled."],
    ["REVERSE_TOUCH_CANCEL", "A paused opposite setup was touched while conflict rules blocked it."],
    ["NEWS_FLATTEN", "Planned: an active trade was closed before a restricted news window."],
    ["PROTECTION_EXIT", "A configured protection rule closed the trade before normal TP/SL."],
];

export default function StrategyLogic() {
    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="REFERENCE MANUAL"
                title="Strategy Logic"
                subtitle="Plain-English guide to how the Lux-style order block backtester creates setups, manages pending orders, and exports outcomes."
                actions={
                    <>
                        <Link to="/strategy"><NeonButton icon={Wrench} tone="secondary">Open Builder</NeonButton></Link>
                        <Link to="/strategy-map"><NeonButton icon={Map} tone="ghost">Strategy Map</NeonButton></Link>
                        <Link to="/trade-inspector"><NeonButton icon={Crosshair} tone="ghost">Trade Inspector</NeonButton></Link>
                    </>
                }
            />

            <div className="px-6 grid grid-cols-1 xl:grid-cols-[250px_1fr] gap-4">
                <aside className="hidden xl:block">
                    <div className="sticky top-4 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.65)] clip-bevel-sm p-3">
                        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab mb-2">Contents</div>
                        {[
                            "Big Picture",
                            "Data Flow",
                            "OB Lifecycle",
                            "Entry Logic",
                            "Stops & Targets",
                            "Execution Modes",
                            "Session Filtering",
                            "News Blackout",
                            "Outcomes",
                            "Limitations",
                        ].map((item) => (
                            <a key={item} href={`#${slug(item)}`} className="block py-1.5 text-[12px] text-[hsl(var(--text-2))] hover:text-white">
                                {item}
                            </a>
                        ))}
                    </div>
                </aside>

                <main className="space-y-4">
                    <Section id="big-picture" title="Big Picture" badge="Current">
                        <p>
                            This app tests a LuxAlgo-style swing order block strategy. Detection candles create order blocks. Execution candles test whether price fills entries, reaches stops or targets, and passes configured filters.
                        </p>
                        <Callout tone="important">
                            Detection timeframe and execution timeframe are separate. An M15 order block can be traded on 1m candles.
                        </Callout>
                    </Section>

                    <Section id="data-flow" title="Data Flow" badge="Current">
                        <div className="flex flex-wrap items-center gap-2">
                            {flow.map((step, index) => (
                                <React.Fragment key={step}>
                                    <FlowChip>{step}</FlowChip>
                                    {index < flow.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />}
                                </React.Fragment>
                            ))}
                        </div>
                    </Section>

                    <Section id="ob-lifecycle" title="Order Block Lifecycle" badge="Important">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <FlowCard title="Normal path" steps={["Detected", "Pending", "Filled", "Win / Loss"]} />
                            <FlowCard title="Other paths" steps={["Invalidated", "Unfilled", "Reverse Touch Cancelled", "Paused during blackout", "Rearmed if untouched", "Cancelled if touched"]} />
                        </div>
                    </Section>

                    <Section id="entry-logic" title="Entry Logic" badge="Current">
                        <BulletList items={[
                            "A limit entry is placed at the order block edge.",
                            "A fill occurs when an execution candle touches that entry price.",
                            "Order block price geometry comes from the detection timeframe candle/range.",
                            "Fill, stop, target, and exit checks are performed on execution candles.",
                        ]} />
                    </Section>

                    <Section id="stops-targets" title="Stops & Targets" badge="Current">
                        <BulletList items={[
                            "Stop loss is placed beyond the far side of the order block, plus the configured stop buffer.",
                            "Target is calculated from the configured RR multiple.",
                            "R result is based on entry-to-stop risk: +RR for target, -1R for stop, or partial R for protection exits.",
                            "When stop and target are both touched in the same candle, the backtester uses a conservative ordering assumption.",
                        ]} />
                    </Section>

                    <Section id="execution-modes" title="Execution Modes" badge="Current">
                        <DefinitionGrid rows={[
                            ["Multi Position", "Multiple trades can run at the same time."],
                            ["Single Position", "Only one trade can be open at a time."],
                            ["One Per Direction", "One long and one short can coexist, but not multiple in the same direction."],
                            ["Allow Auto Reversal", "Conceptually closes/flips on conflicting setups where supported."],
                            ["Block Opposite", "Conflicting opposite setups are ignored or paused depending on logic path."],
                        ]} />
                    </Section>

                    <Section id="session-filtering" title="Session Filtering" badge="Current">
                        <p>
                            Session filtering uses UTC session labels and filters the fill session. Disabled sessions block fills and require a new backend run.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {["Asia", "London", "London Lull", "New York", "Outside"].map((session) => <Pill key={session} tone="secondary">{session}</Pill>)}
                        </div>
                        <Callout tone="limitation">
                            Strategy Map session bands are visual only. They do not change imported metrics.
                        </Callout>
                    </Section>

                    <Section id="news-blackout" title="News Blackout" badge="Mixed">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <MiniCard title="Current">
                                Blocks fills around matching news events using the configured before/after window, impact filters, and currencies.
                            </MiniCard>
                            <MiniCard title="Target live-funded model">
                                Pause pending OBs before/during blackout, cancel paused OBs if touched, rearm untouched OBs after blackout, and close active trades before restricted windows.
                            </MiniCard>
                        </div>
                    </Section>

                    <Section id="outcomes" title="Outcomes Glossary" badge="Reference">
                        <DefinitionGrid rows={outcomes} />
                    </Section>

                    <Section id="limitations" title="Limitations" badge="Limitation">
                        <BulletList items={[
                            "1m candle granularity is not tick-perfect.",
                            "Same-candle ordering can be ambiguous, so the simulation uses conservative assumptions.",
                            "Frontend visuals help review the run, but backend exports are the source of truth.",
                            "Changing filters in the UI does not change metrics until the strategy is rerun.",
                            "News blackout pause/rearm and active-trade flattening are target behaviours unless marked as implemented in the backend.",
                        ]} />
                    </Section>
                </main>
            </div>
        </div>
    );
}

function Section({ id, title, badge, children }) {
    return (
        <NeonPanel id={id} title={title} action={badge ? <Pill tone={badge === "Limitation" ? "warning" : "secondary"}>{badge}</Pill> : null}>
            <div className="text-[13px] leading-relaxed text-[hsl(var(--text-2))] space-y-3">
                {children}
            </div>
        </NeonPanel>
    );
}

function FlowChip({ children }) {
    return (
        <span className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.55)] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] text-[hsl(var(--text-2))]">
            {children}
        </span>
    );
}

function FlowCard({ title, steps }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
            <SectionTitle>{title}</SectionTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {steps.map((step, index) => (
                    <React.Fragment key={step}>
                        <FlowChip>{step}</FlowChip>
                        {index < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

function MiniCard({ title, children }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
            <SectionTitle>{title}</SectionTitle>
            <p className="mt-2">{children}</p>
        </div>
    );
}

function BulletList({ items }) {
    return (
        <ul className="space-y-2">
            {items.map((item) => (
                <li key={item} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-[hsl(var(--accent-secondary))]" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

function DefinitionGrid({ rows }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {rows.map(([term, definition]) => (
                <div key={term} className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)] clip-bevel-sm p-3">
                    <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[hsl(var(--accent-secondary))]">{term}</div>
                    <div className="mt-1 text-[12.5px] text-[hsl(var(--text-2))]">{definition}</div>
                </div>
            ))}
        </div>
    );
}

function Callout({ tone = "important", children }) {
    const isWarning = tone === "limitation";
    return (
        <div className={`border clip-bevel-sm px-3 py-2 text-[12px] ${
            isWarning
                ? "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))]"
                : "border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--accent-secondary)/0.06)] text-[hsl(var(--accent-secondary))]"
        }`}>
            {children}
        </div>
    );
}

function slug(value) {
    return String(value).toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
