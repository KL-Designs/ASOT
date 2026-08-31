import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { canTransition } from '@/lib/gallery/status'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { fetchEmbedPoster } from '@/lib/gallery/poster'
import { galleryDeps } from '@/lib/gallery/deps'
import { operationFacets } from '@/lib/gallery/operation-facets'
import { relocateMedia } from '@/lib/gallery/relocate'

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

/** Same fallback chain `submissions/route.ts` uses for `authorName` — kept in
 *  step here rather than reusing a shared helper because both are one-liners
 *  and a shared wrapper would only hide that they're deliberately identical. */
function reviewerName(me: { guild?: { displayName?: string | null } | null, globalName?: string | null, username: string }): string {
    return me.guild?.displayName || me.globalName || me.username
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

    /* Changing the operation re-derives everything that hangs off it in one
       go, through the single resolver in lib/gallery/operation-facets.ts, so
       takenAt, year, operation and opLabel can never disagree with each other
       — nor with the folder relocateMedia will file the item's bytes into
       when it is accepted seconds later. The two run against the same
       document minutes apart, and when this route wrote `op.title`
       ("OPERATION Silent Ridge — Sat") while relocateMedia wrote the folder
       name ("4. Op Silent Ridge"), the document carried one spelling until
       publish and a different one after — which the public gallery's facet
       rail, grouping on `operation` and displaying `opLabel`, showed as two
       filter entries for what is really one operation. */
    if (operationId !== undefined) {
        const fields = await operationFacets(
            galleryDeps(),
            operationId === null ? 'unknown' : String(operationId),
        )
        if (!fields) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
        Object.assign(set, fields.$set)
        Object.assign(unset, fields.$unset ?? {})
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

    // A failed transcode still reaches `pending` — queue.ts's fail() puts it
    // there deliberately, carrying processingError, so a reviewer sees it
    // rather than it vanishing. But that means canTransition alone waves it
    // through: nothing about pending -> live objects to a document with no
    // storageKey. Publishing it anyway is a live item with `src: null`, an
    // empty <img> or <video> on the public page. Embeds are exempt — they
    // never carry a storageKey to begin with, and that is not a failure.
    if (doc.source === 'upload' && !doc.storageKey) {
        return NextResponse.json({
            error: doc.processingError
                ? `This item's transcode failed and there is no media to publish: ${doc.processingError}`
                : 'This item has no media to publish.',
        }, { status: 409 })
    }

    // Fetched now rather than at submission, so a reviewer's edits to the
    // caption are on the placeholder if a placeholder is what we end up with.
    if (doc.source !== 'upload' && !doc.posterKey) await fetchEmbedPoster(doc)

    /* Into the readable tree, and only now.
       A file lives flat under media/ while it is pending and moves to
       content/{year}/{operation}/ on publish, carrying its id in the filename.
       Doing it here rather than at upload means a rejected submission never
       touches the archive tree, and a reviewer who corrects the operation
       causes one move instead of two.

       Before the status change, not after: if this throws, nothing is
       published, which is recoverable. The reverse would leave a live document
       pointing at a file that was never moved. Embeds have no bytes and
       relocateMedia returns null for them without doing anything. */
    if (doc.source === 'upload') {
        try {
            await relocateMedia(galleryDeps(), doc._id)
        } catch (err) {
            console.error('[gallery] failed to file media into the content tree', id, err)
            return NextResponse.json({
                error: 'Could not move this item into the gallery archive. Nothing was published.',
            }, { status: 500 })
        }
    }

    await Db.galleryMedia.updateOne({ _id: doc._id }, {
        $set: { status: 'live', publishedAt: new Date(), publishedBy: me.id },
        $unset: { processingError: '' },
    })

    await logAction({
        action: 'gallery.submission.accept',
        category: 'gallery',
        performedBy: me.id,
        performedByName: reviewerName(me),
        department: 'j5',
        entityType: 'gallery_media',
        entityId: id,
        actionUrl: '/dashboard/j5',
        target: doc.caption || doc.opLabel || undefined,
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

    /* The document flips to rejected before the bytes go, not after. If the
       delete ran first and the updateOne then threw, the item would sit
       `pending` in the queue with its media already destroyed — visible but
       unusable and unrejectable. Updating first means the only failure mode
       left is an orphaned file on disk, which is harmless and recoverable;
       the record, not the bytes, is the one thing that must never be wrong. */
    await Db.galleryMedia.updateOne({ _id: doc._id }, {
        $set: { status: 'rejected', rejectedAt: new Date(), rejectedBy: me.id, rejectedReason: trimmed.slice(0, 500) },
        $unset: { storageKey: '', posterKey: '' },
    })

    for (const key of [doc.storageKey, doc.posterKey]) {
        if (!key) continue
        const file = resolveStorageKey(key)
        if (file) { try { unlinkSync(file) } catch { /* already gone, or the update above already dropped the key — either way, nothing left to clean up */ } }
    }

    await logAction({
        action: 'gallery.submission.reject',
        category: 'gallery',
        performedBy: me.id,
        performedByName: reviewerName(me),
        department: 'j5',
        entityType: 'gallery_media',
        entityId: id,
        actionUrl: '/dashboard/j5',
        target: doc.caption || doc.opLabel || undefined,
        details: { reason: trimmed },
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
