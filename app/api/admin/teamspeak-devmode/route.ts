import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { invalidateTsDevModeCache } from '@/lib/teamspeak/devmode'
import { logAction } from '@/lib/logs'

const SETTING_ID = 'teamspeakDevMode'

// GET /api/admin/teamspeak-devmode
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

// POST /api/admin/teamspeak-devmode
// Body: { enabled: boolean } to set explicitly, or omit body to toggle.
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
    const body = await req.json().catch(() => ({})) as { enabled?: boolean }
    if (typeof body.enabled === 'boolean') {
        nextEnabled = body.enabled
    } else {
        const current = await Db.siteSettings.findOne({ _id: SETTING_ID })
        nextEnabled = !(current as Record<string, unknown> | null)?.enabled
    }

    await Db.siteSettings.updateOne(
        { _id: SETTING_ID },
        { $set: { enabled: nextEnabled } },
        { upsert: true },
    )

    invalidateTsDevModeCache()

    await logAction({
        action: nextEnabled ? 'teamspeak.devmode.enabled' : 'teamspeak.devmode.disabled',
        category: 'teamspeak',
        performedBy: me._id,
        performedByName: me.name ?? me.globalName ?? me._id,
        target: `TeamSpeak dev mode ${nextEnabled ? 'enabled' : 'disabled'}`,
        details: { enabled: nextEnabled },
    })

    return NextResponse.json({ enabled: nextEnabled })
}
