import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await Db.recruitVideoConfig.findOne({ _id: 'main' }).catch(() => null)

    const [
        totalRes,
        completedRes,
        continuedRes,
        avgMaxRes,
        avgContRes,
    ] = await Promise.all([
        Db.recruitVideoProgress.countDocuments({}),
        Db.recruitVideoProgress.countDocuments({ completed: true }),
        Db.recruitVideoProgress.countDocuments({ continueClickedAt: { $exists: true } }),
        Db.recruitVideoProgress.aggregate([{ $group: { _id: null, v: { $avg: '$maxReachedPct' } } }]).toArray(),
        Db.recruitVideoProgress.aggregate([
            { $match: { continueClickedAt: { $exists: true } } },
            { $group: { _id: null, v: { $avg: '$continueClickedAtPct' } } },
        ]).toArray(),
    ])

    return NextResponse.json({
        config:   config ?? { enabled: true, videoUrl: '', startDelay: 2, updatedAt: null, updatedByName: '' },
        canReset: client.hasRoles(me, PERMISSIONS.departments.j4),
        stats: {
            totalSessions:  totalRes,
            completed:      completedRes,
            continued:      continuedRes,
            avgMaxPct:      Math.round((avgMaxRes[0]?.v ?? 0) * 10) / 10,
            avgContinuePct: Math.round((avgContRes[0]?.v ?? 0) * 10) / 10,
        },
    })
}

export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !(await hasPermission(me, 'departmentLeads.j1'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { videoUrl?: string; enabled?: boolean; startDelay?: number }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const startDelay = typeof body.startDelay === 'number'
        ? Math.max(0, Math.min(10, body.startDelay))
        : 2

    await Db.recruitVideoConfig.updateOne(
        { _id: 'main' },
        {
            $set: {
                videoUrl: typeof body.videoUrl === 'string' ? body.videoUrl.trim().slice(0, 2000) : '',
                enabled: !!body.enabled,
                startDelay,
                updatedAt: new Date(),
                updatedByName: me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || '',
            },
        },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}

export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await Db.recruitVideoProgress.deleteMany({})
    return NextResponse.json({ ok: true, deleted: result.deletedCount })
}
