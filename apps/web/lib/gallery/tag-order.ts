/**
 * What a drag in the tag vocabulary editor actually writes.
 *
 * A module rather than a closure inside GalleryTagsTab.onDragEnd, for the
 * same reason lib/gallery/reorder.ts exists: this is the one piece of the
 * feature that decides which documents get a PATCH, and logic that lives
 * inside a component cannot be imported by a test. The component is left
 * with the parts only a component can do — optimistic state and the fetch
 * fan-out.
 *
 * Two rules the inline version did not have:
 *
 *  1. Retired tags are renumbered too, straight after the active ones.
 *     POST assigns a new tag `order = countDocuments()`, which counts
 *     retired tags, so retired `order` values routinely sit *inside* the
 *     active range. Renormalising only the active list therefore leaves
 *     collisions behind: restore a retired tag carrying `order: 3` into a
 *     list already renumbered 0-5 and two documents claim 3.
 *  2. Ties break on `_id`, the rule library-query.ts states for every sort
 *     in this feature. Mongo's order between equal sort keys is
 *     unspecified, so a collision that does exist — in a database written
 *     before this shipped — must at least be resolved the same way by the
 *     server's `.sort({ order: 1, _id: 1 })` and by this client-side sort,
 *     or the tab and the public facet rail show the pair in different
 *     orders.
 */

/** The minimum this needs to know about a tag. The tab's own row type
 *  carries label, slug and count as well; the generic below preserves them. */
export type OrderableTag = {
    id: string
    order: number
    retired: boolean
}

export type TagReorderPlan<T extends OrderableTag> = {
    /** Every tag, with its new `order` — the optimistic state to render. */
    tags: T[]
    /** Only the tags whose `order` actually changed. Anything else would be
     *  a PATCH that writes the value already stored. */
    writes: { id: string, order: number }[]
}

/** `order` first, `_id` second — see rule 2 above. */
export function byTagOrder(a: OrderableTag, b: OrderableTag): number {
    if (a.order !== b.order) return a.order - b.order
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Move `draggedId` to `overId`'s position among the active tags and
 * renumber the whole vocabulary to 0..n-1.
 *
 * Returns null when the drag is a no-op or names a tag that is not in the
 * active list — a dropped-on-itself gesture, or a stale row id from a list
 * that has since refreshed. Null means "write nothing", not "write an empty
 * plan": the caller must leave its state alone.
 *
 * Renumbering the full sequence rather than swapping two endpoints is what
 * makes a multi-position drag correct; the arrow buttons' single-step swap
 * cannot express one.
 */
export function planTagReorder<T extends OrderableTag>(
    tags: T[],
    draggedId: string,
    overId: string,
): TagReorderPlan<T> | null {
    if (draggedId === overId) return null

    const active = tags.filter(t => !t.retired).sort(byTagOrder)
    const retired = tags.filter(t => t.retired).sort(byTagOrder)

    const from = active.findIndex(t => t.id === draggedId)
    const to = active.findIndex(t => t.id === overId)
    if (from < 0 || to < 0) return null

    const moved = active.slice()
    const [lifted] = moved.splice(from, 1)
    moved.splice(to, 0, lifted)

    const writes: { id: string, order: number }[] = []
    const next = [...moved, ...retired].map((tag, index) => {
        if (tag.order === index) return tag
        writes.push({ id: tag.id, order: index })
        return { ...tag, order: index }
    })

    return { tags: next, writes }
}
