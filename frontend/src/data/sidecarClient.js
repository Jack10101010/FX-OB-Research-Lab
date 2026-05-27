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

export function startSidecarRun(config, baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar("/runs", {
        method: "POST",
        body: JSON.stringify({ config }),
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

export function getLatestSidecarOutputs(baseUrl = DEFAULT_SIDECAR_URL) {
    return requestSidecar("/outputs/latest", {}, baseUrl);
}

export { DEFAULT_SIDECAR_URL };
