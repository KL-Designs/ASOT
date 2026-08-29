import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { isTurnoutKey, mulberry32, simulateAttendance } from '@/lib/attendance/simulate'
import { DEV_TOOLS_ENABLED } from '@/lib/dev-tools'
import { can } from '@/lib/operations/permissions'

/**
 * Fill an operation's board with plausible attendance, for looking at.
 *
 * **Development only.** It overwrites the roster and every RSVP answer on the
 * operation, which is exactly what you want while building the board and
 * exactly what you never want on a real one. The environment check is first,
 * before authentication, so a permission check is never the only thing standing
 * between a bad grant and a live operation's attendance being wiped.
 *
 * "Development" is `DEV_TOOLS_ENABLED`, not `NODE_ENV` — a built staging site
 * can opt in explicitly, and does so for the UI and for this route with the
 * same flag, so the button and the endpoint can never disagree about whether
 * this exists. A deployment that has not set it is unchanged: 404, always.
 *
 * Real members are used rather than invented ones: the roster's own ORBAT
 * holders, plus whoever actually sits in the reservist categories. A board full
 * of fake names tells you nothing about how real names wrap.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!DEV_TOOLS_ENABLED) {
        return NextResponse.json({ error: 'Not available' }, { status: 404 })
    }

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canManage = await can(me, 'attendance.manage')
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const att = await Db.operationAttendance.findOne({ operationId })
    if (!att?.roster?.length) {
        return NextResponse.json(
            { error: 'No roster yet — open RSVP or rebuild the board first.' },
            { status: 409 },
        )
    }

    const body = await req.json().catch(() => ({})) as { seed?: number; turnout?: unknown }
    // An unrecognised turnout is an ordinary night rather than an error: this is
    // a button, and the only caller is the dev panel three lines away.
    const turnout = isTurnoutKey(body.turnout) ? body.turnout : 'medium'

    // The unit's real reservists, minus anyone who already holds a position in
    // this roster — a member can be both, and counting them twice would have
    // the simulator try to place one person in two places.
    const holders = new Set(att.roster.map(s => s.homeUserId).filter(Boolean) as string[])
    const reservistPositions = await Db.orbatPositions
        .find({ category: { $in: ['activeReservist', 'inactiveReservist'] }, userId: { $ne: null } })
        .toArray()
    const reservists = [...new Set(
        reservistPositions.map(p => p.userId!).filter(userId => !holders.has(userId)),
    )]

    const result = simulateAttendance({
        roster: att.roster,
        reservists,
        rand: mulberry32(body.seed ?? Date.now()),
        turnout,
    })

    // Rebuild the records for everyone the simulation had an opinion about,
    // keeping anything already on an existing record (confirmations, imported
    // history) rather than replacing the member wholesale.
    const byUser = new Map((att.records ?? []).map(r => [r.userId, r]))
    for (const [userId, answer] of Object.entries(result.rsvp)) {
        const pref = result.preferences[userId]
        byUser.set(userId, {
            ...(byUser.get(userId) ?? {
                userId, unit: '', orbatSection: '', orbatRole: '',
                confirmed: false, confirmedBy: null, confirmedAt: null,
            }),
            rsvp: answer,
            preferredSection: pref?.section ?? null,
            preferredRole: pref?.role ?? null,
        } as OperationAttendanceRecord)
    }

    await Db.operationAttendance.updateOne(
        { operationId },
        {
            $set: { roster: result.roster, records: [...byUser.values()] },
            $inc: { rosterRev: 1 },
        },
    )

    return NextResponse.json({
        ok: true,
        turnout,
        placed: result.roster.filter(s => s.occupantUserId).length,
        answered: Object.keys(result.rsvp).length,
        reservists: reservists.length,
    })
}
