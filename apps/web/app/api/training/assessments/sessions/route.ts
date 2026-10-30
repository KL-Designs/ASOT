import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { memberName } from '@/lib/military/award-postage-db'
import { assessmentStanding, sessionTrainees, sessionsFor } from '@/lib/training/orders-assessment-db'

export const dynamic = 'force-dynamic'

/**
 * Row 373: sessions of a course to file assessments under; with
 * ?session=kind:id, that session's trainees; with ?q=, a member search for
 * adding a trainee by hand or naming a trainer.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await assessmentStanding(me)).isTrainingStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const typeId = req.nextUrl.searchParams.get('typeId') ?? ''
    const session = req.nextUrl.searchParams.get('session')
    const q = req.nextUrl.searchParams.get('q')?.trim()
    if (q) {
        const re = new RegExp(q.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        const users = await Db.users.find({ isSkeletonAccount: { $ne: true }, discharged: { $exists: false }, $or: [{ name: re }, { 'guild.nickname': re }, { 'guild.displayName': re }, { globalName: re }, { username: re }] }).limit(15).toArray()
        return NextResponse.json({ members: users.map(u => ({ id: u.id, name: memberName(u) })) })
    }
    if (session) {
        const [kind, id] = session.split(':')
        if ((kind !== 'instance' && kind !== 'event') || !id) return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
        return NextResponse.json({ trainees: await sessionTrainees(kind, id) })
    }
    return NextResponse.json({ sessions: await sessionsFor(typeId) })
}
