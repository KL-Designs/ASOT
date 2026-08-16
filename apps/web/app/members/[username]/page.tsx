import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import MilpacEditor from './MilpacEditor'


export default async function Page({ params }: { params: Promise<{ username: string }> }) {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.members.editStandard)) redirect('/me')

    const canEditRestricted = client.hasRoles(me, PERMISSIONS.members.editRestricted)
    const canEditStandard   = client.hasRoles(me, PERMISSIONS.members.editStandard)

    const { username } = await params
    const allMembers = await client.fetchAllMembers()
    const member = allMembers.find(m => m.username === username)
    if (!member) notFound()

    // Fetch confirmed attendance records for this member
    const attendanceDocs = await Db.operationAttendance.find({
        records: { $elemMatch: { userId: member.id, confirmed: true } },
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
        const rec = doc.records.find(r => r.userId === member.id && r.confirmed)
        if (!rec) return []
        const op = opMap.get(opId)
        return [{
            operationId: opId,
            name: op?.title ?? 'Unknown Operation',
            date: op?.date ? new Date(op.date).toISOString() : null,
            confirmedAt: rec.confirmedAt ? new Date(rec.confirmedAt).toISOString() : null,
        }]
    })

    // Mongo documents carry ObjectId instances (departmentRoleIds), which React
    // refuses to pass across the server/client boundary — they arrive as
    // {buffer: ...} and log a warning on every view. The editor reads only plain
    // fields, so a JSON round-trip hands it the same shape with the class
    // instances flattened to strings.
    const memberProps = JSON.parse(JSON.stringify(member)) as User

    return (
        <MilpacEditor
            member={memberProps}
            confirmedOps={confirmedOps}
            canEditRestricted={canEditRestricted}
            canEditStandard={canEditStandard}
        />
    )
}
