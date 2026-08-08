import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'
import Db from '@/lib/mongo'
import { verifyCronSecret } from '@/lib/cron-auth'

const MAX_SNAPSHOTS = 14

function connect() {
    return TeamSpeak.connect({
        host: process.env.TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: process.env.TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
    })
}

async function createAutoSnapshot() {
    const name = `Auto — ${new Date().toISOString().slice(0, 10)}`
    let ts: TeamSpeak | undefined
    try {
        ts = await connect()
        const result = await ts.createSnapshot()
        const dataStr = result.snapshot

        await Db.teamspeakSnapshots.insertOne({
            _id: new ObjectId(),
            name,
            auto: true,
            createdAt: Date.now(),
            createdBy: 'cron',
            data: dataStr,
            sizeBytes: Buffer.byteLength(dataStr, 'utf8'),
        })

        // Enforce 14-snapshot retention limit
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

        console.log(`[cron/teamspeak-snapshots] Snapshot created: ${name}`)
    } finally {
        if (ts) await ts.quit().catch(() => {})
    }
}

/**
 * GET /api/cron/teamspeak-snapshots
 * Creates a daily auto-snapshot and enforces the 14-snapshot retention limit.
 * Called from server.mjs at 3 AM daily.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fire and forget
    createAutoSnapshot().catch(e => console.error('[cron/teamspeak-snapshots] Error:', e.message))

    return NextResponse.json({ message: 'Snapshot started' })
}
