import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; sessionId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const staff = await Db.courseSessionStaff.find({ courseInstanceId: id, courseSessionId: sessionId }).sort({ addedAt: 1 }).toArray()
    return NextResponse.json({ staff })
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { userId, displayName, role } = await req.json()
    if (!userId || !displayName || !role) return NextResponse.json({ error: 'userId, displayName, role required' }, { status: 400 })
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const existing = await Db.courseSessionStaff.findOne({ courseInstanceId: id, courseSessionId: sessionId, userId })
    if (existing) return NextResponse.json({ error: 'Already assigned to this session' }, { status: 409 })
    const doc: CourseSessionStaff = {
        courseInstanceId: id,
        courseSessionId: sessionId,
        userId,
        displayName,
        role: role as StaffRole,
        addedById: me.id,
        addedByName: name,
        addedAt: new Date(),
    }
    const result = await Db.courseSessionStaff.insertOne(doc as CourseSessionStaff)
    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { staffId } = await req.json()
    if (!staffId) return NextResponse.json({ error: 'staffId required' }, { status: 400 })
    let oid: ObjectId
    try { oid = new ObjectId(staffId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }
    await Db.courseSessionStaff.deleteOne({ _id: oid, courseInstanceId: id, courseSessionId: sessionId })
    return NextResponse.json({ ok: true })
}
