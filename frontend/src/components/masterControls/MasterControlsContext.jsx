import React, { createContext, useContext, useState, useCallback } from "react";

const MasterControlsContext = createContext({
    isOpen: false,
    openMasterControls: () => {},
    closeMasterControls: () => {},
    toggleMasterControls: () => {},
});

export function MasterControlsProvider({ children }) {
    const [isOpen, setIsOpen] = useState(false);

    const openMasterControls  = useCallback(() => setIsOpen(true), []);
    const closeMasterControls = useCallback(() => setIsOpen(false), []);
    const toggleMasterControls = useCallback(() => setIsOpen((v) => !v), []);

    return (
        <MasterControlsContext.Provider value={{ isOpen, openMasterControls, closeMasterControls, toggleMasterControls }}>
            {children}
        </MasterControlsContext.Provider>
    );
}

export const useMasterControls = () => useContext(MasterControlsContext);
