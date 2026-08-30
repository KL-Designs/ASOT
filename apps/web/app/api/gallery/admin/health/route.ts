import { NextRequest, NextResponse } from 'next/server'
import { statSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { reconcile } from '@/lib/gallery/reconcile'
import { parseContentPath } from '@/lib/gallery/content-path'
import { CONTENT_DIR, contentKey } from '@/lib/gallery/paths'

/**
 * Where the database and the disk disagree, and what to do about it.
 *
 * GET reads the last persisted report rather than re-walking 4,781 files on
 * every page load. POST { action: 'rescan' } is the "Re-scan disk" the
 * reconcile module's own comments refer to.
 *
 * Indexing is explicit and never automatic: reconcile reports a file it does
 * not recognise, and a human decides it should exist. That asymmetry is the
 * whole safety property — a half-finished restore looks exactly like a folder
 * of new files, and only a person can tell the difference.
 */

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

export async function GET() {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const report = await Db.galleryHealth.findOne({})
    return NextResponse.json({ report })
}

export async function POST(request: NextRequest) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { action, paths } = await request.json().catch(() => ({}))

    if (action === 'rescan') {
        const report = await reconcile({ media: Db.galleryMedia, operations: Db.operations })
        await Db.galleryHealth.replaceOne({}, report, { upsert: true })

        await logAction({
            action: 'gallery.health.rescan',
            category: 'gallery',
            performedBy: me.id,
            performedByName: me.guild?.displayName || me.globalName || me.username,
            department: 'j5',
            entityType: 'gallery_media',
            entityId: 'health',
            actionUrl: '/dashboard/j5',
            details: {
                scanned: report.scanned,
                relocated: report.relocated.length,
                notIndexed: report.notIndexed.length,
                missing: report.missingFiles.length,
            },
        })

        return NextResponse.json({ report })
    }

    if (action === 'index') {
        const wanted = (Array.isArray(paths) ? paths : []).filter((p: unknown): p is string => typeof p === 'string')
        if (!wanted.length) return NextResponse.json({ error: 'Nothing to index' }, { status: 400 })

        /* Only paths the last report actually listed as not-indexed. The
           request body is staff-supplied, and indexing an arbitrary relative
           path would let a typo create a record pointing anywhere in the
           content tree. */
        const report = await Db.galleryHealth.findOne({})
        const allowed = new Set((report?.notIndexed ?? []).map(n => n.path))

        let indexed = 0
        for (const relative of wanted) {
            if (!allowed.has(relative)) continue

            const facets = parseContentPath(relative)
            if (!facets) continue

            const absolute = path.join(CONTENT_DIR, ...relative.split('/'))
            let bytes = 0
            try { bytes = statSync(absolute).size } catch { continue }

            const isVideo = /\.(mp4|webm|mov)$/i.test(facets.file)

            await Db.galleryMedia.updateOne(
                { storageKey: contentKey(relative) },
                {
                    $setOnInsert: {
                        kind: isVideo ? 'video' : 'image',
                        source: 'upload',
                        storageKey: contentKey(relative),
                        ...(facets.year ? { year: facets.year } : {}),
                        ...(facets.operation ? { operation: facets.operation, opLabel: facets.operation } : {}),
                        ...(facets.mission ? { mission: facets.mission } : {}),
                        // Null, not a guessed date. A reviewer assigns the
                        // operation from the Media tab and takenAt follows it.
                        takenAt: null,
                        tags: [],
                        bytes,
                        status: 'live',
                        up: 0,
                        down: 0,
                        createdAt: new Date(),
                    },
                },
                { upsert: true },
            )
            indexed++
        }

        // Re-scan so the report reflects what was just indexed rather than
        // continuing to list them as missing.
        const fresh = await reconcile({ media: Db.galleryMedia, operations: Db.operations })
        await Db.galleryHealth.replaceOne({}, fresh, { upsert: true })

        return NextResponse.json({ indexed, report: fresh })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
