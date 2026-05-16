import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/j2/workspace/activity
// Query params:
//   ?memberId=X        — filter to a specific member's workspace
//   ?actionType=X      — filter to a specific action (e.g. workspace.file.upload)
//   ?from=ISO          — entries on or after this date
//   ?to=ISO            — entries on or before this date
//   ?limit=50          — max results (default 50, max 200)
//   ?page=0            — zero-based page index
export async function GET(req: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const memberId  = sp.get('memberId')
    const actionType = sp.get('actionType')
    const from      = sp.get('from')
    const to        = sp.get('to')
    const limit     = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))
    const page      = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0)

    const filter: Record<string, unknown> = {
        department: 'j2',
        action: { $regex: /^workspace\./ },
    }

    if (memberId) filter['details.memberId'] = memberId

    const VALID_ACTIONS = ['workspace.file.upload','workspace.file.delete','workspace.doc.create','workspace.doc.edit','workspace.doc.delete','workspace.version.save','workspace.version.restore']
    if (actionType && VALID_ACTIONS.includes(actionType)) {
        filter.action = actionType
    }

    if (from || to) {
        const dateFilter: Record<string, Date> = {}
        if (from) { try { dateFilter.$gte = new Date(from) } catch { /* ignore */ } }
        if (to)   { try { dateFilter.$lte = new Date(to) } catch { /* ignore */ } }
        if (Object.keys(dateFilter).length) filter.createdAt = dateFilter
    }

    const [logs, total] = await Promise.all([
        Db.actionLogs
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(page * limit)
            .limit(limit)
            .toArray(),
        Db.actionLogs.countDocuments(filter),
    ])

    return NextResponse.json({
        logs: logs.map(l => ({ ...l, _id: l._id.toString(), createdAt: (l.createdAt as Date).toISOString() })),
        total,
        page,
        limit,
    })
}
