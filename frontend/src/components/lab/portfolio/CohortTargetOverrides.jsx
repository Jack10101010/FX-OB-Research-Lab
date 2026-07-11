// CohortTargetOverrides.jsx — Phase 1 per-cohort custom targets (Run Workspace).
//
// A research panel that lets the user ENABLE/DISABLE each of the 24 EURUSD cohorts and
// pick a custom take-profit target per enabled cohort, then launch a full-history
// backtest that submits the EXISTING backend `session_strategy_scenario` structure.
//
// It reads/writes ONLY builder cfg fields via onField:
//   cohortOverridesEnabled   (panel gate → emit session_strategy_scenario)
//   cohortTargetOverrides    ({ [key]: { enabled, target } })
//   cohortOverridesPreset    (provenance tag; cleared on manual edit)
//
// It NEVER modifies PM. It READS the deployed policy to show each cohort's PM action
// and to warn when PM may still block some states/directions, or would DISABLE a
// cohort the user enabled. Custom targets apply only to candidates PM lets through —
// the engine runs PM enforcement first, then these targets/disables.

import React, { useMemo } from "react";
import policyDoc from "@/data/deployedPolicy.v1.json";
import { loadPolicy } from "@/data/portfolioPolicy";
import { POLICY_LABELS, POLICY_TONE, POLICY_TOOLTIPS } from "@/data/portfolioLabels";
import {
    COHORTS_BY_SESSION, TARGET_OPTIONS, RUN_DEFAULT, PRESETS, PRESET_LABELS,
    applyPreset, normalizeOverrides, globalRunRR, buildRunSummary,
} from "@/data/cohortTargetOverrides";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";
const kicker = "text-[10px] text-muted-lab font-ui";

function Chip({ tone = "text-2", title, children }) {
    return (
        <span title={title}
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui whitespace-nowrap"
            style={{ borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` }}>
            {children}
        </span>
    );
}

export default function CohortTargetOverrides({ cfg, onField, instrument = "EURUSD" }) {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const active = Boolean(cfg?.cohortOverridesEnabled);
    const gRR = globalRunRR(cfg);
    const overrides = useMemo(() => normalizeOverrides(cfg?.cohortTargetOverrides), [cfg?.cohortTargetOverrides]);
    const summary = useMemo(() => buildRunSummary(cfg, table, instrument), [cfg, table, instrument]);

    // ── mutators (single cfg field each; clear preset tag on manual edit) ────────
    const commit = (nextOverrides, { preset = null, keepPreset = false } = {}) => {
        onField("cohortTargetOverrides", nextOverrides);
        if (!keepPreset) onField("cohortOverridesPreset", preset);
    };
    const setCohort = (key, patch) => {
        const next = { ...overrides, [key]: { ...overrides[key], ...patch } };
        commit(next);
    };
    const runPreset = (name) => {
        const res = applyPreset(name);
        onField("cohortOverridesEnabled", res.enabled);
        onField("cohortTargetOverrides", res.overrides);
        onField("cohortOverridesPreset", res.preset);
    };
    const togglePanel = () => {
        const next = !active;
        onField("cohortOverridesEnabled", next);
        // Seed a sensible default when first enabling: all enabled at run default
        // (== a normal run, expressed explicitly across 24 cohorts).
        if (next && (!cfg?.cohortTargetOverrides || Object.keys(cfg.cohortTargetOverrides).length === 0)) {
            const res = applyPreset(PRESETS.ALL_RUN_DEFAULT);
            onField("cohortTargetOverrides", res.overrides);
            onField("cohortOverridesPreset", PRESETS.ALL_RUN_DEFAULT);
        }
    };

    const targetLabel = (t) => (t === RUN_DEFAULT ? `Run default (${gRR}R)` : `${t}R`);

    return (
        <div className="space-y-3" data-testid="cohort-target-overrides">
            {/* Header + panel toggle */}
            <div className={`${card} p-3`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[13px] font-ui text-[hsl(var(--text-1))] flex items-center gap-2">
                            Cohort Target Overrides
                            <Chip tone="warning" title="Research-only per-cohort target configuration.">Research</Chip>
                        </div>
                        <div className="text-[11px] text-muted-lab font-ui max-w-2xl mt-0.5">
                            Configure all 24 cohorts individually — enable/disable each and set a custom take-profit
                            target. Submits the backend <span className="text-[hsl(var(--text-2))]">session_strategy_scenario</span>.
                            Portfolio Manager runs first: these targets apply only to candidates PM lets through, and
                            never bypass PM state or direction filtering.
                        </div>
                    </div>
                    <button
                        type="button" role="switch" aria-checked={active} data-testid="cohort-overrides-toggle"
                        onClick={togglePanel}
                        className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border-soft))] px-2.5 py-1 text-[11px] font-ui"
                        style={{ color: active ? "hsl(var(--warning))" : "hsl(var(--text-2))" }}
                    >
                        <span className="inline-block w-8 h-4 rounded-full relative"
                            style={{ background: active ? "hsl(var(--warning)/0.35)" : "hsl(var(--border-mid))" }}>
                            <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                                style={{ left: active ? "18px" : "2px" }} />
                        </span>
                        {active ? "Overrides ON" : "Overrides OFF"}
                    </button>
                </div>
                {!active && (
                    <div className="mt-2 text-[10.5px] font-ui text-muted-lab" data-testid="cohort-overrides-off-note">
                        Off: the run uses the normal global configuration (no session_strategy_scenario emitted).
                    </div>
                )}
            </div>

            {active && (
                <>
                    {/* Presets */}
                    <div className={`${card} p-3`} data-testid="cohort-presets">
                        <div className={kicker}>Presets</div>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                            {[PRESETS.ALL_RUN_DEFAULT, PRESETS.ALL_RR2, PRESETS.FINAL_CANDIDATE, PRESETS.SAME_ENABLED_RR2, PRESETS.RESET].map((p) => (
                                <button key={p} type="button" data-testid={`cohort-preset-${p}`}
                                    onClick={() => runPreset(p)}
                                    className="rounded border border-[hsl(var(--border-soft))] px-2 py-1 text-[11px] font-ui text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary))]"
                                    style={p === PRESETS.RESET ? { color: "hsl(var(--danger))" } : undefined}>
                                    {PRESET_LABELS[p]}
                                </button>
                            ))}
                        </div>
                        {summary.preset && (
                            <div className="mt-2 text-[10px] font-ui text-muted-lab">
                                Loaded preset: <span className="text-[hsl(var(--text-2))]">{PRESET_LABELS[summary.preset] || summary.preset}</span>. Editing any cohort clears the preset tag.
                            </div>
                        )}
                    </div>

                    {/* Run summary */}
                    <div className={`${card} p-3`} data-testid="cohort-run-summary">
                        <div className={kicker}>Run summary (before launch)</div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                            <div><div className={kicker}>Enabled</div><div className="text-[13px] text-[hsl(var(--success))] font-ui">{summary.enabledCount}</div></div>
                            <div><div className={kicker}>Disabled</div><div className="text-[13px] text-[hsl(var(--danger))] font-ui">{summary.disabledCount}</div></div>
                            <div><div className={kicker}>Custom targets</div><div className="text-[13px] text-[hsl(var(--text-1))] font-ui">{summary.customTargetCount}</div></div>
                            <div><div className={kicker}>PM mode</div><div className="text-[12px] text-[hsl(var(--text-2))] font-ui">{summary.pmMode === "enforce" ? "Enforce" : "Off"}</div></div>
                            <div><div className={kicker}>Include disabled</div><div className="text-[12px] text-[hsl(var(--text-2))] font-ui">{summary.includeDisabled ? "ON" : "OFF"}</div></div>
                            <div><div className={kicker}>State/Direction filtering</div><div className="text-[12px] font-ui" style={{ color: summary.stateFilteringActive ? "hsl(var(--accent-primary))" : "hsl(var(--text-2))" }}>{summary.stateFilteringActive ? "Active" : "—"}</div></div>
                            {summary.pmPolicyVersion && (
                                <div><div className={kicker}>PM policy</div><div className="text-[11px] text-[hsl(var(--text-2))] font-ui">{summary.pmPolicyVersion} · {(summary.pmPolicySha256 || "").slice(0, 12)}</div></div>
                            )}
                        </div>
                        {summary.warnings.length > 0 && (
                            <div className="mt-2 space-y-1" data-testid="cohort-warnings">
                                {summary.warnings.map((w, i) => (
                                    <div key={i} className="text-[10.5px] font-ui text-[hsl(var(--warning))] flex gap-1.5">
                                        <span aria-hidden>⚠</span><span>{w.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cohort grid, grouped by session */}
                    {COHORTS_BY_SESSION.map((group) => (
                        <div key={group.sessionKey} className={`${card} p-3`} data-testid={`cohort-group-${group.sessionKey}`}>
                            <div className="text-[12px] font-ui text-[hsl(var(--text-1))] mb-2">{group.sessionLabel}</div>
                            <div className="space-y-1.5">
                                {group.cohorts.map((c) => {
                                    const o = overrides[c.key];
                                    const row = summary.rows.find((r) => r.key === c.key);
                                    const action = row?.pmAction;
                                    const blockCapable = row?.pmBlockCapable;
                                    const wouldDisable = row?.pmWouldDisable;
                                    return (
                                        <div key={c.key} data-testid={`cohort-row-${c.key}`}
                                            className="flex flex-wrap items-center gap-2 rounded border border-[hsl(var(--border-soft))]/60 px-2 py-1.5">
                                            {/* enable toggle */}
                                            <button type="button" role="switch" aria-checked={o.enabled}
                                                data-testid={`cohort-enable-${c.key}`}
                                                onClick={() => setCohort(c.key, { enabled: !o.enabled })}
                                                className="inline-flex items-center gap-1.5 text-[11px] font-ui"
                                                style={{ color: o.enabled ? "hsl(var(--success))" : "hsl(var(--text-2))" }}>
                                                <span className="inline-block w-7 h-3.5 rounded-full relative"
                                                    style={{ background: o.enabled ? "hsl(var(--success)/0.35)" : "hsl(var(--border-mid))" }}>
                                                    <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all"
                                                        style={{ left: o.enabled ? "16px" : "2px" }} />
                                                </span>
                                            </button>
                                            <div className="w-24 text-[11.5px] font-ui text-[hsl(var(--text-1))]">{c.cellLabel}</div>

                                            {/* target selector */}
                                            <select
                                                data-testid={`cohort-target-${c.key}`}
                                                disabled={!o.enabled}
                                                value={o.target === RUN_DEFAULT ? RUN_DEFAULT : String(o.target)}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setCohort(c.key, { target: v === RUN_DEFAULT ? RUN_DEFAULT : Number(v) });
                                                }}
                                                className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2,var(--panel)))] px-1.5 py-0.5 text-[11px] font-ui text-[hsl(var(--text-1))] disabled:opacity-40">
                                                <option value={RUN_DEFAULT}>{targetLabel(RUN_DEFAULT)}</option>
                                                {TARGET_OPTIONS.map((t) => (
                                                    <option key={t} value={String(t)}>{t}R</option>
                                                ))}
                                            </select>

                                            {/* reset to run default */}
                                            {o.enabled && o.target !== RUN_DEFAULT && (
                                                <button type="button" data-testid={`cohort-reset-${c.key}`}
                                                    onClick={() => setCohort(c.key, { target: RUN_DEFAULT })}
                                                    className="text-[10px] font-ui text-muted-lab hover:text-white underline decoration-dotted">
                                                    reset
                                                </button>
                                            )}

                                            <div className="ml-auto flex items-center gap-1.5">
                                                {/* PM action indicator */}
                                                {summary.pmMode === "enforce" && action && (
                                                    <Chip tone={POLICY_TONE[action]} title={`PM ${action} — ${POLICY_TOOLTIPS[action]}`}>
                                                        PM: {POLICY_LABELS[action] || action}
                                                    </Chip>
                                                )}
                                                {/* block-capable hint */}
                                                {summary.pmMode === "enforce" && o.enabled && blockCapable && (
                                                    <Chip tone="warning" title="PM may still block some market states / directions for this cohort.">PM may block some</Chip>
                                                )}
                                                {/* would-disable hint */}
                                                {summary.pmMode === "enforce" && o.enabled && wouldDisable && (
                                                    <Chip tone="danger" title={summary.includeDisabled
                                                        ? "PM would normally DISABLE this cohort; it runs only because Include disabled cohorts is ON."
                                                        : "PM DISABLES this cohort — it will produce no trades unless Include disabled cohorts is ON."}>
                                                        {summary.includeDisabled ? "PM-disabled (forced on)" : "PM disables"}
                                                    </Chip>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
