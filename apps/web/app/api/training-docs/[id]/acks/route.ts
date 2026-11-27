import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

type Params = { params: Promise<{ id: string }> }

/** GET /api/training-docs/[id]/acks — returns the user's acknowledgement status for this doc. */
export async function GET(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const doc = await Db.trainingDocs.findOne({ _id: new ObjectId(id) }, { projection: { changeLog: 1 } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const changeLog = doc.changeLog ?? []
    const latestRequired = [...changeLog].reverse().find(e => e.requiresAck)

    if (!latestRequired) return NextResponse.json({ needsAck: false, latestVersion: null, myAck: null })

    const myAck = await Db.trainingDocAcks.findOne({
        docId: id,
        userId: me.id,
        version: latestRequired.version,
    })

    return NextResponse.json({
        needsAck: !myAck,
        latestVersion: latestRequired.version,
        latestSummary: latestRequired.summary,
        myAck: myAck ? { ...myAck, _id: myAck._id!.toString() } : null,
    })
}

/** POST /api/training-docs/[id]/acks — acknowledge the latest required change version. */
export async function POST(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const doc = await Db.trainingDocs.findOne({ _id: new ObjectId(id) }, { projection: { changeLog: 1 } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const changeLog = doc.changeLog ?? []
    const latestRequired = [...changeLog].reverse().find(e => e.requiresAck)
    if (!latestRequired) return NextResponse.json({ error: 'No acknowledgement required for this document' }, { status: 400 })

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    await Db.trainingDocAcks.updateOne(
        { docId: id, userId: me.id, version: latestRequired.version },
        {
            $setOnInsert: {
                docId: id,
                userId: me.id,
                userName: displayName,
                version: latestRequired.version,
                acknowledgedAt: new Date(),
            } as TrainingDocAcknowledgement,
        },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
