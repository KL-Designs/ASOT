import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { logAction } from '@/lib/logAction'
import {
    aarOpen, attendanceStatus, canWriteSection, SELECTABLE_STATUSES,
} from '@/lib/operations/aar'

/**
 * `POST /api/operations/{id}/aar/attendance` — the 1IC's roll call.
 *
 * One section at a time, submitted as a status per member: did each person on
 * the roster actually turn up, and if not, why. This is the confirmation step
 * that used to live on the attendance board, moved to where the rest of the
 * post-operation work happens.
 *
 * ## Two authorities, and only one of them is a permission
 *
 * The section's 1IC may submit for their own section — positional authority,
 * resolved from the roster by `sectionLead()`, because they led it on the night
 * and no grant was ever made for that. Whoever was in a platoon's headquarters
 * may submit for that platoon's sections, on the same footing. Holders of
 * `aar.manage` may submit for any section, which exists so somebody can close
 * an operation out when a 1IC never does.
 *
 * ## Late joiners
 *
 * Somebody who turned up without ever being on the roster is named in
 * `lateJoiners` alongside their status. They get a record carrying
 * `lateJoinSection`, and from then on belong to the section's roll call like
 * anybody else.
 *
 * The old route keyed off the ORBAT's `isSenior` flag instead — who leads the
 * section *on paper*. The two disagree on exactly the nights this matters: a
 * stand-in commander is an ordinary Saturday, and the paper leader who was not
 * there cannot say who was.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance) return NextResponse.json({ error: 'No attendance record' }, { status: 404 })
    if (!aarOpen(attendance.stage ?? null)) {
        return NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const sectionTitle: unknown = body?.sectionTitle
    const statuses: unknown = body?.statuses
    if (typeof sectionTitle !== 'string' || !sectionTitle) {
        return NextResponse.json({ error: 'sectionTitle is required' }, { status: 400 })
    }
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) {
        return NextResponse.json({ error: 'statuses must be a map of userId to status' }, { status: 400 })
    }

    const roster = attendance.roster ?? []
    const canManageAll = await can(me, 'aar.manage')
    if (!canWriteSection(roster, me.id, sectionTitle, canManageAll)) {
        return NextResponse.json({ error: 'Not your section to confirm' }, { status: 403 })
    }

    /*
     * Only people who were actually on this section's roster. Without this a
     * 1IC could confirm anybody on the operation by naming them in the body —
     * the section scope would be decoration rather than a boundary.
     */
    const sectionMembers = new Set(
        roster.filter(s => s.sectionTitle === sectionTitle && s.occupantUserId)
            .map(s => s.occupantUserId as string),
    )
    const rosterSection = new Map(
        roster.filter(s => s.occupantUserId).map(s => [s.occupantUserId as string, s.sectionTitle]),
    )
    const priorRecords = attendance.records ?? []
    // Late joiners an earlier roll call already added to this section.
    for (const r of priorRecords) {
        if (r.lateJoinSection === sectionTitle && !rosterSection.has(r.userId)) sectionMembers.add(r.userId)
    }

    /*
     * New late joiners. Each has to be a real account, and somebody already on
     * the night elsewhere is not a late joiner — moving them is the roster's
     * job, and letting it happen here would let one section's 1IC confirm a
     * member out from under another's.
     */
    const lateJoiners: string[] = Array.isArray(body?.lateJoiners)
        ? [...new Set((body.lateJoiners as unknown[]).filter((v): v is string => typeof v === 'string' && !!v))]
            .filter(userId => !sectionMembers.has(userId))
        : []
    if (lateJoiners.length > 30) {
        return NextResponse.json({ error: 'Too many late joiners in one submission' }, { status: 400 })
    }
    for (const userId of lateJoiners) {
        const elsewhere = rosterSection.get(userId)
            ?? priorRecords.find(r => r.userId === userId && r.lateJoinSection)?.lateJoinSection
        if (elsewhere) {
            return NextResponse.json({ error: `That member is already on this operation in ${elsewhere}` }, { status: 400 })
        }
    }
    if (lateJoiners.length) {
        const found = await Db.users
            .find(
                { $or: [{ _id: { $in: lateJoiners } }, { id: { $in: lateJoiners } }], isSkeletonAccount: { $ne: true } },
                { projection: { _id: 1, id: 1 } },
            )
            .toArray()
        const known = new Set(found.flatMap(u => [String(u._id), u.id]))
        if (lateJoiners.some(userId => !known.has(userId))) {
            return NextResponse.json({ error: 'Unknown member in lateJoiners' }, { status: 400 })
        }
        for (const userId of lateJoiners) sectionMembers.add(userId)
    }
    const addedLate = new Set(lateJoiners)

    /*
     * What is actually being set. A blank is a member the 1IC has not decided
     * on yet. A discontinued status (Confirm) that is already on the record is
     * left exactly as it is — which is what lets a past operation be
     * re-submitted untouched, while nothing new can be set to one.
     */
    const selectable = new Set(SELECTABLE_STATUSES.map(s => s.value))
    const priorStatus = new Map(priorRecords.map(r => [r.userId, r.attendanceType]))
    const submitted: Record<string, string> = {}
    for (const [userId, status] of Object.entries(statuses as Record<string, unknown>)) {
        if (!sectionMembers.has(userId)) {
            return NextResponse.json({ error: `${userId} was not in ${sectionTitle}` }, { status: 400 })
        }
        if (status === '' || status === null) continue
        if (typeof status !== 'string') {
            return NextResponse.json({ error: `Unknown status: ${String(status)}` }, { status: 400 })
        }
        if (!selectable.has(status) && status === priorStatus.get(userId)) continue
        if (!selectable.has(status)) {
            return NextResponse.json({ error: `Unknown status: ${String(status)}` }, { status: 400 })
        }
        submitted[userId] = status
    }

    const now = new Date()
    const records: OperationAttendanceRecord[] = [...priorRecords]

    /*
     * A member can be on the roster without ever having a record — they were
     * placed into a slot but never RSVPed. The roll call is the first thing
     * that has an opinion about them, so it creates the record.
     */
    const existing = new Set(records.map(r => r.userId))
    for (const userId of Object.keys(submitted)) {
        if (existing.has(userId)) continue
        const slot = roster.find(s => s.occupantUserId === userId)
        records.push({
            userId,
            unit: sectionTitle,
            orbatSection: sectionTitle,
            orbatRole: slot?.role ?? (addedLate.has(userId) ? 'Late joiner' : ''),
            rsvp: null,
            confirmed: false,
            confirmedBy: null,
            confirmedAt: null,
        })
    }

    /*
     * Who is newly present, so the billet rollup below counts each member once
     * however many times the roll call is submitted. The route this replaces
     * incremented on every submission, so a 1IC who corrected one status handed
     * everybody in the section another night's credit.
     */
    const newlyPresent: string[] = []

    const updated = records.map(record => {
        const status = submitted[record.userId]
        if (typeof status !== 'string') return record

        const present = attendanceStatus(status)?.present ?? false
        if (present && !record.confirmed) newlyPresent.push(record.userId)

        return {
            ...record,
            attendanceType: status,
            confirmed: present,
            confirmedBy: me.id,
            confirmedAt: present ? now : null,
            ...(addedLate.has(record.userId) ? { lateJoinSection: sectionTitle } : {}),
        }
    })

    await Db.operationAttendance.updateOne({ operationId }, { $set: { records: updated } })

    if (newlyPresent.length) {
        await Db.users.bulkWrite(newlyPresent.map(userId => ({
            updateOne: {
                filter: { $or: [{ _id: userId }, { id: userId }] },
                update: { $inc: { 'milpac.billetCounts.primaryNightOps': 1 } },
            },
        })))
    }

    await logAction({
        action: 'operation.aar.confirm',
        category: 'operation',
        performedBy: me.id,
        performedByName: me.guild?.displayName || me.username || me.id,
        entityType: 'operation',
        entityId: id,
        after: {
            sectionTitle, confirmed: newlyPresent.length, submitted: Object.keys(submitted).length,
            ...(lateJoiners.length ? { lateJoiners } : {}),
        },
    }).catch(() => {})

    return NextResponse.json({ ok: true, confirmed: newlyPresent.length })
}
