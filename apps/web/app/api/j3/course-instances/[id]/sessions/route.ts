import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const sessions = await Db.courseSessions.find({ courseInstanceId: id }).sort({ sessionNumber: 1 }).toArray()
    return NextResponse.json({ sessions })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { sessionId, scheduledDate, catchUpRequired, sessionStatus } = body
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    let sessionOid: ObjectId
    try { sessionOid = new ObjectId(sessionId) } catch { return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 }) }

    const update: Record<string, unknown> = { updatedAt: new Date() }

    if (scheduledDate !== undefined) {
        const parsedDate = new Date(scheduledDate)
        if (isNaN(parsedDate.getTime())) return NextResponse.json({ error: 'Invalid scheduledDate' }, { status: 400 })
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate))) {
            // A bare date keeps the session's start time (sessions are created with one).
            const current = await Db.courseSessions.findOne({ _id: sessionOid, courseInstanceId: id }, { projection: { scheduledDate: 1 } })
            const t = current?.scheduledDate ? new Date(current.scheduledDate) : null
            parsedDate.setHours(t?.getHours() ?? 0, t?.getMinutes() ?? 0, 0, 0)
        }
        update.scheduledDate = parsedDate
    }
    if (catchUpRequired !== undefined) update.catchUpRequired = catchUpRequired
    if (sessionStatus !== undefined) update.sessionStatus = sessionStatus

    const result = await Db.courseSessions.findOneAndUpdate(
        { _id: sessionOid, courseInstanceId: id },
        { $set: update },
        { returnDocument: 'after' },
    )
    if (!result) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    // Keep the course's start and end on its first and last sessions, however many it has.
    if (scheduledDate !== undefined) {
        const all = await Db.courseSessions.find({ courseInstanceId: id }, { projection: { scheduledDate: 1, sessionNumber: 1 } }).sort({ scheduledDate: 1 }).toArray()
        if (all.length && ObjectId.isValid(id)) {
            const first = all[0].scheduledDate
            await Db.courseInstances.updateOne(
                { _id: new ObjectId(id) },
                { $set: { startDate: first, endDate: all[all.length - 1].scheduledDate, updatedAt: new Date(), ...(result.sessionNumber === 1 ? { session1Date: first } : {}) } },
            ).catch(() => {})
        }
    }

    return NextResponse.json({ session: result })
}
