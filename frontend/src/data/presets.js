// Strategy Builder config presets — localStorage-backed (key: fxob_configs).
//
// DURABLE MIRROR (STORAGE Phase 1): localStorage stays the instant cache; the
// presets map is mirrored to backend/data/configs.json and union-merged on boot
// (by preset name; the newer `_savedAt` wins a conflict). Backend optional.
import { useCallback, useEffect, useState } from "react";
import { makeDomainBackend } from "./backendDomainSync";

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
    try {
        localStorage.setItem(KEY, JSON.stringify(map));
        try { configsBackend.scheduleSync(); } catch { /* backend optional */ }
    } catch { /* noop */ }
}

// Merge rule: union by preset name; on a name conflict the newer `_savedAt` wins.
export function mergeConfigs(local, remote) {
    const safe = (o) => (o && typeof o === "object") ? o : {};
    const l = safe(local), r = safe(remote);
    const out = {};
    for (const name of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const lc = l[name], rc = r[name];
        if (!lc) { out[name] = rc; continue; }
        if (!rc) { out[name] = lc; continue; }
        const lt = Date.parse(lc._savedAt || "") || 0;
        const rt = Date.parse(rc._savedAt || "") || 0;
        out[name] = rt > lt ? rc : lc;
    }
    return out;
}

const configsBackend = makeDomainBackend({
    domain: "configs",
    loadLocal: readAll,
    saveLocal: writeAll,
    merge: mergeConfigs,
});
configsBackend.kickoff();

export function usePresets() {
    const [presets, setPresets] = useState(() => readAll());

    const refresh = useCallback(() => setPresets(readAll()), []);

    useEffect(() => {
        const onStorage = (e) => { if (e.key === KEY) refresh(); };
        window.addEventListener("storage", onStorage);
        // Also refresh when the durable backend hydrates new presets in.
        const unsub = configsBackend.subscribe(refresh);
        return () => { window.removeEventListener("storage", onStorage); unsub(); };
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
