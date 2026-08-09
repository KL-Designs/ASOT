import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = req.nextUrl
    const year   = searchParams.get('year')
    const type   = searchParams.get('type')
    const status = searchParams.get('status')
    const q      = searchParams.get('q')
    const sort   = searchParams.get('sort') ?? 'startDate'
    const order  = searchParams.get('order') ?? 'desc'

    const conditions: Record<string, unknown>[] = [{ deletedAt: { $exists: false } }]

    if (year && year !== 'all') {
        const y = parseInt(year)
        if (!isNaN(y)) {
            conditions.push({
                startDate: { $gte: new Date(`${y}-01-01`), $lte: new Date(`${y}-12-31T23:59:59.999Z`) },
            })
        }
    }

    if (type) conditions.push({ trainingTypeName: type })

    if (status) {
        const statuses = status.split(',').map(s => s.trim()).filter(Boolean)
        if (statuses.length) conditions.push({ status: { $in: statuses } })
    }

    if (q) {
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        conditions.push({
            $or: [
                { trainingTypeName: regex },
                { instanceRef: regex },
                { leadInstructorName: regex },
                { notes: regex },
            ],
        })
    }

    const filter = conditions.length === 1 ? conditions[0] : { $and: conditions }

    const validSortFields = ['startDate', 'endDate', 'createdAt', 'updatedAt', 'instanceRef', 'leadInstructorName', 'candidateCount', 'staffCount', 'passedCount', 'failedCount', 'status', 'courseType']
    const sortField = validSortFields.includes(sort) ? sort : 'startDate'
    const sortDir = order === 'asc' ? 1 : -1

    const records = await Db.courseInstances
        .find(filter as Parameters<typeof Db.courseInstances.find>[0])
        .sort({ [sortField]: sortDir })
        .toArray()

    return NextResponse.json({ records })
}
