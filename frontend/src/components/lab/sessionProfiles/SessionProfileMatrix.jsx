// SessionProfileMatrix — SESSION-STRATEGY-PORTFOLIO: collapsed portfolio overview.
//
// Read-first "10-second" view built from buildEffectivePortfolioMap(): one row
// per session, a 4-glyph strip (BOS L / BOS S / CHoCH L / CHoCH S) encoding each
// cohort's effective state, plus a one-line human summary. No editing here — the
// session cards below are the editor.
//
// Glyph vocabulary (the ONLY cell-state alphabet):
//   ·  inherit (global/session default, available)
//   ◆  override (explicit at this cohort, available)
//   ✕  disabled
//   ⚠  unavailable (referenced variant not in this pair's export → falls back to base)
//
// Baseline Control is NOT represented here — it is a comparison reference only.

import React from "react";
import { useDataset, getSessionProfiles, getActiveBundle, getTradeUniverse } from "@/data/store";
import { SESSIONS, CELLS, buildEffectivePortfolioMap } from "@/data/sessionProfiles";

export const GLYPH = { inherit: "·", override: "◆", disabled: "✕", unavailable: "⚠" };
export const GLYPH_CLASS = {
    inherit: "text-[hsl(var(--text-2))]",
    override: "text-[hsl(var(--accent-primary))]",
    disabled: "text-[hsl(var(--text-2))] opacity-60",
    unavailable: "text-[hsl(var(--danger))]",
};

export function cellGlyphKind(cell) {
    if (!cell) return "inherit";
    const eff = cell.effective || {};
    if (eff.disabled) return "disabled";
    if (eff.entryStatus === "unavailable" || eff.beStatus === "unavailable") return "unavailable";
    const pr = cell.provenance || {};
    const explicit = pr.entry?.explicit || pr.be?.explicit || pr.enable?.source === "cohort";
    return explicit ? "override" : "inherit";
}

export function sessionSummary(cells) {
    let disabled = 0, override = 0, unavailable = 0, active = 0;
    for (const c of cells) {
        const k = cellGlyphKind(c);
        if (k === "disabled") disabled += 1; else active += 1;
        if (k === "override") override += 1;
        if (k === "unavailable") unavailable += 1;
    }
    if (disabled === cells.length) return "session off";
    const parts = [];
    if (override) parts.push(`${override} override${override === 1 ? "" : "s"}`);
    if (disabled) parts.push(`${disabled} off`);
    parts.push(unavailable ? `⚠ ${unavailable} unavailable` : "available");
    if (!override && !disabled) return `inherit · ${unavailable ? `⚠ ${unavailable} unavailable` : "available"}`;
    return parts.join(" · ");
}

export default function SessionProfileMatrix() {
    useDataset();
    const profiles = getSessionProfiles();
    const bundle = getActiveBundle();
    const variant = getTradeUniverse()?.variant || null;
    const map = buildEffectivePortfolioMap(profiles, bundle, variant);

    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-[9px] font-ui uppercase tracking-[0.06em] text-muted-lab pb-1">
                <span className="w-24">Overview</span>
                <span className="w-28 text-center">BL BS CL CS</span>
                <span>summary</span>
            </div>
            {SESSIONS.map((s) => {
                const cells = CELLS.map((c) => map.cells[`${s.key}|${c.key}`]);
                return (
                    <div key={s.key} className="flex items-center gap-2">
                        <span className="w-24 text-[11px] font-ui text-[hsl(var(--text-1))] whitespace-nowrap">{s.label}</span>
                        <span className="w-28 text-center font-ui text-[13px] tracking-[0.25em]">
                            {cells.map((c, i) => {
                                const k = cellGlyphKind(c);
                                return <span key={i} className={GLYPH_CLASS[k]} title={`${CELLS[i].label}: ${k}`}>{GLYPH[k]}</span>;
                            })}
                        </span>
                        <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">{sessionSummary(cells)}</span>
                    </div>
                );
            })}
            <div className="flex items-center gap-3 pt-1.5 text-[9px] font-ui text-muted-lab">
                <span><span className={GLYPH_CLASS.inherit}>·</span> inherit</span>
                <span><span className={GLYPH_CLASS.override}>◆</span> override</span>
                <span><span className={GLYPH_CLASS.disabled}>✕</span> disabled</span>
                <span><span className={GLYPH_CLASS.unavailable}>⚠</span> unavailable → using base</span>
            </div>
        </div>
    );
}
