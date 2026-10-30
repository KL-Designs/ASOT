/**
 * Turning a flat list of comments into a thread.
 *
 * Comments are stored flat with an optional `parentId`, and arrive sorted
 * oldest first. Rendering wants them in reading order — a comment, then its
 * replies, then theirs — each with how deep it sits. This does that walk once,
 * away from any component, so the ticket page and the orders page lay a thread
 * out identically and the rules below are tested rather than eyeballed.
 *
 * Imports nothing: client components pull it in.
 */

export interface Threadable {
    _id: string
    parentId?: string | null
}

export interface ThreadRow<T> {
    comment: T
    /** 0 for a top-level comment. Capped at `MAX_DEPTH`; see below. */
    depth: number
    /** How many comments sit beneath this one, at any depth. */
    descendants: number
}

/**
 * Past this a reply is drawn at the same indent as its parent.
 *
 * It is still *threaded* — it follows the comment it answers — it just stops
 * moving right. Every level costs indent, and a long exchange between two
 * people would otherwise end up a few words wide on a phone.
 */
export const MAX_DEPTH = 5

/**
 * Reading order, with depth.
 *
 * A reply whose parent is not in the list is treated as top-level rather than
 * dropped. That is the normal state for a member looking at a thread where
 * staff removed the comment being answered: the server does not send them the
 * deleted parent, and losing every reply under it would take other people's
 * words away because of somebody else's.
 *
 * `collapsed` holds the ids whose replies are folded away. The comment itself
 * still comes back — with its `descendants` count, which is what the "3
 * replies" label on a folded thread reads from.
 */
export function buildThread<T extends Threadable>(
    comments: readonly T[],
    collapsed: ReadonlySet<string> = new Set(),
): ThreadRow<T>[] {
    const ids = new Set(comments.map(c => c._id))
    const children = new Map<string, T[]>()
    const roots: T[] = []

    for (const c of comments) {
        // A comment naming itself as its parent would recurse forever.
        const parent = c.parentId && c.parentId !== c._id && ids.has(c.parentId) ? c.parentId : null
        if (parent) {
            const list = children.get(parent)
            if (list) list.push(c)
            else children.set(parent, [c])
        } else {
            roots.push(c)
        }
    }

    const rows: ThreadRow<T>[] = []
    // Guards the walk against a parent cycle (a → b → a) in stored data. Neither
    // comment in a cycle is reachable from a root, so they are appended at the
    // end instead of vanishing.
    const seen = new Set<string>()

    // `within` is the same cycle guard for the count: without it a → b → a
    // recurses until the stack runs out.
    const count = (id: string, within = new Set<string>([id])): number =>
        (children.get(id) ?? []).reduce((n, child) => {
            if (within.has(child._id)) return n
            within.add(child._id)
            return n + 1 + count(child._id, within)
        }, 0)

    const walk = (c: T, depth: number) => {
        if (seen.has(c._id)) return
        seen.add(c._id)
        rows.push({ comment: c, depth: Math.min(depth, MAX_DEPTH), descendants: count(c._id) })
        if (collapsed.has(c._id)) {
            // Folded: mark the whole subtree seen so it is not re-added below.
            const mark = (id: string) => { for (const k of children.get(id) ?? []) { if (!seen.has(k._id)) { seen.add(k._id); mark(k._id) } } }
            mark(c._id)
            return
        }
        for (const child of children.get(c._id) ?? []) walk(child, depth + 1)
    }

    for (const root of roots) walk(root, 0)
    for (const c of comments) if (!seen.has(c._id)) walk(c, 0)

    return rows
}
