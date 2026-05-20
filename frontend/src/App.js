import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/lab/AppShell";
import Overview from "@/pages/Overview";
import StrategyBuilder from "@/pages/StrategyBuilder";
import Runs from "@/pages/Runs";
import RunDetail from "@/pages/RunDetail";
import StrategyMap from "@/pages/StrategyMap";
import TradeInspector from "@/pages/TradeInspector";
import SweepLab from "@/pages/SweepLab";
import ComparisonLab from "@/pages/ComparisonLab";
import ParityDebugger from "@/pages/ParityDebugger";
import MonteCarlo from "@/pages/MonteCarlo";
import Settings from "@/pages/Settings";

function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <AppShell>
                    <Routes>
                        <Route path="/" element={<Overview />} />
                        <Route path="/strategy" element={<StrategyBuilder />} />
                        <Route path="/runs" element={<Runs />} />
                        <Route path="/runs/:runId" element={<RunDetail />} />
                        <Route path="/strategy-map" element={<StrategyMap />} />
                        <Route path="/trade-inspector" element={<TradeInspector />} />
                        <Route path="/sweep" element={<SweepLab />} />
                        <Route path="/comparison" element={<ComparisonLab />} />
                        <Route path="/parity" element={<ParityDebugger />} />
                        <Route path="/monte-carlo" element={<MonteCarlo />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AppShell>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
