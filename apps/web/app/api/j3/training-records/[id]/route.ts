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

    const [candidates, staff, sessions, activity] = await Promise.all([
        Db.courseCandidates.find({ courseInstanceId: id }).sort({ candidateNumber: 1 }).toArray(),
        Db.courseStaff.find({ courseInstanceId: id }).sort({ addedAt: 1 }).toArray(),
        Db.courseSessions.find({ courseInstanceId: id }).sort({ sessionNumber: 1 }).toArray(),
        Db.courseActivityLogs.find({ courseInstanceId: id }).sort({ createdAt: -1 }).limit(30).toArray(),
    ])

    return NextResponse.json({ instance, candidates, staff, sessions, activity })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (instance.isLocked) return NextResponse.json({ error: 'Record is locked' }, { status: 403 })

    const body = await req.json()
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.notes !== undefined) updates.notes = body.notes

    const result = await Db.courseInstances.findOneAndUpdate(
        { _id: oid },
        { $set: updates },
        { returnDocument: 'after' },
    )

    return NextResponse.json({ instance: result })
}
