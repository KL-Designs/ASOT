import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

// GET — top 10 scores (public), or all scores with ?all=true
export async function GET(request: NextRequest) {
    const all = request.nextUrl.searchParams.get('all') === 'true'
    const query = Db.minigameScores.find({}).sort({ total: -1 })
    const scores = await (all ? query : query.limit(10)).toArray()

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
    const isPersonalBest = !existing || total > (existing.total as number)

    if (isPersonalBest) {
        await Db.minigameScores.updateOne(
            { userId: me.id },
            {
                $set: { userId: me.id, displayName, score, collectScore, total, date: new Date() },
                $inc: { totalGems: collectScore },
            },
            { upsert: true }
        )
    } else {
        await Db.minigameScores.updateOne(
            { userId: me.id },
            { $inc: { totalGems: collectScore }, $set: { displayName } }
        )
    }

    return NextResponse.json({ saved: isPersonalBest, personal_best: isPersonalBest }, { status: 200 })
}
