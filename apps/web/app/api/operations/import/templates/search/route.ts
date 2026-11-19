/**
 * GET /api/operations/import/templates/search?q=...
 *
 * Searches existing operations by title for use as AI template examples.
 */

import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'

export async function GET(request: NextRequest) {
    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (!q) return NextResponse.json({ results: [] })

    const ops = await Db.operations
        .find(
            {
                deletedAt: { $exists: false },
                title: { $regex: q, $options: 'i' },
            },
            { projection: { _id: 1, title: 1 }, limit: 12, sort: { date: -1 } }
        )
        .toArray()

    const results = ops.map(o => ({ id: o._id.toString(), title: o.title }))
    return NextResponse.json({ results })
}
