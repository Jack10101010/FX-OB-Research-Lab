/**
 * sessionConfig.js — Centralized session definitions for Session Lab.
 *
 * All session times are in UTC. The app currently operates in UTC.
 * Do NOT label times as EST in the UI.
 *
 * TODO (Phase 2): Replace static UTC cutoffs with user-configurable session
 * definitions and a timezone-aware DST conversion system. The config shape
 * should support:
 *   {
 *     key: string,
 *     label: string,
 *     marketTimezone: string,       // e.g. "America/New_York"
 *     startLocal: "HH:MM",          // local time in marketTimezone
 *     endLocal: "HH:MM",
 *     colorRole: string,
 *   }
 * This would allow the system to compute UTC equivalents with DST awareness
 * at runtime using the Intl API or a library like date-fns-tz.
 *
 * Until then, the static UTC offsets below are the source of truth for
 * session boundaries in all session-lab analytics. Backend-tagged fillSession
 * should always take precedence over runtime derivation from timestamps.
 */

export const SESSION_TIMEZONE = "UTC";

/**
 * Canonical session definitions.
 * startUtc / endUtc are 24h "HH:MM" strings.
 * "Outside" wraps midnight: startUtc "20:00" endUtc "00:00" (exclusive end).
 * colorRole maps to a CSS variable via SESSION_COLOR_ROLES below.
 */
export const SESSION_DEFINITIONS = [
    {
        key: "Asia",
        label: "Asia",
        startUtc: "00:00",
        endUtc: "07:00",
        colorRole: "purple",
    },
    {
        key: "London",
        label: "London",
        startUtc: "07:00",
        endUtc: "10:00",
        colorRole: "green",
    },
    {
        key: "London Lull",
        label: "London Lull",
        startUtc: "10:00",
        endUtc: "13:00",
        colorRole: "yellow",
    },
    {
        key: "New York",
        label: "New York",
        startUtc: "13:00",
        endUtc: "17:00",
        colorRole: "blue",
    },
    {
        key: "NY PM",
        label: "NY PM",
        startUtc: "17:00",
        endUtc: "20:00",
        colorRole: "violet",
    },
    {
        key: "Outside",
        label: "Outside",
        startUtc: "20:00",
        endUtc: "00:00",
        colorRole: "muted",
    },
    {
        key: "Unknown",
        label: "Unknown",
        startUtc: "",
        endUtc: "",
        colorRole: "muted",
    },
];

/** All valid session keys in display order. */
export const SESSION_KEYS = SESSION_DEFINITIONS.map((s) => s.key);

/**
 * Map colorRole → Tailwind/CSS classes for session accent color.
 * Consumers should use these classes rather than hardcoding colors.
 */
export const SESSION_COLOR_ROLES = {
    purple: "text-[hsl(270,80%,70%)]",
    green:  "text-[hsl(var(--success))]",
    yellow: "text-[hsl(var(--warning))]",
    blue:   "text-[hsl(var(--accent-primary))]",
    violet: "text-[hsl(270,60%,65%)]",
    muted:  "text-muted-lab",
};

/**
 * Returns a session definition by key.
 * @param {string} key
 * @returns {object|undefined}
 */
export function getSessionDef(key) {
    return SESSION_DEFINITIONS.find((s) => s.key === key);
}

/**
 * Returns the UTC time range string for a given session key.
 * Format: "07:00–10:00 UTC"
 * Returns empty string for Unknown or sessions with no defined range.
 *
 * @param {string} sessionKey
 * @returns {string}
 */
export function formatSessionTimeRange(sessionKey) {
    const def = getSessionDef(sessionKey);
    if (!def || !def.startUtc || !def.endUtc) return "";
    return `${def.startUtc}–${def.endUtc} UTC`;
}

/**
 * Derives a session key from a UTC timestamp by matching against
 * SESSION_DEFINITIONS boundaries.
 *
 * NOTE: This is a UTC-only fallback for old/incomplete data.
 * Prefer trade.fillSession / trade.fill_session / trade.session.
 * NY PM (17:00–20:00 UTC) is handled correctly here via SESSION_DEFINITIONS.
 * "Outside" wraps midnight (20:00–00:00 UTC).
 *
 * TODO (Phase 2): replace with timezone-aware DST conversion once
 * user-configurable session times are supported.
 *
 * @param {string|number|null} timestamp
 * @returns {string} session key
 */
export function resolveSessionFromTimestamp(timestamp) {
    if (!timestamp) return "Unknown";
    const d = new Date(
        typeof timestamp === "number"
            // Treat as unix seconds if < 1e10, else milliseconds
            ? (timestamp < 1e10 ? timestamp * 1000 : timestamp)
            : timestamp
    );
    if (!isFinite(d.getTime())) return "Unknown";

    const h = d.getUTCHours() + d.getUTCMinutes() / 60;

    for (const def of SESSION_DEFINITIONS) {
        if (!def.startUtc || !def.endUtc) continue;
        const [sh, sm] = def.startUtc.split(":").map(Number);
        const [eh, em] = def.endUtc.split(":").map(Number);
        const start = sh + sm / 60;
        const end = eh + em / 60;

        if (def.key === "Outside") {
            // Wraps midnight: 20:00–00:00 UTC
            if (h >= start || h < end) return "Outside";
        } else if (h >= start && h < end) {
            return def.key;
        }
    }

    return "Unknown";
}
