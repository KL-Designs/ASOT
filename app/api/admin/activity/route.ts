import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/activity
// Query params:
//   department  — restrict to dept (required for non-J4; optional for J4)
//   category    — ActionCategory filter
//   entityType  — entity type filter
//   userId      — performedBy filter
//   search      — performedByName substring match
//   startDate   — ISO date string
//   endDate     — ISO date string
//   page        — default 1
//   limit       — default 50
export async function GET(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const params = request.nextUrl.searchParams

    const reqDept = params.get('department')

    // Dept leads can only see their own dept; J4 can see all or any specific dept
    if (!isJ4) {
        // Find which dept (if any) this user leads
        const leadDepts = (Object.entries(PERMISSIONS.departmentLeads) as [string, string[]][])
            .filter(([, roles]) => client.hasRoles(me, roles))
            .map(([dept]) => dept)

        if (leadDepts.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (reqDept && !leadDepts.includes(reqDept)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        // If no specific dept requested, scope to their first lead dept
        if (!reqDept) {
            return NextResponse.json({ error: 'department is required' }, { status: 400 })
        }
    }

    const filter: Record<string, unknown> = {}
    if (reqDept) filter.department = reqDept
    const category   = params.get('category')
    const entityType = params.get('entityType')
    const userId     = params.get('userId')
    const search     = params.get('search')
    const startDate  = params.get('startDate')
    const endDate    = params.get('endDate')

    if (category)   filter.category   = category
    if (entityType) filter.entityType = entityType
    if (userId)     filter.performedBy = userId
    if (search)     filter.performedByName = { $regex: search, $options: 'i' }

    if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {}
        if (startDate) dateFilter.$gte = new Date(startDate)
        if (endDate)   dateFilter.$lte = new Date(endDate + 'T23:59:59Z')
        filter.createdAt = dateFilter
    }

    const page  = Math.max(1, parseInt(params.get('page')  ?? '1',  10))
    const limit = Math.min(100, parseInt(params.get('limit') ?? '50', 10))
    const skip  = (page - 1) * limit

    const [logs, total] = await Promise.all([
        Db.actionLogs.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
        Db.actionLogs.countDocuments(filter),
    ])

    return NextResponse.json({ logs, total, page, limit })
}
