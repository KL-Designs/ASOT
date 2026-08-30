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
 * Editing one archive item.
 *
 * Reassigning an operation is not a metadata change — it moves the file on
 * disk, because the folder a file sits in is what a human reads when they open
 * a downloaded backup, and the two must never disagree. That is why this
 * route calls relocateMedia rather than just writing the fields.
 *
 * Editing a legacy item also renames its file to carry its media id, which is
 * how the archive converts to the id-carrying scheme gradually: no mass rename
 * of 4,781 files, and every file a human has touched gains the property that
 * makes moving it by hand safe. relocateMedia does that as a side effect of
 * building the new name.
 *
 * An item with no bytes — an embed, or a record whose transcode failed — has
 * no file to move, and relocateMedia returns early for it. Reassigning one
 * used to write `operationId` and nothing else, leaving `year`, `operation`,
 * `opLabel` and `takenAt` naming the operation it was moved AWAY from: the
 * public facet rail groups on `operation`, so the item stayed under its old
 * operation forever, and reconcile could not see it (rule 4 only inspects
 * documents whose storageKey starts with content:/legacy:, which an embed
 * never has). Those items get their facets from operationFacets() instead,
 * in the same write that sets the id.
 */

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

function managerName(me: { guild?: { displayName?: string | null } | null, globalName?: string | null, username: string }): string {
    return me.guild?.displayName || me.globalName || me.username
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const _id = new ObjectId(id)

    const doc = await Db.galleryMedia.findOne({ _id })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { caption, tags, authorName, operationId, mission } = await request.json().catch(() => ({}))

    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}

    if (typeof caption === 'string') {
        const trimmed = caption.trim().slice(0, 500)
        if (trimmed) set.caption = trimmed; else unset.caption = ''
    }

    if (Array.isArray(tags)) {
        // Only slugs that exist in the vocabulary — a client sending an
        // arbitrary string would otherwise create a tag nobody can filter by.
        const known = await Db.galleryTags
            .find({ slug: { $in: tags.filter((t): t is string => typeof t === 'string') } }, { projection: { slug: 1 } })
            .toArray()
        set.tags = known.map(t => t.slug)
    }

    if (typeof authorName === 'string') {
        const trimmed = authorName.trim().slice(0, 120)
        if (trimmed) set.authorName = trimmed; else unset.authorName = ''
    }

    if (typeof mission === 'string') {
        const trimmed = mission.trim().slice(0, 60)
        if (trimmed) set.mission = trimmed; else unset.mission = ''
    }

    /* Whether this item's bytes are about to move decides who writes the four
       facets that hang off the operation. Exactly one producer either way,
       never both: relocateMedia re-derives year, operation, opLabel and
       takenAt from the operation record and the folder it resolves, so
       writing them here as well would give two producers of the same fields a
       chance to disagree — which is exactly the defect this feature spent
       three rounds closing. */
    const relocating = doc.source === 'upload' && !!doc.storageKey

    let moving = false
    if (operationId !== undefined) {
        // One validator for both branches, so "No such operation" means the
        // same thing whether or not the item has a file behind it.
        const facets = await operationFacets(
            { media: Db.galleryMedia, operations: Db.operations },
            operationId === null || operationId === 'unknown' ? 'unknown' : String(operationId),
        )
        if (!facets) return NextResponse.json({ error: 'No such operation' }, { status: 400 })

        if (relocating) {
            // Just the id. relocateMedia, below, writes the rest.
            if (facets.$set.operationId) set.operationId = facets.$set.operationId
            else unset.operationId = ''
        } else {
            // Nothing will relocate this item, so the facets are written here
            // — in the same update as the id, which is what stops the two
            // from ever being observed apart.
            Object.assign(set, facets.$set)
            Object.assign(unset, facets.$unset ?? {})
        }
        moving = true
    }

    if (!Object.keys(set).length && !Object.keys(unset).length) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }

    await Db.galleryMedia.updateOne({ _id }, {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    /* After the write, so relocateMedia reads the caption and author the
       reviewer just set and builds the filename from them. Also runs when only
       the caption changed: that changes the readable filename, and a name on
       disk that disagrees with the database is what reconcile then has to
       repair. */
    if (relocating) {
        try {
            await relocateMedia({ media: Db.galleryMedia, operations: Db.operations }, _id)
        } catch (err) {
            console.error('[gallery/admin] relocate failed for', id, err)
            /* Deliberately not "run a re-scan": a re-scan is curative for only
               one of the two windows this can fail in. If it threw AFTER the
               physical move, the bytes are at the new path and the document
               still names the old one — reconcile's rule 1 sees the key and
               the path disagree and repairs both the key and the facets. If it
               threw BEFORE the move, the file never went anywhere, the key
               still matches the path, rule 1 has nothing to re-derive, and the
               scan reports a clean archive while operationId and the facets
               stay split. Only re-applying the operation fixes that one, so
               the message names the action that works in both cases. */
            return NextResponse.json({
                error: 'The details were saved, but the file could not be moved, so the operation details on this item may not match the folder its file is in. Set the operation again; if it keeps failing, run a gallery re-scan from the Health view.',
            }, { status: 500 })
        }
    }

    await logAction({
        action: 'gallery.media.edit',
        category: 'gallery',
        performedBy: me.id,
        performedByName: managerName(me),
        department: 'j5',
        entityType: 'gallery_media',
        entityId: id,
        actionUrl: '/dashboard/j5',
        target: doc.caption || doc.opLabel || undefined,
        details: { moved: moving },
    })

    const updated = await Db.galleryMedia.findOne({ _id })
    return NextResponse.json({ success: true, storageKey: updated?.storageKey ?? null })
}

/** Delete the record and its bytes. The only removal path — see spec §3, N1. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const _id = new ObjectId(id)

    const doc = await Db.galleryMedia.findOne({ _id })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    /* The record goes first, then the bytes. If the unlink fails the item is
       already gone from the gallery and an orphaned file remains, which the
       Health view reports and a human can clear. The reverse — bytes deleted,
       record surviving — is a permanently broken tile. */
    await Db.galleryMedia.deleteOne({ _id })

    for (const key of [doc.storageKey, doc.posterKey]) {
        if (!key) continue
        const file = resolveStorageKey(key)
        if (file) { try { unlinkSync(file) } catch { /* already gone */ } }
    }

    await Db.galleryVotes.deleteMany({ mediaId: _id })

    await logAction({
        action: 'gallery.media.delete',
        category: 'gallery',
        performedBy: me.id,
        performedByName: managerName(me),
        department: 'j5',
        entityType: 'gallery_media',
        entityId: id,
        actionUrl: '/dashboard/j5',
        target: doc.caption || doc.opLabel || undefined,
    })

    return NextResponse.json({ success: true })
}
