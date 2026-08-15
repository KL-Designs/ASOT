import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { writeStatus } from '@/lib/backups'

// POST /api/backups/cancel — force-reset a stuck in-progress operation (J4 only)
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

    await writeStatus({ state: 'idle', error: 'Operation cancelled by user.' })
    return NextResponse.json({ message: 'Status reset to idle.' })
}
