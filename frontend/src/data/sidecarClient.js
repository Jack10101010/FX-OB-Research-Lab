const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8787";

async function requestSidecar(path, options = {}, baseUrl = DEFAULT_SIDECAR_URL) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { detail: text };
    }
    if (!response.ok) {
        const detail = typeof data?.detail === "object"
            ? (data.detail.error || JSON.stringify(data.detail))
            : (data?.detail || response.statusText || "Sidecar request failed");
        throw new Error(detail);
    }
    return data;
}

export function getSidecarHealth(baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar("/health", {}, baseUrl);
}

export function startSidecarRun(config, name = "", baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar("/runs", {
        method: "POST",
        body: JSON.stringify({ config, name: (name || "").trim() }),
    }, baseUrl);
}

// Set/update a run's human-friendly display name (before, during, or after a run).
export function renameSidecarRun(runId, name, baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar(`/runs/${encodeURIComponent(runId)}/name`, {
        method: "POST",
        body: JSON.stringify({ name: (name || "").trim() }),
    }, baseUrl);
}

export function listSidecarRuns(baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar("/runs", {}, baseUrl);
}

export function getSidecarRun(jobId, baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar(`/runs/${encodeURIComponent(jobId)}`, {}, baseUrl);
}

export function cancelSidecarRun(runId, baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar(`/cancel/${encodeURIComponent(runId)}`, { method: "POST" }, baseUrl);
}

export function getSidecarRunBundle(jobId, baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar(`/runs/${encodeURIComponent(jobId)}/bundle`, {}, baseUrl);
}

export function getRunBundleByRunId(runId, options = {}, baseUrl = DEFAULT_SIDECAR_URL) {
    const params = new URLSearchParams();
    if (options.includeCandles === true) params.set("include_candles", "true");
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return requestSidecar(`/runs/${encodeURIComponent(runId)}/bundle${suffix}`, {}, baseUrl);
}

// LARGE-RUN-IMPORT Phase 1 — compact manifest (no row data) for cube-scale runs.
export function getRunManifestByRunId(runId, baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar(`/runs/${encodeURIComponent(runId)}/manifest`, {}, baseUrl);
}

// LARGE-RUN-IMPORT Phase 1 — fetch ONE file's text from a run folder (lazy BE /
// variant loads). `name` must be a bare filename inside the run folder; the
// sidecar enforces path-traversal safety and an allow-list of extensions.
export function getRunFileByRunId(runId, name, baseUrl = DEFAULT_SIDECAR_URL) {
    const suffix = `?name=${encodeURIComponent(name)}`;
    return requestSidecar(`/runs/${encodeURIComponent(runId)}/file${suffix}`, {}, baseUrl);
}

export function getRunCandlesByRunId(runId, options = {}, baseUrl = DEFAULT_SIDECAR_URL) {
    const params = new URLSearchParams();
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);
    if (options.limit) params.set("limit", String(options.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return requestSidecar(`/runs/${encodeURIComponent(runId)}/candles${suffix}`, {}, baseUrl);
}

export function getLatestSidecarOutputs(baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar("/outputs/latest", {}, baseUrl);
}

export { DEFAULT_SIDECAR_URL };
