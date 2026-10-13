import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { can } from '@/lib/operations/permissions'
import { logAction } from '@/lib/logAction'
import { resolveDetails, sanitiseDetails } from '@/lib/attendance/discord-post'
import { postSettings } from '@/lib/attendance/discord-post-sync'

/**
 * `/api/operations/{id}/attendance/post` — this operation's Discord post.
 *
 * GET returns what the post will say: the operation's own details, what they
 * resolve to over the site defaults, whether a channel is configured for it,
 * and whether it has been posted. PUT saves the operation's own details.
 *
 * For whoever manages attendance. The server password is part of this, so it
 * is not readable by a member who merely has the operation open.
 */
async function manager(id: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!(await can(me, 'attendance.manage'))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 }) }
    return { me, operationId: new ObjectId(id) }
}

async function describe(operationId: ObjectId) {
    const [attendance, operation] = await Promise.all([
        Db.operationAttendance.findOne({ operationId }, { projection: { postDetails: 1, discordPost: 1 } }),
        Db.operations.findOne({ _id: operationId }, { projection: { date: 1 } }),
    ])
    const settings = postSettings()
    const own = attendance?.postDetails ?? {}
    const resolved = resolveDetails(operation?.date ? new Date(operation.date) : new Date(), own, settings.defaults)
    return {
        own,
        resolved,
        channelConfigured: !!settings.channels[resolved.kind],
        refreshMinutes: settings.refreshMinutes,
        posted: attendance?.discordPost
            ? { at: new Date(attendance.discordPost.postedAt).toISOString(), closed: !!attendance.discordPost.closedAt }
            : null,
    }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const who = await manager((await params).id)
    if (who.error) return who.error
    return NextResponse.json(await describe(who.operationId))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const who = await manager(id)
    if (who.error) return who.error

    const details = sanitiseDetails(await req.json().catch(() => ({})))
    const result = await Db.operationAttendance.updateOne({ operationId: who.operationId }, { $set: { postDetails: details } })
    if (!result.matchedCount) return NextResponse.json({ error: 'No attendance for this operation' }, { status: 404 })

    logAction({
        action: 'operation.attendance.post.update', category: 'operation',
        performedBy: who.me.id, performedByName: who.me.guild?.displayName || who.me.username || who.me.id,
        entityType: 'operation', entityId: id,
        // Not the password itself: the log is read more widely than this route.
        details: { kind: details.kind, timings: details.timings, serverAddress: details.serverAddress, hasPassword: !!details.serverPassword, modlistUrl: details.modlistUrl },
    }).catch(() => {})

    return NextResponse.json(await describe(who.operationId))
}
