// ResolvedRunSummary.jsx — the launch-time answer to the builder's four questions
// (SB-V2 consolidation §6): ENTRY / ELIGIBILITY / TARGETS / MANAGEMENT / DATA, plus
// resolved warnings ("rescued state still PM-blocked", "disabled cohort has a rescued
// state", "target will never execute under resolved eligibility").

import React, { useMemo } from "react";
import policyDoc from "@/data/deployedPolicy.v1.json";
import { loadPolicy } from "@/data/portfolioPolicy";
import { COHORTS, RUN_DEFAULT, normalizeOverrides, globalRunRR } from "@/data/cohortTargetOverrides";
import { normalizeStateOverrides, buildStateOverrideWarnings, builderSignatureParts } from "@/data/stateTargetOverrides";
import { MARKET_STATES } from "@/data/marketState";
import { summarizeEligibility, normalizeEligibility, eligibilityForPreset, ELIGIBILITY_PRESETS } from "@/data/eligibilityPolicy";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";
const Block = ({ k, children }) => (
    <div>
        <div className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">{k}</div>
        <div className="text-[12px] font-ui text-[hsl(var(--text-1))] leading-relaxed">{children}</div>
    </div>
);

export default function ResolvedRunSummary({ cfg, instrument = "EURUSD" }) {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const sig = builderSignatureParts(cfg || {});
    const gRR = globalRunRR(cfg);
    const elig = useMemo(() => summarizeEligibility(cfg, table, instrument), [cfg, table, instrument]);
    const cohortOv = useMemo(() => normalizeOverrides(cfg?.cohortTargetOverrides), [cfg?.cohortTargetOverrides]);
    const stateOv = useMemo(() => normalizeStateOverrides(cfg?.stateTargetOverrides), [cfg?.stateTargetOverrides]);
    const customBases = cfg?.cohortOverridesEnabled
        ? COHORTS.filter((c) => cohortOv[c.key].target !== RUN_DEFAULT && Number(cohortOv[c.key].target) !== gRR).length : 0;
    const stateExceptions = cfg?.stateOverridesEnabled
        ? COHORTS.reduce((n, c) => n + MARKET_STATES.filter((st) => stateOv[c.key][st].mode === "custom").length, 0) : 0;
    const targetWarnings = useMemo(() => buildStateOverrideWarnings(cfg, table, instrument), [cfg, table, instrument]);
    // Targets on eligibility-blocked/disabled cells can never execute.
    const eligMap = cfg?.eligibilityEnabled
        ? (cfg?.eligibilityPreset === ELIGIBILITY_PRESETS.CUSTOM || !cfg?.eligibilityPreset
            ? normalizeEligibility(cfg?.cohortEligibility)
            : eligibilityForPreset(cfg?.eligibilityPreset, table, instrument))
        : null;
    const deadTargets = [];
    if (eligMap && cfg?.stateOverridesEnabled) {
        for (const c of COHORTS) {
            for (const st of MARKET_STATES) {
                if (stateOv[c.key][st].mode !== "custom") continue;
                const e = eligMap[c.key];
                const allowed = e.states[st] === "allow" ? true : e.states[st] === "block" ? false : e.base === "allow";
                if (!allowed) deadTargets.push(`${c.sessionLabel} ${c.cellLabel} · ${st}: target ${stateOv[c.key][st].rr}R will never execute under the resolved eligibility policy.`);
            }
        }
    }
    const rescuedInsideDisabled = elig.rows.filter((r) => r.base === "disable" && r.rescued.length > 0);
    const entryLabel = sig.family === "triggered_edge"
        ? `Triggered Edge ${sig.threshold ?? "?"}% · C${String(sig.delay || "").replace(/^d/, "") || "?"}`
        : sig.family === "baseline" ? "Baseline" : `${sig.family || "?"}${sig.threshold != null ? ` ${sig.threshold}%` : ""}`;
    const warnings = [
        ...elig.warnings.map((w) => w.message),
        ...rescuedInsideDisabled.map((r) => `${r.sessionLabel} ${r.cellLabel}: this disabled cohort has ${r.rescued.length} rescued market state${r.rescued.length === 1 ? "" : "s"} (${r.rescued.join(", ")}).`),
        ...targetWarnings.map((w) => w.message),
        ...deadTargets,
    ];
    return (
        <div className={`${card} p-3 space-y-2`} data-testid="resolved-run-summary">
            <div className="text-[13px] font-ui text-[hsl(var(--text-1))]">Resolved Run Summary</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <Block k="Entry">{entryLabel}<div className="text-muted-lab text-[10.5px]">{sig.variant}</div></Block>
                <Block k="Eligibility">
                    PM {elig.pmMode.toUpperCase()}{elig.includeDisabled && elig.pmMode === "enforce" ? " (+research override)" : ""}
                    <div className="text-[11px] text-[hsl(var(--text-2))]">
                        {elig.active ? <>{elig.enabledBases} cohort bases enabled · {elig.stateRescues} state rescues · {elig.stateBlocks} state blocks</>
                            : cfg?.cohortOverridesEnabled ? "cohort panel scenario (legacy enable/disable)" : "all cohorts (no scenario)"}
                    </div>
                </Block>
                <Block k="Targets">
                    {cfg?.cohortOverridesEnabled ? `${customBases} custom base targets` : `uniform ${gRR}R`}
                    <div className="text-[11px] text-[hsl(var(--text-2))]">{stateExceptions} state target exceptions</div>
                </Block>
                <Block k="Management">
                    BE {cfg?.beEnabled ? "on" : "off"}
                    <div className="text-[11px] text-[hsl(var(--text-2))]">Risk reduction {cfg?.riskReductionEnabled || cfg?.rrEnabled ? "on" : "off"}</div>
                </Block>
                <Block k="Data">
                    {cfg?.dateFrom || cfg?.startDate || "2015-01-01"} → {cfg?.dateTo || cfg?.endDate || "latest"}
                    <div className="text-[11px] text-[hsl(var(--text-2))]">{sig.instrument} · {sig.detectionTf}</div>
                </Block>
            </div>
            {warnings.length > 0 && (
                <div className="space-y-0.5" data-testid="resolved-warnings">
                    {warnings.slice(0, 6).map((w, i) => (
                        <div key={i} className="text-[10.5px] font-ui text-[hsl(var(--warning))]">⚠ {w}</div>
                    ))}
                    {warnings.length > 6 && <div className="text-[10px] font-ui text-muted-lab">…and {warnings.length - 6} more.</div>}
                </div>
            )}
        </div>
    );
}
