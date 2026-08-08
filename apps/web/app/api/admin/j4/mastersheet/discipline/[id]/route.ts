import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    let oid: ObjectId
    try { oid = new ObjectId(id) } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await req.json()
    const ALLOWED = ['name', 'disciplineLevel', 'issued', 'expires', 'expired', 'givenBy', 'authorisedBy', 'pointsRemoved', 'reason']
    const updates: Record<string, unknown> = {}
    for (const key of ALLOWED) {
        if (key in body) updates[key] = body[key]
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
    }

    await Db.disciplineRecords.updateOne({ _id: oid }, { $set: updates })
    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    let oid: ObjectId
    try { oid = new ObjectId(id) } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    const record = await Db.disciplineRecords.findOne({ _id: oid })
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const byName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    await Db.mastersheetRecycleBin.insertOne({
        _id: new ObjectId(),
        originalTab: 'discipline',
        originalId: id,
        record,
        deletedAt: new Date(),
        deletedBy: me.id,
        deletedByName: byName,
    })
    await Db.disciplineRecords.deleteOne({ _id: oid })
    return NextResponse.json({ ok: true })
}
