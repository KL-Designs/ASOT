import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import {
    assignSlot, autoFill, derivePool, reclaimHome, releaseMember, viewRoster, type RosterSlot,
} from '@/lib/attendance/roster'
import { createNotification } from '@/lib/notifications'
import { sendPositionReclaimedDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'
import { isMemberAction, type BoardAction } from '@/lib/attendance/actions'
import { roleAllowedIn } from '@/lib/orbat/roleScope'
import { buildRosterForOperation } from '@/lib/attendance/snapshot'

/**
 * Every write to the live attendance board.
 *
 * Two audiences share one route because they share one invariant — a member
 * occupies exactly one position — and splitting them would mean two places
 * enforcing it. What differs is authority, and that is decided per action
 * below rather than at the door.
 *
 * ## Concurrency
 *
 * Twenty-odd people use this board at once on operation night, and two of them
 * clicking the same empty slot is the normal case, not the edge case. Every
 * write is therefore computed from a revision and only lands if that revision
 * is still current; the loser is told the board moved rather than silently
 * overwriting the winner. `rosterRev` doubles as the value the live board
 * broadcasts, so one counter serves both concurrency and sync.
 *
 * ## The freeze
 *
 * Members may move themselves only while RSVP is open. Past that the board is
 * staff-only, and that is enforced here rather than by disabling a button —
 * a disabled button is a courtesy to honest users, not a permission check.
 */

/** How many times to recompute against a moved board before giving up. */
const MAX_ATTEMPTS = 3

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

    const body = await req.json() as BoardAction
    if (!body?.action) return NextResponse.json({ error: 'No action' }, { status: 400 })

    // See PERMISSIONS.attendance.manage: three-armed because `hasPermission`
    // has no Discord-role fallback and does not honour the J4 bypass, and the
    // legacy ORBAT key must keep working for whoever relies on it today.
    const canManage = (await hasPermission(me, 'attendance.manage'))
        || client.hasRoles(me, PERMISSIONS.attendance.manage)
        || client.hasRoles(me, PERMISSIONS.admin.manageOrbat)

    if (!isMemberAction(body) && !canManage) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const att = await Db.operationAttendance.findOne({ operationId })
        if (!att) return NextResponse.json({ error: 'No attendance for this operation' }, { status: 404 })
        // Every action but one operates on an existing roster. `resnapshot`
        // creates one, so it is also the way to cut a board for an operation
        // whose RSVP opened before rosters existed.
        if (!att.roster?.length && body.action !== 'resnapshot') {
            return NextResponse.json({ error: 'The roster has not been cut yet' }, { status: 409 })
        }

        const rev = att.rosterRev ?? 0
        const rsvpOpen = att.stage === 'rsvp_open'
        const rsvpClosed = !rsvpOpen && att.stage !== 'preparing'

        // A member moving themselves is only allowed inside the window. Staff
        // are not bound by it — filling the gaps after close is their whole job.
        if (isMemberAction(body) && !canManage && !rsvpOpen) {
            return NextResponse.json(
                { error: 'RSVP has closed. Ask a staff member to change your position.' },
                { status: 403 },
            )
        }

        const ctx = {
            rsvp: Object.fromEntries((att.records ?? []).map(r => [r.userId, r.rsvp])),
            rsvpClosed,
        }

        let roster: RosterSlot[] = att.roster ?? []
        const recordOps: Record<string, unknown> = {}
        /** Set when reclaiming a home position turfed somebody out of it. */
        let displaced: { userId: string; sectionTitle: string; role: string } | null = null

        switch (body.action) {
            case 'attend': {
                recordOps.rsvp = 'attending'

                // Changing your mind gets your own position back. A full-timer
                // who declines opens their position, somebody from the pool
                // takes it, and then they re-attend — the position is theirs,
                // so it returns to them and the stand-in goes back to the pool.
                //
                // A member already standing somewhere else is left alone: that
                // was a deliberate choice, not a gap to be corrected — a
                // full-timer in 1-1 who went and claimed a reservist position in
                // 1-3 should not be hauled home for confirming they are coming.
                //
                // With no home position at all this does nothing, which is
                // right: they are attending and in no slot, so the pool lists
                // them from the next render.
                const home = roster.find(x => x.homeUserId === me.id)
                const reclaimed = reclaimHome(roster, me.id)
                roster = reclaimed.roster
                if (reclaimed.displaced && home) {
                    displaced = {
                        userId: reclaimed.displaced,
                        sectionTitle: home.sectionTitle,
                        role: home.role,
                    }
                }
                break
            }

            case 'decline': {
                // Out of everything, in one write: the position they were
                // standing in, and the reservist pool — which is derived from
                // who is available, so the answer itself takes them out of it.
                // The preference goes too, or re-attending months later would
                // silently carry a wish nobody remembers making.
                roster = releaseMember(roster, me.id)
                recordOps.rsvp = 'not_attending'
                recordOps.preferredSection = null
                recordOps.preferredRole = null
                break
            }

            case 'claim': {
                const slot = viewRoster(roster, ctx).find(s => s.id === body.slotId)
                if (!slot) return NextResponse.json({ error: 'No such position' }, { status: 404 })
                if (!slot.available) {
                    return NextResponse.json({ error: 'That position was just taken' }, { status: 409 })
                }
                roster = assignSlot(roster, body.slotId, me.id)
                // Taking a position is a statement of intent, so it answers the
                // RSVP too — otherwise a member is in a slot and still shows as
                // not having replied.
                recordOps.rsvp = 'attending'
                recordOps.preferredSection = null
                recordOps.preferredRole = null
                break
            }

            case 'leave': {
                const released = releaseMember(roster, me.id)
                // Same array back means they were not in one — nothing to write,
                // and no revision bump for the rest of the board to react to.
                if (released === roster) return NextResponse.json({ ok: true, rev })
                roster = released
                break
            }

            case 'prefer': {
                // A preference is a signal, not a claim: it leaves the member in
                // the pool for staff or auto-fill to place. Stating one means
                // stepping out of whatever position they hold.
                roster = releaseMember(roster, me.id)
                recordOps.rsvp = 'attending'
                recordOps.preferredSection = body.preferredSection
                recordOps.preferredRole = body.preferredRole
                break
            }

            case 'assign': {
                if (!roster.some(s => s.id === body.slotId)) {
                    return NextResponse.json({ error: 'No such position' }, { status: 404 })
                }
                roster = assignSlot(roster, body.slotId, body.userId)
                break
            }

            case 'autofill': {
                const eligible = (att.records ?? [])
                    .filter(r => r.rsvp === 'attending')
                    .map(r => ({
                        userId: r.userId,
                        preferredSection: r.preferredSection ?? null,
                        preferredRole: r.preferredRole ?? null,
                    }))
                roster = autoFill(roster, derivePool(roster, eligible), ctx).roster
                break
            }

            case 'addSlot': {
                // Hand-authored positions are how a custom section gets any
                // positions at all, and how a night that needs two medics gets
                // a second one.
                let roleDoc
                try {
                    roleDoc = await Db.orbatRoles.findOne({ _id: new ObjectId(body.roleId) })
                } catch {
                    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
                }
                if (!roleDoc) return NextResponse.json({ error: 'No such role' }, { status: 404 })

                // The picker only offers roles valid for this category, but a
                // filtered dropdown is a convenience and not a rule — the ORBAT
                // restricts some roles to particular platoons and that has to
                // hold against a request that did not come from the picker.
                if (!roleAllowedIn(roleDoc, body.category)) {
                    return NextResponse.json(
                        { error: `${roleDoc.name} cannot be used in this platoon.` },
                        { status: 400 },
                    )
                }

                roster = [...roster, {
                    // Namespaced so it cannot collide with an ORBAT-derived id,
                    // which is built from section coordinates. The revision makes
                    // it unique even if a position is added, removed and re-added.
                    id: `custom-${rev}-${roster.length}`,
                    category: body.category,
                    sectionTitle: body.sectionTitle,
                    role: roleDoc.name,
                    roleId: String(roleDoc._id),
                    order: roster.filter(s => s.sectionTitle === body.sectionTitle).length,
                    homeUserId: null,
                    occupantUserId: null,
                }]
                break
            }

            case 'removeSlot': {
                roster = roster.filter(s => s.id !== body.slotId)
                break
            }

            case 'resnapshot': {
                // A clean re-cut, not a merge. Everyone attending falls back
                // into the pool, and ORBAT holders are pencilled into their own
                // positions again — which is the state the board would have had
                // if RSVP had opened now.
                roster = await buildRosterForOperation(att.assignedPlatoons ?? [])
                if (roster.length === 0) {
                    return NextResponse.json(
                        { error: 'No ORBAT positions for the assigned units — nothing to snapshot.' },
                        { status: 400 },
                    )
                }
                break
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
        }

        // The guard: this only matches if nothing else has written since the
        // read above. A miss means somebody else moved the board, so recompute
        // against theirs rather than clobbering it.
        const result = await Db.operationAttendance.updateOne(
            {
                operationId,
                // A document written before this field existed has no rosterRev
                // at all, so `{ rosterRev: 0 }` would never match it and the
                // first write would go through unguarded — the one write most
                // likely to be raced, since everybody arrives at once when RSVP
                // opens. Absent counts as zero.
                ...(rev === 0
                    ? { $or: [{ rosterRev: 0 }, { rosterRev: { $exists: false } }] }
                    : { rosterRev: rev }),
            } as Parameters<typeof Db.operationAttendance.updateOne>[0],
            {
                $set: { roster, ...(body.action === 'resnapshot' ? { rosterTakenAt: new Date() } : {}) },
                $inc: { rosterRev: 1 },
            },
        )
        if (result.modifiedCount === 0) continue

        if (Object.keys(recordOps).length > 0) await upsertRecordFields(operationId, me.id, recordOps)

        // Only after the write has actually landed, so a retry against a moved
        // board cannot send the same person two notifications for one change.
        if (displaced) await notifyDisplaced(operationId, id, displaced)

        await logAction({
            action: `attendance.${body.action}`,
            category: 'operation',
            performedBy: me.id,
            performedByName: me.guild?.displayName || me.username || me.id,
            entityType: 'operation',
            entityId: id,
        })

        return NextResponse.json({ ok: true, rev: rev + 1, roster })
    }

    return NextResponse.json(
        { error: 'The board changed while you were moving. Try again.' },
        { status: 409 },
    )
}

/**
 * Tell a member their position was taken back by the person it belongs to.
 *
 * Both channels, on purpose: they chose that position deliberately and are no
 * longer in it, and a site notification alone would not reach them until they
 * next opened the board — possibly after the operation had started.
 *
 * Never throws. Losing a notification is not a reason to fail a board write
 * that has already succeeded.
 */
async function notifyDisplaced(
    operationId: ObjectId,
    operationIdStr: string,
    displaced: { userId: string; sectionTitle: string; role: string },
) {
    try {
        const op = await Db.operations.findOne({ _id: operationId }, { projection: { title: 1 } })
        const name = op?.title ?? 'an operation'
        const actionUrl = `/operations/${operationIdStr}`

        await createNotification({
            userId: displaced.userId,
            type: 'attendance_position_reclaimed',
            title: 'Your position was taken back',
            body: `${displaced.sectionTitle} · ${displaced.role} on ${name} belongs to a member who has now marked themselves attending. You are back in the reservist pool — pick another position or set a preference.`,
            actionUrl,
            relatedId: operationIdStr,
        })

        await sendPositionReclaimedDM(
            displaced.userId, name, displaced.sectionTitle, displaced.role, actionUrl,
        )
    } catch (err) {
        console.error('[attendance] could not notify displaced member', err)
    }
}

/**
 * Set fields on a member's attendance record, creating it if this is the first
 * thing they have done for the operation.
 *
 * Two statements rather than one because a positional update cannot create the
 * element it is trying to address, and a member claiming a position may well
 * have no record yet.
 */
async function upsertRecordFields(operationId: ObjectId, userId: string, fields: Record<string, unknown>) {
    const setters = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`records.$.${k}`, v]))
    const res = await Db.operationAttendance.updateOne(
        { operationId, 'records.userId': userId },
        { $set: setters } as Parameters<typeof Db.operationAttendance.updateOne>[1],
    )
    if (res.matchedCount > 0) return

    await Db.operationAttendance.updateOne({ operationId }, {
        $push: {
            records: {
                userId,
                unit: '',
                orbatSection: '',
                orbatRole: '',
                rsvp: null,
                confirmed: false,
                confirmedBy: null,
                confirmedAt: null,
                ...fields,
            } as OperationAttendanceRecord,
        },
    })
}
