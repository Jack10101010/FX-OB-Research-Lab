/**
 * ClassificationBadge.jsx
 *
 * Renders one or more classification dimension tags as Pill elements.
 * All metadata (tone, label) is sourced from classificationRegistry.js —
 * no hardcoded colors or strings in this component.
 *
 * Usage:
 *   <ClassificationBadge tag="aae" />
 *   <ClassificationBadge tag="te_d2" />
 *   <ClassificationBadge tags={["aae", "vacant_no_aae"]} />
 *
 * Tags flagged muteAsBadge in the registry (occupied_at_arm, unknown_at_arm, and
 * the legacy "clean" alias) render nothing — they are default states, not signals.
 *
 * Fallback: if a tag is not in the registry (future tags, unknown keys),
 * the component renders a muted pill with the raw tag string so nothing
 * breaks silently.
 */

import { Pill } from "@/components/lab/DataTable";
import { getTagMeta } from "@/data/classificationRegistry";

/**
 * @param {{ tag?: string, tags?: string[], className?: string }} props
 */
export function ClassificationBadge({ tag, tags, className }) {
    // Normalize to array, filtering out undefined/null.
    const tagList = tags ?? (tag != null ? [tag] : []);

    // Hide non-signal / default states via the registry muteAsBadge flag
    // (occupied_at_arm, unknown_at_arm, and the legacy "clean" alias). This is
    // the single source of truth for badge suppression — no hardcoded tag keys.
    const visible = tagList.filter((t) => t && !getTagMeta(t).muteAsBadge);

    if (visible.length === 0) return null;

    return (
        <>
            {visible.map((t) => {
                const meta = getTagMeta(t);
                return (
                    <Pill key={t} tone={meta.tone} className={className}>
                        {meta.label}
                    </Pill>
                );
            })}
        </>
    );
}
