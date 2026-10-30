import { NextRequest, NextResponse } from 'next/server'
import { logDoctrine, reviewPending } from '@/lib/doctrine/db'
import { doctrineGate } from '../../gate'

/**
 * POST `/api/doctrines/{id}/review` `{ decision: 'approve' | 'reject' | 'revise', note }`
 * — the J2 Lead's answer to a pending significant change. Approve publishes
 * it as the new approved version; reject and revise drop it, leaving the
 * current version live, with the note on the closed task.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    const { doctrine, standing, by } = gate
    if (!standing.canApprove) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    if (!doctrine.pending) return NextResponse.json({ error: 'Nothing is waiting for review' }, { status: 409 })

    const body = await req.json().catch(() => null)
    const decision = body?.decision
    if (decision !== 'approve' && decision !== 'reject' && decision !== 'revise') return NextResponse.json({ error: 'Unknown decision' }, { status: 400 })
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : ''

    const result = await reviewPending(doctrine, by, decision, note)
    await logDoctrine(`review.${decision}`, doctrine, by, { note, proposedBy: doctrine.pending.proposedByName, version: result?.version ?? null })
    return NextResponse.json({ ok: true, ...result })
}
