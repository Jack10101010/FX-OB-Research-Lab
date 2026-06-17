// SessionPortfolioPreview — isolated live-check route for the Session Strategy
// Portfolio UI (SESSION-STRATEGY-PORTFOLIO). Exists so the cards can be viewed in
// the running app WITHOUT mounting them in StrategyBuilder.jsx (a contaminated
// shared hotspot). Pure wrapper — no logic, no state, no data wiring of its own.

import React from "react";
import SessionStrategyCards from "@/components/lab/sessionProfiles/SessionStrategyCards";

export default function SessionPortfolioPreview() {
    return (
        <div className="p-4 space-y-4">
            <h1 className="text-[16px] font-ui text-[hsl(var(--text-1))]">Session Portfolio Preview</h1>
            <div className="text-[10.5px] text-muted-lab">
                Isolated preview of the Session Strategy Portfolio UI. Resolves against the active run/pair.
            </div>
            <SessionStrategyCards />
        </div>
    );
}
