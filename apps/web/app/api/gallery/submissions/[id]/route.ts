import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotification } from '@/lib/notifications'
import { canTransition } from '@/lib/gallery/status'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { fetchEmbedPoster } from '@/lib/gallery/poster'
import { splitOperation } from '@/lib/gallery/naming'

/**
 * What a reviewer can do to one submission.
 *
 * PATCH corrects it, POST publishes it, DELETE rejects it. Editing and
 * accepting are separate verbs on purpose: a reviewer fixing a mis-tagged
 * operation on six of a member's twelve clips should not have to publish each
 * one the moment they touch it.
 */

async function reviewer() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.review') ? me : null
}

/** Changing the operation re-derives everything that hangs off it in one go, so
 *  takenAt, year, operation and opLabel can never disagree with each other. */
async function operationFields(operationId: string | null) {
    if (!operationId || operationId === 'unknown') {
        return { $unset: { operationId: '', operation: '', opLabel: '', year: '' }, $set: { takenAt: null } }
    }
    if (!ObjectId.isValid(operationId)) return null

    const op = await Db.operations.findOne({ _id: new ObjectId(operationId) }, { projection: { title: 1, date: 1 } })
    if (!op) return null

    const { label } = splitOperation(op.title ?? '')
    return {
        $set: {
            operationId: op._id,
            operation: op.title ?? '',
            opLabel: label,
            year: op.date ? String(new Date(op.date).getFullYear()) : '',
            takenAt: op.date ? new Date(op.date) : null,
        },
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await reviewer()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { caption, tags, operationId } = await request.json().catch(() => ({}))

    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}

    if (typeof caption === 'string') set.caption = caption.trim().slice(0, 500)

    if (Array.isArray(tags)) {
        const known = await Db.galleryTags
            .find({ slug: { $in: tags.filter((t): t is string => typeof t === 'string') } }, { projection: { slug: 1 } })
            .toArray()
        set.tags = known.map(t => t.slug)
    }

    if (operationId !== undefined) {
        const fields = await operationFields(operationId === null ? 'unknown' : String(operationId))
        if (!fields) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
        Object.assign(set, fields.$set ?? {})
        Object.assign(unset, (fields as { $unset?: Record<string, ''> }).$unset ?? {})
    }

    if (!Object.keys(set).length && !Object.keys(unset).length) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }

    await Db.galleryMedia.updateOne({ _id: new ObjectId(id) }, {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    return NextResponse.json({ success: true })
}

/** Accept — publish it. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await reviewer()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canTransition(doc.status, 'live')) {
        return NextResponse.json({ error: `Cannot publish something that is ${doc.status}.` }, { status: 409 })
    }

    // Fetched now rather than at submission, so a reviewer's edits to the
    // caption are on the placeholder if a placeholder is what we end up with.
    if (doc.source !== 'upload' && !doc.posterKey) await fetchEmbedPoster(doc)

    await Db.galleryMedia.updateOne({ _id: doc._id }, {
        $set: { status: 'live', publishedAt: new Date(), publishedBy: me.id },
        $unset: { processingError: '' },
    })

    if (doc.authorId) {
        await createNotification({
            userId: doc.authorId,
            type: 'gallery_submission_accepted',
            title: 'Your gallery submission was published',
            body: doc.opLabel ? `Your submission from ${doc.opLabel} is now on the gallery.` : 'Your submission is now on the gallery.',
            actionUrl: '/gallery',
            relatedId: id,
        })
    }

    return NextResponse.json({ success: true })
}

/** Reject — delete the bytes, keep the record. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await reviewer()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { reason } = await request.json().catch(() => ({}))
    const trimmed = String(reason ?? '').trim()
    // Required, because a member who is told nothing learns nothing and
    // submits the same thing again.
    if (!trimmed) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canTransition(doc.status, 'rejected')) {
        return NextResponse.json({ error: `Cannot reject something that is ${doc.status}.` }, { status: 409 })
    }

    /* The bytes go; the record stays. Rejection is a decision worth being able
       to look up later, and the file is the only expensive part of it. */
    for (const key of [doc.storageKey, doc.posterKey]) {
        if (!key) continue
        const file = resolveStorageKey(key)
        if (file) { try { unlinkSync(file) } catch { /* already gone */ } }
    }

    await Db.galleryMedia.updateOne({ _id: doc._id }, {
        $set: { status: 'rejected', rejectedAt: new Date(), rejectedBy: me.id, rejectedReason: trimmed.slice(0, 500) },
        $unset: { storageKey: '', posterKey: '' },
    })

    if (doc.authorId) {
        await createNotification({
            userId: doc.authorId,
            type: 'gallery_submission_rejected',
            title: 'A gallery submission was not published',
            body: trimmed.slice(0, 500),
            actionUrl: '/gallery/submit',
            relatedId: id,
        })
    }

    return NextResponse.json({ success: true })
}
