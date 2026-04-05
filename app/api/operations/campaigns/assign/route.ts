import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

async function checkAuth() {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return null
        return me
    } catch { return null }
}

/** POST — assign a mission to a campaign */
export async function POST(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { operationId, campaignId } = await request.json()
    if (!operationId || !campaignId) return NextResponse.json({ error: 'operationId and campaignId required' }, { status: 400 })

    await Db.operations.updateOne(
        { _id: new ObjectId(operationId) },
        { $set: { campaignId: new ObjectId(campaignId) } }
    )
    return NextResponse.json({ success: true })
}

/** DELETE — remove a mission from its campaign */
export async function DELETE(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const operationId = searchParams.get('operationId')
    if (!operationId) return NextResponse.json({ error: 'operationId required' }, { status: 400 })

    await Db.operations.updateOne(
        { _id: new ObjectId(operationId) },
        { $unset: { campaignId: '' } }
    )
    return NextResponse.json({ success: true })
}
