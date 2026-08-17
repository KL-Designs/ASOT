import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { cancelOperation } from '@/lib/backups'

// POST /api/backups/cancel — abort a stuck in-progress operation (backups.manage)
//
// This used to only rewrite the status file to 'idle', which left the actual
// operation running and still holding the in-process guard: the next create
// request was accepted (the status file said idle) and then silently skipped
// by runAllBackups(), so nothing ran. cancelOperation() kills the restic child
// and releases the guard, so the reset the operator asked for is real.
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

    const { aborted } = await cancelOperation()
    return NextResponse.json({
        message: aborted > 0
            ? `Operation aborted (${aborted} restic process${aborted === 1 ? '' : 'es'} stopped).`
            : 'Status reset to idle.',
        aborted,
    })
}
