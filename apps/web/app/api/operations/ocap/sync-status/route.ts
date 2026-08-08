import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/operations/ocap/sync-status?operationId=<id>
// Returns the current ocapSync progress field for an operation.
export async function GET(req: NextRequest) {
    try {
        const me = await client.fetchMe()
        const isHQ = await client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
        if (!isHQ) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const operationId = req.nextUrl.searchParams.get('operationId')
    if (!operationId) return NextResponse.json({ error: 'Missing operationId' }, { status: 400 })

    const op = await Db.operations.findOne(
        { _id: new ObjectId(operationId) },
        { projection: { ocapSync: 1 } },
    )

    return NextResponse.json({ ocapSync: op?.ocapSync ?? null })
}
