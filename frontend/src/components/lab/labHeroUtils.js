import { compactTimeframe, getRunDisplayName } from "@/data/store";

export function readFirst(...values) {
    return values.find((value) => value != null && value !== "" && value !== "—");
}

export function isMeaningful(value) {
    return value != null && value !== "" && value !== "—" && value !== "N/A";
}

function readNumber(...values) {
    const value = readFirst(...values);
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatNumber(value) {
    if (value == null || value === "") return "";
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : "";
}

function formatPercent(value) {
    const formatted = formatNumber(value);
    return formatted ? `${formatted}%` : "";
}

function formatPips(value) {
    const formatted = formatNumber(value);
    if (!formatted) return "";
    return `${formatted} ${Number(formatted) === 1 ? "pip" : "pips"}`;
}

function formatTicks(value) {
    const formatted = formatNumber(value);
    if (!formatted) return "";
    return `${formatted} ${Number(formatted) === 1 ? "tick" : "ticks"}`;
}

function formatStructureFilter(value) {
    const text = String(value || "both").toLowerCase();
    if (text === "bos") return "BOS";
    if (text === "choch") return "CHoCH";
    return "Both";
}

export function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v || "N/A";
}

export function readHeroDateRange(run, activeSummary) {
    const summary = run?.summary || {};
    const config = run?.config || {};
    const direct = run?.dateRange || summary.dateRange || summary.date_range || activeSummary?.dateRange;
    const from = readFirst(
        run?.dateFrom,
        summary.date_from,
        summary.dateFrom,
        config.date_from,
        config.dateFrom,
        config.start_date,
        config.startDate,
    );
    const to = readFirst(
        run?.dateTo,
        summary.date_to,
        summary.dateTo,
        config.date_to,
        config.dateTo,
        config.end_date,
        config.endDate,
    );
    if (from || to) return { from, to };
    return direct || null;
}

export function formatHeroDateRange(value) {
    if (!value) return "";
    if (typeof value === "object") {
        const from = formatHeroDate(value.from);
        const to = formatHeroDate(value.to);
        return from && to ? `${from} → ${to}` : from || to || "";
    }
    const parts = String(value).split("→").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
        const from = formatHeroDate(parts[0]);
        const to = formatHeroDate(parts[1]);
        return from && to ? `${from} → ${to}` : "";
    }
    return formatHeroDate(value);
}

export function formatHeroMonthSpan(value) {
    const range = normalizeHeroDateRange(value);
    if (!range?.from || !range?.to) return "";
    const start = parseHeroDateValue(range.from);
    const end = parseHeroDateValue(range.to);
    if (!start || !end || end <= start) return "";
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (days < 30) return "<1 month";
    const endMonthDays = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    const calendarMonths = ((end.getUTCFullYear() - start.getUTCFullYear()) * 12)
        + (end.getUTCMonth() - start.getUTCMonth())
        + ((end.getUTCDate() - start.getUTCDate()) / endMonthDays);
    const months = Math.max(1, Math.round(Number.isFinite(calendarMonths) ? calendarMonths : days / 30.44));
    return `${months} ${months === 1 ? "month" : "months"}`;
}

function normalizeHeroDateRange(value) {
    if (!value) return null;
    if (typeof value === "object") return { from: value.from, to: value.to };
    const parts = String(value).split("→").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return { from: parts[0], to: parts[1] };
    return null;
}

function parseHeroDateValue(value) {
    if (!value || value === "?") return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
        return Number.isFinite(date.getTime()) ? date : null;
    }
    const short = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2}|\d{4})$/);
    if (short) {
        const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            .indexOf(short[2].slice(0, 3).toLowerCase());
        const year = Number(short[3].length === 2 ? `20${short[3]}` : short[3]);
        if (month >= 0) {
            const date = new Date(Date.UTC(year, month, Number(short[1])));
            return Number.isFinite(date.getTime()) ? date : null;
        }
    }
    return null;
}

function formatHeroDate(value) {
    if (!value || value === "?") return "";
    const text = String(value).trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return text;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!Number.isFinite(date.getTime())) return text;
    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
    });
}

/** Assemble canonical Protection / OB / News hero copy from run context. */
export function buildLabHeroContent({
    activeProject,
    activeRun,
    activeSummary,
    activeRunId,
    tradeCount,
    variant,
    includeVariant = true,
    titleFallback = "Lab",
}) {
    const run = activeRun || activeSummary || {};
    const hasRun = !!(activeRun || activeSummary || activeRunId);
    const projectName = activeProject?.name || "";
    const projectId = activeProject?.id || null;
    const runName = activeRun
        ? getRunDisplayName(activeRun)
        : run?.name || run?.displayName || run?.id || activeRunId || "";
    const title = projectName || runName || titleFallback;
    const symbol = readFirst(run?.symbol, run?.summary?.symbol, run?.config?.symbol, activeSummary?.symbol);
    const detectionTf = compactTimeframe(readFirst(
        run?.detectionTf,
        run?.summary?.detectionTf,
        run?.summary?.detection_tf,
        run?.config?.detection_timeframe,
        run?.config?.detection_tf,
        run?.config?.detectionTf,
        activeSummary?.detectionTf,
    ));
    const executionTf = compactTimeframe(readFirst(
        run?.executionTf,
        run?.summary?.executionTf,
        run?.summary?.execution_tf,
        run?.config?.execution_timeframe,
        run?.config?.execution_tf,
        run?.config?.executionTf,
        activeSummary?.executionTf,
    ));
    const rr = readFirst(
        run?.rr,
        run?.summary?.rr,
        run?.config?.rr_multiple,
        run?.config?.rrMultiple,
        activeSummary?.rr,
    );
    const entryDepthPct = readNumber(run?.config?.ob_entry_depth_pct, run?.config?.obEntryDepthPct, run?.obEntryDepthPct);
    const entryBufferPips = readNumber(run?.config?.entry_buffer_pips, run?.config?.entry_buffer, run?.config?.entryBuffer, run?.entryBuffer);
    const stopBufferPips = readNumber(run?.config?.stop_buffer_pips, run?.config?.stop_buffer, run?.config?.stopBuffer, run?.stopBuffer);
    const verifyLimitTicks = readNumber(run?.config?.verify_limit_ticks, run?.config?.verify_ticks, run?.config?.verifyTicks, run?.verifyTicks);
    const structureFilter = readFirst(run?.config?.structure_filter, run?.config?.structureFilter, run?.config?.structure_type, run?.structureFilter);
    const heroDateRange = readHeroDateRange(run, activeSummary);
    const dateRange = formatHeroDateRange(heroDateRange);
    const monthSpan = formatHeroMonthSpan(heroDateRange);
    const dateRangeLine = dateRange && monthSpan ? `${dateRange} • ${monthSpan}` : dateRange;
    const runLine = hasRun
        ? [`Run: ${runName || "Active run"}`, symbol, detectionTf, `${tradeCount} trades`].filter(isMeaningful).join(" · ")
        : "No active run selected. Import or run a backtest to populate this page.";
    const configParts = [
        symbol,
        detectionTf,
        executionTf && executionTf !== detectionTf ? `Exec ${executionTf}` : null,
        rr != null && rr !== "" ? `RR ${rr}` : null,
        structureFilter ? `Structure ${formatStructureFilter(structureFilter)}` : null,
        entryDepthPct != null ? `Entry Depth ${formatPercent(entryDepthPct)}` : null,
        entryBufferPips != null ? `Entry Buffer ${formatPips(entryBufferPips)}` : null,
        stopBufferPips != null ? `Stop Buffer ${formatPips(stopBufferPips)}` : null,
        verifyLimitTicks != null ? `Verify ${formatTicks(verifyLimitTicks)}` : null,
    ];
    if (includeVariant && variant !== undefined) {
        configParts.push(variantLabel(variant));
    }
    const configLine = configParts.filter(isMeaningful).join(" · ");

    return {
        title,
        runLine,
        configLine,
        dateRangeLine,
        projectId,
        hasRun,
    };
}
