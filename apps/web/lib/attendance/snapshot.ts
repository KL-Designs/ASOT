import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import {
    buildRoster, orderPositions, snapshotCategories,
    type OrbatSnapshotPosition, type RosterSlot,
} from './roster'

/**
 * Taking an operation's roster: which ORBAT positions it is cut from, when the
 * cut happens, and why it only ever happens once.
 *
 * The roster is a snapshot rather than a live read of the ORBAT because the
 * ORBAT is edited continuously and an operation's board must not change shape
 * underneath the people looking at it — least of all a completed one, whose
 * board is a record of what happened. It also gives staff something they can
 * shape per-operation: extra slots for a night that needs two medics, and
 * slots at all for custom sections, which have no ORBAT positions to read.
 */

/**
 * Build the roster an operation *would* have if cut right now, without writing
 * it. Shared by the automatic cut at RSVP open and the deliberate re-take, so
 * the two can never disagree about what a roster is made of.
 */
export async function buildRosterForOperation(assignedPlatoons: string[]): Promise<RosterSlot[]> {
    const categories = snapshotCategories(assignedPlatoons)
    const positions = await Db.orbatPositions.find({ category: { $in: categories } }).toArray()

    // `roleId` is an ObjectId on the position and a string on the slot: the
    // roster is JSON that goes over the wire to the board, so it cannot hold
    // BSON types. Converted here rather than cast, because a cast would have
    // silently shipped ObjectIds into the document.
    const snapshot: OrbatSnapshotPosition[] = positions.map(p => ({
        category: p.category,
        sectionTitle: p.sectionTitle,
        role: p.role,
        roleId: p.roleId ? String(p.roleId) : null,
        userId: p.userId,
        sectionOrder: p.sectionOrder,
        positionOrder: p.positionOrder,
    }))

    return buildRoster(orderPositions(snapshot, categories))
}

/**
 * Cut the roster for an operation, once.
 *
 * Called from every path that moves an operation into `rsvp_open` — the cron,
 * the editor's own ticker, and a manual Advance — so it must be safe to call
 * repeatedly. The guard is the write itself: the update only matches documents
 * that have no roster yet, so a second caller changes nothing rather than
 * replacing a roster people are already standing in.
 *
 * Returns the roster if this call created it, and null if there already was
 * one. Callers use that to decide whether anything is worth broadcasting.
 *
 * Deliberately re-cutting an existing roster is a separate, destructive
 * operation — see the `resnapshot` action in the roster route.
 */
export async function ensureRosterSnapshot(operationId: ObjectId): Promise<RosterSlot[] | null> {
    const existing = await Db.operationAttendance.findOne(
        { operationId },
        { projection: { roster: 1, assignedPlatoons: 1 } },
    )
    if (existing?.roster?.length) return null

    const roster = await buildRosterForOperation(existing?.assignedPlatoons ?? [])

    const result = await Db.operationAttendance.updateOne(
        { operationId, $or: [{ roster: { $exists: false } }, { roster: { $size: 0 } }] },
        { $set: { roster, rosterTakenAt: new Date() } },
    )

    // Lost the race to a concurrent caller — theirs is the roster now.
    return result.modifiedCount > 0 ? roster : null
}
