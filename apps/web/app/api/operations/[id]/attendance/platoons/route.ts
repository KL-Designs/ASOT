import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createAttendanceTasksForOperation } from '@/lib/attendance/tasks'
import { statusForStage, type AttendanceStage } from '@/lib/operations/stage'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { ensureRosterSnapshot } from '@/lib/attendance/snapshot'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Roster management used to be gated on `admin.manageOrbat` — the ORBAT
    // *editing* permission, which is J4-Administration only. That is why nobody
    // outside J4 could manage an operation's attendance, including the J2 staff
    // who actually run operations. `attendance.manage` is the key for this job.
    //
    // Two-armed because `hasPermission` has no Discord-role fallback and does
    // not honour the J4 bypass, so a brand-new key checked only the dynamic way
    // would be false for everybody. The old key stays as a third arm so this
    // strictly widens access and cannot lock out anyone who works today.
    const canManage = (await hasPermission(me, 'attendance.manage'))
        || client.hasRoles(me, PERMISSIONS.attendance.manage)
        || client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
    if (!canManage) {
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
        // Minutes before op start, or null to clear. The absolute rsvpOpenAt
        // is derived from this below — callers never send the instant.
        rsvpOpenOffsetMins?: number | null
        rsvpCloseOffsetMins?: number
        stage?: string
    } = await req.json()

    // The open end is authored as an offset; the stored instant is derived from
    // it against the operation date, so the cron keeps its indexed date query
    // and the window still follows the operation if the date later moves (the
    // update route recomputes it there — see `date` handling in
    // api/operations/update).
    const operation = await Db.operations.findOne({ _id: operationId }, { projection: { status: 1, date: 1 } })
    const openOffset = body.rsvpOpenOffsetMins
    const derivedOpenAt = openOffset !== undefined && openOffset !== null && operation?.date
        ? new Date(new Date(operation.date).getTime() - openOffset * 60_000)
        : null

    // If that instant is already in the past, open RSVP immediately rather than
    // waiting up to five minutes for the next cron tick. Never for an operation
    // still In Development — nothing fires until it is published.
    let resolvedRsvpOpen = body.rsvpOpen
    if (derivedOpenAt && resolvedRsvpOpen === false && operation?.status !== 'In Development') {
        if (derivedOpenAt <= new Date()) resolvedRsvpOpen = true
    }

    const setFields: Record<string, unknown> = {
        assignedPlatoons: body.assignedPlatoons ?? [],
        reservistAssignments: body.reservistAssignments ?? [],
        ...(resolvedRsvpOpen !== undefined && { rsvpOpen: resolvedRsvpOpen }),
        ...(body.confirmationOpen !== undefined && { confirmationOpen: body.confirmationOpen }),
        ...(openOffset !== undefined && openOffset !== null && { rsvpOpenOffsetMins: openOffset }),
        ...(derivedOpenAt ? { rsvpOpenAt: derivedOpenAt } : {}),
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
    // Clearing the offset clears the derived instant with it — leaving a stale
    // rsvpOpenAt behind would keep the cron opening RSVP for a window the
    // editor no longer shows.
    if (openOffset === null) {
        update.$unset = { rsvpOpenAt: '', rsvpOpenOffsetMins: '' }
    }

    await Db.operationAttendance.updateOne({ operationId }, update as Parameters<typeof Db.operationAttendance.updateOne>[1], { upsert: true })

    // Mirror assignedPlatoons onto the operation document for quick reads
    await Db.operations.updateOne(
        { _id: operationId },
        { $set: { assignedPlatoons: body.assignedPlatoons ?? [] } }
    )

    // Derive the operation status from the stage.
    //
    // The editor used to do this itself, firing `GET /api/operations/update?
    // status=…` alongside every stage write from three different places. That
    // left `status` directly writable by anyone who could advance a stage,
    // which is why it could not be gated on its own — and it is the field that
    // most needs gating, since "In Development" suspends every automation.
    // Deriving it here leaves exactly one manual writer: the lifecycle
    // override, behind `operations.overrideLifecycle`.
    //
    // Only op_running and confirmations_open imply a status; going backwards
    // deliberately does not reset it, matching the previous behaviour.
    const impliedStatus = body.stage ? statusForStage(body.stage as AttendanceStage) : null
    if (impliedStatus) {
        await Db.operations.updateOne(
            { _id: operationId, status: { $ne: impliedStatus } },
            { $set: { status: impliedStatus } }
        )
    }

    // Cut the roster the first time this operation reaches rsvp_open, whether
    // that came from an explicit stage write or from RSVP being opened here.
    // `ensureRosterSnapshot` is idempotent, so the cron doing the same thing a
    // moment later is harmless — the second caller changes nothing.
    if (body.stage === 'rsvp_open' || resolvedRsvpOpen === true) {
        await ensureRosterSnapshot(operationId)
    }

    // Create section leader tasks if confirmation just opened
    if (confirmationOpeningNow && openedAt) {
        await createAttendanceTasksForOperation(operationId, body.assignedPlatoons ?? [], openedAt)
    }

    return NextResponse.json({ ok: true, rsvpOpen: resolvedRsvpOpen })
}
