import { NextRequest, NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'

/** What the submit page's monitor polls while the queue works through a batch.
 *  Scoped to the caller's own submissions, so a guessed batch id reveals
 *  nothing. */
export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const batch = new URL(request.url).searchParams.get('batch')
    if (!batch) return NextResponse.json({ error: 'batch is required' }, { status: 400 })

    const docs = await Db.galleryMedia
        .find({ batchId: batch, authorId: me.id }, { projection: { status: 1, processingError: 1 } })
        .toArray()

    return NextResponse.json({
        items: docs.map(d => ({
            id: d._id.toString(),
            status: d.status,
            processingError: d.processingError ?? null,
        })),
    })
}
