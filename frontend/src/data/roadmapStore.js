// ── roadmapStore.js ──────────────────────────────────────────────────────────
// Per-section research roadmap, persisted in localStorage. Reusable across labs:
// each major section owns its own roadmap keyed by `sectionKey`, so future ideas
// stay attached to the exact feature they belong to (instead of one giant global
// roadmap). Pure data layer — no React.
//
// Persistence model: we store ONLY status overrides ({ [sectionKey]: { [itemId]:
// status } }) so that new seed items added in code automatically appear, and the
// user's status changes survive reloads. Degrades gracefully if localStorage is
// unavailable.
//
// DURABLE MIRROR (STORAGE Phase 1): localStorage stays the instant cache; the
// overrides map is mirrored to backend/data/section_roadmaps.json and union-
// merged on boot. Backend optional — down = unchanged behavior.

import { makeDomainBackend } from "./backendDomainSync";

const STORAGE_KEY = "fxob_section_roadmaps_v1";

export const ROADMAP_STATUSES = [
    { key: "idea", label: "Current Ideas" },
    { key: "planned", label: "Planned" },
    { key: "in_progress", label: "In Progress" },
    { key: "complete", label: "Complete" },
];

// Click-to-advance order.
export const ROADMAP_NEXT_STATUS = {
    idea: "planned",
    planned: "in_progress",
    in_progress: "complete",
    complete: "idea",
};

// Seed defaults per section. Each item: { id, label, status, note? }.
// Optional per-section extras (backward compatible — older sections ignore them):
//   labels:   { [statusKey]: columnLabel } — per-section column naming
//   findings: [{ id, stat, runId?, status: "requires_validation" | "validated" }]
//             — key research findings shown above the columns (read-only).
export const ROADMAP_SEEDS = {
    "retest-lab": {
        title: "Retest Lab Roadmap",
        labels: { idea: "Future Research", planned: "Planned", in_progress: "Active", complete: "Shipped" },
        items: [
            // ── Shipped ──
            { id: "edge-discovery", label: "Edge Discovery", status: "complete" },
            { id: "retest-intelligence", label: "Retest Intelligence", status: "complete" },
            { id: "session-matrix", label: "Session Matrix", status: "complete" },
            { id: "origin-candle", label: "Origin Candle Analysis", status: "complete" },
            { id: "hold-taxonomy", label: "Window Hold / Reaction Success Taxonomy", status: "complete" },
            { id: "v2-engine", label: "Continuous Invalidation Engine (v2)", status: "complete" },
            { id: "v21-death-quality", label: "Death Quality Metrics (v2.1)", status: "complete" },
            { id: "monetization", label: "Monetization Before Death", status: "complete" },
            { id: "lux-port", label: "Lux Exporter Port (v2.1)", status: "complete" },
            // ── Active ──
            { id: "cross-run-validation", label: "Cross-Run Validation", status: "in_progress",
              note: "Reproduce hold/eventual-failure/monetization numbers on ≥2 more runs before findings graduate." },
            // ── Planned (actual unfinished work) ──
            { id: "e2e-validation", label: "Retest Lab End-to-End Validation", status: "planned",
              note: "Import the regenerated v2.1 backend artifact · verify Backend Computed mode, OB Outcomes + Monetization panels, and v1/v2/v2.1 version-badge behavior." },
            { id: "fx-lux-parity-sync", label: "FX ↔ Lux Retest Parity Sync", status: "planned",
              note: "Port Lux monetization aggregates (rr_capture/tti_buckets/median R) back into the FX staged tracker, restore staged↔deployed byte-parity, re-run parity fixtures." },
            { id: "docs-findings-sync", label: "Docs / Findings Sync", status: "planned",
              note: "DECISIONS + WORKSTREAMS + FINDINGS entries for v2/v2.1; findings graduate only after cross-run validation." },
            { id: "death-quality-default-review", label: "Death Quality Default Review", status: "planned",
              note: "Review soft-kill definition, confirm-TF behavior (5m/15m/1h sensitivity), buffer-sensitivity findings (median TTI 66m→229m at 5p) — decide whether defaults stay unchanged." },
            // ── Future Research ──
            { id: "target-optimization", label: "Target Optimization", status: "idea",
              note: "MFE after retest by retest number · session · origin candle type · death-quality cohort · structure type → optimal fixed targets + target expectancy." },
            { id: "revival-analysis", label: "Revival Analysis", status: "idea",
              note: "Time kill→re-hold · time kill→next reaction · revival quality vs the zone's original reaction quality." },
            { id: "death-quality-funnel", label: "Death Quality Funnel (Soft / Confirmed / Decisive / Abandoned)", status: "idea",
              note: "v2.2 tier model from OB-DEATH-QUALITY-AUDIT-1 (~20% of first kills are decisive). Kaplan-Meier lifecycle curves ride on this as the visualization layer, not a separate item." },
            { id: "multi-kill-tracking", label: "Multi-Kill Lifecycle Tracking", status: "idea" },
            { id: "zone-lifecycle", label: "Zone Lifecycle Modelling", status: "idea" },
            { id: "cost-adjusted-monetization", label: "Cost-Adjusted Monetization", status: "idea",
              note: "Spread-adjusted + fee-adjusted R capture; realistic target expectancy (de-idealize 1R = zone width)." },
            { id: "multi-pair-validation", label: "Multi-Pair Validation", status: "idea",
              note: "EURUSD · GBPUSD · JPY pair sanity checks · pip-size robustness audit for R units." },
            { id: "rr-capture-optimization", label: "RR Capture Optimization", status: "idea" },
            { id: "tti-optimization", label: "Time-To-Invalidation Optimization", status: "idea" },
        ],
        findings: [
            { id: "f-eventual-failure", stat: "Eventual Failure ≈ 98% of touched zones — rate saturates under every definition; time-to-death is the axis", runId: "20260606_084116", status: "requires_validation" },
            { id: "f-confirmed-kill", stat: "Confirmed Kill 63.4% of deaths (15m close) — ⅓ of deaths are 1-minute noise", runId: "20260606_084116", status: "requires_validation" },
            { id: "f-reheld", stat: "Re-Held After Kill 79.6% within 60m — most nominal deaths re-hold", runId: "20260606_084116", status: "requires_validation" },
            { id: "f-median-mfe", stat: "Median MFE Before Death ≈ 1.6R (touched OBs, idealized R)", runId: "20260606_084116", status: "requires_validation" },
            { id: "f-rr-capture", stat: "RR Capture: 1R 64% · 2R 47% · 5R 27% — and unchanged when measured from R1", runId: "20260606_084116", status: "requires_validation" },
        ],
    },
    "distance-to-stop": {
        title: "Distance to Stop Roadmap",
        items: [
            // ── High priority (shipped in the scorecard expectancy pass) ──
            { id: "overall-pos-r", label: "Overall +R", status: "complete" },
            { id: "overall-neg-r", label: "Overall −R", status: "complete" },
            { id: "net-r", label: "Net R", status: "complete" },
            { id: "profit-factor", label: "Profit Factor", status: "complete" },
            // ── Future research ──
            { id: "be-replay", label: "Break-even replay backtesting", status: "complete",
              note: "Backend EXACT BE replay shipped: be_enabled / arm levels / trigger basis / delay generate trades_*__be_*.csv + be_results; Break-even tab shows EXACT, REPLAY is the fallback." },
            { id: "winner-cost", label: "Winner-cost modelling", status: "planned" },
            { id: "be-trigger", label: "Actual BE trigger modelling", status: "complete",
              note: "Wick / close trigger basis and 0/+1/+2 candle delay are now exact backend parameters (be_trigger_bases, be_delay_candles)." },
            { id: "partial-risk-reduction", label: "Dynamic Risk Reduction / Partial Stop Tightening", status: "planned",
              note: "Roadmap only — NOT implemented. Reduce remaining risk by X% after +Y R (e.g. at +2R cut risk 50%: stop -1R → -0.5R). Open research questions: when the stop moves (wick/close, immediate/next candle), where the new stop goes (% of risk vs fixed R offset), R recorded if price returns, winners damaged, drawdown improvement. Must be compared against no-protection AND full BE (BE = the 100% case of this axis)." },
            { id: "variant-aware-be", label: "Variant-aware exact Break-even (per entry model)", status: "planned",
              note: "Roadmap. Backend BE is currently computed on the BASELINE trade set only — be_results / trades_*__be_*.csv carry no entry-model context, so EXACT is valid only on the Baseline result view (non-baseline views fall back to REPLAY). Phase 2: backend loops BE over each entry-model trade set (Triggered Edge, Penetration, FFT, directional) with namespaced keys e.g. trades_single_position__entry_triggered_edge_25p0_d2__be_wick_0p50R.csv + be_results keyed by [execution_mode][entry_key][be_key]; frontend resolver + Protection Lab match BE to the selected result view." },
            { id: "strategy-map-be-visual", label: "Strategy Map BE Visual Verification", status: "planned",
              note: "Roadmap. When viewing a BE scenario, render on the Strategy Map: original entry / SL / TP, BE arm level, BE stop level, BE trigger candle+time, BE exit candle+time, and whether the trade was a winner cut or a loss saved. Purpose: visually confirm backend BE logic trade-by-trade (the be_* columns are already exported per trade)." },
            { id: "mfe-structure", label: "MFE by structure", status: "planned" },
            { id: "mfe-session", label: "MFE by session", status: "planned" },
            { id: "mfe-entry-model", label: "MFE by entry model", status: "planned" },
            { id: "struct-x-mfe", label: "Structure × MFE comparison", status: "planned" },
            { id: "session-x-mfe", label: "Session × MFE comparison", status: "planned" },
            // ── Data-integrity checks ──
            { id: "mfe-strategy-map-sanity", label: "Sanity-check MFE renders as expected on the Strategy Map", status: "idea" },
            // ── Funded-account survival (roadmap only — not implemented) ──
            { id: "max-loss-streak", label: "Setup: Max Loss Streak", status: "idea" },
            { id: "worst-dd-cluster", label: "Setup: Worst Consecutive Drawdown Cluster (R)", status: "idea" },
            { id: "avg-dd-cluster", label: "Setup: Average Drawdown Cluster (R)", status: "idea" },
            { id: "daily-dd-breach", label: "Daily drawdown breach rate", status: "idea" },
            { id: "challenge-breach", label: "Overall challenge breach rate", status: "idea" },
            { id: "ftmo-fail-prob", label: "FTMO-style failure probability", status: "idea" },
            { id: "dd-recovery", label: "Drawdown recovery characteristics", status: "idea" },
        ],
    },
};

function readOverrides() {
    try {
        const raw = (typeof localStorage !== "undefined") ? localStorage.getItem(STORAGE_KEY) : null;
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeOverrides(obj) {
    try {
        if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        try { roadmapBackend.scheduleSync(); } catch { /* backend optional */ }
    } catch {
        /* ignore quota / unavailable */
    }
}

const VALID = new Set(ROADMAP_STATUSES.map((s) => s.key));

// Merge seed defaults with persisted status overrides for one section.
export function getRoadmap(sectionKey) {
    const seed = ROADMAP_SEEDS[sectionKey] || { title: "Roadmap", items: [] };
    const overrides = readOverrides()[sectionKey] || {};
    const items = seed.items.map((it) => ({
        ...it,
        status: VALID.has(overrides[it.id]) ? overrides[it.id] : it.status,
    }));
    // labels/findings are optional per-section extras (read-only, no overrides).
    return { title: seed.title, sectionKey, items, labels: seed.labels || {}, findings: seed.findings || [] };
}

// Persist a single item's status override.
export function setRoadmapStatus(sectionKey, itemId, status) {
    if (!VALID.has(status)) return;
    const all = readOverrides();
    const section = { ...(all[sectionKey] || {}) };
    section[itemId] = status;
    all[sectionKey] = section;
    writeOverrides(all);
}

// ── Durable backend mirror (STORAGE Phase 1) ──────────────────────────────────
// Merge rule: union by sectionKey, then by itemId. There are no per-item
// timestamps, so a same-item conflict prefers the LOCAL value (the machine the
// user is actively on); a fresh browser with empty local correctly takes the
// backend copy via the empty-side rule. Invalid statuses are dropped.
export function mergeRoadmapOverrides(local, remote) {
    const safe = (o) => (o && typeof o === "object") ? o : {};
    const l = safe(local), r = safe(remote);
    const out = {};
    for (const sk of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const ls = safe(l[sk]), rs = safe(r[sk]);
        const merged = {};
        for (const id of new Set([...Object.keys(ls), ...Object.keys(rs)])) {
            const val = (id in ls) ? ls[id] : rs[id]; // conflict → prefer local
            if (VALID.has(val)) merged[id] = val;
        }
        if (Object.keys(merged).length) out[sk] = merged;
    }
    return out;
}

const roadmapBackend = makeDomainBackend({
    domain: "section_roadmaps",
    loadLocal: readOverrides,
    saveLocal: writeOverrides,
    merge: mergeRoadmapOverrides,
});

export const subscribeRoadmaps = roadmapBackend.subscribe;
roadmapBackend.kickoff();
