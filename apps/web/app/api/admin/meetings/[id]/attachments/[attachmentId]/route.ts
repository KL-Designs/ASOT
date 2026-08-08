import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// DELETE /api/admin/meetings/[id]/attachments/[attachmentId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id, attachmentId } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    const attachment = meeting.attachments.find(a => a.id === attachmentId)
    if (attachment?.type === 'file' && attachment.ext) {
        try { fs.unlinkSync(`./uploads/meetings/${attachment.id}.${attachment.ext}`) } catch { /* already gone */ }
    }

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        { $pull: { attachments: { id: attachmentId } }, $set: { updatedAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}
