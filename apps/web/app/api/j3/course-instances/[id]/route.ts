import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ instance })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    // Reopen action — J3 leads / J4 only
    if (body.action === 'reopen') {
        if (!client.hasRoles(me, PERMISSIONS.training.manage)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const reason = (body.reason ?? '').toString().trim()
        if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
        if (instance.status !== 'completed') {
            return NextResponse.json({ error: 'Only completed courses can be reopened' }, { status: 409 })
        }
        const now = new Date()
        const result = await Db.courseInstances.findOneAndUpdate(
            { _id: oid },
            { $set: { status: 'in_progress', isLocked: false, updatedAt: now }, $unset: { lockedAt: '', lockedById: '', lockedByName: '' } },
            { returnDocument: 'after' },
        )
        await logAction({
            action: 'course.reopen',
            category: 'J3',
            performedBy: me.id,
            performedByName: displayName,
            department: 'J3',
            entityType: 'course_instance',
            entityId: id,
            after: { instanceRef: instance.instanceRef, reason },
        })
        return NextResponse.json({ instance: result })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    const allowed = ['status', 'notes', 'leadInstructorId', 'leadInstructorName', 'completedAt', 'cancelledAt', 'cancelledById', 'cancelledByName'] as const
    for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key]
    }

    const result = await Db.courseInstances.findOneAndUpdate(
        { _id: oid },
        { $set: updates },
        { returnDocument: 'after' },
    )

    // Lock the training record when course is completed or cancelled
    if (body.status === 'completed' || body.status === 'cancelled') {
        await Db.courseInstances.updateOne({ _id: oid }, {
            $set: { isLocked: true, lockedAt: new Date(), lockedById: me.id, lockedByName: displayName },
        }).catch(() => {})
    }

    // Log status changes
    if (body.status !== undefined && instance.status !== body.status) {
        let action: string
        if (body.status === 'completed') {
            action = 'course.close'
        } else if (body.status === 'cancelled') {
            action = 'course.cancel'
        } else if (body.status === 'archived') {
            action = 'course.archive'
        } else {
            action = 'course.status_change'
        }
        await logAction({
            action,
            category: 'J3',
            performedBy: me.id,
            performedByName: displayName,
            department: 'J3',
            entityType: 'course_instance',
            entityId: id,
            ...(action === 'course.status_change' ? { before: { status: instance.status } } : {}),
            after: { status: body.status, instanceRef: instance.instanceRef },
        })
    }

    // Sync calendar event descriptions when status changes
    if (body.status && instance.calendarEventIds && instance.calendarEventIds.length > 0) {
        const COURSE_STATUS_LABELS: Record<string, string> = {
            planning:    'Planning',
            in_progress: 'In Progress',
            completed:   'Completed',
            cancelled:   'Cancelled',
        }
        const statusLabel = COURSE_STATUS_LABELS[body.status] ?? body.status
        await Db.calendarEvents.updateMany(
            { courseInstanceId: id } as Parameters<typeof Db.calendarEvents.updateMany>[0],
            { $set: { description: `Status: ${statusLabel}` } },
        ).catch(() => {})
    }

    return NextResponse.json({ instance: result })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const deletedAt = new Date()
    await Db.courseInstances.updateOne({ _id: oid }, {
        $set: { deletedAt, deletedById: me.id, deletedByName: name, updatedAt: new Date() },
    })
    await logAction({
        action: 'course.delete',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'course_instance',
        entityId: id,
        after: { instanceRef: instance.instanceRef, deletedAt },
    })
    return NextResponse.json({ ok: true })
}
