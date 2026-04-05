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

/** GET — list all campaigns */
export async function GET() {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const campaigns = await Db.operationCampaigns.find({}).sort({ createdAt: -1 }).toArray()
    return NextResponse.json({ campaigns })
}

/** POST — create a campaign */
export async function POST(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { name, description } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Campaign name required' }, { status: 400 })

    const result = await Db.operationCampaigns.insertOne({
        _id: new ObjectId(),
        name: name.trim(),
        description: description?.trim() || undefined,
        createdBy: me.id,
        createdAt: new Date().toISOString(),
    })
    return NextResponse.json({ id: result.insertedId })
}

/** PATCH — rename / re-describe a campaign */
export async function PATCH(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { id, name, description } = await request.json()
    if (!id) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })
    if (!name?.trim()) return NextResponse.json({ error: 'Campaign name required' }, { status: 400 })

    await Db.operationCampaigns.updateOne(
        { _id: new ObjectId(id) },
        { $set: { name: name.trim(), description: description?.trim() || undefined } }
    )
    return NextResponse.json({ success: true })
}

/** DELETE — remove a campaign and unlink all its missions */
export async function DELETE(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })

    const oid = new ObjectId(id)
    // Unlink all missions first, then delete the campaign
    await Db.operations.updateMany({ campaignId: oid }, { $unset: { campaignId: '' } })
    await Db.operationCampaigns.deleteOne({ _id: oid })
    return NextResponse.json({ success: true })
}
