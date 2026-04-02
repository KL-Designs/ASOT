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

    // Verify caller is a section leader (isSenior in their ORBAT position) or HQ
    const orbatPos = await Db.orbatPositions.findOne({ userId: me.id })
    const isHQ = client.hasRoles(me, ['HQ Staff'])
    if (!orbatPos?.isSenior && !isHQ) {
        return NextResponse.json({ error: 'Only section leaders can confirm attendance' }, { status: 403 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance) {
        return NextResponse.json({ error: 'No attendance record for this operation' }, { status: 404 })
    }
    if (!attendance.confirmationOpen) {
        return NextResponse.json({ error: 'Confirmation is not open for this operation' }, { status: 403 })
    }

    const { confirmedUserIds }: { confirmedUserIds: string[] } = await req.json()
    if (!Array.isArray(confirmedUserIds)) {
        return NextResponse.json({ error: 'confirmedUserIds must be an array' }, { status: 400 })
    }

    const sectionTitle = orbatPos?.sectionTitle ?? null
    const now = new Date()

    // For section leaders: only confirm records in their own section
    // For HQ: can confirm any section
    const sectionFilter = isHQ ? null : sectionTitle

    // Mark confirmed/unconfirmed for the caller's section
    const updatedRecords = attendance.records.map(record => {
        // Only touch records in this section leader's section (or all if HQ)
        if (sectionFilter && record.orbatSection !== sectionFilter) return record

        const didAttend = confirmedUserIds.includes(record.userId)
        return {
            ...record,
            confirmed: didAttend,
            confirmedBy: me.id,
            confirmedAt: didAttend ? now : null,
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
