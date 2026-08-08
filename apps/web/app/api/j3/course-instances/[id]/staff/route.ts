import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { syncInstanceStats } from '@/lib/training/sync-instance-stats'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const staff = await Db.courseStaff.find({ courseInstanceId: id }).sort({ addedAt: 1 }).toArray()
    return NextResponse.json({ staff })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { userId, displayName, role } = body
    if (!userId || !displayName) return NextResponse.json({ error: 'userId and displayName required' }, { status: 400 })

    const validRoles: StaffRole[] = ['lead_instructor', 'instructor', 'observer']
    const staffRole: StaffRole = validRoles.includes(role) ? role : 'instructor'

    const exists = await Db.courseStaff.findOne({ courseInstanceId: id, userId })
    if (exists) return NextResponse.json({ error: 'Staff member already assigned' }, { status: 409 })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    const doc: Omit<CourseStaffMember, '_id'> = {
        courseInstanceId: id,
        userId,
        displayName,
        role: staffRole,
        addedById: me.id,
        addedByName: name,
        addedAt: now,
    }

    const result = await Db.courseStaff.insertOne(doc as CourseStaffMember)

    syncInstanceStats(id, oid).catch(() => {})

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { staffId } = body
    if (!staffId) return NextResponse.json({ error: 'staffId required' }, { status: 400 })

    let staffOid: ObjectId
    try { staffOid = new ObjectId(staffId) } catch { return NextResponse.json({ error: 'Invalid staffId' }, { status: 400 }) }

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    await Db.courseStaff.deleteOne({ _id: staffOid, courseInstanceId: id })

    syncInstanceStats(id, oid).catch(() => {})

    return NextResponse.json({ ok: true })
}
