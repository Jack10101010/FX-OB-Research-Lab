import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export const THEMES = [
    { id: "violet",   name: "Cyberpunk Violet",   swatch: ["#d946ef", "#22d3ee"] },
    { id: "emerald",  name: "Matrix Emerald",      swatch: ["#10f08a", "#34e3c1"] },
    { id: "amber",    name: "Tactical Amber",      swatch: ["#ffb627", "#ff7a33"] },
    { id: "ice",      name: "Ice Blue",            swatch: ["#38bdf8", "#7dd3fc"] },
    { id: "blood",    name: "Blood Red",           swatch: ["#f43f5e", "#e11d48"] },
    { id: "terminal", name: "Research Terminal",   swatch: ["#3db8c4", "#5a8fbe"] },
];

const ThemeContext = createContext({ theme: "violet", setTheme: () => {} });

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        try { return localStorage.getItem("fxob_theme") || "violet"; } catch { return "violet"; }
    });

    const setTheme = useCallback((id) => {
        setThemeState(id);
        try { localStorage.setItem("fxob_theme", id); } catch (_) { /* noop */ }
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
