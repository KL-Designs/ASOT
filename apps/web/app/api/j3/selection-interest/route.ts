import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/** How far back interest still counts. Older registrations have gone stale. */
const WINDOW_MS = 180 * 86_400_000

/**
 * Row 213, Q4: members who registered interest in Selection from their
 * induction. Shown on a Selection course's candidate list so J3 can add them
 * with one click; the client hides anyone already on that course.
 */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const rows = await Db.inductionProgress
        .find({ 'selectionInterest.at': { $gte: new Date(Date.now() - WINDOW_MS) } })
        .sort({ 'selectionInterest.at': 1 })
        .limit(200)
        .toArray()
    const users = await Db.users
        .find({ id: { $in: rows.map(r => r.userId) } }, { projection: { id: 1, username: 1 } })
        .toArray()
    const usernames = new Map(users.map(u => [u.id, u.username]))

    return NextResponse.json({
        interest: rows.map(r => ({
            userId: r.userId,
            displayName: r.userName,
            discordUsername: usernames.get(r.userId),
            at: r.selectionInterest!.at,
            instanceRef: r.selectionInterest!.instanceRef ?? null,
        })),
    })
}
