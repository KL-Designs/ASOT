import { ObjectId } from 'mongodb'

import { splitOperation } from './naming'
import { resolveOperationFolder, type RelocateDeps } from './relocate'

/**
 * The four fields an operation choice decides — and the one place that decides
 * them for anything without bytes.
 *
 * `year`, `operation`, `opLabel` and `takenAt` all hang off `operationId`, and
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
    operation?: string
    opLabel?: string
    year?: string
    takenAt: Date | null
}

/** Mongo's update shape, ready to merge into a larger `$set`/`$unset`. The
 *  same four field names appear in both halves because "no year" is an absent
 *  key rather than `''` — two producers disagreeing on how to spell "no year"
 *  would make every reader guess which it might see. */
export type OperationFacetUpdate = {
    $set: OperationFacetValues
    $unset?: Partial<Record<'operationId' | 'operation' | 'opLabel' | 'year', ''>>
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
        return { $unset: { operationId: '', operation: '', opLabel: '', year: '' }, $set: { takenAt: null } }
    }
    if (!ObjectId.isValid(operationId)) return null

    const opObjectId = new ObjectId(operationId)
    const op = await deps.operations.findOne({ _id: opObjectId }, { projection: { title: 1, date: 1 } })
    if (!op) return null

    const { year, operation } = await resolveOperationFolder(deps, opObjectId)
    const set: OperationFacetValues = {
        operationId: op._id,
        operation: operation ?? '',
        opLabel: operation ? splitOperation(operation).label : '',
        takenAt: op.date ? new Date(op.date) : null,
    }

    // An undated operation leaves `year` absent rather than `''` — matching
    // relocateMedia, which unsets it for the same document.
    if (year) return { $set: { ...set, year } }
    return { $set: set, $unset: { year: '' } }
}
