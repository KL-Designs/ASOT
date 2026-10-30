import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { NOTIFICATION_TYPES } from '@/lib/notifications/types'
import { sanitiseLayout } from '@/lib/dashboard/layout'

// GET /api/preferences — get current user's preferences
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const prefs = await Db.userPreferences.findOne({ userId: me.id })
    const policy = await Db.notifPolicyConfig.find({}).toArray()

    // Build defaults for any missing types
    const defaults: UserPreferences['notifications'] = {}
    for (const t of NOTIFICATION_TYPES) {
        defaults[t.type] = { website: true, discord: true }
    }

    const merged = { ...defaults, ...(prefs?.notifications ?? {}) }

    return NextResponse.json({
        cursorCustom: prefs?.cursorCustom ?? true,
        notifications: merged,
        policy: Object.fromEntries(policy.map(p => [p.type, p])),
        // Null until the member has rearranged their dashboard.
        dashboardLayout: prefs?.dashboardLayout ?? null,
    })
}

// PUT /api/preferences — update current user's preferences
export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const now = new Date()
    const update: Partial<UserPreferences> = { updatedAt: now }

    if (typeof body.cursorCustom === 'boolean') update.cursorCustom = body.cursorCustom
    if (body.notifications && typeof body.notifications === 'object') {
        // Validate against forced policies
        const policy = await Db.notifPolicyConfig.find({}).toArray()
        const forcedMap = Object.fromEntries(policy.map(p => [p.type, p]))
        const sanitised: typeof body.notifications = {}
        for (const [type, pref] of Object.entries(body.notifications as Record<string, UserNotifPref>)) {
            const forced = forcedMap[type]
            sanitised[type] = {
                website: forced?.forceWebsite ? true : !!pref.website,
                discord: forced?.forceDiscord ? true : !!pref.discord,
            }
        }
        update.notifications = sanitised
    }

    // `null` is "reset to the default arrangement" — the field is removed
    // rather than stored as the default, so a later change to the default
    // reaches everybody who never customised.
    const resetLayout = body.dashboardLayout === null
    if (body.dashboardLayout && typeof body.dashboardLayout === 'object') {
        update.dashboardLayout = sanitiseLayout(body.dashboardLayout)
    }

    await Db.userPreferences.updateOne(
        { userId: me.id },
        { $set: { ...update, userId: me.id }, ...(resetLayout ? { $unset: { dashboardLayout: '' } } : {}) },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
