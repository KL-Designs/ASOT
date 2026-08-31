import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.review')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const docs = await Db.galleryMedia.find({ status: 'pending' }).sort({ createdAt: 1 }).toArray()

    return NextResponse.json({
        items: docs.map(d => ({
            id: d._id.toString(),
            kind: d.kind,
            source: d.source,
            src: d.storageKey ? `/api/gallery/media/${d._id.toString()}` : null,
            poster: d.posterKey ? `/api/gallery/media/${d._id.toString()}/poster` : null,
            embedId: d.embedId ?? null,
            embedKind: d.embedKind ?? null,
            embedUrl: d.embedUrl ?? null,
            caption: d.caption ?? '',
            tags: d.tags ?? [],
            operationId: d.operationId?.toString() ?? null,
            opLabel: d.opLabel ?? null,
            takenAt: d.takenAt ? d.takenAt.toISOString() : null,
            durationSec: d.durationSec ?? null,
            authorId: d.authorId ?? null,
            authorName: d.authorName ?? 'Unknown',
            batchId: d.batchId ?? d._id.toString(),
            createdAt: d.createdAt.toISOString(),
            /* Surfaced rather than hidden: a failed transcode reaches the queue
               on purpose, so somebody can look at it and reject it instead of
               it vanishing. */
            processingError: d.processingError ?? null,
        })),
    })
}
