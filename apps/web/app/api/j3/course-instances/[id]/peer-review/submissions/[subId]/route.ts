import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; subId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id, subId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(subId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const submission = await Db.peerReviewSubmissions.findOne({ _id: oid, courseInstanceId: id })
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ submission })
}
