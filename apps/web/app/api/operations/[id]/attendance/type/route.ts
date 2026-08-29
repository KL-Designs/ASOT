import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { can } from '@/lib/operations/permissions'

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
    const isAllStaff = await can(me, 'attendance.confirm')
    if (!orbatPos?.isSenior && !isAllStaff && !isHQ) {
        return NextResponse.json({ error: 'Only section leaders or staff can set attendance types' }, { status: 403 })
    }

    const { userId, attendanceType } = await req.json() as { userId: string; attendanceType: string | null }
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    if (attendanceType === null) {
        // Clearing a type — only meaningful if a record already exists
        await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': userId },
            { $unset: { 'records.$.attendanceType': '' } }
        )
    } else {
        // Try to update an existing record first
        const result = await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': userId },
            { $set: { 'records.$.attendanceType': attendanceType } }
        )

        // No record found — member is in the ORBAT but hasn't RSVPed yet.
        // Create a minimal record with their ORBAT position data so the type is persisted.
        if (result.matchedCount === 0) {
            const pos = await Db.orbatPositions.findOne({ userId })
            await Db.operationAttendance.updateOne(
                { operationId },
                {
                    $push: {
                        records: {
                            userId,
                            unit: pos?.sectionTitle ?? '',
                            orbatSection: pos?.sectionTitle ?? '',
                            orbatRole: pos?.role ?? '',
                            rsvp: null,
                            confirmed: false,
                            confirmedBy: null,
                            confirmedAt: null,
                            attendanceType,
                        } as any,
                    },
                }
            )
        }
    }

    return NextResponse.json({ ok: true })
}
