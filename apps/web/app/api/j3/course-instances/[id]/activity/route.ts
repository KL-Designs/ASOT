import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const filter: Record<string, unknown> = { courseInstanceId: id }
    const sessionId = req.nextUrl.searchParams.get('sessionId')
    const candidateId = req.nextUrl.searchParams.get('candidateId')
    const action = req.nextUrl.searchParams.get('action')
    if (sessionId) filter.courseSessionId = sessionId
    if (candidateId) filter.courseCandidateId = candidateId
    if (action) filter.action = action

    const logs = await Db.courseActivityLogs.find(filter).sort({ createdAt: -1 }).limit(200).toArray()
    return NextResponse.json({ logs })
}
