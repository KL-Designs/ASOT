/**
 * Where a piece of gallery media is in its life, and where it may go next.
 *
 * The table is here rather than inline in the routes because more than one
 * place moves media between states — the queue, the review tab's accept, and
 * its reject — and a rule restated in more than one place is a rule that will
 * eventually disagree with itself.
 *
 * `live <-> hidden` is modelled below even though nothing exercises it yet: no
 * route or control to pull a published item back off the gallery has been
 * built. `hidden` is reachable in this state machine and nowhere else — taking
 * something down today means a database edit, not a click.
 */

export type GalleryStatus = 'processing' | 'pending' | 'live' | 'rejected' | 'hidden'

export const GALLERY_STATUSES: readonly GalleryStatus[] = ['processing', 'pending', 'live', 'rejected', 'hidden']

/**
 * `processing` reaches `pending` whether the transcode succeeded or not: a
 * failure carries a `processingError` into the review queue so somebody sees it
 * and can reject it, which is strictly better than an item that silently never
 * appears anywhere.
 *
 * `live` may never go back to `pending` or `processing`. The staging file is
 * deleted once processing finishes, so there is nothing left to re-process, and
 * a published item sitting in the review queue invites a reviewer to approve
 * something that is already public. `live` -> `hidden` is allowed for the
 * reason above — it costs nothing to leave modelled — but nothing in the app
 * currently drives it.
 *
 * `rejected` is terminal because rejection deletes the bytes.
 */
const TRANSITIONS: Record<GalleryStatus, readonly GalleryStatus[]> = {
    processing: ['pending'],
    pending: ['live', 'rejected'],
    live: ['hidden'],
    hidden: ['live'],
    rejected: [],
}

export function canTransition(from: GalleryStatus, to: GalleryStatus): boolean {
    if (from === to) return true
    return TRANSITIONS[from].includes(to)
}

export function isPublic(status: GalleryStatus): boolean {
    return status === 'live'
}
