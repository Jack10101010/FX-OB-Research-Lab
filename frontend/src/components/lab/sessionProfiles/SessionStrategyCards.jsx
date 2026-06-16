// SessionStrategyCards — SESSION-STRATEGY-PORTFOLIO Phase 2A.1 (primary editor).
//
// Named-profile model: a reusable Entry/BE profile library + a global default
// profile, with per-session cards whose cohorts reference profiles by id. Empty
// ref = inherit (cohort override ⟶ card default ⟶ global default ⟶ base universe).
//
// Frontend-only, pair-agnostic: availability and the Live-vs-Control readout are
// resolved against the ACTIVE run's bundle (the selected pair's export). A pair
// badge makes the active symbol obvious. No backend, no target/protection/buffers,
// no replay. The compact overview (SessionProfileMatrix) is embedded at top.

import React, { useState } from "react";
import { NeonPanel, SectionTitle } from "@/components/lab/NeonPanel";
import {
    useDataset, getSessionProfiles, setSessionProfiles, getActiveBundle, getTradeUniverse,
} from "@/data/store";
import {
    SESSIONS, CELLS, ENTRY_MODELS, ARM_OPTIONS, BASELINE_ENTRY_ID,
    resolveCohortConfig, countOverrides,
    listEntryProfiles, listBeProfiles, addEntryProfile, addBeProfile, removeProfile,
    entryProfileLabel, beProfileLabel, buildEntryKey, entryAvailable, beAvailable,
    resolveControlSummary,
} from "@/data/sessionProfiles";
import SessionProfileMatrix from "./SessionProfileMatrix";

// ── style atoms ────────────────────────────────────────────────────────────────
const selCls = "clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[11px] font-ui text-[hsl(var(--text-1))] px-1.5 py-0.5";
const numCls = "clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[11px] font-num text-[hsl(var(--text-1))] px-1.5 py-0.5 w-14";
const chip = (active, tone = "accent-primary") => `clip-bevel-sm px-2 py-0.5 text-[10px] font-ui uppercase tracking-wider border transition-colors ${
    active
        ? `border-[hsl(var(--${tone}))] bg-[hsl(var(--${tone})/0.15)] text-white`
        : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
}`;
const tinyBadge = (cls) => `clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-[0.06em] border ${cls}`;

function Unavail({ show }) {
    if (!show) return null;
    return <span className={`ml-1 ${tinyBadge("border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]")}`} title="Not in this pair's export — falls back to inherited trades">not in export</span>;
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

// ── profile-ref dropdown ───────────────────────────────────────────────────────
function RefSelect({ kind, value, options, onChange, inheritLabel }) {
    return (
        <select className={selCls} value={value || ""} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">{inheritLabel}</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
    );
}

// ── profile library (create / list / remove) ───────────────────────────────────
function ProfileLibrary({ profiles, bundle }) {
    const [eModel, setEModel] = useState("triggered_edge");
    const [eThresh, setEThresh] = useState(25);
    const [eArm, setEArm] = useState("next");
    const [beTrig, setBeTrig] = useState("wick");
    const [beArm, setBeArm] = useState(1.0);

    const addEntry = () => {
        const sel = eModel === "baseline" ? { model: "baseline" }
            : eModel === "penetration" ? { model: "penetration", threshold: Number(eThresh) }
            : { model: "triggered_edge", threshold: Number(eThresh), arm: eArm };
        setSessionProfiles(addEntryProfile(profiles, sel));
    };
    const addBe = () => setSessionProfiles(addBeProfile(profiles, { trigger: beTrig, armR: Number(beArm) }));

    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-2 mb-3">
            <SectionTitle>Profiles</SectionTitle>
            {/* entry profiles */}
            <div className="mt-2">
                <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-1">Entry profiles</div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {listEntryProfiles(profiles).map((p) => (
                        <span key={p.id} className={tinyBadge(entryAvailable(bundle, p.sel) ? "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]" : "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]")}>
                            {p.label}
                            {p.id !== BASELINE_ENTRY_ID && (
                                <button className="ml-1 text-[hsl(var(--text-2))] hover:text-[hsl(var(--danger))]" title="Remove" onClick={() => setSessionProfiles(removeProfile(profiles, "entry", p.id))}>×</button>
                            )}
                        </span>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <select className={selCls} value={eModel} onChange={(e) => setEModel(e.target.value)}>
                        {ENTRY_MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    {eModel !== "baseline" && <input className={numCls} type="number" min="1" step="1" value={eThresh} onChange={(e) => setEThresh(e.target.value)} title="threshold %" />}
                    {eModel === "triggered_edge" && (
                        <select className={selCls} value={eArm} onChange={(e) => setEArm(e.target.value)}>
                            {ARM_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                        </select>
                    )}
                    <button className={chip(false)} onClick={addEntry}>+ Entry</button>
                </div>
            </div>
            {/* be profiles */}
            <div className="mt-3">
                <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-1">Break-even profiles</div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {listBeProfiles(profiles).map((p) => (
                        <span key={p.id} className={tinyBadge("border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]")}>
                            {p.label}
                            <button className="ml-1 text-[hsl(var(--text-2))] hover:text-[hsl(var(--danger))]" title="Remove" onClick={() => setSessionProfiles(removeProfile(profiles, "be", p.id))}>×</button>
                        </span>
                    ))}
                    {listBeProfiles(profiles).length === 0 && <span className="text-[10px] text-muted-lab">none yet</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <select className={selCls} value={beTrig} onChange={(e) => setBeTrig(e.target.value)}>
                        <option value="wick">wick</option><option value="close">close</option>
                    </select>
                    <input className={numCls} type="number" min="0.25" step="0.25" value={beArm} onChange={(e) => setBeArm(e.target.value)} title="arm (R)" />
                    <button className={chip(false)} onClick={addBe}>+ BE</button>
                </div>
            </div>
        </div>
    );
}

// ── cohort / default row (profile refs) ────────────────────────────────────────
function CohortRow({ label, isDefault, target, slot, resolved, write, entryOpts, beOpts, bundle, variant }) {
    const enableState = isDefault
        ? (slot.enabled === false ? "off" : "on")
        : (slot.enabled === undefined ? "inherit" : (slot.enabled ? "on" : "off"));

    const cycleEnable = () => {
        if (isDefault) return write(target, { enabled: slot.enabled === false ? undefined : false });
        const s = enableState;
        write(target, { enabled: s === "inherit" ? true : s === "on" ? false : undefined });
    };

    // availability of the RESOLVED entry/be (after inheritance) for this cohort.
    const entryBad = resolved.entry ? !entryAvailable(bundle, resolved.entry) : false;
    const beBad = resolved.be ? !beAvailable(bundle, variant, buildEntryKey(resolved.entry) || "baseline", resolved.be) : false;

    return (
        <div className="flex items-center gap-2 flex-wrap py-1 border-t border-[hsl(var(--border-soft))]">
            <div className={`text-[10.5px] font-ui ${isDefault ? "text-[hsl(var(--text-1))] font-semibold" : "text-[hsl(var(--text-2))]"} w-24 shrink-0`}>{label}</div>
            <button onClick={cycleEnable} className={chip(enableState === "on", enableState === "off" ? "danger" : "accent-primary")}>
                {isDefault ? (enableState === "off" ? "Off" : "On") : (enableState === "inherit" ? "Inherit" : enableState === "on" ? "On" : "Off")}
            </button>
            {enableState !== "off" && (
                <>
                    <label className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab">Entry</label>
                    <RefSelect kind="entry" value={slot.entryRef} options={entryOpts} inheritLabel="Inherit" onChange={(v) => write(target, { entryRef: v })} />
                    <Unavail show={entryBad} />
                    <label className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab">BE</label>
                    <RefSelect kind="be" value={slot.beRef} options={beOpts} inheritLabel="Inherit / none" onChange={(v) => write(target, { beRef: v })} />
                    <Unavail show={beBad} />
                </>
            )}
        </div>
    );
}

// ── one session card ───────────────────────────────────────────────────────────
function SessionCard({ session, profiles, bundle, variant, entryOpts, beOpts, expanded, onToggle }) {
    const card = profiles.cards?.[session.key] || { enabled: true, default: {}, overrides: {} };
    const sessionOn = card.enabled !== false;
    const ovCount = CELLS.reduce((n, c) => {
        const ov = card.overrides?.[c.key];
        return n + (ov && (ov.enabled === false || ov.enabled === true || ov.entryRef || ov.beRef) ? 1 : 0);
    }, 0);
    const writeDefault = (t, p) => setSessionProfiles(patchSlot(profiles, session.key, "default", p));
    const writeOverride = (cell) => (t, p) => setSessionProfiles(patchSlot(profiles, session.key, cell, p));

    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[hsl(var(--panel-2)/0.25)]">
                <button onClick={onToggle} className="flex items-center gap-2 text-left">
                    <span className="text-[11px] font-ui text-muted-lab">{expanded ? "▾" : "▸"}</span>
                    <span className="text-[12px] font-ui text-[hsl(var(--text-1))]">{session.label}</span>
                </button>
                <div className="flex items-center gap-2">
                    {ovCount > 0 && <span className={tinyBadge("border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]")}>{ovCount} override{ovCount === 1 ? "" : "s"}</span>}
                    <button onClick={() => setSessionProfiles(setSessionEnabled(profiles, session.key, !sessionOn))} className={chip(sessionOn, sessionOn ? "accent-primary" : "danger")}>
                        {sessionOn ? "Session On" : "Session Off"}
                    </button>
                </div>
            </div>
            {expanded && sessionOn && (
                <div className="px-3 pb-2">
                    <CohortRow label="Default" isDefault target="default" slot={card.default || {}}
                        resolved={{ entry: null, be: null }} write={writeDefault}
                        entryOpts={entryOpts} beOpts={beOpts} bundle={bundle} variant={variant} />
                    {CELLS.map((c) => (
                        <CohortRow key={c.key} label={c.label} target={c.key} slot={card.overrides?.[c.key] || {}}
                            resolved={resolveCohortConfig(profiles, session.key, c.key)} write={writeOverride(c.key)}
                            entryOpts={entryOpts} beOpts={beOpts} bundle={bundle} variant={variant} />
                    ))}
                </div>
            )}
            {expanded && !sessionOn && (
                <div className="px-3 pb-2 pt-1 text-[10.5px] text-muted-lab">Whole session disabled — all four cohorts masked out.</div>
            )}
        </div>
    );
}

// ── live vs control readout ────────────────────────────────────────────────────
function fmt(n) { return Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "—"; }
function ControlReadout({ universe, bundle, profiles }) {
    const live = universe?.stats || {};
    const control = resolveControlSummary(bundle, profiles);
    const dNet = (Number.isFinite(Number(live.netR)) && Number.isFinite(Number(control.stats.netR)))
        ? (Number(live.netR) - Number(control.stats.netR)) : null;
    return (
        <div className="flex flex-wrap items-center gap-3 mb-3 text-[10.5px] font-ui">
            <span className="text-muted-lab uppercase tracking-[0.06em]">Live vs Control</span>
            <span className="text-[hsl(var(--text-1))]">Live: <span className="font-num">{live.total ?? "—"}</span> trades · netR <span className="font-num">{fmt(live.netR)}</span></span>
            <span className="text-[hsl(var(--text-2))]">Control ({control.label}{control.available ? "" : " · not in export"}): <span className="font-num">{control.stats.total ?? "—"}</span> trades · netR <span className="font-num">{fmt(control.stats.netR)}</span></span>
            {dNet != null && <span className={dNet >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>Δ netR <span className="font-num">{dNet >= 0 ? "+" : ""}{fmt(dNet)}</span></span>}
        </div>
    );
}

// ── top-level ──────────────────────────────────────────────────────────────────
function activePair(bundle, universe) {
    return bundle?.symbol || bundle?.runSummary?.symbol || bundle?.config?.symbol || universe?.symbol || "—";
}

export default function SessionStrategyCards() {
    useDataset();
    const profiles = getSessionProfiles();
    const bundle = getActiveBundle();
    const universe = getTradeUniverse();
    const variant = universe?.variant || null;
    const pair = activePair(bundle, universe);
    const overrides = countOverrides(profiles);
    const entryOpts = listEntryProfiles(profiles);
    const beOpts = listBeProfiles(profiles);

    const [expanded, setExpanded] = useState({});
    const toggle = (k) => setExpanded((m) => ({ ...m, [k]: !m[k] }));

    const gd = profiles.globalDefaultRef || { entry: null, be: null };
    const setGd = (patch) => setSessionProfiles({ ...profiles, globalDefaultRef: { ...gd, ...patch } });

    return (
        <NeonPanel
            title="Session Strategy"
            action={
                <div className="flex items-center gap-2">
                    <span className={tinyBadge("border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]")} data-testid="session-cards-pair">Pair · {pair}</span>
                    <button onClick={() => setSessionProfiles({ ...profiles, enabled: !profiles.enabled })} className={chip(profiles.enabled, profiles.enabled ? "accent-primary" : "border-mid")} data-testid="session-cards-toggle">
                        {profiles.enabled ? "Enabled" : "Disabled"}
                    </button>
                </div>
            }
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <SectionTitle>Session Strategy Portfolio</SectionTitle>
                    <div className="mt-1 text-[10.5px] text-muted-lab">
                        Frontend-only. Cohorts reference named Entry/BE profiles; empty = inherit
                        (cohort → card default → global default). Result is the union of active sessions,
                        resolved against the selected pair's export. Baseline is a control comparison.
                    </div>
                </div>
                <span className={`shrink-0 ${tinyBadge("border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]")}`}>{overrides} override{overrides === 1 ? "" : "s"}</span>
            </div>

            <div className={profiles.enabled ? "" : "opacity-50 pointer-events-none"}>
                <ProfileLibrary profiles={profiles} bundle={bundle} />

                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab">Global default</span>
                    <label className="text-[9.5px] font-ui text-muted-lab">Entry</label>
                    <RefSelect kind="entry" value={gd.entry} options={entryOpts} inheritLabel="None (base)" onChange={(v) => setGd({ entry: v ?? null })} />
                    <label className="text-[9.5px] font-ui text-muted-lab">BE</label>
                    <RefSelect kind="be" value={gd.be} options={beOpts} inheritLabel="None" onChange={(v) => setGd({ be: v ?? null })} />
                </div>

                <ControlReadout universe={universe} bundle={bundle} profiles={profiles} />

                <div className="mb-3 border border-[hsl(var(--border-soft))] clip-bevel-sm p-2">
                    <SessionProfileMatrix />
                </div>

                <div className="flex flex-col gap-2">
                    {SESSIONS.map((s) => (
                        <SessionCard key={s.key} session={s} profiles={profiles} bundle={bundle} variant={variant}
                            entryOpts={entryOpts} beOpts={beOpts} expanded={!!expanded[s.key]} onToggle={() => toggle(s.key)} />
                    ))}
                </div>
            </div>
        </NeonPanel>
    );
}
