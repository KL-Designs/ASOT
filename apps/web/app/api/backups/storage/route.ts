import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getStorageUsage } from '@/lib/backups'

// GET /api/backups/storage — live vs backed-up disk usage breakdown (J4 only)
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

    const usage = await getStorageUsage()
    return NextResponse.json(usage)
}
