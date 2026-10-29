import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { findNextSelection } from '@/lib/training/find-next-selection'
import { SELECTION_COUNTDOWN_ID, buildCountdownPost, countdownDate } from '@/lib/recruitment/selection-countdown'
import { countdownChannel, loadCountdownConfig, syncSelectionCountdown } from '@/lib/recruitment/selection-countdown-sync'

export const dynamic = 'force-dynamic'

/**
 * Row 212: J3 → Admin → Selection Countdown Post.
 *
 * GET returns the settings, the calculated next Session 1, and a preview of
 * exactly what would be posted. PUT saves the settings and syncs straight away.
 * J3 leads only (`training.manage`), the same people who schedule Selection.
 */

async function gate() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { me }
}

async function state() {
    const config = await loadCountdownConfig()
    const next = await findNextSelection()
    const at = countdownDate(config, next, new Date())
    return {
        config: {
            enabled: config.enabled,
            channelId: config.channelId ?? '',
            title: config.title,
            text: config.text,
            imageUrl: config.imageUrl ?? '',
            overrideAt: config.overrideAt ?? null,
            messageId: config.messageId ?? null,
            postedAt: config.postedAt ?? null,
            lastError: config.lastError ?? null,
            updatedAt: config.updatedAt ?? null,
            updatedByName: config.updatedByName ?? null,
        },
        channelFromEnv: !config.channelId && !!countdownChannel(config),
        next: next ? { at: next.at, instanceRef: next.instanceRef } : null,
        shownAt: at,
        preview: buildCountdownPost(config, at, process.env.NEXT_PUBLIC_BASEURL ?? '').embeds[0],
    }
}

export async function GET() {
    const g = await gate()
    if (g.error) return g.error
    return NextResponse.json(await state())
}

export async function PUT(req: NextRequest) {
    const g = await gate()
    if (g.error) return g.error
    const me = g.me!
    const body = await req.json().catch(() => ({}))

    const set: Partial<SelectionCountdownConfig> = {}
    if (typeof body.enabled === 'boolean') set.enabled = body.enabled
    if (typeof body.channelId === 'string') {
        const id = body.channelId.trim()
        if (id && !/^\d{15,22}$/.test(id)) return NextResponse.json({ error: 'Channel ID should be the number Discord shows with developer mode on.' }, { status: 400 })
        set.channelId = id || undefined
    }
    if (typeof body.title === 'string') set.title = body.title.trim().slice(0, 200)
    if (typeof body.text === 'string') set.text = body.text.slice(0, 3000)
    if (typeof body.imageUrl === 'string') {
        const url = body.imageUrl.trim()
        if (url && !/^(https?:\/\/|\/)/i.test(url)) return NextResponse.json({ error: 'Image must be an uploaded image or a full URL.' }, { status: 400 })
        set.imageUrl = url || undefined
    }
    if (body.overrideAt !== undefined) {
        if (body.overrideAt === null || body.overrideAt === '') set.overrideAt = null
        else {
            const d = new Date(body.overrideAt)
            if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid override date' }, { status: 400 })
            set.overrideAt = d
        }
    }

    const name = me.guild?.displayName ?? me.username
    const before = await loadCountdownConfig()
    await Db.siteSettings.updateOne(
        { _id: SELECTION_COUNTDOWN_ID },
        { $set: { ...set, updatedAt: new Date(), updatedByName: name } },
        { upsert: true },
    )
    logAction({
        action: 'j3.selectionCountdown.update',
        category: 'training',
        performedBy: me.id,
        performedByName: name,
        department: 'j3',
        entityType: 'site_settings',
        entityId: SELECTION_COUNTDOWN_ID,
        before: { enabled: before.enabled, channelId: before.channelId, title: before.title, text: before.text, imageUrl: before.imageUrl, overrideAt: before.overrideAt },
        after: set,
    }).catch(console.error)

    await syncSelectionCountdown()
    return NextResponse.json(await state())
}
