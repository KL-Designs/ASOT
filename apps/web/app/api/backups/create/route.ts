import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readStatus, runAllBackups } from '@/lib/backups'
import { logAction } from '@/lib/logAction'

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

    // Fire and forget — returns immediately, backup runs in background.
    // manual: true tags the run so retention never prunes it. Without it,
    // --keep-hourly keeps only the last snapshot of each hour, so a backup
    // taken by hand would delete that hour's automatic one instead of
    // standing alongside it.
    runAllBackups({ manual: true }).catch(e => console.error('[backups] Manual create error:', e.message))

    await logAction({
        action: 'backup.create',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
    })

    return NextResponse.json({ message: 'Backup started' }, { status: 202 })
}
