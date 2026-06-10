/**
 * SessionLab — Session-first performance analysis page.
 *
 * Shows how each trading session (Asia, London, London Lull, New York,
 * NY PM, Outside) performs across the active run's trade universe.
 *
 * Follows the same pattern as EntriesLab / FailuresLab:
 *   - useDataset() for bundle access
 *   - useTradeUniverse() for the canonical trade list
 *   - ImportZone for the empty / no-data state
 *   - delegates all layout to SessionLabWorkspace
 */

import React, { useMemo } from "react";
import { Clock } from "lucide-react";
import { useDataset, getRunDisplayName } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { derivePrimaryResultView } from "@/data/tradeUniverse";
import { ImportZone } from "@/components/lab/ImportZone";
import { PageHeader } from "@/components/lab/AppShell";
import ResearchResultViewBanner from "@/components/lab/ResearchResultViewBanner";
import { SessionLabWorkspace } from "@/components/lab/session/SessionLabWorkspace";

export default function SessionLab() {
    const dataset = useDataset();
    const hasRun = Boolean(dataset.ACTIVE_RUN?.id);
    const runId = hasRun ? dataset.ACTIVE_RUN.id : null;
    const bundle = hasRun ? dataset.getRunData(runId) : null;

    // Phase D: derive scenario from bundle instead of inheriting global SCENARIO.
    // derivePrimaryResultView returns null for baseline-only runs → useTradeUniverse
    // falls back to baseline naturally (scenarioOverride=null → store SCENARIO ignored).
    const primaryScenario = useMemo(() => derivePrimaryResultView(bundle), [bundle]);

    const universe = useTradeUniverse(runId, primaryScenario);
    const trades = universe?.trades || [];

    if (!hasRun) {
        return (
            <div className="px-6 py-8 max-w-3xl mx-auto space-y-6">
                <PageHeader
                    eyebrow="Analysis Labs"
                    title="Session Lab"
                    subtitle="Import a run to begin session-first performance analysis."
                />
                <ImportZone />
            </div>
        );
    }

    return (
        <div className="px-6 py-6 space-y-6">
            <PageHeader
                eyebrow="Analysis Labs"
                title="Session Lab"
                subtitle="Session-first edge analysis — discover which sessions deserve capital."
            />
            {/* RESEARCH-RESULT-VIEW-BANNER Phase 3: read-only RunDetail-style banner for
                the EXACT universe these analytics use (locally-derived primaryScenario,
                not the global scenario). Hero-less page → showRunIdentity. Surfaces the
                Result View breakdown + Current Result View + Position Variant / Source /
                Rows + the Arm C0/C1 double-count warning. Not interactive. */}
            <ResearchResultViewBanner
                universe={universe}
                showRunIdentity
                run={{
                    id: runId,
                    name: getRunDisplayName(bundle),
                    symbol: bundle?.summary?.symbol,
                    timeframe: bundle?.summary?.detectionTf ?? bundle?.summary?.detection_tf ?? bundle?.config?.detection_timeframe,
                }}
            />
            <SessionLabWorkspace trades={trades} bundle={bundle} />
        </div>
    );
}
