import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { getConnection } from '@/lib/teamspeak/cache'

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

// POST /api/teamspeak/snapshots/[id]/restore
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const snapshot = await Db.teamspeakSnapshots.findOne({ _id: objectId })
    if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })

    try {
        const ts = await getConnection()
        await ts.deploySnapshot(snapshot.data)
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to restore snapshot:', err)
        return NextResponse.json({ error: 'Failed to restore snapshot' }, { status: 500 })
    }
}
