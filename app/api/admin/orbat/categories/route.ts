import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { PLATOON_CATEGORIES, RESERVIST_CATEGORIES } from '@/lib/orbat/constants'


async function auth(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
}


// ── GET /api/admin/orbat/categories ───────────────────────────────────────────
// Returns the fixed category list — no DB query needed.

export async function GET(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json([...PLATOON_CATEGORIES, ...RESERVIST_CATEGORIES])
}
