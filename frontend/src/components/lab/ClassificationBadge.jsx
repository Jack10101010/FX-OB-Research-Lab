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
 *   <ClassificationBadge tags={["aae", "ob_not_occupied"]} />
 *
 * "clean" renders nothing — it is the absence of context, not a visible tag.
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

    // Filter "clean" — it is the default/empty state and is not rendered.
    const visible = tagList.filter((t) => t && t !== "clean");

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
