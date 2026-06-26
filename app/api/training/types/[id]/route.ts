import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const updates: Partial<TrainingType> = { updatedAt: new Date() }

    // Core fields
    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.category?.trim()) updates.category = body.category.trim()
    if (body.description !== undefined) updates.description = body.description?.trim() || undefined
    if (['j3Bct12', 'j3OtherTrainings'].includes(body.billetField)) updates.billetField = body.billetField as TrainingBilletField
    if (body.billetPoints !== undefined) updates.billetPoints = Math.max(0, Math.floor(Number(body.billetPoints)) || 0)

    // Status — canonical field; syncs isActive for backward compat
    if (body.status !== undefined && (['active', 'wip', 'inactive'] as TrainingTypeStatus[]).includes(body.status)) {
        updates.status = body.status as TrainingTypeStatus
        updates.isActive = body.status === 'active'
    } else if (body.isActive !== undefined) {
        // Backward-compat: callers that still send isActive
        updates.isActive = Boolean(body.isActive)
        updates.status = body.isActive ? 'active' : 'inactive'
    }

    // Event defaults
    if (body.durationMinutes !== undefined) updates.durationMinutes = body.durationMinutes ? Math.max(1, Math.floor(Number(body.durationMinutes)) || 1) : undefined
    if (body.server !== undefined) updates.server = body.server?.trim() || undefined
    if (body.requiredMods !== undefined) updates.requiredMods = Array.isArray(body.requiredMods) ? (body.requiredMods as string[]).filter(Boolean) : undefined
    if (body.prerequisites !== undefined) updates.prerequisites = Array.isArray(body.prerequisites) ? (body.prerequisites as string[]).filter(Boolean) : undefined
    if (body.minTrainers !== undefined) updates.minTrainers = body.minTrainers ? Math.max(1, Math.floor(Number(body.minTrainers)) || 1) : undefined
    if (body.minTrainees !== undefined) updates.minTrainees = body.minTrainees ? Math.max(1, Math.floor(Number(body.minTrainees)) || 1) : undefined

    // Resources
    if (body.trainerDocUrl !== undefined) updates.trainerDocUrl = body.trainerDocUrl?.trim() || undefined
    if (body.infoDocUrl !== undefined) updates.infoDocUrl = body.infoDocUrl?.trim() || undefined
    if (body.coverImageUrl !== undefined) updates.coverImageUrl = body.coverImageUrl?.trim() || undefined
    if (body.linkedMedia !== undefined) updates.linkedMedia = Array.isArray(body.linkedMedia) ? body.linkedMedia as TrainingMedia[] : undefined
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder !== '' ? Number(body.sortOrder) || undefined : undefined

    await Db.trainingTypes.updateOne({ _id: new ObjectId(id) }, { $set: updates })
    const updated = await Db.trainingTypes.findOne({ _id: new ObjectId(id) })

    const editorName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'training.type.edit',
        category: 'training',
        performedBy: me.id,
        performedByName: editorName,
        department: 'j3',
        entityType: 'training_type',
        entityId: id,
        target: updated?.name ?? id,
        details: { changedFields: Object.keys(updates).filter(k => k !== 'updatedAt') },
    }).catch(console.error)

    return NextResponse.json(updated)
}
