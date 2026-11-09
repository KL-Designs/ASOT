import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { toBoardUser } from '@/lib/attendance/board-user'
import { logAction } from '@/lib/logAction'
import { canCommend, viewableSections } from '@/lib/operations/aar-access'
import { actorName, loadAarContext } from '@/lib/operations/aar-context'
import {
    aarOpen, canWriteSection, didAttend, sectionLead, validRating, writableSections,
} from '@/lib/operations/aar'

/**
 * `/api/operations/{id}/aar` — the After Action Report.
 *
 * GET returns everything the tab needs in one read: the viewer's own write-up
 * and feedback, whether they are entitled to leave either, and — for a 1IC or
 * for staff — the sections they are responsible for, with each member's record
 * and AAR attached.
 *
 * One payload rather than several because the tab is one screen and a member
 * who led a section is looking at their own report and their section's at the
 * same time. Splitting it would mean the page rendered in three stages.
 */

interface SectionMember {
    userId: string
    name: string
    role: string
    rsvp: OperationAttendanceRecord['rsvp']
    confirmed: boolean
    attendanceType: string | null
    /** Added by a roll call rather than placed on the roster. */
    late?: boolean
    aar: { fix: string; sustain: string; improve: string; writtenByName: string | null } | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await can(me, 'aar.view'))) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })
    const open = aarOpen(attendance?.stage ?? null)
    const roster = attendance?.roster ?? []
    const records = attendance?.records ?? []

    const myRecord = records.find(r => r.userId === me.id)
    const heldAPosition = roster.some(slot => slot.occupantUserId === me.id)
    const attended = didAttend(myRecord, heldAPosition)

    const canManageAll = await can(me, 'aar.manage')
    // Positional first (led it, or was in its platoon's headquarters), granted
    // second — see `writableSections`.
    const mySections = writableSections(roster, me.id, canManageAll)

    // Late joiners: on no slot, tied to a section only by their record.
    const onRoster = new Set(roster.filter(s => s.occupantUserId).map(s => s.occupantUserId as string))
    const lateJoiners = records.filter(r => r.lateJoinSection && !onRoster.has(r.userId))

    /*
     * Everything for the sections this viewer is responsible for, in one pass.
     * A 1IC leads one section and staff see all of them, so this is between one
     * and a dozen — small enough to assemble rather than paginate.
     */
    const aars = await Db.operationAars.find({ operationId }).toArray()
    const aarByUser = new Map(aars.map(a => [a.userId, a]))

    const memberIds = [...new Set([
        ...roster.filter(s => s.occupantUserId && mySections.includes(s.sectionTitle))
            .map(s => s.occupantUserId as string),
        ...lateJoiners.filter(r => mySections.includes(r.lateJoinSection as string)).map(r => r.userId),
    ])]
    const users = memberIds.length
        ? await Db.users.find({ $or: [{ _id: { $in: memberIds } }, { id: { $in: memberIds } }] }).toArray()
        : []
    const userMap = new Map<string, User>()
    for (const u of users) {
        userMap.set(u.id, u)
        userMap.set(u._id, u)
    }

    const toMember = (userId: string, role: string, late: boolean): SectionMember => {
        const record = records.find(r => r.userId === userId)
        const aar = aarByUser.get(userId)
        const u = userMap.get(userId)
        return {
            userId,
            // The board's own name composition — rank plus member
            // name, with the same fallbacks — so a member reads the
            // same on the AAR as they do on the roster they came from.
            name: u ? toBoardUser(u, userId).displayName : userId,
            role,
            rsvp: record?.rsvp ?? null,
            confirmed: !!record?.confirmed,
            attendanceType: record?.attendanceType ?? null,
            ...(late ? { late: true } : {}),
            aar: aar
                ? { fix: aar.fix, sustain: aar.sustain, improve: aar.improve, writtenByName: aar.writtenByName }
                : null,
        }
    }

    const sections = mySections.map(title => ({
        title,
        leadUserId: sectionLead(roster, title),
        members: [
            ...roster
                .filter(slot => slot.sectionTitle === title && slot.occupantUserId)
                .sort((a, b) => a.order - b.order)
                .map(slot => toMember(slot.occupantUserId as string, slot.role, false)),
            // After the roster, in the order they were added.
            ...lateJoiners
                .filter(r => r.lateJoinSection === title)
                .map(r => toMember(r.userId, 'Late joiner', true)),
        ],
    }))

    const mine = aarByUser.get(me.id) ?? null
    const ctx = await loadAarContext(operationId, me)
    const feedback = ctx.feedback

    return NextResponse.json({
        open,
        attended,
        canManageAll,
        mySections,
        // Row 328: the consolidated view, and who may skip "write yours first".
        unlocked: ctx.unlocked,
        bypass: ctx.bypass,
        viewableSections: viewableSections(roster, me.id, ctx.standing),
        canCommend: canCommend(roster, me.id, ctx.standing),
        missionAar: {
            enabled: ctx.missionAarEnabled,
            canToggle: ctx.standing.isMissionMaker || ctx.standing.isJ4,
            scope: ctx.hasCampaign ? 'campaign' : 'operation',
        },
        mine: mine
            ? { fix: mine.fix, sustain: mine.sustain, improve: mine.improve, writtenByName: mine.writtenByName }
            : null,
        feedback: feedback
            ? { server: feedback.server, combat: feedback.combat, story: feedback.story, enjoyment: feedback.enjoyment ?? null, comment: feedback.comment }
            : null,
        sections,
    })
}

/**
 * PUT writes one AAR and/or this member's feedback.
 *
 * Two things in one call because the tab saves as one form. `userId` names
 * whose AAR is being written; omitting it means your own, which is the case
 * that has to stay simple.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await can(me, 'aar.write'))) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })
    // The tab does not exist before this, so a write arriving before it is
    // either a stale client or somebody poking the endpoint.
    if (!aarOpen(attendance?.stage ?? null)) {
        return NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 })
    }

    const roster = attendance?.roster ?? []
    const records = attendance?.records ?? []
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })

    const canManageAll = await can(me, 'aar.manage')
    const now = new Date()

    /* ── The write-up ───────────────────────────────────────────────────── */

    if (body.aar) {
        const targetId: string = typeof body.aar.userId === 'string' ? body.aar.userId : me.id
        const slot = roster.find(s => s.occupantUserId === targetId)
        const targetRecord = records.find(r => r.userId === targetId)
        const section = slot?.sectionTitle
            ?? targetRecord?.lateJoinSection
            ?? targetRecord?.orbatSection
            ?? ''

        // Your own is always yours. Somebody else's needs the section.
        const allowed = targetId === me.id
            || canWriteSection(roster, me.id, section, canManageAll)
        if (!allowed) {
            return NextResponse.json({ error: 'Not your section to write up' }, { status: 403 })
        }

        const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 8000) : ''
        const byAnother = targetId !== me.id

        await Db.operationAars.updateOne(
            { operationId, userId: targetId },
            {
                $set: {
                    section,
                    fix: text(body.aar.fix),
                    sustain: text(body.aar.sustain),
                    improve: text(body.aar.improve),
                    /*
                     * Cleared when the member writes their own, so an entry
                     * their 1IC started and they then rewrote reads as theirs
                     * again. Attribution should follow the last hand on it.
                     */
                    writtenByUserId: byAnother ? me.id : null,
                    writtenByName: byAnother ? (me.guild?.displayName || me.globalName || me.username || null) : null,
                    updatedAt: now,
                },
                $setOnInsert: { operationId, userId: targetId, createdAt: now },
            },
            { upsert: true },
        )
        // Row 328: somebody else's report is changed on the record.
        if (byAnother) {
            await logAction({
                action: 'operations.aar.editOther',
                category: 'operation',
                performedBy: me.id,
                performedByName: actorName(me),
                entityType: 'operationAar',
                entityId: id,
                actionUrl: `/operations/${id}/aar`,
                target: targetId,
                details: { section },
            })
        }
    }

    /* ── How the night went ─────────────────────────────────────────────── */

    if (body.feedback) {
        const myRecord = records.find(r => r.userId === me.id)
        const heldAPosition = roster.some(s => s.occupantUserId === me.id)
        // Feedback is only worth having from people who were there, and this is
        // the one gate a permission cannot express.
        if (!didAttend(myRecord, heldAPosition)) {
            return NextResponse.json({ error: 'Only members who attended can leave feedback' }, { status: 403 })
        }

        const score = (v: unknown) => validRating(v) ? v : null
        await Db.operationFeedback.updateOne(
            { operationId, userId: me.id },
            {
                $set: {
                    server: score(body.feedback.server),
                    combat: score(body.feedback.combat),
                    story: score(body.feedback.story),
                    enjoyment: score(body.feedback.enjoyment),
                    comment: typeof body.feedback.comment === 'string' ? body.feedback.comment.slice(0, 4000) : '',
                    updatedAt: now,
                },
                $setOnInsert: { operationId, userId: me.id, createdAt: now },
            },
            { upsert: true },
        )
    }

    return NextResponse.json({ ok: true })
}
