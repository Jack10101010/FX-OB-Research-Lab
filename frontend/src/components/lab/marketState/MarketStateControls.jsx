// ── MarketStateControls.jsx ─────────────────────────────────────────────────
// PRESENTATION ONLY. Renders the Market State / Regime Gate controls for the
// Strategy Builder. It is REGISTRY-DRIVEN: every field's options, numeric
// min/max/step and default come from CONFIG_REGISTRY (group "regime") — there is
// NO bespoke config object and NO duplicated validation here. State lives in the
// builder's single `cfg`; this component only reads `cfg[key]` and calls
// `onField(key, value)`. It performs NO indicator math.

import React from "react";
import { Field, NeonInput, NeonSelect, NeonToggle, Segment, FilterToggle } from "@/components/lab/controls";
import { getRegistryEntry } from "@/data/configRegistry";

// The six canonical market states (registry `regimeAllowedStates` values) with
// display labels for the Allowed-States checklist. Order = canonical panel order.
const REGIME_STATES = [
    { value: "Bull/Expand", label: "Bull Expand" },
    { value: "Bull/Compress", label: "Bull Compress" },
    { value: "Bull/Chop", label: "Bull Chop" },
    { value: "Bear/Expand", label: "Bear Expand" },
    { value: "Bear/Compress", label: "Bear Compress" },
    { value: "Bear/Chop", label: "Bear Chop" },
];
const ALL_REGIME_STATE_VALUES = REGIME_STATES.map((s) => s.value);

// Direction-aware per-group options (Phase 4b) with friendly labels.
const DIR_OPTS = {
    bull: [{ value: "long", label: "Long only" }, { value: "both", label: "Both" }, { value: "none", label: "Block all" }],
    bear: [{ value: "short", label: "Short only" }, { value: "both", label: "Both" }, { value: "none", label: "Block all" }],
    chop: [{ value: "both", label: "Both" }, { value: "long", label: "Long only" }, { value: "short", label: "Short only" }, { value: "none", label: "Block all" }],
};
const DIR_SUMMARY = { long: "Long", short: "Short", both: "Both", none: "Block" };

// True when filter mode is selected but no states are allowed → run should be blocked.
export function regimeFilterInvalid(cfg) {
    if (!cfg?.regimeEnabled) return false;
    if (cfg.regimeMode !== "filter") return false;
    const allowed = Array.isArray(cfg.regimeAllowedStates) ? cfg.regimeAllowedStates : [];
    return allowed.length === 0;
}

// True when direction-aware policy blocks every group (all three = "none") — a run that
// takes no trades. Surfaced as a warning (not a hard Run-disable).
export function regimeDirectionAllBlocked(cfg) {
    if (!cfg?.regimeEnabled || cfg.regimeMode !== "filter") return false;
    if (cfg.regimeDirectionPolicy !== "direction_aware") return false;
    return (cfg.regimeBullAllows ?? "long") === "none"
        && (cfg.regimeBearAllows ?? "short") === "none"
        && (cfg.regimeChopAllows ?? "both") === "none";
}

// Display copy only (the registry owns constraints/defaults). Grouped by sub-card.
const GROUPS = [
    {
        title: "EMA (Trend)",
        enableKey: "emaEnabled",
        fields: [
            { key: "emaTimeframe", label: "Timeframe" },
            { key: "emaLength", label: "Period" },
            { key: "emaConfirmDays", label: "Confirmation candles" },
        ],
    },
    {
        title: "Bollinger Band Width (Volatility)",
        enableKey: "bbwEnabled",
        fields: [
            { key: "bbwTimeframe", label: "Timeframe" },
            { key: "bbwLength", label: "Period" },
            { key: "bbwStdDev", label: "Standard deviations" },
            { key: "bbwThresholdMode", label: "Threshold mode" },
            { key: "bbwThresholdValue", label: "Threshold" },
        ],
    },
    {
        title: "ADX (Chop)",
        enableKey: "adxEnabled",
        fields: [
            { key: "adxTimeframe", label: "Timeframe" },
            { key: "adxLength", label: "Period" },
            { key: "adxChopThreshold", label: "Chop threshold" },
        ],
    },
];

// One registry-driven input. Type + options + validation are read from the entry.
function RegistryField({ fieldKey, label, cfg, onField, disabled }) {
    const entry = getRegistryEntry(fieldKey);
    if (!entry) return null;
    const value = cfg[fieldKey] ?? entry.defaultValue;
    const numericDefault = typeof entry.defaultValue === "number";

    if (entry.inputType === "select") {
        const options = (entry.options || []).map((o) => ({ value: String(o), label: String(o) }));
        return (
            <Field label={label}>
                <NeonSelect
                    testId={`regime-${fieldKey}`}
                    value={String(value)}
                    onChange={(v) => onField(fieldKey, numericDefault ? Number(v) : v)}
                    options={options}
                    className={disabled ? "opacity-50 pointer-events-none" : ""}
                />
            </Field>
        );
    }

    // number
    const val = entry.validation || {};
    return (
        <Field label={label}>
            <NeonInput
                data-testid={`regime-${fieldKey}`}
                type="number"
                value={value}
                min={val.min}
                max={val.max}
                step={val.step ?? 1}
                onChange={(e) => onField(fieldKey, e.target.value === "" ? "" : Number(e.target.value))}
                className={disabled ? "opacity-50 pointer-events-none w-full" : "w-full"}
            />
        </Field>
    );
}

function SubCard({ title, enableKey, fields, cfg, onField, gateOn }) {
    const enabled = !!cfg[enableKey];
    const dim = !gateOn || !enabled;
    return (
        <div className="border border-[hsl(var(--border-soft)/0.6)] bg-[hsl(var(--panel-2))] clip-bevel-sm p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[hsl(var(--accent-primary))] uppercase tracking-wide">{title}</span>
                <NeonToggle
                    testId={`regime-${enableKey}`}
                    checked={enabled}
                    onChange={(v) => onField(enableKey, v)}
                    label="Enable"
                />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {fields.map((f) => (
                    <RegistryField
                        key={f.key}
                        fieldKey={f.key}
                        label={f.label}
                        cfg={cfg}
                        onField={onField}
                        disabled={dim}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * @param {Object}   cfg      the builder cfg (registry-keyed)
 * @param {Function} onField  (key, value) => void  — writes into cfg
 */
// Mode (Label / Filter) + Allowed-States checklist. Writes cfg.regimeMode and
// cfg.regimeAllowedStates (registry-keyed). Defaults (label + all six) are unchanged.
function ModeAndAllowedStates({ cfg, onField, gateOn }) {
    const mode = cfg.regimeMode === "filter" ? "filter" : "label";
    const allowed = Array.isArray(cfg.regimeAllowedStates) ? cfg.regimeAllowedStates : ALL_REGIME_STATE_VALUES;
    const isFilter = mode === "filter";
    const dim = !gateOn;
    const toggleState = (value) => {
        const set = new Set(allowed);
        if (set.has(value)) set.delete(value); else set.add(value);
        // preserve canonical order
        onField("regimeAllowedStates", ALL_REGIME_STATE_VALUES.filter((v) => set.has(v)));
    };
    const invalid = isFilter && allowed.length === 0;
    return (
        <div className={`border border-[hsl(var(--border-soft)/0.6)] bg-[hsl(var(--panel-2))] clip-bevel-sm p-4 ${dim ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                    <span className="text-[13px] font-semibold text-[hsl(var(--accent-primary))] uppercase tracking-wide">Mode</span>
                    <div className="mt-2">
                        <Segment
                            testId="regime-regimeMode"
                            value={mode}
                            onChange={(v) => onField("regimeMode", v)}
                            options={[{ value: "label", label: "Label only" }, { value: "filter", label: "Filter trades" }]}
                        />
                    </div>
                </div>
            </div>
            <div className="text-[11px] text-[hsl(var(--text-2))] leading-relaxed max-w-[640px]">
                <span className="text-[hsl(var(--text-1))] font-medium">Label mode:</span> computes and records Market
                State but never changes trade selection.<br />
                <span className="text-[hsl(var(--text-1))] font-medium">Filter mode:</span> blocks trades whose Market
                State is not in the selected list.
            </div>

            <div className="mt-3">
                <div className="control-label uppercase mb-1.5">Allowed Market States</div>
                <div className="flex flex-wrap gap-1.5" data-testid="regime-allowed-states">
                    {REGIME_STATES.map((s) => (
                        <FilterToggle
                            key={s.value}
                            testId={`regime-allowed-${s.value.replace("/", "-").toLowerCase()}`}
                            active={allowed.includes(s.value)}
                            onClick={() => toggleState(s.value)}
                            tone="primary"
                            title={isFilter ? "Trades in this state are allowed (filter mode)" : "Applies when Filter mode is on"}
                        >
                            {s.label}
                        </FilterToggle>
                    ))}
                </div>
                {invalid && (
                    <div className="mt-2 text-[11px] text-[hsl(var(--danger))]" data-testid="regime-filter-invalid">
                        Filter mode requires at least one allowed state — Run is disabled until you select one.
                    </div>
                )}
            </div>

            {isFilter && (
                <div className="mt-4 border-t border-[hsl(var(--border-soft)/0.5)] pt-3">
                    <div className="control-label uppercase mb-1.5">Filter behaviour</div>
                    <Segment
                        testId="regime-regimeDirectionPolicy"
                        value={cfg.regimeDirectionPolicy === "direction_aware" ? "direction_aware" : "state_only"}
                        onChange={(v) => onField("regimeDirectionPolicy", v)}
                        options={[{ value: "state_only", label: "State only" }, { value: "direction_aware", label: "Direction aware" }]}
                    />
                    <div className="text-[11px] text-[hsl(var(--text-2))] mt-2 leading-relaxed max-w-[640px]">
                        <span className="text-[hsl(var(--text-1))] font-medium">State only:</span> blocks trades whose
                        Market State isn’t in the allowed list.<br />
                        <span className="text-[hsl(var(--text-1))] font-medium">Direction aware:</span> additionally
                        blocks trades whose side isn’t permitted for that state’s trend group (Bull / Bear / Chop).
                    </div>

                    {cfg.regimeDirectionPolicy === "direction_aware" && (
                        <div className="mt-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Field label="Bull states allow">
                                    <NeonSelect testId="regime-regimeBullAllows" value={cfg.regimeBullAllows ?? "long"}
                                        onChange={(v) => onField("regimeBullAllows", v)} options={DIR_OPTS.bull} />
                                </Field>
                                <Field label="Bear states allow">
                                    <NeonSelect testId="regime-regimeBearAllows" value={cfg.regimeBearAllows ?? "short"}
                                        onChange={(v) => onField("regimeBearAllows", v)} options={DIR_OPTS.bear} />
                                </Field>
                                <Field label="Chop states allow">
                                    <NeonSelect testId="regime-regimeChopAllows" value={cfg.regimeChopAllows ?? "both"}
                                        onChange={(v) => onField("regimeChopAllows", v)} options={DIR_OPTS.chop} />
                                </Field>
                            </div>
                            <div className="mt-2 text-[11px] font-num text-[hsl(var(--text-2))]" data-testid="regime-direction-summary">
                                Bull → {DIR_SUMMARY[cfg.regimeBullAllows ?? "long"]} · Bear → {DIR_SUMMARY[cfg.regimeBearAllows ?? "short"]} · Chop → {DIR_SUMMARY[cfg.regimeChopAllows ?? "both"]}
                            </div>
                            {regimeDirectionAllBlocked(cfg) && (
                                <div className="mt-2 text-[11px] text-[hsl(var(--warning))]" data-testid="regime-direction-allblocked">
                                    All groups set to Block all — this run would take no trades.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * @param {Object}   cfg      the builder cfg (registry-keyed)
 * @param {Function} onField  (key, value) => void  — writes into cfg
 */
export function MarketStateControls({ cfg, onField }) {
    const gateOn = !!cfg.regimeEnabled;
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.06)] clip-bevel-sm px-4 py-3">
                <div>
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--accent-primary))]">Market State gate</div>
                    <div className="text-[11.5px] text-[hsl(var(--text-2))] mt-0.5 leading-relaxed max-w-[640px]">
                        EMA trend + Bollinger-width volatility + ADX chop → six market states.
                        Off by default. Enabling emits the settings with a run; the state is always
                        computed point-in-time (prior completed daily close) so there is no look-ahead.
                    </div>
                </div>
                <NeonToggle
                    testId="regime-regimeEnabled"
                    checked={gateOn}
                    onChange={(v) => onField("regimeEnabled", v)}
                    label={gateOn ? "On" : "Off"}
                />
            </div>

            <ModeAndAllowedStates cfg={cfg} onField={onField} gateOn={gateOn} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {GROUPS.map((g) => (
                    <SubCard key={g.title} {...g} cfg={cfg} onField={onField} gateOn={gateOn} />
                ))}
            </div>
        </div>
    );
}

export default MarketStateControls;
