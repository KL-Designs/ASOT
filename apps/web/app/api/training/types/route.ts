import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { normaliseTrainingType } from '@/lib/training/course-type'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { TRAINING_TYPE_DEFAULTS } from '@/lib/training/defaults'
import { logAction } from '@/lib/logAction'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { sanitisePreLearning } from '@/lib/training/pre-learning'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)

    const count = await Db.trainingTypes.countDocuments()
    if (count === 0) {
        const now = new Date()
        await Db.trainingTypes.insertMany(TRAINING_TYPE_DEFAULTS.map(d => ({ ...d, createdAt: now, updatedAt: now })))
    }

    // J3 leads see all; trainers see active + wip; members see active only
    // Filtered after normalising: a type saved before `status` existed has only `isActive`.
    const allowed: TrainingType['status'][] = isJ3Lead ? ['active', 'wip', 'inactive'] : isTrainer ? ['active', 'wip'] : ['active']
    const types = (await Db.trainingTypes.find({}).sort({ sortOrder: 1, category: 1, name: 1 }).toArray())
        .map(normaliseTrainingType)
        .filter(t => allowed.includes(t.status))

    /*
     * Pre-learning is locked material, and this list goes to every member. The
     * people who run trainings get it in full; everybody else gets the type
     * without it. A member's own unlocked material comes from
     * `/api/training/pre-learning`, which is the only place the lock lives.
     */
    const visible = (isJ3Lead || isTrainer)
        ? types
        : types.map(({ preLearning: _locked, ...rest }) => rest)

    return NextResponse.json({ types: visible, isJ3Lead, isTrainer })
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
        preLearning: sanitisePreLearning(body.preLearning),
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
