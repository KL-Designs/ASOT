import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { listBackups, readStatus } from '@/lib/backups'

// GET /api/backups — merged backup timeline + current operation status (J4 only)
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

    const [points, status] = await Promise.all([listBackups(), readStatus()])
    return NextResponse.json({ points, status })
}
