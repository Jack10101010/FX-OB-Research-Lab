/**
 * PlaybookTrigger — global TopBar button that opens the Run Analysis Playbook
 * (RUN-ANALYSIS-PLAYBOOK Phase 2A). Mirrors the Master Controls "Controls"
 * button styling so it reads as a peer global tool, but is fully independent.
 */

import React from "react";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRunPlaybook } from "./RunPlaybookProvider";

export function PlaybookTrigger() {
    const { isOpen, toggle } = useRunPlaybook();
    return (
        <button
            type="button"
            data-testid="topbar-playbook"
            onClick={toggle}
            title="Run Analysis Playbook"
            className={cn(
                "inline-flex items-center gap-2 px-2.5 py-1 border clip-bevel-sm font-ui transition-colors",
                isOpen
                    ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.08)] text-[hsl(var(--accent-primary))]"
                    : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.6)] text-muted-lab hover:border-[hsl(var(--border-mid))] hover:text-white",
            )}
        >
            <ClipboardCheck className="w-3 h-3 shrink-0" />
            <span className="text-[10px] uppercase tracking-wider">Playbook</span>
        </button>
    );
}

export default PlaybookTrigger;
