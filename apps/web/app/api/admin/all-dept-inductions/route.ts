import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const DEPTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']

/** GET /api/admin/all-dept-inductions — J4-only aggregated induction stats for all departments. */
export async function GET(_req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.tickets.actionJ4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const agg = await Db.staffInductions.aggregate([
        { $group: {
            _id: { $ifNull: ['$dept', 'global'] },
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $ifNull: ['$completedAt', false] }, 1, 0] } },
            lastTriggeredAt: { $max: '$triggeredAt' },
        }},
    ]).toArray()

    const byDept = new Map(agg.map(r => [r._id as string, r]))

    const stats = DEPTS.map(dept => {
        const row = byDept.get(dept)
        return {
            dept,
            total: row?.total ?? 0,
            completed: row?.completed ?? 0,
            pending: (row?.total ?? 0) - (row?.completed ?? 0),
            lastTriggeredAt: row?.lastTriggeredAt ?? null,
        }
    })

    return NextResponse.json({ stats })
}
