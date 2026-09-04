import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { createAttendanceTasksForOperation } from '@/lib/attendance/tasks'
import { verifyCronSecret } from '@/lib/cron-auth'
import { getSectionLeaders } from '@/lib/orbat'
import { createNotification } from '@/lib/notifications'
import { ensureRosterSnapshot } from '@/lib/attendance/snapshot'

/**
 * GET /api/cron/operations
 *
 * Runs every 5 minutes via the server.mjs scheduler. Handles:
 *  1. RSVP auto-close       — 1 hour before op start date
 *  2. Auto-activate          — Upcoming → Active at op start time
 *  3. Confirmation auto-open — when op is marked Completed (notifies squad leaders)
 *  4. Confirmation auto-close — 24 hours after confirmation opened
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const results = { rsvpOpened: 0, rsvpClosed: 0, activatedOps: 0, confirmationOpened: 0, confirmationClosed: 0 }

    // ── 0. RSVP auto-open (fires at rsvpOpenAt) ────────────────────────────────
    //
    // `rsvpOpenAt` is derived, not authored: the editor stores a lead time
    // (`rsvpOpenOffsetMins`) and the server recomputes this instant whenever
    // that offset or the operation date changes. Reading the stored instant
    // keeps this an indexed date query rather than a per-document subtraction.

    const autoOpenCandidates = await Db.operationAttendance.find({
        rsvpOpen: { $ne: true },
        rsvpOpenAt: { $type: 'date', $lte: now },
        stage: { $nin: ['rsvp_closed', 'op_running', 'confirmations_open', 'completed'] },
    } as Parameters<typeof Db.operationAttendance.find>[0]).toArray()

    // Track IDs just opened so step 1 doesn't immediately close them in the same tick
    const justOpenedIds = new Set(autoOpenCandidates.map(a => a._id.toString()))

    for (const att of autoOpenCandidates) {
        const op = await Db.operations.findOne({ _id: att.operationId })
        // Skip operations still in development — nothing should fire until they're promoted
        if (!op || op.status === 'In Development') continue

        await Db.operationAttendance.updateOne(
            { _id: att._id },
            { $set: { rsvpOpen: true, stage: 'rsvp_open' } }
        )
        // The board's positions are cut from the ORBAT at exactly this moment.
        // Idempotent, so the editor's own ticker reaching rsvp_open first is
        // fine — whichever gets there cuts it, the other is a no-op.
        await ensureRosterSnapshot(att.operationId)
        results.rsvpOpened++
        console.log(`[cron/operations] RSVP auto-opened for att=${att._id}`)
    }

    // ── 1. RSVP auto-close (configurable offset before op start, default 60 min) ─

    const openRsvps = await Db.operationAttendance.find({ rsvpOpen: true }).toArray()
    for (const att of openRsvps) {
        // Skip records just opened in this tick — give them at least one cron cycle
        if (justOpenedIds.has(att._id.toString())) continue
        const op = await Db.operations.findOne({ _id: att.operationId })
        if (!op?.date) continue
        const offsetMins = att.rsvpCloseOffsetMins ?? 60
        const closeAt = new Date(new Date(op.date).getTime() - offsetMins * 60 * 1000)
        // Only guard against a misconfigured future window (close before open, not yet reached)
        // Once closeAt has passed, always close regardless of the openAt relationship.
        if (att.rsvpOpenAt && closeAt > now && closeAt <= new Date(att.rsvpOpenAt)) continue
        if (now >= closeAt) {
            await Db.operationAttendance.updateOne(
                { _id: att._id },
                { $set: { rsvpOpen: false, stage: 'rsvp_closed' } }
            )
            results.rsvpClosed++
            console.log(`[cron/operations] RSVP closed for op=${op._id} "${op.title}"`)

            // Allocation reminder — notify section leaders to review their section
            try {
                const leaders = await getSectionLeaders(att.assignedPlatoons ?? [])
                for (const leader of leaders) {
                    if (!leader.userId) continue
                    await createNotification({
                        userId: leader.userId,
                        type: 'system',
                        title: 'Sign-Ups Closed — Review Allocations',
                        body: `Sign-ups for "${op.title}" are now closed. Please review your section's attendance allocations before the operation.`,
                        actionUrl: `/operations/${op._id}`,
                        relatedId: op._id.toString(),
                    })
                }
            } catch (e) {
                console.error('[cron/operations] Allocation reminder failed:', e)
            }
        }
    }

    // ── 1b. CHQ allocation reminder — 1 hour before op start ─────────────────
    // Fires once per op when: RSVP is closed, op hasn't started, and any attending
    // reservist hasn't been assigned a section. Only notifies CHQ.
    try {
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
        const chqReminderCandidates = await Db.operationAttendance.find({
            rsvpOpen: false,
            chqAllocationReminderSentAt: { $exists: false },
        } as Parameters<typeof Db.operationAttendance.find>[0]).toArray()

        for (const att of chqReminderCandidates) {
            const op = await Db.operations.findOne({ _id: att.operationId })
            if (!op?.date || op.status !== 'Upcoming' || op.deletedAt) continue

            const opDate = new Date(op.date)
            // Trigger window: between now and 1 hour from now
            if (opDate > oneHourFromNow || opDate <= now) continue

            // Check if any attending reservists lack a section assignment
            const attendingReservists = (att.records ?? []).filter(r =>
                r.rsvp === 'attending' && !r.reservistSection
            )
            // Also check ORBAT positions for reservist categories
            const reservistUserIds = attendingReservists.map(r => r.userId)
            let unassignedReservists = 0
            if (reservistUserIds.length > 0) {
                const reservistPositions = await Db.orbatPositions.find({
                    category: { $in: ['activeReservist', 'inactiveReservist'] },
                    userId: { $in: reservistUserIds },
                }).toArray()
                unassignedReservists = reservistPositions.length
            }

            // Mark as sent regardless — don't spam CHQ if there's nothing to do
            await Db.operationAttendance.updateOne(
                { _id: att._id },
                { $set: { chqAllocationReminderSentAt: now } }
            )

            if (unassignedReservists === 0) continue

            // Notify CHQ (companyHQ section leaders)
            const chqLeaders = await getSectionLeaders(['companyHQ'])
            for (const leader of chqLeaders) {
                if (!leader.userId) continue
                await createNotification({
                    userId: leader.userId,
                    type: 'system',
                    title: 'Allocation Reminder — 1 Hour to Go',
                    body: `"${op.title}" starts in under 1 hour. ${unassignedReservists} reservist(s) have not been allocated to sections yet.`,
                    actionUrl: `/operations/${op._id}`,
                    relatedId: op._id.toString(),
                })
            }
            console.log(`[cron/operations] CHQ allocation reminder sent for op="${op.title}" (${unassignedReservists} unassigned reservists)`)
        }
    } catch (e) {
        console.error('[cron/operations] CHQ allocation reminder failed:', e)
    }

    // ── 2. Auto-activate (Upcoming → Active at start time) ────────────────────

    const activateResult = await Db.operations.updateMany(
        { status: 'Upcoming', date: { $lte: now }, deletedAt: { $exists: false } } as Parameters<typeof Db.operations.updateMany>[0],
        { $set: { status: 'Active' } }
    )
    results.activatedOps = activateResult.modifiedCount
    if (activateResult.modifiedCount > 0) {
        console.log(`[cron/operations] ${activateResult.modifiedCount} op(s) set to Active`)
        // Mirror stage onto attendance docs for newly activated ops
        const activatedOps = await Db.operations
            .find({ status: 'Active', date: { $lte: now }, deletedAt: { $exists: false } } as Parameters<typeof Db.operations.find>[0])
            .project<{ _id: import('mongodb').ObjectId }>({ _id: 1 })
            .toArray()
        for (const op of activatedOps) {
            await Db.operationAttendance.updateOne(
                { operationId: op._id, stage: { $nin: ['op_running', 'confirmations_open', 'completed'] } } as Parameters<typeof Db.operationAttendance.updateOne>[0],
                { $set: { stage: 'op_running' } }
            )
        }
    }

    // ── 3. Confirmation auto-open (op marked Completed, not yet opened) ────────

    const completedOps = await Db.operations
        .find({ status: 'Completed', deletedAt: { $exists: false } })
        .toArray()

    for (const op of completedOps) {
        // Only trigger once — confirmationOpenedAt unset means never auto-opened
        const att = await Db.operationAttendance.findOne({
            operationId: op._id,
            confirmationOpen: false,
            rsvpOpen: false,
            confirmationOpenedAt: { $exists: false },
        } as Parameters<typeof Db.operationAttendance.findOne>[0])

        if (!att) continue

        const openedAt = new Date()
        await Db.operationAttendance.updateOne(
            { _id: att._id },
            { $set: { confirmationOpen: true, confirmationOpenedAt: openedAt, stage: 'confirmations_open' } }
        )
        results.confirmationOpened++
        console.log(`[cron/operations] Confirmation opened for op=${op._id} "${op.title}"`)

        await createAttendanceTasksForOperation(op._id, att.assignedPlatoons ?? [], openedAt)
    }

    // ── 4. Confirmation auto-close (24 hours after opened) ─────────────────────

    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const closeResult = await Db.operationAttendance.updateMany(
        {
            confirmationOpen: true,
            confirmationOpenedAt: { $lte: cutoff },
        } as Parameters<typeof Db.operationAttendance.updateMany>[0],
        { $set: { confirmationOpen: false, stage: 'completed' } }
    )
    results.confirmationClosed = closeResult.modifiedCount
    if (closeResult.modifiedCount > 0) {
        console.log(`[cron/operations] Confirmation closed for ${closeResult.modifiedCount} op(s)`)
    }

    return NextResponse.json(results)
}
