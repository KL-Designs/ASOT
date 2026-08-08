import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

// DELETE /api/teamspeak/snapshots/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const result = await Db.teamspeakSnapshots.deleteOne({ _id: objectId })
    if (!result.deletedCount) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })

    return NextResponse.json({ success: true })
}
