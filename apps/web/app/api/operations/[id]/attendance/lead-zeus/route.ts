import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { sendLeadZeusDM } from '@/lib/discord/bot'
import { can } from '@/lib/operations/permissions'

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/operations/[id]/attendance/lead-zeus
 * Body: { userId: string | null, userName?: string }
 *
 * CHQ nominates (or clears) the Lead Zeus for this operation.
 * The nominated user receives a Discord DM.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
    let me: User
    try {
        me = await client.fetchMe()
        if (!(await can(me, 'attendance.roles'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    let body: { userId?: string | null; userName?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    let operationId: ObjectId
    try { operationId = new ObjectId(id) } catch {
        return NextResponse.json({ error: 'Invalid operation id' }, { status: 400 })
    }

    const att = await Db.operationAttendance.findOne({ operationId })
    if (!att) return NextResponse.json({ error: 'Attendance doc not found' }, { status: 404 })

    if (body.userId === null || body.userId === undefined) {
        // Clear nomination
        await Db.operationAttendance.updateOne(
            { _id: att._id },
            { $unset: { leadZeus: '', leadZeusName: '' } } as never
        )
        return NextResponse.json({ ok: true, cleared: true })
    }

    const { userId, userName } = body
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const nominatorName = (me as any).guild?.nickname || (me as any).guild?.displayName
        || (me as any).globalName || (me as any).username || 'CHQ'

    // Resolve display name if not provided
    let resolvedName = userName
    if (!resolvedName) {
        const user = await Db.users.findOne(
            { id: userId },
            { projection: { 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1, username: 1 } }
        )
        resolvedName = (user as any)?.guild?.nickname || (user as any)?.guild?.displayName
            || (user as any)?.globalName || (user as any)?.username || 'Unknown'
    }

    await Db.operationAttendance.updateOne(
        { _id: att._id },
        { $set: { leadZeus: userId, leadZeusName: resolvedName } } as never
    )

    // Fetch operation for title and URL
    const op = await Db.operations.findOne({ _id: operationId }, { projection: { title: 1 } })
    const opTitle = op?.title ?? 'Upcoming Operation'
    const opUrl = `/operations/${id}`

    sendLeadZeusDM(userId, opTitle, nominatorName, opUrl)
        .catch(err => console.error('[lead-zeus] DM failed for', userId, err))

    return NextResponse.json({ ok: true, leadZeus: userId, leadZeusName: resolvedName })
}
