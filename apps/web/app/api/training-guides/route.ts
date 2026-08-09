import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3 = client.hasRoles(me, PERMISSIONS.departments.j3)
    const isJ3Lead = client.hasRoles(me, PERMISSIONS.trainingGuides.delete)
    const trainingTypeId = req.nextUrl.searchParams.get('trainingTypeId')
    const deletedOnly = req.nextUrl.searchParams.get('deleted') === 'true'

    if (deletedOnly && !isJ3Lead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const filter: Record<string, unknown> = deletedOnly
        ? { deletedAt: { $exists: true } }
        : { deletedAt: { $exists: false } }
    if (!deletedOnly && !isJ3) filter.status = 'approved'
    if (trainingTypeId) filter.trainingTypeId = trainingTypeId

    const guides = await Db.trainingGuides
        .find(filter, {
            projection: {
                contentBaseline: 0,
                editHistory: 0,
                teachingPoints: 0,
                equipment: 0,
                notes: 0,
                overview: 0,
                trainingAreaDescription: 0,
            },
        })
        .sort({ updatedAt: -1 })
        .toArray()

    return NextResponse.json(guides)
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { title?: string; accentColor?: string; trainingTypeId?: string; guideType?: TrainingGuide['guideType'] }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const count = await Db.trainingGuides.countDocuments({})
    const docRef = `TRG-${String(count + 1).padStart(3, '0')}`
    const now = new Date()

    const initialEntry: TrainingGuideEditEntry = {
        at: now, byId: me.id, byName: name, type: 'created',
    }

    const guide: Omit<TrainingGuide, '_id'> = {
        docRef,
        title:       body.title?.trim() || 'Untitled Training Guide',
        accentColor: body.accentColor || '#db001d',
        trainingTypeId: body.trainingTypeId,
        guideType:   body.guideType || 'trainers_guide',
        status:      'draft',
        version:     '1.0',
        lastRevisedAt: now,
        duration:    '',
        overview:    '',
        equipment:   [],
        trainingAreaDescription: '',
        teachingPoints: [],
        notes:       '',
        createdAt:   now,
        createdById: me.id,
        createdByName: name,
        updatedAt:   now,
        updatedById: me.id,
        updatedByName: name,
        editHistory: [initialEntry],
        contentBaseline: '{}',
    }

    const result = await Db.trainingGuides.insertOne(guide as TrainingGuide)
    return NextResponse.json({ _id: result.insertedId, ...guide })
}
