import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await Db.recruitVideoConfig.findOne({ _id: 'main' }).catch(() => null)
    return NextResponse.json({ showInfoPage: config?.showInfoPage ?? true })
}

export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { showInfoPage: boolean }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    await Db.recruitVideoConfig.updateOne(
        { _id: 'main' },
        { $set: { showInfoPage: !!body.showInfoPage } },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
