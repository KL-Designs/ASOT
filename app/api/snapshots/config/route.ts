import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readConfig, writeConfig } from '@/lib/snapshots'
import type { SnapshotConfig } from '@/lib/snapshots'

// GET /api/snapshots/config — read current snapshot config (J4 only)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await readConfig()
    return NextResponse.json(config)
}

// PATCH /api/snapshots/config — update snapshot config (J4 only)
export async function PATCH(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Partial<SnapshotConfig>
    const current = await readConfig()

    const updated: SnapshotConfig = {
        maxSnapshots: typeof body.maxSnapshots === 'number' ? Math.max(1, Math.min(20, body.maxSnapshots)) : current.maxSnapshots,
        autoEnabled:  typeof body.autoEnabled  === 'boolean' ? body.autoEnabled : current.autoEnabled,
        intervalDays: typeof body.intervalDays  === 'number' ? Math.max(1, Math.min(30, body.intervalDays))  : current.intervalDays,
    }

    await writeConfig(updated)
    return NextResponse.json(updated)
}
