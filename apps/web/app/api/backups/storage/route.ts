import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { getStorageUsage } from '@/lib/backups'

// GET /api/backups/storage — live vs backed-up disk usage breakdown (backups.manage)
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

    const usage = await getStorageUsage()
    return NextResponse.json(usage)
}
