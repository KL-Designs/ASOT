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
    if (!attendance) {
        // Return an empty attendance doc shape so the UI can render without data
        return NextResponse.json({
            operationId: id,
            assignedPlatoons: [],
            records: [],
            reservistAssignments: [],
            rsvpOpen: false,
            confirmationOpen: false,
            recordsWithUsers: [],
        })
    }

    // Populate user details for each record
    const userIds = [...new Set(attendance.records.map(r => r.userId))]
    const users = await Db.users.find({ $or: [{ _id: { $in: userIds } }, { id: { $in: userIds } }] }).toArray()
    const userMap = new Map<string, User>()
    for (const u of users) {
        userMap.set(u.id, u)
        userMap.set(u._id, u)
    }

    const recordsWithUsers = attendance.records.map(record => ({
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
