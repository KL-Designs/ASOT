import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { getConnection } from '@/lib/teamspeak/cache'

const MAX_SNAPSHOTS = 14

// GET /api/teamspeak/snapshots — list all snapshots (no data field)
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const snapshots = await Db.teamspeakSnapshots
        .find({}, { projection: { data: 0 } })
        .sort({ createdAt: -1 })
        .toArray()

    return NextResponse.json({ snapshots: JSON.parse(JSON.stringify(snapshots)) })
}

// POST /api/teamspeak/snapshots — create a manual snapshot
export async function POST(req: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

    try {
        const ts = await getConnection()
        const result = await ts.createSnapshot()
        const dataStr = result.snapshot

        const snapshot: TsSnapshot = {
            _id: new ObjectId(),
            name: name.trim(),
            auto: false,
            createdAt: Date.now(),
            createdBy: me.id,
            data: dataStr,
            sizeBytes: Buffer.byteLength(dataStr, 'utf8'),
        }

        await Db.teamspeakSnapshots.insertOne(snapshot)

        // Enforce retention limit — delete oldest beyond MAX_SNAPSHOTS
        const count = await Db.teamspeakSnapshots.countDocuments()
        if (count > MAX_SNAPSHOTS) {
            const oldest = await Db.teamspeakSnapshots
                .find({}, { projection: { _id: 1 } })
                .sort({ createdAt: 1 })
                .limit(count - MAX_SNAPSHOTS)
                .toArray()
            if (oldest.length) {
                await Db.teamspeakSnapshots.deleteMany({ _id: { $in: oldest.map(s => s._id) } })
            }
        }

        const { data: _d, ...meta } = snapshot
        return NextResponse.json({ snapshot: JSON.parse(JSON.stringify(meta)) })
    } catch (err) {
        console.error('[TeamSpeak] Failed to create snapshot:', err)
        return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
    }
}
