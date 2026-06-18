// SessionScenarioBuilder — trader-facing scenario editor (Phase 2).
//
// Edits the SAME core scenario model (sessionProfiles working copy) as Session
// Portfolio, but is architecturally independent of it: it imports ONLY the core
// model (sessionProfiles.js) and the store working-copy accessors. It does NOT
// import SessionStrategyCards / PortfolioBar / PortfolioCompare / portfolioLibrary.
// Reads resolve through buildEffectivePortfolioMap; writes go through the pure
// scenario write helpers + setSessionProfiles. No backend, no run-submit changes.

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Power, AlertTriangle, RotateCcw, Check } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { useDataset, getSessionProfiles, setSessionProfiles, getActiveBundle, getTradeUniverse } from "@/data/store";
import {
    SESSIONS, CELLS, ARM_OPTIONS, buildEffectivePortfolioMap,
    entryProfileLabel, beProfileLabel, targetProfileLabel,
    entryProfileId, beProfileId, targetProfileId,
    isAllGlobal, setScenarioEnabled, setGlobalDefaultValue,
    setCohortValue, setCohortEnabled, resetCohort, resetAllToGlobal,
} from "@/data/sessionProfiles";

const CYAN = "text-[hsl(190_85%_70%)]";
const cellLabelOf = (key) => CELLS.find((c) => c.key === key)?.label || key;
const tinyBtn = "clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border inline-flex items-center gap-1.5 transition-colors";
const actionBtn = `${tinyBtn} border-[hsl(var(--border-mid))] text-[hsl(var(--text-1))] hover:border-[hsl(var(--accent-secondary))]`;

// ── plain-language option presets (no profile ids / refs shown) ─────────────────
// Full Entry Model catalog, GENERATED from the canonical ARM_OPTIONS (C0–C6) ×
// the supported threshold set — not a hand-maintained partial list. Adding
// variants is backward-compatible: profile ids are deterministic, so existing
// saved scenarios keep resolving and any stored ref not listed here is preserved
// via the "(current)" fallback option in DimSelect.
const ENTRY_THRESHOLDS = [10, 25, 50, 75];
const armC = (a) => a.label.split(" ")[0]; // "C0 (same)" → "C0"
const ENTRY_OPTS = [
    { value: "", label: "Run Default", sel: null },
    { value: "baseline", label: "Baseline", sel: { model: "baseline" } },
    ...ENTRY_THRESHOLDS.flatMap((thr) => ARM_OPTIONS.map((a) => ({
        value: `te_${thr}_${a.key}`,
        label: `Triggered Edge ${thr} ${armC(a)}`,
        sel: { model: "triggered_edge", threshold: thr, arm: a.key },
    }))),
    ...ENTRY_THRESHOLDS.map((thr) => ({
        value: `pen_${thr}`,
        label: `Penetration ${thr}`,
        sel: { model: "penetration", threshold: thr },
    })),
];
const BE_OPTS = [
    { value: "", label: "Run Default", sel: null },
    { value: "wick_0.5", label: "Wick 0.5R", sel: { trigger: "wick", armR: 0.5 } },
    { value: "wick_1", label: "Wick 1R", sel: { trigger: "wick", armR: 1 } },
    { value: "close_0.5", label: "Close 0.5R", sel: { trigger: "close", armR: 0.5 } },
    { value: "close_1", label: "Close 1R", sel: { trigger: "close", armR: 1 } },
];
const TP_OPTS = [
    { value: "", label: "Run Default", sel: null },
    { value: "1", label: "1R", sel: { type: "rr", value: 1 } },
    { value: "1.5", label: "1.5R", sel: { type: "rr", value: 1.5 } },
    { value: "2", label: "2R", sel: { type: "rr", value: 2 } },
    { value: "3.3", label: "3.3R", sel: { type: "rr", value: 3.3 } },
    { value: "5", label: "5R", sel: { type: "rr", value: 5 } },
    { value: "10", label: "10R", sel: { type: "rr", value: 10 } },
];
const OPTS = { entry: ENTRY_OPTS, be: BE_OPTS, target: TP_OPTS };
const DIM_LABEL = { entry: "Entry Model", be: "Break-Even", target: "Target" };

const idOf = (dim, sel) => (dim === "entry" ? entryProfileId(sel) : dim === "be" ? beProfileId(sel) : targetProfileId(sel));
// Which option matches a stored ref id; "" when none; "__current__" for a non-preset ref.
function valueForRef(dim, ref) {
    if (!ref) return "";
    const found = OPTS[dim].find((o) => o.sel && idOf(dim, o.sel) === ref);
    return found ? found.value : "__current__";
}

function runRrOf(bundle) {
    const v = Number(bundle?.summary?.rr ?? bundle?.config?.rr_multiple ?? bundle?.config?.rr);
    return Number.isFinite(v) && v > 0 ? v : null;
}
const sourceBucket = (src) => (src === "cohort" ? "Custom" : src === "session-default" ? "Session" : "Global");

// ── one editable dimension dropdown ─────────────────────────────────────────────
function DimSelect({ dim, currentRef, currentLabel, onPick }) {
    const value = valueForRef(dim, currentRef);
    return (
        <label className="flex items-center gap-2">
            <span className="text-[10.5px] font-ui uppercase tracking-wider text-muted-lab w-24 shrink-0">{DIM_LABEL[dim]}</span>
            <span className="relative inline-flex items-center">
                <select
                    className="clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[12px] font-ui text-[hsl(var(--text-1))] pl-2 pr-7 py-1 appearance-none"
                    value={value}
                    onChange={(e) => onPick(dim, e.target.value)}
                >
                    {value === "__current__" && <option value="__current__">{currentLabel} (current)</option>}
                    {OPTS[dim].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-1.5 text-[hsl(var(--accent-secondary))]" />
            </span>
        </label>
    );
}

function Field({ label, value, warn }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-ui uppercase tracking-wider text-muted-lab w-24 shrink-0">{label}</span>
            <span className={`text-[12.5px] font-ui ${warn ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-1))]"}`}>
                {value}{warn ? <span className="inline-flex items-center gap-1 ml-1.5 text-[hsl(var(--danger))]" title="Not in this imported run's preview export. A true backend scenario run can still use this setting."><AlertTriangle size={11} />unavailable in preview — backend can still run it</span> : null}
            </span>
        </div>
    );
}

function CohortCard({ profiles, sessionKey, cell, runRr }) {
    const eff = cell.effective;
    const [editing, setEditing] = useState(false);
    const card = profiles?.cards?.[sessionKey];
    const ov = card?.overrides?.[cell.cell] || {};

    const sourceLabel = (() => {
        if (eff.disabled) return null;
        const uniq = [...new Set([sourceBucket(eff.entrySource), sourceBucket(eff.beSource), sourceBucket(eff.targetSource)])];
        return uniq.length === 1 ? uniq[0] : "Mixed";
    })();
    const sourceTone = sourceLabel === "Custom" ? CYAN : sourceLabel === "Mixed" ? "text-[hsl(var(--accent-secondary))]" : "text-[hsl(var(--text-2))]";
    const entryLabel = eff.entryLabel === "Base universe" ? "Run Default" : eff.entryLabel;
    const beLabel = eff.beSource === "none" ? "Run Default" : eff.beLabel;
    const targetLabel = eff.targetSource === "none" ? (runRr != null ? `Run Default (${runRr}R)` : "Run Default") : eff.targetLabel;

    const pick = (dim, value) => {
        if (value === "__current__") return;
        const opt = OPTS[dim].find((o) => o.value === value);
        if (!opt) return;
        setSessionProfiles(setCohortValue(profiles, sessionKey, cell.cell, dim, opt.sel));
    };

    return (
        <div className={`clip-bevel-sm border p-3 ${eff.disabled ? "border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.06)]" : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.15)]"}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
                <span className={`text-[12.5px] font-ui font-semibold ${eff.disabled ? "text-[hsl(var(--text-2))]" : "text-[hsl(var(--text-1))]"}`}>{cellLabelOf(cell.cell)}</span>
                <div className="flex items-center gap-2">
                    {eff.disabled ? (
                        <span className="clip-bevel-sm px-2 py-0.5 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]">Status: Off</span>
                    ) : (
                        <span className="text-[11px] font-ui text-[hsl(var(--success))]">Status: On</span>
                    )}
                    {sourceLabel && <span className={`text-[10.5px] font-ui uppercase tracking-wider ${sourceTone}`}>{sourceLabel}</span>}
                </div>
            </div>

            {eff.disabled ? (
                <div className="text-[11.5px] font-ui text-muted-lab italic">This cohort is turned off — it takes no trades.</div>
            ) : editing ? (
                <div className="space-y-1.5">
                    <DimSelect dim="entry" currentRef={ov.entryRef} currentLabel={entryLabel} onPick={pick} />
                    <DimSelect dim="be" currentRef={ov.beRef} currentLabel={eff.beLabel} onPick={pick} />
                    <DimSelect dim="target" currentRef={ov.targetRef} currentLabel={targetLabel} onPick={pick} />
                </div>
            ) : (
                <div className="space-y-1">
                    <Field label="Entry Model" value={entryLabel} warn={eff.entryStatus === "unavailable"} />
                    <Field label="Break-Even" value={beLabel} warn={eff.beStatus === "unavailable"} />
                    <Field label="Target" value={targetLabel} warn={eff.targetStatus === "unavailable"} />
                </div>
            )}

            <div className="flex items-center gap-2 mt-3">
                {eff.disabled ? (
                    <button className={actionBtn} onClick={() => setSessionProfiles(setCohortEnabled(profiles, sessionKey, cell.cell, null))}><Power size={12} />Enable</button>
                ) : editing ? (
                    <>
                        <button className={actionBtn} onClick={() => setEditing(false)}><Check size={12} />Done</button>
                        <button className={actionBtn} onClick={() => setSessionProfiles(resetCohort(profiles, sessionKey, cell.cell))}><RotateCcw size={12} />Reset</button>
                        <button className={actionBtn} onClick={() => setSessionProfiles(setCohortEnabled(profiles, sessionKey, cell.cell, false))}><Power size={12} />Disable</button>
                    </>
                ) : (
                    <>
                        <button className={actionBtn} onClick={() => setEditing(true)}><Pencil size={12} />Edit</button>
                        <button className={actionBtn} onClick={() => setSessionProfiles(setCohortEnabled(profiles, sessionKey, cell.cell, false))}><Power size={12} />Disable</button>
                    </>
                )}
            </div>
        </div>
    );
}

function GlobalCard({ profiles, runRr }) {
    const [editing, setEditing] = useState(false);
    const gd = profiles?.globalDefaultRef || {};
    const pm = profiles?.profiles || {};
    const entryLabel = gd.entry ? entryProfileLabel(pm.entry?.[gd.entry]) : "Run Default";
    const beLabel = gd.be ? beProfileLabel(pm.be?.[gd.be]) : "Run Default";
    const targetLabel = gd.target ? targetProfileLabel(pm.target?.[gd.target]) : (runRr != null ? `Run Default (${runRr}R)` : "Run Default");

    const pick = (dim, value) => {
        if (value === "__current__") return;
        const opt = OPTS[dim].find((o) => o.value === value);
        if (!opt) return;
        setSessionProfiles(setGlobalDefaultValue(profiles, dim, opt.sel));
    };

    return (
        <div className="clip-bevel border border-dashed border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.04)] p-4">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab">Global Scenario Settings</span>
                <button className={actionBtn} onClick={() => setEditing((v) => !v)} data-testid="global-edit-toggle">
                    {editing ? <><Check size={12} />Done</> : <><Pencil size={12} />Edit</>}
                </button>
            </div>
            {editing ? (
                <div className="space-y-1.5">
                    <DimSelect dim="entry" currentRef={gd.entry} currentLabel={entryLabel} onPick={pick} />
                    <DimSelect dim="be" currentRef={gd.be} currentLabel={beLabel} onPick={pick} />
                    <DimSelect dim="target" currentRef={gd.target} currentLabel={targetLabel} onPick={pick} />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Entry Model" value={entryLabel} />
                    <Field label="Break-Even" value={beLabel} />
                    <Field label="Target" value={targetLabel} />
                </div>
            )}
        </div>
    );
}

export default function SessionScenarioBuilder() {
    useDataset();
    const profiles = getSessionProfiles();
    const bundle = getActiveBundle();
    const variant = getTradeUniverse()?.variant || null;
    const runRr = runRrOf(bundle);

    const [open, setOpen] = useState(false);
    const [sessionKey, setSessionKey] = useState(SESSIONS[0].key);

    const map = buildEffectivePortfolioMap(profiles, bundle, variant);
    const allGlobal = isAllGlobal(profiles);
    const enabled = profiles?.enabled === true;
    const cohorts = CELLS.map((c) => map.cells[`${sessionKey}|${c.key}`]).filter(Boolean);

    return (
        <NeonPanel
            title="Session Scenario"
            action={
                <button onClick={() => setOpen((v) => !v)} className={actionBtn} data-testid="session-scenario-toggle">
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{open ? "Hide" : "Show"}
                </button>
            }
        >
            {!open ? (
                <p className="text-[12px] font-ui text-muted-lab">
                    Configure the per-session, per-setup strategy that will run — Entry, Break-Even and Target for each cohort.
                </p>
            ) : (
                <div className="space-y-4">
                    <p className="text-[11.5px] font-ui text-muted-lab leading-relaxed border-l-2 border-[hsl(var(--accent-secondary)/0.5)] pl-2.5">
                        Values set here override the Run Default only for the selected session/cohort. Leave a value as <span className="text-[hsl(var(--text-2))]">Run Default</span> to use the main Strategy Builder setting.
                    </p>
                    {/* Master enable */}
                    <div className="flex items-center justify-between">
                        <span className="text-[12px] font-ui text-[hsl(var(--text-2))]">
                            Scenario is <span className={enabled ? CYAN : "text-muted-lab"}>{enabled ? "On" : "Off"}</span> — {enabled ? "it will be applied to this run." : "turn it on to apply it to this run."}
                        </span>
                        <button
                            className={`clip-bevel-sm px-3 py-1 text-[11px] font-ui uppercase tracking-wider border ${enabled ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] text-white" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}
                            onClick={() => setSessionProfiles(setScenarioEnabled(profiles, !enabled))}
                            data-testid="scenario-enable-toggle"
                        >
                            {enabled ? "On" : "Off"}
                        </button>
                    </div>

                    <GlobalCard profiles={profiles} runRr={runRr} />

                    {/* Use Global for all sessions */}
                    <div>
                        <label className="flex items-center gap-2 text-[12px] font-ui text-[hsl(var(--text-2))]">
                            <input
                                type="checkbox"
                                checked={allGlobal}
                                onChange={(e) => { if (e.target.checked) setSessionProfiles(resetAllToGlobal(profiles)); }}
                                className="accent-[hsl(var(--accent-primary))]"
                                data-testid="use-global-all"
                            />
                            Use these settings for all sessions
                        </label>
                        {!allGlobal && (
                            <p className="text-[10.5px] font-ui text-muted-lab mt-1 pl-6">Custom session or cohort settings exist. Check this to reset everything to Global.</p>
                        )}
                    </div>

                    {/* Session tabs */}
                    <div className="flex flex-wrap gap-1.5">
                        {SESSIONS.map((s) => {
                            const active = s.key === sessionKey;
                            return (
                                <button
                                    key={s.key}
                                    onClick={() => setSessionKey(s.key)}
                                    className={`clip-bevel-sm px-3 py-1.5 text-[11.5px] font-ui border transition-colors ${active ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.12)] text-white" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"}`}
                                    data-testid={`session-tab-${s.key}`}
                                >
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Active session cohorts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {cohorts.map((cell) => <CohortCard key={cell.cell} profiles={profiles} sessionKey={sessionKey} cell={cell} runRr={runRr} />)}
                    </div>
                </div>
            )}
        </NeonPanel>
    );
}
