// StrategyDoctor.jsx — Edge Monitor / Strategy Doctor (E4): READ-ONLY health view.
//
// Renders the headless "doctor note" mirrored from the Lux backend research output
// (outputs/research/edge_monitor_phase_e/e3_5_strategy_doctor_report → src/data/strategyDoctor/).
// No editing, no execution, no policy mutation, no research trigger, no action buttons.
// It only displays the current Edge Monitor diagnosis. Refresh by copying the Lux JSON over the mirror.

import React from "react";
import { strategyDoctorModel, stateTone } from "@/data/strategyDoctor/strategyDoctorSource";

const m = strategyDoctorModel;

// Plain-English doctor interpretation (display copy; mirrors STRATEGY_DOCTOR_REPORT.md §11).
const DOCTOR_SUMMARY =
    "The system is healthy. The main thing to watch is that recent positive R is more concentrated than " +
    "usual, led by London BOS Short. This is a monitoring signal, not a rule change. Asia BOS Short has " +
    "faded, but the recent sample is too small and prior research showed cohort leadership rotates.";

const COHORT_NOTE = {
    "Asia BOS Short": "faded · low data · not degraded",
    "London BOS Short": "recent leader · not promoted",
};

const NO_CHANGE_LIST = [
    "execution", "deployed policy", "risk", "sizing", "cohort weights",
    "cohort × Market State", "per-cohort RR", "break-even", "protections", "adaptive sizing",
];

function Chip({ tone, children }) {
    return (
        <span
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-ui"
            style={{ borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` }}
        >
            {children}
        </span>
    );
}

function StateBadge({ state }) {
    return <Chip tone={stateTone(state)}>{state}</Chip>;
}

function StatTile({ label, value, tone }) {
    return (
        <div className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] px-3 py-2">
            <div className="text-[10px] text-muted-lab font-ui">{label}</div>
            <div className="text-[15px] font-ui" style={{ color: tone ? `hsl(var(--${tone}))` : "hsl(var(--text-1))" }}>
                {value}
            </div>
        </div>
    );
}

function Card({ title, tag, children }) {
    return (
        <section className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3">
            {(title || tag) && (
                <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-[12px] font-ui text-[hsl(var(--text-1))]">{title}</h2>
                    {tag && <Chip tone="border-mid">{tag}</Chip>}
                </div>
            )}
            {children}
        </section>
    );
}

const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const band = (r) =>
    r.baseline_lower === null || r.baseline_upper === null ? "—" : `[${r.baseline_lower}, ${r.baseline_upper}]`;

function Table({ head, rows }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-ui">
                <thead>
                    <tr className="text-muted-lab text-left">
                        {head.map((h) => <th key={h} className="py-1 pr-3 font-normal">{h}</th>)}
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    );
}

export default function StrategyDoctor() {
    return (
        <div className="p-4 space-y-3 text-[hsl(var(--text-1))]">
            {/* 1 · Status banner */}
            <section className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[14px] font-ui">Strategy Doctor</h1>
                    <StateBadge state={m.overall.state} />
                    <Chip tone="border-mid">NO LIVE ACTION</Chip>
                    <span className="text-[10px] text-muted-lab font-ui">as of {m.asOf}</span>
                    <span className="text-[10px] text-muted-lab font-ui">policy {m.policyVersion}</span>
                    <span className="ml-auto text-[10px] text-muted-lab font-ui">read-only · monitor only</span>
                </div>
                <div className="mt-2 text-[11px] font-ui">
                    <span className="text-muted-lab">Validated stack (unchanged): </span>
                    <span style={{ color: "hsl(var(--success))" }}>{m.validatedStack}</span>
                </div>
            </section>

            {/* 2 · Doctor summary */}
            <Card title="Doctor summary" tag="interpretation">
                <p className="text-[11.5px] font-ui leading-relaxed">{DOCTOR_SUMMARY}</p>
                <p className="mt-1 text-[10.5px] text-muted-lab font-ui">Recommended next action: {m.recommendedNextAction}</p>
            </Card>

            {/* 3 · Signals strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <StatTile label="Actionable alerts" value={m.counts.actionable} tone={m.counts.actionable ? "warning" : "success"} />
                <StatTile label="WATCH" value={m.counts.watch} tone={m.counts.watch ? "warning" : "border-mid"} />
                <StatTile label="DEGRADED" value={m.counts.degraded} tone={m.counts.degraded ? "danger" : "success"} />
                <StatTile label="LOW DATA" value={m.counts.lowData} tone="border-mid" />
                <StatTile label="Research queue" value={m.counts.researchQueue} tone="border-mid" />
            </div>

            {/* 4 · Whole-book health */}
            <Card title="Whole-book health" tag="healthy">
                <Table
                    head={["Window", "n", "Expectancy", "Baseline band", "State"]}
                    rows={m.wholeBook.map((r) => (
                        <tr key={r.entity} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3">{r.entity}</td>
                            <td className="py-1 pr-3">{fmt(r.n)}</td>
                            <td className="py-1 pr-3">{fmt(r.value)}</td>
                            <td className="py-1 pr-3 text-muted-lab">{band(r)}</td>
                            <td className="py-1 pr-3"><StateBadge state={r.state} /></td>
                        </tr>
                    ))}
                />
            </Card>

            {/* 5 · Cohort health */}
            <Card title="Cohort health" tag="recent lens">
                <Table
                    head={["Cohort", "n", "Recent expectancy", "Band", "State", "Note"]}
                    rows={m.cohorts.map((r) => (
                        <tr key={r.entity} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3">{r.entity}</td>
                            <td className="py-1 pr-3">{fmt(r.n)}</td>
                            <td className="py-1 pr-3">{fmt(r.value)}</td>
                            <td className="py-1 pr-3 text-muted-lab">{band(r)}</td>
                            <td className="py-1 pr-3"><StateBadge state={r.state} /></td>
                            <td className="py-1 pr-3 text-muted-lab">{COHORT_NOTE[r.entity] || ""}</td>
                        </tr>
                    ))}
                />
                <p className="mt-2 text-[10px] text-muted-lab font-ui">
                    Low-data cohorts are shown for transparency; they are not degraded and imply no action.
                </p>
            </Card>

            {/* 6 · Policy-layer health */}
            <Card title="Policy-layer health" tag="recent lens">
                <Table
                    head={["Layer", "n", "Recent expectancy", "State"]}
                    rows={m.policyLayers.map((r) => (
                        <tr key={r.entity} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3">{r.entity}</td>
                            <td className="py-1 pr-3">{fmt(r.n)}</td>
                            <td className="py-1 pr-3">{fmt(r.value)}</td>
                            <td className="py-1 pr-3"><StateBadge state={r.state} /></td>
                        </tr>
                    ))}
                />
                <p className="mt-2 text-[10px] text-muted-lab font-ui">DISABLE cohorts are not deployed and are not scored.</p>
            </Card>

            {/* 7 · Concentration WATCH */}
            <Card title="Concentration" tag="monitor only">
                <Table
                    head={["Metric", "Recent share", "Baseline band", "State"]}
                    rows={m.concentration.map((r) => (
                        <tr key={r.entity} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3">{r.entity}</td>
                            <td className="py-1 pr-3">{fmt(r.value)}</td>
                            <td className="py-1 pr-3 text-muted-lab">{band(r)}</td>
                            <td className="py-1 pr-3"><StateBadge state={r.state} /></td>
                        </tr>
                    ))}
                />
                <p className="mt-2 text-[10.5px] font-ui" style={{ color: "hsl(var(--warning))" }}>
                    Recent positive R is more concentrated than usual (led by London BOS Short). Monitor only —
                    this is not a rule change and London BOS Short is not promoted.
                </p>
            </Card>

            {/* 8 · Research queue */}
            <Card title="Research queue" tag="research prompt only">
                {m.researchQueue.map((r) => (
                    <div key={r.entity} className="rounded border border-[hsl(var(--border-soft))] p-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-ui">{r.entity}</span>
                            <StateBadge state={r.state} />
                            {r.severity && <Chip tone="border-mid">severity: {r.severity}</Chip>}
                            {r.confidence && <Chip tone="border-mid">confidence: {r.confidence}</Chip>}
                            <Chip tone="border-mid">NO ACTION</Chip>
                        </div>
                        <p className="mt-1 text-[11px] font-ui">{r.message}</p>
                        <p className="mt-1 text-[10.5px] text-muted-lab font-ui">
                            Recommendation: defer / keep monitoring. Research prompt only — no live action; any study
                            requires walk-forward validation and human approval.
                        </p>
                    </div>
                ))}
            </Card>

            {/* 9 · Hard guardrails */}
            <Card title="Hard guardrails" tag="do not change">
                <div className="flex flex-wrap gap-1.5">
                    {NO_CHANGE_LIST.map((g) => <Chip key={g} tone="danger">do not change: {g}</Chip>)}
                </div>
                <p className="mt-2 text-[10.5px] text-muted-lab font-ui">{m.noChangeAssertion}</p>
            </Card>
        </div>
    );
}
