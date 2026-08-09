import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/logs?type=action|error|discord&page=1&limit=50&category=...&status=sent|blocked|failed
// J4-Administration only.
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const type     = req.nextUrl.searchParams.get('type') ?? 'action'
    const page     = Math.max(1, parseInt(req.nextUrl.searchParams.get('page')  ?? '1'))
    const limit    = Math.min(100, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') ?? '50')))
    const category = req.nextUrl.searchParams.get('category')
    const skip     = (page - 1) * limit

    if (type === 'error') {
        const [logs, total] = await Promise.all([
            Db.errorLogs.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            Db.errorLogs.countDocuments({}),
        ])
        const serialised = logs.map(l => ({ ...l, _id: l._id.toString(), createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt }))
        return NextResponse.json({ logs: serialised, total, page, limit })
    }

    // discord logs
    if (type === 'discord') {
        const status = req.nextUrl.searchParams.get('status')
        const filter: Record<string, unknown> = {}
        if (status) filter.status = status

        const [logs, total] = await Promise.all([
            Db.discordLogs.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            Db.discordLogs.countDocuments(filter),
        ])
        const serialised = logs.map(l => ({ ...l, _id: l._id.toString(), createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt }))
        return NextResponse.json({ logs: serialised, total, page, limit })
    }

    // action logs
    const filter: Record<string, unknown> = {}
    if (category) filter.category = category

    const [logs, total] = await Promise.all([
        Db.actionLogs.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
        Db.actionLogs.countDocuments(filter),
    ])
    const serialised = logs.map(l => ({ ...l, _id: l._id.toString(), createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt }))
    return NextResponse.json({ logs: serialised, total, page, limit })
}
