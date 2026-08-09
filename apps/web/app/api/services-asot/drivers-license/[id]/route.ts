import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

const EDIT_ROLES = ['1-2-0 Command']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, EDIT_ROLES)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { status } = await request.json()
    if (!['Active', 'Under Review', 'Revoked'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    await Db.driversLicense.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status, updatedAt: new Date(), updatedBy: me.id } }
    )
    return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, EDIT_ROLES)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await Db.driversLicense.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ ok: true })
}
