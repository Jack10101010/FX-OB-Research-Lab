// Reactive dataset store — defaults come from mock.js, can be replaced at runtime
// by the file importer (Settings page). Subscribers re-render via useDataset().

import { useEffect, useState } from "react";
import * as defaults from "./mock";

// Snapshot of current dataset (mutable singleton).
let state = { ...defaults };

const listeners = new Set();

export function getDataset() {
    return state;
}

export function setDataset(patch) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}

export function resetDataset() {
    state = { ...defaults };
    listeners.forEach((l) => l());
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Hook — components rerender on dataset changes.
export function useDataset() {
    const [, force] = useState(0);
    useEffect(() => subscribe(() => force((n) => n + 1)), []);
    return state;
}
