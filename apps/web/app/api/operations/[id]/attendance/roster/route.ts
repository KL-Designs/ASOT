import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { assignSlot, autoFill, derivePool, viewRoster, type RosterSlot } from '@/lib/attendance/roster'
import { logAction } from '@/lib/logAction'
import { isMemberAction, type BoardAction } from '@/lib/attendance/actions'

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
        if (!att.roster?.length) {
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

        let roster: RosterSlot[] = att.roster
        const recordOps: Record<string, unknown> = {}

        switch (body.action) {
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
                const mine = roster.find(s => s.occupantUserId === me.id)
                if (!mine) return NextResponse.json({ ok: true, rev })
                roster = assignSlot(roster, mine.id, null)
                break
            }

            case 'prefer': {
                // A preference is a signal, not a claim: it leaves the member in
                // the pool for staff or auto-fill to place. Stating one means
                // stepping out of whatever position they hold.
                const mine = roster.find(s => s.occupantUserId === me.id)
                if (mine) roster = assignSlot(roster, mine.id, null)
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
                // a second one. The id is namespaced so it cannot collide with
                // an ORBAT-derived id, which is built from section coordinates.
                roster = [...roster, {
                    id: `custom-${rev}-${roster.length}`,
                    category: body.category,
                    sectionTitle: body.sectionTitle,
                    role: body.role,
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

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
        }

        // The guard: this only matches if nothing else has written since the
        // read above. A miss means somebody else moved the board, so recompute
        // against theirs rather than clobbering it.
        const result = await Db.operationAttendance.updateOne(
            { operationId, ...(rev === 0 ? {} : { rosterRev: rev }) } as Parameters<typeof Db.operationAttendance.updateOne>[0],
            { $set: { roster }, $inc: { rosterRev: 1 } },
        )
        if (result.modifiedCount === 0) continue

        if (Object.keys(recordOps).length > 0) await upsertRecordFields(operationId, me.id, recordOps)

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
