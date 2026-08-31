import { ObjectId } from 'mongodb'

import { splitOperation } from './naming'
import { resolveOperationFolder, type RelocateDeps } from './relocate'

/**
 * The fields an operation choice decides — and the one place that decides
 * them for anything without bytes.
 *
 * `year`, `campaign`, `operation`, `opLabel`, `mission` and `takenAt` all hang
 * off `operationId`, and
 * every one of them is read by the public gallery: the facet rail groups tiles
 * on `operation`, displays `opLabel`, and the year rail and sort read `year`
 * and `takenAt`. Four writers deriving them independently is what put one
 * operation into that rail twice under two spellings, so there are now exactly
 * two:
 *
 *   - an UPLOAD is decided by `relocateMedia` (lib/gallery/relocate.ts), which
 *     has to write them anyway because it is the thing that moves the file
 *     into `content/{year}/{operation}/` and the folder must agree with the
 *     document;
 *   - anything with no bytes — an embed, or a record whose transcode failed —
 *     is decided here, because `relocateMedia` returns early for a document
 *     with no `storageKey` and would leave the facets naming the old
 *     operation while `operationId` named the new one.
 *
 * Nothing may write these four fields on both paths. A caller that has just
 * relocated must not also apply this, and a caller that applies this must not
 * relocate.
 *
 * `operation`/`opLabel`/`year` go through `resolveOperationFolder()` — the
 * same resolver `relocateMedia` uses — rather than reading `op.title` and a
 * local year straight off the operation document. That is what makes the two
 * producers agree: a member submitting a photo and a YouTube link from the
 * same operation used to end up with the photo tagged
 * `operation: "4. Op Silent Ridge"` (once accepted) and the video permanently
 * stuck at `operation: "OPERATION Silent Ridge — Sat"` — one operation
 * rendered as two entries in the public facet rail, and the video's half never
 * healed.
 *
 * `resolveOperationFolder` only reads the existing folder listing — it creates
 * nothing on disk, so calling it before any file exists is safe. Its proposed
 * name for a brand new operation (no folder yet) is therefore a guess, not a
 * reservation: if some other operation's upload gets accepted first and claims
 * that same "next" number within the year, an upload from THIS operation would
 * compute a different number when it is later actually relocated, and an
 * already-accepted embed's guess would end up one folder number ahead of the
 * real one. That residual race is inherent to guessing before any folder
 * exists; it is far narrower than the near-certain mismatch this replaces.
 * Nothing surfaces it: reconcile walks FILES and rule 4 needs a `content:`
 * storageKey, which an embed never has at all, so the reconcile pass is
 * structurally blind to it. The J5 Media tab's bulk reassign is the remedy, by
 * hand — and it applies this same function, so the remedy now actually moves
 * an embed rather than only its `operationId`.
 *
 * `deps` is passed in rather than defaulted to the real collections so this
 * module never imports `@/lib/mongo`: a test can exercise it against a
 * throwaway `contentDir` without a mock, and without connecting to anything.
 */

/** The subset of GalleryMedia an operation choice fills in. Declared
 *  explicitly — rather than left for TypeScript to infer from the return
 *  statements below — so `takenAt` has one real type (`Date | null`) that a
 *  caller can read directly. Without this, the inferred type is a union and
 *  reading `.takenAt` off it needs an unchecked cast that would silently stop
 *  catching a typo'd field name. */
export type OperationFacetValues = {
    operationId?: ObjectId
    campaign?: string
    operation?: string
    opLabel?: string
    year?: string
    /**
     * The day folder — `Saturday`/`Sunday` — and ONLY ever that.
     *
     * Set when the operation has a `daySlot`, and otherwise left completely
     * alone: absent from `$set` and absent from `$unset` both. That asymmetry
     * with relocateMedia (which does unset it) is deliberate, and it is the one
     * place these two producers are allowed to differ.
     *
     * relocateMedia has the media document in front of it, so it can tell a
     * legacy archive item's mission folder ("I", "II") from a stale day and
     * preserve the former. This function is given an operation id and nothing
     * else, so an unconditional unset here would be a blind one — and the
     * caller that would fire it is the missing-bytes fallback in
     * app/api/gallery/admin/media/[id]/route.ts, whose item is exactly a
     * migrated archive item whose folder-derived mission IS its provenance.
     * Erasing it there is the defect that route's own `relocating` comment
     * describes at length.
     */
    mission?: string
    takenAt: Date | null
}

/** Mongo's update shape, ready to merge into a larger `$set`/`$unset`. The
 *  same four field names appear in both halves because "no year" is an absent
 *  key rather than `''` — two producers disagreeing on how to spell "no year"
 *  would make every reader guess which it might see. */
export type OperationFacetUpdate = {
    $set: OperationFacetValues
    $unset?: Partial<Record<'operationId' | 'campaign' | 'operation' | 'opLabel' | 'year', ''>>
}

/**
 * Resolve an operation choice into the update that writes all four facets.
 *
 * `null` or `'unknown'` clears every one of them and nulls `takenAt`, which is
 * what makes an undated item sort into its own group rather than lying about a
 * date. `takenAt` is always written, never left alone: a stale date from a
 * previous operation surviving a reassignment would keep the gallery sorting
 * and grouping the tile on it.
 *
 * Returns `null` — and writes nothing — when the id is malformed or names no
 * operation, so a caller can answer "No such operation" rather than silently
 * clearing the item's operation.
 */
export async function operationFacets(
    deps: RelocateDeps,
    operationId: string | null,
): Promise<OperationFacetUpdate | null> {
    if (!operationId || operationId === 'unknown') {
        // `campaign` joins the clear list for the same reason the other three
        // are on it: an item with no operation has no folder, and a document
        // still naming a campaign would sit in a rail row with nothing behind
        // it. `mission` deliberately does not — see OperationFacetValues.
        return { $unset: { operationId: '', campaign: '', operation: '', opLabel: '', year: '' }, $set: { takenAt: null } }
    }
    if (!ObjectId.isValid(operationId)) return null

    const opObjectId = new ObjectId(operationId)
    const op = await deps.operations.findOne({ _id: opObjectId }, { projection: { title: 1, date: 1 } })
    if (!op) return null

    const { year, campaign, operation, mission } = await resolveOperationFolder(deps, opObjectId)
    const set: OperationFacetValues = {
        operationId: op._id,
        takenAt: op.date ? new Date(op.date) : null,
    }
    const unset: Partial<Record<'operationId' | 'campaign' | 'operation' | 'opLabel' | 'year', ''>> = {}

    /* The campaign folder, on the same absent-never-empty-string terms as
       `operation` below. An embed reassigned from a campaign mission to a
       standalone operation has to LOSE this, not merely stop having it
       rewritten — the rail filters on the field, and reconcile is structurally
       blind to an embed (rule 4 needs a `content:` storageKey, which one never
       has), so nothing else would ever notice. */
    if (campaign) set.campaign = campaign
    else unset.campaign = ''

    // Set only, never unset — see OperationFacetValues.mission for why this
    // one field is allowed to differ from relocateMedia.
    if (mission) set.mission = mission

    /* Absent, never `''`. `operation ?? ''` kept a non-nullish empty string,
       which resolveOperationFolder returns for an operation document with an
       empty title and no date — and `operation: ''` is a real value to
       $group, so the facets tree grew a row with a blank label whose click
       filtered on the empty string and returned the whole year. Filed under
       the `unset` bucket instead, which is what "this operation has no folder
       name" actually means, and matches relocateMedia's own else-branch. */
    if (operation) {
        set.operation = operation
        set.opLabel = splitOperation(operation).label
    } else {
        unset.operation = ''
        unset.opLabel = ''
    }

    // An undated operation leaves `year` absent rather than `''` — matching
    // relocateMedia, which unsets it for the same document.
    if (year) set.year = year
    else unset.year = ''

    return Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set }
}
