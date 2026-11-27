import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

type Params = { params: Promise<{ id: string }> }

/** GET /api/training-docs/[id]/acks/admin — list all acknowledgements for a doc. J3 manage only. */
export async function GET(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingDocs.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const acks = await Db.trainingDocAcks
        .find({ docId: id })
        .sort({ acknowledgedAt: -1 })
        .toArray()

    return NextResponse.json({ acks: acks.map(a => ({ ...a, _id: a._id!.toString() })) })
}
