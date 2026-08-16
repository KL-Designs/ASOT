import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { writeStatus } from '@/lib/backups'

// POST /api/backups/cancel — force-reset a stuck in-progress operation (backups.manage)
export async function POST() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await writeStatus({ state: 'idle', error: 'Operation cancelled by user.' })
    return NextResponse.json({ message: 'Status reset to idle.' })
}
