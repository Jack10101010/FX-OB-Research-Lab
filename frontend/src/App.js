import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useDataset } from "@/data/store";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/lab/AppShell";
import { RouteErrorBoundary } from "@/components/lab/RouteErrorBoundary";
import Overview from "@/pages/Overview";
import WorkflowGuide from "@/pages/WorkflowGuide";
import StrategyLogic from "@/pages/StrategyLogic";
import StrategyBuilder from "@/pages/StrategyBuilder";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Insights from "@/pages/Insights";
import Runs from "@/pages/Runs";
import RunDetail from "@/pages/RunDetail";
import OrderBlockLab from "@/pages/OrderBlockLab";
import ProtectionLab from "@/pages/ProtectionLab";
import EntriesLab from "@/pages/EntriesLab";
import NewsLab from "@/pages/NewsLab";
import StrategyMap from "@/pages/StrategyMap";
import TradeInspector from "@/pages/TradeInspector";
import SweepLab from "@/pages/SweepLab";
import ComparisonLab from "@/pages/ComparisonLab";
import WalkForwardLab from "@/pages/WalkForwardLab";
import HypothesisLab from "@/pages/HypothesisLab";
import FailuresLab from "@/pages/FailuresLab";
import ParityDebugger from "@/pages/ParityDebugger";
import MonteCarlo from "@/pages/MonteCarlo";
import Settings from "@/pages/Settings";

function ActiveRunRedirect() {
    const { activeRunId } = useDataset();
    if (activeRunId) {
        return <Navigate to={`/runs/${encodeURIComponent(activeRunId)}`} replace />;
    }
    return <Navigate to="/runs" replace />;
}

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
                        <Route path="/workflow-guide" element={withRouteBoundary(<WorkflowGuide />)} />
                        <Route path="/strategy-logic" element={withRouteBoundary(<StrategyLogic />)} />
                        <Route path="/projects" element={withRouteBoundary(<Projects />)} />
                        <Route path="/projects/:projectId" element={withRouteBoundary(<ProjectDetail />)} />
                        <Route path="/insights" element={withRouteBoundary(<Insights />)} />
                        <Route path="/strategy" element={withRouteBoundary(<StrategyBuilder />)} />
                        <Route path="/runs" element={withRouteBoundary(<Runs />)} />
                        <Route path="/runs/active" element={<ActiveRunRedirect />} />
                        <Route path="/runs/:runId" element={withRouteBoundary(<RunDetail />)} />
                        <Route path="/order-block-lab" element={withRouteBoundary(<OrderBlockLab />)} />
                        <Route path="/protection-lab" element={withRouteBoundary(<ProtectionLab />)} />
                        <Route path="/entries-lab" element={withRouteBoundary(<EntriesLab />)} />
                        <Route path="/news-lab" element={withRouteBoundary(<NewsLab />)} />
                        <Route path="/strategy-map" element={withRouteBoundary(<StrategyMap />)} />
                        <Route path="/trade-inspector" element={withRouteBoundary(<TradeInspector />)} />
                        <Route path="/sweep" element={withRouteBoundary(<SweepLab />)} />
                        <Route path="/comparison" element={withRouteBoundary(<ComparisonLab />)} />
                        <Route path="/walk-forward" element={withRouteBoundary(<WalkForwardLab />)} />
                        <Route path="/hypothesis-lab" element={withRouteBoundary(<HypothesisLab />)} />
                        <Route path="/failures-lab" element={withRouteBoundary(<FailuresLab />)} />
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
