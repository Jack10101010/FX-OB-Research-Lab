import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { NeonButton } from "@/components/lab/controls";

export class RouteErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        // Keep route crashes visible in dev tools without taking down the shell.
        console.error("Route failed to render", error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="px-6 py-8">
                <div className="relative max-w-2xl border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--panel)/0.9)] backdrop-blur-xl shadow-[0_0_0_1px_hsl(var(--border-soft)/0.4)_inset]">
                    <span className="absolute -top-px -left-px w-3 h-3 border-t border-l border-[hsl(var(--warning))] pointer-events-none" />
                    <span className="absolute -top-px -right-px w-3 h-3 border-t border-r border-[hsl(var(--accent-secondary))] pointer-events-none" />
                    <span className="absolute -bottom-px -left-px w-3 h-3 border-b border-l border-[hsl(var(--accent-secondary))] pointer-events-none" />
                    <span className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-[hsl(var(--warning))] pointer-events-none" />

                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--warning)/0.28)]">
                        <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
                        <h2 className="text-[11px] font-ui tracking-[0.14em] uppercase text-[hsl(var(--warning))]">
                            Page failed to render
                        </h2>
                    </div>

                    <div className="p-4">
                        <p className="text-[12px] font-ui text-muted-lab">
                            This page crashed, but the dashboard shell is still running.
                        </p>
                        <NeonButton
                            icon={RotateCw}
                            tone="ghost"
                            className="mt-4 border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.10)] hover:bg-[hsl(var(--warning)/0.18)]"
                            onClick={() => window.location.reload()}
                        >
                            Reload page
                        </NeonButton>
                    </div>
                </div>
            </div>
        );
    }
}
