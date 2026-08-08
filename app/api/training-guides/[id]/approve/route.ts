import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

/**
 * Version-bump logic (called only on approval, not on every save).
 *
 * Major bump (x.0 → x+1.0) when:
 *   - Number of teaching points changed since last approval, OR
 *   - Overall character diff > 35% relative to baseline
 *
 * Minor bump (x.y → x.y+1) for smaller content-only edits.
 */
function computeNextVersion(
    existing: TrainingGuide,
): { newVersion: string; changeType: 'major' | 'minor' } {
    // First publication — never bump; confirm at whatever version the draft is on
    if (!existing.approvedAt) {
        return { newVersion: existing.version || '1.0', changeType: 'minor' }
    }

    // Subsequent approvals: compare against the snapshot taken at last approval
    const baseline = existing.contentBaseline
    const contentKeys = ['title', 'overview', 'duration', 'equipment', 'trainingAreaDescription', 'teachingPoints', 'notes'] as const
    const newContent = JSON.stringify(Object.fromEntries(contentKeys.map(k => [k, existing[k]])))

    let changeType: 'minor' | 'major' = 'minor'

    if (baseline && baseline !== '{}') {
        try {
            const old = JSON.parse(baseline)
            const oldTPCount = Array.isArray(old.teachingPoints) ? old.teachingPoints.length : 0
            const newTPCount = existing.teachingPoints?.length ?? 0
            const charDiff = Math.abs(newContent.length - baseline.length) / Math.max(baseline.length, 1)
            if (oldTPCount !== newTPCount || charDiff >= 0.35) changeType = 'major'
        } catch {
            changeType = 'major'
        }
    }

    const [maj, min] = existing.version.split('.').map(Number)
    const newVersion = changeType === 'major'
        ? `${(maj || 1) + 1}.0`
        : `${maj || 1}.${(min || 0) + 1}`

    return { newVersion, changeType }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.approve)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const existing = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const { newVersion, changeType } = computeNextVersion(existing)
    const now = new Date()

    const contentKeys = ['title', 'overview', 'duration', 'equipment', 'trainingAreaDescription', 'teachingPoints', 'notes'] as const
    const newBaseline = JSON.stringify(Object.fromEntries(contentKeys.map(k => [k, existing[k]])))

    const approvedEntry: TrainingGuideEditEntry = {
        at: now, byId: me.id, byName: name,
        type: 'approved', version: newVersion, changeType,
    }

    await Db.trainingGuides.updateOne(
        { _id: oid },
        {
            $set: {
                status:          'approved',
                version:         newVersion,
                contentBaseline: newBaseline,
                approvedAt:      now,
                approvedById:    me.id,
                approvedByName:  name,
            },
            $push: { editHistory: approvedEntry },
        },
    )

    return NextResponse.json({ ok: true, version: newVersion, changeType })
}
