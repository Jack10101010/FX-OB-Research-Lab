// ── MarketStateControls.jsx ─────────────────────────────────────────────────
// PRESENTATION ONLY. Renders the Market State / Regime Gate controls for the
// Strategy Builder. It is REGISTRY-DRIVEN: every field's options, numeric
// min/max/step and default come from CONFIG_REGISTRY (group "regime") — there is
// NO bespoke config object and NO duplicated validation here. State lives in the
// builder's single `cfg`; this component only reads `cfg[key]` and calls
// `onField(key, value)`. It performs NO indicator math.

import React from "react";
import { Field, NeonInput, NeonSelect, NeonToggle } from "@/components/lab/controls";
import { getRegistryEntry } from "@/data/configRegistry";

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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {GROUPS.map((g) => (
                    <SubCard key={g.title} {...g} cfg={cfg} onField={onField} gateOn={gateOn} />
                ))}
            </div>
        </div>
    );
}

export default MarketStateControls;
