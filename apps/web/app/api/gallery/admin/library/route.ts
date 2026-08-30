import { NextRequest, NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { PAGE_SIZE, buildLibraryFilter, buildLibrarySort, parseLibraryParams } from '@/lib/gallery/library-query'

/**
 * The Media tab's centre pane.
 *
 * Separate from the facets route because this refetches on every keystroke,
 * chip and page while the rail's counts aggregate the whole collection. Paying
 * for both on every interaction would make typing in the search box aggregate
 * 4,781 documents per character.
 *
 * Gated with gallery.manage, like every sibling under admin/ — this returns
 * storage keys and author ids, which the public gallery route deliberately
 * does not.
 */

function srcFor(doc: GalleryMedia): string | null {
    if (doc.source !== 'upload') return null
    return doc.storageKey ? `/api/gallery/media/${doc._id.toString()}` : null
}

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = parseLibraryParams(new URL(request.url).searchParams)
    const filter = buildLibraryFilter(params)

    const [items, total] = await Promise.all([
        Db.galleryMedia
            .find(filter)
            .sort(buildLibrarySort(params.sort))
            .skip(params.page * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .toArray(),
        Db.galleryMedia.countDocuments(filter),
    ])

    const rows: AdminMediaAPI[] = items.map(doc => ({
        id: doc._id.toString(),
        kind: doc.kind,
        source: doc.source,
        src: srcFor(doc),
        poster: doc.posterKey ? `/api/gallery/media/${doc._id.toString()}/poster` : null,
        embedId: doc.embedId ?? null,
        embedKind: doc.embedKind ?? null,
        embedUrl: doc.embedUrl ?? null,
        year: doc.year ?? null,
        operation: doc.operation ?? null,
        opLabel: doc.opLabel ?? null,
        mission: doc.mission ?? null,
        operationId: doc.operationId?.toString() ?? null,
        takenAt: doc.takenAt ? doc.takenAt.toISOString() : null,
        authorId: doc.authorId ?? null,
        authorName: doc.authorName ?? null,
        caption: doc.caption ?? null,
        tags: doc.tags ?? [],
        width: doc.width ?? null,
        height: doc.height ?? null,
        durationSec: doc.durationSec ?? null,
        bytes: doc.bytes ?? null,
        storageKey: doc.storageKey ?? null,
        up: doc.up ?? 0,
        down: doc.down ?? 0,
        publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    }))

    return NextResponse.json({ items: rows, total, page: params.page, pageSize: PAGE_SIZE })
}
