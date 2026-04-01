import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

const STALE_MS    = 8000
const DEAD_TTL_MS = 10_000

// GET — active players (seen < 8s) + recently dead players (died < 10s)
export async function GET() {
    try {
        const now        = Date.now()
        const cutoffLive = new Date(now - STALE_MS)
        const cutoffDead = new Date(now - DEAD_TTL_MS)

        const players = await Db.minigameLive
            .find(
                {
                    $or: [
                        { dead: { $ne: true }, lastSeen: { $gte: cutoffLive } },
                        { dead: true,          diedAt:   { $gte: cutoffDead } },
                    ],
                },
                { maxTimeMS: 3000 }
            )
            .sort({ dead: 1, total: -1 })
            .toArray()
        return NextResponse.json(players, { status: 200 })
    } catch {
        return NextResponse.json([], { status: 200 })
    }
}

// POST — heartbeat (alive) or death notification (dead: true)
export async function POST(request: NextRequest) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { score, collectScore, accentColor, dead } = await request.json()
        if (typeof score !== 'number' || typeof collectScore !== 'number') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        const displayName = me.guild?.nickname || me.globalName || me.username
        const total       = score + collectScore

        if (dead) {
            await Db.minigameLive.updateOne(
                { userId: me.id },
                { $set: { userId: me.id, displayName, accentColor: accentColor || null, score, collectScore, total, dead: true, diedAt: new Date() } },
                { upsert: true }
            )
        } else {
            await Db.minigameLive.updateOne(
                { userId: me.id },
                { $set: { userId: me.id, displayName, accentColor: accentColor || null, score, collectScore, total, dead: false, lastSeen: new Date() } },
                { upsert: true }
            )
        }

        return NextResponse.json({ ok: true }, { status: 200 })
    } catch {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

// DELETE — remove player immediately (page close / unmount)
export async function DELETE() {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        await Db.minigameLive.deleteOne({ userId: me.id })
        return NextResponse.json({ ok: true }, { status: 200 })
    } catch {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
