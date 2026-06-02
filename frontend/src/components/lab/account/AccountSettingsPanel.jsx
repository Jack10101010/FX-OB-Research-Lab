/**
 * AccountSettingsPanel — shared editor for the global account/compounding
 * configuration that drives Current Equity (Phase RB-2).
 *
 * Source of truth: the store's `ACCOUNT_SETTINGS` slice, edited via
 * `setAccountSettings` (both surfaced through `useResultsLens`). Field set and
 * defaults mirror RunDetail's account view exactly (the existing
 * `accountEquity.js` contract): mode, startingBalance, riskPct, fixedRiskAmount,
 * currency. accountEquity.js does not model fees/slippage, so none are shown.
 *
 * RB-2 scope: this only edits the stored config. It does NOT change RunDetail's
 * local account behavior, and no analytics page reads this config yet.
 *
 * Props
 *   className   {string}   optional extra classes on the wrapper
 *   disabled    {boolean}  optional — dim + block edits (e.g. when basis = Raw R)
 */

import React from "react";
import { Field, NeonInput, NeonSelect } from "@/components/lab/controls";
import { useResultsLens } from "@/data/useResultsLens";

const MODE_OPTIONS = [
    { value: "r_only", label: "Pure R · no account model" },
    { value: "fixed_dollar", label: "Fixed dollar risk" },
    { value: "initial_equity_pct", label: "% of initial balance" },
    { value: "current_equity_pct", label: "% of current equity" },
];

const numberOrEmpty = (v) => (v == null || Number.isNaN(Number(v)) ? "" : String(v));

export function AccountSettingsPanel({ className = "", disabled = false }) {
    const { accountSettings, setAccountSettings } = useResultsLens();
    const settings = accountSettings || {};
    const mode = settings.mode || "r_only";

    const patch = (next) => {
        if (disabled) return;
        setAccountSettings(next);
    };

    const showRiskPct = mode === "initial_equity_pct" || mode === "current_equity_pct";
    const showFixed = mode === "fixed_dollar";

    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`.trim()}>
            <Field label="Account Mode" hint="How per-trade risk is sized when measuring in Current Equity.">
                <NeonSelect
                    testId="account-mode"
                    value={mode}
                    onChange={(value) => patch({ mode: value })}
                    options={MODE_OPTIONS}
                />
            </Field>

            <Field label="Starting Balance" hint="Account equity at the first trade.">
                <NeonInput
                    type="number"
                    min="0"
                    step="100"
                    data-testid="account-starting-balance"
                    value={numberOrEmpty(settings.startingBalance)}
                    onChange={(e) => patch({ startingBalance: Number(e.target.value) })}
                />
            </Field>

            {showRiskPct && (
                <Field label="Risk Percent" hint="Percent of balance risked per trade.">
                    <NeonInput
                        type="number"
                        min="0"
                        step="0.1"
                        data-testid="account-risk-pct"
                        value={numberOrEmpty(settings.riskPct)}
                        onChange={(e) => patch({ riskPct: Number(e.target.value) })}
                    />
                </Field>
            )}

            {showFixed && (
                <Field label="Fixed Risk Amount" hint="Currency risked per trade (1R).">
                    <NeonInput
                        type="number"
                        min="0"
                        step="10"
                        data-testid="account-fixed-risk"
                        value={numberOrEmpty(settings.fixedRiskAmount)}
                        onChange={(e) => patch({ fixedRiskAmount: Number(e.target.value) })}
                    />
                </Field>
            )}

            <Field label="Currency" hint="Display currency only.">
                <NeonInput
                    type="text"
                    maxLength={3}
                    data-testid="account-currency"
                    value={settings.currency || "USD"}
                    onChange={(e) => patch({ currency: e.target.value })}
                />
            </Field>
        </div>
    );
}

export default AccountSettingsPanel;
