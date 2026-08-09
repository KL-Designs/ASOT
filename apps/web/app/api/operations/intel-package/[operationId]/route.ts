import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ operationId: string }> }
) {
    const { operationId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pkg = await Db.intelPackages.findOne({ operationId })
    return NextResponse.json({ package: pkg ?? null })
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ operationId: string }> }
) {
    const { operationId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.operationsEdit)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as Partial<IntelPackage>
    // Strip server-managed fields before merging
    const { _id, operationId: _oid, updatedAt: _ua, updatedById: _uid, updatedByName: _un, ...data } = body

    await Db.intelPackages.updateOne(
        { operationId },
        {
            $set: {
                ...data,
                operationId,
                updatedAt: new Date(),
                updatedById: me.id,
                updatedByName: me.name ?? me.globalName ?? me.id,
            },
        },
        { upsert: true }
    )

    const saved = await Db.intelPackages.findOne({ operationId })
    return NextResponse.json({ package: saved })
}
