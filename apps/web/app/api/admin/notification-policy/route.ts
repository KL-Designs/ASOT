import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/notification-policy — J4 only
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.communityTickets.manage)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const policy = await Db.notifPolicyConfig.find({}).toArray()
    return NextResponse.json(policy)
}

// PUT /api/admin/notification-policy — J4 only
export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.communityTickets.manage)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body?.type) return NextResponse.json({ error: 'type required' }, { status: 400 })

    const displayName = me.guild.displayName ?? me.username
    const now = new Date()

    await Db.notifPolicyConfig.updateOne(
        { type: body.type },
        {
            $set: {
                type: body.type,
                forceWebsite: !!body.forceWebsite,
                forceDiscord: !!body.forceDiscord,
                updatedById: me.id,
                updatedByName: displayName,
                updatedAt: now,
            },
        },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
