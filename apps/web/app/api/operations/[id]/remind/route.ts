import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotification } from '@/lib/notifications'
import { can } from '@/lib/operations/permissions'

/** POST /api/operations/[id]/remind — notify All Staff who haven't yet acknowledged orders */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!(await can(me, 'schedule.manage')) &&
            !(await hasPermission(me, 'departmentLeads.j2'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const op = await Db.operations.findOne(
        { _id: new ObjectId(id) },
        { projection: { title: 1, acknowledgements: 1 } }
    )
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const acknowledgedIds = new Set((op.acknowledgements ?? []).map(a => a.userId))
    const opTitle: string = op.title ?? 'Unknown Operation'

    // Find all All Staff users who haven't acknowledged
    const allStaff = await Db.users
        .find({ 'guild.roles': 'All Staff' })
        .project<{ _id: string }>({ _id: 1 })
        .toArray()

    const unacknowledged = allStaff.filter(u => !acknowledgedIds.has(u._id.toString()))

    for (const u of unacknowledged) {
        await createNotification({
            userId: u._id.toString(),
            type: 'system',
            title: 'Orders Acknowledgement Reminder',
            body: `Please acknowledge you have read the orders for "${opTitle}".`,
            actionUrl: `/operations/${id}`,
            relatedId: id,
        })
    }

    return NextResponse.json({ ok: true, sent: unacknowledged.length })
}
