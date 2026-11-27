import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me/staff-induction-page
 * Returns the signed-in member's pending staff inductions plus the global and
 * dept-specific induction content in one call. Used by the client component so
 * the tutorial sandbox can inject a practice induction record.
 */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const records = await Db.staffInductions
        .find({ userId: me.id, completedAt: { $exists: false } })
        .sort({ triggeredAt: 1 })
        .toArray()

    const content = (await Db.siteSettings.findOne({ _id: 'staffInductionContent' })) as StaffInductionContent | null

    const depts = [...new Set(records.map(r => r.dept).filter(Boolean))] as string[]
    const deptContents: Record<string, StaffInductionContent> = {}
    if (depts.length > 0) {
        const rows = await Db.siteSettings.find({ _id: { $in: depts.map(d => `inductionContent:${d}`) } }).toArray()
        for (const row of rows) {
            const dept = (row._id as string).replace('inductionContent:', '')
            deptContents[dept] = row as unknown as StaffInductionContent
        }
    }

    return NextResponse.json({
        records: records.map(r => ({ ...r, _id: r._id!.toString() })),
        content: content ?? null,
        deptContents,
    })
}
