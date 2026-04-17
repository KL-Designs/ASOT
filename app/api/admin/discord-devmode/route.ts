import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { invalidateDevModeCache } from '@/lib/discord/bot'
import { logAction } from '@/lib/logs'

const SETTING_ID = 'discordDevMode'

// GET /api/admin/discord-devmode
// Returns current developer mode state. J4-Administration only.
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const setting = await Db.siteSettings.findOne({ _id: SETTING_ID })
    const enabled = !!(setting as Record<string, unknown> | null)?.enabled

    return NextResponse.json({ enabled })
}

// POST /api/admin/discord-devmode
// Body: { enabled: boolean }  — sets dev mode explicitly.
// Omit body to toggle the current value.
// J4-Administration only.
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let nextEnabled: boolean
    try {
        const body = await req.json().catch(() => ({})) as { enabled?: boolean }
        if (typeof body.enabled === 'boolean') {
            nextEnabled = body.enabled
        } else {
            // Toggle
            const current = await Db.siteSettings.findOne({ _id: SETTING_ID })
            nextEnabled = !(current as Record<string, unknown> | null)?.enabled
        }
    } catch {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }

    await Db.siteSettings.updateOne(
        { _id: SETTING_ID },
        { $set: { enabled: nextEnabled } },
        { upsert: true },
    )

    // Bust the in-process 30s cache immediately
    invalidateDevModeCache()

    await logAction({
        action: nextEnabled ? 'discord.devmode.enabled' : 'discord.devmode.disabled',
        category: 'discord',
        performedBy: me._id,
        performedByName: me.name ?? me.globalName ?? me._id,
        target: `Discord dev mode ${nextEnabled ? 'enabled' : 'disabled'}`,
        details: { enabled: nextEnabled },
    })

    return NextResponse.json({ enabled: nextEnabled })
}
