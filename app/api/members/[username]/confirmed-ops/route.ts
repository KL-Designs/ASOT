import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.members.edit)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { username } = await params
    const member = await Db.users.findOne({ username })
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const userId = member.id ?? String(member._id)

    const attendanceDocs = await Db.operationAttendance.find({
        records: { $elemMatch: { userId, confirmed: true } },
    }).toArray()

    const operationIds = attendanceDocs.map(d => d.operationId)
    const operationsData = operationIds.length > 0
        ? await Db.operations.find({ _id: { $in: operationIds } }).toArray()
        : []
    const opMap = new Map(operationsData.map(o => [String(o._id), o]))

    const seenOpIds = new Set<string>()
    const confirmedOps = attendanceDocs.flatMap(doc => {
        const opId = String(doc.operationId)
        if (seenOpIds.has(opId)) return []  // skip duplicate attendance docs for same op
        seenOpIds.add(opId)
        const rec = doc.records.find(r => r.userId === userId && r.confirmed)
        if (!rec) return []
        const op = opMap.get(opId)
        return [{
            operationId: opId,
            name: op?.title ?? 'Unknown Operation',
            date: op?.date ? new Date(op.date).toISOString() : null,
            confirmedAt: rec.confirmedAt ? new Date(rec.confirmedAt).toISOString() : null,
        }]
    })

    return NextResponse.json(confirmedOps)
}
