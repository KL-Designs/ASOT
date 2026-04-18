import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const oid = new ObjectId(id)

    // Try to add vote (only matches if user hasn't voted yet)
    const added = await Db.feedback.updateOne(
        { _id: oid, upvotes: { $ne: me.id } },
        { $addToSet: { upvotes: me.id }, $inc: { upvoteCount: 1 } }
    )

    if (added.matchedCount === 0) {
        // User already voted — remove it
        await Db.feedback.updateOne(
            { _id: oid, upvotes: me.id },
            { $pull: { upvotes: me.id }, $inc: { upvoteCount: -1 } }
        )
    }

    const updated = await Db.feedback.findOne({ _id: oid }, { projection: { upvotes: 1, upvoteCount: 1 } })
    return NextResponse.json({
        upvoteCount: updated?.upvoteCount ?? 0,
        voted: updated?.upvotes.includes(me.id) ?? false,
    })
}
