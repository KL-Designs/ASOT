import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { operationFacets } from '@/lib/gallery/operation-facets'
import { relocateMedia } from '@/lib/gallery/relocate'
import { resolveStorageKey } from '@/lib/gallery/paths'

/**
 * One action over a selection.
 *
 * This is how the ~1,157 files the migration could not date get an operation:
 * a reviewer selects a folder's worth and moves them in one go.
 *
 * A move is applied one item at a time, sequentially. It renames files, and
 * running those concurrently against the same operation folder races on the
 * folder's creation and on the next-order-number scan — the two things that
 * mint a duplicate numbered folder, which is the split facet rail this whole
 * feature exists to stop. Sequential is not a performance choice that could be
 * revisited; it is the correctness property.
 *
 * MAX_IDS is 500, not the sixty a page of the Media tab shows: "select all in
 * this folder" is exactly how the ~1,157 undated files get an operation, and
 * capping at a page would make that job twenty passes. Sequential is still
 * acceptable at that size because each item is one indexed updateOne plus one
 * same-volume rename — milliseconds each, and no re-scan of the archive — but
 * 500 of them is no longer inside a default request budget, hence the
 * maxDuration below. Raising the cap further should come with a batch/progress
 * response rather than a longer timeout.
 *
 * Over the cap is REJECTED, not truncated. `.slice(0, MAX_IDS)` meant a
 * selection of 620 moved 500, answered `changed: 500, failed: []` — which the
 * panel reads as a clean run, so it cleared the whole selection — and left
 * 120 items untouched with nothing anywhere saying so. A 400 naming the cap
 * costs the reviewer one more pass and cannot lose anything.
 *
 * Partial success is reported rather than rolled back. There is no transaction
 * across a filesystem and a database, and a reviewer who moved sixty items of
 * which two failed is better served by being told which two than by having the
 * other fifty-eight silently reverted.
 */

const MAX_IDS = 500

/** 500 sequential moves, each a rename plus an update. The default budget is
 *  sized for a request that does neither. Matches submissions/route.ts, which
 *  raised it for the same kind of reason. */
export const maxDuration = 300

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

export async function POST(request: NextRequest) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const { action, operationId, tags, authorName } = body

    const given: string[] = (Array.isArray(body.ids) ? body.ids : [])
        .filter((v: unknown): v is string => typeof v === 'string' && ObjectId.isValid(v))

    if (!given.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })
    if (given.length > MAX_IDS) {
        // Named, not silently trimmed — see the module comment.
        return NextResponse.json({
            error: `Too many items: ${given.length} selected, ${MAX_IDS} is the most one bulk action can take. Narrow the selection and run it again.`,
        }, { status: 400 })
    }

    const ids: ObjectId[] = given.map(v => new ObjectId(v))

    const failed: { id: string, error: string }[] = []
    let changed = 0

    if (action === 'move') {
        let opId: ObjectId | null = null
        if (operationId && operationId !== 'unknown') {
            if (!ObjectId.isValid(String(operationId))) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
            const op = await Db.operations.findOne({ _id: new ObjectId(String(operationId)) }, { projection: { _id: 1 } })
            if (!op) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
            opId = op._id
        }

        // Sequential — see the module comment. Concurrent renames race on the
        // operation folder's creation and its next-order-number scan.
        for (const _id of ids) {
            try {
                const doc = await Db.galleryMedia.findOne({ _id }, { projection: { source: 1, storageKey: 1 } })
                if (!doc) {
                    failed.push({ id: _id.toString(), error: 'No such item' })
                    continue
                }

                if (doc.source === 'upload' && doc.storageKey) {
                    /* Bytes to move: the id is written here and relocateMedia
                       derives year, operation, opLabel and takenAt from the
                       folder it files them into. One producer — writing the
                       facets here as well is what let the two disagree. */
                    await Db.galleryMedia.updateOne({ _id }, opId
                        ? { $set: { operationId: opId } }
                        : { $unset: { operationId: '' } })
                    await relocateMedia({ media: Db.galleryMedia, operations: Db.operations }, _id)
                } else {
                    /* No bytes — an embed, or a record whose transcode failed.
                       relocateMedia returns null for it without doing
                       anything, so this loop used to write `operationId`,
                       count the item as changed, and leave year, operation,
                       opLabel and takenAt naming the operation it was moved
                       AWAY from. The public facet rail groups on `operation`,
                       so the item stayed filed under the old operation
                       forever, and nothing could find it: reconcile walks
                       FILES, and its rule 4 only inspects documents whose
                       storageKey starts with content:/legacy:, which an embed
                       never has. This route is the documented remedy for that
                       class of split, so it had to be the one thing that could
                       not cause it.

                       One update, both halves: the id and the facets are never
                       observable apart. Resolved per item rather than once
                       before the loop so an embed sees any folder an upload
                       earlier in this same selection has just created. */
                    const facets = await operationFacets(
                        { media: Db.galleryMedia, operations: Db.operations },
                        opId ? opId.toString() : 'unknown',
                    )
                    if (!facets) {
                        failed.push({ id: _id.toString(), error: 'No such operation' })
                        continue
                    }
                    await Db.galleryMedia.updateOne({ _id }, {
                        $set: facets.$set,
                        ...(facets.$unset ? { $unset: facets.$unset } : {}),
                    })
                }
                changed++
            } catch (err) {
                /* `changed` counts only items this loop actually wrote through
                   to the end. A failure here is not necessarily a no-op: the
                   upload branch writes `operationId` and then moves the file,
                   so an item that failed between the two carries the new
                   operation with the old folder facets. Saying so is the
                   difference between a reviewer re-applying the move and a
                   reviewer trusting a silently split record. */
                failed.push({
                    id: _id.toString(),
                    error: `${err instanceof Error ? err.message : 'Move failed'} — this item may have kept its old operation details; set its operation again from the Media tab.`,
                })
            }
        }
    } else if (action === 'addTags' || action === 'removeTags') {
        const known = await Db.galleryTags
            .find({ slug: { $in: (Array.isArray(tags) ? tags : []).filter((t: unknown): t is string => typeof t === 'string') } }, { projection: { slug: 1 } })
            .toArray()
        const slugs = known.map(t => t.slug)
        if (!slugs.length) return NextResponse.json({ error: 'No known tags given' }, { status: 400 })

        const result = await Db.galleryMedia.updateMany({ _id: { $in: ids } }, action === 'addTags'
            ? { $addToSet: { tags: { $each: slugs } } }
            : { $pullAll: { tags: slugs } })
        changed = result.modifiedCount
    } else if (action === 'setAuthor') {
        const name = String(authorName ?? '').trim().slice(0, 120)
        const result = name
            ? await Db.galleryMedia.updateMany({ _id: { $in: ids } }, { $set: { authorName: name } })
            : await Db.galleryMedia.updateMany({ _id: { $in: ids } }, { $unset: { authorName: '' } })
        changed = result.modifiedCount
    } else if (action === 'delete') {
        const docs = await Db.galleryMedia.find({ _id: { $in: ids } }).toArray()
        // Records first, then bytes — same reasoning as the single delete: an
        // orphaned file is reported by Health, a record with no bytes is a
        // permanently broken tile.
        await Db.galleryMedia.deleteMany({ _id: { $in: ids } })
        await Db.galleryVotes.deleteMany({ mediaId: { $in: ids } })

        for (const doc of docs) {
            for (const key of [doc.storageKey, doc.posterKey]) {
                if (!key) continue
                const file = resolveStorageKey(key)
                if (file) { try { unlinkSync(file) } catch { /* already gone */ } }
            }
        }
        changed = docs.length
    } else {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await logAction({
        action: `gallery.media.bulk.${action}`,
        category: 'gallery',
        performedBy: me.id,
        performedByName: me.guild?.displayName || me.globalName || me.username,
        department: 'j5',
        entityType: 'gallery_media',
        entityId: ids[0].toString(),
        actionUrl: '/dashboard/j5',
        details: { count: ids.length, changed, failed: failed.length },
    })

    return NextResponse.json({ success: true, changed, failed })
}
