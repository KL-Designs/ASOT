import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// POST /api/operations/[id]/attendance/type
// Body: { userId: string, attendanceType: string | null }
// Sets (or clears) the visual attendance type flag on a record.
// Requires section leader, HQ, or all-staff. No confirmationOpen check — can be set any time.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const orbatPos = await Db.orbatPositions.findOne({ userId: me.id })
    const isHQ = client.hasRoles(me, ['HQ Staff'])
    const isAllStaff = client.hasRoles(me, PERMISSIONS.attendance.confirm)
    if (!orbatPos?.isSenior && !isAllStaff && !isHQ) {
        return NextResponse.json({ error: 'Only section leaders or staff can set attendance types' }, { status: 403 })
    }

    const { userId, attendanceType } = await req.json() as { userId: string; attendanceType: string | null }
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    if (attendanceType === null) {
        await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': userId },
            { $unset: { 'records.$.attendanceType': '' } }
        )
    } else {
        await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': userId },
            { $set: { 'records.$.attendanceType': attendanceType } }
        )
    }

    return NextResponse.json({ ok: true })
}
