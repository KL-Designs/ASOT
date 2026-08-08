import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// POST — restore a deleted record back to its original collection
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    let oid: ObjectId
    try { oid = new ObjectId(id) } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const entry = await Db.mastersheetRecycleBin.findOne({ _id: oid })
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    try {
        if (entry.originalTab === 'billet') {
            // Nothing to re-insert — member record still exists in users collection.
            // Just removing from recycle bin is sufficient.
        } else if (entry.originalTab === 'leaving') {
            await Db.leavingHistory.insertOne(entry.record as LeavingHistoryRecord)
        } else if (entry.originalTab === 'denied') {
            await Db.deniedApplicationsHQ.insertOne(entry.record as DeniedApplicationRecord)
        } else if (entry.originalTab === 'discipline') {
            await Db.disciplineRecords.insertOne(entry.record as DisciplineRecord)
        }
    } catch (err: any) {
        if (err?.code === 11000) {
            return NextResponse.json({ error: 'Record already exists (duplicate key)' }, { status: 409 })
        }
        throw err
    }

    await Db.mastersheetRecycleBin.deleteOne({ _id: oid })
    return NextResponse.json({ ok: true })
}

// DELETE — permanently remove from recycle bin (J4 import permission required)
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

    const result = await Db.mastersheetRecycleBin.deleteOne({ _id: oid })
    if (result.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
}
