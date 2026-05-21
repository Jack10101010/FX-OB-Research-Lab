import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/lab/AppShell";
import { RouteErrorBoundary } from "@/components/lab/RouteErrorBoundary";
import Overview from "@/pages/Overview";
import StrategyBuilder from "@/pages/StrategyBuilder";
import Runs from "@/pages/Runs";
import RunDetail from "@/pages/RunDetail";
import OrderBlockLab from "@/pages/OrderBlockLab";
import ProtectionLab from "@/pages/ProtectionLab";
import EntriesLab from "@/pages/EntriesLab";
import StrategyMap from "@/pages/StrategyMap";
import TradeInspector from "@/pages/TradeInspector";
import SweepLab from "@/pages/SweepLab";
import ComparisonLab from "@/pages/ComparisonLab";
import WalkForwardLab from "@/pages/WalkForwardLab";
import ParityDebugger from "@/pages/ParityDebugger";
import MonteCarlo from "@/pages/MonteCarlo";
import Settings from "@/pages/Settings";

const withRouteBoundary = (element) => (
    <RouteErrorBoundary>
        {element}
    </RouteErrorBoundary>
);

function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <AppShell>
                    <Routes>
                        <Route path="/" element={withRouteBoundary(<Overview />)} />
                        <Route path="/strategy" element={withRouteBoundary(<StrategyBuilder />)} />
                        <Route path="/runs" element={withRouteBoundary(<Runs />)} />
                        <Route path="/runs/:runId" element={withRouteBoundary(<RunDetail />)} />
                        <Route path="/order-block-lab" element={withRouteBoundary(<OrderBlockLab />)} />
                        <Route path="/protection-lab" element={withRouteBoundary(<ProtectionLab />)} />
                        <Route path="/entries-lab" element={withRouteBoundary(<EntriesLab />)} />
                        <Route path="/strategy-map" element={withRouteBoundary(<StrategyMap />)} />
                        <Route path="/trade-inspector" element={withRouteBoundary(<TradeInspector />)} />
                        <Route path="/sweep" element={withRouteBoundary(<SweepLab />)} />
                        <Route path="/comparison" element={withRouteBoundary(<ComparisonLab />)} />
                        <Route path="/walk-forward" element={withRouteBoundary(<WalkForwardLab />)} />
                        <Route path="/parity" element={withRouteBoundary(<ParityDebugger />)} />
                        <Route path="/monte-carlo" element={withRouteBoundary(<MonteCarlo />)} />
                        <Route path="/settings" element={withRouteBoundary(<Settings />)} />
                        <Route path="*" element={withRouteBoundary(<Navigate to="/" replace />)} />
                    </Routes>
                </AppShell>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
