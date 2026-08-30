import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/**
 * Setting the public featured rail's order.
 *
 * `featuredOrder` on `gallery_media` is the rail's whole source of truth (see
 * the module comment on `/api/gallery/route.ts`) — this is the only route
 * that writes it. The body is the complete rotation, front to back; anything
 * live and currently ordered but absent from it drops out of the rail.
 */

const MAX_IDS = 60   // a strip, not a gallery — see the brief this implements

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

export async function PUT(request: NextRequest) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.ids)) {
        return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
    }

    // Validate and de-duplicate before the cap: a caller sending the same id
    // twice should not burn two of the sixty slots on one tile.
    const seen = new Set<string>()
    const given: string[] = []
    for (const v of body.ids) {
        if (typeof v === 'string' && ObjectId.isValid(v) && !seen.has(v)) {
            seen.add(v)
            given.push(v)
        }
    }

    if (given.length > MAX_IDS) {
        return NextResponse.json({
            error: `Too many items: ${given.length} given, ${MAX_IDS} is the most the rail can hold.`,
        }, { status: 400 })
    }

    // Ignore anything that isn't a live media document — a stale id (deleted
    // or unpublished since the tab last loaded) should silently drop out of
    // the rotation, not corrupt it.
    const objectIds = given.map(v => new ObjectId(v))
    const live = await Db.galleryMedia
        .find({ _id: { $in: objectIds }, status: 'live' }, { projection: { _id: 1 } })
        .toArray()
    const liveIds = new Set(live.map(d => d._id.toString()))
    const ordered = objectIds.filter(id => liveIds.has(id.toString()))

    /*
       Set first, unset second — deliberately in that order rather than one
       replaceAll-style pass.

       If the process dies between the two steps, the documents just given a
       featuredOrder already have one, and the ones that should have lost
       theirs still carry their old value — so the rail shows some items
       TWICE (old position and new) rather than going empty. A visitor sees a
       redundant tile; they never see a blank strip. Reversing the order
       turns the same failure into the unrecoverable direction: every old
       occupant unset before the new set lands would empty the rail outright
       if the process died in between.
    */
    if (ordered.length) {
        await Db.galleryMedia.bulkWrite(
            ordered.map((_id, i) => ({
                updateOne: { filter: { _id }, update: { $set: { featuredOrder: i } } },
            })),
        )
    }

    await Db.galleryMedia.updateMany(
        { _id: { $nin: ordered }, featuredOrder: { $exists: true } },
        { $unset: { featuredOrder: '' } },
    )

    return NextResponse.json({ success: true, count: ordered.length })
}
