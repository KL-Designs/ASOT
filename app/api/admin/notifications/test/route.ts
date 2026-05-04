import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { sendDM } from '@/lib/discord/bot'
import { createNotification } from '@/lib/notifications'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function POST(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { targetUserId, channels, type, title, notifBody } = body as {
        targetUserId: string
        channels: string[]
        type: string
        title: string
        notifBody: string
    }

    if (!targetUserId || !channels?.length || !type || !title?.trim() || !notifBody?.trim()) {
        return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const target = await Db.users.findOne({ _id: targetUserId })
    if (!target) {
        return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
    }

    const results: string[] = []

    if (channels.includes('site')) {
        await createNotification({
            userId: targetUserId,
            type: type as NotificationType,
            title: title.trim(),
            body: notifBody.trim(),
        })
        results.push('site')
    }

    if (channels.includes('discord')) {
        await sendDM(targetUserId, {
            embeds: [{
                title: title.trim(),
                description: notifBody.trim(),
                color: 0xdb001d,
                footer: { text: `Test notification · sent by ${me.guild?.displayName ?? me.globalName ?? me.id}` },
            }],
        }, 'test')
        results.push('discord')
    }

    return NextResponse.json({ ok: true, sent: results })
}
