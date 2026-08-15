import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readConfig, writeConfig } from '@/lib/backups'
import type { BackupConfig } from '@/lib/backups'

// GET /api/backups/config — read current backup config (J4 only)
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

    const config = await readConfig()
    return NextResponse.json(config)
}

// PATCH /api/backups/config — update backup config (J4 only)
export async function PATCH(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Partial<BackupConfig>
    const current = await readConfig()

    const updated: BackupConfig = {
        autoEnabled:  typeof body.autoEnabled  === 'boolean' ? body.autoEnabled  : current.autoEnabled,
        keepHourly:   typeof body.keepHourly   === 'number'  ? Math.max(1, Math.min(200, body.keepHourly))  : current.keepHourly,
        keepDaily:    typeof body.keepDaily    === 'number'  ? Math.max(1, Math.min(90,  body.keepDaily))   : current.keepDaily,
        keepWeekly:   typeof body.keepWeekly   === 'number'  ? Math.max(1, Math.min(52,  body.keepWeekly))  : current.keepWeekly,
        keepMonthly:  typeof body.keepMonthly  === 'number'  ? Math.max(1, Math.min(60,  body.keepMonthly)) : current.keepMonthly,
    }

    await writeConfig(updated)
    return NextResponse.json(updated)
}
