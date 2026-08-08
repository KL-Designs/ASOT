import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Fetch all non-catch-up sessions for this course instance
    const sessions = await Db.courseSessions
        .find({ courseInstanceId: id, catchUp: false })
        .sort({ sessionNumber: 1 })
        .toArray()

    // For each session, find its training guide
    const sessionGuides = await Promise.all(sessions.map(async s => {
        const sid = s._id?.toString() ?? ''
        const guide = await Db.trainingGuides.findOne(
            { docRef: `session-${sid}`, deletedAt: { $exists: false } },
            { projection: { title: 1, overview: 1, equipment: 1, trainingAreaDescription: 1, teachingPoints: 1 } }
        )
        return { session: s, guide: guide ?? null }
    }))

    return NextResponse.json({ sessionGuides })
}
