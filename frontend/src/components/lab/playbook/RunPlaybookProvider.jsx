/**
 * RunPlaybookProvider — open-state + dock-mode for the Run Analysis Playbook
 * (RUN-ANALYSIS-PLAYBOOK Phase 2A).
 *
 * Deliberately INDEPENDENT of Master Controls: its own context + its own state,
 * no shared store, no Preview-Lens coupling. Mounted in AppShell so the trigger
 * (TopBar), the drawer, and the layout (content-shift when docked) can all read it.
 *
 * `docked` (persisted): when true the panel is NON-MODAL and docked to the right —
 * the page stays fully interactive and the main content shifts to make room. When
 * false it renders as a modal overlay (focus mode). Default = docked.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const LS_DOCKED = "fxob_playbook_docked_v1";

function loadDocked() {
    try { return localStorage.getItem(LS_DOCKED) !== "false"; } catch { return true; }
}
function persistDocked(v) {
    try { localStorage.setItem(LS_DOCKED, String(Boolean(v))); } catch { /* best-effort */ }
}

const RunPlaybookContext = createContext({
    isOpen: false,
    open: () => {},
    close: () => {},
    toggle: () => {},
    setOpen: () => {},
    docked: true,
    setDocked: () => {},
    toggleDock: () => {},
});

export function RunPlaybookProvider({ children }) {
    const [isOpen, setIsOpen] = useState(false);
    const [docked, setDockedState] = useState(loadDocked);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((v) => !v), []);
    const setOpen = useCallback((v) => setIsOpen(Boolean(v)), []);

    const setDocked = useCallback((v) => {
        const b = Boolean(v);
        setDockedState(b);
        persistDocked(b);
    }, []);
    const toggleDock = useCallback(() => setDockedState((prev) => {
        const next = !prev;
        persistDocked(next);
        return next;
    }), []);

    const value = useMemo(
        () => ({ isOpen, open, close, toggle, setOpen, docked, setDocked, toggleDock }),
        [isOpen, open, close, toggle, setOpen, docked, setDocked, toggleDock],
    );
    return <RunPlaybookContext.Provider value={value}>{children}</RunPlaybookContext.Provider>;
}

export function useRunPlaybook() {
    return useContext(RunPlaybookContext);
}

export default RunPlaybookProvider;
