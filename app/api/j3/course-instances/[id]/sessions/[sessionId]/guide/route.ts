import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; sessionId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const docRef = `session-${sessionId}`
    let guide = await Db.trainingGuides.findOne({ docRef, deletedAt: { $exists: false } })

    if (!guide) {
        const now = new Date()
        const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
        const blank: Omit<TrainingGuide, '_id'> = {
            docRef,
            title: 'Session Instructions',
            accentColor: '#db001d',
            outlineColor: '#db001d',
            status: 'draft',
            version: '0.1',
            lastRevisedAt: now,
            duration: '',
            overview: '',
            equipment: [],
            trainingAreaDescription: '',
            teachingPoints: [],
            notes: '',
            guideType: 'training_document',
            createdAt: now,
            createdById: me.id,
            createdByName: name,
            updatedAt: now,
            updatedById: me.id,
            updatedByName: name,
            editHistory: [],
            contentBaseline: '{}',
        }
        const result = await Db.trainingGuides.insertOne(blank as TrainingGuide)
        guide = await Db.trainingGuides.findOne({ _id: result.insertedId })
    }

    return NextResponse.json({ guide })
}
