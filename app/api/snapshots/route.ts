import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { listSnapshots, readStatus } from '@/lib/snapshots'

// GET /api/snapshots — list stored snapshots and current operation status (J4 only)
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

    const [snapshots, status] = await Promise.all([
        Promise.resolve(listSnapshots()),
        readStatus(),
    ])

    return NextResponse.json({ snapshots, status })
}
