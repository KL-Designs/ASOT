import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { TRAINING_TYPE_DEFAULTS } from '@/lib/training/defaults'
import { logAction } from '@/lib/logAction'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)

    const count = await Db.trainingTypes.countDocuments()
    if (count === 0) {
        const now = new Date()
        await Db.trainingTypes.insertMany(TRAINING_TYPE_DEFAULTS.map(d => ({ ...d, createdAt: now, updatedAt: now })))
    }

    // J3 leads see all; trainers see active + wip; members see active only
    const query = isJ3Lead ? {} : isTrainer ? { status: { $in: ['active', 'wip'] as TrainingType['status'][] } } : { status: 'active' as TrainingType['status'] }
    const types = await Db.trainingTypes.find(query).sort({ sortOrder: 1, category: 1, name: 1 }).toArray()

    return NextResponse.json({ types, isJ3Lead, isTrainer })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { name, category, billetField, billetPoints, description } = body

    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!category?.trim()) return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    if (!['j3Bct12', 'j3OtherTrainings'].includes(billetField)) return NextResponse.json({ error: 'Invalid billetField' }, { status: 400 })

    const statusVal: TrainingTypeStatus = (['active', 'wip', 'inactive'] as TrainingTypeStatus[]).includes(body.status)
        ? body.status
        : 'active'

    const now = new Date()
    const result = await Db.trainingTypes.insertOne({
        name: name.trim(),
        category: category.trim(),
        billetField: billetField as TrainingBilletField,
        billetPoints: Math.max(0, Math.floor(Number(billetPoints)) || 2),
        description: description?.trim() || undefined,
        status: statusVal,
        isActive: statusVal === 'active',
        durationMinutes: body.durationMinutes ? Math.max(1, Math.floor(Number(body.durationMinutes)) || 1) : undefined,
        server: body.server?.trim() || undefined,
        requiredMods: Array.isArray(body.requiredMods) ? body.requiredMods.filter(Boolean) : undefined,
        prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.filter(Boolean) : undefined,
        minTrainers: body.minTrainers ? Math.max(1, Math.floor(Number(body.minTrainers)) || 1) : undefined,
        minTrainees: body.minTrainees ? Math.max(1, Math.floor(Number(body.minTrainees)) || 1) : undefined,
        trainerDocUrl: body.trainerDocUrl?.trim() || undefined,
        infoDocUrl: body.infoDocUrl?.trim() || undefined,
        coverImageUrl: body.coverImageUrl?.trim() || undefined,
        linkedMedia: Array.isArray(body.linkedMedia) ? body.linkedMedia : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) || undefined : undefined,
        createdAt: now,
        updatedAt: now,
    })

    const created = await Db.trainingTypes.findOne({ _id: result.insertedId })

    const creatorName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'training.type.create',
        category: 'training',
        performedBy: me.id,
        performedByName: creatorName,
        department: 'j3',
        entityType: 'training_type',
        entityId: result.insertedId.toString(),
        target: name.trim(),
        details: { category, billetField, billetPoints, status: statusVal },
    }).catch(console.error)

    return NextResponse.json(created, { status: 201 })
}
