import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { monthKey } from '@/lib/military/award-postage'
import { memberName, rollOver } from '@/lib/military/award-postage-db'
import { postageGate } from './gate'

export const dynamic = 'force-dynamic'

/**
 * GET /api/j4/award-postage — row 384's page. Every active member with their
 * physical-award preference (Unassigned when never set), and every postage
 * item, newest month first. Owner and OVERRIDE only.
 */
export async function GET() {
    const g = await postageGate()
    if (g.error) return g.error

    await rollOver()
    const [users, prefs, items] = await Promise.all([
        Db.users.find(
            { isSkeletonAccount: { $ne: true }, discharged: { $exists: false } },
            { projection: { id: 1, name: 1, username: 1, globalName: 1, 'guild.nickname': 1, 'milpac.currentRank': 1 } },
        ).toArray(),
        Db.awardPostagePrefs.find({}).toArray(),
        Db.awardPostageItems.find({}).sort({ month: -1, userName: 1, createdAt: 1 }).limit(5000).toArray(),
    ])
    const byUser = new Map(prefs.map(p => [p.userId, p]))
    const members = users.filter(u => u.id).map(u => {
        const p = byUser.get(u.id)
        return {
            userId: u.id,
            name: memberName(u),
            rank: u.milpac?.currentRank ?? '',
            preference: p?.preference ?? 'unassigned',
            firstAskedAt: p?.firstAskedAt ?? null,
            lastReminderAt: p?.lastReminderAt ?? null,
            nextReminderAt: p?.preference === 'unassigned' ? p?.nextReminderAt ?? null : null,
            answeredAt: p?.answeredAt ?? null,
            answeredBy: p?.answeredBy ?? null,
        }
    }).sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
        currentMonth: monthKey(new Date()),
        members,
        items: items.map(i => ({
            id: String(i._id), userId: i.userId, userName: i.userName, awardName: i.awardName, awardType: i.awardType,
            awardDate: i.awardDate, month: i.month, carriedFrom: i.carriedFrom ?? null, status: i.status,
            sentAt: i.sentAt ?? null, sentByName: i.sentByName ?? null,
        })),
    })
}
