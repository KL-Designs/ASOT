import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const round = await Db.peerReviewRounds.findOne({ courseInstanceId: id, status: 'sent' })
    if (!round) return NextResponse.json({ error: 'No sent round to unlock' }, { status: 404 })

    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    await Db.peerReviewRounds.updateOne(
        { _id: round._id },
        { $set: { status: 'unlocked', unlockedAt: now, unlockedById: me.id, unlockedByName: name } }
    )

    await Db.courseActivityLogs.insertOne({
        courseInstanceId: id,
        action: 'peer_review.unlocked',
        performedById: me.id,
        performedByName: name,
        createdAt: now,
    } as CourseActivityLog)

    await logAction({
        action: 'peer_review.unlock',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'peer_review_round',
        entityId: round._id!.toString(),
        after: { courseInstanceId: id, unlockedAt: now },
    })

    return NextResponse.json({ ok: true })
}
