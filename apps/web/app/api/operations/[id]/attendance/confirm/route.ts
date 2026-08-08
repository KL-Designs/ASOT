import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'

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

    // Verify caller is a section leader, HQ, or All Staff
    const orbatPos = await Db.orbatPositions.findOne({ userId: me.id })
    const isHQ = client.hasRoles(me, ['HQ Staff'])
    const isAllStaff = await hasPermission(me, 'attendance.confirm')
    if (!orbatPos?.isSenior && !isAllStaff) {
        return NextResponse.json({ error: 'Only section leaders or staff can confirm attendance' }, { status: 403 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance) {
        return NextResponse.json({ error: 'No attendance record for this operation' }, { status: 404 })
    }
    if (!attendance.confirmationOpen) {
        return NextResponse.json({ error: 'Confirmation is not open for this operation' }, { status: 403 })
    }

    const { confirmedUserIds, sectionTitle: bodySectionTitle }: { confirmedUserIds: string[]; sectionTitle?: string } = await req.json()
    if (!Array.isArray(confirmedUserIds)) {
        return NextResponse.json({ error: 'confirmedUserIds must be an array' }, { status: 400 })
    }

    const now = new Date()

    // Section leaders are scoped to their own ORBAT section.
    // HQ/All Staff are scoped to the section they submitted for (from the request body),
    // so confirming one section at a time doesn't wipe confirmations for other sections.
    const sectionFilter = orbatPos?.isSenior && !isHQ ? (orbatPos.sectionTitle ?? null) : (bodySectionTitle ?? null)

    // Ensure every confirmed userId has a record in attendance.records.
    // ORBAT members who never RSVPed won't have a record yet — look them up and create minimal ones.
    const records: OperationAttendanceRecord[] = [...(attendance.records ?? [])]
    const existingIds = new Set(records.map(r => r.userId))
    const missingIds = confirmedUserIds.filter(uid => !existingIds.has(uid))
    if (missingIds.length > 0) {
        const positions = await Db.orbatPositions.find({ userId: { $in: missingIds } }).toArray()
        const posMap = new Map(positions.map(p => [p.userId as string, p]))
        for (const uid of missingIds) {
            const pos = posMap.get(uid)
            records.push({
                userId: uid,
                unit: pos?.sectionTitle ?? sectionFilter ?? '',
                orbatSection: pos?.sectionTitle ?? sectionFilter ?? '',
                orbatRole: pos?.role ?? '',
                rsvp: null,
                confirmed: false,
                confirmedBy: null,
                confirmedAt: null,
            })
        }
    }

    // Mark confirmed/unconfirmed for the caller's section
    const updatedRecords = records.map(record => {
        // Only touch records in this section leader's section (or all if HQ)
        if (sectionFilter && record.orbatSection !== sectionFilter) return record

        const didAttend = confirmedUserIds.includes(record.userId)
        return {
            ...record,
            confirmed: didAttend,
            confirmedBy: me.id,
            confirmedAt: didAttend ? now : null,
            // Default to 'ATTENDED' when confirmed and no type has been explicitly set
            ...(didAttend && !record.attendanceType ? { attendanceType: 'ATTENDED' } : {}),
        }
    })

    await Db.operationAttendance.updateOne(
        { operationId },
        { $set: { records: updatedRecords } }
    )

    // Roll up confirmed attendance into billetCounts for confirmed users
    // Count how many nights each user was confirmed for this operation
    const confirmedNightsByUser = new Map<string, number>()
    for (const record of updatedRecords) {
        if (!record.confirmed) continue
        if (sectionFilter && record.orbatSection !== sectionFilter) continue
        confirmedNightsByUser.set(record.userId, (confirmedNightsByUser.get(record.userId) ?? 0) + 1)
    }

    const bulkOps = []
    for (const [userId, nights] of confirmedNightsByUser) {
        // 1 night = primaryNightOps +1, 2 nights = secondaryNightOps +1
        const isPrimary = nights >= 1
        const isSecondary = nights >= 2
        bulkOps.push({
            updateOne: {
                filter: { $or: [{ _id: userId }, { id: userId }] },
                update: {
                    $inc: {
                        ...(isPrimary && { 'milpac.billetCounts.primaryNightOps': 1 }),
                        ...(isSecondary && { 'milpac.billetCounts.secondaryNightOps': 1 }),
                    },
                },
            },
        })
    }

    if (bulkOps.length > 0) {
        await Db.users.bulkWrite(bulkOps)
    }

    return NextResponse.json({ ok: true, confirmed: confirmedNightsByUser.size })
}
