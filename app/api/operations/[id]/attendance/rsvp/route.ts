import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

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

    const { status, reservistSection, reservistRole }: { status: 'attending' | 'not_attending'; reservistSection?: string; reservistRole?: string } = await req.json()
    if (status !== 'attending' && status !== 'not_attending') {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance) {
        return NextResponse.json({ error: 'Attendance not open for this operation' }, { status: 404 })
    }
    if (!attendance.rsvpOpen) {
        return NextResponse.json({ error: 'RSVP is not open for this operation' }, { status: 403 })
    }

    // Get the member's ORBAT position for section/role info
    const orbatPos = await Db.orbatPositions.findOne({ userId: me.id })

    const existingRecord = attendance.records.find(r => r.userId === me.id)

    if (existingRecord) {
        // Update existing record's RSVP and reservist section
        await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': me.id },
            { $set: { 'records.$.rsvp': status, 'records.$.reservistSection': (status === 'not_attending' ? null : reservistSection ?? null), ...(reservistSection && status !== 'not_attending'
            ? (reservistRole !== undefined ? { 'records.$.orbatRole': reservistRole } : {})
            : (orbatPos?.role !== undefined ? { 'records.$.orbatRole': orbatPos.role } : {})) } }
        )
    } else {
        // Insert new record
        const newRecord: OperationAttendanceRecord = {
            userId: me.id,
            unit: orbatPos?.category ?? 'unknown',
            orbatSection: orbatPos?.sectionTitle ?? '',
            orbatRole: reservistRole ?? orbatPos?.role ?? '',
            rsvp: status,
            confirmed: false,
            confirmedBy: null,
            confirmedAt: null,
            ...(reservistSection ? { reservistSection } : {}),
        }
        await Db.operationAttendance.updateOne(
            { operationId },
            { $push: { records: newRecord } }
        )
    }

    return NextResponse.json({ ok: true })
}
