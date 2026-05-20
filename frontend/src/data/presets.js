// Strategy Builder config presets — localStorage-backed (key: fxob_configs)
import { useCallback, useEffect, useState } from "react";

const KEY = "fxob_configs";

function readAll() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

function writeAll(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* noop */ }
}

export function usePresets() {
    const [presets, setPresets] = useState(() => readAll());

    const refresh = useCallback(() => setPresets(readAll()), []);

    useEffect(() => {
        const onStorage = (e) => { if (e.key === KEY) refresh(); };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [refresh]);

    const save = useCallback((name, cfg) => {
        const all = readAll();
        all[name] = { ...cfg, _savedAt: new Date().toISOString() };
        writeAll(all);
        setPresets(all);
    }, []);

    const remove = useCallback((name) => {
        const all = readAll();
        delete all[name];
        writeAll(all);
        setPresets(all);
    }, []);

    const duplicate = useCallback((name) => {
        const all = readAll();
        if (!all[name]) return;
        let i = 2;
        let newName = `${name} (copy)`;
        while (all[newName]) { newName = `${name} (copy ${i++})`; }
        all[newName] = { ...all[name], _savedAt: new Date().toISOString() };
        writeAll(all);
        setPresets(all);
        return newName;
    }, []);

    const load = useCallback((name) => readAll()[name] || null, []);

    return { presets, save, remove, duplicate, load, names: Object.keys(presets).sort() };
}
