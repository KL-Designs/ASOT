import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/** GET /api/operations/[id]/acknowledge — list acknowledgements, current user status */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>> | null = null
    try {
        me = await client.fetchMe()
    } catch { /* unauthenticated — still return public ack list */ }

    const op = await Db.operations.findOne(
        { _id: new ObjectId(id) },
        { projection: { acknowledgements: 1 } }
    )
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const acks = op.acknowledgements ?? []
    const hasAcknowledged = me ? acks.some(a => a.userId === me!.id) : false

    return NextResponse.json({ acks, hasAcknowledged, count: acks.length })
}

/** POST /api/operations/[id]/acknowledge — mark current user as acknowledged */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.attendance.confirm)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const op = await Db.operations.findOne(
        { _id: new ObjectId(id) },
        { projection: { acknowledgements: 1 } }
    )
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = (op.acknowledgements ?? []).find(a => a.userId === me.id)
    if (existing) return NextResponse.json({ ok: true, alreadyAcknowledged: true })

    const meUser = await Db.users.findOne({ _id: me.id as any }, { projection: { displayName: 1 } })
    const userName: string = (meUser as any)?.displayName ?? me.username ?? 'Unknown'

    await Db.operations.updateOne(
        { _id: new ObjectId(id) },
        {
            $push: {
                acknowledgements: {
                    userId: me.id,
                    userName,
                    acknowledgedAt: new Date().toISOString(),
                },
            } as any,
        }
    )

    return NextResponse.json({ ok: true, alreadyAcknowledged: false })
}
