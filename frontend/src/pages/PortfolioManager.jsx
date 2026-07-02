// PortfolioManager.jsx — Portfolio Manager v1 (Phase 3): READ-ONLY policy viewer.
//
// Renders the deployed decision-policy table (mirrored from the Lux backend artifact
// configs/policy/deployed_policy.v1.json → src/data/deployedPolicy.v1.json). No editing,
// no execution, no config mutation — a window onto the currently deployed policy.
//
// To refresh the data: copy the Lux file over src/data/deployedPolicy.v1.json.

import React, { useMemo, useState } from "react";
import policyDoc from "@/data/deployedPolicy.v1.json";
import {
    loadPolicy, filterCohorts, filterOptions,
    POLICY_REGIMES, CONFIDENCES,
} from "@/data/portfolioPolicy";

const POLICY_TONE = {
    DIRECTION_AWARE: "accent-primary",
    STATE_ONLY: "accent-secondary",
    LABEL: "border-mid",
    DISABLE: "danger",
};
const CONF_TONE = {
    HIGH: "success",
    MEDIUM: "accent-secondary",
    LOW: "border-mid",
    MORE_DATA_REQUIRED: "warning",
};

function Chip({ tone, children }) {
    return (
        <span
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-ui"
            style={{
                borderColor: `hsl(var(--${tone}))`,
                color: `hsl(var(--${tone}))`,
            }}
        >
            {children}
        </span>
    );
}

function StatTile({ label, value, tone }) {
    return (
        <div className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] px-3 py-2">
            <div className="text-[10px] text-muted-lab font-ui">{label}</div>
            <div
                className="text-[15px] font-ui"
                style={{ color: tone ? `hsl(var(--${tone}))` : "hsl(var(--text-1))" }}
            >
                {value}
            </div>
        </div>
    );
}

function Select({ label, value, onChange, options }) {
    return (
        <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-lab font-ui">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] text-[hsl(var(--text-1))] text-[11px] font-ui px-2 py-1"
            >
                <option value="">All</option>
                {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        </label>
    );
}

function RCell({ v }) {
    if (v == null) return <span className="text-muted-lab">—</span>;
    const tone = v > 0 ? "success" : v < 0 ? "danger" : "text-2";
    return <span style={{ color: `hsl(var(--${tone}))` }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</span>;
}

export default function PortfolioManager() {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const opts = useMemo(() => filterOptions(table.cohorts), [table]);
    const [filters, setFilters] = useState({
        instrument: "", session: "", structure: "", direction: "", policy: "", confidence: "",
    });
    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
    const rows = useMemo(() => filterCohorts(table.cohorts, filters), [table, filters]);

    const th = "text-left font-ui text-[10px] text-muted-lab px-2 py-1.5 whitespace-nowrap";
    const td = "font-ui text-[11px] text-[hsl(var(--text-1))] px-2 py-1.5 align-top";

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1 className="text-[16px] font-ui text-[hsl(var(--text-1))]">Portfolio Manager</h1>
                <div className="text-[10.5px] text-muted-lab font-ui">
                    Read-only view of the deployed decision policy. Sync source:{" "}
                    <span className="text-[hsl(var(--text-2))]">configs/policy/deployed_policy.v1.json</span>
                </div>
            </div>

            {/* Meta + counts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <StatTile label="Policy version" value={table.policyVersion} />
                <StatTile label="Created" value={(table.createdAt || "—").slice(0, 10)} />
                <StatTile label="Cohorts" value={table.counts.total} />
                {POLICY_REGIMES.map((p) => (
                    <StatTile key={p} label={p} value={table.counts.byPolicy[p]} tone={POLICY_TONE[p]} />
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-muted-lab font-ui">Confidence:</span>
                {CONFIDENCES.map((c) => (
                    <Chip key={c} tone={CONF_TONE[c]}>{c} · {table.counts.byConfidence[c]}</Chip>
                ))}
                {table.sourceResearch && (
                    <span className="text-[10px] text-muted-lab font-ui ml-auto">
                        source: {table.sourceResearch}
                    </span>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3">
                <Select label="Instrument" value={filters.instrument} onChange={set("instrument")} options={opts.instrument} />
                <Select label="Session" value={filters.session} onChange={set("session")} options={opts.session} />
                <Select label="Structure" value={filters.structure} onChange={set("structure")} options={opts.structure} />
                <Select label="Direction" value={filters.direction} onChange={set("direction")} options={opts.direction} />
                <Select label="Policy" value={filters.policy} onChange={set("policy")} options={opts.policy} />
                <Select label="Confidence" value={filters.confidence} onChange={set("confidence")} options={opts.confidence} />
                <div className="flex items-end text-[10.5px] text-muted-lab font-ui">
                    {rows.length} / {table.counts.total} cohorts
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border-soft))]">
                <table className="min-w-full border-collapse">
                    <thead className="bg-[hsl(var(--panel))]">
                        <tr className="border-b border-[hsl(var(--border-soft))]">
                            <th className={th}>Instrument</th>
                            <th className={th}>Session</th>
                            <th className={th}>Structure</th>
                            <th className={th}>Direction</th>
                            <th className={th}>Cohort key</th>
                            <th className={th}>Policy</th>
                            <th className={th}>Confidence</th>
                            <th className={`${th} text-right`}>N</th>
                            <th className={`${th} text-right`}>Net R (label)</th>
                            <th className={`${th} text-right`}>Net R (state)</th>
                            <th className={`${th} text-right`}>Net R (dir)</th>
                            <th className={th}>Rationale</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((c) => (
                            <tr key={c.cohortKey} className="border-b border-[hsl(var(--border-soft))] hover:bg-[hsl(var(--panel))]">
                                <td className={td}>{c.instrument}</td>
                                <td className={td}>{c.session}</td>
                                <td className={td}>{c.structure}</td>
                                <td className={td}>{c.direction}</td>
                                <td className={`${td} text-[hsl(var(--text-2))]`}>{c.cohortKey}</td>
                                <td className={td}><Chip tone={POLICY_TONE[c.policy]}>{c.policy}</Chip></td>
                                <td className={td}>{c.confidence ? <Chip tone={CONF_TONE[c.confidence]}>{c.confidence}</Chip> : <span className="text-muted-lab">—</span>}</td>
                                <td className={`${td} text-right`}>{c.sampleSize ?? "—"}</td>
                                <td className={`${td} text-right`}><RCell v={c.netRLabel} /></td>
                                <td className={`${td} text-right`}><RCell v={c.netRState} /></td>
                                <td className={`${td} text-right`}><RCell v={c.netRDirection} /></td>
                                <td className={`${td} max-w-[320px] text-[hsl(var(--text-2))]`}>{c.rationale}</td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td className={`${td} text-muted-lab`} colSpan={12}>No cohorts match the current filters.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="text-[10px] text-muted-lab font-ui">
                Read-only. Policy is authored in research and deployed via the Lux backend; this view does not
                edit, run, or mutate any configuration.
            </div>
        </div>
    );
}
