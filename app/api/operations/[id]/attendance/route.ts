import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })

    const assignedPlatoons: string[] = attendance?.assignedPlatoons ?? []
    const existingRecords: OperationAttendanceRecord[] = attendance?.records ?? []

    // Build a map of existing records keyed by userId for quick lookup
    const recordByUserId = new Map<string, OperationAttendanceRecord>()
    for (const r of existingRecords) recordByUserId.set(r.userId, r)

    // If platoons are assigned, fetch ORBAT positions and inject pending records
    // for any member not already in the records array.
    if (assignedPlatoons.length > 0) {
        const positions = await Db.orbatPositions
            .find({ category: { $in: assignedPlatoons }, userId: { $ne: null } })
            .sort({ sectionOrder: 1, positionOrder: 1 })
            .toArray()

        for (const pos of positions) {
            if (!pos.userId || recordByUserId.has(pos.userId)) continue
            recordByUserId.set(pos.userId, {
                userId: pos.userId,
                unit: pos.sectionTitle,
                orbatSection: pos.sectionTitle,
                orbatRole: pos.role,
                rsvp: null,
                confirmed: false,
                confirmedBy: null,
                confirmedAt: null,
            })
        }
    }

    // Collect all userIds (existing records + ORBAT fill-in)
    const allRecords = Array.from(recordByUserId.values())
    const userIds = [...new Set(allRecords.map(r => r.userId))]
    const users = await Db.users.find({ $or: [{ _id: { $in: userIds } }, { id: { $in: userIds } }] }).toArray()
    const userMap = new Map<string, User>()
    for (const u of users) {
        userMap.set(u.id, u)
        userMap.set(u._id, u)
    }

    const recordsWithUsers = allRecords.map(record => ({
        ...record,
        user: userMap.get(record.userId)
            ? {
                id: userMap.get(record.userId)!.id,
                displayName: userMap.get(record.userId)!.guild?.displayName || userMap.get(record.userId)!.globalName || record.userId,
                avatarURL: userMap.get(record.userId)!.guild?.avatarURL || userMap.get(record.userId)!.avatarURL || '',
                isSkeletonAccount: userMap.get(record.userId)!.isSkeletonAccount,
                csvName: userMap.get(record.userId)!.csvName,
            }
            : null,
    }))

    if (!attendance) {
        return NextResponse.json({
            operationId: id,
            assignedPlatoons: [],
            records: [],
            reservistAssignments: [],
            rsvpOpen: false,
            confirmationOpen: false,
            recordsWithUsers,
        })
    }

    return NextResponse.json({ ...attendance, recordsWithUsers })
}

// POST /api/operations/[id]/attendance — initialise an attendance doc for an operation
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

    const body = await req.json()
    const { rsvpOpen, confirmationOpen } = body

    await Db.operationAttendance.updateOne(
        { operationId },
        {
            $setOnInsert: {
                operationId,
                assignedPlatoons: [],
                records: [],
                reservistAssignments: [],
            },
            $set: {
                ...(rsvpOpen !== undefined && { rsvpOpen }),
                ...(confirmationOpen !== undefined && { confirmationOpen }),
            },
        },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
