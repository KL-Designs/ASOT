import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { TRAINING_TYPE_DEFAULTS } from '@/lib/training/defaults'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)

    const count = await Db.trainingTypes.countDocuments()
    if (count === 0) {
        const now = new Date()
        await Db.trainingTypes.insertMany(TRAINING_TYPE_DEFAULTS.map(d => ({ ...d, createdAt: now, updatedAt: now })))
    }

    const query = isJ3Lead ? {} : { isActive: true }
    const types = await Db.trainingTypes.find(query).sort({ category: 1, name: 1 }).toArray()

    return NextResponse.json({ types, isJ3Lead })
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

    const now = new Date()
    const result = await Db.trainingTypes.insertOne({
        name: name.trim(),
        category: category.trim(),
        billetField: billetField as TrainingBilletField,
        billetPoints: Math.max(0, Math.floor(Number(billetPoints)) || 2),
        description: description?.trim() || undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
    })

    const created = await Db.trainingTypes.findOne({ _id: result.insertedId })
    return NextResponse.json(created, { status: 201 })
}
