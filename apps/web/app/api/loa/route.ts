import { NextRequest, NextResponse } from 'next/server'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { createNotification, createNotificationForRole } from '@/lib/notifications'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

/** GET /api/loa — list LOAs for the current user (own + incoming for approval). */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = req.nextUrl
    const mode = searchParams.get('mode') ?? 'mine'

    if (mode === 'incoming') {
        // Section leader view: LOAs where I am the required approver
        const loas = await Db.memberLoas
            .find({ requiredApproverUserId: me.id })
            .sort({ issuedAt: -1 })
            .toArray()
        return NextResponse.json({ loas: loas.map(l => ({ ...l, _id: l._id!.toString() })) })
    }

    const loas = await Db.memberLoas
        .find({ userId: me.id })
        .sort({ issuedAt: -1 })
        .toArray()
    return NextResponse.json({ loas: loas.map(l => ({ ...l, _id: l._id!.toString() })) })
}

/** POST /api/loa — submit a leave of absence request. */
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { startDate, endDate, reason } = body

    if (!startDate || !endDate || !reason?.trim()) {
        return NextResponse.json({ error: 'startDate, endDate, and reason are required' }, { status: 400 })
    }

    if (new Date(startDate) >= new Date(endDate)) {
        return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })
    }

    // Check no overlapping pending/approved LOA
    const overlapping = await Db.memberLoas.findOne({
        userId: me.id,
        status: { $in: ['pending', 'approved'] },
        $or: [
            { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
        ],
    })
    if (overlapping) {
        return NextResponse.json({ error: 'You already have an LOA that overlaps with the requested period' }, { status: 409 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    // Find section leader for routing
    const myPos = await Db.orbatPositions.findOne({ userId: me.id })
    let requiredApproverUserId: string | undefined
    let requiredApproverName: string | undefined

    if (myPos && !RESERVIST_CATEGORY_IDS.includes(myPos.category)) {
        const leaderPos = await Db.orbatPositions.findOne({
            category: myPos.category,
            sectionTitle: myPos.sectionTitle,
            positionOrder: 0,
            userId: { $nin: [null, me.id] },
        })
        if (leaderPos?.userId) {
            const leaderUser = await Db.users.findOne({ id: leaderPos.userId })
            requiredApproverUserId = leaderPos.userId
            requiredApproverName = leaderUser
                ? (leaderUser.guild?.nickname || leaderUser.guild?.displayName || leaderUser.globalName || leaderUser.username || leaderPos.userId)
                : leaderPos.userId
        }
    }

    const loa: Omit<MemberLoa, '_id'> = {
        userId: me.id,
        userName: displayName,
        startDate,
        endDate,
        reason: reason.trim(),
        status: 'pending',
        issuedAt: new Date(),
        ...(myPos?.category ? { department: myPos.category } : {}),
        ...(requiredApproverUserId ? { requiredApproverUserId, requiredApproverName } : {}),
    }

    const result = await Db.memberLoas.insertOne(loa as MemberLoa)

    if (requiredApproverUserId) {
        await createNotification({
            userId: requiredApproverUserId,
            type: 'task_assigned',
            title: 'LOA request requires your approval',
            body: `${displayName} has requested leave from ${startDate} to ${endDate}`,
            actionUrl: '/dashboard/personnel/all-staff' as string,
            relatedId: result.insertedId.toString(),
        })
    } else {
        // No section leader found — route to J4
        await createNotificationForRole('J4-Administration', {
            type: 'task_assigned',
            title: 'New LOA request',
            body: `${displayName} has requested leave from ${startDate} to ${endDate}`,
            actionUrl: '/dashboard/personnel/all-staff' as string,
            relatedId: result.insertedId.toString(),
        })
    }

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}
