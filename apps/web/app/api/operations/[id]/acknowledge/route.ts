import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'

type Params = { params: Promise<{ id: string }> }

const ACK_ROLES = PERMISSIONS.attendance.confirm  // ['All Staff', 'HQ Staff']

/**
 * GET /api/operations/[id]/acknowledge?pageId=main
 *
 * Returns:
 *   - acknowledged: whether the current user has ack'd this page
 *   - acks: list of users who have acknowledged
 *   - eligible: all users who should acknowledge (All Staff + HQ Staff)
 *   - notAcknowledged: eligible users who haven't ack'd yet
 */
export async function GET(req: NextRequest, { params }: Params) {
    const { id } = await params
    const pageId = req.nextUrl.searchParams.get('pageId') ?? 'main'

    let me: Awaited<ReturnType<typeof client.fetchMe>> | null = null
    try { me = await client.fetchMe() } catch { /* public view */ }

    // Validate the operation exists
    let op: { _id: ObjectId } | null = null
    try {
        op = await Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } })
    } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const acks = await Db.operationDocAcks.find({ operationId: id, pageId }).toArray()
    const acknowledgedUserIds = new Set(acks.map(a => a.userId))
    const acknowledged = me ? acknowledgedUserIds.has(me.id) : false

    // Build eligible + not-acknowledged lists
    const eligibleUsers = await Db.users
        .find(
            { 'guild.roles': { $in: ACK_ROLES }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
            { projection: { id: 1, 'guild.displayName': 1, 'guild.nickname': 1, globalName: 1, username: 1 } }
        )
        .toArray()

    const eligible = eligibleUsers.map(u => ({
        userId: u.id as string,
        userName: (u as any).guild?.nickname || (u as any).guild?.displayName || (u as any).globalName || (u as any).username || 'Unknown',
    }))

    const notAcknowledged = eligible.filter(u => !acknowledgedUserIds.has(u.userId))

    return NextResponse.json({
        acknowledged,
        acks: acks.map(a => ({ userId: a.userId, userName: a.userName, acknowledgedAt: a.acknowledgedAt })),
        eligible,
        notAcknowledged,
    })
}

/**
 * POST /api/operations/[id]/acknowledge
 * Body: { pageId: string }
 *
 * Mark the current user as having acknowledged this document page.
 * Only All Staff / HQ Staff can acknowledge.
 */
export async function POST(req: NextRequest, { params }: Params) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!(await hasPermission(me, 'attendance.confirm'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { pageId?: string }
    try { body = await req.json() } catch { body = {} }
    const pageId = body.pageId ?? 'main'

    // Validate operation exists
    try {
        const op = await Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } })
        if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const existing = await Db.operationDocAcks.findOne({ operationId: id, pageId, userId: me.id })
    if (existing) return NextResponse.json({ ok: true, alreadyAcknowledged: true })

    const userName = (me as any).guild?.nickname || (me as any).guild?.displayName
        || (me as any).globalName || (me as any).username || 'Unknown'

    await Db.operationDocAcks.insertOne({
        operationId: id,
        pageId,
        userId: me.id,
        userName,
        acknowledgedAt: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, alreadyAcknowledged: false })
}
