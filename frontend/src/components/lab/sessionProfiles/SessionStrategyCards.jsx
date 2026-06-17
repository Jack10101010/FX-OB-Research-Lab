// SessionStrategyCards — SESSION-STRATEGY-PORTFOLIO Phase 2B.1c.
//
// A portfolio of trading strategies, not a settings matrix. Every surface shows a
// single strategy BUNDLE — Entry • Break-Even • Target — instead of isolated
// settings. Top: 3-column Portfolio Overview (Global Strategy · Exceptions ·
// Performance). Then concise Session rows; expanding a session is read-first with
// inline Change/Edit controls. Trader-friendly language; no resolver/config terms.
//
// Frontend-only, pair-agnostic; resolves against the active bundle via
// buildEffectivePortfolioMap(). Target is RR-only. Baseline Control lives only in
// Performance.

import React, { useState } from "react";
import { Target, SlidersHorizontal, Crosshair, Users, CheckCircle2, Pencil, ChevronRight, ChevronDown, Info } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
    useDataset, getSessionProfiles, setSessionProfiles, getActiveBundle, getTradeUniverse,
} from "@/data/store";
import {
    SESSIONS, CELLS, ENTRY_MODELS, ARM_OPTIONS, BASELINE_ENTRY_ID,
    buildEffectivePortfolioMap, entryAvailable,
    listEntryProfiles, listBeProfiles, listTargetProfiles,
    addEntryProfile, addBeProfile, addTargetProfile, removeProfile,
    resolveControlSummary, entryProfileLabel, beProfileLabel, targetProfileLabel,
} from "@/data/sessionProfiles";
import SessionProfileMatrix from "./SessionProfileMatrix";
import PortfolioBar from "./PortfolioBar";

const TOTAL_COHORTS = SESSIONS.length * CELLS.length;
const cellLabel = (key) => CELLS.find((c) => c.key === key)?.label || key;
const CYAN = "text-[hsl(190_85%_70%)]";
const DOT = " • ";

// ── style atoms ────────────────────────────────────────────────────────────────
const selCls = "clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[12px] font-ui text-[hsl(var(--text-1))] px-2 py-1";
const numCls = "clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[12px] font-num text-[hsl(var(--text-1))] px-2 py-1 w-16";
const chip = (active, tone = "accent-primary") => `clip-bevel-sm px-2.5 py-1 text-[10.5px] font-ui uppercase tracking-wider border transition-colors ${
    active
        ? `border-[hsl(var(--${tone}))] bg-[hsl(var(--${tone})/0.15)] text-white`
        : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
}`;
const actionBtn = "clip-bevel-sm px-3 py-1.5 text-[11px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-1))] hover:border-[hsl(var(--accent-secondary))] transition-colors inline-flex items-center gap-1.5";
const tinyBadge = (cls) => `clip-bevel-sm px-2 py-0.5 text-[10px] font-ui border ${cls}`;

// ── lightweight educational tooltips ─────────────────────────────────────────────
// Concise, plain-English copy for portfolio terminology. Single source of truth.
const TIPS = {
    baselineControl: "The untouched comparison run. Used to measure whether your portfolio improves or worsens results.",
    runDefault: "The strategy configuration that was exported with this run before any portfolio overrides are applied.",
    global: "The default strategy applied across the entire portfolio unless a Session Strategy or Custom Strategy overrides it.",
    session: "A strategy applied to all cohorts within a session unless overridden by a Custom Strategy.",
    custom: "A strategy applied only to a specific cohort. This is the most specific override level.",
    primaryTarget: "Controls which RR target is used when evaluating trades. Run Default uses the target exported with the run.",
    exceptions: "Shows where the portfolio differs from the Global Strategy.",
    performance: "Performance after all portfolio overrides are applied.",
};

// Small info icon backed by the app's existing tooltip surface (ui/tooltip).
function InfoTip({ text, label, side = "top" }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    aria-label={label || "More info"}
                    className="inline-flex items-center justify-center align-middle text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent-secondary))] focus-visible:text-[hsl(var(--accent-primary))] cursor-help outline-none shrink-0"
                >
                    <Info size={12} />
                </span>
            </TooltipTrigger>
            <TooltipContent side={side} className="max-w-[240px]">
                <p className="text-[12px] leading-[1.45] text-[hsl(var(--text))]">{text}</p>
            </TooltipContent>
        </Tooltip>
    );
}

function Card({ title, action, accent, children }) {
    const border = accent
        ? "border-dashed border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.04)]"
        : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.15)]";
    return (
        <div className={`clip-bevel border ${border} p-5`}>
            {(title || action) && (
                <div className="flex items-center justify-between mb-4">
                    {title ? <h3 className="text-[15px] font-ui font-semibold text-[hsl(var(--text-1))]">{title}</h3> : <span />}
                    {action}
                </div>
            )}
            {children}
        </div>
    );
}

// ── one cyan chevron select ──────────────────────────────────────────────────────
function SelectBox({ value, onChange, children }) {
    return (
        <span className="relative inline-flex items-center">
            <select className={`${selCls} appearance-none [background-image:none] pr-7`} value={value} onChange={onChange}>{children}</select>
            <ChevronDown size={15} className="pointer-events-none absolute right-1.5 text-[hsl(var(--accent-secondary))]" />
        </span>
    );
}
function RefSelect({ value, options, onChange, inheritLabel }) {
    return (
        <SelectBox value={value || ""} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">{inheritLabel}</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </SelectBox>
    );
}

// ── strategy-bundle helpers (Entry • Break-Even • Target everywhere) ─────────────
function profileLabelById(profiles, kind, id) {
    const sel = id ? profiles?.profiles?.[kind]?.[id] : null;
    if (!sel) return null;
    if (kind === "entry") return entryProfileLabel(sel);
    if (kind === "be") return beProfileLabel(sel);
    return targetProfileLabel(sel);
}
const shortEntry = (label) => (label === "Base universe" ? "Run Default" : label);
const runDefaultTarget = (runRr) => (runRr != null ? `${runRr}R` : "Run default");
// Bundle from a resolved effective cell.
function bundleFromEffective(eff, runRr) {
    const target = (eff.targetStatus === "na" || eff.targetSource === "none") ? runDefaultTarget(runRr) : eff.targetLabel;
    return `${shortEntry(eff.entryLabel)}${DOT}${eff.beLabel}${DOT}${target}`;
}
// Bundle from a set of refs (global default / session default / a slot).
function bundleFromRefs(profiles, refs, runRr) {
    const entry = profileLabelById(profiles, "entry", refs.entryRef ?? refs.entry) || "Run Default";
    const be = profileLabelById(profiles, "be", refs.beRef ?? refs.be) || "None";
    const tRef = refs.targetRef ?? refs.target;
    const target = tRef ? (profileLabelById(profiles, "target", tRef) || runDefaultTarget(runRr)) : runDefaultTarget(runRr);
    return `${entry}${DOT}${be}${DOT}${target}`;
}

function followsGlobal(cell) {
    const e = cell?.effective;
    if (!e || e.disabled) return false;
    const inG = (s) => s === "global-default" || s === "none";
    return inG(e.entrySource) && inG(e.beSource) && inG(e.targetSource);
}
function isCustom(cell) {
    const e = cell.effective;
    return !e.disabled && (e.entrySource === "cohort" || e.beSource === "cohort" || e.targetSource === "cohort");
}
// Read-first status for an expanded cohort row: label · bundle (+ unavailable note).
function cohortStatusLine(eff, runRr) {
    if (eff.disabled) return { text: "Disabled", tone: "muted" };
    const bundle = bundleFromEffective(eff, runRr);
    const custom = eff.entrySource === "cohort" || eff.beSource === "cohort" || eff.targetSource === "cohort";
    const sess = eff.entrySource === "session-default" || eff.beSource === "session-default" || eff.targetSource === "session-default";
    const label = custom ? "Custom Strategy" : sess ? "Using Session Strategy" : "Using Global Strategy";
    let note = "";
    if (eff.entryStatus === "unavailable" || eff.beStatus === "unavailable") note = " — unavailable for this pair, using Run Default Strategy";
    else if (eff.targetStatus === "unavailable") note = " — target unavailable for this run, using exported target";
    const tone = note ? "bad" : custom ? "accent" : "muted";
    return { text: `${label}${DOT}${bundle}${note}`, tone };
}
// Per-cohort exception lines (dimension-explicit). Returns [] when it follows global.
function cohortExceptionLines(cell) {
    const e = cell.effective; const pr = cell.provenance;
    if (e.disabled) return ["Disabled"];
    const lines = [];
    if (pr.entry.source === "cohort") lines.push(`Entry: ${shortEntry(e.entryLabel)}${e.entryStatus === "unavailable" ? " (unavailable — using Run Default Strategy)" : ""}`);
    if (pr.be.source === "cohort") lines.push(`Break-Even: ${e.beLabel}${e.beStatus === "unavailable" ? " (unavailable — using Run Default Strategy)" : ""}`);
    if (pr.target.source === "cohort") lines.push(`Target: ${e.targetLabel}${e.targetStatus === "unavailable" ? " (unavailable for this run — using exported target)" : ""}`);
    if (!lines.length && (e.entryStatus === "unavailable" || e.beStatus === "unavailable" || e.targetStatus === "unavailable")) {
        lines.push(`${bundleFromEffective(e, null)} (unavailable)`);
    }
    return lines;
}
function describeSession(profiles, sessionKey, cells, runRr) {
    const card = profiles?.cards?.[sessionKey];
    if (card?.enabled === false) return { disabled: true, exceptions: [], sessionBundle: null };
    const def = card?.default || {};
    const hasDefault = !!(def.entryRef || def.beRef || def.targetRef);
    const sessionBundle = hasDefault ? bundleFromRefs(profiles, def, runRr) : null;
    const exceptions = [];
    for (const cell of cells) {
        const lines = cohortExceptionLines(cell);
        if (lines.length) exceptions.push({ cohort: cellLabel(cell.cell), lines });
    }
    return { disabled: false, sessionBundle, exceptions };
}
function sessionStatus(cells, desc) {
    if (desc.disabled) return { overrides: 0, disabled: true, unavailable: 0, sessionDefault: !!desc.sessionBundle };
    let overrides = 0, unavailable = 0;
    for (const c of cells) {
        const e = c.effective;
        if (e.disabled && c.provenance.enable.source === "cohort") overrides += 1;
        else if (e.entrySource === "cohort" || e.beSource === "cohort" || e.targetSource === "cohort") overrides += 1;
        if (e.entryStatus === "unavailable" || e.beStatus === "unavailable" || e.targetStatus === "unavailable") unavailable += 1;
    }
    return { overrides, disabled: false, unavailable, sessionDefault: !!desc.sessionBundle };
}

// ── immutable writers ──────────────────────────────────────────────────────────
function ensureCard(profiles, s) {
    const prev = profiles.cards?.[s];
    return { enabled: prev?.enabled !== false, default: { ...(prev?.default || {}) }, overrides: { ...(prev?.overrides || {}) } };
}
function patchSlot(profiles, s, target, patch) {
    const cards = { ...(profiles.cards || {}) };
    const card = ensureCard(profiles, s);
    const apply = (obj) => { const n = { ...obj }; for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete n[k]; else n[k] = v; } return n; };
    if (target === "default") card.default = apply(card.default);
    else {
        const merged = apply(card.overrides[target] || {});
        if (Object.keys(merged).length) card.overrides[target] = merged; else delete card.overrides[target];
    }
    cards[s] = card;
    return { ...profiles, cards };
}
function setSessionEnabled(profiles, s, enabled) {
    const cards = { ...(profiles.cards || {}) };
    cards[s] = { ...ensureCard(profiles, s), enabled };
    return { ...profiles, cards };
}

// ── profile library (Advanced only) ─────────────────────────────────────────────
function ProfileLibrary({ profiles, bundle }) {
    const [eModel, setEModel] = useState("triggered_edge");
    const [eThresh, setEThresh] = useState(25);
    const [eArm, setEArm] = useState("next");
    const [beTrig, setBeTrig] = useState("wick");
    const [beArm, setBeArm] = useState(1.0);
    const [tVal, setTVal] = useState(3.3);

    const addEntry = () => {
        const sel = eModel === "baseline" ? { model: "baseline" }
            : eModel === "penetration" ? { model: "penetration", threshold: Number(eThresh) }
            : { model: "triggered_edge", threshold: Number(eThresh), arm: eArm };
        setSessionProfiles(addEntryProfile(profiles, sel));
    };
    const addBe = () => setSessionProfiles(addBeProfile(profiles, { trigger: beTrig, armR: Number(beArm) }));
    const addTarget = () => setSessionProfiles(addTargetProfile(profiles, { type: "rr", value: Number(tVal) }));

    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-3 mt-3">
            <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-2">Entry strategies</div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {listEntryProfiles(profiles).map((p) => (
                    <span key={p.id} className={tinyBadge(entryAvailable(bundle, p.sel) ? "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]" : "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]")}>
                        {p.label}{!entryAvailable(bundle, p.sel) ? " · unavailable" : ""}
                        {p.id !== BASELINE_ENTRY_ID && (
                            <button className="ml-1.5 text-[hsl(var(--text-2))] hover:text-[hsl(var(--danger))]" title="Remove" onClick={() => setSessionProfiles(removeProfile(profiles, "entry", p.id))}>×</button>
                        )}
                    </span>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <SelectBox value={eModel} onChange={(e) => setEModel(e.target.value)}>
                    {ENTRY_MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </SelectBox>
                {eModel !== "baseline" && <input className={numCls} type="number" min="1" step="1" value={eThresh} onChange={(e) => setEThresh(e.target.value)} title="threshold %" />}
                {eModel === "triggered_edge" && (
                    <SelectBox value={eArm} onChange={(e) => setEArm(e.target.value)}>
                        {ARM_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </SelectBox>
                )}
                <button className={chip(false)} onClick={addEntry}>+ Entry</button>
            </div>

            <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-2">Break-even strategies</div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {listBeProfiles(profiles).map((p) => (
                    <span key={p.id} className={tinyBadge("border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]")}>
                        {p.label}
                        <button className="ml-1.5 text-[hsl(var(--text-2))] hover:text-[hsl(var(--danger))]" title="Remove" onClick={() => setSessionProfiles(removeProfile(profiles, "be", p.id))}>×</button>
                    </span>
                ))}
                {listBeProfiles(profiles).length === 0 && <span className="text-[11px] text-muted-lab">none yet</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <SelectBox value={beTrig} onChange={(e) => setBeTrig(e.target.value)}>
                    <option value="wick">wick</option><option value="close">close</option>
                </SelectBox>
                <input className={numCls} type="number" min="0.25" step="0.25" value={beArm} onChange={(e) => setBeArm(e.target.value)} title="arm (R)" />
                <button className={chip(false)} onClick={addBe}>+ BE</button>
            </div>

            <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-2">Target strategies</div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {listTargetProfiles(profiles).map((p) => (
                    <span key={p.id} className={tinyBadge(targetAvailableUI(bundle, p.sel) ? "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]" : "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]")}>
                        {p.label}{!targetAvailableUI(bundle, p.sel) ? " · unavailable" : ""}
                        <button className="ml-1.5 text-[hsl(var(--text-2))] hover:text-[hsl(var(--danger))]" title="Remove" onClick={() => setSessionProfiles(removeProfile(profiles, "target", p.id))}>×</button>
                    </span>
                ))}
                {listTargetProfiles(profiles).length === 0 && <span className="text-[11px] text-muted-lab">none yet</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <input className={numCls} type="number" min="0.25" step="0.1" value={tVal} onChange={(e) => setTVal(e.target.value)} title="RR target" />
                <span className="text-[11px] text-muted-lab">R</span>
                <button className={chip(false)} onClick={addTarget}>+ Target</button>
            </div>
        </div>
    );
}
// Local UI availability check for target profiles (mirror of resolver intent;
// reads bundle.targetSet only — no resolver import needed for this label).
function targetAvailableUI(bundle, sel) {
    const set = bundle?.targetSet;
    if (!Array.isArray(set) || !set.length) return false;
    const tok = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : String(Number(v)).replace(".", "p"));
    return set.some((v) => tok(v) === tok(sel.value));
}

// ── one cohort row inside an expanded session (read-first, inline edit) ──────────
function CohortRow({ label, isDefault, target, slot, info, write, entryOpts, beOpts, targetOpts, editing, onToggleEdit, profiles, runRr }) {
    const custom = !isDefault && info ? isCustom(info) : (slot.entryRef != null || slot.beRef != null || slot.targetRef != null);
    const disabled = !isDefault && info ? info.effective.disabled : (slot.enabled === false);
    const status = !isDefault && info ? cohortStatusLine(info.effective, runRr) : null;
    const toneCls = status?.tone === "accent" ? CYAN : status?.tone === "bad" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]";

    const defaultBundle = isDefault ? bundleFromRefs(profiles, slot, runRr) : null;
    const defaultCustom = isDefault && (slot.entryRef != null || slot.beRef != null || slot.targetRef != null);
    const defaultText = isDefault ? `${defaultCustom ? "Using Session Strategy" : "Using Global Strategy"}${DOT}${defaultBundle}` : null;

    const resetCohort = () => write(target, { entryRef: undefined, beRef: undefined, targetRef: undefined, enabled: undefined });
    const resetDefault = () => write(target, { entryRef: undefined, beRef: undefined, targetRef: undefined });
    const enableCohort = () => write(target, { enabled: undefined });

    return (
        <div className="py-2.5 border-t border-[hsl(var(--border-soft))]">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">{isDefault ? "Default behaviour" : label}</div>
                    <div className={`text-[11.5px] font-ui ${isDefault ? (defaultCustom ? CYAN : "text-[hsl(var(--text-2))]") : toneCls}`}>
                        {isDefault ? defaultText : status.text}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {editing ? (
                        <button className={actionBtn} onClick={() => onToggleEdit(target)}>Done</button>
                    ) : isDefault ? (
                        <>
                            <button className={actionBtn} onClick={() => onToggleEdit(target)}>Change</button>
                            {defaultCustom && <button className={chip(false)} onClick={resetDefault}>Reset</button>}
                        </>
                    ) : disabled ? (
                        <button className={actionBtn} onClick={enableCohort}>Enable</button>
                    ) : custom ? (
                        <>
                            <button className={actionBtn} onClick={() => onToggleEdit(target)}><Pencil size={12} />Edit</button>
                            <button className={chip(false)} onClick={resetCohort}>Reset</button>
                        </>
                    ) : (
                        <button className={actionBtn} onClick={() => onToggleEdit(target)}>Change</button>
                    )}
                </div>
            </div>
            {editing && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab">Entry</label>
                    <RefSelect value={slot.entryRef} options={entryOpts} inheritLabel="Use Global" onChange={(v) => write(target, { entryRef: v })} />
                    <label className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab">Break-Even</label>
                    <RefSelect value={slot.beRef} options={beOpts} inheritLabel="None" onChange={(v) => write(target, { beRef: v })} />
                    <label className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab">Target</label>
                    <RefSelect value={slot.targetRef} options={targetOpts} inheritLabel="Run default" onChange={(v) => write(target, { targetRef: v })} />
                    {!isDefault && (
                        <button className={chip(false)} title="Disable this cohort" onClick={() => write(target, { enabled: false })}>Disable</button>
                    )}
                </div>
            )}
        </div>
    );
}

// ── one session row: concise collapsed; read-first expanded ─────────────────────
function SessionRow({ session, profiles, cellList, desc, entryOpts, beOpts, targetOpts, runRr, globalBundle, expanded, onToggle }) {
    const card = profiles.cards?.[session.key] || { enabled: true, default: {}, overrides: {} };
    const sessionOn = card.enabled !== false;
    const status = sessionStatus(cellList, desc);
    let mainText, tone;
    if (status.disabled) { mainText = "Disabled"; tone = "text-[hsl(var(--danger))]"; }
    else if (status.overrides > 0) { mainText = `${status.overrides} Custom Strateg${status.overrides === 1 ? "y" : "ies"}`; tone = CYAN; }
    else if (status.sessionDefault) { mainText = "Using Session Strategy"; tone = "text-[hsl(var(--text-2))]"; }
    else { mainText = "Using Global Strategy"; tone = "text-[hsl(var(--text-2))]"; }
    const parenthetical = status.disabled ? null
        : status.sessionDefault ? desc.sessionBundle
        : status.overrides > 0 ? `Global: ${globalBundle}`
        : globalBundle;

    const writeDefault = (t, p) => setSessionProfiles(patchSlot(profiles, session.key, "default", p));
    const writeOverride = (cell) => (t, p) => setSessionProfiles(patchSlot(profiles, session.key, cell, p));
    const [edit, setEdit] = useState({});
    const toggleEdit = (k) => setEdit((m) => ({ ...m, [k]: !m[k] }));

    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <button onClick={onToggle} className="flex items-center gap-3 text-left min-w-0">
                    <span className="text-muted-lab">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                    <span className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))] w-28 shrink-0">{session.label}</span>
                    <span className="min-w-0 truncate">
                        <span className={`text-[12px] font-ui ${tone}`}>{mainText}</span>
                        {parenthetical && <span className="text-[11.5px] font-ui text-muted-lab"> ({parenthetical})</span>}
                    </span>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                    {!status.disabled && (
                        status.overrides > 0
                            ? <InfoTip text={TIPS.custom} label="Custom Strategy" />
                            : status.sessionDefault
                                ? <InfoTip text={TIPS.session} label="Session Strategy" />
                                : <InfoTip text={TIPS.global} label="Global Strategy" />
                    )}
                    {status.unavailable > 0 && <span className={tinyBadge("border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]")}>Unavailable</span>}
                    <button onClick={onToggle} className={actionBtn} data-testid={`view-session-${session.key}`}>{expanded ? "Close" : "View"}</button>
                </div>
            </div>
            {expanded && sessionOn && (
                <div className="px-4 pb-3 bg-[hsl(var(--panel-2)/0.2)]">
                    <div className="flex items-center justify-between py-2">
                        <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-muted-lab">Whole session</span>
                        <button onClick={() => setSessionProfiles(setSessionEnabled(profiles, session.key, !sessionOn))} className={chip(sessionOn, sessionOn ? "accent-primary" : "danger")}>{sessionOn ? "On" : "Off"}</button>
                    </div>
                    <CohortRow label="Default" isDefault target="default" slot={card.default || {}} info={null} write={writeDefault}
                        entryOpts={entryOpts} beOpts={beOpts} targetOpts={targetOpts} profiles={profiles} runRr={runRr} editing={!!edit.default} onToggleEdit={toggleEdit} />
                    {CELLS.map((c, i) => (
                        <CohortRow key={c.key} label={c.label} target={c.key} slot={card.overrides?.[c.key] || {}} info={cellList[i]} write={writeOverride(c.key)}
                            entryOpts={entryOpts} beOpts={beOpts} targetOpts={targetOpts} profiles={profiles} runRr={runRr} editing={!!edit[c.key]} onToggleEdit={toggleEdit} />
                    ))}
                </div>
            )}
            {expanded && !sessionOn && (
                <div className="px-4 pb-3 pt-1 flex items-center justify-between">
                    <span className="text-[11.5px] text-muted-lab">This session is turned off — none of its cohorts trade.</span>
                    <button onClick={() => setSessionProfiles(setSessionEnabled(profiles, session.key, true))} className={chip(false)}>Turn on</button>
                </div>
            )}
        </div>
    );
}

function fmt(n) { return Number.isFinite(Number(n)) ? `${Number(n) >= 0 ? "+" : ""}${Number(n).toFixed(1)}R` : "—"; }
function activePair(bundle, universe) {
    return bundle?.symbol || bundle?.runSummary?.symbol || bundle?.config?.symbol || universe?.symbol || "—";
}
function runRrOf(bundle) {
    const v = Number(bundle?.summary?.rr ?? bundle?.config?.rr_multiple ?? bundle?.config?.rr);
    return Number.isFinite(v) && v > 0 ? v : null;
}

export default function SessionStrategyCards() {
    useDataset();
    const profiles = getSessionProfiles();
    const bundle = getActiveBundle();
    const universe = getTradeUniverse();
    const variant = universe?.variant || null;
    const pair = activePair(bundle, universe);
    const runRr = runRrOf(bundle);
    const entryOpts = listEntryProfiles(profiles);
    const beOpts = listBeProfiles(profiles);
    const targetOpts = listTargetProfiles(profiles);

    const map = buildEffectivePortfolioMap(profiles, bundle, variant);
    const cellsFor = (s) => CELLS.map((c) => map.cells[`${s}|${c.key}`]);

    let active = 0, disabled = 0, unavailable = 0, usesGlobal = 0;
    for (const key of Object.keys(map.cells)) {
        const cell = map.cells[key]; const e = cell.effective;
        if (e.disabled) disabled += 1; else active += 1;
        if (e.entryStatus === "unavailable" || e.beStatus === "unavailable" || e.targetStatus === "unavailable") unavailable += 1;
        if (followsGlobal(cell)) usesGlobal += 1;
    }
    const custom = Math.max(0, active - usesGlobal);

    const gd = profiles.globalDefaultRef || { entry: null, be: null, target: null };
    const setGd = (patch) => setSessionProfiles({ ...profiles, globalDefaultRef: { ...gd, ...patch } });
    const globalEntry = profileLabelById(profiles, "entry", gd.entry) || "Run Default Strategy";
    const globalBe = profileLabelById(profiles, "be", gd.be) || "None";
    const globalTarget = gd.target
        ? `Custom Target Strategy (${profileLabelById(profiles, "target", gd.target) || runDefaultTarget(runRr)})`
        : `Run Default Strategy (${runDefaultTarget(runRr)})`;
    const globalBundle = bundleFromRefs(profiles, gd, runRr);

    const sessionDescs = SESSIONS.map((s) => ({ s, cells: cellsFor(s.key), desc: describeSession(profiles, s.key, cellsFor(s.key), runRr) }));

    const sessionDefaultDiffers = (sKey) => {
        const def = profiles?.cards?.[sKey]?.default || {};
        return (def.entryRef || null) !== (gd.entry || null) || (def.beRef || null) !== (gd.be || null) || (def.targetRef || null) !== (gd.target || null);
    };
    // Dimension-explicit exception groups.
    const exceptionGroups = [];
    for (const { s, desc } of sessionDescs) {
        if (desc.disabled) { exceptionGroups.push({ session: s.label, rows: [{ cohort: null, lines: ["Entire session disabled"] }] }); continue; }
        const rows = [];
        if (desc.sessionBundle && sessionDefaultDiffers(s.key)) rows.push({ cohort: null, lines: [`Session strategy → ${desc.sessionBundle}`] });
        for (const ex of desc.exceptions) rows.push(ex);
        if (rows.length) exceptionGroups.push({ session: s.label, rows });
    }
    const exceptionCount = exceptionGroups.reduce((n, g) => n + g.rows.length, 0);

    const live = universe?.stats || {};
    const control = resolveControlSummary(bundle, profiles);
    const diff = (Number.isFinite(Number(live.netR)) && Number.isFinite(Number(control.stats.netR))) ? Number(live.netR) - Number(control.stats.netR) : null;

    const [expanded, setExpanded] = useState({});
    const toggle = (k) => setExpanded((m) => ({ ...m, [k]: !m[k] }));
    const [editGlobal, setEditGlobal] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [showProfiles, setShowProfiles] = useState(false);
    const [showTable, setShowTable] = useState(false);

    const ok = "text-[hsl(var(--success))]";
    const bad = "text-[hsl(var(--danger))]";

    return (
        <NeonPanel
            title="Session Strategy Portfolio"
            action={
                <div className="flex items-center gap-2">
                    <PortfolioBar />
                    <span className={tinyBadge("border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]")} data-testid="session-cards-pair">{pair} · {profiles.enabled ? "ACTIVE" : "OFF"}</span>
                    <button onClick={() => setSessionProfiles({ ...profiles, enabled: !profiles.enabled })} className={chip(profiles.enabled, profiles.enabled ? "accent-primary" : "border-mid")} data-testid="session-cards-toggle">
                        {profiles.enabled ? "On" : "Off"}
                    </button>
                </div>
            }
        >
            <TooltipProvider delayDuration={150}>
            <div className={`space-y-5 ${profiles.enabled ? "" : "opacity-50 pointer-events-none"}`}>
                {/* ── Portfolio Overview: Global Strategy · Exceptions · Performance ── */}
                <Card title="Portfolio Overview">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Global Strategy */}
                        <div className="md:border-r md:border-[hsl(var(--border-soft))] md:pr-5">
                            <div className="flex items-center justify-between mb-3">
                                <span className="inline-flex items-center gap-1 text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab">Global Strategy <InfoTip text={TIPS.global} label="Global Strategy" /></span>
                                <button className={actionBtn} onClick={() => setEditGlobal((v) => !v)} data-testid="edit-global-strategy"><Pencil size={12} />{editGlobal ? "Done" : "Edit"}</button>
                            </div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <Target size={15} className="text-[hsl(var(--text-2))] shrink-0" />
                                <span className="text-[11.5px] text-muted-lab w-36">Primary Entry Strategy</span>
                                <span className={`text-[13px] font-ui font-semibold ${CYAN}`}>{globalEntry}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <SlidersHorizontal size={15} className="text-[hsl(var(--text-2))] shrink-0" />
                                <span className="text-[11.5px] text-muted-lab w-36">Primary Break-Even Strategy</span>
                                <span className={`text-[13px] font-ui font-semibold ${CYAN}`}>{globalBe}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <Crosshair size={15} className="text-[hsl(var(--text-2))] shrink-0" />
                                <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-lab w-36">Primary Target Strategy <InfoTip text={TIPS.primaryTarget} label="Primary Target Strategy" /></span>
                                <span className={`inline-flex items-center gap-1 text-[13px] font-ui font-semibold ${CYAN}`}>{globalTarget}{!gd.target && <InfoTip text={TIPS.runDefault} label="Run Default Strategy" />}</span>
                            </div>
                            <div className="text-[12px] font-ui text-[hsl(var(--success))]"><span className="font-num">{usesGlobal}</span> of <span className="font-num">{TOTAL_COHORTS}</span> cohorts follow this strategy.</div>
                            {(custom > 0 || disabled > 0) && (
                                <div className="text-[11.5px] font-ui text-muted-lab mt-0.5">
                                    {custom > 0 && <>{custom} use custom strategies. </>}
                                    {disabled > 0 && <>{disabled} disabled.</>}
                                </div>
                            )}
                            {editGlobal && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <label className="text-[10px] font-ui text-muted-lab">Entry</label>
                                    <RefSelect value={gd.entry} options={entryOpts} inheritLabel="Run Default" onChange={(v) => setGd({ entry: v ?? null })} />
                                    <label className="text-[10px] font-ui text-muted-lab">BE</label>
                                    <RefSelect value={gd.be} options={beOpts} inheritLabel="None" onChange={(v) => setGd({ be: v ?? null })} />
                                    <label className="text-[10px] font-ui text-muted-lab">Target</label>
                                    <RefSelect value={gd.target} options={targetOpts} inheritLabel="Run default" onChange={(v) => setGd({ target: v ?? null })} />
                                </div>
                            )}
                        </div>

                        {/* Exceptions (focal point) */}
                        <div className="md:border-r md:border-[hsl(var(--border-soft))] md:pr-5">
                            <div className="flex items-center gap-1 text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-3">Exceptions ({exceptionCount}) <InfoTip text={TIPS.exceptions} label="Exceptions" /></div>
                            {exceptionGroups.length === 0 ? (
                                <div className="flex flex-col items-center text-center py-5 gap-2">
                                    <CheckCircle2 size={26} className="text-[hsl(var(--accent-primary))]" />
                                    <div className="text-[12.5px] font-ui font-semibold text-[hsl(var(--accent-primary))]">No exceptions.</div>
                                    <div className="text-[11.5px] font-ui text-[hsl(var(--text-2))]">Every cohort uses the Global Strategy.</div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                                    {exceptionGroups.map((g) => (
                                        <div key={g.session}>
                                            <div className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">{g.session}</div>
                                            {g.rows.map((row, ri) => (
                                                (row.cohort && row.lines.length > 1) ? (
                                                    <div key={ri}>
                                                        <div className="text-[11.5px] font-ui text-[hsl(var(--text-2))] pl-3">└ {row.cohort}</div>
                                                        {row.lines.map((ln, li) => <div key={li} className="text-[11.5px] font-ui text-[hsl(var(--text-2))] pl-6">{ln}</div>)}
                                                    </div>
                                                ) : (
                                                    <div key={ri} className="text-[11.5px] font-ui text-[hsl(var(--text-2))] pl-3">└ {row.cohort ? `${row.cohort} → ${row.lines[0]}` : row.lines[0]}</div>
                                                )
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {exceptionGroups.length > 0 && (
                                <div className="text-[11px] font-ui text-muted-lab mt-2">{custom} custom · {disabled} disabled · {unavailable} unavailable</div>
                            )}
                        </div>

                        {/* Performance */}
                        <div>
                            <div className="flex items-center gap-1 text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-3">Performance <InfoTip text={TIPS.performance} label="Performance" /></div>
                            <div className="space-y-2">
                                <div>
                                    <div className="text-[11.5px] text-muted-lab">Live Portfolio</div>
                                    <div className={`text-[18px] font-num ${Number(live.netR) >= 0 ? ok : bad}`}>{fmt(live.netR)} <span className="text-[11px] font-num text-muted-lab">{live.total ?? "—"} trades</span></div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1 text-[11.5px] text-muted-lab">Baseline Control <InfoTip text={TIPS.baselineControl} label="Baseline Control" /></div>
                                    <div className={`text-[15px] font-num ${Number(control.stats.netR) >= 0 ? ok : bad}`}>{fmt(control.stats.netR)} <span className="text-[11px] font-num text-muted-lab">{control.stats.total ?? "—"} trades</span></div>
                                </div>
                                <div>
                                    <div className="text-[11.5px] text-muted-lab">Difference</div>
                                    <div className={`text-[15px] font-num ${diff != null ? (diff >= 0 ? ok : bad) : ""}`}>{diff != null ? fmt(diff) : "—"}</div>
                                </div>
                            </div>
                            {unavailable > 0 && (
                                <div className="mt-3 text-[11.5px] font-ui text-[hsl(var(--danger))]">Some strategies are unavailable for this run. Using Run Default Strategy instead.</div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* ── Sessions ── */}
                <Card title="Sessions">
                    <div className="flex flex-col gap-2">
                        {sessionDescs.map(({ s, cells, desc }) => (
                            <SessionRow key={s.key} session={s} profiles={profiles} cellList={cells} desc={desc}
                                entryOpts={entryOpts} beOpts={beOpts} targetOpts={targetOpts} runRr={runRr} globalBundle={globalBundle}
                                expanded={!!expanded[s.key]} onToggle={() => toggle(s.key)} />
                        ))}
                    </div>
                </Card>

                {/* ── Advanced ── */}
                <div>
                    <button className="flex items-center gap-2 text-left mb-2" onClick={() => setAdvancedOpen((v) => !v)} data-testid="advanced-toggle">
                        <span className="text-[hsl(var(--accent-primary))]">{advancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                        <h3 className="text-[15px] font-ui font-semibold text-[hsl(var(--accent-primary))]">Advanced</h3>
                    </button>
                    {advancedOpen && (
                        <Card>
                            <div className="flex items-center gap-3">
                                <button className={actionBtn} onClick={() => setShowProfiles((v) => !v)}><Users size={13} />{showProfiles ? "Hide profiles" : "Manage Profiles"}</button>
                                <button className={actionBtn} onClick={() => setShowTable((v) => !v)}>{showTable ? "Hide table view" : "Advanced Table View"}</button>
                            </div>
                            {showProfiles && <ProfileLibrary profiles={profiles} bundle={bundle} />}
                            {showTable && (
                                <div className="mt-3 border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <SessionProfileMatrix />
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            </div>
            </TooltipProvider>
        </NeonPanel>
    );
}
