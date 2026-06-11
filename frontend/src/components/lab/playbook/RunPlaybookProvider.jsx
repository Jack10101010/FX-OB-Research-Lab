/**
 * RunPlaybookProvider — open-state for the Run Analysis Playbook drawer
 * (RUN-ANALYSIS-PLAYBOOK Phase 2A).
 *
 * Deliberately INDEPENDENT of Master Controls: its own context + its own
 * isOpen state, no shared store, no Preview-Lens coupling. Mounted in AppShell
 * so the trigger (TopBar) and the drawer can both read it on every page.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const RunPlaybookContext = createContext({
    isOpen: false,
    open: () => {},
    close: () => {},
    toggle: () => {},
    setOpen: () => {},
});

export function RunPlaybookProvider({ children }) {
    const [isOpen, setIsOpen] = useState(false);
    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((v) => !v), []);
    const setOpen = useCallback((v) => setIsOpen(Boolean(v)), []);
    const value = useMemo(() => ({ isOpen, open, close, toggle, setOpen }), [isOpen, open, close, toggle, setOpen]);
    return <RunPlaybookContext.Provider value={value}>{children}</RunPlaybookContext.Provider>;
}

export function useRunPlaybook() {
    return useContext(RunPlaybookContext);
}

export default RunPlaybookProvider;
