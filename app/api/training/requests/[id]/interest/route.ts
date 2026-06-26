import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

// Toggle interest on a training request
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const request = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (request.status !== 'pending') return NextResponse.json({ error: 'Request is not open for interest' }, { status: 400 })

    const hasInterest = request.interestedUserIds.includes(me.id)

    if (hasInterest) {
        await Db.trainingRequests.updateOne(
            { _id: new ObjectId(id) },
            {
                $pull: { interestedUserIds: me.id },
                $inc: { interestedCount: -1 },
                $set: { updatedAt: new Date() },
            }
        )
    } else {
        await Db.trainingRequests.updateOne(
            { _id: new ObjectId(id) },
            {
                $addToSet: { interestedUserIds: me.id },
                $inc: { interestedCount: 1 },
                $set: { updatedAt: new Date() },
            }
        )
    }

    const updated = await Db.trainingRequests.findOne({ _id: new ObjectId(id) })
    return NextResponse.json({ request: updated, interested: !hasInterest })
}
