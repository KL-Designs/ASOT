import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import fs from 'fs'
import { logAction } from '@/lib/logAction'

async function getMeeting(id: string) {
    if (!ObjectId.isValid(id)) return null
    return Db.meetings.findOne({ _id: new ObjectId(id) })
}

function canAccess(me: User, meeting: { department: string; invitedUserIds?: string[] }) {
    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    return client.hasRoles(me, PERMISSIONS.departments[deptKey]) || (meeting.invitedUserIds ?? []).includes(me.id)
}

// GET /api/admin/meetings/[id]
// Dept members AND invited guests can read.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    const meeting = await getMeeting(id)
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(me, meeting)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json({ meeting })
}

// PATCH /api/admin/meetings/[id]
// Dept members AND invited guests can edit while the meeting is open (not locked/completed).
// Completing a meeting locks it, which immediately reverts invited members to read-only.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    const meeting = await getMeeting(id)
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(me, meeting)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    let body: { title?: string; date?: string; notes?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.title !== undefined) update.title = body.title.trim()
    if (body.date !== undefined) update.date = new Date(body.date)
    if (body.notes !== undefined) update.notes = body.notes

    await Db.meetings.updateOne({ _id: new ObjectId(id) }, { $set: update })
    return NextResponse.json({ ok: true })
}

// DELETE /api/admin/meetings/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    const meeting = await getMeeting(id)
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptLeadKey = meeting.department as keyof typeof PERMISSIONS.departmentLeads
    const leadRoles = PERMISSIONS.departmentLeads[deptLeadKey]
    if (!leadRoles || !client.hasRoles(me, leadRoles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Clean up uploaded files
    for (const att of meeting.attachments) {
        if (att.type === 'file' && att.ext) {
            try { fs.unlinkSync(`../../storage/uploads/meetings/${att.id}.${att.ext}`) } catch { /* already gone */ }
        }
    }

    await Db.meetings.deleteOne({ _id: new ObjectId(id) })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    await logAction({
        action: 'meeting.delete',
        category: 'meeting',
        performedBy: me.id,
        performedByName: displayName,
        department: meeting.department,
        entityType: 'meeting',
        entityId: id,
        target: `"${meeting.title}"`,
    })

    return NextResponse.json({ ok: true })
}
