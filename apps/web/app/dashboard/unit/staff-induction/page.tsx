import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import StaffInductionClient from './StaffInductionClient'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

export const dynamic = 'force-dynamic'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasDashboardAccess(me))) redirect('/me')

    // Load pending inductions for this member
    const records = await Db.staffInductions
        .find({ userId: me.id, completedAt: { $exists: false } })
        .sort({ triggeredAt: 1 })
        .toArray()

    // Load global + any dept-specific induction content
    const globalContent = (await Db.siteSettings.findOne({ _id: 'staffInductionContent' })) as StaffInductionContent | null

    // Find unique dept values on pending records
    const depts = [...new Set(records.map(r => r.dept).filter(Boolean))] as string[]
    const deptContents: Record<string, StaffInductionContent> = {}
    if (depts.length > 0) {
        const rows = await Db.siteSettings.find({ _id: { $in: depts.map(d => `inductionContent:${d}`) } }).toArray()
        for (const row of rows) {
            const dept = (row._id as string).replace('inductionContent:', '')
            deptContents[dept] = row as unknown as StaffInductionContent
        }
    }

    const serialisedRecords = records.map(r => ({ ...r, _id: r._id!.toString() }))

    return (
        <StaffInductionClient
            records={serialisedRecords as (StaffInductionRecord & { _id: string })[]}
            content={globalContent ?? null}
            deptContents={deptContents}
        />
    )
}
