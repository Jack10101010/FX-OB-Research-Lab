// SessionStrategyCards — SESSION-STRATEGY-CARDS Phase 2A (primary editor).
//
// One card per session (London / London Lull / New York / NY PM / Asia / Outside).
// Each card has a "Default session settings" row plus four per-cohort override
// rows (BOS Long / BOS Short / CHoCH Long / CHoCH Short). Per cohort you can:
//   • enable / disable                                  (frontend mask)
//   • pick an entry model / TE threshold / arm          (SELECT a pre-exported
//                                                         variant — only if it
//                                                         exists in this export)
//   • pick a break-even cell (wick/close × arm R)        (SELECT an EXACT matrix
//                                                         cell — only if it exists;
//                                                         NO replay)
//
// Settings that reference something not in the active run's export render a clear
// "not in this export" badge; the resolver falls back to inherited trades.
//
// Self-contained: reads/writes the store's session-card slice and the active
// bundle directly. The compact overview (SessionProfileMatrix) is embedded at top.

import React, { useState } from "react";
import { NeonPanel, SectionTitle } from "@/components/lab/NeonPanel";
import {
    useDataset, getSessionProfiles, setSessionProfiles, getActiveBundle, getTradeUniverse,
} from "@/data/store";
import {
    SESSIONS, CELLS, ENTRY_MODELS, ARM_OPTIONS,
    resolveCohortConfig, countOverrides, buildEntryKey, entryKeyFromScenario,
    entryAvailable, beAvailable,
} from "@/data/sessionProfiles";
import SessionProfileMatrix from "./SessionProfileMatrix";

// ── immutable card writers ─────────────────────────────────────────────────────
function ensureCard(profiles, sessionKey) {
    const prev = profiles.cards?.[sessionKey];
    return {
        enabled: prev?.enabled !== false,
        default: { ...(prev?.default || {}) },
        overrides: { ...(prev?.overrides || {}) },
    };
}
function patchCohort(profiles, sessionKey, target, patch) {
    const cards = { ...(profiles.cards || {}) };
    const card = ensureCard(profiles, sessionKey);
    const applyPatch = (obj) => {
        const next = { ...obj };
        for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete next[k]; else next[k] = v;
        }
        return next;
    };
    if (target === "default") {
        card.default = applyPatch(card.default);
    } else {
        const merged = applyPatch(card.overrides[target] || {});
        if (Object.keys(merged).length) card.overrides[target] = merged;
        else delete card.overrides[target];
    }
    cards[sessionKey] = card;
    return { ...profiles, cards };
}
function setSessionEnabled(profiles, sessionKey, enabled) {
    const cards = { ...(profiles.cards || {}) };
    cards[sessionKey] = { ...ensureCard(profiles, sessionKey), enabled };
    return { ...profiles, cards };
}

// ── small UI atoms ─────────────────────────────────────────────────────────────
const selCls = "clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[11px] font-ui text-[hsl(var(--text-1))] px-1.5 py-0.5";
const numCls = "clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[11px] font-num text-[hsl(var(--text-1))] px-1.5 py-0.5 w-14";
const chip = (active, tone = "accent-primary") => `clip-bevel-sm px-2 py-0.5 text-[10px] font-ui uppercase tracking-wider border transition-colors ${
    active
        ? `border-[hsl(var(--${tone}))] bg-[hsl(var(--${tone})/0.15)] text-white`
        : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
}`;

function Unavail({ show }) {
    if (!show) return null;
    return (
        <span className="ml-1 clip-bevel-sm px-1 py-0.5 text-[9px] font-ui uppercase tracking-[0.04em] border border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]" title="Not available in this run's export — falls back to inherited trades">
            not in export
        </span>
    );
}

// ── one editable cohort row (default or override) ──────────────────────────────
function CohortRow({ label, isDefault, sessionKey, target, cfg, write, bundle, variant, baseEntryKey }) {
    // cfg = { enabled?, entry?, be? } — for default this is card.default; for an
    // override it is the resolved (override→default) view used for availability.
    const entry = cfg.entry || null;
    const be = cfg.be || null;
    const enableState = isDefault
        ? (cfg.enabled === false ? "off" : "on")
        : (cfg.enabledOwn === undefined ? "inherit" : (cfg.enabledOwn ? "on" : "off"));

    const entryKey = entry ? buildEntryKey(entry) : baseEntryKey;
    const entryBad = entry ? !entryAvailable(bundle, entry) : false;
    const beBad = be ? !beAvailable(bundle, variant, entryKey, be) : false;

    const setEnable = (next) => write(target, { enabled: next });
    const cycleEnable = () => {
        if (isDefault) { setEnable(cfg.enabled === false ? true : false); return; }
        // override tri-state: inherit → on → off → inherit
        const s = enableState;
        setEnable(s === "inherit" ? true : s === "on" ? false : undefined);
    };

    const onModel = (model) => {
        if (model === "inherit") return write(target, { entry: undefined });
        if (model === "baseline") return write(target, { entry: { model: "baseline" } });
        if (model === "triggered_edge") return write(target, { entry: { model: "triggered_edge", threshold: entry?.threshold ?? 25, arm: entry?.arm ?? "next" } });
        if (model === "penetration") return write(target, { entry: { model: "penetration", threshold: entry?.threshold ?? 25 } });
    };
    const setThreshold = (v) => write(target, { entry: { ...entry, threshold: Number(v) } });
    const setArm = (v) => write(target, { entry: { ...entry, arm: v } });
    const toggleBe = () => write(target, { be: be ? undefined : { trigger: "wick", armR: 1.0 } });
    const setBeTrigger = (v) => write(target, { be: { ...be, trigger: v } });
    const setBeArm = (v) => write(target, { be: { ...be, armR: Number(v) } });

    const modelVal = entry?.model ?? "inherit";

    return (
        <div className="flex items-center gap-2 flex-wrap py-1 border-t border-[hsl(var(--border-soft))]">
            <div className={`text-[10.5px] font-ui ${isDefault ? "text-[hsl(var(--text-1))] font-semibold" : "text-[hsl(var(--text-2))]"} w-24 shrink-0`}>{label}</div>

            <button onClick={cycleEnable} className={chip(enableState === "on", enableState === "off" ? "danger" : "accent-primary")}>
                {isDefault ? (enableState === "off" ? "Off" : "On") : (enableState === "inherit" ? "Inherit" : enableState === "on" ? "On" : "Off")}
            </button>

            {enableState !== "off" && (
                <>
                    <label className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab">Entry</label>
                    <select className={selCls} value={modelVal} onChange={(e) => onModel(e.target.value)}>
                        <option value="inherit">Inherit</option>
                        {ENTRY_MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    {entry?.model === "triggered_edge" && (
                        <>
                            <input className={numCls} type="number" step="1" min="1" value={entry.threshold} onChange={(e) => setThreshold(e.target.value)} title="TE threshold %" />
                            <select className={selCls} value={entry.arm} onChange={(e) => setArm(e.target.value)}>
                                {ARM_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                            </select>
                        </>
                    )}
                    {entry?.model === "penetration" && (
                        <input className={numCls} type="number" step="1" min="1" value={entry.threshold} onChange={(e) => setThreshold(e.target.value)} title="Penetration %" />
                    )}
                    <Unavail show={entryBad} />

                    <button onClick={toggleBe} className={chip(!!be)}>{be ? "BE on" : "BE"}</button>
                    {be && (
                        <>
                            <select className={selCls} value={be.trigger} onChange={(e) => setBeTrigger(e.target.value)}>
                                <option value="wick">wick</option>
                                <option value="close">close</option>
                            </select>
                            <input className={numCls} type="number" step="0.25" min="0.25" value={be.armR} onChange={(e) => setBeArm(e.target.value)} title="BE arm (R)" />
                            <Unavail show={beBad} />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ── one session card ───────────────────────────────────────────────────────────
function SessionCard({ session, profiles, bundle, variant, baseEntryKey, expanded, onToggleExpand }) {
    const card = profiles.cards?.[session.key] || { enabled: true, default: {}, overrides: {} };
    const sessionOn = card.enabled !== false;
    const overrideCount = CELLS.reduce((n, c) => {
        const cfg = resolveCohortConfig(profiles, session.key, c.key);
        return n + (cfg.disabled || cfg.entry || cfg.be ? 1 : 0);
    }, 0);

    const writeDefault = (target, patch) => setSessionProfiles(patchCohort(profiles, session.key, "default", patch));
    const writeOverride = (cellKey) => (target, patch) => setSessionProfiles(patchCohort(profiles, session.key, cellKey, patch));

    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[hsl(var(--panel-2)/0.25)]">
                <button onClick={onToggleExpand} className="flex items-center gap-2 text-left">
                    <span className="text-[11px] font-ui text-muted-lab">{expanded ? "▾" : "▸"}</span>
                    <span className="text-[12px] font-ui text-[hsl(var(--text-1))]">{session.label}</span>
                </button>
                <div className="flex items-center gap-2">
                    {overrideCount > 0 && (
                        <span className="clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-[0.06em] border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]">
                            {overrideCount} override{overrideCount === 1 ? "" : "s"}
                        </span>
                    )}
                    <button
                        onClick={() => setSessionProfiles(setSessionEnabled(profiles, session.key, !sessionOn))}
                        className={chip(sessionOn, sessionOn ? "accent-primary" : "danger")}
                    >
                        {sessionOn ? "Session On" : "Session Off"}
                    </button>
                </div>
            </div>

            {expanded && sessionOn && (
                <div className="px-3 pb-2">
                    <CohortRow
                        label="Default" isDefault sessionKey={session.key} target="default"
                        cfg={card.default || {}} write={writeDefault}
                        bundle={bundle} variant={variant} baseEntryKey={baseEntryKey}
                    />
                    {CELLS.map((c) => {
                        const own = card.overrides?.[c.key] || {};
                        const resolved = resolveCohortConfig(profiles, session.key, c.key);
                        const cfg = { ...resolved, enabledOwn: own.enabled };
                        return (
                            <CohortRow
                                key={c.key} label={c.label} sessionKey={session.key} target={c.key}
                                cfg={cfg} write={writeOverride(c.key)}
                                bundle={bundle} variant={variant} baseEntryKey={baseEntryKey}
                            />
                        );
                    })}
                </div>
            )}
            {expanded && !sessionOn && (
                <div className="px-3 pb-2 pt-1 text-[10.5px] text-muted-lab">Whole session disabled — all four cohorts are masked out.</div>
            )}
        </div>
    );
}

// ── top-level component ────────────────────────────────────────────────────────
export default function SessionStrategyCards() {
    useDataset();
    const profiles = getSessionProfiles();
    const bundle = getActiveBundle();
    const universe = getTradeUniverse();
    const variant = universe?.variant || null;
    const baseEntryKey = entryKeyFromScenario(universe?.scenario || {});
    const overrides = countOverrides(profiles);

    const [expanded, setExpanded] = useState({});
    const toggle = (k) => setExpanded((m) => ({ ...m, [k]: !m[k] }));

    return (
        <NeonPanel
            title="Session Strategy"
            action={
                <button
                    onClick={() => setSessionProfiles({ ...profiles, enabled: !profiles.enabled })}
                    className={chip(profiles.enabled, profiles.enabled ? "accent-primary" : "border-mid")}
                    data-testid="session-cards-toggle"
                >
                    {profiles.enabled ? "Enabled" : "Disabled"}
                </button>
            }
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <SectionTitle>Per-session strategy cards</SectionTitle>
                    <div className="mt-1 text-[10.5px] text-muted-lab">
                        Frontend-only. Each card overrides entry model / arm and break-even per
                        BOS/CHoCH × direction by selecting already-exported variants — no rerun.
                        Settings missing from this export show “not in export” and fall back to inherited trades.
                    </div>
                </div>
                <span className="shrink-0 clip-bevel-sm px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-[0.08em] border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]">
                    {overrides} override{overrides === 1 ? "" : "s"}
                </span>
            </div>

            <div className={profiles.enabled ? "" : "opacity-50 pointer-events-none"}>
                <div className="mb-3 border border-[hsl(var(--border-soft))] clip-bevel-sm p-2">
                    <SessionProfileMatrix />
                </div>
                <div className="flex flex-col gap-2">
                    {SESSIONS.map((s) => (
                        <SessionCard
                            key={s.key} session={s} profiles={profiles}
                            bundle={bundle} variant={variant} baseEntryKey={baseEntryKey}
                            expanded={!!expanded[s.key]} onToggleExpand={() => toggle(s.key)}
                        />
                    ))}
                </div>
            </div>
        </NeonPanel>
    );
}
