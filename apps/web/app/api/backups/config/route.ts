import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readConfig, writeConfig } from '@/lib/backups'
import type { BackupConfig } from '@/lib/backups'
import { logAction } from '@/lib/logAction'

// GET /api/backups/config — read current backup config (backups.manage)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await readConfig()
    return NextResponse.json(config)
}

// PATCH /api/backups/config — update backup config (backups.manage)
export async function PATCH(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Partial<BackupConfig>
    const current = await readConfig()

    // Retention is one-way from the browser: it can be extended, never
    // reduced. Issue #55 requirement 6 — "backups must not be able to be
    // deleted from the browser by anyone" — and lowering a tier is deletion
    // by another name, since the next `restic forget --prune` acts on it
    // immediately. Reducing retention is deliberately a host-side act: edit
    // storage/backup-meta/.config.json and restart.
    const TIERS = [
        { key: 'keepHourly',  max: 200 },
        { key: 'keepDaily',   max: 90  },
        { key: 'keepWeekly',  max: 52  },
        { key: 'keepMonthly', max: 60  },
    ] as const

    const updated: BackupConfig = {
        ...current,
        autoEnabled: typeof body.autoEnabled === 'boolean' ? body.autoEnabled : current.autoEnabled,
    }

    for (const { key, max } of TIERS) {
        const value = body[key]
        if (typeof value !== 'number') continue
        if (value < current[key]) {
            return NextResponse.json(
                { error: `${key} cannot be reduced from ${current[key]} to ${value} — retention can only be extended from here. Lower it in storage/backup-meta/.config.json on the server.` },
                { status: 400 },
            )
        }
        updated[key] = Math.min(max, value)
    }

    await writeConfig(updated)

    await logAction({
        action: 'backup.config_change',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        before: current,
        after: updated,
    })

    return NextResponse.json(updated)
}
