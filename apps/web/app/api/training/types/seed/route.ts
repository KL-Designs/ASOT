import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { TRAINING_TYPE_DEFAULTS } from '@/lib/training/defaults'

export async function POST() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const now = new Date()
    let inserted = 0

    for (const entry of TRAINING_TYPE_DEFAULTS) {
        const result = await Db.trainingTypes.updateOne(
            { name: entry.name },
            { $setOnInsert: { ...entry, createdAt: now, updatedAt: now } },
            { upsert: true }
        )
        if (result.upsertedCount) inserted++
    }

    return NextResponse.json({ inserted, total: TRAINING_TYPE_DEFAULTS.length })
}
