import { NextRequest, NextResponse } from 'next/server'

import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'
import { backfillFeaturedOrder } from '@/lib/gallery/featured-order-backfill'

/**
 * POST /api/admin/gallery/featured-order-backfill
 * Body: { apply?: boolean }  — omit or pass false for a dry run.
 * J4-Administration only.
 *
 * The button behind this is on the J4 console's Tools tab; the same migration
 * is also item "Backfill: featured rail order" in the repo root's `npm start`
 * menu. Both call `lib/gallery/featured-order-backfill.ts`, so the guard that
 * refuses to renumber a curated rail has one implementation.
 *
 * `apply` is checked with `=== true` rather than for truthiness. This route
 * writes to the public rail once and can never be re-run afterwards, so a
 * string body value must not be the thing that decides it.
 */
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { apply?: unknown }
    const apply = body.apply === true

    const result = await backfillFeaturedOrder(Db.galleryMedia, { apply })

    /* Audited only when it actually wrote. The modal runs the dry pass every
       time it opens, and logging those would bury the one entry that matters
       for a migration that happens once. */
    if (apply && result.status === 'ok') {
        await logAction({
            action: 'gallery.featured.backfill',
            category: 'gallery',
            performedBy: me._id,
            performedByName: me.name ?? me.globalName ?? me._id,
            target: `Featured rail order backfilled — ${result.modifiedCount} document(s)`,
            details: {
                featuredCount: result.featuredCount,
                archiveCount: result.archiveCount,
                modifiedCount: result.modifiedCount,
                handedToArchive: result.placements.filter(p => p.target === 'archive').length,
            },
        })
    }

    return NextResponse.json(result)
}
