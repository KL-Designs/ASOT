import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const updates: Partial<TrainingType> = { updatedAt: new Date() }

    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.category?.trim()) updates.category = body.category.trim()
    if (body.description !== undefined) updates.description = body.description?.trim() || undefined
    if (['j3Bct12', 'j3OtherTrainings'].includes(body.billetField)) updates.billetField = body.billetField as TrainingBilletField
    if (body.billetPoints !== undefined) updates.billetPoints = Math.max(0, Math.floor(Number(body.billetPoints)) || 0)
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive)

    await Db.trainingTypes.updateOne({ _id: new ObjectId(id) }, { $set: updates })
    const updated = await Db.trainingTypes.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
