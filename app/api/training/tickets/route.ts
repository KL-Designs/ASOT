import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)

    // J3 leads see all tickets; trainers only see their own
    const filter = isJ3Lead ? {} : { trainerId: me.id }

    const tickets = await Db.trainingTickets
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

    return NextResponse.json({ tickets, isJ3Lead })
}
