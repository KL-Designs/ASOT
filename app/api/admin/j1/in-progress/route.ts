import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const doc = await Db.inProgressRecruitments.findOne({ recruiterId: me.id })
    if (!doc) return NextResponse.json({ draft: null })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc
    return NextResponse.json({ draft: rest })
}

export async function PUT(req: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await req.json()
    await Db.inProgressRecruitments.updateOne(
        { recruiterId: me.id },
        { $set: { ...body, recruiterId: me.id, savedAt: new Date() } },
        { upsert: true }
    )
    return NextResponse.json({ ok: true })
}

export async function DELETE() {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await Db.inProgressRecruitments.deleteOne({ recruiterId: me.id })
    return NextResponse.json({ ok: true })
}
