import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { MetricChip } from "@/components/lab/MetricChip";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonButton, Segment } from "@/components/lab/controls";
import {
    Activity, Target, Hash, TrendingUp, AlertOctagon, ShieldCheck,
    ChevronRight, BarChart3, FolderPlus,
} from "lucide-react";
import { useDataset } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { TradeUniverseBadge } from "@/components/lab/TradeUniverseBadge";
import { ActiveRunContext } from "@/components/lab/ActiveRunContext";
import { ResearchStrip } from "@/components/lab/ResearchStrip";
import { getNextStep, resolveRunReference, summarizeRunForDelta, buildRunDelta } from "@/data/projectWorkflow";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie,
} from "recharts";
import { useResultsLens } from "@/data/useResultsLens";
import { summarizeTrades } from "@/data/resultsBasis";
import { ResultsLensControl } from "@/components/lab/ResultsLensControl";
import { formatAccountValue } from "@/components/lab/account/accountEquity";

// Stable scenario override so useTradeUniverse memoizes correctly across
// renders. Used to resolve the baseline universe regardless of the user's
// currently-selected Strategy Map scenario.
const BASELINE_SCENARIO_OVERRIDE = Object.freeze({ family: "baseline" });

const OVERVIEW_SCOPE_KEY = "fxob_overview_scope_v1";

export default function Overview() {
    const navigate = useNavigate();
    const { ACTIVE_RUN, RUNS, SWEEP_RR, hasImportedRuns, PROJECTS, ACTIVE_PROJECT, getRunData } = useDataset();
    const recent = RUNS.filter((r) => r._source === "imported").slice(0, 6);

    // COCKPIT-1 — research guidance for the active run, reusing the pure
    // projectWorkflow helpers (same inputs the Run Workspace passes to the strip).
    // Falls back to the existing active project when the run carries no projectId.
    const projectId = ACTIVE_RUN.projectId || ACTIVE_PROJECT?.id || null;
    const linkedProject = projectId
        ? ((PROJECTS || []).find((p) => p.id === projectId) || ACTIVE_PROJECT || null)
        : null;
    const runRole = ACTIVE_RUN.runRole || "imported";
    const nextStep = linkedProject ? getNextStep(linkedProject, linkedProject.checklist || {}) : null;
    const runReference = React.useMemo(
        () => resolveRunReference({ currentRun: ACTIVE_RUN, project: linkedProject, runs: RUNS }),
        [ACTIVE_RUN, linkedProject, RUNS],
    );
    const deltaRows = React.useMemo(() => {
        if (!runReference.run) return [];
        const cur = summarizeRunForDelta(ACTIVE_RUN, getRunData(ACTIVE_RUN.id)?.trades);
        const ref = summarizeRunForDelta(runReference.run, getRunData(runReference.run.id)?.trades);
        return buildRunDelta(cur, ref);
    }, [ACTIVE_RUN, runReference, getRunData]);

    // ─── Phase 3B-1: scope toggle ────────────────────────────────────────────
    // Default to "scenario" (the active research context). User can flip to
    // "baseline" to see the stable reference numbers regardless of what's
    // selected in Strategy Map. Persisted to localStorage so the dashboard
    // remembers the user's preference across sessions.
    const [scopeMode, setScopeMode] = React.useState(() => {
        try {
            const stored = localStorage.getItem(OVERVIEW_SCOPE_KEY);
            return stored === "baseline" || stored === "scenario" ? stored : "scenario";
        } catch { return "scenario"; }
    });
    React.useEffect(() => {
        try { localStorage.setItem(OVERVIEW_SCOPE_KEY, scopeMode); } catch { /* noop */ }
    }, [scopeMode]);

    // Both universes are resolved every render — hooks rule. The unused one
    // is cheap (the resolver is pure and returns memoized stats).
    const scenarioUniverse = useTradeUniverse();
    const baselineUniverse = useTradeUniverse(null, BASELINE_SCENARIO_OVERRIDE);
    const universe = scopeMode === "baseline" ? baselineUniverse : scenarioUniverse;

    // Phase 3B-0 audit conclusion: every Overview number that used to be
    // sourced from computeProfitFactor(TRADES) / computeMaxDrawdown(EQUITY_CURVE)
    // is now sourced from universe.stats so it agrees with Strategy Map's
    // sanity strip and Failures/Hypothesis Lab numbers by construction.
    const stats = universe.stats;

    // Phase RB-1: Results Basis wiring — KPI strip only. Charts remain Raw R.
    // summarizeTrades with basis:"raw_r" (the default) is byte-equivalent to
    // universe.stats (Raw-R parity guarantee in resultsBasis.js), so default
    // users see zero visible change.
    const lens = useResultsLens();
    const basisStats = React.useMemo(
        () => summarizeTrades(universe.trades || [], { basis: lens.basis, account: lens.accountSettings }),
        [universe.trades, lens.basis, lens.accountSettings],
    );
    // Active only when CE is the global basis AND account model is not the
    // no-op "r_only" mode (which produces null dollar amounts).
    const isCurrentEquityActive = lens.isCurrentEquity && lens.accountSettings.mode !== "r_only";

    // Charts (equity, monthly, R distribution) are derived inline from
    // `universe.trades` so they respect the scope toggle without touching
    // store helpers. The equity derivation mirrors store.js's pure
    // `computeEquityCurve`; the monthly and R-distribution roll-ups are
    // computed inline here (the former store-level MONTHLY / R_DIST helpers
    // were dead and have been removed). When scope === "baseline" + active
    // variant === primary variant, the curves are visually identical to today.
    const equityCurve = React.useMemo(() => {
        const trades = universe.trades || [];
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        let cum = 0;
        return trades.map((t, i) => {
            cum += Number(t.r) || 0;
            const ref = t.entry ? new Date(t.entry) : null;
            const finite = ref && Number.isFinite(ref.getTime());
            return {
                i,
                date: finite ? ref.toISOString().slice(0, 10) : "",
                label: finite ? `${MONTHS[ref.getUTCMonth()]} '${String(ref.getUTCFullYear()).slice(-2)}` : "",
                netR: Number(cum.toFixed(2)),
            };
        });
    }, [universe.trades]);

    const spark = React.useMemo(
        () => equityCurve.filter((_, i) => i % 10 === 0).map((p) => p.netR),
        [equityCurve],
    );

    const monthlyData = React.useMemo(() => {
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const map = {};
        (universe.trades || []).forEach((t) => {
            const date = t.entry ? new Date(t.entry) : null;
            if (!date || !Number.isFinite(date.getTime())) return;
            const y = date.getUTCFullYear();
            const m = date.getUTCMonth();
            const key = `${y}-${String(m + 1).padStart(2, "0")}`;
            const label = `${MONTHS[m]} '${String(y).slice(-2)}`;
            if (!map[key]) map[key] = { key, m: label, v: 0 };
            map[key].v += Number(t.r) || 0;
        });
        return Object.values(map)
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((entry) => ({ m: entry.m, v: Number(entry.v.toFixed(2)) }));
    }, [universe.trades]);

    const rDistData = React.useMemo(() => {
        const bins = {};
        (universe.trades || []).forEach((t) => {
            const r = Number(t.r);
            if (!Number.isFinite(r)) return;
            const bin = Math.round(r * 2) / 2;            // 0.5R buckets
            const label = `${bin >= 0 ? "+" : ""}${bin.toFixed(1)}R`;
            if (!bins[label]) bins[label] = { bucket: label, count: 0, _r: bin };
            bins[label].count += 1;
        });
        return Object.values(bins).sort((a, b) => a._r - b._r);
    }, [universe.trades]);

    // KPI strip values routed through basisStats (canonical, basis-aware).
    // For basis:"raw_r" (default), every field is byte-equivalent to universe.stats.
    // Sub-labels (wins/losses counts, performanceTrades) stay on `stats` — they
    // are basis-invariant and this avoids spreading basisStats into sub-text.
    const netRRaw = Number(basisStats.netRPerformance ?? 0);
    const netRDisplay = isCurrentEquityActive && basisStats.netAmount != null
        ? formatAccountValue(basisStats.netAmount, basisStats.currency)
        : `${netRRaw >= 0 ? "+" : ""}${netRRaw.toFixed(1)}R`;
    const winRateDisplay = basisStats.winRate != null ? `${basisStats.winRate.toFixed(1)}%` : "N/A";
    const tradeCountDisplay = String(basisStats.total ?? 0);
    const pfDisplay = basisStats.profitFactor == null
        ? "N/A"
        : Number.isFinite(basisStats.profitFactor) ? basisStats.profitFactor.toFixed(2) : "∞";
    const maxDdDisplay = isCurrentEquityActive && basisStats.maxDrawdownPct != null
        ? `${Math.abs(basisStats.maxDrawdownPct).toFixed(1)}%`
        : basisStats.maxDrawdownR != null
            ? `${basisStats.maxDrawdownR.toFixed(1)}R`
            : "N/A";

    // ── Empty state: no imported runs yet ────────────────────────────
    if (!hasImportedRuns) {
        return (
            <div className="pb-12">
                <LabRunHero
                    pageLabel="Overview Dashboard"
                    title="FX-OB Research Lab"
                    description="Backtest, validate, and refine Forex order-block strategies. Research only — no live execution."
                    actions={
                        <>
                            <NeonButton icon={BarChart3} tone="ghost">Latest Run Summary</NeonButton>
                            <NeonButton icon={Activity} tone="primary">New Backtest</NeonButton>
                        </>
                    }
                />
                <div className="px-6 py-20 flex flex-col items-center text-center gap-4">
                    <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No Imported Runs Yet</div>
                    <p className="text-[13px] text-[hsl(var(--text-2))] max-w-[480px] leading-relaxed">
                        Create a Research Project, run a baseline backtest in the Strategy Builder, then import the result.
                        This dashboard will populate with real analytics once a run is loaded.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                        <Link to="/projects">
                            <NeonButton icon={FolderPlus} tone="secondary">Go to Projects</NeonButton>
                        </Link>
                        <Link to="/strategy">
                            <NeonButton icon={Activity} tone="primary">Open Strategy Builder</NeonButton>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Overview Dashboard"
                title="FX-OB Research Lab"
                description="Backtest, validate, and refine Forex order-block strategies. Research only — no live execution."
                actions={
                    <>
                        <NeonButton icon={BarChart3} tone="ghost" onClick={() => navigate("/runs/active")}>Latest Run Summary</NeonButton>
                        <NeonButton icon={Activity} tone="primary" onClick={() => navigate("/strategy")}>New Backtest</NeonButton>
                    </>
                }
            />

            <ActiveRunContext />

            {/* ─── Phase 3B-1: scope toggle + universe badge ──────────────
                Lets the user choose whether the dashboard summarizes the
                active Strategy Map scenario or the baseline reference.
                Default is "Active scenario" so the dashboard tracks the
                user's current research context. Numbers below the toggle
                re-anchor to the chosen scope. */}
            <div className="px-6 mt-3 mb-2 flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">
                        Scope
                    </span>
                    <Segment
                        testId="overview-scope"
                        options={["Active scenario", "Baseline reference"]}
                        value={scopeMode === "scenario" ? "Active scenario" : "Baseline reference"}
                        onChange={(v) => setScopeMode(v === "Baseline reference" ? "baseline" : "scenario")}
                    />
                </div>
                <ResultsLensControl compact />
                <TradeUniverseBadge universe={universe} />
            </div>

            {/* COCKPIT-1 — research cockpit strip (what changed · next step ·
                findings). Shared with the Run Workspace; distinct storage key so
                its collapse state is independent of RunDetail's. */}
            <ResearchStrip
                project={linkedProject}
                projectId={projectId}
                runId={ACTIVE_RUN.id}
                runRole={runRole}
                nextStep={nextStep}
                runReference={runReference}
                deltaRows={deltaRows}
                runs={RUNS}
                storageKey="fxob_overview_research_strip_open_v1"
            />

            {/* KPI ROW — values from `stats` (canonical universe stats).
                Net R / Win Rate / Trades / PF / DD now re-anchor when the
                scope toggle changes. Reverse Cancel + Validation remain
                run-config metadata from ACTIVE_RUN (no trade-level
                equivalent). */}
            <div className="kpi-strip">
                <MetricChip testId="kpi-net-r"      label="Net R (Latest)"   value={netRDisplay} sub={`${ACTIVE_RUN.symbol} ${ACTIVE_RUN.detectionTf} · RR ${Number(ACTIVE_RUN.rr).toFixed(1)}`} tone="primary"   icon={TrendingUp} sparkline={spark} />
                <MetricChip testId="kpi-win-rate"   label="Win Rate"         value={winRateDisplay}  sub={`${stats.wins} / ${stats.losses} W/L${stats.flats ? ` · ${stats.flats} flat` : ""}`}     tone="secondary" icon={Target}  />
                <MetricChip testId="kpi-trades"     label="Trades"           value={tradeCountDisplay}    sub={`${stats.performanceTrades} valid · ${stats.invalidCancelled} protected`}        tone="muted"     icon={Hash} />
                <MetricChip testId="kpi-reverse"    label="Reverse Cancel"   value={String(ACTIVE_RUN.reverseCancels ?? 0)}      sub={`${Number(((ACTIVE_RUN.reverseCancels ?? 0) / Math.max(1, ACTIVE_RUN.trades) * 100)).toFixed(1)}% of trades`}       tone="warning"   icon={AlertOctagon} />
                <MetricChip testId="kpi-validation" label="Validation"       value={`${Number(ACTIVE_RUN.validation).toFixed(1)}%`}  sub="Pine ↔ Python parity" tone="success"   icon={ShieldCheck} />
            </div>

            {/* MAIN GRID */}
            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel
                    className="xl:col-span-2"
                    title="Equity Curve · Latest Run"
                    action={
                        <div className="flex items-center gap-2">
                            {lens.isCurrentEquity && (
                                <span className="text-[9.5px] font-ui text-muted-lab">Curve: Raw R</span>
                            )}
                            <Pill tone="primary">{scopeMode === "baseline" ? "BASELINE · NET R" : "SCENARIO · NET R"}</Pill>
                        </div>
                    }
                >
                    {equityCurve.length > 0 ? (
                        <EquityCurve data={equityCurve} height={300} />
                    ) : (
                        <EmptySection message="Equity curve will appear after a run is imported." />
                    )}
                </NeonPanel>

                <NeonPanel title="Top Sweep (RR)" action={<Link to="/sweep" className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] hover:underline">Go to Sweep Lab →</Link>}>
                    {SWEEP_RR.length > 0 ? (
                        <DataTable
                            testId="top-sweep-table"
                            columns={[
                                { key: "rr",        label: "RR",       mono: true, tip: "rr", render: (r) => <span className={r.rr === ACTIVE_RUN.rr ? "text-[hsl(var(--accent-primary))]" : ""}>{r.rr.toFixed(1)}</span> },
                                { key: "trades",    label: "Trades",   align: "right" },
                                { key: "winRate",   label: "Win Rate", align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                                { key: "netR",      label: "Net R",    align: "right", render: (r) => <ColoredR value={r.netR} /> },
                                { key: "expectancy",label: "E[R]",     align: "right", mono: true, render: (r) => `${r.expectancy.toFixed(3)}R` },
                            ]}
                            rows={SWEEP_RR}
                            rowKey="rr"
                            selectedKey={ACTIVE_RUN.rr}
                        />
                    ) : (
                        <EmptySection message="No sweep data. Run a parameter sweep in Sweep Lab to see results here." />
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Recent Runs" action={<Link to="/runs" className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] hover:underline">View all runs →</Link>}>
                    {recent.length > 0 ? (
                        <DataTable
                            testId="recent-runs-table"
                            columns={[
                                { key: "id",        label: "Run ID",   mono: true },
                                { key: "symbol",    label: "Symbol" },
                                { key: "detectionTf", label: "TF",     mono: true },
                                { key: "rr",        label: "RR",       align: "right", mono: true, tip: "rr", render: (r) => r.rr.toFixed(1) },
                                { key: "trades",    label: "Trades",   align: "right" },
                                { key: "winRate",   label: "Win Rate", align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                                { key: "netR",      label: "Net R",    align: "right", render: (r) => <ColoredR value={r.netR} /> },
                                { key: "importedAt", label: "Date",    align: "right", mono: true, render: (r) => r.importedAt ? r.importedAt.slice(0, 10) : "—" },
                            ]}
                            rows={recent}
                        />
                    ) : (
                        <EmptySection message="No imported runs yet." />
                    )}
                </NeonPanel>

                <NeonPanel title="Active Config" action={<Pill tone="primary">IMPORTED</Pill>}>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-ui text-[11.5px]">
                        {[
                            ["Symbol",        ACTIVE_RUN.symbol],
                            ["Detection TF",  ACTIVE_RUN.detectionTf],
                            ["Execution TF",  ACTIVE_RUN.executionTf],
                            ["Date Range",    ACTIVE_RUN.dateRange || "—"],
                            ["RR",            Number(ACTIVE_RUN.rr).toFixed(1)],
                            ["Stop Buffer",   `${ACTIVE_RUN.stopBuffer} pip`],
                            ["Entry Buffer",  `${ACTIVE_RUN.entryBuffer ?? 0} pip`],
                            ["Verify Ticks",  ACTIVE_RUN.verifyTicks],
                            ["Execution",     ACTIVE_RUN.executionMode || "single_position"],
                            ["Direction",     "Both"],
                            // Phase 3B-1: PF + Max Drawdown now come from
                            // universe.stats (canonical) so they agree with
                            // Strategy Map and the TradeSanityStrip.
                            ["Profit Factor", pfDisplay],
                            ["Max Drawdown",  maxDdDisplay],
                        ].map(([k, v]) => (
                            <React.Fragment key={k}>
                                <div className="text-muted-lab uppercase tracking-wider text-[10px]">{k}</div>
                                <div className="text-right text-white">{v}</div>
                            </React.Fragment>
                        ))}
                    </div>
                    <IntegritySummary integrity={ACTIVE_RUN.integrity} />
                    <div className="divider-glow my-3" />
                    <Link to="/runs/active" className="inline-flex items-center gap-1 text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:text-white">
                        Open run detail <ChevronRight className="w-3 h-3" />
                    </Link>
                </NeonPanel>

                <NeonPanel title="Performance Distribution">
                    {stats.performanceTrades > 0 ? (
                        <div className="flex items-center gap-4">
                            <div style={{ width: 132, height: 132 }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={[{ name: "Wins", value: stats.wins }, { name: "Losses", value: stats.losses }]} dataKey="value" innerRadius={42} outerRadius={62} stroke="hsl(var(--panel))" strokeWidth={2} isAnimationActive={false}>
                                            <Cell fill="hsl(var(--accent-primary))" />
                                            <Cell fill="hsl(var(--bear) / 0.55)" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="text-[12px] font-ui">
                                <div className="flex items-center gap-2"><span className="w-2 h-2 bg-[hsl(var(--accent-primary))]" /> Wins ({stats.winRate != null ? stats.winRate.toFixed(1) : "0.0"}%)</div>
                                <div className="flex items-center gap-2 mt-1.5"><span className="w-2 h-2 bg-[hsl(var(--bear)/0.65)]" /> Losses ({stats.winRate != null ? (100 - stats.winRate).toFixed(1) : "0.0"}%)</div>
                                <div className="mt-3 text-muted-lab">Total Trades</div>
                                <div className="text-white text-[20px] tabular-nums">{stats.total}</div>
                            </div>
                        </div>
                    ) : (
                        <EmptySection message="No performance trades in current scope." />
                    )}
                </NeonPanel>

                <NeonPanel title="R Multiple Distribution">
                    {rDistData.length > 0 ? (
                        <div style={{ width: "100%", height: 160 }}>
                            <ResponsiveContainer>
                                <BarChart data={rDistData} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                    <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                    <XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                    <YAxis hide />
                                    <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                        {rDistData.map((d, i) => (
                                            <Cell key={i} fill={d.bucket.startsWith("-") ? "hsl(var(--bear)/0.65)" : "hsl(var(--accent-primary))"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptySection message="R distribution will populate after trades are loaded." />
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Monthly Performance (Net R)">
                    {monthlyData.length > 0 ? (
                        <div style={{ width: "100%", height: 180 }}>
                            <ResponsiveContainer>
                                <BarChart data={monthlyData} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                    <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                    <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                    <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                    <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} formatter={(v) => [`${Number(v).toFixed(1)}R`, "Net R"]} />
                                    <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                                        {monthlyData.map((d, i) => (
                                            <Cell key={i} fill={d.v >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.75)"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptySection message="Monthly performance will populate after trades with entry timestamps are loaded." />
                    )}
                </NeonPanel>
            </div>
        </div>
    );
}

function EmptySection({ message }) {
    return (
        <div className="py-8 text-center font-ui text-[11px] text-muted-lab">
            {message}
        </div>
    );
}

function IntegritySummary({ integrity }) {
    const status = integrity?.status || "UNAVAILABLE";
    const flagged = integrity?.checks
        ? Object.entries(integrity.checks).filter(([, check]) => check.status !== "PASS")
        : [];
    const tone = status === "PASS" ? "success" : status === "FAIL" ? "danger" : "warning";
    const Icon = status === "PASS" ? ShieldCheck : AlertOctagon;

    return (
        <div className="mt-3 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-3 py-2" data-testid="run-integrity-summary">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${status === "PASS" ? "text-[hsl(var(--success))]" : status === "FAIL" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]"}`} />
                    <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Run Integrity</span>
                </div>
                <Pill tone={tone}>{status}</Pill>
            </div>
            <div className="mt-1.5 text-[10.5px] font-ui text-muted-lab">
                {flagged.length ? flagged.map(([key, check]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                        <span className="uppercase tracking-wider">{integrityLabel(key)}</span>
                        <span className={check.status === "FAIL" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]"}>
                            {integrityDetail(key, check)}
                        </span>
                    </div>
                )) : (
                    <span>{integrity ? "All imported-run checks passed" : "No imported-run integrity data"}</span>
                )}
            </div>
        </div>
    );
}

function integrityLabel(key) {
    return {
        tradeCount: "Trades",
        netR: "Net R",
        obCount: "OB Count",
        requiredFiles: "Files",
        candles: "Candles",
        parity: "Parity",
    }[key] || key;
}

function integrityDetail(key, check) {
    if (key === "tradeCount") return `summary ${check.summary ?? "N/A"} · parsed ${check.parsed}`;
    if (key === "netR") return `summary ${check.summary ?? "N/A"} · computed ${check.computed}`;
    if (key === "obCount") return `summary ${check.summary ?? "N/A"} · parsed ${check.parsed}`;
    if (key === "requiredFiles") return check.missing?.length ? `missing ${check.missing.join(", ")}` : check.status;
    if (key === "candles") return check.droppedForStorage ? "dropped from storage" : "not imported";
    if (key === "parity") return check.available ? String(check.value) : "unavailable";
    return check.status;
}
