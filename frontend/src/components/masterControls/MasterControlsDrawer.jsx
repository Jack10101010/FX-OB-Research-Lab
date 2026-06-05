import React from "react";
import { X, SlidersHorizontal, Database, Layers, Zap, GitBranch, Activity } from "lucide-react";
import { useMasterControls } from "./MasterControlsContext";
import { CONFIG_REGISTRY } from "@/data/configRegistry";
import { useDataset } from "@/data/store";

// ─── Registry summary (static — computed once at module load) ────────────────

const GROUP_ORDER = ["core", "structure", "execution", "entry", "protection", "session", "news", "cost"];

const REGISTRY_SUMMARY = (() => {
    const total      = CONFIG_REGISTRY.length;
    const emitted    = CONFIG_REGISTRY.filter((e) => e.emitted).length;
    const byGroup    = {};
    const byTier     = { 1: 0, 2: 0, 3: 0 };

    for (const entry of CONFIG_REGISTRY) {
        byGroup[entry.group] = (byGroup[entry.group] || 0) + 1;
        if (entry.tier >= 1 && entry.tier <= 3) byTier[entry.tier]++;
    }

    return { total, emitted, notEmitted: total - emitted, byGroup, byTier };
})();

const TIER_META = {
    1: { label: "Tier 1 — Frontend filter",   desc: "No rerun required" },
    2: { label: "Tier 2 — Rescore candidate", desc: "Rerun optional" },
    3: { label: "Tier 3 — Full rerun",        desc: "Rerun required" },
};

// ─── Drawer ──────────────────────────────────────────────────────────────────

export function MasterControlsDrawer() {
    const {
        isOpen, closeMasterControls,
        activeConfig,
        dirtyCount, highestDirtyTier, hasDirtyFields,
        validationErrorList, hasValidationErrors,
    } = useMasterControls();
    const { activeRunId } = useDataset();

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50"
                    onClick={closeMasterControls}
                />
            )}

            {/* Slide-over panel */}
            <div
                data-testid="master-controls-drawer"
                aria-label="Research Control Plane"
                className={[
                    "fixed inset-y-0 right-0 z-50 flex flex-col w-96",
                    "bg-[hsl(var(--bg-2)/0.97)] border-l border-[hsl(var(--border-soft))]",
                    "backdrop-blur-xl shadow-2xl font-ui",
                    "transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full",
                ].join(" ")}
            >
                {/* Header */}
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[hsl(var(--border-soft))] flex-shrink-0">
                    <SlidersHorizontal size={14} className="text-[hsl(var(--accent-primary))] shrink-0" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-title-lab">
                        Research Control Plane
                    </span>
                    <button
                        type="button"
                        onClick={closeMasterControls}
                        aria-label="Close master controls"
                        className="ml-auto p-1.5 rounded text-muted-lab hover:text-white hover:bg-[hsl(var(--panel))] transition-colors"
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-6">

                    {/* Active Run */}
                    <section>
                        <SectionLabel icon={<Zap size={11} />} label="Active Run" />
                        <div className="mt-2 px-3 py-2.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.5)]">
                            {activeRunId ? (
                                <>
                                    <p className="text-[11px] text-[hsl(var(--accent-primary))] font-mono truncate">{activeRunId}</p>
                                    <p className="text-[10px] text-muted-lab mt-0.5">
                                        {activeConfig ? "Config loaded" : "Config unavailable"}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-lab">No active run — import a bundle via the toolbar</p>
                            )}
                        </div>
                    </section>

                    {/* Draft state — Phase 3C debug readout */}
                    <section>
                        <SectionLabel icon={<Activity size={11} />} label="Draft State" />
                        <div className="mt-2 space-y-1.5">
                            <StatusRow label="Config" value={activeConfig ? "Loaded" : "None"} ok={!!activeConfig} />
                            <StatusRow
                                label="Dirty fields"
                                value={hasDirtyFields ? `${dirtyCount} (tier ${highestDirtyTier})` : "None"}
                                ok={!hasDirtyFields}
                            />
                            <StatusRow
                                label="Validation"
                                value={hasValidationErrors ? `${validationErrorList.length} error${validationErrorList.length !== 1 ? "s" : ""}` : "OK"}
                                ok={!hasValidationErrors}
                                warn={hasValidationErrors}
                            />
                        </div>
                    </section>

                    {/* Registry summary */}
                    <section>
                        <SectionLabel icon={<Database size={11} />} label="Config Registry" />
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <StatCard label="Total"   value={REGISTRY_SUMMARY.total} />
                            <StatCard label="Emitted" value={REGISTRY_SUMMARY.emitted}    accent />
                            <StatCard label="Dropped" value={REGISTRY_SUMMARY.notEmitted} muted />
                        </div>
                    </section>

                    {/* Control Groups */}
                    <section>
                        <SectionLabel icon={<Layers size={11} />} label="Control Groups" />
                        <div className="mt-2 space-y-1.5">
                            {GROUP_ORDER.map((g) => (
                                <GroupRow
                                    key={g}
                                    group={g}
                                    count={REGISTRY_SUMMARY.byGroup[g] || 0}
                                    total={REGISTRY_SUMMARY.total}
                                />
                            ))}
                        </div>
                    </section>

                    {/* Rerun tiers */}
                    <section>
                        <SectionLabel icon={<GitBranch size={11} />} label="Rerun Tiers" />
                        <div className="mt-2 space-y-1.5">
                            {[1, 2, 3].map((t) => (
                                <TierRow key={t} tier={t} count={REGISTRY_SUMMARY.byTier[t] || 0} />
                            ))}
                        </div>
                    </section>

                    {/* Phase roadmap */}
                    <section>
                        <SectionLabel label="Roadmap" />
                        <div className="mt-2 space-y-2">
                            <PhasePlaceholder
                                phase={3}
                                label="Editable controls"
                                desc="Edit cfg fields and draft new configs without leaving the report page"
                            />
                            <PhasePlaceholder
                                phase={4}
                                label="Run preview"
                                desc="Preview what changes vs. the active run before dispatching to the sidecar"
                            />
                            <PhasePlaceholder
                                phase={5}
                                label="Compare & promote"
                                desc="Diff draft against live run, promote best config to project"
                            />
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-3 border-t border-[hsl(var(--border-soft))]">
                    <p className="text-[10px] text-muted-lab">
                        Phase 3C — context state · {REGISTRY_SUMMARY.total} cfg fields · {REGISTRY_SUMMARY.emitted} emitted
                    </p>
                </div>
            </div>
        </>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ icon, label }) {
    return (
        <div className="flex items-center gap-1.5">
            {icon && <span className="text-muted-lab">{icon}</span>}
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-lab">{label}</span>
        </div>
    );
}

function StatCard({ label, value, accent, muted }) {
    const valueClass = accent
        ? "text-[hsl(var(--accent-primary))]"
        : muted
            ? "text-muted-lab"
            : "text-white";

    return (
        <div className="flex flex-col items-center px-2 py-2.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.4)]">
            <span className={`text-xl font-bold font-display leading-none ${valueClass}`}>{value}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-lab mt-1">{label}</span>
        </div>
    );
}

function GroupRow({ group, count, total }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <span className="w-[72px] shrink-0 text-[11px] text-muted-lab capitalize font-mono">{group}</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-[hsl(var(--panel-3))]">
                <div
                    className="h-full rounded-full bg-[hsl(var(--accent-primary)/0.45)]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-5 shrink-0 text-right text-[11px] text-muted-lab">{count}</span>
        </div>
    );
}

function TierRow({ tier, count }) {
    const { label, desc } = TIER_META[tier];
    return (
        <div className="px-3 py-2 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.3)]">
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-white">{label}</span>
                <span className="text-[11px] font-bold text-[hsl(var(--accent-primary))]">{count}</span>
            </div>
            <p className="text-[10px] text-muted-lab mt-0.5">{desc}</p>
        </div>
    );
}

function PhasePlaceholder({ phase, label, desc }) {
    return (
        <div className="px-3 py-2.5 rounded border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.2)]">
            <div className="flex items-center gap-2">
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--panel-2))] text-muted-lab font-mono uppercase tracking-wider">
                    Phase {phase}
                </span>
                <span className="text-[11px] text-white">{label}</span>
            </div>
            <p className="text-[10px] text-muted-lab mt-1">{desc}</p>
        </div>
    );
}

function StatusRow({ label, value, ok, warn }) {
    const valueClass = warn
        ? "text-[hsl(var(--accent-warn,35_90%_56%))]"
        : ok
            ? "text-[hsl(var(--accent-primary))]"
            : "text-muted-lab";
    return (
        <div className="flex items-center justify-between px-3 py-1.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.3)]">
            <span className="text-[11px] text-muted-lab">{label}</span>
            <span className={`text-[11px] font-medium ${valueClass}`}>{value}</span>
        </div>
    );
}
