import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createAttendanceTasksForOperation } from '@/lib/attendance-tasks'

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
        stage?: string
    } = await req.json()

    // If rsvpOpenAt is being set to a time already in the past, open RSVP immediately
    // rather than waiting up to a minute for the next cron tick.
    // Never auto-open for In Development operations.
    const operation = await Db.operations.findOne({ _id: operationId }, { projection: { status: 1 } })
    let resolvedRsvpOpen = body.rsvpOpen
    if (body.rsvpOpenAt && resolvedRsvpOpen === false && operation?.status !== 'In Development') {
        if (new Date(body.rsvpOpenAt) <= new Date()) {
            resolvedRsvpOpen = true
        }
    }

    const setFields: Record<string, unknown> = {
        assignedPlatoons: body.assignedPlatoons ?? [],
        reservistAssignments: body.reservistAssignments ?? [],
        ...(resolvedRsvpOpen !== undefined && { rsvpOpen: resolvedRsvpOpen }),
        ...(body.confirmationOpen !== undefined && { confirmationOpen: body.confirmationOpen }),
        ...(body.rsvpOpenAt ? { rsvpOpenAt: new Date(body.rsvpOpenAt) } : {}),
        ...(body.rsvpCloseOffsetMins !== undefined && { rsvpCloseOffsetMins: body.rsvpCloseOffsetMins }),
        ...(body.stage !== undefined && { stage: body.stage }),
    }

    // Detect confirmation open transition before mutating
    const existingAtt = await Db.operationAttendance.findOne({ operationId }, { projection: { confirmationOpen: 1 } })
    const wasConfirmationOpen = existingAtt?.confirmationOpen ?? false
    const confirmationOpeningNow = body.confirmationOpen === true && !wasConfirmationOpen
    const openedAt = confirmationOpeningNow ? new Date() : undefined

    // Stamp confirmationOpenedAt when opening confirmation so auto-close works
    if (openedAt) setFields.confirmationOpenedAt = openedAt

    const update: Record<string, unknown> = {
        $setOnInsert: {
            operationId,
            records: [],
            // Only include defaults for fields NOT already being set via $set — MongoDB
            // throws code 40 if the same path appears in both $setOnInsert and $set.
            ...(resolvedRsvpOpen === undefined && { rsvpOpen: false }),
            ...(body.confirmationOpen === undefined && { confirmationOpen: false }),
        },
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

    // Create section leader tasks if confirmation just opened
    if (confirmationOpeningNow && openedAt) {
        await createAttendanceTasksForOperation(operationId, body.assignedPlatoons ?? [], openedAt)
    }

    return NextResponse.json({ ok: true, rsvpOpen: resolvedRsvpOpen })
}
