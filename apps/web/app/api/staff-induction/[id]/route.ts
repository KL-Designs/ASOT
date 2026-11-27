import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/staff-induction/[id] — complete part A, part B, or skip part B. */
export async function PATCH(req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const record = await Db.staffInductions.findOne({ _id: new ObjectId(id) })
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (record.userId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (record.completedAt) return NextResponse.json({ error: 'Induction already completed' }, { status: 409 })

    const body = await req.json().catch(() => ({}))
    const { action } = body

    const now = new Date()
    const $set: Partial<StaffInductionRecord> = {}

    if (action === 'complete-part-a') {
        $set.partACompletedAt = now
    } else if (action === 'complete-part-b') {
        if (!record.partACompletedAt) return NextResponse.json({ error: 'Complete Part A first' }, { status: 400 })
        $set.partBCompletedAt = now
        $set.completedAt = now
    } else if (action === 'skip-part-b') {
        if (!record.partACompletedAt) return NextResponse.json({ error: 'Complete Part A first' }, { status: 400 })
        $set.partBSkipped = true
        $set.completedAt = now
    } else {
        return NextResponse.json({ error: 'action must be complete-part-a, complete-part-b, or skip-part-b' }, { status: 400 })
    }

    // Auto-complete when only part A is required (no tutorial content)
    if (action === 'complete-part-a') {
        // Check dept-specific content first, then fall back to global
        const contentId = record.dept ? `inductionContent:${record.dept}` : 'staffInductionContent'
        let content = await Db.siteSettings.findOne({ _id: contentId }) as StaffInductionContent | null
        if (!content && record.dept) {
            content = await Db.siteSettings.findOne({ _id: 'staffInductionContent' }) as StaffInductionContent | null
        }
        if (!content?.tutorialBody?.trim()) {
            $set.completedAt = now
        }
    }

    await Db.staffInductions.updateOne({ _id: new ObjectId(id) }, { $set })

    const updated = await Db.staffInductions.findOne({ _id: new ObjectId(id) })
    return NextResponse.json({ record: { ...updated, _id: updated!._id!.toString() } })
}
