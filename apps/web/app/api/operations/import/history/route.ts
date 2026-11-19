/**
 * GET /api/operations/import/history
 *
 * Query params: ?page=1&limit=20&status=&batchId=
 * Returns paginated import history.
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

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const status = searchParams.get('status') || undefined
    const batchId = searchParams.get('batchId') || undefined

    const filter: Record<string, unknown> = {}
    if (status) filter.status = status
    if (batchId) filter.batchId = batchId

    const skip = (page - 1) * limit

    const [imports, total] = await Promise.all([
        Db.operationImports
            .find(filter)
            .sort({ importedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        Db.operationImports.countDocuments(filter),
    ])

    return NextResponse.json({
        imports,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    })
}
