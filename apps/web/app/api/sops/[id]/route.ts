import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.sops.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const { title, category, description } = body

    const updates: Partial<SopDocument> = {
        updatedAt: new Date(),
        updatedById: me.id,
        updatedByName: me.guild?.displayName ?? me.username,
    }
    if (title?.trim()) updates.title = title.trim()
    if (category?.trim()) updates.category = category.trim() as SopCategory
    if (description !== undefined) updates.description = description?.trim() || undefined

    await Db.sops.updateOne({ _id: new ObjectId(id) }, { $set: updates })
    const updated = await Db.sops.findOne({ _id: new ObjectId(id) }, { projection: { yjsState: 0 } })
    return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.sops.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    await Db.sops.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ success: true })
}
