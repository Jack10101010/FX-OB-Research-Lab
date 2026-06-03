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

import React from "react";
import { Clock } from "lucide-react";
import { useDataset } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { ImportZone } from "@/components/lab/ImportZone";
import { PageHeader } from "@/components/lab/AppShell";
import { SessionLabWorkspace } from "@/components/lab/session/SessionLabWorkspace";

export default function SessionLab() {
    const dataset = useDataset();
    const universe = useTradeUniverse();

    const hasRun = Boolean(dataset.ACTIVE_RUN?.id);
    const bundle = hasRun ? dataset.getRunData(dataset.ACTIVE_RUN.id) : null;
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
            <SessionLabWorkspace trades={trades} bundle={bundle} />
        </div>
    );
}
