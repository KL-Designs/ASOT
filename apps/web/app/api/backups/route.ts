import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { listBackups, readStatus, checkResticHealth } from '@/lib/backups'

// GET /api/backups — merged backup timeline + current operation status (backups.manage)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // listBackups() failing (e.g. the restic binary itself is broken) must
    // not also take resticHealthy down with it — that field exists
    // specifically to surface exactly this kind of failure, so degrade to
    // an empty timeline instead of a 500 that hides the health signal.
    const [points, status, resticHealthy] = await Promise.all([
        listBackups().catch(() => []),
        readStatus(),
        checkResticHealth(),
    ])
    return NextResponse.json({ points, status, resticHealthy })
}
