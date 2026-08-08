import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'

/** POST /api/operations/[id]/publish — transition status In Development → Upcoming, notify All Staff */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
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
    await createNotificationForRole(PERMISSIONS.departmentLeads.j2[0], {
        type: 'system',
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
