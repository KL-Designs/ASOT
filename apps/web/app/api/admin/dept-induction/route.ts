import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { triggerStaffInduction } from '@/lib/staff-induction/trigger'

const VALID_DEPTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']

function deptPermission(dept: string) {
    const map: Record<string, string[]> = {
        j1: PERMISSIONS.tickets.actionJ1,
        j2: PERMISSIONS.tickets.actionJ2,
        j3: PERMISSIONS.tickets.actionJ3,
        j4: PERMISSIONS.tickets.actionJ4,
        j5: PERMISSIONS.tickets.actionJ1,
        j6: PERMISSIONS.tickets.actionJ6,
        j7: PERMISSIONS.tickets.actionJ7,
    }
    return map[dept] ?? PERMISSIONS.tickets.actionJ4
}

/** GET /api/admin/dept-induction?dept=j3 — list all inductions triggered by this dept. */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dept = req.nextUrl.searchParams.get('dept') ?? ''
    if (!VALID_DEPTS.includes(dept)) return NextResponse.json({ error: 'Invalid dept' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ4 && !client.hasRoles(me, deptPermission(dept))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const records = await Db.staffInductions
        .find({ dept })
        .sort({ triggeredAt: -1 })
        .limit(200)
        .toArray()

    return NextResponse.json({ records: records.map(r => ({ ...r, _id: r._id!.toString() })) })
}

/** POST /api/admin/dept-induction — trigger an induction for a member from a dept. */
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { dept, userId, userName, context, triggerLabel } = body

    if (!VALID_DEPTS.includes(dept)) return NextResponse.json({ error: 'Invalid dept' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ4 && !client.hasRoles(me, deptPermission(dept))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!userId || !userName || !context?.trim()) {
        return NextResponse.json({ error: 'userId, userName, and context are required' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    await triggerStaffInduction({
        userId,
        userName,
        context: context.trim(),
        triggerLabel: triggerLabel?.trim(),
        triggeredById: me.id,
        triggeredByName: displayName,
        dept,
    })

    return NextResponse.json({ ok: true })
}
