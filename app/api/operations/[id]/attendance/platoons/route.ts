import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const body: {
        assignedPlatoons: string[]
        reservistAssignments: { userId: string; sectionTitle: string }[]
        rsvpOpen?: boolean
        confirmationOpen?: boolean
        rsvpOpenAt?: string | null   // ISO datetime or null to clear
        rsvpCloseOffsetMins?: number
    } = await req.json()

    const setFields: Record<string, unknown> = {
        assignedPlatoons: body.assignedPlatoons ?? [],
        reservistAssignments: body.reservistAssignments ?? [],
        ...(body.rsvpOpen !== undefined && { rsvpOpen: body.rsvpOpen }),
        ...(body.confirmationOpen !== undefined && { confirmationOpen: body.confirmationOpen }),
        ...(body.rsvpOpenAt ? { rsvpOpenAt: new Date(body.rsvpOpenAt) } : {}),
        ...(body.rsvpCloseOffsetMins !== undefined && { rsvpCloseOffsetMins: body.rsvpCloseOffsetMins }),
    }

    const update: Record<string, unknown> = {
        $setOnInsert: { operationId, records: [] },
        $set: setFields,
    }
    if (body.rsvpOpenAt === null) {
        update.$unset = { rsvpOpenAt: '' }
    }

    await Db.operationAttendance.updateOne({ operationId }, update as Parameters<typeof Db.operationAttendance.updateOne>[1], { upsert: true })

    // Mirror assignedPlatoons onto the operation document for quick reads
    await Db.operations.updateOne(
        { _id: operationId },
        { $set: { assignedPlatoons: body.assignedPlatoons ?? [] } }
    )

    return NextResponse.json({ ok: true })
}
