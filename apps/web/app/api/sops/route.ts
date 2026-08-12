import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.sops.manage)
    const sops = await Db.sops
        .find({}, { projection: { yjsState: 0 } })
        .sort({ category: 1, title: 1 })
        .toArray()

    return NextResponse.json({ sops, isJ4 })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.sops.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { title, category, description } = body

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (!category?.trim()) return NextResponse.json({ error: 'Category is required' }, { status: 400 })

    const actorName = me.guild?.displayName ?? me.username
    const now = new Date()

    const result = await Db.sops.insertOne({
        title: title.trim(),
        category: category.trim() as SopCategory,
        description: description?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdById: me.id,
        createdByName: actorName,
    })

    const created = await Db.sops.findOne({ _id: result.insertedId }, { projection: { yjsState: 0 } })
    return NextResponse.json(created, { status: 201 })
}
