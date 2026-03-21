import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


export async function PUT(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, ['J5-Media'])) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { username } = await params
    const body = await request.json()

    const { bioRank, enlistedDate, promotions, awards, operations } = body

    const update: Record<string, any> = {
        'milpac.enlistedDate': enlistedDate ?? '',
        'milpac.promotions': promotions ?? [],
        'milpac.awards': awards ?? [],
        'milpac.operations': operations ?? [],
    }
    if (bioRank !== undefined) {
        update['milpac.currentRank'] = bioRank
        update['bio.rank'] = bioRank
    }

    const result = await Db.users.updateOne({ username }, { $set: update })
    if (result.matchedCount === 0) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    return NextResponse.json({ success: true })
}
