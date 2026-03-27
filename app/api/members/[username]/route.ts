import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function PUT(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.members.edit)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { username } = await params
    const body = await request.json()

    const { bioRank, enlistedDate, promotions, awards, operations, qualifications, name } = body

    // Uniqueness check for name
    if (name !== undefined) {
        if (name && typeof name === 'string') {
            const taken = await Db.users.findOne({ name, username: { $ne: username } })
            if (taken) return NextResponse.json({ error: 'Name already taken' }, { status: 409 })
        }
    }

    const update: Record<string, any> = {
        'milpac.enlistedDate': enlistedDate ?? '',
        'milpac.promotions': promotions ?? [],
        'milpac.awards': awards ?? [],
        'milpac.operations': operations ?? [],
        'milpac.qualifications': qualifications ?? [],
    }
    if (bioRank !== undefined) {
        update['milpac.currentRank'] = bioRank
        update['bio.rank'] = bioRank
    }
    if (name !== undefined) {
        update['name'] = name || null
    }

    const result = await Db.users.updateOne({ username }, { $set: update })
    if (result.matchedCount === 0) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    return NextResponse.json({ success: true })
}
