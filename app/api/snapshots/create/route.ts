import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, createSnapshot, DEFAULT_SNAPSHOT_OPTIONS } from '@/lib/snapshots'
import type { SnapshotOptions } from '@/lib/snapshots'

// POST /api/snapshots/create — trigger a background snapshot (J4 only)
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

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    const body = await req.json().catch(() => ({})) as Partial<SnapshotOptions>
    const options: SnapshotOptions = {
        database:        body.database        !== false,
        galleryContent:  body.galleryContent  !== false,
        galleryFeatured: body.galleryFeatured !== false,
        gallerySotm:     body.gallerySotm     !== false,
        uploads:         body.uploads         !== false,
    }

    // Fire and forget — returns immediately, creation runs in background
    createSnapshot(options).catch(e => console.error('[snapshots] Manual create error:', e.message))

    return NextResponse.json({ message: 'Snapshot creation started' }, { status: 202 })
}
