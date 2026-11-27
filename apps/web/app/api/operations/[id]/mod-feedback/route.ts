import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

type Params = { params: Promise<{ id: string }> }

/** GET /api/operations/[id]/mod-feedback — list mod feedback for an operation. J2 + J4 access. */
export async function GET(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2 = client.hasRoles(me, PERMISSIONS.tickets.actionJ2)
    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ2 && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })

    const feedback = await Db.operationModFeedback
        .find({ operationId: id })
        .sort({ submittedAt: -1 })
        .toArray()

    return NextResponse.json({ feedback: feedback.map(f => ({ ...f, _id: f._id!.toString() })) })
}

const VALID_SEVERITY = new Set(['minor', 'major', 'critical'])

/** POST /api/operations/[id]/mod-feedback — submit mod feedback for an operation. J2 access. */
export async function POST(req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2 = client.hasRoles(me, PERMISSIONS.tickets.actionJ2)
    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ2 && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })

    const op = await Db.operations.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const { modName, workshopUrl, issue, severity } = body

    if (!modName?.trim() || !issue?.trim()) {
        return NextResponse.json({ error: 'modName and issue are required' }, { status: 400 })
    }
    if (!VALID_SEVERITY.has(severity)) {
        return NextResponse.json({ error: 'severity must be minor, major, or critical' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const record: Omit<OperationModFeedback, '_id'> = {
        operationId: id,
        operationTitle: (op as any).title || (op as any).name || id,
        modName: modName.trim(),
        ...(workshopUrl?.trim() ? { workshopUrl: workshopUrl.trim() } : {}),
        issue: issue.trim(),
        severity,
        submittedById: me.id,
        submittedByName: displayName,
        submittedAt: new Date(),
    }

    const result = await Db.operationModFeedback.insertOne(record as OperationModFeedback)
    const inserted = await Db.operationModFeedback.findOne({ _id: result.insertedId })
    return NextResponse.json({ feedback: { ...inserted, _id: inserted!._id!.toString() } }, { status: 201 })
}
