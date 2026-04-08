import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, createSnapshot } from '@/lib/snapshots'

// POST /api/snapshots/create — trigger a background snapshot (J4 only)
export async function POST() {
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

    // Fire and forget — returns immediately, creation runs in background
    createSnapshot().catch(e => console.error('[snapshots] Manual create error:', e.message))

    return NextResponse.json({ message: 'Snapshot creation started' }, { status: 202 })
}
