import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

// GET — top 10 scores (public)
export async function GET() {
    const scores = await Db.minigameScores
        .find({})
        .sort({ total: -1 })
        .limit(10)
        .toArray()

    return NextResponse.json(scores, { status: 200 })
}

// POST — submit a score (auth required, only saves personal best)
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { score, collectScore } = await request.json()
    if (typeof score !== 'number' || typeof collectScore !== 'number') {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const total = score + collectScore
    const displayName = me.guild?.nickname || me.globalName || me.username

    const existing = await Db.minigameScores.findOne({ userId: me.id })
    if (!existing || total > (existing.total as number)) {
        await Db.minigameScores.updateOne(
            { userId: me.id },
            { $set: { userId: me.id, displayName, score, collectScore, total, date: new Date() } },
            { upsert: true }
        )
        return NextResponse.json({ saved: true, personal_best: true }, { status: 200 })
    }

    return NextResponse.json({ saved: false, personal_best: false }, { status: 200 })
}
