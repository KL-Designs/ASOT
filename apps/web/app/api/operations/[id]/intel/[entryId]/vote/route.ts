import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { loadEntryInScope } from '@/lib/intel/report-db'
import { tallyVotes } from '@/lib/intel/report'
import { intelGate } from '../../gate'

/**
 * POST `/api/operations/{id}/intel/{entryId}/vote` `{ value: 1 | -1 | 0 }` —
 * one thumbs up or down per member, 0 to take it back. The upsert on
 * (entryId, userId) is backed by a unique index
 * (`scripts/2026-10-29-intel-indexes.mjs`), so a double click cannot vote twice.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
    const { id, entryId } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate

    const entry = await loadEntryInScope(ctx, entryId)
    if (!entry || entry.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const value = body?.value
    if (value !== 1 && value !== -1 && value !== 0) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })

    if (value === 0) {
        await Db.intelVotes.deleteOne({ entryId: entry._id, userId: me.id })
    } else {
        await Db.intelVotes.updateOne(
            { entryId: entry._id, userId: me.id },
            { $set: { value, at: new Date() }, $setOnInsert: { entryId: entry._id, userId: me.id } },
            { upsert: true },
        )
    }
    const votes = await Db.intelVotes.find({ entryId: entry._id }).toArray()
    return NextResponse.json({ votes: tallyVotes(votes, me.id) })
}
