import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { releaseMember } from '@/lib/attendance/roster'

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
        // `orbatRole` is deliberately NOT written here.
        //
        // It used to be: joining another section overwrote it with the role
        // taken there, and leaving overwrote it back from the live ORBAT. Both
        // destroyed the only record of where the member actually belongs, so
        // "put them back" became guesswork and a member whose ORBAT position
        // changed mid-operation silently had their history rewritten.
        //
        // A member's position *for an operation* is now the roster's business
        // (`roster[].occupantUserId`, see lib/attendance/roster.ts), which is a
        // separate field precisely so it cannot clobber ORBAT identity. This
        // record keeps the identity; the roster keeps the assignment.
        await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': me.id },
            { $set: {
                'records.$.rsvp': status,
                'records.$.reservistSection': status === 'not_attending' ? null : reservistSection ?? null,
            } }
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

    // Declining anywhere has to take the member out of the position they hold.
    //
    // This route predates the board and only ever wrote the record, so a member
    // who answered no here stayed stored as their slot's occupant. `viewRoster`
    // refuses to draw them there — it derives the occupant from the answer —
    // but leaving the stored roster contradicting the record means staff moves
    // and auto-fill are working from a position that looks taken.
    //
    // Only the release, deliberately. Reclaiming a home position on the way
    // back in displaces whoever took it and owes them a notification, and that
    // belongs with the board's own route where both already live.
    if (status === 'not_attending' && attendance.roster?.length) {
        const released = releaseMember(attendance.roster, me.id)
        if (released !== attendance.roster) {
            // `rosterRev` moves with it. The board's writes are guarded on that
            // counter, so a roster written without bumping it would be silently
            // overwritten by any board write already in flight.
            await Db.operationAttendance.updateOne(
                { operationId },
                { $set: { roster: released }, $inc: { rosterRev: 1 } },
            )
        }
    }

    return NextResponse.json({ ok: true })
}
