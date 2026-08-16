import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readStatus, runAllBackups } from '@/lib/backups'

// POST /api/backups/create — trigger a background backup of both repos (backups.manage)
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

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    // Fire and forget — returns immediately, backup runs in background
    runAllBackups().catch(e => console.error('[backups] Manual create error:', e.message))

    return NextResponse.json({ message: 'Backup started' }, { status: 202 })
}
