import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { can } from '@/lib/operations/permissions'
import { createNotification } from '@/lib/notifications'
import { getGrantedUserIds } from '@/lib/permissions/tree'
import { stageIndex } from '@/lib/operations/stage'

/** POST /api/operations/[id]/publish — transition status In Development → Upcoming, notify All Staff */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!(await can(me, 'orders.write'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const op = await Db.operations.findOne(
        { _id: new ObjectId(id) },
        { projection: { title: 1, status: 1, department: 1 } }
    )
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (op.status !== 'In Development') {
        return NextResponse.json({ error: 'Operation is not In Development' }, { status: 409 })
    }

    await Db.operations.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'Upcoming' } }
    )

    const meUser = await Db.users.findOne({ _id: me.id as any }, { projection: { displayName: 1 } })
    const performedByName: string = (meUser as any)?.displayName ?? me.username ?? 'Unknown'

    // Notify All Staff that the operation orders are ready
    const opTitle: string = op.title ?? 'Unknown Operation'
    await createNotificationForRole('All Staff', {
        type: 'system',
        title: 'Operation Published',
        body: `"${opTitle}" has been published and is now Upcoming. Orders are ready for review.`,
        actionUrl: `/operations/${id}`,
        relatedId: id,
    })

    // Also notify J2 leads
    await notifyJ2Leads({
        title: 'Operation Published',
        body: `"${opTitle}" has been published by ${performedByName}.`,
        actionUrl: `/operations/${id}/edit`,
        relatedId: id,
    })

    await logAction({
        action: 'operation.publish',
        category: 'system',
        performedBy: me.id,
        performedByName,
        entityType: 'operation',
        entityId: id,
        target: opTitle,
        before: { status: 'In Development' },
        after: { status: 'Upcoming' },
    })

    return NextResponse.json({ ok: true })
}

/**
 * J2 leads, found through the permissions resolver: `departmentLeads.j2` is
 * granted by department and ORBAT roles, which a Discord role-name lookup (what
 * this route used to do) misses. Notifications are keyed by the user's `_id`.
 */
async function notifyJ2Leads(input: { title: string; body: string; actionUrl: string; relatedId: string }) {
    const leads = await Db.users
        .find({ id: { $in: await getGrantedUserIds('departmentLeads.j2') }, discharged: { $exists: false } })
        .project<{ _id: string }>({ _id: 1 })
        .toArray()
    await Promise.all(leads.map(u => createNotification({ userId: u._id.toString(), type: 'system', ...input })))
}

/**
 * DELETE /api/operations/[id]/publish — take a published operation back to In
 * Development.
 *
 * For orders that went out too early or need pulling for rework. Only while it
 * is Upcoming and has not started: once the op is running, its attendance and
 * AAR hang off it being live. If sign-ups were open they close (the stage goes
 * back to Preparing) because members can no longer see the operation to
 * answer; the sign-ups already given are kept, so publishing again picks up
 * where it left off. All Staff, who were told it was published, are told it
 * has been withdrawn.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await can(me, 'orders.write'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })

    const oid = new ObjectId(id)
    const op = await Db.operations.findOne({ _id: oid }, { projection: { title: 1, status: 1 } })
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (op.status !== 'Upcoming') {
        return NextResponse.json({ error: 'Only an Upcoming operation can be unpublished' }, { status: 409 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId: oid }, { projection: { stage: 1 } })
    const stage = attendance?.stage ?? null
    if (stageIndex(stage) >= stageIndex('op_running')) {
        return NextResponse.json({ error: 'The operation has already started' }, { status: 409 })
    }

    await Db.operations.updateOne({ _id: oid }, { $set: { status: 'In Development' } })
    const signUpsClosed = stage === 'rsvp_open' || stage === 'rsvp_closed'
    if (signUpsClosed) {
        await Db.operationAttendance.updateOne({ operationId: oid }, { $set: { stage: 'preparing' } })
    }

    const performedByName = me.guild?.displayName || me.globalName || me.username || 'Unknown'
    const opTitle: string = op.title ?? 'Unknown Operation'

    await createNotificationForRole('All Staff', {
        type: 'system',
        title: 'Operation Withdrawn',
        body: `"${opTitle}" has been taken back into development. Its orders are no longer out for review.`,
        actionUrl: '/operations',
        relatedId: id,
    })
    await notifyJ2Leads({
        title: 'Operation Unpublished',
        body: `"${opTitle}" was unpublished by ${performedByName}.${signUpsClosed ? ' Sign-ups were closed; the answers already given are kept.' : ''}`,
        actionUrl: `/operations/${id}/edit`,
        relatedId: id,
    })

    await logAction({
        action: 'operation.unpublish',
        category: 'system',
        performedBy: me.id,
        performedByName,
        entityType: 'operation',
        entityId: id,
        target: opTitle,
        before: { status: 'Upcoming', stage },
        after: { status: 'In Development', stage: signUpsClosed ? 'preparing' : stage },
    })

    return NextResponse.json({ ok: true, signUpsClosed })
}
