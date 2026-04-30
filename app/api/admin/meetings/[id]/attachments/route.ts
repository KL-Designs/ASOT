import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const YOUTUBE_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//

// POST /api/admin/meetings/[id]/attachments
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const contentType = request.headers.get('content-type') ?? ''
    let attachment: MeetingAttachment

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

        const buffer = Buffer.from(await file.arrayBuffer())
        const attachId = crypto.randomUUID()
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'

        if (!fs.existsSync('./uploads/meetings')) fs.mkdirSync('./uploads/meetings', { recursive: true })
        fs.writeFileSync(`./uploads/meetings/${attachId}.${ext}`, buffer)

        attachment = {
            id: attachId,
            type: 'file',
            filename: file.name,
            url: `/api/admin/meetings/attachment?id=${attachId}&ext=${ext}`,
            ext,
            uploadedBy: me.id,
            uploadedByName: displayName,
            uploadedAt: new Date(),
        }
    } else {
        let body: { youtubeUrl?: string; linkUrl?: string }
        try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

        if (body.youtubeUrl) {
            if (!YOUTUBE_RE.test(body.youtubeUrl)) {
                return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
            }
            attachment = {
                id: crypto.randomUUID(),
                type: 'youtube',
                url: body.youtubeUrl,
                uploadedBy: me.id,
                uploadedByName: displayName,
                uploadedAt: new Date(),
            }
        } else if (body.linkUrl) {
            attachment = {
                id: crypto.randomUUID(),
                type: 'link',
                url: body.linkUrl,
                uploadedBy: me.id,
                uploadedByName: displayName,
                uploadedAt: new Date(),
            }
        } else {
            return NextResponse.json({ error: 'youtubeUrl or linkUrl required' }, { status: 400 })
        }
    }

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        { $push: { attachments: attachment }, $set: { updatedAt: new Date() } }
    )

    return NextResponse.json({ ok: true, attachment })
}
