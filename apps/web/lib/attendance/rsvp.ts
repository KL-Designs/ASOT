import type { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { releaseMember } from '@/lib/attendance/roster'

/**
 * A member's answer to "are you coming": attending, or not.
 *
 * Shared by the two places an answer can come from — the site's own RSVP route
 * and the buttons on the Discord attendance post — so the same answer has the
 * same effect whichever one it was given through.
 */
export type RsvpResult = { ok: true } | { ok: false; status: number; error: string }

export async function applyRsvp(
    operationId: ObjectId,
    userId: string,
    status: 'attending' | 'not_attending',
    extra: { reservistSection?: string; reservistRole?: string } = {},
): Promise<RsvpResult> {
    const { reservistSection, reservistRole } = extra

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance) return { ok: false, status: 404, error: 'Attendance not open for this operation' }
    if (!attendance.rsvpOpen) return { ok: false, status: 403, error: 'Sign-ups are not open for this operation' }

    // Get the member's ORBAT position for section/role info
    const orbatPos = await Db.orbatPositions.findOne({ userId })

    const existingRecord = attendance.records.find(r => r.userId === userId)

    if (existingRecord) {
        // `orbatRole` is deliberately NOT written here.
        //
        // It used to be: joining another section overwrote it with the role
        // taken there, and leaving overwrote it back from the live ORBAT. Both
        // destroyed the only record of where the member actually belongs, so
        // "put them back" became guesswork and a member whose ORBAT position
        // changed mid-operation silently had their history rewritten.
        //
        // A member's position *for an operation* is now the roster's business
        // (`roster[].occupantUserId`, see lib/attendance/roster.ts), which is a
        // separate field precisely so it cannot clobber ORBAT identity. This
        // record keeps the identity; the roster keeps the assignment.
        await Db.operationAttendance.updateOne(
            { operationId, 'records.userId': userId },
            { $set: {
                'records.$.rsvp': status,
                'records.$.reservistSection': status === 'not_attending' ? null : reservistSection ?? null,
            } }
        )
    } else {
        const newRecord: OperationAttendanceRecord = {
            userId,
            unit: orbatPos?.category ?? 'unknown',
            orbatSection: orbatPos?.sectionTitle ?? '',
            orbatRole: reservistRole ?? orbatPos?.role ?? '',
            rsvp: status,
            confirmed: false,
            confirmedBy: null,
            confirmedAt: null,
            ...(reservistSection ? { reservistSection } : {}),
        }
        await Db.operationAttendance.updateOne(
            { operationId },
            { $push: { records: newRecord } }
        )
    }

    // Declining anywhere has to take the member out of the position they hold.
    //
    // This predates the board and only ever wrote the record, so a member who
    // answered no here stayed stored as their slot's occupant. `viewRoster`
    // refuses to draw them there — it derives the occupant from the answer —
    // but leaving the stored roster contradicting the record means staff moves
    // and auto-fill are working from a position that looks taken.
    //
    // Only the release, deliberately. Reclaiming a home position on the way
    // back in displaces whoever took it and owes them a notification, and that
    // belongs with the board's own route where both already live.
    if (status === 'not_attending' && attendance.roster?.length) {
        const released = releaseMember(attendance.roster, userId)
        if (released !== attendance.roster) {
            // `rosterRev` moves with it. The board's writes are guarded on that
            // counter, so a roster written without bumping it would be silently
            // overwritten by any board write already in flight.
            await Db.operationAttendance.updateOne(
                { operationId },
                { $set: { roster: released }, $inc: { rosterRev: 1 } },
            )
        }
    }

    return { ok: true }
}
