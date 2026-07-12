// PortfolioManager.jsx — Portfolio Manager visual control centre (READ-ONLY).
//
// Renders the deployed decision-policy table (mirrored from the Lux backend artifact
// configs/policy/deployed_policy.v1.json → src/data/deployedPolicy.v1.json). No editing,
// no execution, no config mutation. All friendly labels, tooltips, lifecycle, the frozen
// research recommendation, and the cohort ranking come from the single source of truth
// src/data/portfolioLabels.js — this component never re-implements policy logic.
//
// To refresh the data: copy the Lux file over src/data/deployedPolicy.v1.json.

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import policyDoc from "@/data/deployedPolicy.v1.json";
import {
    loadPolicy, filterCohorts, filterOptions,
    POLICY_REGIMES, CONFIDENCES,
} from "@/data/portfolioPolicy";
import {
    POLICY_LABELS, POLICY_TOOLTIPS, POLICY_SHORT, POLICY_TONE, POLICY_STATE_RULES,
    effectiveNetR, beforePMNetR, rankCohorts, RANK_LABEL, MIN_SAMPLE,
    PM_LIFECYCLE, PM_LIFECYCLE_INTRO, LIFECYCLE_OWNERS, PM_TIMING_NOTE, PM_STATIC_NOTE, PM_RECOMMENDATION,
} from "@/data/portfolioLabels";

const CONF_TONE = {
    HIGH: "success",
    MEDIUM: "accent-secondary",
    LOW: "border-mid",
    MORE_DATA_REQUIRED: "warning",
};

function Chip({ tone, title, children }) {
    return (
        <span
            title={title}
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-ui whitespace-nowrap"
            style={{ borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` }}
        >
            {children}
        </span>
    );
}

// Friendly policy label (primary) with the canonical code shown muted + a tooltip.
function PolicyLabel({ code, showCode = true }) {
    return (
        <span className="inline-flex items-center gap-1" title={POLICY_TOOLTIPS[code]}>
            <Chip tone={POLICY_TONE[code]}>{POLICY_LABELS[code]}</Chip>
            {showCode && <span className="text-[9.5px] text-muted-lab font-ui">{code}</span>}
        </span>
    );
}

function StatTile({ label, value, tone, title }) {
    return (
        <div title={title} className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] px-3 py-2">
            <div className="text-[10px] text-muted-lab font-ui">{label}</div>
            <div className="text-[15px] font-ui" style={{ color: tone ? `hsl(var(--${tone}))` : "hsl(var(--text-1))" }}>
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

function RCell({ v, bold }) {
    if (v == null) return <span className="text-muted-lab">—</span>;
    const tone = v > 0 ? "success" : v < 0 ? "danger" : "text-2";
    return (
        <span className={bold ? "font-semibold" : ""} style={{ color: `hsl(var(--${tone}))` }}>
            {v > 0 ? "+" : ""}{v.toFixed(2)}
        </span>
    );
}

// ── Recommended Setup card (Phase 5) — the FROZEN research recommendation. ────────
// Explicitly labelled as the research recommendation, distinct from the deployed
// policy / any selected run's actual configuration.
function RecommendedSetup({ deployedVersion, changeIsDeployed }) {
    const r = PM_RECOMMENDATION;
    return (
        <section className="rounded-md border border-[hsl(var(--accent-primary))] bg-[hsl(var(--panel))] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[12.5px] font-ui text-[hsl(var(--text-1))]">
                    Research Recommendation <span className="text-muted-lab">· Portfolio Manager</span>
                </h2>
                <Chip tone="success">PM research: {r.researchStatus}</Chip>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-ui">
                <div className="rounded border border-[hsl(var(--border-soft))] p-2">
                    <div className="text-[10px] text-muted-lab">Triggered Entry</div>
                    <div className="text-[hsl(var(--text-1))]">Threshold {r.triggeredEntry.threshold}</div>
                    <div className="text-[hsl(var(--text-2))]">Arm {r.triggeredEntry.armRegion} · compare {r.triggeredEntry.primaryCompare}</div>
                </div>
                <div className="rounded border border-[hsl(var(--border-soft))] p-2">
                    <div className="text-[10px] text-muted-lab">Portfolio Manager</div>
                    <div className="text-[hsl(var(--text-1))]">PM {r.portfolioManager.pm}: <span style={{ color: "hsl(var(--success))" }}>{r.portfolioManager.state}</span></div>
                    <div className="text-[hsl(var(--text-2))]">Current chop behaviour unchanged</div>
                </div>
                <div className="rounded border border-[hsl(var(--border-soft))] p-2">
                    <div className="text-[10px] text-muted-lab">Other layers</div>
                    {r.layers.map((l) => (
                        <div key={l.name} className="text-[hsl(var(--text-2))]">
                            {l.name}: <span style={{ color: "hsl(var(--danger))" }}>{l.state}</span>
                        </div>
                    ))}
                </div>
                <div className="rounded border border-[hsl(var(--border-soft))] p-2">
                    <div className="text-[10px] text-muted-lab">Policy change (v1 → v1.1)</div>
                    <div className="text-[hsl(var(--text-1))]">{r.policyChange.cohort}</div>
                    <div className="text-[hsl(var(--text-2))] flex items-center gap-1">
                        <span style={{ color: "hsl(var(--danger))" }}>{r.policyChange.fromLabel}</span>
                        <span className="text-muted-lab">→</span>
                        <span style={{ color: "hsl(var(--accent-primary))" }}>{r.policyChange.toLabel}</span>
                    </div>
                </div>
            </div>
            <div className="mt-2 text-[10px] text-muted-lab font-ui">
                This is the frozen research recommendation. Currently deployed policy is{" "}
                <span className="text-[hsl(var(--text-2))]">{deployedVersion}</span>
                {changeIsDeployed
                    ? " (the v1.1 change is live)."
                    : " — the New York CHoCH Short change is NOT yet in the deployed policy shown below."}
                {" "}Next use: {r.nextUse}.
            </div>
        </section>
    );
}

// ── Lifecycle strip — the PM's ARCHITECTURAL ROLE (where it enters the strategy ───
// and what happens to a trade passing through it). Steps are tagged by owning layer:
// BASE STRATEGY → TRIGGERED ENTRY → PORTFOLIO MANAGER → MARKET STATE → KEEP/BLOCK → EXECUTION.
function LifecycleStrip() {
    return (
        <section className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3">
            <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[12.5px] font-ui text-[hsl(var(--text-1))]">Where the Portfolio Manager sits</h2>
                <span className="text-[10px] text-muted-lab font-ui">base strategy → triggered entry → PM → execution</span>
            </div>
            <div className="mt-1.5 text-[10px] text-[hsl(var(--text-2))] font-ui leading-snug max-w-3xl">{PM_LIFECYCLE_INTRO}</div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {PM_LIFECYCLE.map((s, i) => {
                    const owner = LIFECYCLE_OWNERS[s.owner] || { label: "", tone: "text-3" };
                    return (
                        <React.Fragment key={s.n}>
                            <div
                                className="min-w-[150px] flex-1 rounded border bg-[hsl(var(--panel-2))] px-2 py-1.5"
                                style={{ borderColor: `hsl(var(--${owner.tone}) / 0.55)` }}
                            >
                                <div className="text-[8.5px] uppercase tracking-wide font-ui" style={{ color: `hsl(var(--${owner.tone}))` }}>
                                    {owner.label}
                                </div>
                                <div className="text-[10px] font-ui text-[hsl(var(--text-1))] mt-0.5">{s.n}. {s.title}</div>
                                <div className="text-[10px] text-[hsl(var(--text-2))] font-ui leading-snug mt-0.5">{s.body}</div>
                            </div>
                            {i < PM_LIFECYCLE.length - 1 && (
                                <div className="self-center text-muted-lab text-[12px] select-none">›</div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            <div className="mt-2 text-[10px] text-muted-lab font-ui">{PM_STATIC_NOTE}</div>
            <div className="mt-1 text-[10px] text-[hsl(var(--warning))] font-ui">{PM_TIMING_NOTE}</div>
        </section>
    );
}

// ── Four-action legend (Phase 3/7). ──────────────────────────────────────────────
function ActionLegend() {
    return (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {POLICY_REGIMES.map((code) => (
                <div key={code} className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-2.5">
                    <div className="flex items-center gap-2">
                        <Chip tone={POLICY_TONE[code]}>{POLICY_LABELS[code]}</Chip>
                        <span className="text-[9.5px] text-muted-lab font-ui">{code}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-[hsl(var(--text-2))] font-ui leading-snug">{POLICY_TOOLTIPS[code]}</div>
                    <ul className="mt-1.5 space-y-0.5">
                        {POLICY_STATE_RULES[code].map((rule, i) => {
                            const blocks = rule.action === "block";
                            return (
                                <li key={i} className="flex items-center justify-between gap-2 text-[10px] font-ui">
                                    <span className="text-[hsl(var(--text-2))]">{rule.when}</span>
                                    <span style={{ color: blocks ? "hsl(var(--danger))" : "hsl(var(--success))" }}>{rule.action}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </section>
    );
}

const SORTS = [
    { key: "policy", label: "PM action" },
    { key: "session", label: "Session" },
    { key: "effective", label: "Net R (kept)" },
    { key: "before", label: "Net R (before PM)" },
    { key: "sampleSize", label: "Trades (N)" },
];

export default function PortfolioManager() {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const opts = useMemo(() => filterOptions(table.cohorts), [table]);
    const rankTier = useMemo(() => rankCohorts(table.cohorts), [table]);
    const [filters, setFilters] = useState({
        instrument: "", session: "", structure: "", direction: "", policy: "", confidence: "",
    });
    const [sortKey, setSortKey] = useState("effective");
    const [sortDir, setSortDir] = useState("desc");
    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

    // Is the v1.1 New York CHoCH Short change already live in the deployed mirror?
    const changeIsDeployed = useMemo(() => {
        const c = table.byKey.get("EURUSD|newYork|choch_short");
        return !!c && c.policy === "DIRECTION_AWARE";
    }, [table]);

    const rows = useMemo(() => {
        const filtered = filterCohorts(table.cohorts, filters);
        const val = (c) => {
            switch (sortKey) {
                case "policy": return POLICY_LABELS[c.policy] || c.policy;
                case "session": return c.session;
                case "effective": return effectiveNetR(c) ?? -Infinity;
                case "before": return beforePMNetR(c) ?? -Infinity;
                case "sampleSize": return c.sampleSize ?? -Infinity;
                default: return 0;
            }
        };
        const dir = sortDir === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const av = val(a), bv = val(b);
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return a.cohortKey < b.cohortKey ? -1 : 1;
        });
    }, [table, filters, sortKey, sortDir]);

    const th = "text-left font-ui text-[10px] text-muted-lab px-2 py-1.5 whitespace-nowrap";
    const td = "font-ui text-[11px] text-[hsl(var(--text-1))] px-2 py-1.5 align-top";
    const rowBg = (tier) =>
        tier === "strong"
            ? "linear-gradient(90deg, hsl(var(--success) / 0.10), transparent)"
            : tier === "weak"
                ? "linear-gradient(90deg, hsl(var(--danger) / 0.10), transparent)"
                : "transparent";

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1 className="text-[16px] font-ui text-[hsl(var(--text-1))]">Portfolio Manager</h1>
                <div className="text-[10.5px] text-muted-lab font-ui text-right">
                    <div>Deployed policy + full-history research (reference). Sync source:{" "}
                    <span className="text-[hsl(var(--text-2))]">configs/policy/deployed_policy.v1.json</span></div>
                    <div className="mt-0.5">Want what PM did in a specific run?{" "}
                    <Link to="/runs" className="text-[hsl(var(--accent-primary))] hover:underline" data-testid="pm-page-open-run-link">Open a run → “PM · This Run”</Link></div>
                </div>
            </div>

            {/* Phase 5 — frozen research recommendation (distinct from deployed/selected) */}
            <RecommendedSetup deployedVersion={table.policyVersion} changeIsDeployed={changeIsDeployed} />

            {/* Phase 4 — lifecycle strip */}
            <LifecycleStrip />

            {/* Meta + counts (friendly labels) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <StatTile label="Deployed policy" value={table.policyVersion} title={`sha ${(table.policySha256 || "").slice(0, 12)}`} />
                <StatTile label="Created" value={(table.createdAt || "—").slice(0, 10)} />
                <StatTile label="Cohorts" value={table.counts.total} />
                {POLICY_REGIMES.map((p) => (
                    <StatTile key={p} label={POLICY_LABELS[p]} value={table.counts.byPolicy[p]} tone={POLICY_TONE[p]} title={`${p} — ${POLICY_TOOLTIPS[p]}`} />
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-muted-lab font-ui">Confidence:</span>
                {CONFIDENCES.map((c) => (
                    <Chip key={c} tone={CONF_TONE[c]}>{c} · {table.counts.byConfidence[c]}</Chip>
                ))}
                {table.sourceResearch && (
                    <span className="text-[10px] text-muted-lab font-ui ml-auto">source: {table.sourceResearch}</span>
                )}
            </div>

            {/* Phase 3/7 — four-action legend with plain-English rules */}
            <ActionLegend />

            {/* Filters + sort */}
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3">
                <Select label="Instrument" value={filters.instrument} onChange={set("instrument")} options={opts.instrument} />
                <Select label="Session" value={filters.session} onChange={set("session")} options={opts.session} />
                <Select label="Structure" value={filters.structure} onChange={set("structure")} options={opts.structure} />
                <Select label="Direction" value={filters.direction} onChange={set("direction")} options={opts.direction} />
                <Select label="Action" value={filters.policy} onChange={set("policy")} options={opts.policy.map((p) => p)} />
                <Select label="Confidence" value={filters.confidence} onChange={set("confidence")} options={opts.confidence} />
                <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-lab font-ui">Sort by</span>
                    <div className="flex gap-1">
                        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
                            className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] text-[hsl(var(--text-1))] text-[11px] font-ui px-2 py-1">
                            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <button
                            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                            className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] text-[hsl(var(--text-2))] text-[11px] font-ui px-2 py-1"
                            title="Toggle sort direction"
                        >
                            {sortDir === "asc" ? "↑" : "↓"}
                        </button>
                    </div>
                </label>
                <div className="flex items-end text-[10.5px] text-muted-lab font-ui ml-auto">
                    {rows.length} / {table.counts.total} cohorts
                </div>
            </div>

            {/* Highlight legend */}
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-ui">
                <span className="text-muted-lab">Row highlight:</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(var(--success) / 0.25)" }} /> {RANK_LABEL.strong}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(var(--danger) / 0.25)" }} /> {RANK_LABEL.weak}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-[hsl(var(--border-mid))]" /> {RANK_LABEL.neutral}</span>
                <span className="text-muted-lab ml-1">(ranked by kept Net R; needs ≥ {MIN_SAMPLE} trades; NEVER TRADE cohorts are neutral)</span>
            </div>

            {/* Cohort table (Phases 6/7) */}
            <div className="overflow-x-auto rounded-md border border-[hsl(var(--border-soft))]">
                <table className="min-w-full border-collapse">
                    <thead className="bg-[hsl(var(--panel))]">
                        <tr className="border-b border-[hsl(var(--border-soft))]">
                            <th className={th}>Session</th>
                            <th className={th}>Structure</th>
                            <th className={th}>Direction</th>
                            <th className={th}>PM action</th>
                            <th className={th}>Market-state behaviour</th>
                            <th className={th}>Confidence</th>
                            <th className={`${th} text-right`}>Trades</th>
                            <th className={`${th} text-right`}>Before PM</th>
                            <th className={`${th} text-right`}>Kept (after PM)</th>
                            <th className={th}>Rationale</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((c) => {
                            const tier = rankTier.get(c.cohortKey) || "neutral";
                            return (
                                <tr key={c.cohortKey} className="border-b border-[hsl(var(--border-soft))]" style={{ background: rowBg(tier) }}
                                    title={tier !== "neutral" ? RANK_LABEL[tier] : undefined}>
                                    <td className={td}>{c.session}</td>
                                    <td className={td}>{c.structure}</td>
                                    <td className={td}>{c.direction}</td>
                                    <td className={td}><PolicyLabel code={c.policy} /></td>
                                    <td className={`${td} text-[hsl(var(--text-2))] max-w-[220px]`}>{POLICY_SHORT[c.policy]}</td>
                                    <td className={td}>{c.confidence ? <Chip tone={CONF_TONE[c.confidence]}>{c.confidence}</Chip> : <span className="text-muted-lab">—</span>}</td>
                                    <td className={`${td} text-right`}>{c.sampleSize ?? "—"}</td>
                                    <td className={`${td} text-right`}><RCell v={beforePMNetR(c)} /></td>
                                    <td className={`${td} text-right`}>{c.policy === "DISABLE" ? <span className="text-muted-lab" title="Blocked — no active book">blocked</span> : <RCell v={effectiveNetR(c)} bold />}</td>
                                    <td className={`${td} max-w-[300px] text-[hsl(var(--text-2))]`}>{c.rationale}</td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr><td className={`${td} text-muted-lab`} colSpan={10}>No cohorts match the current filters.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="text-[10px] text-muted-lab font-ui">
                Read-only. Policy is authored in research and deployed via the Lux backend; this view does not
                edit, run, or mutate any configuration. “Before PM” is the always-allow (label) book; “Kept” is
                the book under the cohort’s assigned action. PF / Max DD are per-run metrics and live in the
                Runs view, not in the deployed policy.
            </div>
        </div>
    );
}
