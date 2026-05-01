import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/meetings/all?department=j1&imported=true
// J4 only — returns meetings across all (or a specific) department.
export async function GET(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params  = request.nextUrl.searchParams
    const dept    = params.get('department') as MeetingDepartment | null
    const importedOnly = params.get('imported') === 'true'

    const filter: Record<string, unknown> = {}
    if (dept) filter.department = dept
    if (importedOnly) filter.isTransferred = true

    const meetings = await Db.meetings
        .find(filter)
        .sort({ date: -1 })
        .limit(200)
        .toArray()

    return NextResponse.json({ meetings })
}
