import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { toBoardUser } from '@/lib/attendance/board-user'
import { canSee, farEnoughAhead, holdsNight, isActive } from '@/lib/training/nco-assessment'
import { ncoActor, sectionOf, toNcoView } from '@/lib/training/nco-actor'

const J3_LEAD_ROLES = ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer']

/**
 * `/api/nco-assessments` — requesting and listing NCO assessments.
 *
 * GET returns the assessments the caller may see (see `canSee`), each with the
 * steps they may take on it, plus what the request form needs: the mission
 * nights far enough ahead to ask for, with the taken ones marked, and — for a
 * J3 lead — who can be assigned. `?operationId=` narrows it to one night, which
 * is what the attendance board's marker asks for.
 *
 * POST is the candidate asking for a night.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const actor = await ncoActor(me)
    const now = new Date()

    const operationId = req.nextUrl.searchParams.get('operationId')
    if (operationId) {
        if (!ObjectId.isValid(operationId)) return NextResponse.json({ error: 'Invalid operationId' }, { status: 400 })
        const onNight = await Db.ncoAssessments
            .find({ operationId: new ObjectId(operationId), status: { $in: ['assigned', 'confirmed', 'completed'] } })
            .toArray()
        return NextResponse.json({ assessments: onNight.filter(a => canSee(actor, a)).map(a => toNcoView(a, actor)) })
    }

    // Everything still in play, and what finished in the last three months.
    const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const [all, operations] = await Promise.all([
        Db.ncoAssessments
            .find({ $or: [{ status: { $in: ['requested', 'assigned', 'confirmed'] } }, { updatedAt: { $gte: since } }] })
            .sort({ operationDate: 1 })
            .toArray(),
        // Only nights a member can already see: an operation still in
        // development is not something to book an assessment against.
        Db.operations
            .find(
                { deletedAt: { $exists: false }, status: 'Upcoming', date: { $gte: now } },
                { projection: { title: 1, date: 1 } },
            )
            .sort({ date: 1 })
            .limit(40)
            .toArray(),
    ])

    const taken = new Set(all.filter(a => holdsNight(a.status)).map(a => String(a.operationId)))
    const mine = new Set(all.filter(a => a.candidateId === me.id && isActive(a.status)).map(a => String(a.operationId)))

    const assessors = actor.isJ3Lead
        ? (await Db.users
            .find({ departments: 'j3', discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
            .toArray())
            .map(u => ({ id: u.id, name: toBoardUser(u, u.id).displayName }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : []

    return NextResponse.json({
        myId: me.id,
        isJ3Lead: actor.isJ3Lead,
        assessments: all.filter(a => canSee(actor, a)).map(a => toNcoView(a, actor)),
        nights: operations.map(op => ({
            operationId: String(op._id),
            title: op.title,
            date: new Date(op.date).toISOString(),
            tooSoon: !farEnoughAhead(op.date, now),
            taken: taken.has(String(op._id)),
            mine: mine.has(String(op._id)),
        })),
        assessors,
    })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    if (typeof body.operationId !== 'string' || !ObjectId.isValid(body.operationId)) {
        return NextResponse.json({ error: 'Pick a mission night.' }, { status: 400 })
    }
    const operationId = new ObjectId(body.operationId)
    const now = new Date()

    const operation = await Db.operations.findOne(
        { _id: operationId, deletedAt: { $exists: false }, status: 'Upcoming' },
        { projection: { title: 1, date: 1 } },
    )
    if (!operation) return NextResponse.json({ error: 'That mission night is not open for requests.' }, { status: 404 })
    if (!farEnoughAhead(operation.date, now)) {
        return NextResponse.json({ error: 'An assessment has to be requested at least a week ahead.' }, { status: 400 })
    }

    const onNight = await Db.ncoAssessments.find({ operationId }).toArray()
    if (onNight.some(a => holdsNight(a.status))) {
        return NextResponse.json({ error: 'That night already has an assessment booked.' }, { status: 409 })
    }
    if (onNight.some(a => a.candidateId === me.id && isActive(a.status))) {
        return NextResponse.json({ error: 'You have already asked for that night.' }, { status: 409 })
    }

    const candidateName = toBoardUser(me, me.id).displayName
    const assessment: NcoAssessment = {
        _id: new ObjectId(),
        operationId,
        operationTitle: operation.title,
        operationDate: new Date(operation.date),
        candidateId: me.id,
        candidateName,
        candidateSection: await sectionOf(me.id),
        notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 1500) : '',
        status: 'requested',
        createdAt: now,
        updatedAt: now,
    }
    await Db.ncoAssessments.insertOne(assessment)

    await Promise.all(J3_LEAD_ROLES.map(role => createNotificationForRole(role, {
        type: 'nco_assessment',
        title: 'NCO assessment requested',
        body: `${candidateName} has asked to be assessed on ${operation.title}. An assessor needs assigning.`,
        actionUrl: '/dashboard/unit/training-docs?tab=assessments',
        relatedId: String(assessment._id),
    })))

    logAction({
        action: 'training.nco.request', category: 'training', department: 'j3',
        performedBy: me.id, performedByName: candidateName,
        entityType: 'nco_assessment', entityId: String(assessment._id), target: operation.title,
    }).catch(console.error)

    return NextResponse.json(toNcoView(assessment, await ncoActor(me)), { status: 201 })
}
