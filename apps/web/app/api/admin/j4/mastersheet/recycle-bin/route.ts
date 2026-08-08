import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

function extractName(entry: MastersheetRecycleBinEntry): string {
    const r = entry.record as any
    if (entry.originalTab === 'billet') return r?.displayName ?? '—'
    return r?.name ?? '—'
}

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.view)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const tab = searchParams.get('tab') ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const LIMIT = 50

    const filter: Record<string, unknown> = {}
    if (tab) filter.originalTab = tab

    const [total, items] = await Promise.all([
        Db.mastersheetRecycleBin.countDocuments(filter),
        Db.mastersheetRecycleBin
            .find(filter)
            .sort({ deletedAt: -1 })
            .skip((page - 1) * LIMIT)
            .limit(LIMIT)
            .toArray(),
    ])

    return NextResponse.json({
        total,
        items: items.map(e => ({
            id: String(e._id),
            originalTab: e.originalTab,
            originalId: e.originalId,
            name: extractName(e),
            deletedAt: e.deletedAt,
            deletedByName: e.deletedByName,
        })),
    })
}
