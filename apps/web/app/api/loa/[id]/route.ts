import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

/** PATCH /api/loa/[id] — approve or reject a LOA. Section leader or J4 only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const loa = await Db.memberLoas.findOne({ _id: new ObjectId(id) })
    if (!loa) return NextResponse.json({ error: 'LOA not found' }, { status: 404 })
    if (loa.status !== 'pending') return NextResponse.json({ error: 'LOA already reviewed' }, { status: 409 })

    const isAssignedApprover = loa.requiredApproverUserId === me.id
    const isJ4 = client.hasRoles(me, ['J4-Administration'])
    if (!isAssignedApprover && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { decision, reviewNote } = body
    if (decision !== 'approve' && decision !== 'reject') return NextResponse.json({ error: 'decision must be approve or reject' }, { status: 400 })

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    await Db.memberLoas.updateOne({ _id: new ObjectId(id) }, {
        $set: {
            status: decision === 'approve' ? 'approved' : 'rejected',
            reviewedById: me.id,
            reviewedByName: displayName,
            reviewedAt: now,
            ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
        },
    })

    // Notify the submitter
    await createNotification({
        userId: loa.userId,
        type: 'task_assigned',
        title: decision === 'approve' ? 'LOA approved' : 'LOA rejected',
        body: decision === 'approve'
            ? `Your leave request (${loa.startDate} – ${loa.endDate}) has been approved by ${displayName}`
            : `Your leave request (${loa.startDate} – ${loa.endDate}) was rejected by ${displayName}${reviewNote?.trim() ? `: ${reviewNote.trim()}` : ''}`,
        actionUrl: '/dashboard/personnel/all-staff' as string,
        relatedId: id,
    })

    return NextResponse.json({ ok: true })
}
