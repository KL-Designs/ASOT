import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendDM } from '@/lib/discord/bot'

/**
 * GET /api/cron/operations?secret=...
 *
 * Runs every 5 minutes via the server.mjs scheduler. Handles:
 *  1. RSVP auto-close       — 1 hour before op start date
 *  2. Auto-activate          — Upcoming → Active at op start time
 *  3. Confirmation auto-open — when op is marked Completed (notifies squad leaders)
 *  4. Confirmation auto-close — 24 hours after confirmation opened
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const results = { rsvpOpened: 0, rsvpClosed: 0, activatedOps: 0, confirmationOpened: 0, confirmationClosed: 0 }

    // ── 0. RSVP auto-open (fires at rsvpOpenAt) ────────────────────────────────

    const autoOpenCandidates = await Db.operationAttendance.find({
        rsvpOpen: false,
        rsvpOpenAt: { $type: 'date', $lte: now },
    } as Parameters<typeof Db.operationAttendance.find>[0]).toArray()

    // Track IDs just opened so step 1 doesn't immediately close them in the same tick
    const justOpenedIds = new Set(autoOpenCandidates.map(a => a._id.toString()))

    for (const att of autoOpenCandidates) {
        await Db.operationAttendance.updateOne(
            { _id: att._id },
            { $set: { rsvpOpen: true, stage: 'rsvp_open' } }
        )
        results.rsvpOpened++
        console.log(`[cron/operations] RSVP auto-opened for att=${att._id}`)

        // Notify all members in assigned platoons (same pattern as confirmation-open)
        if (att.assignedPlatoons.length > 0) {
            const op = await Db.operations.findOne({ _id: att.operationId })
            if (op) {
                const positions = await Db.orbatPositions
                    .find({ category: { $in: att.assignedPlatoons }, userId: { $ne: null } })
                    .project<{ userId: string }>({ userId: 1 })
                    .toArray()
                const userIds = [...new Set(positions.map(p => p.userId!))]
                await Promise.all(userIds.map(userId =>
                    createNotification({
                        userId,
                        type: 'task_assigned',
                        title: 'RSVP is now open',
                        body: `${op.title} — submit your attendance`,
                        actionUrl: `/operations/${op._id.toString()}`,
                        relatedId: op._id.toString(),
                    }).catch(() => {})
                ))
            }
        }
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
        }
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

        // Notify all squad leaders (isSenior=true) in assigned platoons
        if (att.assignedPlatoons.length > 0) {
            const leaders = await Db.orbatPositions
                .find({ category: { $in: att.assignedPlatoons }, isSenior: true, userId: { $ne: null } })
                .toArray()

            const opId = op._id.toString()
            const actionUrl = `/operations/${opId}`
            const base = process.env.NEXT_PUBLIC_BASEURL ?? ''

            await Promise.all(leaders.map(async pos => {
                if (!pos.userId) return
                // In-app notification
                await createNotification({
                    userId: pos.userId,
                    type: 'system',
                    title: 'Attendance confirmation open',
                    body: `${op.title} — confirm your section's attendance`,
                    actionUrl,
                    relatedId: opId,
                })
                // Discord DM
                await sendDM(pos.userId, {
                    embeds: [{
                        title: '📋 Attendance Confirmation',
                        description: `**${op.title}** — confirm your section's attendance.\nYou have **24 hours** before confirmation closes.`,
                        color: 0xdb001d,
                        fields: [{ name: '\u200b', value: `[View Operation](${base}${actionUrl})`, inline: false }],
                        footer: { text: 'ASOT Member Portal' },
                        timestamp: openedAt.toISOString(),
                    }],
                }).catch(() => {})
            }))
        }
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
