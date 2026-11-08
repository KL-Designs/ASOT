import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getTutorial } from '@/lib/tutorial/registry'

/**
 * GET  /api/tutorials/progress — the caller's id and the tutorials they have finished.
 * POST /api/tutorials/progress — { tutorialId }: record that the caller finished one.
 *
 * The only write a guided tutorial makes. It goes out through the sandbox's
 * real fetch (lib/tutorial/sandbox.ts), so it is the one request that passes
 * while a tutorial runs.
 */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rows = await Db.tutorialProgress.find({ userId: me.id }).toArray()
    const completed: Record<string, string> = {}
    for (const r of rows) completed[r.tutorialId] = r.lastCompletedAt.toISOString()
    return NextResponse.json({ userId: me.id, completed })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null) as { tutorialId?: unknown } | null
    const tutorialId = typeof body?.tutorialId === 'string' ? body.tutorialId : ''
    if (!getTutorial(tutorialId)) return NextResponse.json({ error: 'Unknown tutorial' }, { status: 400 })

    const now = new Date()
    await Db.tutorialProgress.updateOne(
        { userId: me.id, tutorialId },
        { $set: { lastCompletedAt: now }, $setOnInsert: { firstCompletedAt: now }, $inc: { runs: 1 } },
        { upsert: true },
    )
    return NextResponse.json({ ok: true, completedAt: now.toISOString() })
}
