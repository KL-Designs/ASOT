import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

const STALE_MS = 8000

// GET — players active within last 8 seconds (public)
export async function GET() {
    const cutoff = new Date(Date.now() - STALE_MS)
    const players = await Db.minigameLive
        .find({ lastSeen: { $gte: cutoff } })
        .sort({ total: -1 })
        .toArray()
    return NextResponse.json(players, { status: 200 })
}

// POST — heartbeat: upsert current score (auth required)
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { score, collectScore, accentColor } = await request.json()
    if (typeof score !== 'number' || typeof collectScore !== 'number') {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username
    const total = score + collectScore

    await Db.minigameLive.updateOne(
        { userId: me.id },
        { $set: { userId: me.id, displayName, accentColor: accentColor || null, score, collectScore, total, lastSeen: new Date() } },
        { upsert: true }
    )

    return NextResponse.json({ ok: true }, { status: 200 })
}

// DELETE — remove player from live list on death/exit (auth required)
export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await Db.minigameLive.deleteOne({ userId: me.id })
    return NextResponse.json({ ok: true }, { status: 200 })
}
