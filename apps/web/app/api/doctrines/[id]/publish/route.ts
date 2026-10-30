import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { logDoctrine, publish, raiseOptionsTask } from '@/lib/doctrine/db'
import { doctrineGate } from '../../gate'

/**
 * POST `/api/doctrines/{id}/publish` `{ reason? }` — publish the draft.
 *
 * Minor changes go live. A significant change against the last approved
 * version comes back `needs-reason` without one, and with one becomes a J2
 * Lead task while the current version stays live. Pending custom options
 * raise their own review task here, once the mission's doctrine is set.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    const { doctrine, standing, by } = gate
    if (!standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    const result = await publish(doctrine, by, reason, standing.canApprove)

    if (result.status !== 'needs-reason') {
        const fresh = await Db.doctrines.findOne({ _id: doctrine._id })
        if (fresh) await raiseOptionsTask(fresh as typeof doctrine, by)
        await logDoctrine(result.status === 'published' ? 'publish' : 'propose', doctrine, by, { ...result, reason })
    }
    return NextResponse.json(result)
}
