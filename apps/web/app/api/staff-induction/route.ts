import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { triggerStaffInduction } from '@/lib/staff-induction/trigger'

/** GET /api/staff-induction — list inductions for the current user (or all for J4). */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = req.nextUrl
    const all = searchParams.get('all') === 'true'

    if (all) {
        if (!client.hasRoles(me, PERMISSIONS.tickets.actionJ4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        const records = await Db.staffInductions.find({}).sort({ triggeredAt: -1 }).limit(200).toArray()
        return NextResponse.json({ records: records.map(r => ({ ...r, _id: r._id!.toString() })) })
    }

    const records = await Db.staffInductions
        .find({ userId: me.id })
        .sort({ triggeredAt: -1 })
        .toArray()
    return NextResponse.json({ records: records.map(r => ({ ...r, _id: r._id!.toString() })) })
}

/** POST /api/staff-induction — J4 manually trigger an induction for a member. */
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.tickets.actionJ4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { userId, userName, context, triggerLabel } = body

    if (!userId || !userName || !context?.trim()) {
        return NextResponse.json({ error: 'userId, userName, and context are required' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    await triggerStaffInduction({
        userId, userName,
        context: context.trim(),
        triggerLabel: triggerLabel?.trim(),
        triggeredById: me.id,
        triggeredByName: displayName,
    })

    return NextResponse.json({ ok: true })
}
