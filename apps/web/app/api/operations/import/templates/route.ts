/**
 * GET /api/operations/import/templates
 * PUT /api/operations/import/templates
 *
 * Manages the list of operation IDs used as AI template examples during import.
 * Stored in siteSettings under key 'importTemplateExamples'.
 */

import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'

const SETTINGS_KEY = 'importTemplateExamples'

export async function GET() {
    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const doc = await Db.siteSettings.findOne({ _id: SETTINGS_KEY })
    const examples = (doc?.examples as Array<{ id: string; title: string }>) ?? []
    return NextResponse.json({ examples })
}

export async function PUT(request: NextRequest) {
    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    let body: { examples?: Array<{ id: string; title: string }> }
    try { body = await request.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const examples = (body.examples ?? []).map(e => ({ id: String(e.id), title: String(e.title) }))

    await Db.siteSettings.updateOne(
        { _id: SETTINGS_KEY },
        { $set: { examples } },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
