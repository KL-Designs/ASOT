import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/** GET ?campaignId=X — list missions for a campaign sorted by sequence */
export async function GET(request: NextRequest) {
    try {
        await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')
    if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

    const missions = await Db.campaignMissions
        .find({ campaignId })
        .sort({ sequence: 1 })
        .toArray()

    return NextResponse.json({ missions })
}

/** POST { campaignId, name, sequence } — create a campaign mission */
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { campaignId, name, sequence } = await request.json()
    if (!campaignId || !name || sequence == null) {
        return NextResponse.json({ error: 'campaignId, name, and sequence are required' }, { status: 400 })
    }

    const mission: CampaignMission = {
        campaignId,
        name,
        sequence,
        createdAt: new Date(),
    }

    const result = await Db.campaignMissions.insertOne(mission)
    return NextResponse.json({ id: result.insertedId, mission: { ...mission, _id: result.insertedId } }, { status: 201 })
}
