import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

// Cancel own pending request
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const request = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    if (!isJ3Lead && request.requestedById !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (request.status !== 'pending') return NextResponse.json({ error: 'Only pending requests can be cancelled' }, { status: 400 })

    await Db.trainingRequests.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'cancelled', updatedAt: new Date() } }
    )

    const updated = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
