import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
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
 * folder's creation and on the next-order-number scan. A selection is at most
 * a page of sixty, so sequential is fast enough and correct.
 *
 * Partial success is reported rather than rolled back. There is no transaction
 * across a filesystem and a database, and a reviewer who moved sixty items of
 * which two failed is better served by being told which two than by having the
 * other fifty-eight silently reverted.
 */

const MAX_IDS = 500

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

    const ids: ObjectId[] = (Array.isArray(body.ids) ? body.ids : [])
        .filter((v: unknown): v is string => typeof v === 'string' && ObjectId.isValid(v))
        .slice(0, MAX_IDS)
        .map((v: string) => new ObjectId(v))

    if (!ids.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })

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
                await Db.galleryMedia.updateOne({ _id }, opId
                    ? { $set: { operationId: opId } }
                    : { $unset: { operationId: '' } })
                await relocateMedia({ media: Db.galleryMedia, operations: Db.operations }, _id)
                changed++
            } catch (err) {
                failed.push({ id: _id.toString(), error: err instanceof Error ? err.message : 'Move failed' })
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
