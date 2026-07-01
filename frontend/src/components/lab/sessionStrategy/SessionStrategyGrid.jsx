import React, { useState } from "react";
import { ChevronDown, ChevronRight, Copy, X } from "lucide-react";
import { SESSIONS, CELLS } from "@/data/cohortKeys";
import { NeonToggle, NeonSelect, NeonInput } from "@/components/lab/controls";
import {
    setStrategyEnabled, setSessionEnabled, setCohortEnabled,
    setCohortTarget, setCohortBe, setCohortMoveStop, setCohortRiskAmount,
    setBaselineTarget, setBaselineBe,
    setDefaultTarget, setDefaultBe, setDefaultMoveStop, setDefaultRiskAmount,
    summarizeEnabledCohorts, applySessionSettingsToSessions, formatRiskMultiplier,
} from "@/data/sessionStrategyEdits";

// ── Session-First v1 authoring grid ──────────────────────────────────────────────
// Run-scoped, fully CONTROLLED: { value, onChange, symbol }. No localStorage / store /
// old session-profile API. "Reduce Risk" is the UI label for risk_reduction.kind=move_stop.

const ROW_ORDER = ["asia", "london", "lull", "newYork", "ny_pm", "outside"];
const COL_ORDER = ["choch_long", "choch_short", "bos_long", "bos_short"];
const SESSION_BY_KEY = Object.fromEntries(SESSIONS.map((s) => [s.key, s]));
const CELL_BY_KEY = Object.fromEntries(CELLS.map((c) => [c.key, c]));
const BE_TRIGGERS = [{ value: "wick", label: "Wick" }, { value: "close", label: "Close" }];
const TP_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

// One-line summaries shown when Session Defaults / Fair Baseline are collapsed.
function summarizeDefaults(gd) {
    const tp = gd?.target?.value != null ? gd.target.value : 2;
    const be = gd?.be?.trigger ? `BE ${gd.be.trigger === "wick" ? "Wick" : "Close"} ${gd.be.armR ?? 1}R` : "BE off";
    const rr = gd?.riskReduction?.atR != null ? `Reduce Risk ${gd.riskReduction.atR}→${gd.riskReduction.toR ?? 0}R` : "Reduce Risk off";
    const ra = `Risk ${formatRiskMultiplier(gd?.riskAmount)}`;
    return `TP ${tp}R · ${be} · ${rr} · ${ra}`;
}
function summarizeBaseline(baseline) {
    const tp = baseline?.target?.value != null ? baseline.target.value : 2;
    const be = baseline?.be?.trigger ? `BE ${baseline.be.trigger === "wick" ? "Wick" : "Close"} ${baseline.be.armR ?? 1}R` : "BE off";
    return `always runs · Target ${tp}R · ${be}`;
}

const lbl = "text-[11px] font-ui uppercase tracking-wide text-[hsl(var(--text-2))]";
const ghostBtn = "text-[11px] px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-mid))] text-muted-lab hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]";

function Num({ value, onChange, placeholder, step = "0.1", className = "w-24", testId }) {
    return (
        <NeonInput type="number" step={step} value={value ?? ""} placeholder={placeholder}
            data-testid={testId} onChange={(e) => onChange(e.target.value)}
            className={`${className} px-2.5 py-1.5 text-[12.5px]`} />
    );
}

// Target RR — fixed-width preset pills + "Target: NR" + a Custom editor (hidden by default).
function TargetField({ value, placeholder, onChange, testIdBase }) {
    const [custom, setCustom] = useState(false);
    const cur = value != null ? `${value}R` : `${placeholder} (default)`;
    return (
        <div className="flex flex-col gap-2">
            <span className={lbl}>Target: <span className="text-[hsl(var(--text))] normal-case">{cur}</span></span>
            <div className="flex flex-wrap items-center gap-1.5">
                {TP_PRESETS.map((p) => (
                    <button key={p} type="button" data-testid={`${testIdBase}-preset-${p}`} onClick={() => { onChange(p); setCustom(false); }}
                        className={[
                            "w-12 text-center text-[12px] py-1 clip-bevel-sm border transition-colors",
                            Number(value) === p
                                ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))]"
                                : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]",
                        ].join(" ")}>{p}</button>
                ))}
                <button type="button" data-testid={`${testIdBase}-custom`} onClick={() => setCustom((c) => !c)}
                    className={`w-16 text-center ${ghostBtn}`}>{custom ? "Close" : "Custom"}</button>
                {custom && (
                    <Num value={value} placeholder={placeholder} className="w-24" testId={`${testIdBase}-tp`}
                        onChange={onChange} />
                )}
            </div>
        </div>
    );
}

// Break-even — toggle; collapsed shows current state, expanded shows inputs.
function BeField({ be, onSet, testIdBase }) {
    const on = !!(be && be.trigger);
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
                <span className={lbl}>Break-even</span>
                <NeonToggle checked={on} testId={`${testIdBase}-be-toggle`} onChange={(next) => onSet(next ? "wick" : "", be?.armR ?? 1)} />
            </div>
            {on && (
                <div className="flex items-center gap-2">
                    <NeonSelect options={BE_TRIGGERS} value={be.trigger} testId={`${testIdBase}-be-trigger`}
                        onChange={(t) => onSet(t, be.armR)} className="py-1.5 text-[12.5px]" />
                    <Num value={be.armR} placeholder="arm R" className="w-24" testId={`${testIdBase}-be-armr`} onChange={(val) => onSet(be.trigger, val)} />
                </div>
            )}
        </div>
    );
}

// Reduce Risk (compiler: risk_reduction.kind = move_stop) — toggle + collapsed state.
function ReduceRiskField({ rr, onSet, testIdBase }) {
    const on = !!(rr && rr.atR != null);
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
                <span className={lbl}>Reduce Risk</span>
                <NeonToggle checked={on} testId={`${testIdBase}-rr-toggle`}
                    onChange={(next) => onSet(next ? (rr?.atR ?? 1) : "", next ? (rr?.toR ?? 0.5) : "")} />
            </div>
            {on && (
                <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="text-muted-lab">At</span>
                    <Num value={rr.atR} placeholder="1" className="w-16" testId={`${testIdBase}-rr-at`} onChange={(val) => onSet(val, rr.toR)} />
                    <span className="text-muted-lab">R → stop to</span>
                    <Num value={rr.toR} placeholder="0.5" className="w-16" testId={`${testIdBase}-rr-to`} onChange={(val) => onSet(rr.atR, val)} />
                    <span className="text-muted-lab">R</span>
                </div>
            )}
        </div>
    );
}

// Risk amount — pill display + "Change" reveals the input.
// Risk amount — stored as a multiplier where 1.0 = 1% of current equity. Displayed as a
// clean "N% of current equity" line (no "x"), with an inline Change editor.
function RiskAmountField({ value, defaultValue, onChange, testIdBase }) {
    const [editing, setEditing] = useState(false);
    const pct = (n) => `${Number(n == null ? 1 : n)}%`;
    const isDefault = value == null;
    return (
        <div className="flex flex-col gap-2">
            <span className={lbl}>Risk amount</span>
            <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-[hsl(var(--text))]" data-testid={`${testIdBase}-ra-pill`}>
                    {pct(value ?? defaultValue)} of current equity{isDefault && <span className="text-muted-lab"> (default)</span>}
                </span>
                <button type="button" className={ghostBtn} data-testid={`${testIdBase}-ra-change`} onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Change"}</button>
                {editing && (
                    <span className="inline-flex items-center gap-1">
                        <Num value={value} step="0.05" className="w-16" placeholder={`${Number(defaultValue ?? 1)}`} testId={`${testIdBase}-ra`} onChange={onChange} />
                        <span className="text-[12px] text-muted-lab">% equity</span>
                    </span>
                )}
            </div>
        </div>
    );
}

function CohortCard({ sessionKey, cellKey, setup, gd, onEdit }) {
    const cell = CELL_BY_KEY[cellKey];
    const enabled = Boolean(setup) && setup.enabled !== false;
    const base = `cohort-${sessionKey}-${cellKey}`;
    if (!enabled) {
        return (
            <div className="flex items-center justify-between border border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2))] clip-bevel-sm px-3 py-2.5 opacity-55">
                <span className="text-[13px] font-semibold text-[hsl(var(--text-2))]">{cell.label}</span>
                <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-muted-lab uppercase tracking-wide">Disabled</span>
                    <NeonToggle checked={false} onChange={(on) => onEdit(setCohortEnabled, sessionKey, cellKey, on)} testId={`cohort-enabled-${sessionKey}-${cellKey}`} />
                </div>
            </div>
        );
    }
    return (
        <div className="border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--panel-2))] clip-bevel-sm p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-[hsl(var(--text))]">{cell.label}</span>
                <NeonToggle checked={true} onChange={(on) => onEdit(setCohortEnabled, sessionKey, cellKey, on)} testId={`cohort-enabled-${sessionKey}-${cellKey}`} />
            </div>
            <div className="mt-3.5 flex flex-col gap-4">
                <TargetField value={setup?.target?.value} testIdBase={base}
                    placeholder={gd?.target?.value != null ? `${gd.target.value}R` : "RR"}
                    onChange={(val) => onEdit(setCohortTarget, sessionKey, cellKey, val)} />
                <div className="flex flex-wrap gap-x-10 gap-y-4">
                    <BeField be={setup?.be} testIdBase={base}
                        inheritsLabel={gd?.be ? `Inherits ${gd.be.trigger} ${gd.be.armR}R` : "BE off"}
                        onSet={(t, armR) => onEdit(setCohortBe, sessionKey, cellKey, t, armR)} />
                    <ReduceRiskField rr={setup?.riskReduction} testIdBase={base}
                        inheritsLabel={gd?.riskReduction ? `Inherits ${gd.riskReduction.atR}→${gd.riskReduction.toR}` : "Reduce Risk off"}
                        onSet={(atR, toR) => onEdit(setCohortMoveStop, sessionKey, cellKey, atR, toR)} />
                    <RiskAmountField value={setup?.riskAmount} defaultValue={gd?.riskAmount} testIdBase={base}
                        onChange={(val) => onEdit(setCohortRiskAmount, sessionKey, cellKey, val)} />
                </div>
            </div>
        </div>
    );
}

// "Copy session settings" — copy this session's cohort setup to other sessions.
function CopySessionMenu({ sourceKey, onApply }) {
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState({});
    const targets = ROW_ORDER.filter((k) => k !== sourceKey);
    const toggle = (k) => setSel((s) => ({ ...s, [k]: !s[k] }));
    const chosen = targets.filter((k) => sel[k]);
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)} data-testid={`copy-session-${sourceKey}`}
                className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]">
                <Copy className="w-3.5 h-3.5" /> Copy session settings
            </button>
            {open && (
                <div className="absolute right-0 z-20 mt-1 w-56 border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel))] clip-bevel-sm p-2.5 shadow-lg">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] uppercase tracking-wide text-muted-lab">Copy to sessions</span>
                        <button type="button" onClick={() => setOpen(false)}><X className="w-3.5 h-3.5 text-muted-lab hover:text-white" /></button>
                    </div>
                    <div className="text-[11px] leading-relaxed text-muted-lab mb-2">Copy this session’s cohort setup to selected sessions.</div>
                    {targets.map((k) => (
                        <label key={k} className="flex items-center gap-2 py-1 text-[12px] text-[hsl(var(--text-2))] cursor-pointer">
                            <input type="checkbox" checked={!!sel[k]} onChange={() => toggle(k)} data-testid={`copy-target-${sourceKey}-${k}`} />
                            {SESSION_BY_KEY[k].label}
                        </label>
                    ))}
                    <label className="flex items-center gap-2 py-1 mt-1 border-t border-[hsl(var(--border-soft))] pt-1.5 text-[12px] text-[hsl(var(--text))] cursor-pointer">
                        <input type="checkbox" checked={chosen.length === targets.length && targets.length > 0}
                            onChange={(e) => setSel(e.target.checked ? Object.fromEntries(targets.map((k) => [k, true])) : {})}
                            data-testid={`copy-all-${sourceKey}`} />
                        All sessions
                    </label>
                    <button type="button" disabled={chosen.length === 0}
                        onClick={() => { onApply(chosen); setOpen(false); setSel({}); }} data-testid={`copy-confirm-${sourceKey}`}
                        className="mt-2.5 w-full text-[12px] py-1.5 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] disabled:opacity-40 hover:bg-[hsl(var(--accent-primary)/0.12)]">
                        Copy to {chosen.length || 0} session{chosen.length === 1 ? "" : "s"}
                    </button>
                </div>
            )}
        </div>
    );
}

export default function SessionStrategyGrid({ value, onChange, symbol, ui, onUiChange }) {
    const v = value || {};
    const sessions = v.sessions || {};
    const baseline = v.baseline || {};
    const gd = v.globalDefault || {};

    // Collapse UI state. Controlled (persisted) when onUiChange is supplied, else
    // internal. Session Defaults + Fair Baseline are COLLAPSED by default.
    const [intUi, setIntUi] = useState({ defaultsOpen: false, baselineOpen: false, overridesOpen: true, openSessions: {} });
    const controlled = typeof onUiChange === "function";
    const uiState = controlled ? { defaultsOpen: false, baselineOpen: false, overridesOpen: true, openSessions: {}, ...(ui || {}) } : intUi;
    const setUi = (patch) => {
        const next = typeof patch === "function" ? patch(uiState) : { ...uiState, ...patch };
        if (controlled) onUiChange(next); else setIntUi(next);
    };
    const openSessions = uiState.openSessions || {};

    const edit = (fn, ...args) => onChange(fn(v, ...args));
    const toggleOpen = (sk) => setUi((u) => ({ ...u, openSessions: { ...(u.openSessions || {}), [sk]: !(u.openSessions || {})[sk] } }));
    const summary = v.enabled === true ? summarizeEnabledCohorts(v) : [];

    // "No override" sessions for the truth panel: any session not contributing an
    // enabled cohort, split into disabled vs on-but-empty.
    const enabledKeys = new Set(summary.map((s) => s.sessionKey));
    const noOverride = ROW_ORDER
        .filter((sk) => !enabledKeys.has(sk))
        .map((sk) => ({ key: sk, label: SESSION_BY_KEY[sk].label, off: sessions[sk]?.enabled === false }));
    const enabledSessionCount = summary.length;
    const enabledCohortCount = summary.reduce((n, s) => n + s.cohorts.length, 0);

    return (
        <div className="flex flex-col gap-3.5" data-testid="session-strategy-grid">
            {/* master enable + pair scope */}
            <div className="flex items-center justify-between border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.3)] clip-bevel-sm px-3.5 py-3">
                <div>
                    <div className="text-[13px] font-semibold text-[hsl(var(--text))]">Session Strategy</div>
                    <div className="text-[12px] text-muted-lab mt-0.5">Overrides per fill-session cohort: enabled · TP · break-even · reduce risk · risk amount.</div>
                    <div className="text-[12px] text-[hsl(var(--accent-secondary))] italic mt-0.5">Pair-specific strategy for this run{symbol ? `: ${symbol}` : ""}</div>
                </div>
                <NeonToggle checked={v.enabled === true} label={v.enabled ? "On" : "Off"} onChange={(on) => edit(setStrategyEnabled, on)} testId="strategy-enabled" />
            </div>

            {v.enabled === true && (
                <>
                    {/* Enabled Overrides — the "what will actually run" truth panel (amber). Collapsible. */}
                    <div className="border-2 border-amber-500/50 bg-amber-500/10 clip-bevel-sm px-3.5 py-3" data-testid="enabled-summary">
                        <button type="button" onClick={() => setUi((u) => ({ ...u, overridesOpen: !u.overridesOpen }))}
                            data-testid="enabled-summary-toggle" className="flex items-center justify-between w-full gap-3 text-left">
                            <div className="flex items-center gap-2 min-w-0">
                                {uiState.overridesOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-amber-300" /> : <ChevronRight className="w-4 h-4 shrink-0 text-amber-300" />}
                                <span className="text-[12.5px] font-ui uppercase tracking-wide text-amber-300 font-semibold shrink-0">Enabled Overrides</span>
                                {!uiState.overridesOpen && (
                                    <span className="text-[12px] text-amber-200/70 truncate" data-testid="enabled-summary-collapsed">
                                        : {enabledCohortCount === 0 ? "none — all cohorts run with no override" : `${enabledCohortCount} cohort${enabledCohortCount === 1 ? "" : "s"} in ${enabledSessionCount} session${enabledSessionCount === 1 ? "" : "s"}`}
                                    </span>
                                )}
                            </div>
                        </button>
                        {uiState.overridesOpen && (
                            <>
                                <div className="text-[11.5px] text-amber-200/70 mt-1.5 leading-relaxed">Only enabled cohorts in enabled sessions will run. All other cohorts use no session override.</div>
                                {summary.length === 0 ? (
                                    <div className="mt-2 text-[12.5px] text-amber-100/80">No cohorts enabled yet — every cohort runs with no session override.</div>
                                ) : (
                                    <div className="mt-2.5 flex flex-col gap-3">
                                        {summary.map((s) => (
                                            <div key={s.sessionKey}>
                                                <div className="text-[12.5px] font-semibold text-amber-100">{s.sessionLabel}</div>
                                                <div className="mt-1 flex flex-col gap-1.5">
                                                    {s.cohorts.map((c) => (
                                                        <div key={c.cohortKey} className="text-[12px] leading-relaxed text-amber-100/85 tabular-nums">
                                                            <span className="text-amber-50 font-medium">{c.label}</span> — {c.text}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {noOverride.length > 0 && (
                                    <div className="mt-3 pt-2.5 border-t border-amber-500/25 text-[11.5px] text-amber-200/70 leading-relaxed">
                                        <span className="uppercase tracking-wide text-[11px] text-amber-300/80">No overrides: </span>
                                        {noOverride.map((n, i) => (
                                            <span key={n.key}>
                                                {n.label}{n.off ? <span className="text-amber-200/45"> (session off)</span> : ""}{i < noOverride.length - 1 ? ", " : ""}
                                            </span>
                                        ))}
                                        <div className="text-amber-200/50 mt-1">All other cohorts: no override.</div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Session Defaults — collapsed by default; collapsed shows a one-line summary. */}
                    <div className="border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm px-3.5 py-3" data-testid="session-defaults">
                        <button type="button" onClick={() => setUi((u) => ({ ...u, defaultsOpen: !u.defaultsOpen }))}
                            data-testid="session-defaults-toggle" className="flex items-center justify-between w-full gap-3 text-left">
                            <div className="flex items-center gap-2 min-w-0">
                                {uiState.defaultsOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-lab" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-lab" />}
                                <span className="text-[12.5px] font-semibold text-[hsl(var(--text))] shrink-0">Session Defaults</span>
                                {!uiState.defaultsOpen && (
                                    <span className="text-[12px] text-muted-lab truncate" data-testid="session-defaults-summary">: {summarizeDefaults(gd)}</span>
                                )}
                            </div>
                        </button>
                        <div className="text-[11.5px] text-muted-lab mt-1.5 leading-relaxed">These defaults are used when you enable a session cohort unless you override that cohort directly. They do not affect Global Strategy or Fair Baseline.</div>
                        {uiState.defaultsOpen && (
                            <div className="flex flex-col gap-4 mt-3.5">
                                <TargetField value={gd.target?.value} placeholder="2R" testIdBase="default" onChange={(val) => edit(setDefaultTarget, val)} />
                                <div className="flex flex-wrap gap-x-10 gap-y-4">
                                    <BeField be={gd.be} inheritsLabel={null} testIdBase="default" onSet={(t, armR) => edit(setDefaultBe, t, armR)} />
                                    <ReduceRiskField rr={gd.riskReduction} inheritsLabel={null} testIdBase="default" onSet={(atR, toR) => edit(setDefaultMoveStop, atR, toR)} />
                                    <RiskAmountField value={gd.riskAmount} defaultValue={1.0} testIdBase="default" onChange={(val) => edit(setDefaultRiskAmount, val)} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* sessions */}
                    {ROW_ORDER.map((sk) => {
                        const s = SESSION_BY_KEY[sk];
                        const sCfg = sessions[sk] || {};
                        const sessionOn = sCfg.enabled !== false;
                        const isOpen = !!openSessions[sk];
                        // Active = will actually run: session on AND cohort on.
                        const activeCount = sessionOn ? COL_ORDER.filter((ck) => sCfg.setups?.[ck] && sCfg.setups[ck].enabled !== false).length : 0;
                        return (
                            <div key={sk} className={[
                                "border clip-bevel-sm transition-all",
                                !sessionOn ? "border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2))] opacity-70"
                                    : isOpen ? "border-l-2 border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.05)]"
                                        : "border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2))]",
                            ].join(" ")}>
                                <div className="flex items-center justify-between px-3.5 py-3">
                                    <button type="button" onClick={() => toggleOpen(sk)} className="flex items-center gap-2.5 text-[hsl(var(--text-2))] hover:text-white" data-testid={`session-toggle-${sk}`}>
                                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        <span className="text-[14px] font-semibold">{s.label}</span>
                                        {!sessionOn
                                            ? <span className="text-[11px] text-muted-lab uppercase tracking-wide">Session off</span>
                                            : activeCount > 0
                                                ? <span className="text-[11px] px-2 py-0.5 clip-bevel-sm bg-[hsl(var(--accent-primary)/0.15)] text-[hsl(var(--accent-primary))]">{activeCount} active</span>
                                                : <span className="text-[11px] text-muted-lab">on · no cohorts enabled</span>}
                                    </button>
                                    <div className="flex items-center gap-2.5">
                                        {isOpen && sessionOn && <CopySessionMenu sourceKey={sk} onApply={(targets) => onChange(applySessionSettingsToSessions(v, sk, targets))} />}
                                        <NeonToggle checked={sessionOn} onChange={(on) => edit(setSessionEnabled, sk, on)} testId={`session-enabled-${sk}`} />
                                    </div>
                                </div>

                                {isOpen && !sessionOn && (
                                    <div className="px-3.5 pb-3 text-[12px] text-muted-lab">This session is off. Cohorts inside will not run.</div>
                                )}

                                {isOpen && sessionOn && (
                                    <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {COL_ORDER.map((ck) => (
                                                <CohortCard key={ck} sessionKey={sk} cellKey={ck} setup={sCfg.setups?.[ck]} gd={gd} onEdit={edit} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Fair Baseline — always runs with Session Strategy; no on/off toggle.
                        Collapsed by default with a one-line summary. */}
                    <div className="mt-2 border-t-2 border-[hsl(var(--accent-secondary)/0.35)] pt-3.5">
                        <div className="border-2 border-[hsl(var(--accent-secondary)/0.45)] bg-[hsl(var(--accent-secondary)/0.08)] clip-bevel-sm px-4 py-3" data-testid="fair-baseline">
                            <button type="button" onClick={() => setUi((u) => ({ ...u, baselineOpen: !u.baselineOpen }))}
                                data-testid="fair-baseline-toggle" className="flex items-center justify-between w-full gap-3 text-left">
                                <div className="flex items-center gap-2 min-w-0">
                                    {uiState.baselineOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-[hsl(var(--accent-secondary))]" /> : <ChevronRight className="w-4 h-4 shrink-0 text-[hsl(var(--accent-secondary))]" />}
                                    <span className="text-[13.5px] font-semibold text-[hsl(var(--accent-secondary))] shrink-0">Fair Baseline Comparison</span>
                                    {!uiState.baselineOpen && (
                                        <span className="text-[12px] text-muted-lab truncate" data-testid="fair-baseline-summary">: {summarizeBaseline(baseline)}</span>
                                    )}
                                </div>
                            </button>
                            <div className="text-[11.5px] leading-relaxed text-muted-lab mt-1.5">Fair Baseline automatically compares your Session Strategy against the Global Strategy using the same enabled sessions/cohorts. It is always generated when Session Strategy is enabled.</div>
                            {uiState.baselineOpen && (
                                <div className="mt-3.5 flex flex-col gap-4">
                                    <TargetField value={baseline.target?.value} placeholder="2R" testIdBase="baseline" onChange={(val) => edit(setBaselineTarget, val)} />
                                    <BeField be={baseline.be} inheritsLabel="BE off" testIdBase="baseline" onSet={(t, armR) => edit(setBaselineBe, t, armR)} />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
