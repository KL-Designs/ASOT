import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { canCommend } from '@/lib/operations/aar-access'
import { loadAarContext } from '@/lib/operations/aar-context'
import { toBoardUser } from '@/lib/attendance/board-user'
import { aarOpen, writableSections } from '@/lib/operations/aar'

/**
 * `GET /api/operations/{id}/aar/members?q=` — find a late joiner.
 *
 * The roll call can add somebody who turned up without being on the roster,
 * and to do that a 1IC has to be able to find them. This is that search and
 * nothing else: names only, eight at most, and only for somebody who has a
 * section to confirm on this operation — it is not a member directory for
 * whoever asks.
 *
 * Members already on the night are left out. They are not late joiners, and
 * the roll call refuses them anyway.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance || !aarOpen(attendance.stage ?? null)) {
        return NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 })
    }

    const roster = attendance.roster ?? []
    const canManageAll = await can(me, 'aar.manage')
    // Row 330: `?on=1` searches the people who were on the operation instead,
    // for the commendation picker, and is open to whoever may commend.
    const onOperation = req.nextUrl.searchParams.get('on') === '1'
    if (onOperation) {
        const ctx = await loadAarContext(operationId, me)
        if (!canCommend(roster, me.id, ctx.standing)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    } else if (!writableSections(roster, me.id, canManageAll).length) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const term = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60)
    if (term.length < 2) return NextResponse.json({ members: [] })

    // The term is matched literally: a name is not a pattern.
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

    const taken = new Set<string>([
        ...roster.filter(s => s.occupantUserId).map(s => s.occupantUserId as string),
        ...(attendance.records ?? []).filter(r => r.lateJoinSection).map(r => r.userId),
    ])

    const users = await Db.users
        .find({
            isSkeletonAccount: { $ne: true },
            discharged: { $exists: false },
            ...(onOperation ? { id: { $in: [...taken] } } : {}),
            $or: [
                { name: pattern },
                { 'guild.displayName': pattern },
                { 'guild.nickname': pattern },
                { globalName: pattern },
                { username: pattern },
            ],
        })
        .limit(40)
        .toArray()

    const members = users
        .filter(u => onOperation || (!taken.has(u.id) && !taken.has(String(u._id))))
        .slice(0, 8)
        .map(u => ({ userId: u.id ?? String(u._id), name: toBoardUser(u, u.id ?? String(u._id)).displayName }))

    return NextResponse.json({ members })
}
