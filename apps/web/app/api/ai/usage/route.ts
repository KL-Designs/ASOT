import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

function monthStart(offsetMonths = 0): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1)
}

export async function GET(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { searchParams } = new URL(req.url)
        const scope     = searchParams.get('scope')     ?? 'month'    // 'month' | 'all'
        const groupBy   = searchParams.get('groupBy')   ?? 'feature'  // 'feature' | 'provider' | 'department' | 'member' | 'model'
        const page      = parseInt(searchParams.get('page') ?? '1', 10)
        const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

        const dateFilter = scope === 'month'
            ? { createdAt: { $gte: monthStart() } }
            : {}

        // Summary aggregation grouped by chosen dimension
        const groupField = groupBy === 'member'     ? '$userId'
            : groupBy === 'department' ? '$departmentId'
            : groupBy === 'model'      ? '$model'
            : groupBy === 'provider'   ? '$provider'
            : '$feature'

        const [summary, totals, recent] = await Promise.all([
            Db.aiUsage.aggregate<{
                _id: string | null
                costUsd: number
                images: number
                tokens: number
                requests: number
                errors: number
            }>([
                { $match: { ...dateFilter } },
                {
                    $group: {
                        _id:      groupField,
                        costUsd:  { $sum: '$actualCostUsd' },
                        images:   { $sum: '$imageCount' },
                        tokens:   { $sum: { $add: [{ $ifNull: ['$inputTokens', 0] }, { $ifNull: ['$outputTokens', 0] }] } },
                        requests: { $sum: 1 },
                        errors:   { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    },
                },
                { $sort: { costUsd: -1 } },
            ]).toArray(),

            // Overall totals
            Db.aiUsage.aggregate<{ costUsd: number; images: number; tokens: number; requests: number; errors: number }>([
                { $match: { ...dateFilter } },
                {
                    $group: {
                        _id:      null,
                        costUsd:  { $sum: '$actualCostUsd' },
                        images:   { $sum: '$imageCount' },
                        tokens:   { $sum: { $add: [{ $ifNull: ['$inputTokens', 0] }, { $ifNull: ['$outputTokens', 0] }] } },
                        requests: { $sum: 1 },
                        errors:   { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    },
                },
            ]).next(),

            // Recent requests paginated
            Db.aiUsage
                .find({ ...dateFilter })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
        ])

        return NextResponse.json({
            totals: totals ?? { costUsd: 0, images: 0, tokens: 0, requests: 0, errors: 0 },
            summary,
            recent,
            page,
            limit,
        })
    } catch (err) {
        console.error('[api/ai/usage GET]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
